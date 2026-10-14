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

  // Manual test pulse values (visual slider range: 1500us [0 deg] to 2500us [+90 deg], home is 2500us)
  const [testM1, setTestM1] = useState(HOME_MOTOR_PULSE_US);
  const [testM2, setTestM2] = useState(HOME_MOTOR_PULSE_US);
  const [testM3, setTestM3] = useState(HOME_MOTOR_PULSE_US);

  const terminalEndRef = useRef<HTMLDivElement | null>(null);

  // Helper to parse input/feedback and keep manual servo pulse testing sliders visually in sync with serial commands
  const parseAndSyncMotors = (rawText: string) => {
    if (!rawText) return;
    const text = rawText.toUpperCase();

    // Check for M1 <us>
    const m1Match = text.match(/M1\s*[:=]?\s*(\d+)/);
    if (m1Match) {
      const val = parseInt(m1Match[1], 10);
      if (val >= 1000 && val <= 3000) {
        setTestM1(Math.max(1500, Math.min(2500, val)));
      }
    }

    // Check for M2 <us>
    const m2Match = text.match(/M2\s*[:=]?\s*(\d+)/);
    if (m2Match) {
      const val = parseInt(m2Match[1], 10);
      if (val >= 1000 && val <= 3000) {
        setTestM2(Math.max(1500, Math.min(2500, val)));
      }
    }

    // Check for M3 <us>
    const m3Match = text.match(/M3\s*[:=]?\s*(\d+)/);
    if (m3Match) {
      const val = parseInt(m3Match[1], 10);
      if (val >= 1000 && val <= 3000) {
        setTestM3(Math.max(1500, Math.min(2500, val)));
      }
    }

    // Check for POS <m1> <m2> <m3>
    const posMatch = text.match(/POS\s*[:=]?\s*(\d+)\s+(\d+)\s+(\d+)/);
    if (posMatch) {
      const v1 = parseInt(posMatch[1], 10);
      const v2 = parseInt(posMatch[2], 10);
      const v3 = parseInt(posMatch[3], 10);
      if (v1 >= 1000 && v1 <= 3000) setTestM1(Math.max(1500, Math.min(2500, v1)));
      if (v2 >= 1000 && v2 <= 3000) setTestM2(Math.max(1500, Math.min(2500, v2)));
      if (v3 >= 1000 && v3 <= 3000) setTestM3(Math.max(1500, Math.min(2500, v3)));
    }

    // Check for HOME
    if (text.includes('HOME')) {
      setTestM1(2500);
      setTestM2(2500);
      setTestM3(2500);
    }

    // Check for ZERO
    if (text.includes('ZERO') || text.includes('1500US')) {
      setTestM1(1500);
      setTestM2(1500);
      setTestM3(1500);
    }
  };

  // Sync sliders when current motor pulses from simulation/sequencer update
  useEffect(() => {
    if (currentM1 >= 1500 && currentM1 <= 2500) setTestM1(currentM1);
    if (currentM2 >= 1500 && currentM2 <= 2500) setTestM2(currentM2);
    if (currentM3 >= 1500 && currentM3 <= 2500) setTestM3(currentM3);
  }, [currentM1, currentM2, currentM3]);

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
      // Immediately home motors to 2500us (+90 deg)
      await serialManager.homeArm(2500);
      appendTerminal('tx', 'M1 2500 | M2 2500 | M3 2500 | HOME (2500µs / +90°)');
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

  // Home Arm (2500us / +90 deg)
  const handleHomeArm = async () => {
    setTestM1(2500);
    setTestM2(2500);
    setTestM3(2500);
    appendTerminal('tx', 'M1 2500 | M2 2500 | M3 2500 | HOME (2500µs / +90°)');
    if (isConnected) {
      await serialManager.homeArm(2500);
      addLog('Physical Arm: Sent Home commands (2500µs / +90°)', 'success');
    } else {
      addLog('Homed sliders to 2500µs (Connect USB to drive physical arm)', 'info');
    }
  };

  // Zero Arm (1500us / 0 deg)
  const handleZeroArm = async () => {
    setTestM1(1500);
    setTestM2(1500);
    setTestM3(1500);
    appendTerminal('tx', 'M1 1500 | M2 1500 | M3 1500 | ZERO (1500µs / 0°)');
    if (isConnected) {
      await serialManager.sendMotors(1500, 1500, 1500);
      addLog('Physical Arm: Sent Zero commands (1500µs / 0°)', 'info');
    } else {
      addLog('Set sliders to 1500µs (0° Zero)', 'info');
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

  // Send custom raw command & parse to sync sliders
  const handleSendCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customCmd.trim()) return;
    const cmd = customCmd.trim();
    appendTerminal('tx', cmd);
    parseAndSyncMotors(cmd);
    if (isConnected) {
      await serialManager.sendCommand(cmd);
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
              Direct Web Serial controller: 1500µs (0°) to 2500µs (+90° Home), integrated Word Sequencer & Live Terminal
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

                {/* Quick Actions (Home 2500us, Zero 1500us, E-Stop) */}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={handleHomeArm}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-sky-300 border border-sky-500/30 rounded-lg flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition cursor-pointer"
                    title="Send Home pulse 2500µs (+90°) to all motors"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-sky-400" />
                    <span>Home Arm</span>
                    <span className="text-[9px] text-sky-400/80 font-mono">2500µs (+90°)</span>
                  </button>

                  <button
                    onClick={handleZeroArm}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 rounded-lg flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition cursor-pointer"
                    title="Send Zero position 1500µs (0°) to all motors"
                  >
                    <RotateCw className="w-3.5 h-3.5 text-amber-400" />
                    <span>Zero Arm</span>
                    <span className="text-[9px] text-amber-400/80 font-mono">1500µs (0°)</span>
                  </button>

                  <button
                    onClick={handleEmergencyStop}
                    className="p-2 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-500/40 rounded-lg flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition cursor-pointer"
                    title="Detaches all servos immediately"
                  >
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                    <span>E-STOP</span>
                    <span className="text-[9px] text-rose-400/80 font-mono">Detach</span>
                  </button>
                </div>

                {/* Manual Servo Pulse Sliders: 1500us (0 deg) to 2500us (+90 deg) */}
                <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-200">Manual Servo Pulse Testing</span>
                    <span className="text-[10px] text-slate-400 font-mono">[1500µs (0°) &rarr; 2500µs (+90°)]</span>
                  </div>

                  {/* Motor 1: Shoulder Elevation (Flipped: M1 is Shoulder in real life) */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-emerald-300 font-medium">M1 (Shoulder θ₁)</span>
                      <span className="font-mono text-slate-200 font-bold">
                        {testM1} µs ({(testM1 / 1000).toFixed(2)} ms) &bull; {(((testM1 - 1500) * 90) / 1000).toFixed(1)}°
                      </span>
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
                        2500µs (+90° Home)
                      </button>
                    </div>
                  </div>

                  {/* Motor 2: Base Yaw (Flipped: M2 is Base in real life) */}
                  <div className="space-y-1 pt-2 border-t border-slate-900">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-amber-300 font-medium">M2 (Base Yaw θ₀)</span>
                      <span className="font-mono text-slate-200 font-bold">
                        {testM2} µs ({(testM2 / 1000).toFixed(2)} ms) &bull; {(((testM2 - 1500) * 90) / 1000).toFixed(1)}°
                      </span>
                    </div>
                    <input
                      type="range"
                      min="1500"
                      max="2500"
                      step="5"
                      value={testM2}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setTestM2(v);
                        handleSendSingleMotor(2, v);
                      }}
                      className="w-full accent-amber-400 h-1.5 bg-slate-800 rounded cursor-pointer"
                    />
                    <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                      <button onClick={() => { setTestM2(1500); handleSendSingleMotor(2, 1500); }} className="hover:text-amber-300 cursor-pointer">
                        1500µs (0° Zero)
                      </button>
                      <button onClick={() => { setTestM2(2000); handleSendSingleMotor(2, 2000); }} className="hover:text-amber-300 cursor-pointer">
                        2000µs (+45° Mid)
                      </button>
                      <button onClick={() => { setTestM2(2500); handleSendSingleMotor(2, 2500); }} className="hover:text-amber-300 cursor-pointer">
                        2500µs (+90° Home)
                      </button>
                    </div>
                  </div>

                  {/* Motor 3: Elbow Elevation */}
                  <div className="space-y-1 pt-2 border-t border-slate-900">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-sky-300 font-medium">M3 (Elbow θ₂)</span>
                      <span className="font-mono text-slate-200 font-bold">
                        {testM3} µs ({(testM3 / 1000).toFixed(2)} ms) &bull; {(((testM3 - 1500) * 90) / 1000).toFixed(1)}°
                      </span>
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
                        2500µs (+90° Home)
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
                  Calibrated for 1500µs (0°) to 2500µs (+90° Home). Supports M1/M2/M3, POS, HOME, and STOP.
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
                  <li>Zero: 1500 µs (0°)</li>
                  <li>Home: 2500 µs (+90°)</li>
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
const int ZERO_US = 1500; // 0 deg position (1.5ms)
const int HOME_US = 2500; // Home position (+90 deg, 2.5ms)

void setup() {
  Serial.begin(115200);
  servo1.attach(PIN_M1, 1000, 2600);
  servo2.attach(PIN_M2, 1000, 2600);
  servo3.attach(PIN_M3, 1000, 2600);
  setHome();
}

void setHome() {
  servo1.writeMicroseconds(HOME_US);
  servo2.writeMicroseconds(HOME_US);
  servo3.writeMicroseconds(HOME_US);
  Serial.println("OK: Homed all motors to 2500us (+90 deg)");
}

void setZero() {
  servo1.writeMicroseconds(ZERO_US);
  servo2.writeMicroseconds(ZERO_US);
  servo3.writeMicroseconds(ZERO_US);
  Serial.println("OK: Zeroed all motors to 1500us (0 deg)");
}

void loop() {
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\\n');
    cmd.trim();
    if (cmd == "HOME") setHome();
    else if (cmd == "ZERO") setZero();
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
