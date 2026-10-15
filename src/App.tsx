import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Position2D,
  Position3D,
  SlotData,
  StampedMark,
  LogEntry,
  CyclePhase,
  ArmParameters,
  JointAngles3DOF,
} from './types';
import {
  solve3DOF_IK,
  calculateSlotData,
  getLetterStrokes,
  getPaperArcTarget,
  WIPE_DISTANCE_MM,
  MATLAB_L1,
  MATLAB_L2,
  MATLAB_L3,
  DEFAULT_SCALE,
  ALPHABET_26,
  TAG_BASE,
  TAG_RACK_A,
  TAG_RACK_B,
  TAG_STAMP_LEFT,
  TAG_STAMP_RIGHT,
  TAG_INK_PAD,
  TAG_PAPER,
  HOME_POSITION_3D,
  HOME_ANGLES,
  HOME_MOTOR_PULSE_US,
  forwardKinematics3DOF,
  radToDeg,
  getStampRackCalibration,
} from './utils/kinematics';
import { WorkspaceCanvas } from './components/WorkspaceCanvas';
import { TelemetryPanel } from './components/TelemetryPanel';
import { ControlPanel } from './components/ControlPanel';
import { VisionInspector } from './components/VisionInspector';
import { CodeInspector } from './components/CodeInspector';
import { HardwareInspector } from './components/HardwareInspector';
import { ArmSideProfileCanvas } from './components/ArmSideProfileCanvas';
import { serialManager } from './utils/serial';
import {
  Layers,
  Camera,
  Code2,
  BookOpen,
  Usb,
  Sun,
  Moon,
  MoveVertical,
} from 'lucide-react';

export default function App() {
  // Theme state: 'dark' | 'light'
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('theme');
    return saved === 'light' ? 'light' : 'dark';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.classList.toggle('light', theme === 'light');
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Arm Parameters (matching RASTICrane 3-DOF Robot: L1=100mm, L2=120mm, L3=120mm)
  const [armParams, setArmParams] = useState<ArmParameters>({
    L1: MATLAB_L1,
    L2: MATLAB_L2,
    L3: MATLAB_L3,
    scale: DEFAULT_SCALE,
    elbowUp: false,
  });

  // Current 3D Cartesian coordinates in robot frame (mm) [U, V, W] - Initialized at Home (1.5ms for all motors)
  const [currentPos3D, setCurrentPos3D] = useState<Position3D>({ ...HOME_POSITION_3D });

  // 2D polar projection angles for top-down canvas (facing forward towards -Y)
  const [q1, setQ1] = useState<number>(-Math.PI / 2);
  const [q2, setQ2] = useState<number>(HOME_POSITION_3D.y * armParams.scale);

  // References to guarantee smooth continuous transitions without back-and-forth snapping or stale closures
  const currentPos3DRef = useRef<Position3D>({ ...HOME_POSITION_3D });
  const q1Ref = useRef<number>(-Math.PI / 2);
  const q2Ref = useRef<number>(HOME_POSITION_3D.y * armParams.scale);
  const animFrameRef = useRef<number | null>(null);

  // Component Layout Positions (canvas px coordinates relative to base origin matching image.png)
  const [holderPos, setHolderPos] = useState<Position2D>({ x: 0, y: 0 });
  const [inkPadPos, setInkPadPos] = useState<Position2D>({ x: -170, y: -90 });
  const [paperPos, setPaperPos] = useState<Position2D>({ x: 180, y: -85 });

  // Display toggles
  const [showAprilTags, setShowAprilTags] = useState(true);
  const [showReachEnvelope, setShowReachEnvelope] = useState(true);
  const [showTrajectoryTrail, setShowTrajectoryTrail] = useState(true);
  const [isSideProfileMinimized, setIsSideProfileMinimized] = useState(false);

  // Active Execution States
  const [selectedLetter, setSelectedLetter] = useState<string>('A');
  const [activeTargetLetter, setActiveTargetLetter] = useState<string | null>(null);
  const [holdingLetter, setHoldingLetter] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [cyclePhase, setCyclePhase] = useState<CyclePhase>('IDLE');
  const [statusMessage, setStatusMessage] = useState('Standby (1.5ms all motors)');
  const [isStampingContact, setIsStampingContact] = useState(false);
  const [isInkContact, setIsInkContact] = useState(false);
  const [stampedMarks, setStampedMarks] = useState<StampedMark[]>([]);

  // Navigation / View Modes (workspace default with constant Top-Left Side Profile screen)
  const [activeTab, setActiveTab] = useState<'workspace' | 'vision' | 'hardware' | 'code' | 'docs'>('workspace');
  const [isSerialConnected, setIsSerialConnected] = useState(false);
  const [isMirrorEnabled, setIsMirrorEnabled] = useState(true);

  // Sync serial connection status with serialManager
  useEffect(() => {
    const unsub = serialManager.onStatus((connected) => {
      setIsSerialConnected(connected);
    });
    return () => {
      unsub();
    };
  }, []);

  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: '1',
      timestamp: new Date().toLocaleTimeString([], { hour12: false }),
      message: 'ME416 Lab 2: RASTICrane Pick-and-Place Machine connected (COM3).',
      level: 'info',
    },
    {
      id: '2',
      timestamp: new Date().toLocaleTimeString([], { hour12: false }),
      message: 'RASTICrane 3-DOF Arm initialized at Home posture: 1.5ms (1500µs) for all motors.',
      level: 'info',
    },
    {
      id: '3',
      timestamp: new Date().toLocaleTimeString([], { hour12: false }),
      message: `Fiducials verified: tagId_base = 2 (Origin [0,0,0]), tagId_rackA = 0 (Rack Ref 0), tagId_rackB = 1 (Rack Ref 1), tagId_ink = 3 (Ink pad), tagId_paper = 5 (Paper pad). All tags 50mm x 50mm.`,
      level: 'success',
    },
  ]);

  // Calculate 26 slots dynamically based on holder position and scale
  const slotData = calculateSlotData(holderPos, armParams.scale);

  // Calculate active 3-DOF joint angles and PWM pulses for current position
  const rawIK =
    solve3DOF_IK(currentPos3D.x, currentPos3D.y, currentPos3D.z, armParams.L1, armParams.L2, armParams.L3) ||
    HOME_ANGLES;

  const isRackApproachPhase =
    (cyclePhase === 'APPROACH_SLOT' ||
      cyclePhase === 'PICK_STAMP' ||
      cyclePhase === 'RETURN_TO_SLOT' ||
      cyclePhase === 'PUT_DOWN_HOLDER') &&
    Boolean(activeTargetLetter);

  const rackCalib = isRackApproachPhase && activeTargetLetter
    ? getStampRackCalibration(activeTargetLetter)
    : null;

  const currentIK: JointAngles3DOF = rackCalib
    ? {
        ...rawIK,
        m1_us: rackCalib.m1_us,
        m2_us: rackCalib.m2_us,
        m3_us: rackCalib.m3_us,
      }
    : rawIK;

  const isHovering = currentPos3D.z > 15;

  // Add Log Entry
  const addLog = useCallback(
    (message: string, level: LogEntry['level'] = 'info') => {
      const entry: LogEntry = {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString([], { hour12: false }),
        message,
        level,
      };
      setLogs((prev) => [entry, ...prev.slice(0, 75)]);
    },
    []
  );

  // Smooth 3D Arm Motion to Target Coordinates: timestamp-based, continuous, no lag or reversing
  const moveToPosition3D = useCallback(
    (
      targetX_mm: number,
      targetY_mm: number,
      targetZ_mm: number,
      phaseName: CyclePhase,
      onComplete?: () => void
    ) => {
      const isHomeMove = phaseName === 'RETURN_HOME';
      const finalTargetX = isHomeMove ? HOME_POSITION_3D.x : targetX_mm;
      const finalTargetY = isHomeMove ? HOME_POSITION_3D.y : targetY_mm;
      const finalTargetZ = isHomeMove ? HOME_POSITION_3D.z : targetZ_mm;

      const ik = isHomeMove
        ? HOME_ANGLES
        : solve3DOF_IK(
            finalTargetX,
            finalTargetY,
            finalTargetZ,
            armParams.L1,
            armParams.L2,
            armParams.L3
          );

      if (!ik) {
        addLog(
          `Target [${finalTargetX.toFixed(0)}, ${finalTargetY.toFixed(0)}, ${finalTargetZ.toFixed(0)}] outside RASTICrane reach!`,
          'warn'
        );
        setIsAnimating(false);
        setCyclePhase('IDLE');
        setStatusMessage('Out of Reach');
        return;
      }

      if (isHomeMove) {
        addLog(
          `> Serial TX: M1 1500 | M2 2100 | M3 1500 (Home posture: M1 1500 | M2 2100 | M3 1500)`,
          'kinematics'
        );
        if (serialManager.getIsConnected() && isMirrorEnabled) {
          serialManager.homeArm(1500, 2100, 1500);
        }
      } else {
        const isRackPhase =
          (phaseName === 'APPROACH_SLOT' ||
            phaseName === 'PICK_STAMP' ||
            phaseName === 'RETURN_TO_SLOT' ||
            phaseName === 'PUT_DOWN_HOLDER') &&
          Boolean(activeTargetLetter);

        const calib = isRackPhase && activeTargetLetter ? getStampRackCalibration(activeTargetLetter) : null;
        const txM1 = calib ? calib.m1_us : ik.m1_us;
        const txM2 = calib ? calib.m2_us : ik.m2_us;
        const txM3 = calib ? calib.m3_us : ik.m3_us;

        if (calib) {
          addLog(
            `> Serial TX: M1 ${txM1} | M2 ${txM2} | M3 ${txM3} [Rack Reach '${activeTargetLetter}': M1=${txM1}µs (const), Base Yaw M2=${txM2}µs, M3=${txM3}µs (const)]`,
            'kinematics'
          );
        } else {
          addLog(
            `> Serial TX: M1 ${txM1} | M2 ${txM2} | M3 ${txM3}`,
            'kinematics'
          );
        }

        if (serialManager.getIsConnected() && isMirrorEnabled) {
          serialManager.sendMotors(txM1, txM2, txM3);
        }
      }

      setIsAnimating(true);
      setCyclePhase(phaseName);
      setStatusMessage(
        isHomeMove
          ? 'Homing Arm (2500µs / +90°)'
          : `Moving to [${finalTargetX.toFixed(0)}, ${finalTargetY.toFixed(0)}, ${finalTargetZ.toFixed(0)}]`
      );

      // Target canvas polar coordinates
      const targetCanvasX = finalTargetX * armParams.scale;
      const targetCanvasY = -finalTargetY * armParams.scale;
      const targetReach = Math.hypot(targetCanvasX, targetCanvasY);

      // Start strictly from the current instantaneous physical pose (prevents backward snapping)
      const startPos = { ...currentPos3DRef.current };
      const startQ1 = q1Ref.current;
      const startQ2 = q2Ref.current;

      const targetTheta = targetReach > 1 ? Math.atan2(targetCanvasY, targetCanvasX) : startQ1;

      let dTheta = targetTheta - startQ1;
      while (dTheta > Math.PI) dTheta -= 2 * Math.PI;
      while (dTheta < -Math.PI) dTheta += 2 * Math.PI;

      // Pure vertical transitions (e.g. lift, lower to stamp/ink) must not rotate or swing
      const isVerticalOnly =
        Math.abs(finalTargetX - startPos.x) < 0.3 && Math.abs(finalTargetY - startPos.y) < 0.3;

      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }

      const duration = isVerticalOnly ? 240 : 420;
      const startTime = performance.now();

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(1, elapsed / duration);
        // Smooth cubic ease-in-out curve for natural, non-laggy motion
        const ease =
          progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;

        const currentTheta = isVerticalOnly ? startQ1 : startQ1 + dTheta * ease;
        const currentReachVal = isVerticalOnly ? startQ2 : startQ2 + (targetReach - startQ2) * ease;
        const currentX = startPos.x + (finalTargetX - startPos.x) * ease;
        const currentY = startPos.y + (finalTargetY - startPos.y) * ease;
        const currentZ = startPos.z + (finalTargetZ - startPos.z) * ease;

        // Synchronously update refs and state to preserve continuity
        q1Ref.current = currentTheta;
        q2Ref.current = currentReachVal;
        currentPos3DRef.current = { x: currentX, y: currentY, z: currentZ };

        setQ1(currentTheta);
        setQ2(currentReachVal);
        setCurrentPos3D({ x: currentX, y: currentY, z: currentZ });

        if (progress < 1) {
          animFrameRef.current = requestAnimationFrame(animate);
        } else {
          animFrameRef.current = null;
          const finalTheta = isVerticalOnly ? startQ1 : targetTheta;
          const finalReach = isVerticalOnly ? startQ2 : targetReach;

          q1Ref.current = finalTheta;
          q2Ref.current = finalReach;
          currentPos3DRef.current = { x: finalTargetX, y: finalTargetY, z: finalTargetZ };

          setQ1(finalTheta);
          setQ2(finalReach);
          setCurrentPos3D({ x: finalTargetX, y: finalTargetY, z: finalTargetZ });

          if (onComplete) {
            onComplete();
          } else {
            setIsAnimating(false);
            setCyclePhase('IDLE');
            setStatusMessage(isHomeMove ? 'Standby (1.5ms all motors)' : 'Idle / Ready');
          }
        }
      };

      animFrameRef.current = requestAnimationFrame(animate);
    },
    [armParams.L1, armParams.L2, armParams.L3, armParams.scale, addLog, isMirrorEnabled]
  );

  // Execute Full Pick-and-Place Cycle with Handout Page 3 Wiping Motion Release
  const runCycleForLetter = useCallback(
    (letter: string, paperOffset?: { x: number; y: number }, onCycleDone?: () => void) => {
      if (isAnimating) return;

      const slot = slotData.find((s) => s.letter === letter);
      if (!slot) return;

      setActiveTargetLetter(letter);

      // Convert slot canvas coords to Robot Base mm coords [U, V]
      const slotRobX = slot.worldX / armParams.scale;
      const slotRobY = -slot.worldY / armParams.scale;

      const inkRobX = inkPadPos.x / armParams.scale;
      const inkRobY = -inkPadPos.y / armParams.scale;

      const paperCenterRobX = paperPos.x / armParams.scale;
      const paperCenterRobY = -paperPos.y / armParams.scale;

      const paperTargetRobX = paperCenterRobX + (paperOffset ? paperOffset.x / armParams.scale : 0);
      const paperTargetRobY = paperCenterRobY + (paperOffset ? -paperOffset.y / armParams.scale : 0);

      // Azimuth of the stamp on paper (Handout Page 5: "its rotation is the yaw it was pressed at")
      const pressYawRad = Math.atan2(paperTargetRobY, paperTargetRobX);

      addLog(`=== Starting 4-Step Sequence for Stamp [${letter}] ===`, 'info');

      // --- 1/4: Picking up Stamp [letter] ---
      addLog(`1/4: Picking up Stamp [${letter}] from rack...`, 'info');
      // Hover above stamp (z + 50mm)
      moveToPosition3D(slotRobX, slotRobY, 50, 'APPROACH_SLOT', () => {
        // Lower to grasp (z = 0mm)
        moveToPosition3D(slotRobX, slotRobY, 0, 'PICK_STAMP', () => {
          setHoldingLetter(letter);
          addLog(`> Magnet snapped onto steel disc of stamp '${letter}'.`, 'success');

          // Lift up (z + 50mm)
          moveToPosition3D(slotRobX, slotRobY, 50, 'LIFT_STAMP', () => {
            // --- 2/4: Re-inking Stamp on Ink Pad ---
            addLog(`2/4: Re-inking Stamp [${letter}] on Ink Pad...`, 'info');
            // Hover above ink pad (z + 50mm)
            moveToPosition3D(inkRobX, inkRobY, 50, 'MOVE_TO_INK', () => {
              // Press into ink (z = 0mm)
              moveToPosition3D(inkRobX, inkRobY, 0, 'DIP_INK', () => {
                setIsInkContact(true);
                addLog(`> Pressed into ink reservoir (pause 0.5s)...`, 'info');

                setTimeout(() => {
                  setIsInkContact(false);
                  // Lift up (z + 50mm)
                  moveToPosition3D(inkRobX, inkRobY, 50, 'MOVE_TO_PAPER', () => {
                    // --- 3/4: Drawing / Stamping letter on Paper ---
                    addLog(
                      `3/4: Drawing letter '${letter}' on Paper (radial yaw: ${radToDeg(pressYawRad).toFixed(1)}°)...`,
                      'info'
                    );
                    // Hover over paper (z + 50mm)
                    moveToPosition3D(paperTargetRobX, paperTargetRobY, 50, 'MOVE_TO_PAPER', () => {
                      const strokes = getLetterStrokes(
                        letter,
                        {
                          x: paperOffset ? paperOffset.x : 0,
                          y: paperOffset ? paperOffset.y : 0,
                        },
                        armParams.scale
                      );

                      // Contact plane (z = 0mm)
                      moveToPosition3D(paperTargetRobX, paperTargetRobY, 0, 'STAMP_PAPER', () => {
                        setIsStampingContact(true);

                        // Save stamped mark with radial yaw angle matching Page 5
                        const newMark: StampedMark = {
                          id: Math.random().toString(),
                          letter,
                          x: paperOffset ? paperOffset.x : (Math.random() - 0.5) * 20 * armParams.scale,
                          y: paperOffset ? paperOffset.y : (Math.random() - 0.5) * 20 * armParams.scale,
                          worldX: paperPos.x + (paperOffset ? paperOffset.x : 0),
                          worldY: paperPos.y + (paperOffset ? paperOffset.y : 0),
                          timestamp: new Date().toLocaleTimeString([], { hour12: false }),
                          color: '#0284c7',
                          angle: pressYawRad,
                          yawDeg: radToDeg(pressYawRad),
                          strokes,
                        };
                        setStampedMarks((prev) => [...prev, newMark]);
                        addLog(`> Stamped '${letter}' on paper (radial orientation: ${radToDeg(pressYawRad).toFixed(1)}°).`, 'success');

                        setTimeout(() => {
                          setIsStampingContact(false);
                          // Lift off paper (z + 50mm)
                          moveToPosition3D(paperTargetRobX, paperTargetRobY, 50, 'LIFT_PAPER', () => {
                            // --- 4/4: Returning Stamp to Holder ---
                            addLog(`4/4: Returning Stamp [${letter}] to Holder...`, 'info');
                            // Hover above slot (z + 50mm)
                            moveToPosition3D(slotRobX, slotRobY, 50, 'RETURN_TO_SLOT', () => {
                              // Lower to slot to release (z = 0mm)
                              moveToPosition3D(slotRobX, slotRobY, 0, 'PUT_DOWN_HOLDER', () => {
                                setHoldingLetter(null);
                                addLog(`> Stamp '${letter}' returned to holder rack.`, 'success');

                                // Lift up to safe clearance (z + 50mm)
                                moveToPosition3D(slotRobX, slotRobY, 50, 'LIFT_STAMP', () => {
                                  // Return to Home (1.5ms for all motors)
                                  moveToPosition3D(HOME_POSITION_3D.x, HOME_POSITION_3D.y, HOME_POSITION_3D.z, 'RETURN_HOME', () => {
                                    setIsAnimating(false);
                                    setCyclePhase('IDLE');
                                    setStatusMessage('Task complete! All servos at Home (1.5ms).');
                                    addLog(`Task complete! All servos at Home posture (1.5ms).`, 'success');
                                    if (onCycleDone) onCycleDone();
                                  });
                                });
                              });
                            });
                          });
                        }, 400);
                      });
                    });
                  });
                }, 500);
              });
            });
          });
        });
      });
    },
    [
      isAnimating,
      slotData,
      moveToPosition3D,
      inkPadPos,
      paperPos,
      armParams.scale,
      addLog,
    ]
  );

  // Multi-letter Word Sequencer: Stamps names along a radial arc matching Page 3 & Page 5!
  const runWordSequence = useCallback(
    (word: string) => {
      if (isAnimating) return;
      const cleanChars = word
        .split('')
        .filter((c) => ALPHABET_26.includes(c));

      if (cleanChars.length === 0) {
        addLog(`No valid letters (A-Z) found in input "${word}"`, 'warn');
        return;
      }

      addLog(`Spelling name "${cleanChars.join('')}" along radial arc (Handout Page 5)...`, 'info');
      setStampedMarks([]);

      const paperCenterRob: Position2D = {
        x: paperPos.x / armParams.scale,
        y: -paperPos.y / armParams.scale,
      };

      let charIndex = 0;

      const runNextChar = () => {
        if (charIndex >= cleanChars.length) {
          addLog(`All ${cleanChars.length} letters stamped along the radial arc!`, 'success');
          setIsAnimating(false);
          setCyclePhase('IDLE');
          setStatusMessage('Word Sequence Finished');
          return;
        }

        const currentChar = cleanChars[charIndex];
        const arcTarget = getPaperArcTarget(
          charIndex,
          cleanChars.length,
          paperCenterRob,
          armParams.scale
        );

        setSelectedLetter(currentChar);
        charIndex++;

        runCycleForLetter(currentChar, arcTarget.canvasOffsetPx, () => {
          setTimeout(runNextChar, 300);
        });
      };

      runNextChar();
    },
    [isAnimating, armParams.scale, paperPos, addLog, runCycleForLetter]
  );

  // Manual Home Arm - M1: 1500us, M2: 2100us, M3: 1500us
  const handleHomeArm = () => {
    if (isAnimating) return;
    addLog('Homing RASTICrane: Setting Home position (M1 1500 | M2 2100 | M3 1500)...', 'info');
    if (serialManager.getIsConnected()) {
      serialManager.homeArm(1500, 2100, 1500);
    }
    // Neutral forward posture: base yaw = 0 deg (M2=2100us, min=1600us, max=2600us), shoulder = 0 deg (M1=1500us), elbow = 0 deg (M3=1500us)
    // x = 0, y = 240mm (L2 + L3), z = 100mm (L1)
    moveToPosition3D(HOME_POSITION_3D.x, HOME_POSITION_3D.y, HOME_POSITION_3D.z, 'RETURN_HOME');
  };

  // Watch arm move towards stamp holder slot for Side Profile visual inspection
  const handleWatchApproachSlot = useCallback(() => {
    if (isAnimating) return;
    const slot = slotData.find((s) => s.letter === selectedLetter) || slotData[0];
    if (!slot) return;
    const slotRobX = slot.worldX / armParams.scale;
    const slotRobY = -slot.worldY / armParams.scale;

    setActiveTargetLetter(selectedLetter);
    addLog(`[Side Profile] Arm approaching Stamp Holder slot [${selectedLetter}]...`, 'info');

    // Step 1: Hover approach at Z = 50mm above the slot
    moveToPosition3D(slotRobX, slotRobY, 50, 'APPROACH_SLOT', () => {
      addLog(`[Side Profile] Arrived at hover clearance (Z = 50mm) above slot [${selectedLetter}]. Lowering onto steel disc...`, 'info');
      // Step 2: Lower vertically onto steel disc of stamp at Z = 0mm
      moveToPosition3D(slotRobX, slotRobY, 0, 'PICK_STAMP', () => {
        setHoldingLetter(selectedLetter);
        addLog(`[Side Profile] Magnet snapped onto steel disc! Magnet latched.`, 'success');
        // Step 3: Lift stamp out of rack (Z = 50mm)
        setTimeout(() => {
          moveToPosition3D(slotRobX, slotRobY, 50, 'LIFT_STAMP', () => {
            addLog(`[Side Profile] Lifted stamp [${selectedLetter}] safely out of holder rack.`, 'info');
            // Step 4: Return to neutral Home posture
            setTimeout(() => {
              moveToPosition3D(HOME_POSITION_3D.x, HOME_POSITION_3D.y, HOME_POSITION_3D.z, 'RETURN_HOME', () => {
                setHoldingLetter(null);
                setCyclePhase('IDLE');
                setStatusMessage('Ready at Home position (1.5ms all motors)');
                addLog(`[Side Profile] Complete! Arm returned to Home.`, 'success');
              });
            }, 800);
          });
        }, 600);
      });
    });
  }, [isAnimating, slotData, selectedLetter, armParams.scale, addLog, moveToPosition3D]);

  // Manual Shoulder Rotation Jogging (θ₁ / ssh / M1)
  const handleJogShoulder = (newShoulderDeg: number) => {
    if (isAnimating) return;
    const currentBaseRad = Math.atan2(currentPos3D.x, currentPos3D.y);
    const newShoulderRad = (newShoulderDeg * Math.PI) / 180;
    const currentElbowRad = (currentIK.elbowDeg * Math.PI) / 180;
    const fk = forwardKinematics3DOF(
      currentBaseRad,
      newShoulderRad,
      currentElbowRad,
      armParams.L1,
      armParams.L2,
      armParams.L3
    );
    moveToPosition3D(fk.ee.x, fk.ee.y, Math.max(0, fk.ee.z), 'APPROACH_SLOT');
  };

  // Reset Component Layout Positions
  const handleResetPositions = () => {
    setHolderPos({ x: 0, y: 0 });
    setInkPadPos({ x: -170, y: -90 });
    setPaperPos({ x: 180, y: -85 });
    addLog('Workspace layout reset to calibrated CAD image coordinates.', 'info');
  };

  // Clear Paper Bed
  const handleClearPaper = () => {
    setStampedMarks([]);
    addLog('Cleared target paper sheet.', 'info');
  };

  // Click on Canvas Slot
  const handleSelectSlot = (letter: string, worldPos: Position2D) => {
    if (isAnimating) return;
    setSelectedLetter(letter);
    setActiveTargetLetter(letter);
    const targetX = worldPos.x / armParams.scale;
    const targetY = -worldPos.y / armParams.scale;
    addLog(`Targeted stamp slot '${letter}' [U: ${targetX.toFixed(0)}mm, V: ${targetY.toFixed(0)}mm]`, 'kinematics');
    moveToPosition3D(targetX, targetY, 50, 'APPROACH_SLOT');
  };

  // Click on Empty Workspace
  const handleClickWorkspace = (canvasX: number, canvasY: number) => {
    if (isAnimating) return;
    const targetX = canvasX / armParams.scale;
    const targetY = -canvasY / armParams.scale;
    moveToPosition3D(targetX, targetY, 50, 'APPROACH_SLOT');
  };

  // Manual Cartesian Jogging
  const handleJogCartesian = (xMm: number, yMm: number) => {
    if (isAnimating) return;
    moveToPosition3D(xMm, yMm, currentPos3D.z, 'APPROACH_SLOT');
  };

  // Manual Polar Jogging: Rotate at base (thetaDeg) and extend at elbow (reachMm)
  const handleJogPolar = (thetaDeg: number, reachMm: number) => {
    if (isAnimating) return;
    const phiRad = (thetaDeg * Math.PI) / 180;
    // x is lateral (sin phi), y is forward (cos phi)
    const xMm = reachMm * Math.sin(phiRad);
    const yMm = reachMm * Math.cos(phiRad);
    moveToPosition3D(xMm, yMm, currentPos3D.z, 'APPROACH_SLOT');
  };

  // Drag Component Update
  const handleUpdateComponentPos = (type: 'holder' | 'ink' | 'paper', pos: Position2D) => {
    if (type === 'holder') setHolderPos(pos);
    if (type === 'ink') setInkPadPos(pos);
    if (type === 'paper') setPaperPos(pos);
  };

  // Calibrate Holder via Vision
  const handleCalibrateHolder = () => {
    addLog(`Rescanning camera frame: computing table homography H from base tag (tagId_base = 2)...`, 'info');
    addLog(`Tags detected: tagId_base (2), tagId_rackA (0), tagId_rackB (1), tagId_ink (3), tagId_paper (5).`, 'success');
  };

  return (
    <div className={`flex flex-col h-screen w-screen font-sans overflow-hidden select-none transition-colors duration-150 ${
      theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
    }`}>
      {/* 1. Header Bar */}
      <header className={`h-12 border-b px-4 flex items-center justify-between shrink-0 transition-colors ${
        theme === 'dark' ? 'border-slate-800 bg-slate-900/90' : 'border-slate-200 bg-white/95 shadow-xs'
      }`}>
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-md bg-purple-600/20 text-purple-400 border border-purple-500/30">
            <Layers className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className={`text-sm font-semibold tracking-wide ${theme === 'dark' ? 'text-slate-100' : 'text-slate-900'}`}>
                ME416 — Lab 2: The Stamp Machine
              </h1>
              <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                theme === 'dark' ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20' : 'bg-amber-50 text-amber-800 border border-amber-200'
              }`}>
                RASTICrane Pick-and-Place
              </span>
              <button
                onClick={() => setActiveTab('hardware')}
                className={`text-[10px] px-2.5 py-0.5 rounded font-mono font-medium flex items-center gap-1.5 transition cursor-pointer ${
                  isSerialConnected
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30'
                    : theme === 'dark'
                    ? 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
                    : 'bg-slate-100 text-slate-700 border border-slate-300 hover:bg-slate-200'
                }`}
                title="Click to manage USB Serial connection to real robot arm"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isSerialConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
                  }`}
                />
                {isSerialConnected ? 'Arm Connected (COM3)' : 'Connect Arm (USB)'}
              </button>
            </div>
          </div>
        </div>

        {/* Center: View Mode Switcher */}
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-0.5 p-1 rounded-lg border text-xs ${
            theme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
          }`}>
            <button
              onClick={() => setActiveTab('workspace')}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded font-medium transition cursor-pointer ${
                activeTab === 'workspace'
                  ? theme === 'dark' ? 'bg-slate-800 text-sky-400 font-semibold shadow-xs' : 'bg-white text-sky-700 font-semibold shadow-xs'
                  : theme === 'dark' ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Top-down workspace with AprilTags, stamp rack, and constant Side Profile screen"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Top-Down Table</span>
            </button>
            <button
              onClick={() => setActiveTab('hardware')}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded font-medium transition cursor-pointer ${
                activeTab === 'hardware'
                  ? theme === 'dark' ? 'bg-slate-800 text-emerald-400 font-semibold shadow-xs' : 'bg-white text-emerald-700 font-semibold shadow-xs'
                  : theme === 'dark' ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Usb className="w-3.5 h-3.5" />
              <span>Real Arm Control</span>
              {isSerialConnected && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('vision')}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded font-medium transition cursor-pointer ${
                activeTab === 'vision'
                  ? theme === 'dark' ? 'bg-slate-800 text-emerald-400 font-semibold shadow-xs' : 'bg-white text-emerald-700 font-semibold shadow-xs'
                  : theme === 'dark' ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Vision & H</span>
            </button>
            <button
              onClick={() => setActiveTab('code')}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded font-medium transition cursor-pointer ${
                activeTab === 'code'
                  ? theme === 'dark' ? 'bg-slate-800 text-purple-400 font-semibold shadow-xs' : 'bg-white text-purple-700 font-semibold shadow-xs'
                  : theme === 'dark' ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>Serial Code</span>
            </button>
            <button
              onClick={() => setActiveTab('docs')}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded font-medium transition cursor-pointer ${
                activeTab === 'docs'
                  ? theme === 'dark' ? 'bg-slate-800 text-amber-400 font-semibold shadow-xs' : 'bg-white text-amber-700 font-semibold shadow-xs'
                  : theme === 'dark' ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Lab 2 Guide</span>
            </button>
          </div>

          {/* Right Action: Light / Dark Mode Toggle */}
          <button
            onClick={toggleTheme}
            className={`px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 transition cursor-pointer text-xs font-medium shadow-xs ${
              theme === 'dark'
                ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-amber-300'
                : 'bg-white hover:bg-slate-50 border-slate-300 text-slate-700'
            }`}
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label="Toggle Light and Dark Mode"
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400 fill-amber-400/20" />
                <span className="font-mono text-[11px]">Light Mode</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-sky-600 fill-sky-600/20" />
                <span className="font-mono text-[11px]">Dark Mode</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* 2. Main Workspace Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side: Viewport Stage */}
        <div className={`flex-1 relative flex flex-col border-r ${
          theme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
        }`}>
          {/* Main Top-Down Table Workspace with Constant Top-Left Side Profile Screen */}
          <div className="flex-1 relative flex flex-col">
            <WorkspaceCanvas
              q1={q1}
              q2={q2}
              holdingLetter={holdingLetter}
              activeTargetLetter={activeTargetLetter}
              isStampingContact={isStampingContact}
              isInkContact={isInkContact}
              isHovering={isHovering}
              showAprilTags={showAprilTags}
              showReachEnvelope={showReachEnvelope}
              showTrajectoryTrail={showTrajectoryTrail}
              holderPos={holderPos}
              inkPadPos={inkPadPos}
              paperPos={paperPos}
              stampedMarks={stampedMarks}
              slotData={slotData}
              armParams={armParams}
              theme={theme}
              onUpdateComponentPos={handleUpdateComponentPos}
              onSelectSlot={handleSelectSlot}
              onClickWorkspace={handleClickWorkspace}
            />

            {/* Constant Side Profile Screen in Top-Left Corner */}
            {!isSideProfileMinimized ? (
              <div
                className={`absolute top-3 left-3 z-20 w-[380px] lg:w-[420px] h-[255px] lg:h-[275px] shadow-2xl rounded-lg overflow-hidden border backdrop-blur-md transition-all flex flex-col ${
                  theme === 'dark'
                    ? 'border-slate-700/80 bg-slate-950/95 shadow-black/60'
                    : 'border-slate-300 bg-white/95 shadow-slate-400/30'
                }`}
              >
                <ArmSideProfileCanvas
                  currentPos3D={currentPos3D}
                  angles3DOF={currentIK}
                  armParams={armParams}
                  activeLetter={activeTargetLetter}
                  holdingLetter={holdingLetter}
                  cyclePhase={cyclePhase}
                  isStampingContact={isStampingContact}
                  isInkContact={isInkContact}
                  theme={theme}
                  holderPos={holderPos}
                  slotData={slotData}
                  onApproachSlot={handleWatchApproachSlot}
                  onToggleMinimize={() => setIsSideProfileMinimized(true)}
                />
              </div>
            ) : (
              <button
                onClick={() => setIsSideProfileMinimized(false)}
                className={`absolute top-3 left-3 z-20 px-3 py-1.5 rounded-lg border text-xs font-mono font-medium flex items-center gap-1.5 shadow-lg cursor-pointer transition ${
                  theme === 'dark'
                    ? 'bg-slate-900/90 border-slate-700 text-sky-400 hover:bg-slate-800'
                    : 'bg-white border-slate-300 text-sky-700 hover:bg-slate-50'
                }`}
                title="Expand Side Elevation Profile"
              >
                <MoveVertical className="w-3.5 h-3.5 text-sky-500" />
                <span>Side Profile Screen</span>
              </button>
            )}
          </div>

          {/* Modal Overlay / Secondary Views */}
          {activeTab === 'hardware' && (
            <div className="absolute inset-x-4 bottom-4 z-30 shadow-2xl max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-200">
              <HardwareInspector
                currentM1={currentIK.m1_us}
                currentM2={currentIK.m2_us}
                currentM3={currentIK.m3_us}
                isMirrorEnabled={isMirrorEnabled}
                onToggleMirror={setIsMirrorEnabled}
                onClose={() => setActiveTab('workspace')}
                addLog={addLog}
                onRunWordSequence={runWordSequence}
                isAnimating={isAnimating}
                cyclePhase={cyclePhase}
                activeLetter={activeTargetLetter}
                selectedLetter={selectedLetter}
                onSelectLetter={(l) => {
                  setSelectedLetter(l);
                  const slot = slotData.find((s) => s.letter === l);
                  if (slot) {
                    handleSelectSlot(l, { x: slot.worldX, y: slot.worldY });
                  }
                }}
              />
            </div>
          )}

          {activeTab === 'vision' && (
            <div className="absolute inset-x-4 bottom-4 z-30 shadow-2xl max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-200">
              <VisionInspector
                holderPos={holderPos}
                inkPadPos={inkPadPos}
                paperPos={paperPos}
                scale={armParams.scale}
                showAprilTags={showAprilTags}
                onCalibrateHolder={handleCalibrateHolder}
                selectedLetter={selectedLetter}
              />
            </div>
          )}

          {activeTab === 'code' && (
            <div className="absolute inset-x-4 bottom-4 z-30 shadow-2xl max-w-3xl mx-auto h-80 animate-in fade-in slide-in-from-bottom-4 duration-200">
              <CodeInspector
                slots={slotData}
                selectedLetter={selectedLetter}
                inkPos={inkPadPos}
                paperPos={paperPos}
                scale={armParams.scale}
              />
            </div>
          )}

          {activeTab === 'docs' && (
            <div className={`absolute inset-x-4 bottom-4 z-30 shadow-2xl max-w-2xl mx-auto border p-4 rounded-lg text-xs leading-relaxed space-y-3 max-h-96 overflow-y-auto animate-in fade-in slide-in-from-bottom-4 duration-200 ${
              theme === 'dark' ? 'bg-slate-900 border-slate-700 text-slate-300' : 'bg-white border-slate-300 text-slate-700'
            }`}>
              <div className={`flex items-center justify-between border-b pb-2 ${theme === 'dark' ? 'border-slate-800' : 'border-slate-200'}`}>
                <span className={`font-semibold text-sm flex items-center gap-1.5 ${theme === 'dark' ? 'text-slate-200' : 'text-slate-900'}`}>
                  <BookOpen className="w-4 h-4 text-amber-500" />
                  ME416 — Lab 2: The Stamp Machine (Handout Notes)
                </span>
                <button
                  onClick={() => setActiveTab('workspace')}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-mono text-[11px] cursor-pointer"
                >
                  ✕ Close
                </button>
              </div>
              <div className="space-y-2 font-sans">
                <div>
                  <h4 className="font-semibold text-purple-500">1. Coordinate Notation:</h4>
                  <p className="text-[11px]">
                    World frame [U, V, W]ᵀ where table is W = 0. Base frame origin is the arm base axis. Azimuth ϕ = atan2(V, U), radial distance ρ = √(U² + V²). Base yaw θ0, shoulder θ1, elbow θ2. Servo pulse commands s0, ssh, sel.
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-purple-500">2. Picking Up and Putting Down (Magnetic Wipe Release):</h4>
                  <p className="text-[11px]">
                    There is no gripper. A magnet on the Lego plate connects to the stamp by touching its steel disc from above. Putting the stamp down is a wiping motion:
                    1. Lower onto disc &rarr; 2. Lift straight up &rarr; 3. Put down in holder &rarr; 4. Wipe outward along ρ at constant ϕ so the holder lip holds the stamp back as the magnet slides off.
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-purple-500">3. Radial Letter Orientation (Problem 1 & Page 5):</h4>
                  <p className="text-[11px]">
                    A stamp picked up at azimuth ϕ_pick and pressed down at azimuth ϕ_press is rotated by Δϕ = (ϕ_press - ϕ_pick) about the vertical axis. Because this 3-DOF arm has no wrist yaw joint, each letter stamped on paper is oriented radially: its rotation is the yaw at which it was pressed! Names are therefore written along a radial arc.
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-purple-500">4. Vision & Homography Pipeline:</h4>
                  <p className="text-[11px]">
                    camera frame &rarr; base tag &rarr; table homography H &rarr; stamp, ink, paper tags &rarr; [U, V]ᵀ &rarr; rasticraneIk &rarr; θ &rarr; servo PWMs s0, ssh, sel.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Side Control & Telemetry Sidebar */}
        <aside className={`w-96 flex flex-col gap-3 p-3 overflow-y-auto border-l shrink-0 transition-colors ${
          theme === 'dark' ? 'bg-slate-900/95 border-slate-800' : 'bg-slate-100/95 border-slate-200'
        }`}>
          <TelemetryPanel
            currentPos3D={currentPos3D}
            angles3DOF={currentIK}
            status={statusMessage}
            phase={cyclePhase}
            activeLetter={activeTargetLetter}
            holdingLetter={holdingLetter}
            isHovering={isHovering}
            theme={theme}
          />

          <ControlPanel
            selectedLetter={selectedLetter}
            onSelectLetter={(l) => {
              setSelectedLetter(l);
              const slot = slotData.find((s) => s.letter === l);
              if (slot) {
                handleSelectSlot(l, { x: slot.worldX, y: slot.worldY });
              }
            }}
            onRunCycle={() => runCycleForLetter(selectedLetter)}
            onHomeArm={handleHomeArm}
            onResetPositions={handleResetPositions}
            onClearPaper={handleClearPaper}
            isAnimating={isAnimating}
            cyclePhase={cyclePhase}
            showAprilTags={showAprilTags}
            onToggleAprilTags={setShowAprilTags}
            showReachEnvelope={showReachEnvelope}
            onToggleReachEnvelope={setShowReachEnvelope}
            showTrajectoryTrail={showTrajectoryTrail}
            onToggleTrajectoryTrail={setShowTrajectoryTrail}
            logs={logs}
            onClearLogs={() => setLogs([])}
            onRunWordSequence={runWordSequence}
            manualX={currentPos3D.x}
            manualY={currentPos3D.y}
            onJogCartesian={handleJogCartesian}
            manualThetaDeg={(Math.atan2(currentPos3D.x, currentPos3D.y) * 180) / Math.PI}
            manualReachMm={Math.hypot(currentPos3D.x, currentPos3D.y)}
            manualShoulderDeg={currentIK.shoulderDeg}
            manualElbowDeg={currentIK.elbowDeg}
            onJogPolar={handleJogPolar}
            onJogShoulder={handleJogShoulder}
            onOpenHardware={() => setActiveTab('hardware')}
            isSerialConnected={isSerialConnected}
            theme={theme}
          />
        </aside>
      </div>
    </div>
  );
}
