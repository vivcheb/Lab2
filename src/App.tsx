import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Position2D,
  Position3D,
  SlotData,
  StampedMark,
  LogEntry,
  CyclePhase,
  ArmParameters,
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
  TAG_STAMP_LEFT,
  TAG_STAMP_RIGHT,
  TAG_INK_PAD,
  TAG_PAPER,
  radToDeg,
} from './utils/kinematics';
import { WorkspaceCanvas } from './components/WorkspaceCanvas';
import { TelemetryPanel } from './components/TelemetryPanel';
import { ControlPanel } from './components/ControlPanel';
import { VisionInspector } from './components/VisionInspector';
import { CodeInspector } from './components/CodeInspector';
import {
  Layers,
  Camera,
  Code2,
  BookOpen,
} from 'lucide-react';

export default function App() {
  // Arm Parameters (matching RASTICrane 3-DOF Robot: L1=100mm, L2=120mm, L3=120mm)
  const [armParams, setArmParams] = useState<ArmParameters>({
    L1: MATLAB_L1,
    L2: MATLAB_L2,
    L3: MATLAB_L3,
    scale: DEFAULT_SCALE,
    elbowUp: false,
  });

  // Current 3D Cartesian coordinates in robot frame (mm) [U, V, W]
  const [currentPos3D, setCurrentPos3D] = useState<Position3D>({
    x: 0,
    y: 150,
    z: 50, // Starts at hover elevation (+50mm)
  });

  // 2D polar projection angles for top-down canvas
  const [q1, setQ1] = useState<number>(-Math.PI / 2);
  const [q2, setQ2] = useState<number>(150 * armParams.scale);

  // Component Layout Positions (canvas px coordinates relative to base origin matching image.png)
  const [holderPos, setHolderPos] = useState<Position2D>({ x: 0, y: 0 });
  const [inkPadPos, setInkPadPos] = useState<Position2D>({ x: -170, y: -90 });
  const [paperPos, setPaperPos] = useState<Position2D>({ x: 180, y: -85 });

  // Display toggles
  const [showAprilTags, setShowAprilTags] = useState(true);
  const [showReachEnvelope, setShowReachEnvelope] = useState(true);
  const [showTrajectoryTrail, setShowTrajectoryTrail] = useState(true);

  // Active Execution States
  const [selectedLetter, setSelectedLetter] = useState<string>('A');
  const [activeTargetLetter, setActiveTargetLetter] = useState<string | null>(null);
  const [holdingLetter, setHoldingLetter] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [cyclePhase, setCyclePhase] = useState<CyclePhase>('IDLE');
  const [statusMessage, setStatusMessage] = useState('Idle / Ready (COM3)');
  const [isStampingContact, setIsStampingContact] = useState(false);
  const [isInkContact, setIsInkContact] = useState(false);
  const [stampedMarks, setStampedMarks] = useState<StampedMark[]>([]);

  // Navigation / View Modes
  const [activeTab, setActiveTab] = useState<'workspace' | 'vision' | 'code' | 'docs'>('workspace');
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
      message: 'RASTICrane 3-DOF Arm initialized: L1=100mm, L2=120mm, L3=120mm.',
      level: 'info',
    },
    {
      id: '3',
      timestamp: new Date().toLocaleTimeString([], { hour12: false }),
      message: `Fiducials verified: BASE TAG (${TAG_BASE}), TAG ${TAG_STAMP_LEFT} (A-C / 55.7mm Plate), TAG ${TAG_STAMP_RIGHT} (K-L-M / 55.7mm Plate), TAG ${TAG_INK_PAD} (Ink), TAG ${TAG_PAPER} (Paper). All AprilTags sized to 50mm x 50mm.`,
      level: 'success',
    },
  ]);

  const animFrameRef = useRef<number | null>(null);

  // Calculate 26 slots dynamically based on holder position and scale
  const slotData = calculateSlotData(holderPos, armParams.scale);

  // Calculate active 3-DOF joint angles and PWM pulses for current position
  const currentIK =
    solve3DOF_IK(currentPos3D.x, currentPos3D.y, currentPos3D.z, armParams.L1, armParams.L2, armParams.L3) || {
      baseDeg: 0,
      shoulderDeg: 0,
      elbowDeg: 0,
      baseRad: 0,
      shoulderRad: 0,
      elbowRad: 0,
      m1_us: 1500,
      m2_us: 1500,
      m3_us: 1500,
    };

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

  // Smooth 3D Arm Motion to Target Coordinates matching moveToPosition(s, x, y, z)
  const moveToPosition3D = useCallback(
    (
      targetX_mm: number,
      targetY_mm: number,
      targetZ_mm: number,
      phaseName: CyclePhase,
      onComplete?: () => void
    ) => {
      const ik = solve3DOF_IK(
        targetX_mm,
        targetY_mm,
        targetZ_mm,
        armParams.L1,
        armParams.L2,
        armParams.L3
      );

      if (!ik) {
        addLog(
          `Target [${targetX_mm.toFixed(0)}, ${targetY_mm.toFixed(0)}, ${targetZ_mm.toFixed(0)}] outside RASTICrane reach!`,
          'warn'
        );
        setIsAnimating(false);
        setCyclePhase('IDLE');
        setStatusMessage('Out of Reach');
        return;
      }

      addLog(
        `> Serial COM3 TX: s0 ${ik.m1_us} | ssh ${ik.m2_us} | sel ${ik.m3_us}`,
        'kinematics'
      );

      setIsAnimating(true);
      setCyclePhase(phaseName);
      setStatusMessage(`Moving to [${targetX_mm.toFixed(0)}, ${targetY_mm.toFixed(0)}, ${targetZ_mm.toFixed(0)}]`);

      // Target canvas polar coordinates
      const targetCanvasX = targetX_mm * armParams.scale;
      const targetCanvasY = -targetY_mm * armParams.scale;
      const targetTheta = Math.atan2(targetCanvasY, targetCanvasX);
      const targetReach = Math.hypot(targetCanvasX, targetCanvasY);

      const startQ1 = q1;
      const startQ2 = q2;
      const startPos = { ...currentPos3D };

      let dTheta = targetTheta - startQ1;
      while (dTheta > Math.PI) dTheta -= 2 * Math.PI;
      while (dTheta < -Math.PI) dTheta += 2 * Math.PI;

      let progress = 0;
      const step = 0.05;

      const animate = () => {
        progress += step;
        if (progress >= 1) {
          setQ1(targetTheta);
          setQ2(targetReach);
          setCurrentPos3D({ x: targetX_mm, y: targetY_mm, z: targetZ_mm });
          if (onComplete) {
            onComplete();
          } else {
            setIsAnimating(false);
            setCyclePhase('IDLE');
            setStatusMessage('Idle / Ready');
          }
          return;
        }

        const ease = 0.5 - Math.cos(progress * Math.PI) / 2;
        setQ1(startQ1 + dTheta * ease);
        setQ2(startQ2 + (targetReach - startQ2) * ease);
        setCurrentPos3D({
          x: startPos.x + (targetX_mm - startPos.x) * ease,
          y: startPos.y + (targetY_mm - startPos.y) * ease,
          z: startPos.z + (targetZ_mm - startPos.z) * ease,
        });

        animFrameRef.current = requestAnimationFrame(animate);
      };

      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = requestAnimationFrame(animate);
    },
    [armParams, q1, q2, currentPos3D, addLog]
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

      addLog(`Starting pick-and-place cycle for letter: ${letter}...`, 'info');
      addLog(`All 5 fiducials tracked (BASE, 100, 101, 3, 4). Table homography H locked.`, 'success');

      // -------------------------------------------------------------
      // Step 1: Lower onto the disc & acquire stamp
      // -------------------------------------------------------------
      addLog(`1. Lower onto disc: Magnet connects to steel disc of '${letter}' from above...`, 'info');
      // Hover above slot (+50mm)
      moveToPosition3D(slotRobX, slotRobY, 50, 'APPROACH_SLOT', () => {
        // Lower onto steel disc (0mm)
        moveToPosition3D(slotRobX, slotRobY, 0, 'PICK_STAMP', () => {
          setHoldingLetter(letter);
          addLog(`> Magnet snapped onto steel disc of stamp '${letter}'.`, 'success');

          // Step 2: Lift straight up out of holder (+50mm)
          moveToPosition3D(slotRobX, slotRobY, 50, 'LIFT_STAMP', () => {
            // ---------------------------------------------------------
            // Inking: Re-ink stamp on ink pad
            // ---------------------------------------------------------
            addLog(`2. Transport to ink pad: Inking stamp in reservoir...`, 'info');
            moveToPosition3D(inkRobX, inkRobY, 50, 'MOVE_TO_INK', () => {
              moveToPosition3D(inkRobX, inkRobY, 0, 'DIP_INK', () => {
                setIsInkContact(true);
                addLog(`> Dipped stamp into ink pad (pause 0.5s)...`, 'info');

                setTimeout(() => {
                  setIsInkContact(false);
                  moveToPosition3D(inkRobX, inkRobY, 50, 'MOVE_TO_PAPER', () => {
                    // -----------------------------------------------------
                    // Placing: Approach destination on paper & press
                    // -----------------------------------------------------
                    addLog(`3. Place onto paper: Pressing letter '${letter}' (radial yaw: ${radToDeg(pressYawRad).toFixed(1)}°)...`, 'info');
                    moveToPosition3D(paperTargetRobX, paperTargetRobY, 50, 'MOVE_TO_PAPER', () => {
                      const strokes = getLetterStrokes(
                        letter,
                        {
                          x: paperOffset ? paperOffset.x : 0,
                          y: paperOffset ? paperOffset.y : 0,
                        },
                        armParams.scale
                      );

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
                          // Lift off paper (+50mm)
                          moveToPosition3D(paperTargetRobX, paperTargetRobY, 50, 'LIFT_PAPER', () => {
                            // -------------------------------------------------
                            // Handout Page 3: 3. Put down in holder & 4. Wipe outward!
                            // -------------------------------------------------
                            addLog(`4. Return to holder: Lower into pocket then wipe outward to release...`, 'info');
                            moveToPosition3D(slotRobX, slotRobY, 50, 'RETURN_TO_SLOT', () => {
                              // 3. Put down in the holder (0mm)
                              moveToPosition3D(slotRobX, slotRobY, 0, 'PUT_DOWN_HOLDER', () => {
                                // 4. Wipe outward: along rho at constant phi
                                const slotRho = Math.hypot(slotRobX, slotRobY);
                                const slotPhi = Math.atan2(slotRobY, slotRobX);
                                const wipeRho = slotRho + WIPE_DISTANCE_MM;
                                const wipeRobX = wipeRho * Math.cos(slotPhi);
                                const wipeRobY = wipeRho * Math.sin(slotPhi);

                                addLog(`> Wiping outward along ρ (+${WIPE_DISTANCE_MM}mm): Lip holds stamp back as magnet slides off!`, 'info');
                                moveToPosition3D(wipeRobX, wipeRobY, 5, 'WIPE_OUTWARD', () => {
                                  setHoldingLetter(null);
                                  addLog(`> Stamp '${letter}' released into holder lip.`, 'success');

                                  // Retract straight up (+50mm) and return to standby
                                  moveToPosition3D(wipeRobX, wipeRobY, 50, 'RETURN_HOME', () => {
                                    setIsAnimating(false);
                                    setCyclePhase('IDLE');
                                    setStatusMessage('Task complete! (Standby)');
                                    addLog(`Task complete! All servos in standby.`, 'success');
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

  // Manual Home Arm
  const handleHomeArm = () => {
    if (isAnimating) return;
    addLog('Homing RASTICrane to safe standby posture...', 'info');
    moveToPosition3D(0, 150, 50, 'RETURN_HOME');
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
    const xMm = reachMm * Math.cos(phiRad);
    const yMm = reachMm * Math.sin(phiRad);
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
    addLog(`Rescanning camera frame: computing table homography H from base tag...`, 'info');
    addLog(`Tags detected: BASE (0), STAMP_L (100), STAMP_R (101), INK (3), PAPER (4).`, 'success');
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 font-sans overflow-hidden select-none">
      {/* 1. Header Bar */}
      <header className="h-12 border-b border-slate-800 bg-slate-900/90 px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-md bg-purple-600/20 text-purple-400 border border-purple-500/30">
            <Layers className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold tracking-wide text-slate-100">
                ME416 — Lab 2: The Stamp Machine
              </h1>
              <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-mono">
                RASTICrane Pick-and-Place
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                Serial COM3 @ 115200
              </span>
            </div>
          </div>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
          <button
            onClick={() => setActiveTab('workspace')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-medium transition ${
              activeTab === 'workspace'
                ? 'bg-slate-800 text-sky-400 font-semibold shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Workspace Layout</span>
          </button>
          <button
            onClick={() => setActiveTab('vision')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-medium transition ${
              activeTab === 'vision'
                ? 'bg-slate-800 text-emerald-400 font-semibold shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>AprilTags & Homography H</span>
          </button>
          <button
            onClick={() => setActiveTab('code')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-medium transition ${
              activeTab === 'code'
                ? 'bg-slate-800 text-purple-400 font-semibold shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Controller Script & Serial</span>
          </button>
          <button
            onClick={() => setActiveTab('docs')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-medium transition ${
              activeTab === 'docs'
                ? 'bg-slate-800 text-amber-400 font-semibold shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Lab 2 Handout Guide</span>
          </button>
        </div>
      </header>

      {/* 2. Main Workspace Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side: 2D Interactive Canvas */}
        <div className="flex-1 relative flex flex-col bg-slate-950 border-r border-slate-800">
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
            onUpdateComponentPos={handleUpdateComponentPos}
            onSelectSlot={handleSelectSlot}
            onClickWorkspace={handleClickWorkspace}
          />

          {/* Modal Overlay / Secondary Views */}
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
            <div className="absolute inset-x-4 bottom-4 z-30 shadow-2xl max-w-2xl mx-auto bg-slate-900 border border-slate-700 p-4 rounded-lg text-xs leading-relaxed space-y-3 max-h-96 overflow-y-auto animate-in fade-in slide-in-from-bottom-4 duration-200">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="font-semibold text-slate-200 text-sm flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-amber-400" />
                  ME416 — Lab 2: The Stamp Machine (Handout Notes)
                </span>
                <button
                  onClick={() => setActiveTab('workspace')}
                  className="text-slate-400 hover:text-slate-200 font-mono text-[11px]"
                >
                  ✕ Close
                </button>
              </div>
              <div className="text-slate-300 space-y-2 font-sans">
                <div>
                  <h4 className="font-semibold text-purple-300">1. Coordinate Notation:</h4>
                  <p className="text-[11px]">
                    World frame [U, V, W]ᵀ where table is W = 0. Base frame origin is the arm base axis. Azimuth ϕ = atan2(V, U), radial distance ρ = √(U² + V²). Base yaw θ0, shoulder θ1, elbow θ2. Servo pulse commands s0, ssh, sel.
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-purple-300">2. Picking Up and Putting Down (Magnetic Wipe Release):</h4>
                  <p className="text-[11px]">
                    There is no gripper. A magnet on the Lego plate connects to the stamp by touching its steel disc from above. Putting the stamp down is a wiping motion:
                    1. Lower onto disc &rarr; 2. Lift straight up &rarr; 3. Put down in holder &rarr; 4. Wipe outward along ρ at constant ϕ so the holder lip holds the stamp back as the magnet slides off.
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-purple-300">3. Radial Letter Orientation (Problem 1 & Page 5):</h4>
                  <p className="text-[11px]">
                    A stamp picked up at azimuth ϕ_pick and pressed down at azimuth ϕ_press is rotated by Δϕ = (ϕ_press - ϕ_pick) about the vertical axis. Because this 3-DOF arm has no wrist yaw joint, each letter stamped on paper is oriented radially: its rotation is the yaw at which it was pressed! Names are therefore written along a radial arc.
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-purple-300">4. Vision & Homography Pipeline:</h4>
                  <p className="text-[11px]">
                    camera frame &rarr; base tag &rarr; table homography H &rarr; stamp, ink, paper tags &rarr; [U, V]ᵀ &rarr; rasticraneIk &rarr; θ &rarr; servo PWMs s0, ssh, sel.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Side Control & Telemetry Sidebar */}
        <aside className="w-96 bg-slate-900/95 flex flex-col gap-3 p-3 overflow-y-auto border-l border-slate-800 shrink-0">
          <TelemetryPanel
            currentPos3D={currentPos3D}
            angles3DOF={currentIK}
            status={statusMessage}
            phase={cyclePhase}
            activeLetter={activeTargetLetter}
            holdingLetter={holdingLetter}
            isHovering={isHovering}
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
            manualThetaDeg={(Math.atan2(currentPos3D.y, currentPos3D.x) * 180) / Math.PI}
            manualReachMm={Math.hypot(currentPos3D.x, currentPos3D.y)}
            onJogPolar={handleJogPolar}
          />
        </aside>
      </div>
    </div>
  );
}
