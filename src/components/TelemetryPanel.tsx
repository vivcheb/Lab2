import React from 'react';
import { CyclePhase, JointAngles3DOF, Position3D } from '../types';
import { MATLAB_L1, MATLAB_L2, MATLAB_L3, radToDeg } from '../utils/kinematics';
import { Activity, Compass, Cpu, Zap, Radio } from 'lucide-react';

interface TelemetryPanelProps {
  currentPos3D: Position3D;
  angles3DOF: JointAngles3DOF;
  status: string;
  phase: CyclePhase;
  activeLetter: string | null;
  holdingLetter: string | null;
  isHovering: boolean;
  theme?: 'dark' | 'light';
}

export const TelemetryPanel: React.FC<TelemetryPanelProps> = ({
  currentPos3D,
  angles3DOF,
  status,
  phase,
  activeLetter,
  holdingLetter,
  isHovering,
  theme = 'dark',
}) => {
  const isDark = theme !== 'light';

  const getStatusColor = () => {
    if (phase === 'STAMP_PAPER') return isDark ? 'text-rose-400 border-rose-500/40 bg-rose-950/30' : 'text-rose-700 border-rose-300 bg-rose-50';
    if (phase === 'DIP_INK') return isDark ? 'text-sky-400 border-sky-500/40 bg-sky-950/30' : 'text-sky-700 border-sky-300 bg-sky-50';
    if (phase === 'WIPE_OUTWARD') return isDark ? 'text-purple-400 border-purple-500/40 bg-purple-950/30' : 'text-purple-700 border-purple-300 bg-purple-50';
    if (phase !== 'IDLE') return isDark ? 'text-amber-400 border-amber-500/40 bg-amber-950/30' : 'text-amber-700 border-amber-300 bg-amber-50';
    return isDark ? 'text-emerald-400 border-emerald-500/40 bg-emerald-950/30' : 'text-emerald-700 border-emerald-300 bg-emerald-50';
  };

  const rho = Math.hypot(currentPos3D.x, currentPos3D.y);
  const phiRad = Math.atan2(currentPos3D.y, currentPos3D.x);
  const phiDeg = radToDeg(phiRad);

  return (
    <div className={`flex flex-col gap-3 p-3.5 rounded-lg border text-xs ${
      isDark ? 'bg-slate-900/90 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800 shadow-xs'
    }`}>
      <div className={`flex items-center justify-between border-b pb-2 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
        <div className={`flex items-center gap-2 font-semibold ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>
          <Activity className="w-4 h-4 text-sky-500" />
          <span>RASTICrane Kinematics & Serial Servo Feed</span>
        </div>
        <div
          className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium border ${getStatusColor()}`}
        >
          {status}
        </div>
      </div>

      {/* World Frame [U, V, W]ᵀ & Polar Coordinates [rho, phi] (Handout Page 1) */}
      <div className="grid grid-cols-2 gap-2 font-mono">
        <div className={`p-2.5 rounded border ${isDark ? 'bg-slate-950 border-slate-800/80' : 'bg-slate-50 border-slate-200'}`}>
          <div className="text-[10px] text-slate-500 uppercase tracking-wide flex items-center justify-between">
            <span>World Frame [U, V, W]ᵀ</span>
            <span className="flex items-center gap-1 text-[10px] text-sky-400">
              <span className={`w-1.5 h-1.5 rounded-full ${isHovering ? 'bg-amber-400' : 'bg-emerald-400'}`} />
              {isHovering ? '+50mm Hover' : 'W=0 Table'}
            </span>
          </div>
          <div className="text-xs font-semibold text-sky-300 mt-1">
            U: {currentPos3D.x.toFixed(1)} mm
          </div>
          <div className="text-xs font-semibold text-sky-300">
            V: {currentPos3D.y.toFixed(1)} mm
          </div>
          <div className="text-xs font-semibold text-emerald-400">
            W: {currentPos3D.z.toFixed(1)} mm
          </div>
          <div className="text-[10px] text-amber-300 pt-1 border-t border-slate-800/80 mt-1">
            ρ: {rho.toFixed(1)} mm &bull; ϕ: {phiDeg.toFixed(1)}°
          </div>
        </div>

        <div className={`p-2.5 rounded border flex flex-col justify-between ${isDark ? 'bg-slate-950 border-slate-800/80' : 'bg-slate-50 border-slate-200'}`}>
          <div className="text-[10px] text-slate-500 uppercase tracking-wide flex items-center justify-between">
            <span>Magnetic Lego Head</span>
            <span className="text-purple-500 font-semibold text-[10px]">COM3 @ 115200</span>
          </div>
          <div className="mt-1 space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Target Stamp:</span>
              <span className={`font-semibold font-mono ${isDark ? 'text-yellow-400' : 'text-amber-600'}`}>
                {activeLetter ? `'${activeLetter}'` : 'None'}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Magnet Status:</span>
              <span
                className={`font-semibold font-mono ${
                  holdingLetter ? (isDark ? 'text-emerald-400' : 'text-emerald-600') : (isDark ? 'text-slate-500' : 'text-slate-400')
                }`}
              >
                {holdingLetter ? `Latched ('${holdingLetter}')` : 'Detached'}
              </span>
            </div>
          </div>
          <div className={`pt-1 border-t text-[10px] flex items-center gap-1 ${isDark ? 'border-slate-800/80 text-slate-400' : 'border-slate-200 text-slate-600'}`}>
            <Radio className={`w-3 h-3 animate-pulse ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
            <span className={`font-mono ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
              ssh (M1): {angles3DOF.m1_us} | s0 (M2): {angles3DOF.m2_us} | sel (M3): {angles3DOF.m3_us}
            </span>
          </div>
        </div>
      </div>

      {/* 3-DOF Joint Angles & Microsecond Servo PWM Pulse Widths (M1=Shoulder, M2=Base, M3=Elbow) */}
      <div className={`p-2.5 rounded border space-y-2 font-mono ${isDark ? 'bg-slate-950 border-slate-800/80' : 'bg-slate-50 border-slate-200'}`}>
        <div className={`flex items-center justify-between font-semibold text-[11px] pb-1 border-b ${isDark ? 'border-slate-800 text-slate-300' : 'border-slate-200 text-slate-700'}`}>
          <span className="flex items-center gap-1.5 text-purple-500">
            <Cpu className="w-3.5 h-3.5" />
            Servo Commands (M1=Shoulder, M2=Base, M3=Elbow)
          </span>
          {angles3DOF.m1_us === 1500 && (angles3DOF.m2_us === 2100 || angles3DOF.m2_us === 2000) && angles3DOF.m3_us === 1500 ? (
            <span className="px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 border border-sky-500/40 text-[10px]">
              Home Arm: M1=1500 | M2={angles3DOF.m2_us} | M3=1500
            </span>
          ) : angles3DOF.m2_us <= 1600 ? (
            <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px]">
              Base Min (1600µs / -45°)
            </span>
          ) : angles3DOF.m2_us >= 2600 ? (
            <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px]">
              Base Max (2600µs / +45°)
            </span>
          ) : (
            <span className="text-[10px] text-slate-400">Base Yaw: 1600–2600µs</span>
          )}
        </div>

        {/* Joint 1: Shoulder theta1 (M1 / ssh) */}
        <div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400 flex items-center gap-1">
              <Zap className="w-3 h-3 text-emerald-400" />
              Shoulder θ1 (M1 / ssh):
            </span>
            <span className="text-emerald-300 font-semibold">
              {angles3DOF.shoulderDeg.toFixed(1)}° &rarr;{' '}
              <span className="text-purple-300 bg-purple-950/60 px-1.5 py-0.2 rounded border border-purple-800/50">
                {angles3DOF.m1_us} µs ({(angles3DOF.m1_us / 1000).toFixed(2)} ms)
              </span>
            </span>
          </div>
          <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden mt-1">
            <div
              className="bg-emerald-400 h-full transition-all duration-75"
              style={{
                width: `${Math.min(100, Math.max(0, ((angles3DOF.shoulderDeg + 45) / 90) * 100))}%`,
              }}
            />
          </div>
        </div>

        {/* Joint 2: Base Yaw theta0 (M2 / s0) - Min 1600us, Center 2100us, Max 3000us (3.0ms) */}
        <div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400 flex items-center gap-1">
              <Compass className="w-3 h-3 text-sky-400" />
              Base Yaw θ0 (M2 / s0):
            </span>
            <span className="text-sky-300 font-semibold">
              {angles3DOF.baseDeg.toFixed(1)}° &rarr;{' '}
              <span className="text-purple-300 bg-purple-950/60 px-1.5 py-0.2 rounded border border-purple-800/50">
                {angles3DOF.m2_us} µs ({(angles3DOF.m2_us / 1000).toFixed(2)} ms)
              </span>
            </span>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mt-1 relative">
            <div
              className="bg-sky-400 h-full transition-all duration-75 rounded-full"
              style={{
                width: `${Math.min(100, Math.max(0, ((angles3DOF.m2_us - 1600) / (3000 - 1600)) * 100))}%`,
              }}
            />
          </div>
          <div className="flex justify-between text-[9px] text-slate-500 font-mono mt-0.5">
            <span>1600µs (Min)</span>
            <span className="text-sky-400 font-semibold">2100µs (Center)</span>
            <span>3000µs (Max / 3.0ms)</span>
          </div>
        </div>

        {/* Joint 3: Elbow theta2 (M3 / sel) - Range 1500us (0°) to 2500us (+90° Max) */}
        <div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400 flex items-center gap-1">
              <Zap className="w-3 h-3 text-amber-400" />
              Elbow θ2 (M3 / sel):
            </span>
            <span className="text-amber-300 font-semibold">
              {angles3DOF.elbowDeg.toFixed(1)}° &rarr;{' '}
              <span className="text-purple-300 bg-purple-950/60 px-1.5 py-0.2 rounded border border-purple-800/50">
                {angles3DOF.m3_us} µs ({(angles3DOF.m3_us / 1000).toFixed(2)} ms)
              </span>
            </span>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mt-1">
            <div
              className="bg-amber-400 h-full transition-all duration-75 rounded-full"
              style={{
                width: `${Math.min(100, Math.max(0, ((angles3DOF.m3_us - 1500) / 1000) * 100))}%`,
              }}
            />
          </div>
          <div className="flex justify-between text-[9px] text-slate-500 font-mono mt-0.5">
            <span>1500µs (0° Min)</span>
            <span>2000µs (+45° Mid)</span>
            <span className="text-amber-400 font-semibold">2500µs (+90° Max)</span>
          </div>
        </div>
      </div>

      {/* RASTICrane Specs matching Handout */}
      <div className="flex items-center justify-between pt-1 text-[10px] text-slate-400 font-mono border-t border-slate-800">
        <span>
          L1={MATLAB_L1}mm &bull; L2={MATLAB_L2}mm &bull; L3={MATLAB_L3}mm
        </span>
        <span className="text-purple-400 font-semibold">ME416 RASTICrane</span>
      </div>
    </div>
  );
};
