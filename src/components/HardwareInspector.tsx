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
} from 'lucide-react';
import { serialManager } from '../utils/serial';
import { HOME_MOTOR_PULSE_US } from '../utils/kinematics';

interface HardwareInspectorProps {
  currentM1: number;
  currentM2: number;
  currentM3: number;
  isMirrorEnabled: boolean;
  onToggleMirror: (enabled: boolean) => void;
  onClose?: () => void;
  addLog: (msg: string, level?: any) => void;
}

export const HardwareInspector: React.FC<HardwareInspectorProps> = ({
  currentM1,
  currentM2,
  currentM3,
  isMirrorEnabled,
  onToggleMirror,
  onClose,
  addLog,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'control' | 'firmware' | 'matlab' | 'python' | 'wiring'>('control');
  const [isConnected, setIsConnected] = useState(serialManager.getIsConnected());
  const [baudRate, setBaudRate] = useState<number>(115200);
  const [isConnecting, setIsConnecting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string>('Ready to connect via Web Serial');
  const [terminalLogs, setTerminalLogs] = useState<{ id: string; type: 'tx' | 'rx' | 'sys'; text: string; time: string }[]>([]);
  const [customCmd, setCustomCmd] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Manual test pulse values
  const [testM1, setTestM1] = useState(HOME_MOTOR_PULSE_US);
  const [testM2, setTestM2] = useState(HOME_MOTOR_PULSE_US);
  const [testM3, setTestM3] = useState(HOME_MOTOR_PULSE_US);

  const terminalEndRef = useRef<HTMLDivElement | null>(null);

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
      // Immediately send Home posture (1.5ms all motors)
      await serialManager.homeArm();
      appendTerminal('tx', 'HOME');
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

  // Home Arm
  const handleHomeArm = async () => {
    setTestM1(HOME_MOTOR_PULSE_US);
    setTestM2(HOME_MOTOR_PULSE_US);
    setTestM3(HOME_MOTOR_PULSE_US);
    appendTerminal('tx', 'HOME');
    if (isConnected) {
      await serialManager.homeArm();
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

  // Send custom raw command
  const handleSendCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customCmd.trim()) return;
    const cmd = customCmd.trim();
    appendTerminal('tx', cmd);
    if (isConnected) {
      await serialManager.sendCommand(cmd);
    }
    setCustomCmd('');
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
              Control the physical 3-DOF RASTICrane arm directly via Web Serial, MATLAB, or Python
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isConnected ? (
            <button
              onClick={handleDisconnect}
              className="px-3 py-1.5 bg-rose-600/80 hover:bg-rose-500 text-white rounded text-xs font-medium flex items-center gap-1.5 transition"
            >
              <Power className="w-3.5 h-3.5" />
              Disconnect
            </button>
          ) : (
            <button
              onClick={handleConnect}
              disabled={!isWebSerialSupported || isConnecting}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded text-xs font-semibold flex items-center gap-1.5 transition shadow-sm"
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              {isConnecting ? 'Selecting Port...' : 'Connect Arm (USB Serial)'}
            </button>
          )}

          {onClose && (
            <button
              onClick={onClose}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition"
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
          className={`px-3 py-2 border-b-2 font-medium flex items-center gap-1.5 transition ${
            activeSubTab === 'control'
              ? 'border-emerald-400 text-emerald-300 bg-slate-900/60'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          Direct USB Control & Jog
        </button>
        <button
          onClick={() => setActiveSubTab('firmware')}
          className={`px-3 py-2 border-b-2 font-medium flex items-center gap-1.5 transition ${
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
          className={`px-3 py-2 border-b-2 font-medium flex items-center gap-1.5 transition ${
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
          className={`px-3 py-2 border-b-2 font-medium flex items-center gap-1.5 transition ${
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
          className={`px-3 py-2 border-b-2 font-medium flex items-center gap-1.5 transition ${
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left: Quick Actions & Live Mirroring */}
            <div className="space-y-3">
              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg">
                <div className="flex items-center justify-between mb-2">
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
                  When enabled, all motion in the simulation (Word Sequencer, Manual Jog, Home Arm) is continuously transmitted over USB to the physical servos in real time.
                </p>
              </div>

              {/* Quick Actions (Home & E-Stop) */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleHomeArm}
                  className="p-2.5 bg-slate-800 hover:bg-slate-700 text-sky-300 border border-sky-500/30 rounded-lg flex items-center justify-center gap-2 text-xs font-semibold transition"
                >
                  <RotateCcw className="w-4 h-4 text-sky-400" />
                  <span>Home Arm (1.5ms All)</span>
                </button>
                <button
                  onClick={handleEmergencyStop}
                  className="p-2.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-500/40 rounded-lg flex items-center justify-center gap-2 text-xs font-semibold transition"
                >
                  <ShieldAlert className="w-4 h-4 text-rose-400" />
                  <span>E-STOP / Detach</span>
                </button>
              </div>

              {/* Manual Servo Pulse Sliders (Microseconds) */}
              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200">Manual Servo Pulse Testing</span>
                  <span className="text-[10px] text-slate-400 font-mono">[1300µs – 1700µs]</span>
                </div>

                {/* Motor 1: Base Yaw */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-amber-300 font-medium">M1 (Base Yaw θ₀)</span>
                    <span className="font-mono text-slate-200 font-bold">{testM1} µs ({(testM1 / 1000).toFixed(2)} ms)</span>
                  </div>
                  <input
                    type="range"
                    min="1300"
                    max="1700"
                    step="5"
                    value={testM1}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setTestM1(v);
                      handleSendSingleMotor(1, v);
                    }}
                    className="w-full accent-amber-400 h-1.5 bg-slate-800 rounded cursor-pointer"
                  />
                  <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                    <button onClick={() => { setTestM1(1300); handleSendSingleMotor(1, 1300); }} className="hover:text-amber-300">1300µs (-45°)</button>
                    <button onClick={() => { setTestM1(1500); handleSendSingleMotor(1, 1500); }} className="hover:text-amber-300">1500µs (0° Home)</button>
                    <button onClick={() => { setTestM1(1700); handleSendSingleMotor(1, 1700); }} className="hover:text-amber-300">1700µs (+45°)</button>
                  </div>
                </div>

                {/* Motor 2: Shoulder Elevation */}
                <div className="space-y-1 pt-2 border-t border-slate-900">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-emerald-300 font-medium">M2 (Shoulder θ₁)</span>
                    <span className="font-mono text-slate-200 font-bold">{testM2} µs ({(testM2 / 1000).toFixed(2)} ms)</span>
                  </div>
                  <input
                    type="range"
                    min="1300"
                    max="1700"
                    step="5"
                    value={testM2}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setTestM2(v);
                      handleSendSingleMotor(2, v);
                    }}
                    className="w-full accent-emerald-400 h-1.5 bg-slate-800 rounded cursor-pointer"
                  />
                  <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                    <button onClick={() => { setTestM2(1300); handleSendSingleMotor(2, 1300); }} className="hover:text-emerald-300">1300µs (-45°)</button>
                    <button onClick={() => { setTestM2(1500); handleSendSingleMotor(2, 1500); }} className="hover:text-emerald-300">1500µs (0° Home)</button>
                    <button onClick={() => { setTestM2(1700); handleSendSingleMotor(2, 1700); }} className="hover:text-emerald-300">1700µs (+45°)</button>
                  </div>
                </div>

                {/* Motor 3: Elbow Elevation */}
                <div className="space-y-1 pt-2 border-t border-slate-900">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-sky-300 font-medium">M3 (Elbow θ₂)</span>
                    <span className="font-mono text-slate-200 font-bold">{testM3} µs ({(testM3 / 1000).toFixed(2)} ms)</span>
                  </div>
                  <input
                    type="range"
                    min="1300"
                    max="1700"
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
                    <button onClick={() => { setTestM3(1300); handleSendSingleMotor(3, 1300); }} className="hover:text-sky-300">1300µs (-45°)</button>
                    <button onClick={() => { setTestM3(1500); handleSendSingleMotor(3, 1500); }} className="hover:text-sky-300">1500µs (0° Home)</button>
                    <button onClick={() => { setTestM3(1700); handleSendSingleMotor(3, 1700); }} className="hover:text-sky-300">1700µs (+45°)</button>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Live Serial Terminal */}
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex flex-col h-80">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs">
                <span className="font-semibold text-slate-200 flex items-center gap-1.5 font-mono">
                  <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                  USB Serial Monitor (115200 baud)
                </span>
                <button
                  onClick={() => setTerminalLogs([])}
                  className="text-[10px] text-slate-500 hover:text-slate-300"
                >
                  Clear Terminal
                </button>
              </div>

              {/* Logs */}
              <div className="flex-1 overflow-y-auto py-2 font-mono text-[11px] space-y-1 select-text">
                {terminalLogs.length === 0 ? (
                  <div className="text-slate-600 italic py-4 text-center">
                    No serial traffic yet. Click "Connect Arm" above or test commands.
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

              {/* Manual Command Input */}
              <form onSubmit={handleSendCustom} className="pt-2 border-t border-slate-800 flex gap-1.5">
                <input
                  type="text"
                  value={customCmd}
                  onChange={(e) => setCustomCmd(e.target.value)}
                  placeholder="Send command (e.g. HOME, M1 1500, POS 1500 1500 1500)"
                  className="flex-1 px-2.5 py-1 bg-slate-900 border border-slate-700 rounded text-slate-100 font-mono text-xs focus:outline-hidden focus:border-emerald-400"
                />
                <button
                  type="submit"
                  disabled={!customCmd.trim()}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs flex items-center gap-1 transition"
                >
                  <Send className="w-3 h-3" />
                  <span>Send</span>
                </button>
              </form>
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
                  Upload this Arduino/ESP32 sketch to your board using Arduino IDE or VS Code PlatformIO.
                </p>
              </div>
              <button
                onClick={() => copyToClipboard(FIRMWARE_SOURCE, 'firmware')}
                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs font-medium flex items-center gap-1.5 transition"
              >
                {copiedCode === 'firmware' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCode === 'firmware' ? 'Copied!' : 'Copy Code'}</span>
              </button>
            </div>

            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-[11px] text-slate-300 space-y-1.5">
              <p className="font-semibold text-slate-200">How to Flash in 3 Steps:</p>
              <ol className="list-decimal list-inside space-y-1 text-slate-400">
                <li>Install the <strong>Arduino IDE</strong> from <a href="https://www.arduino.cc" target="_blank" rel="noreferrer" className="text-sky-400 underline">arduino.cc</a>.</li>
                <li>If using ESP32: install the <strong>ESP32 Board Package</strong> and the <strong>ESP32Servo</strong> library (Tools &rarr; Manage Libraries).</li>
                <li>Connect your board via USB, select your board and COM port, then click <strong>Upload</strong>.</li>
              </ol>
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
                Correct wiring is essential so servos have enough current to move smoothly without restarting the ESP32/Arduino.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
                <div className="font-bold text-amber-400 text-xs mb-1">Motor 1 (Base Yaw)</div>
                <ul className="text-[11px] space-y-1 text-slate-300 font-mono">
                  <li>Signal: <span className="text-amber-300 font-bold">GPIO 18</span> (Pin 9 Uno)</li>
                  <li>Power: External 5V/6V (+)</li>
                  <li>Ground: Common GND (-)</li>
                  <li>Neutral: 1500 µs (1.5 ms)</li>
                </ul>
              </div>

              <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
                <div className="font-bold text-emerald-400 text-xs mb-1">Motor 2 (Shoulder)</div>
                <ul className="text-[11px] space-y-1 text-slate-300 font-mono">
                  <li>Signal: <span className="text-emerald-300 font-bold">GPIO 19</span> (Pin 10 Uno)</li>
                  <li>Power: External 5V/6V (+)</li>
                  <li>Ground: Common GND (-)</li>
                  <li>Neutral: 1500 µs (1.5 ms)</li>
                </ul>
              </div>

              <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
                <div className="font-bold text-sky-400 text-xs mb-1">Motor 3 (Elbow)</div>
                <ul className="text-[11px] space-y-1 text-slate-300 font-mono">
                  <li>Signal: <span className="text-sky-300 font-bold">GPIO 20</span> (Pin 11 Uno)</li>
                  <li>Power: External 5V/6V (+)</li>
                  <li>Ground: Common GND (-)</li>
                  <li>Neutral: 1500 µs (1.5 ms)</li>
                </ul>
              </div>
            </div>

            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-200 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span>Crucial Power Tip: Common Ground Required</span>
              </div>
              <p className="text-[11px] text-amber-300/90 leading-relaxed">
                Do NOT power all 3 servos directly from the 5V pin of your ESP32 or Arduino USB port! Servos can draw over 1.5 Amps when moving under load, which will brown out the microcontroller. Use an external 5V/6V 2A–3A DC power supply for servo red/black wires, and <strong>connect the ground (-) of the external power supply to the GND pin of the microcontroller</strong>.
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
                  Connects to ESP32 over Serial, detects AprilTags via webcam, and solves 3-DOF analytical IK.
                </p>
              </div>
              <button
                onClick={() => copyToClipboard(MATLAB_SOURCE, 'matlab')}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-medium flex items-center gap-1.5 transition"
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
                className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-medium flex items-center gap-1.5 transition"
              >
                {copiedCode === 'python' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCode === 'python' ? 'Copied!' : 'Copy Python'}</span>
              </button>
            </div>

            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-[11px] text-slate-300 space-y-1 font-mono">
              <p className="text-slate-400 font-sans">Run in terminal:</p>
              <p className="text-emerald-400">pip install pyserial</p>
              <p className="text-emerald-400">python scripts/arm_controller.py</p>
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
  #define PIN_M1 18 // Base Yaw
  #define PIN_M2 19 // Shoulder
  #define PIN_M3 20 // Elbow
#else
  #include <Servo.h>
  #define PIN_M1 9  // Base Yaw
  #define PIN_M2 10 // Shoulder
  #define PIN_M3 11 // Elbow
#endif

Servo servo1, servo2, servo3;
const int HOME_US = 1500; // 1.5ms neutral home

void setup() {
  Serial.begin(115200);
  servo1.attach(PIN_M1, 1100, 1900);
  servo2.attach(PIN_M2, 1100, 1900);
  servo3.attach(PIN_M3, 1100, 1900);
  setHome();
}

void setHome() {
  servo1.writeMicroseconds(HOME_US);
  servo2.writeMicroseconds(HOME_US);
  servo3.writeMicroseconds(HOME_US);
  Serial.println("OK: Homed all motors to 1.5ms (1500us)");
}

void loop() {
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\\n');
    cmd.trim();
    if (cmd == "HOME") setHome();
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

% Home all motors (1.5ms)
writeline(s, "HOME");

% Example: Move to specific position
writeline(s, "POS 1500 1480 1520");`;

const PYTHON_SOURCE = `import serial, time

ser = serial.Serial('COM3', 115200, timeout=1)
time.sleep(2) # Settle connection

# Home all motors (1.5ms)
ser.write(b"HOME\\n")
print(ser.readline().decode().strip())

# Send motor pulses: POS <m1> <m2> <m3>
ser.write(b"POS 1500 1480 1520\\n")
print(ser.readline().decode().strip())

ser.close()`;
