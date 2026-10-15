import React, { useState, useEffect, useRef } from 'react';
import {
  Usb,
  Power,
  RotateCcw,
  ShieldAlert,
  Send,
  Terminal,
  Cpu,
  BookOpen,
  Copy,
  Check,
  Zap,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Play,
  RotateCw,
} from 'lucide-react';
import { serialManager } from '../utils/serial';
import {
  HOME_MOTOR_PULSE_US,
  ZERO_DEG_MOTOR_PULSE_US,
  ALPHABET_26,
  getStampRackCalibration,
  LETTER_BASE_YAW_MAP,
  PUB_SEQUENCE,
  PUT_SEQUENCE,
  PBB_SEQUENCE,
  STAMP_SEQUENCE,
  MAX_BASE_YAW_US,
  MIN_BASE_YAW_US,
  SequenceStep,
} from '../utils/kinematics';
import { CyclePhase } from '../types';

interface HardwareInspectorProps {
  currentM1: number;
  currentM2: number;
  currentM3: number;
  isMirrorEnabled: boolean;
  onToggleMirror: (enabled: boolean) => void;
  onClose?: () => void;
  addLog: (msg: string, level?: any) => void;
  onRunWordSequence?: (word: string) => void;
  isAnimating?: boolean;
  cyclePhase?: CyclePhase;
  activeLetter?: string | null;
  selectedLetter?: string;
  onSelectLetter?: (letter: string) => void;
}

export const HardwareInspector: React.FC<HardwareInspectorProps> = ({
  currentM1,
  currentM2,
  currentM3,
  isMirrorEnabled,
  onToggleMirror,
  onClose,
  addLog,
  onRunWordSequence,
  isAnimating = false,
  cyclePhase = 'IDLE',
  activeLetter = null,
  selectedLetter = 'A',
  onSelectLetter,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'control' | 'firmware' | 'matlab' | 'python' | 'wiring'>('control');
  const [isConnected, setIsConnected] = useState(serialManager.getIsConnected());
  const [baudRate, setBaudRate] = useState<number>(115200);
  const [isConnecting, setIsConnecting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string>('Ready to connect via Web Serial');
  const [terminalLogs, setTerminalLogs] = useState<{ id: string; type: 'tx' | 'rx' | 'sys'; text: string; time: string }[]>([]);
  const [customCmd, setCustomCmd] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [hwWordInput, setHwWordInput] = useState('ROBOT');

  // Manual test pulse values (M1/M3 range: 1500us to 2500us; M2 Base range: 1600us to 3000us, Center: 2100us)
  const [testM1, setTestM1] = useState(1500);
  const [testM2, setTestM2] = useState(2100);
  const [testM3, setTestM3] = useState(1500);

  // Direct pulse text inputs (supports '3ms', '3.0ms', '3000', '3', etc.)
  const [m1InputText, setM1InputText] = useState('1500');
  const [m2InputText, setM2InputText] = useState('2100');
  const [m3InputText, setM3InputText] = useState('1500');

  // Sequence runner state for PUB, PUT, PBB, and STAMP
  const [runningSequence, setRunningSequence] = useState<'PUB' | 'PUT' | 'PBB' | 'STAMP' | null>(null);
  const [sequenceStepIndex, setSequenceStepIndex] = useState<number>(0);
  const abortSequenceRef = useRef<boolean>(false);

  const terminalEndRef = useRef<HTMLDivElement | null>(null);

  // Sequence execution for PUB, PUT, PBB, and STAMP
  const handleRunSequence = async (seqType: 'PUB' | 'PUT' | 'PBB' | 'STAMP') => {
    if (runningSequence) return;
    let seq = PUB_SEQUENCE;
    if (seqType === 'PBB') seq = PBB_SEQUENCE;
    if (seqType === 'STAMP') seq = STAMP_SEQUENCE;

    setRunningSequence(seqType);
    setSequenceStepIndex(0);
    abortSequenceRef.current = false;
    addLog(`=== Starting Sequence [${seqType}] (${seq.length} steps) ===`, 'info');
    appendTerminal('sys', `=== STARTING SEQUENCE ${seqType} (${seq.length} steps) ===`);

    try {
      for (let i = 0; i < seq.length; i++) {
        if (abortSequenceRef.current) {
          addLog(`Sequence ${seqType} aborted by user.`, 'warn');
          appendTerminal('sys', `Sequence ${seqType} aborted.`);
          break;
        }
        setSequenceStepIndex(i);
        const step = seq[i];

        // Special condition for PBB: intermediate values ONLY when transitioning M3 1.890ms -> 1.6ms (slow) then 1.6ms -> 1.5ms (quick) after M1 1760
        if (seqType === 'PBB' && i === 2) {
          appendTerminal('tx', `[PBB Step 3/4] Intermediate: M3 1890µs → 1600µs (Slow) then 1600µs → 1500µs (Quick)`);
          addLog(`[PBB Step 3] Moving M3 slowly from 1.890ms (1890µs) to 1.6ms (1600µs)...`, 'info');

          // Stage 1: 1890µs -> 1600µs SLOW (20 sub-steps with 70ms delay = 1.4s)
          const startVal1 = 1890;
          const targetVal1 = 1600;
          const numSlowSteps = 20;
          const slowDelay = 70;

          for (let s = 1; s <= numSlowSteps; s++) {
            if (abortSequenceRef.current) break;
            const subPulse = Math.round(startVal1 + ((targetVal1 - startVal1) * s) / numSlowSteps);
            setTestM3(subPulse);
            if (isConnected) {
              await serialManager.sendCommand(`M3 ${subPulse}`);
            }
            await new Promise((res) => setTimeout(res, slowDelay));
          }

          if (!abortSequenceRef.current) {
            setTestM3(1600);
            if (isConnected) {
              await serialManager.sendCommand('M3 1600');
            }
            addLog(`[PBB Step 3] M3 reached 1.6ms (1600µs) — now moving quickly to 1.5ms (1500µs)...`, 'info');

            // Stage 2: 1600µs -> 1500µs QUICK (5 sub-steps with 20ms delay = 100ms)
            const startVal2 = 1600;
            const targetVal2 = 1500;
            const numQuickSteps = 5;
            const quickDelay = 20;

            for (let s = 1; s <= numQuickSteps; s++) {
              if (abortSequenceRef.current) break;
              const subPulse = Math.round(startVal2 + ((targetVal2 - startVal2) * s) / numQuickSteps);
              setTestM3(subPulse);
              if (isConnected) {
                await serialManager.sendCommand(`M3 ${subPulse}`);
              }
              await new Promise((res) => setTimeout(res, quickDelay));
            }

            setTestM3(1500);
            if (isConnected) {
              await serialManager.sendCommand('M3 1500');
            }
            addLog(`[PBB Step 3] M3 reached 1.5ms (1500µs) successfully!`, 'info');
          }
        } else {
          // All other steps are direct without intermediate values
          if (step.motor === 'M1') setTestM1(step.pulseUs);
          if (step.motor === 'M2') setTestM2(step.pulseUs);
          if (step.motor === 'M3') setTestM3(step.pulseUs);

          const cmd = `${step.motor} ${step.pulseUs}`;
          appendTerminal('tx', `[${seqType} Step ${i + 1}/${seq.length}] ${cmd} (${step.label})`);
          if (isConnected) {
            await serialManager.sendCommand(cmd);
          }
          addLog(`[${seqType} Step ${i + 1}/${seq.length}] ${step.label} (${step.pulseUs}µs)`, 'info');
        }

        // Custom delay or default 600ms
        const delay = step.delayMs ?? 600;
        if (seqType === 'PBB') {
          // Explicit 2-second wait between each command for PBB
          appendTerminal('sys', `[PBB Step ${i + 1}/${seq.length}: Waiting 2 seconds (2000ms) before next command...]`);
          addLog(`[PBB Step ${i + 1}] Completed — waiting 2 seconds before next command...`, 'info');
        } else if (seqType === 'STAMP' && i === 2) {
          // Explicit 2-second wait between M1 2.000ms and M1 1.500ms
          appendTerminal('sys', `[STAMP Step 3: Waiting 2 seconds (2000ms) between M1 2.000ms and M1 1.500ms...]`);
          addLog(`[STAMP] Waiting 2 seconds between M1 2.000ms and M1 1.500ms before retracting...`, 'info');
        } else if (seqType === 'PUB' && i === 1) {
          // Explicit 3-second wait between M1 2ms and M3 1.8ms
          appendTerminal('sys', `[PUB/PUT Step 2: Waiting 3 seconds (3000ms) before M3 1.8ms...]`);
          addLog(`[PUB/PUT] Waiting 3 seconds between M1 2ms and M3 1.8ms...`, 'info');
        } else if (delay > 600) {
          appendTerminal('sys', `[Pause: waiting ${(delay / 1000).toFixed(1)}s before next step...]`);
        }
        await new Promise((res) => setTimeout(res, delay));
      }
      if (!abortSequenceRef.current) {
        addLog(`Sequence ${seqType} completed successfully!`, 'success');
        appendTerminal('sys', `Sequence ${seqType} completed successfully!`);
      }
    } catch (err: any) {
      addLog(`Error executing sequence ${seqType}: ${err?.message || err}`, 'error');
    } finally {
      setRunningSequence(null);
      setSequenceStepIndex(0);
    }
  };

  const handleStopSequence = () => {
    abortSequenceRef.current = true;
  };

  // Helper to parse pulse input strings like "3ms", "3.0ms", "3", "3.0", "3000", "3000us", "1.67ms"
  const parsePulseInput = (rawVal: string | number | undefined | null): number | null => {
    if (rawVal === undefined || rawVal === null) return null;
    const s = String(rawVal).trim().toLowerCase();
    if (!s) return null;
    const hasMs = s.includes('ms');
    const numStr = s.replace(/ms|us/g, '').trim();
    const num = parseFloat(numStr);
    if (isNaN(num)) return null;
    // If explicitly 'ms' or small floating number (0.5 <= num <= 5.0), treat as milliseconds
    if (hasMs || (num >= 0.5 && num <= 5.0)) {
      return Math.round(num * 1000);
    }
    return Math.round(num);
  };

  // Helper to parse input/feedback and keep manual servo pulse testing sliders visually in sync with serial commands
  const parseAndSyncMotors = (rawText: string) => {
    if (!rawText) return;
    const text = rawText.toUpperCase();

    // Check for M1 <val>
    const m1Match = text.match(/M1\s*[:=]?\s*([0-9.]+(?:\s*(?:ms|us))?)/i);
    if (m1Match) {
      const val = parsePulseInput(m1Match[1]);
      if (val !== null && val >= 1000 && val <= 3000) {
        setTestM1(Math.max(1500, Math.min(2500, val)));
      }
    }

    // Check for M2 / BASE / YAW <val> (min 1600, max 3000)
    const m2Match = text.match(/(?:M2|BASE|YAW)\s*[:=]?\s*([0-9.]+(?:\s*(?:ms|us))?)/i);
    if (m2Match) {
      const val = parsePulseInput(m2Match[1]);
      if (val !== null && val >= 1000 && val <= 3500) {
        setTestM2(Math.max(1600, Math.min(3000, val)));
      }
    }

    // Check for M3 <val>
    const m3Match = text.match(/M3\s*[:=]?\s*([0-9.]+(?:\s*(?:ms|us))?)/i);
    if (m3Match) {
      const val = parsePulseInput(m3Match[1]);
      if (val !== null && val >= 1000 && val <= 3000) {
        setTestM3(Math.max(1500, Math.min(2500, val)));
      }
    }

    // Standalone direct input like "3ms" or "3.0ms" or "3000" or "3" into terminal/input
    const standaloneMatch = text.trim().match(/^([0-9.]+(?:\s*(?:ms|us))?)$/i);
    if (standaloneMatch) {
      const val = parsePulseInput(standaloneMatch[1]);
      if (val !== null && val >= 1600 && val <= 3000) {
        setTestM2(val);
      }
    }

    // Check for POS <m1> <m2> <m3> (supports both ms and us, e.g. "POS 1.5ms 3ms 1.5ms" or "POS 1500 3000 1500")
    const posMatch = text.match(/POS\s*[:=]?\s*([0-9.]+(?:ms|us)?)\s+([0-9.]+(?:ms|us)?)\s+([0-9.]+(?:ms|us)?)/i);
    if (posMatch) {
      const v1 = parsePulseInput(posMatch[1]);
      const v2 = parsePulseInput(posMatch[2]);
      const v3 = parsePulseInput(posMatch[3]);
      if (v1 !== null && v1 >= 1000 && v1 <= 3000) setTestM1(Math.max(1500, Math.min(2500, v1)));
      if (v2 !== null && v2 >= 1000 && v2 <= 3500) setTestM2(Math.max(1600, Math.min(3000, v2)));
      if (v3 !== null && v3 >= 1000 && v3 <= 3000) setTestM3(Math.max(1500, Math.min(2500, v3)));
    }

    // Check for HOME
    if (text.includes('HOME')) {
      setTestM1(1500);
      setTestM2(2100);
      setTestM3(1500);
    }

    // Check for ZERO
    if (text.includes('ZERO') || text.includes('1500MS') || text.includes('1500US')) {
      setTestM1(1500);
      setTestM2(2100);
      setTestM3(1500);
    }
  };

  // Sync sliders when current motor pulses from simulation/sequencer update
  useEffect(() => {
    if (currentM1 >= 1500 && currentM1 <= 2500) setTestM1(currentM1);
    if (currentM2 >= 1600 && currentM2 <= 3000) setTestM2(currentM2);
    if (currentM3 >= 1500 && currentM3 <= 2500) setTestM3(currentM3);
  }, [currentM1, currentM2, currentM3]);

  useEffect(() => {
    setM1InputText(String(testM1));
  }, [testM1]);
  useEffect(() => {
    setM2InputText(String(testM2));
  }, [testM2]);
  useEffect(() => {
    setM3InputText(String(testM3));
  }, [testM3]);

  // Add terminal log entry
  const appendTerminal = (type: 'tx' | 'rx' | 'sys', text: string) => {
    const time = new Date().toLocaleTimeString([], { hour12: false, fractionalSecondDigits: 2 });
    setTerminalLogs((prev) => [...prev.slice(-100), { id: Math.random().toString(), type, text, time }]);
  };

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [terminalLogs]);

  // Listen to serial events
  useEffect(() => {
    const unsubData = serialManager.onData((data) => {
      appendTerminal('rx', data);
      addLog(`[Serial RX] ${data}`, 'info');
      parseAndSyncMotors(data);
    });

    const unsubStatus = serialManager.onStatus((connected, message) => {
      setIsConnected(connected);
      if (message) {
        setStatusMsg(message);
        appendTerminal('sys', message);
      }
    });

    return () => {
      unsubData();
      unsubStatus();
    };
  }, [addLog]);

  // Connect handler
  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      await serialManager.connect(baudRate);
      addLog(`Connected to real robot arm via Web Serial @ ${baudRate} baud`, 'success');
      appendTerminal('sys', `Connected to port @ ${baudRate} baud`);
      // Immediately home motors to M1:1500, M2:2100, M3:1500
      await serialManager.homeArm(1500, 2100, 1500);
      appendTerminal('tx', 'M1 1500 | M2 2100 | M3 1500 | HOME');
    } catch (err: any) {
      if (err.name !== 'NotFoundError') {
        setStatusMsg(`Connection error: ${err.message}`);
        appendTerminal('sys', `Error: ${err.message}`);
      }
    } finally {
      setIsConnecting(false);
    }
  };

  // Disconnect handler
  const handleDisconnect = async () => {
    await serialManager.disconnect();
    addLog('Disconnected from robot arm serial port', 'warn');
  };

  // Home Arm (M1 1500, M2 2100, M3 1500)
  const handleHomeArm = async () => {
    setTestM1(1500);
    setTestM2(2100);
    setTestM3(1500);
    appendTerminal('tx', 'M1 1500 | M2 2100 | M3 1500 | HOME');
    if (isConnected) {
      await serialManager.homeArm(1500, 2100, 1500);
      addLog('Physical Arm: Sent Home commands (M1 1500 | M2 2100 | M3 1500)', 'info');
    } else {
      addLog('Homed sliders to M1 1500µs, M2 2100µs, M3 1500µs', 'info');
    }
  };

  // Emergency Stop / Detach
  const handleEmergencyStop = async () => {
    appendTerminal('tx', 'STOP');
    if (isConnected) {
      await serialManager.stopArm();
      addLog('EMERGENCY STOP sent: Servos detached', 'warn');
    }
  };

  // Send single motor pulse
  const handleSendSingleMotor = async (motorIdx: 1 | 2 | 3, us: number) => {
    const cmd = `M${motorIdx} ${Math.round(us)}`;
    appendTerminal('tx', cmd);
    if (isConnected) {
      await serialManager.sendCommand(cmd);
    }
  };

  // Send all 3 motor pulses (POS m1 m2 m3)
  const handleSendPos = async (m1: number, m2: number, m3: number) => {
    const s1 = Math.round(m1);
    const s2 = Math.round(m2);
    const s3 = Math.round(m3);
    const cmd = `POS ${s1} ${s2} ${s3}`;
    appendTerminal('tx', cmd);
    if (isConnected) {
      await serialManager.sendMotors(s1, s2, s3);
      addLog(`Physical Arm: Sent POS ${s1} ${s2} ${s3}`, 'info');
    }
  };

  // Send custom raw command & parse to sync sliders
  const handleSendCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customCmd.trim()) return;
    const raw = customCmd.trim();
    const upper = raw.toUpperCase();
    if (upper === 'STAMP') {
      setCustomCmd('');
      handleRunSequence('STAMP');
      return;
    }
    if (upper === 'PUB' || upper === 'PUT') {
      setCustomCmd('');
      handleRunSequence('PUB');
      return;
    }
    if (upper === 'PBB') {
      setCustomCmd('');
      handleRunSequence('PBB');
      return;
    }

    parseAndSyncMotors(raw);

    // Normalize command to standard microseconds so physical Arduino/ESP32 receives valid pulse
    let normalizedCmd = raw;
    const mMatch = raw.match(/^(M[123]|BASE|YAW)\s*[:=]?\s*([0-9.]+(?:\s*(?:ms|us))?)$/i);
    if (mMatch) {
      const motorKey =
        mMatch[1].toUpperCase().startsWith('B') || mMatch[1].toUpperCase().startsWith('Y')
          ? 'M2'
          : mMatch[1].toUpperCase();
      let val = parsePulseInput(mMatch[2]);
      if (val !== null) {
        if (motorKey === 'M2') {
          if (val >= 1600 && val <= 3000) {
            const isAbove25 = val > 2500;
            appendTerminal(
              'sys',
              `✓ SAFE RANGE VERIFIED: M2 Base Yaw ${val}µs (${(val / 1000).toFixed(2)}ms) is in safe range.${
                isAbove25 ? ' (Values >2.5ms and ≤3.0ms are 100% safe)' : ''
              }`
            );
            addLog(`Real Arm: M2 pulse ${val}µs (${(val / 1000).toFixed(2)}ms) verified within safe range (all values under 3.0ms are safe)`, 'info');
          } else if (val > 3000) {
            appendTerminal('sys', `⚠ WARNING: M2 pulse ${val}µs exceeds safe ceiling of 3000µs (3.0ms). Clamped to safe 3000µs limit.`);
            val = 3000;
          } else if (val < 1600) {
            appendTerminal('sys', `⚠ WARNING: M2 pulse ${val}µs is below safe floor of 1600µs (1.6ms). Clamped to safe 1600µs limit.`);
            val = 1600;
          }
        }
        normalizedCmd = `${motorKey} ${val}`;
      }
    } else {
      const standAlone = raw.match(/^([0-9.]+(?:\s*(?:ms|us))?)$/i);
      if (standAlone) {
        let val = parsePulseInput(standAlone[1]);
        if (val !== null) {
          if (val >= 1600 && val <= 3000) {
            const isAbove25 = val > 2500;
            appendTerminal(
              'sys',
              `✓ SAFE RANGE VERIFIED: M2 Base Yaw ${val}µs (${(val / 1000).toFixed(2)}ms) is in safe range.${
                isAbove25 ? ' (Values >2.5ms and ≤3.0ms are 100% safe)' : ''
              }`
            );
            addLog(`Real Arm: M2 pulse ${val}µs (${(val / 1000).toFixed(2)}ms) in safe range`, 'info');
          } else if (val > 3000) {
            appendTerminal('sys', `⚠ WARNING: M2 pulse ${val}µs exceeds safe ceiling of 3000µs (3.0ms). Clamped to safe 3000µs limit.`);
            val = 3000;
          } else if (val < 1600) {
            val = 1600;
          }
          normalizedCmd = `M2 ${val}`;
        }
      } else {
        const posMatch = raw.match(
          /^POS\s*[:=]?\s*([0-9.]+(?:\s*(?:ms|us))?)\s+([0-9.]+(?:\s*(?:ms|us))?)\s+([0-9.]+(?:\s*(?:ms|us))?)$/i
        );
        if (posMatch) {
          const v1 = parsePulseInput(posMatch[1]);
          const v2 = parsePulseInput(posMatch[2]);
          const v3 = parsePulseInput(posMatch[3]);
          if (v1 !== null && v2 !== null && v3 !== null) {
            normalizedCmd = `POS ${v1} ${v2} ${v3}`;
          }
        }
      }
    }

    appendTerminal('tx', normalizedCmd);
    if (isConnected) {
      await serialManager.sendCommand(normalizedCmd);
    }
    setCustomCmd('');
  };

  // Handle typing in USB serial monitor input box to immediately sync sliders
  const handleCustomCmdInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCustomCmd(val);
    parseAndSyncMotors(val);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const isWebSerialSupported = serialManager.isSupported();

  return (
    <div className="bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] text-slate-100">
      {/* Header */}
      <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <Usb className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-100">Real-Life Arm Hardware Control</h2>
              <span
                className={`text-[10px] px-2 py-0.5 rounded font-mono font-medium flex items-center gap-1 ${
                  isConnected
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
                  }`}
                />
                {isConnected ? 'USB Connected (COM3)' : 'USB Disconnected'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Direct Web Serial controller: M1/M3 (1500–2500µs), M2 Base Yaw (1600–3000µs / 1.6–3.0ms), integrated Word Sequencer & Live Terminal
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isConnected ? (
            <button
              onClick={handleDisconnect}
              className="px-3 py-1.5 bg-rose-600/80 hover:bg-rose-500 text-white rounded text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
            >
              <Power className="w-3.5 h-3.5" />
              Disconnect
            </button>
          ) : (
            <button
              onClick={handleConnect}
              disabled={!isWebSerialSupported || isConnecting}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded text-xs font-semibold flex items-center gap-1.5 transition shadow-sm cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              {isConnecting ? 'Selecting Port...' : 'Connect Arm (USB Serial)'}
            </button>
          )}

          {onClose && (
            <button
              onClick={onClose}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Browser Warning if not Chrome/Edge */}
      {!isWebSerialSupported && (
        <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            Web Serial is supported in <strong>Google Chrome</strong> and <strong>Microsoft Edge</strong>. If you are using Safari or Firefox, open this app in Chrome to connect directly, or use the Python/MATLAB scripts below.
          </span>
        </div>
      )}

      {/* Sub navigation tabs */}
      <div className="flex bg-slate-950/80 border-b border-slate-800 px-4 pt-2 gap-1 overflow-x-auto text-xs">
        <button
          onClick={() => setActiveSubTab('control')}
          className={`px-3 py-2 border-b-2 font-medium flex items-center gap-1.5 transition cursor-pointer ${
            activeSubTab === 'control'
              ? 'border-emerald-400 text-emerald-300 bg-slate-900/60'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          Direct USB Control & Word Sequencer
        </button>
        <button
          onClick={() => setActiveSubTab('firmware')}
          className={`px-3 py-2 border-b-2 font-medium flex items-center gap-1.5 transition cursor-pointer ${
            activeSubTab === 'firmware'
              ? 'border-purple-400 text-purple-300 bg-slate-900/60'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          Arduino / ESP32 Firmware
        </button>
        <button
          onClick={() => setActiveSubTab('wiring')}
          className={`px-3 py-2 border-b-2 font-medium flex items-center gap-1.5 transition cursor-pointer ${
            activeSubTab === 'wiring'
              ? 'border-sky-400 text-sky-300 bg-slate-900/60'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          Wiring & Pinout Guide
        </button>
        <button
          onClick={() => setActiveSubTab('matlab')}
          className={`px-3 py-2 border-b-2 font-medium flex items-center gap-1.5 transition cursor-pointer ${
            activeSubTab === 'matlab'
              ? 'border-amber-400 text-amber-300 bg-slate-900/60'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          MATLAB Script (ME416)
        </button>
        <button
          onClick={() => setActiveSubTab('python')}
          className={`px-3 py-2 border-b-2 font-medium flex items-center gap-1.5 transition cursor-pointer ${
            activeSubTab === 'python'
              ? 'border-cyan-400 text-cyan-300 bg-slate-900/60'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          Python CLI (`arm_controller.py`)
        </button>
      </div>

      {/* Main Tab Body */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {/* TAB 1: DIRECT USB CONTROL */}
        {activeSubTab === 'control' && (
          <div className="space-y-4">
            {/* Word Sequencer for Real Life Arm Control */}
            <div className="p-3.5 bg-purple-950/25 border border-purple-500/30 rounded-xl flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-semibold text-purple-300 text-xs">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span>Real-Life Arm Word Sequencer:</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-purple-300 font-mono bg-purple-900/40 px-2 py-0.5 rounded border border-purple-500/30">
                    {isAnimating ? `Executing: ${cyclePhase}` : 'Ready for Real Arm'}
                  </span>
                </div>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!hwWordInput.trim() || isAnimating) return;
                  const word = hwWordInput.trim().toUpperCase();
                  onRunWordSequence?.(word);
                  addLog(`Initiated real-arm sequence for word: '${word}'`, 'info');
                  appendTerminal('sys', `Started Word Sequence: ${word}`);
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={hwWordInput}
                  onChange={(e) => setHwWordInput(e.target.value.toUpperCase())}
                  placeholder="Enter word to stamp on physical arm (e.g. ROBOT, ME416)"
                  disabled={isAnimating}
                  className="flex-1 px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 font-mono text-xs focus:outline-hidden focus:border-purple-400 uppercase tracking-wider"
                />
                <button
                  type="submit"
                  disabled={isAnimating || !hwWordInput.trim()}
                  className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-medium rounded-lg border border-purple-400/40 flex items-center gap-1.5 transition text-xs shadow-sm cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{isAnimating ? 'Sequencing Real Arm...' : 'Execute Sequence on Real Arm'}</span>
                </button>
              </form>

              {/* Real-time Stamping Status & Phase Tracker */}
              {activeLetter && (
                <div className="flex items-center justify-between px-3 py-1.5 bg-slate-950/80 rounded-lg border border-purple-500/30 text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">Current Target:</span>
                    <span className="font-bold text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/40 text-[11px]">
                      Letter '{activeLetter}'
                    </span>
                  </div>
                  <div className="text-purple-300 font-semibold text-[11px] flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />
                    <span>Phase: {cyclePhase}</span>
                  </div>
                </div>
              )}
              {/* Stamp Rack Letter Reach Calibration (A-Z) */}
              <div className="p-3 bg-slate-950/90 border border-amber-500/30 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span>Stamp Rack Letter Reach Calibration (A–Z)</span>
                  </div>
                  <span className="text-[10px] text-amber-400/90 font-mono bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                    M1 &amp; M3 Held Constant: 1500µs | Base Yaw M2 Calibrated
                  </span>
                </div>

                {/* Calibration Rule Legend */}
                <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px] font-mono space-y-1.5">
                  <div className="flex items-center justify-between text-slate-300">
                    <span>
                      <strong className="text-emerald-400">M1 (Shoulder)</strong> = 1500µs (1.5ms constant) &bull;{' '}
                      <strong className="text-sky-400">M3 (Elbow)</strong> = 1500µs (1.5ms constant)
                    </span>
                    <span className="text-amber-400 font-semibold">
                      Base Yaw (M2): 1750µs – 2425µs (Max: 3000µs)
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-1 pt-1 border-t border-slate-800/80">
                    <span>Z &amp; M: <strong className="text-amber-300">1750ms</strong></span>
                    <span>Y &amp; L: <strong className="text-amber-300">1810ms</strong></span>
                    <span>X &amp; K: <strong className="text-amber-300">1890ms</strong></span>
                    <span>W &amp; J: <strong className="text-amber-300">1930ms</strong></span>
                    <span>V &amp; I: <strong className="text-amber-300">1990ms</strong></span>
                    <span>U &amp; H: <strong className="text-amber-300">2050ms</strong></span>
                    <span>T &amp; G: <strong className="text-amber-300">2110ms</strong></span>
                    <span>S &amp; F: <strong className="text-amber-300">2170ms</strong></span>
                    <span>R &amp; E: <strong className="text-amber-300">2220ms</strong></span>
                    <span>Q &amp; D: <strong className="text-amber-300">2270ms</strong></span>
                    <span>P &amp; C: <strong className="text-amber-300">2230ms</strong></span>
                    <span>O &amp; B: <strong className="text-amber-300">2360ms</strong></span>
                    <span>N &amp; A: <strong className="text-amber-300">2425ms</strong></span>
                  </div>
                </div>

                {/* Letter Grid: Inner Tier A-M */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-sky-400 font-mono">
                    <span>Inner Rack [A–M] &bull; M1: 1500µs | M3: 1500µs | Base Yaw M2:</span>
                    <span className="text-slate-400">Click button to position arm</span>
                  </div>
                  <div className="grid grid-cols-13 gap-1">
                    {'ABCDEFGHIJKLM'.split('').map((char) => {
                      const calib = getStampRackCalibration(char);
                      const isSel = selectedLetter === char;
                      return (
                        <button
                          key={char}
                          type="button"
                          onClick={() => {
                            onSelectLetter?.(char);
                            setTestM1(calib.m1_us);
                            setTestM2(calib.m2_us);
                            setTestM3(calib.m3_us);
                            handleSendPos(calib.m1_us, calib.m2_us, calib.m3_us);
                            appendTerminal('tx', `M1 ${calib.m1_us} | M2 ${calib.m2_us} | M3 ${calib.m3_us} | REACH [${char}]`);
                          }}
                          className={`p-1 flex flex-col items-center justify-center rounded border transition text-center cursor-pointer ${
                            isSel
                              ? 'bg-amber-500 text-slate-950 font-black border-amber-300 shadow-md ring-1 ring-amber-400'
                              : 'bg-slate-900/90 hover:bg-sky-900/40 text-slate-200 border-slate-700/80 hover:border-sky-500/50'
                          }`}
                          title={`Letter ${char}: M1=1500µs (Shldr), Base Yaw M2=${calib.m2_us}µs, M3=1500µs (Elbow)`}
                        >
                          <span className="text-xs font-bold leading-none">{char}</span>
                          <span className="text-[8px] font-mono leading-tight mt-0.5 opacity-90 font-semibold">
                            {calib.m2_us}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Letter Grid: Outer Tier N-Z */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-purple-400 font-mono">
                    <span>Outer Rack [N–Z] &bull; M1: 1500µs | M3: 1500µs | Base Yaw M2:</span>
                    <span className="text-slate-400">Click button to position arm</span>
                  </div>
                  <div className="grid grid-cols-13 gap-1">
                    {'NOPQRSTUVWXYZ'.split('').map((char) => {
                      const calib = getStampRackCalibration(char);
                      const isSel = selectedLetter === char;
                      return (
                        <button
                          key={char}
                          type="button"
                          onClick={() => {
                            onSelectLetter?.(char);
                            setTestM1(calib.m1_us);
                            setTestM2(calib.m2_us);
                            setTestM3(calib.m3_us);
                            handleSendPos(calib.m1_us, calib.m2_us, calib.m3_us);
                            appendTerminal('tx', `M1 ${calib.m1_us} | M2 ${calib.m2_us} | M3 ${calib.m3_us} | REACH [${char}]`);
                          }}
                          className={`p-1 flex flex-col items-center justify-center rounded border transition text-center cursor-pointer ${
                            isSel
                              ? 'bg-amber-500 text-slate-950 font-black border-amber-300 shadow-md ring-1 ring-amber-400'
                              : 'bg-slate-900/90 hover:bg-purple-900/40 text-slate-200 border-slate-700/80 hover:border-purple-500/50'
                          }`}
                          title={`Letter ${char}: M1=1500µs (Shldr), Base Yaw M2=${calib.m2_us}µs, M3=1500µs (Elbow)`}
                        >
                          <span className="text-xs font-bold leading-none">{char}</span>
                          <span className="text-[8px] font-mono leading-tight mt-0.5 opacity-90 font-semibold">
                            {calib.m2_us}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Selected Letter Reach Summary */}
                {(() => {
                  const currentCalib = getStampRackCalibration(selectedLetter || 'A');
                  return (
                    <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between text-xs font-mono">
                      <div className="flex items-center gap-3">
                        <span className="text-amber-300 font-bold bg-amber-500/20 px-2 py-1 rounded border border-amber-500/40 text-sm">
                          Letter '{currentCalib.letter}'
                        </span>
                        <div className="text-[11px] text-slate-300 space-x-2">
                          <span>M1: <strong className="text-emerald-400">1500µs (constant)</strong></span>
                          <span>&bull;</span>
                          <span>Base Yaw M2: <strong className="text-amber-400">{currentCalib.m2_us}µs ({(currentCalib.m2_us / 1000).toFixed(2)}ms)</strong></span>
                          <span>&bull;</span>
                          <span>M3: <strong className="text-sky-400">1500µs (constant)</strong></span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setTestM1(currentCalib.m1_us);
                          setTestM2(currentCalib.m2_us);
                          setTestM3(currentCalib.m3_us);
                          handleSendPos(currentCalib.m1_us, currentCalib.m2_us, currentCalib.m3_us);
                          appendTerminal('tx', `POS ${currentCalib.m1_us} ${currentCalib.m2_us} ${currentCalib.m3_us}`);
                        }}
                        className="px-3 py-1 bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-slate-950 font-bold rounded flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>Send Reach Pulses</span>
                      </button>
                    </div>
                  );
                })()}

                {/* PUB / PUT, PBB, and STAMP Sequence Buttons */}
                <div className="pt-2 border-t border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-200 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                      Sequence Controllers: PUB / PUT, PBB &amp; stamp
                    </span>
                    {runningSequence && (
                      <button
                        onClick={handleStopSequence}
                        className="px-2 py-0.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-[10px] font-bold cursor-pointer"
                      >
                        Stop Sequence
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* Button 1: PUB / PUT */}
                    <div className={`p-3 rounded-xl border transition-all ${
                      runningSequence === 'PUB' || runningSequence === 'PUT'
                        ? 'bg-purple-950/60 border-purple-500 shadow-md ring-1 ring-purple-400'
                        : 'bg-slate-900/90 border-purple-500/30 hover:border-purple-500/60'
                    }`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={Boolean(runningSequence)}
                            onClick={() => handleRunSequence('PUB')}
                            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-black text-sm tracking-wide rounded-lg flex items-center gap-1.5 shadow-md transition cursor-pointer"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>PUB / PUT</span>
                          </button>
                          <div>
                            <div className="text-[11px] font-bold text-purple-300">Pick Upper Bay</div>
                            <div className="text-[9px] text-purple-400/80 font-mono">Outer Rack N–Z (3s pause after M1 2ms)</div>
                          </div>
                        </div>

                        {(runningSequence === 'PUB' || runningSequence === 'PUT') && (
                          <span className="text-[10px] font-mono text-purple-300 animate-pulse bg-purple-900/60 px-2 py-0.5 rounded border border-purple-400">
                            {sequenceStepIndex === 1 ? 'Step 2: 3s wait...' : `Step ${sequenceStepIndex + 1}/7`}
                          </span>
                        )}
                      </div>

                      {/* PUB Sequence Stepper Chips */}
                      <div className="flex flex-wrap gap-1 text-[10px] font-mono">
                        {PUB_SEQUENCE.map((s, idx) => {
                          const isCurrent = (runningSequence === 'PUB' || runningSequence === 'PUT') && sequenceStepIndex === idx;
                          const isDone = (runningSequence === 'PUB' || runningSequence === 'PUT') && sequenceStepIndex > idx;
                          return (
                            <span
                              key={idx}
                              className={`px-1.5 py-0.5 rounded border ${
                                isCurrent
                                  ? 'bg-purple-500 text-white font-bold border-purple-300 ring-1 ring-purple-400 animate-pulse'
                                  : isDone
                                  ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                                  : 'bg-slate-950 text-slate-400 border-slate-800'
                              }`}
                              title={s.delayMs ? `${s.label} (waits ${s.delayMs / 1000}s)` : s.label}
                            >
                              {s.label}
                              {s.delayMs ? ' (3s)' : ''}
                            </span>
                          );
                        })}
                      </div>
                    </div>

                    {/* Button 2: PBB */}
                    <div className={`p-3 rounded-xl border transition-all ${
                      runningSequence === 'PBB'
                        ? 'bg-sky-950/60 border-sky-500 shadow-md ring-1 ring-sky-400'
                        : 'bg-slate-900/90 border-sky-500/30 hover:border-sky-500/60'
                    }`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={Boolean(runningSequence)}
                            onClick={() => handleRunSequence('PBB')}
                            className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-black text-sm tracking-wide rounded-lg flex items-center gap-1.5 shadow-md transition cursor-pointer"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>PBB</span>
                          </button>
                          <div>
                            <div className="text-[11px] font-bold text-sky-300">PBB Sequence</div>
                            <div className="text-[9px] text-sky-400/80 font-mono">M3 1890 &rarr; M1 1760 &rarr; M3 1.89ms&rarr;1.6ms (slow) then &rarr;1.5ms (quick) &rarr; M1 2 (2s wait)</div>
                          </div>
                        </div>

                        {runningSequence === 'PBB' && (
                          <span className="text-[10px] font-mono text-sky-300 animate-pulse bg-sky-900/60 px-2 py-0.5 rounded border border-sky-400">
                            {sequenceStepIndex === 2 ? 'Step 3: M3 1.89ms→1.6ms slow, then →1.5ms quick...' : `Step ${sequenceStepIndex + 1}/4 (2s wait)`}
                          </span>
                        )}
                      </div>

                      {/* PBB Sequence Stepper Chips */}
                      <div className="flex flex-wrap gap-1 text-[10px] font-mono">
                        {PBB_SEQUENCE.map((s, idx) => {
                          const isCurrent = runningSequence === 'PBB' && sequenceStepIndex === idx;
                          const isDone = runningSequence === 'PBB' && sequenceStepIndex > idx;
                          return (
                            <span
                              key={idx}
                              className={`px-1.5 py-0.5 rounded border ${
                                isCurrent
                                  ? 'bg-sky-500 text-white font-bold border-sky-300 ring-1 ring-sky-400 animate-pulse'
                                  : isDone
                                  ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                                  : 'bg-slate-950 text-slate-400 border-slate-800'
                              }`}
                              title={idx === 2 ? 'M3: 1.890ms to 1.6ms slow, then 1.6ms to 1.5ms quick' : `${s.label} (waits 2s)`}
                            >
                              {s.label}
                              {idx === 2 ? ' (slow→quick)' : ' (2s)'}
                            </span>
                          );
                        })}
                      </div>
                    </div>

                    {/* Button 3: stamp */}
                    <div className={`p-3 rounded-xl border transition-all ${
                      runningSequence === 'STAMP'
                        ? 'bg-emerald-950/60 border-emerald-500 shadow-md ring-1 ring-emerald-400'
                        : 'bg-slate-900/90 border-emerald-500/30 hover:border-emerald-500/60'
                    }`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={Boolean(runningSequence)}
                            onClick={() => handleRunSequence('STAMP')}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black text-sm tracking-wide rounded-lg flex items-center gap-1.5 shadow-md transition cursor-pointer"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>stamp</span>
                          </button>
                          <div>
                            <div className="text-[11px] font-bold text-emerald-300">stamp sequence</div>
                            <div className="text-[9px] text-emerald-400/80 font-mono">M2 1.6ms &rarr; M3 1.785ms &rarr; M1 2ms &rarr; (wait 2s) &rarr; M1 1.5ms</div>
                          </div>
                        </div>

                        {runningSequence === 'STAMP' && (
                          <span className="text-[10px] font-mono text-emerald-300 animate-pulse bg-emerald-900/60 px-2 py-0.5 rounded border border-emerald-400">
                            {sequenceStepIndex === 2 ? 'Step 3: 2s wait between M1 2ms & M1 1.5ms...' : `Running step ${sequenceStepIndex + 1}/4`}
                          </span>
                        )}
                      </div>

                      {/* stamp Sequence Stepper Chips */}
                      <div className="flex flex-wrap gap-1 text-[10px] font-mono">
                        {STAMP_SEQUENCE.map((s, idx) => {
                          const isCurrent = runningSequence === 'STAMP' && sequenceStepIndex === idx;
                          const isDone = runningSequence === 'STAMP' && sequenceStepIndex > idx;
                          return (
                            <span
                              key={idx}
                              className={`px-1.5 py-0.5 rounded border ${
                                isCurrent
                                  ? 'bg-emerald-500 text-white font-bold border-emerald-300 ring-1 ring-emerald-400 animate-pulse'
                                  : isDone
                                  ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                                  : 'bg-slate-950 text-slate-400 border-slate-800'
                              }`}
                              title={idx === 2 ? `${s.label} (waits 2 seconds before M1 1.5ms)` : s.label}
                            >
                              {s.label}
                              {idx === 2 ? ' (wait 2s)' : ''}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Split Grid: Left = Sliders & Quick Actions, Right = Serial Terminal */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Left Column: Mirror Toggle & Manual Sliders */}
              <div className="space-y-3">
                {/* Mirroring Toggle & Status */}
                <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-slate-200">Hardware Mirroring Mode</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isMirrorEnabled}
                        onChange={(e) => onToggleMirror(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-800 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                    </label>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-normal">
                    When active, all arm motions in simulation immediately stream live PWM pulses to physical servos.
                  </p>
                </div>

                {/* Quick Actions (Home Arm, E-Stop, PUB/PUT, PBB, stamp) */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                  <button
                    onClick={handleHomeArm}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-sky-300 border border-sky-500/30 rounded-lg flex items-center justify-center gap-1 text-[11px] font-semibold transition cursor-pointer"
                    title="Home Arm: M1 1500µs, M2 2100µs, M3 1500µs"
                  >
                    <RotateCcw className="w-3 h-3 text-sky-400" />
                    <div className="flex flex-col items-start leading-tight">
                      <span>Home</span>
                      <span className="text-[7px] text-sky-400/80 font-mono">1500/2100/1500</span>
                    </div>
                  </button>

                  <button
                    onClick={handleEmergencyStop}
                    className="p-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-500/40 rounded-lg flex items-center justify-center gap-1 text-[11px] font-semibold transition cursor-pointer"
                    title="Detaches all servos immediately"
                  >
                    <ShieldAlert className="w-3 h-3 text-rose-400" />
                    <div className="flex flex-col items-start leading-tight">
                      <span>E-STOP</span>
                      <span className="text-[7px] text-rose-400/80 font-mono">Detach</span>
                    </div>
                  </button>

                  <button
                    disabled={Boolean(runningSequence)}
                    onClick={() => handleRunSequence('PUB')}
                    className="p-1.5 bg-purple-950/50 hover:bg-purple-900/60 text-purple-200 border border-purple-500/40 rounded-lg flex items-center justify-center gap-1 text-[11px] font-semibold transition cursor-pointer disabled:opacity-50"
                    title="Run PUB / PUT sequence (Pick Upper Bay, 3s delay)"
                  >
                    <Play className="w-3 h-3 text-purple-400 fill-current" />
                    <div className="flex flex-col items-start leading-tight">
                      <span className="font-bold">PUB/PUT</span>
                      <span className="text-[7px] text-purple-400/80 font-mono">Upper (7 steps)</span>
                    </div>
                  </button>

                  <button
                    disabled={Boolean(runningSequence)}
                    onClick={() => handleRunSequence('PBB')}
                    className="p-1.5 bg-sky-950/50 hover:bg-sky-900/60 text-sky-200 border border-sky-500/40 rounded-lg flex items-center justify-center gap-1 text-[11px] font-semibold transition cursor-pointer disabled:opacity-50"
                    title="Run PBB sequence: M3 1890 -> M1 1760 -> M3 1.5 -> M1 2 (wait 2s between each command)"
                  >
                    <Play className="w-3 h-3 text-sky-400 fill-current" />
                    <div className="flex flex-col items-start leading-tight">
                      <span className="font-bold">PBB</span>
                      <span className="text-[7px] text-sky-400/80 font-mono">Bottom (4 steps)</span>
                    </div>
                  </button>

                  <button
                    disabled={Boolean(runningSequence)}
                    onClick={() => handleRunSequence('STAMP')}
                    className="p-1.5 bg-emerald-950/50 hover:bg-emerald-900/60 text-emerald-200 border border-emerald-500/40 rounded-lg flex items-center justify-center gap-1 text-[11px] font-semibold transition cursor-pointer disabled:opacity-50"
                    title="Run stamp sequence: M2 1.600ms -> M3 1.785ms -> M1 2.000ms -> M1 1.500ms"
                  >
                    <Play className="w-3 h-3 text-emerald-400 fill-current" />
                    <div className="flex flex-col items-start leading-tight">
                      <span className="font-bold">stamp</span>
                      <span className="text-[7px] text-emerald-400/80 font-mono">Stamp (4 steps)</span>
                    </div>
                  </button>
                </div>

                {/* Manual Servo Pulse Sliders: M1/M3 (1500us to 2500us), M2 Base Yaw (1600us to 3000us, Center 2100us) */}
                <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-200">Manual Servo Pulse Testing</span>
                    <span className="text-[10px] text-emerald-400 font-mono font-medium">[M1/M3: 1500–2500µs | M2 Safe Range: 1600–3000µs]</span>
                  </div>

                  {/* Prominent Safety Range Banner */}
                  <div className="p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-500/50 text-[11px] text-emerald-200 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-bold text-emerald-300">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>Real Arm Safety Range Confirmed (&lt; 3.0ms / 3000µs Safe)</span>
                      </div>
                      <span className="text-[10px] font-mono text-emerald-300 font-bold bg-emerald-900/80 px-2 py-0.5 rounded border border-emerald-400/80 shrink-0">
                        &lt; 3.0ms SAFE
                      </span>
                    </div>
                    <p className="text-[10.5px] text-emerald-300/90 leading-tight">
                      <strong>All input values under 3.0ms (1600µs to 3000µs) on M2 Base Yaw are in the safe range.</strong> Values greater than 2.5ms (e.g. 2.6ms, 2.7ms, 2.8ms, 2.9ms, 3.0ms / 2600–3000µs) are completely SAFE and well within the physical operating envelope.
                    </p>
                  </div>

                  {/* Motor 1: Shoulder Elevation */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-emerald-300 font-medium">M1 (Shoulder θ₁)</span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={m1InputText}
                          onChange={(e) => {
                            const txt = e.target.value;
                            setM1InputText(txt);
                            const parsed = parsePulseInput(txt);
                            if (parsed !== null && parsed >= 1500 && parsed <= 2500) {
                              setTestM1(parsed);
                              handleSendSingleMotor(1, parsed);
                            }
                          }}
                          onBlur={() => setM1InputText(String(testM1))}
                          placeholder="1500"
                          title="Direct input: e.g. 1500, 1.5ms, 2000, 2ms"
                          className="w-16 px-1.5 py-0.5 bg-slate-900 border border-slate-700 focus:border-emerald-400 text-emerald-300 font-mono font-bold text-right rounded text-xs focus:outline-hidden"
                        />
                        <span className="font-mono text-slate-200 font-bold">
                          µs ({(testM1 / 1000).toFixed(2)} ms) &bull; {(((testM1 - 1500) * 90) / 1000).toFixed(1)}°
                        </span>
                      </div>
                    </div>
                    <input
                      type="range"
                      min="1500"
                      max="2500"
                      step="5"
                      value={testM1}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setTestM1(v);
                        handleSendSingleMotor(1, v);
                      }}
                      className="w-full accent-emerald-400 h-1.5 bg-slate-800 rounded cursor-pointer"
                    />
                    <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                      <button onClick={() => { setTestM1(1500); handleSendSingleMotor(1, 1500); }} className="hover:text-emerald-300 cursor-pointer">
                        1500µs (0° Zero)
                      </button>
                      <button onClick={() => { setTestM1(2000); handleSendSingleMotor(1, 2000); }} className="hover:text-emerald-300 cursor-pointer">
                        2000µs (+45° Mid)
                      </button>
                      <button onClick={() => { setTestM1(2500); handleSendSingleMotor(1, 2500); }} className="hover:text-emerald-300 cursor-pointer">
                        2500µs (+90° Max)
                      </button>
                    </div>
                  </div>

                  {/* Motor 2: Base Yaw (min 1600us, max 3000us, center 2100us) */}
                  <div className="space-y-1.5 pt-2 border-t border-slate-900">
                    <div className="flex justify-between items-center text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <span className="text-amber-300 font-medium">M2 (Base Yaw θ₀)</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono font-semibold">
                          Safe Range: 1.6ms–3.0ms (&lt;3.0ms safe)
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={m2InputText}
                          onChange={(e) => {
                            const txt = e.target.value;
                            setM2InputText(txt);
                            const parsed = parsePulseInput(txt);
                            if (parsed !== null && parsed >= 1600 && parsed <= 3000) {
                              setTestM2(parsed);
                              handleSendSingleMotor(2, parsed);
                            }
                          }}
                          onBlur={() => setM2InputText(String(testM2))}
                          placeholder="up to 3ms"
                          title="Direct input: values under 3ms (1600us to 3000us) are in the safe range"
                          className="w-20 px-1.5 py-0.5 bg-slate-900 border border-slate-700 focus:border-amber-400 text-amber-300 font-mono font-bold text-right rounded text-xs focus:outline-hidden"
                        />
                        <span className="font-mono text-slate-200 font-bold">
                          µs ({(testM2 / 1000).toFixed(2)} ms) &bull; {(((testM2 - 2100) * 45) / 500).toFixed(1)}°
                        </span>
                      </div>
                    </div>

                    {/* Live Validation Pill for M2 input */}
                    {(() => {
                      const parsed = parsePulseInput(m2InputText);
                      if (parsed === null) return null;
                      if (parsed >= 1600 && parsed <= 3000) {
                        return (
                          <div className="flex items-center gap-1 text-[10px] text-emerald-400 font-mono bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/30">
                            <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                            <span>
                              <strong>Safe Range Verified:</strong> {(parsed / 1000).toFixed(2)}ms ({parsed}µs) is within safe range. {parsed > 2500 ? '(Values >2.5ms up to 3.0ms are 100% safe)' : ''}
                            </span>
                          </div>
                        );
                      } else if (parsed > 3000) {
                        return (
                          <div className="flex items-center gap-1 text-[10px] text-rose-400 font-mono bg-rose-950/40 px-2 py-0.5 rounded border border-rose-500/30">
                            <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" />
                            <span>
                              <strong>Out of Safe Range:</strong> {(parsed / 1000).toFixed(2)}ms exceeds safe ceiling of 3.0ms (3000µs).
                            </span>
                          </div>
                        );
                      } else {
                        return (
                          <div className="flex items-center gap-1 text-[10px] text-rose-400 font-mono bg-rose-950/40 px-2 py-0.5 rounded border border-rose-500/30">
                            <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" />
                            <span>
                              <strong>Out of Safe Range:</strong> {(parsed / 1000).toFixed(2)}ms is below minimum of 1.6ms (1600µs).
                            </span>
                          </div>
                        );
                      }
                    })()}

                    <input
                      type="range"
                      min="1600"
                      max="3000"
                      step="5"
                      value={testM2}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setTestM2(v);
                        handleSendSingleMotor(2, v);
                      }}
                      className="w-full accent-amber-400 h-1.5 bg-slate-800 rounded cursor-pointer"
                    />
                    <div className="flex flex-wrap justify-between gap-1 text-[9px] text-slate-400 font-mono">
                      <button onClick={() => { setTestM2(1600); handleSendSingleMotor(2, 1600); }} className="hover:text-amber-300 cursor-pointer font-semibold text-amber-400">
                        1600µs (Min)
                      </button>
                      <button onClick={() => { setTestM2(2100); handleSendSingleMotor(2, 2100); }} className="hover:text-amber-300 cursor-pointer font-semibold text-amber-300">
                        2100µs (0° Center)
                      </button>
                      <button onClick={() => { setTestM2(2500); handleSendSingleMotor(2, 2500); }} className="hover:text-emerald-300 cursor-pointer">
                        2500µs (2.5ms)
                      </button>
                      <button onClick={() => { setTestM2(2600); handleSendSingleMotor(2, 2600); }} className="hover:text-emerald-300 cursor-pointer font-bold text-emerald-400">
                        2600µs (2.6ms Safe)
                      </button>
                      <button onClick={() => { setTestM2(2800); handleSendSingleMotor(2, 2800); }} className="hover:text-emerald-300 cursor-pointer font-bold text-emerald-400">
                        2800µs (2.8ms Safe)
                      </button>
                      <button onClick={() => { setTestM2(3000); handleSendSingleMotor(2, 3000); }} className="hover:text-emerald-300 cursor-pointer font-bold text-emerald-300">
                        3000µs (3.0ms Safe Max)
                      </button>
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-mono px-1 text-emerald-400/90 pt-0.5">
                      <span className="flex items-center gap-1 font-medium">
                        <Check className="w-3 h-3 text-emerald-400" />
                        Status: {testM2}µs ({(testM2 / 1000).toFixed(2)}ms) — In Safe Range (&le;3.0ms / 3000µs)
                      </span>
                      <span className="text-slate-400 text-[9px]">Ceiling: 3000µs / 3.0ms</span>
                    </div>
                  </div>

                  {/* Motor 3: Elbow Elevation */}
                  <div className="space-y-1 pt-2 border-t border-slate-900">
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-sky-300 font-medium">M3 (Elbow θ₂)</span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={m3InputText}
                          onChange={(e) => {
                            const txt = e.target.value;
                            setM3InputText(txt);
                            const parsed = parsePulseInput(txt);
                            if (parsed !== null && parsed >= 1500 && parsed <= 2500) {
                              setTestM3(parsed);
                              handleSendSingleMotor(3, parsed);
                            }
                          }}
                          onBlur={() => setM3InputText(String(testM3))}
                          placeholder="1500"
                          title="Direct input: e.g. 1500, 1.5ms, 2000, 2ms"
                          className="w-16 px-1.5 py-0.5 bg-slate-900 border border-slate-700 focus:border-sky-400 text-sky-300 font-mono font-bold text-right rounded text-xs focus:outline-hidden"
                        />
                        <span className="font-mono text-slate-200 font-bold">
                          µs ({(testM3 / 1000).toFixed(2)} ms) &bull; {(((testM3 - 1500) * 90) / 1000).toFixed(1)}°
                        </span>
                      </div>
                    </div>
                    <input
                      type="range"
                      min="1500"
                      max="2500"
                      step="5"
                      value={testM3}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setTestM3(v);
                        handleSendSingleMotor(3, v);
                      }}
                      className="w-full accent-sky-400 h-1.5 bg-slate-800 rounded cursor-pointer"
                    />
                    <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                      <button onClick={() => { setTestM3(1500); handleSendSingleMotor(3, 1500); }} className="hover:text-sky-300 cursor-pointer">
                        1500µs (0° Zero)
                      </button>
                      <button onClick={() => { setTestM3(2000); handleSendSingleMotor(3, 2000); }} className="hover:text-sky-300 cursor-pointer">
                        2000µs (+45° Mid)
                      </button>
                      <button onClick={() => { setTestM3(2500); handleSendSingleMotor(3, 2500); }} className="hover:text-sky-300 cursor-pointer">
                        2500µs (+90° Max)
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Live Serial Terminal with Automatic Slider Sync */}
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex flex-col h-96">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-200 font-mono">
                    <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                    <span>USB Serial Monitor (115200 baud)</span>
                  </div>
                  <button
                    onClick={() => setTerminalLogs([])}
                    className="text-[10px] text-slate-500 hover:text-slate-300 cursor-pointer"
                  >
                    Clear Terminal
                  </button>
                </div>

                {/* Logs */}
                <div className="flex-1 overflow-y-auto py-2 font-mono text-[11px] space-y-1 select-text">
                  {terminalLogs.length === 0 ? (
                    <div className="text-slate-600 italic py-8 text-center space-y-1">
                      <p>No serial traffic yet.</p>
                      <p className="text-[10px]">Type commands below (e.g. M1 1800, HOME, POS 1500 2000 2500) to test.</p>
                    </div>
                  ) : (
                    terminalLogs.map((log) => (
                      <div
                        key={log.id}
                        className={`leading-tight ${
                          log.type === 'tx'
                            ? 'text-sky-400'
                            : log.type === 'rx'
                            ? 'text-emerald-400'
                            : 'text-amber-400/90 italic'
                        }`}
                      >
                        <span className="text-slate-600 mr-1.5">[{log.time}]</span>
                        <span className="font-bold mr-1">
                          {log.type === 'tx' ? 'TX >>' : log.type === 'rx' ? 'RX <<' : 'SYS ::'}
                        </span>
                        <span>{log.text}</span>
                      </div>
                    ))
                  )}
                  <div ref={terminalEndRef} />
                </div>

                {/* Manual Command Input (Typing here visually synchronizes manual sliders) */}
                <form onSubmit={handleSendCustom} className="pt-2 border-t border-slate-800 flex flex-col gap-1.5">
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={customCmd}
                      onChange={handleCustomCmdInputChange}
                      placeholder="Type command (e.g. M1 2000, HOME, POS 1500 2000 2500)"
                      className="flex-1 px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-slate-100 font-mono text-xs focus:outline-hidden focus:border-emerald-400"
                    />
                    <button
                      type="submit"
                      disabled={!customCmd.trim()}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
                    >
                      <Send className="w-3 h-3" />
                      <span>Send</span>
                    </button>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Typing or sending motor values (e.g. M1 1800, POS 1500 2000 2500) automatically syncs manual sliders.
                  </span>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: FIRMWARE */}
        {activeSubTab === 'firmware' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-purple-300">Microcontroller Firmware (`firmware/rasticrane_controller.ino`)</h3>
                <p className="text-[11px] text-slate-400">
                  Calibrated for M1/M3 (1500–2500µs) and M2 Base Yaw (1600–3000µs / 1.6–3.0ms safe range, values under 3.0ms safe). Supports M1/M2/M3, POS, HOME, and STOP.
                </p>
              </div>
              <button
                onClick={() => copyToClipboard(FIRMWARE_SOURCE, 'firmware')}
                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
              >
                {copiedCode === 'firmware' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCode === 'firmware' ? 'Copied!' : 'Copy Code'}</span>
              </button>
            </div>

            <pre className="p-3 bg-slate-950 border border-slate-800 rounded-lg font-mono text-[11px] text-slate-300 max-h-80 overflow-y-auto leading-relaxed select-text">
              {FIRMWARE_SOURCE}
            </pre>
          </div>
        )}

        {/* TAB 3: WIRING GUIDE */}
        {activeSubTab === 'wiring' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-bold text-sky-300">Physical Wiring & Pinout Specifications</h3>
              <p className="text-[11px] text-slate-400">
                Correct wiring is essential so servos have enough current without resetting your microcontroller.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
                <div className="font-bold text-emerald-400 text-xs mb-1">Motor 1 (Shoulder)</div>
                <ul className="text-[11px] space-y-1 text-slate-300 font-mono">
                  <li>Signal: <span className="text-emerald-300 font-bold">GPIO 18</span> (Pin 9 Uno)</li>
                  <li>Power: External 5V/6V (+)</li>
                  <li>Ground: Common GND (-)</li>
                  <li>Zero: 1500 µs (0°)</li>
                  <li>Home: 2500 µs (+90°)</li>
                </ul>
              </div>

              <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
                <div className="font-bold text-amber-400 text-xs mb-1">Motor 2 (Base Yaw)</div>
                <ul className="text-[11px] space-y-1 text-slate-300 font-mono">
                  <li>Signal: <span className="text-amber-300 font-bold">GPIO 19</span> (Pin 10 Uno)</li>
                  <li>Power: External 5V/6V (+)</li>
                  <li>Ground: Common GND (-)</li>
                  <li>Min: 1600 µs (-45° Left)</li>
                  <li>Center: 2100 µs (0° Forward)</li>
                  <li>Max: 3000 µs (+81° Right / 3.0ms)</li>
                </ul>
              </div>

              <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
                <div className="font-bold text-sky-400 text-xs mb-1">Motor 3 (Elbow)</div>
                <ul className="text-[11px] space-y-1 text-slate-300 font-mono">
                  <li>Signal: <span className="text-sky-300 font-bold">GPIO 20</span> (Pin 11 Uno)</li>
                  <li>Power: External 5V/6V (+)</li>
                  <li>Ground: Common GND (-)</li>
                  <li>Zero: 1500 µs (0°)</li>
                  <li>Home: 2500 µs (+90°)</li>
                </ul>
              </div>
            </div>

            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-200 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span>Common Ground Required</span>
              </div>
              <p className="text-[11px] text-amber-300/90 leading-relaxed">
                Connect the ground (-) of the external power supply to the GND pin of the microcontroller so servo PWM signals have a shared return path.
              </p>
            </div>
          </div>
        )}

        {/* TAB 4: MATLAB */}
        {activeSubTab === 'matlab' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-amber-300">MATLAB Controller Script (ME416 Lab 2 Handout)</h3>
                <p className="text-[11px] text-slate-400">
                  Connects to ESP32/Arduino over Serial, writes M1/M2/M3 and POS commands.
                </p>
              </div>
              <button
                onClick={() => copyToClipboard(MATLAB_SOURCE, 'matlab')}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
              >
                {copiedCode === 'matlab' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCode === 'matlab' ? 'Copied!' : 'Copy MATLAB'}</span>
              </button>
            </div>

            <pre className="p-3 bg-slate-950 border border-slate-800 rounded-lg font-mono text-[11px] text-slate-300 max-h-80 overflow-y-auto leading-relaxed select-text">
              {MATLAB_SOURCE}
            </pre>
          </div>
        )}

        {/* TAB 5: PYTHON CLI */}
        {activeSubTab === 'python' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-cyan-300">Standalone Python Controller (`scripts/arm_controller.py`)</h3>
                <p className="text-[11px] text-slate-400">
                  Command-line tool to test and control the physical arm from Terminal / PowerShell.
                </p>
              </div>
              <button
                onClick={() => copyToClipboard(PYTHON_SOURCE, 'python')}
                className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
              >
                {copiedCode === 'python' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCode === 'python' ? 'Copied!' : 'Copy Python'}</span>
              </button>
            </div>

            <pre className="p-3 bg-slate-950 border border-slate-800 rounded-lg font-mono text-[11px] text-slate-300 max-h-80 overflow-y-auto leading-relaxed select-text">
              {PYTHON_SOURCE}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};

const FIRMWARE_SOURCE = `#if defined(ESP32) || defined(ARDUINO_ARCH_ESP32)
  #include <ESP32Servo.h>
  #define PIN_M1 18 // Shoulder
  #define PIN_M2 19 // Base Yaw
  #define PIN_M3 20 // Elbow
#else
  #include <Servo.h>
  #define PIN_M1 9  // Shoulder
  #define PIN_M2 10 // Base Yaw
  #define PIN_M3 11 // Elbow
#endif

Servo servo1, servo2, servo3;
// SAFETY OPERATIONAL RANGES:
// M1 Shoulder & M3 Elbow: 1500us (0 deg) to 2500us (+90 deg)
// M2 Base Yaw Safety Range: 1600us to 3000us (1.6ms to 3.0ms - all values under 3.0ms are in safe range)
const int M1_HOME_US = 1500;
const int M2_HOME_US = 2100; // Center Base Yaw (Safe Range: 1600 to 3000us)
const int M3_HOME_US = 1500;

void setup() {
  Serial.begin(115200);
  servo1.attach(PIN_M1, 1000, 2600);
  servo2.attach(PIN_M2, 1000, 3100); // Attach with 3100us timer headroom for safe 1600-3000us range
  servo3.attach(PIN_M3, 1000, 2600);
  setHome();
}

void setHome() {
  servo1.writeMicroseconds(M1_HOME_US);
  servo2.writeMicroseconds(M2_HOME_US);
  servo3.writeMicroseconds(M3_HOME_US);
  Serial.println("OK: Homed motors to M1=1500us, M2=2100us, M3=1500us");
}

void setZero() {
  servo1.writeMicroseconds(1500);
  servo2.writeMicroseconds(2100);
  servo3.writeMicroseconds(1500);
  Serial.println("OK: Centered all motors (M1 1500, M2 2100, M3 1500)");
}

void loop() {
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    if (cmd == "HOME") setHome();
    else if (cmd == "ZERO") setZero();
    else if (cmd == "STAMP") {
      // STAMP sequence: M2 1.600ms -> M3 1.785ms -> M1 2.000ms -> wait 2 seconds -> M1 1.500ms
      servo2.writeMicroseconds(1600); delay(600);
      servo3.writeMicroseconds(1785); delay(600);
      servo1.writeMicroseconds(2000); delay(2000); // 2 seconds wait between M1 2.000ms and M1 1.500ms
      servo1.writeMicroseconds(1500);
      Serial.println("OK: STAMP sequence complete");
    }
    else if (cmd == "PUB" || cmd == "PUT") {
      // PUB / PUT sequence: 3s pause between M1 2ms and M3 1.8ms
      servo3.writeMicroseconds(1670); delay(600);
      servo1.writeMicroseconds(2000); delay(3000); // 3 seconds wait
      servo3.writeMicroseconds(1800); delay(600);
      servo1.writeMicroseconds(1900); delay(600);
      servo3.writeMicroseconds(1750); delay(600);
      servo1.writeMicroseconds(1800); delay(600);
      servo3.writeMicroseconds(1850);
      Serial.println("OK: PUB/PUT sequence complete");
    }
    else if (cmd == "PBB") {
      // Step 1: M3 1890 direct
      servo3.writeMicroseconds(1890); delay(2000);
      // Step 2: M1 1760 direct
      servo1.writeMicroseconds(1760); delay(2000);
      // Step 3: Intermediate values ONLY when transitioning M3 1.890ms -> 1.6ms SLOW, then 1.6ms -> 1.5ms QUICK
      for (int pos = 1890; pos >= 1600; pos -= 10) {
        servo3.writeMicroseconds(pos);
        delay(70); // Slow transition
      }
      for (int pos = 1600; pos >= 1500; pos -= 20) {
        servo3.writeMicroseconds(pos);
        delay(20); // Quick transition
      }
      servo3.writeMicroseconds(1500); delay(2000);
      // Step 4: M1 2000 direct
      servo1.writeMicroseconds(2000); delay(2000);
      Serial.println("OK: PBB sequence complete (M3 1890->1600 slow, then 1600->1500 quick)");
    }
    else if (cmd.startsWith("M1 ")) servo1.writeMicroseconds(cmd.substring(3).toInt());
    else if (cmd.startsWith("M2 ")) servo2.writeMicroseconds(cmd.substring(3).toInt());
    else if (cmd.startsWith("M3 ")) servo3.writeMicroseconds(cmd.substring(3).toInt());
    else if (cmd.startsWith("POS ")) {
      // POS <m1> <m2> <m3>
      int s1 = cmd.indexOf(' ');
      int s2 = cmd.indexOf(' ', s1 + 1);
      int s3 = cmd.indexOf(' ', s2 + 1);
      servo1.writeMicroseconds(cmd.substring(s1+1, s2).toInt());
      servo2.writeMicroseconds(cmd.substring(s2+1, s3).toInt());
      servo3.writeMicroseconds(cmd.substring(s3+1).toInt());
      Serial.println("OK: POS updated");
    }
  }
}`;

const MATLAB_SOURCE = `% ME416 Lab 2 MATLAB Serial Arm Controller
portName = "COM3"; % Update to match your ESP32 COM port
baudRate = 115200;

s = serialport(portName, baudRate);
configureTerminator(s, "LF");
pause(2); % Allow ESP32 reboot

% Home all motors (2500us / +90 deg)
writeline(s, "HOME");

% Example: Move to specific position (0 deg = 1500us, 90 deg = 2500us)
writeline(s, "POS 1500 2000 2500");`;

const PYTHON_SOURCE = `import serial, time

ser = serial.Serial('COM3', 115200, timeout=1)
time.sleep(2) # Settle connection

# Home all motors (2500us / +90 deg)
ser.write(b"HOME\\n")
print(ser.readline().decode().strip())

# Send motor pulses: POS <m1> <m2> <m3>
ser.write(b"POS 1500 2000 2500\\n")
print(ser.readline().decode().strip())

ser.close()`;
