import React, { useState } from 'react';
import { LogEntry, CyclePhase } from '../types';
import { ALPHABET_26 } from '../utils/kinematics';
import {
  Play,
  RotateCcw,
  Home,
  Sparkles,
  Trash2,
  Usb,
} from 'lucide-react';

interface ControlPanelProps {
  selectedLetter: string;
  onSelectLetter: (letter: string) => void;
  onRunCycle: () => void;
  onHomeArm: () => void;
  onResetPositions: () => void;
  onClearPaper: () => void;
  isAnimating: boolean;
  cyclePhase: CyclePhase;
  showAprilTags: boolean;
  onToggleAprilTags: (val: boolean) => void;
  showReachEnvelope: boolean;
  onToggleReachEnvelope: (val: boolean) => void;
  showTrajectoryTrail: boolean;
  onToggleTrajectoryTrail: (val: boolean) => void;
  logs: LogEntry[];
  onClearLogs: () => void;
  onRunWordSequence: (word: string) => void;
  manualX: number;
  manualY: number;
  onJogCartesian: (x: number, y: number) => void;
  manualThetaDeg: number;
  manualReachMm: number;
  manualShoulderDeg?: number;
  manualElbowDeg?: number;
  onJogPolar: (thetaDeg: number, reachMm: number) => void;
  onJogShoulder?: (shoulderDeg: number) => void;
  onOpenHardware?: () => void;
  isSerialConnected?: boolean;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  selectedLetter,
  onSelectLetter,
  onRunCycle,
  onHomeArm,
  onResetPositions,
  onClearPaper,
  isAnimating,
  cyclePhase,
  showAprilTags,
  onToggleAprilTags,
  showReachEnvelope,
  onToggleReachEnvelope,
  showTrajectoryTrail,
  onToggleTrajectoryTrail,
  logs,
  onClearLogs,
  onRunWordSequence,
  manualX,
  manualY,
  onJogCartesian,
  manualThetaDeg,
  manualReachMm,
  manualShoulderDeg = 0,
  manualElbowDeg = 0,
  onJogPolar,
  onJogShoulder,
  onOpenHardware,
  isSerialConnected = false,
}) => {
  const [wordInput, setWordInput] = useState('ROBOT');
  const [activeTab, setActiveTab] = useState<'word' | 'manual'>('word');

  const handleWordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!wordInput.trim() || isAnimating) return;
    onRunWordSequence(wordInput.trim().toUpperCase());
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* 1. Mode Tabs (Word Sequencer & Manual Jog) */}
      <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800">
        <button
          onClick={() => setActiveTab('word')}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition flex items-center justify-center gap-1.5 ${
            activeTab === 'word'
              ? 'bg-slate-800 text-purple-400 font-semibold shadow-xs'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Word Sequencer</span>
        </button>
        <button
          onClick={() => setActiveTab('manual')}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition flex items-center justify-center gap-1.5 ${
            activeTab === 'manual'
              ? 'bg-slate-800 text-emerald-400 font-semibold shadow-xs'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>Manual Jog</span>
        </button>
      </div>

      {/* 2. Execution Panel according to Active Tab */}
      <div className="p-3 bg-slate-900/90 rounded-lg border border-slate-800 text-xs flex flex-col gap-2.5">
        {activeTab === 'word' && (
          <form onSubmit={handleWordSubmit} className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-300">Word Sequence Controller:</span>
              <span className="text-[11px] text-purple-400 font-mono">4-Step Cycle / Letter</span>
            </div>

            <div>
              <label className="text-[11px] text-slate-400 block mb-1">
                Enter Word or Acronym to Stamp (A–Z):
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={wordInput}
                  onChange={(e) => setWordInput(e.target.value.toUpperCase())}
                  placeholder="e.g. ROBOT, ME416, STANFORD"
                  disabled={isAnimating}
                  className="flex-1 px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-100 font-mono text-xs focus:outline-hidden focus:border-purple-400 uppercase tracking-wider"
                />
                <button
                  type="submit"
                  disabled={isAnimating || !wordInput.trim()}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-medium rounded border border-purple-400/40 flex items-center gap-1.5 transition shadow-sm"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{isAnimating ? 'Running...' : 'Execute Sequence'}</span>
                </button>
              </div>
            </div>

            {/* Home Arm & Actions */}
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800">
              <button
                type="button"
                disabled={isAnimating}
                onClick={onHomeArm}
                className="flex items-center justify-center gap-1.5 py-1.5 px-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-sky-300 font-medium rounded border border-sky-500/30 transition text-[11px]"
                title="Home Arm: M1 1500µs, M2 2000µs, M3 1500µs"
              >
                <RotateCcw className="w-3.5 h-3.5 text-sky-400" />
                <span>Home Arm</span>
              </button>

              <button
                type="button"
                onClick={onClearPaper}
                className="flex items-center justify-center gap-1.5 py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded border border-slate-700 transition text-[11px]"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                <span>Clear Paper</span>
              </button>

              {onOpenHardware && (
                <button
                  type="button"
                  onClick={onOpenHardware}
                  className={`col-span-2 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded border transition text-[11px] font-medium ${
                    isSerialConnected
                      ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/50'
                      : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <Usb className="w-3.5 h-3.5 text-emerald-400" />
                  <span>
                    {isSerialConnected
                      ? 'Arm Connected (COM3 / USB) — Settings'
                      : 'Connect Real Arm (USB Serial) & Guide'}
                  </span>
                </button>
              )}
            </div>
          </form>
        )}

        {activeTab === 'manual' && (
          <div className="flex flex-col gap-3">
            {/* 1. Joint Jogging: Base Yaw, Shoulder Rotation & Elbow Extension */}
            <div className="p-2.5 bg-slate-950/80 rounded border border-slate-800 flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-emerald-400 text-[11px]">
                  Joint Jogging (Base, Shoulder, Elbow):
                </span>
                <span className="text-[10px] text-slate-400 font-mono">3-DOF Polar</span>
              </div>

              {/* 1. Rotate Base (ϕ / θ₀) - Center 0° is 2000µs (+/-45°) */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-300 font-medium flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                    Rotate Base (ϕ / θ₀ / M2)
                  </span>
                  <span className="font-mono text-amber-300 font-semibold">
                    {manualThetaDeg.toFixed(1)}° &bull;{' '}
                    <span className="text-purple-300 bg-purple-950/60 px-1 py-0.2 rounded text-[10px]">
                      {Math.round(Math.max(1500, Math.min(2500, 2000 + (manualThetaDeg / 45) * 500)))} µs
                    </span>
                  </span>
                </div>
                <input
                  type="range"
                  min="-45"
                  max="45"
                  step="1"
                  value={Math.max(-45, Math.min(45, manualThetaDeg))}
                  onChange={(e) => onJogPolar(Number(e.target.value), manualReachMm)}
                  className="w-full accent-amber-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                  <span>-45° (1500µs Left)</span>
                  <span>0° (2000µs Center)</span>
                  <span>+45° (2500µs Right)</span>
                </div>
              </div>

              {/* 2. Rotate Shoulder (θ₁ / ssh / M1) - Range 0° to 90° (1500µs to 2500µs) */}
              <div className="space-y-1 pt-1 border-t border-slate-900">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-300 font-medium flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                    Rotate Shoulder (θ₁ / M1)
                  </span>
                  <span className="font-mono text-emerald-300 font-semibold">
                    {manualShoulderDeg.toFixed(1)}° &bull;{' '}
                    <span className="text-purple-300 bg-purple-950/60 px-1 py-0.2 rounded text-[10px]">
                      {Math.round(Math.max(1500, Math.min(2500, 1500 + (manualShoulderDeg / 90) * 1000)))} µs
                    </span>
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="90"
                  step="1"
                  value={Math.max(0, Math.min(90, manualShoulderDeg))}
                  onChange={(e) => onJogShoulder?.(Number(e.target.value))}
                  className="w-full accent-emerald-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                  <span>0° (1500µs Horizontal)</span>
                  <span>45° (2000µs Mid)</span>
                  <span>90° (2500µs Up)</span>
                </div>
              </div>

              {/* 3. Extend at Elbow Joint (Reach ρ & θ₂ / sel) */}
              <div className="space-y-1 pt-1 border-t border-slate-900">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-300 font-medium flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-sky-400 inline-block" />
                    Extend Elbow (Reach ρ & θ₂ / M3)
                  </span>
                  <span className="font-mono text-sky-300 font-semibold">
                    {manualReachMm.toFixed(1)} mm &bull;{' '}
                    <span className="text-purple-300 bg-purple-950/60 px-1 py-0.2 rounded text-[10px]">
                      {Math.round(Math.max(1500, Math.min(2500, 1500 + (manualElbowDeg / 90) * 1000)))} µs
                    </span>
                  </span>
                </div>
                <input
                  type="range"
                  min="55"
                  max="240"
                  step="1"
                  value={manualReachMm}
                  onChange={(e) => onJogPolar(manualThetaDeg, Number(e.target.value))}
                  className="w-full accent-sky-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                  <span>55mm (Retracted)</span>
                  <span>115mm (Inner)</span>
                  <span>155mm (Outer)</span>
                  <span>240mm (Max)</span>
                </div>
              </div>

              {/* Quick Stepper Buttons for Base, Shoulder, Elbow */}
              <div className="grid grid-cols-6 gap-1 pt-1 border-t border-slate-900">
                <button
                  type="button"
                  onClick={() => onJogPolar(Math.max(-45, manualThetaDeg - 5), manualReachMm)}
                  className="px-1 py-1 bg-slate-900 hover:bg-slate-800 active:bg-slate-700 text-amber-300 border border-slate-700 rounded text-[9px] font-mono transition"
                  title="Rotate Base CCW -5°"
                >
                  ↺ -5° Base
                </button>
                <button
                  type="button"
                  onClick={() => onJogPolar(Math.min(45, manualThetaDeg + 5), manualReachMm)}
                  className="px-1 py-1 bg-slate-900 hover:bg-slate-800 active:bg-slate-700 text-amber-300 border border-slate-700 rounded text-[9px] font-mono transition"
                  title="Rotate Base CW +5°"
                >
                  ↻ +5° Base
                </button>
                <button
                  type="button"
                  onClick={() => onJogShoulder?.(Math.max(0, manualShoulderDeg - 5))}
                  className="px-1 py-1 bg-slate-900 hover:bg-slate-800 active:bg-slate-700 text-emerald-300 border border-slate-700 rounded text-[9px] font-mono transition"
                  title="Lower Shoulder -5°"
                >
                  ⇣ -5° Shldr
                </button>
                <button
                  type="button"
                  onClick={() => onJogShoulder?.(Math.min(90, manualShoulderDeg + 5))}
                  className="px-1 py-1 bg-slate-900 hover:bg-slate-800 active:bg-slate-700 text-emerald-300 border border-slate-700 rounded text-[9px] font-mono transition"
                  title="Raise Shoulder +5°"
                >
                  ⇡ +5° Shldr
                </button>
                <button
                  type="button"
                  onClick={() => onJogPolar(manualThetaDeg, Math.max(55, manualReachMm - 5))}
                  className="px-1 py-1 bg-slate-900 hover:bg-slate-800 active:bg-slate-700 text-sky-300 border border-slate-700 rounded text-[9px] font-mono transition"
                  title="Retract Elbow -5mm"
                >
                  ⇥ -5mm
                </button>
                <button
                  type="button"
                  onClick={() => onJogPolar(manualThetaDeg, Math.min(240, manualReachMm + 5))}
                  className="px-1 py-1 bg-slate-900 hover:bg-slate-800 active:bg-slate-700 text-sky-300 border border-slate-700 rounded text-[9px] font-mono transition"
                  title="Extend Elbow +5mm"
                >
                  ⇤ +5mm
                </button>
              </div>

              {/* Home Arm Button in Manual Jog */}
              <div className="pt-1 border-t border-slate-900">
                <button
                  type="button"
                  disabled={isAnimating}
                  onClick={onHomeArm}
                  className="w-full flex items-center justify-center gap-1.5 py-1 px-2 bg-slate-900 hover:bg-slate-800 text-sky-300 border border-sky-500/30 rounded text-[10px] font-mono transition cursor-pointer"
                  title="Home Arm: M1 1500µs, M2 2000µs, M3 1500µs"
                >
                  <RotateCcw className="w-3 h-3 text-sky-400" />
                  <span>Home Arm (M1:1500 M2:2000 M3:1500)</span>
                </button>
              </div>
            </div>

            {/* 2. Direct Cartesian Coordinates Jogging (U, V) */}
            <div className="p-2 bg-slate-950/50 rounded border border-slate-800/80 flex flex-col gap-2">
              <span className="text-[10px] text-slate-400 font-mono">
                Cartesian Coordinates [U, V] in mm:
              </span>
              <div className="grid grid-cols-2 gap-2 font-mono">
                <div>
                  <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                    <span>U (Lateral)</span>
                    <span className="text-sky-300 font-semibold">{manualX.toFixed(0)} mm</span>
                  </div>
                  <input
                    type="range"
                    min="-250"
                    max="250"
                    value={manualX}
                    onChange={(e) => onJogCartesian(Number(e.target.value), manualY)}
                    className="w-full accent-sky-400 h-1 bg-slate-800 rounded"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                    <span>V (Forward)</span>
                    <span className="text-sky-300 font-semibold">{manualY.toFixed(0)} mm</span>
                  </div>
                  <input
                    type="range"
                    min="-280"
                    max="100"
                    value={manualY}
                    onChange={(e) => onJogCartesian(manualX, Number(e.target.value))}
                    className="w-full accent-sky-400 h-1 bg-slate-800 rounded"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. Workspace Layout & Visual Toggles */}
      <div className="p-3 bg-slate-900/90 rounded-lg border border-slate-800 text-xs flex flex-col gap-2">
        <div className="flex items-center justify-between text-slate-300 font-semibold border-b border-slate-800 pb-1.5">
          <span>Layout & Display Settings</span>
        </div>

        {/* Toggles */}
        <div className="flex flex-col gap-1.5 pt-1 text-[11px]">
          <label className="flex items-center justify-between text-slate-300 cursor-pointer">
            <span>AprilTag Fiducials on Base Plates</span>
            <input
              type="checkbox"
              checked={showAprilTags}
              onChange={(e) => onToggleAprilTags(e.target.checked)}
              className="accent-purple-500 rounded"
            />
          </label>

          <label className="flex items-center justify-between text-slate-300 cursor-pointer">
            <span>Show Workspace Reach Boundary</span>
            <input
              type="checkbox"
              checked={showReachEnvelope}
              onChange={(e) => onToggleReachEnvelope(e.target.checked)}
              className="accent-purple-500 rounded"
            />
          </label>

          <label className="flex items-center justify-between text-slate-300 cursor-pointer">
            <span>End-Effector Trajectory Path Trail</span>
            <input
              type="checkbox"
              checked={showTrajectoryTrail}
              onChange={(e) => onToggleTrajectoryTrail(e.target.checked)}
              className="accent-purple-500 rounded"
            />
          </label>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800">
          <button
            onClick={onResetPositions}
            className="flex items-center justify-center gap-1.5 py-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 text-[11px] transition"
          >
            <RotateCcw className="w-3 h-3 text-amber-400" />
            <span>Reset Layout</span>
          </button>

          <button
            onClick={onClearPaper}
            className="flex items-center justify-center gap-1.5 py-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 text-[11px] transition"
          >
            <Trash2 className="w-3 h-3 text-rose-400" />
            <span>Clear Paper</span>
          </button>
        </div>
      </div>

      {/* 4. Kinematic & Action Log Stream */}
      <div className="p-3 bg-slate-900/90 rounded-lg border border-slate-800 text-xs flex-1 flex flex-col min-h-[160px]">
        <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-800">
          <span className="font-semibold text-slate-300 font-mono text-[11px]">
            Kinematic Execution Log
          </span>
          <button
            onClick={onClearLogs}
            className="text-[10px] text-slate-500 hover:text-slate-300 font-mono"
          >
            Clear
          </button>
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-950 p-2 rounded border border-slate-800/80 font-mono text-[10px] space-y-1">
          {logs.map((log) => {
            let textColor = 'text-sky-300';
            if (log.level === 'warn') textColor = 'text-amber-400';
            if (log.level === 'error') textColor = 'text-rose-400';
            if (log.level === 'success') textColor = 'text-emerald-400';
            return (
              <div key={log.id} className="leading-tight">
                <span className="text-slate-500">[{log.timestamp}]</span>{' '}
                <span className={textColor}>{log.message}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
