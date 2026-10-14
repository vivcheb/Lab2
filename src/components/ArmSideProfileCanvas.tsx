import React, { useRef, useEffect, useState } from 'react';
import { Position3D, JointAngles3DOF, ArmParameters, CyclePhase, Position2D, SlotData } from '../types';
import { R_INNER_MM, R_OUTER_MM } from '../utils/kinematics';
import { MoveVertical, Play } from 'lucide-react';

interface ArmSideProfileCanvasProps {
  currentPos3D: Position3D;
  angles3DOF: JointAngles3DOF;
  armParams: ArmParameters;
  activeLetter: string | null;
  holdingLetter: string | null;
  cyclePhase: CyclePhase;
  isStampingContact: boolean;
  isInkContact: boolean;
  theme: 'dark' | 'light';
  holderPos?: Position2D;
  slotData?: SlotData[];
  onApproachSlot?: () => void;
  onToggleMinimize?: () => void;
}

export const ArmSideProfileCanvas: React.FC<ArmSideProfileCanvasProps> = ({
  currentPos3D,
  angles3DOF,
  armParams,
  activeLetter,
  holdingLetter,
  cyclePhase,
  isStampingContact,
  isInkContact,
  theme,
  holderPos,
  slotData,
  onApproachSlot,
  onToggleMinimize,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<Array<{ r: number; z: number }>>([]);
  const [showTrail, setShowTrail] = useState(true);
  const [showClearanceLines, setShowClearanceLines] = useState(true);

  // Compute current radial distance rho and vertical z in mm
  const r_curr = Math.hypot(currentPos3D.x, currentPos3D.y);
  const z_curr = currentPos3D.z;

  // Track trajectory trail in (r, z) elevation plane
  useEffect(() => {
    trailRef.current.push({ r: r_curr, z: z_curr });
    if (trailRef.current.length > 80) {
      trailRef.current.shift();
    }
  }, [r_curr, z_curr]);

  // Compute dynamic slot radial distances from slotData and holderPos
  const scaleFactor = armParams.scale || 1.0;

  // Slot radial distances in robot frame (mm)
  let innerRhos: number[] = [];
  let outerRhos: number[] = [];

  if (slotData && slotData.length > 0) {
    innerRhos = slotData
      .filter((s) => s.tier === 'inner')
      .map((s) => Math.hypot(s.worldX / scaleFactor, -s.worldY / scaleFactor));
    outerRhos = slotData
      .filter((s) => s.tier === 'outer')
      .map((s) => Math.hypot(s.worldX / scaleFactor, -s.worldY / scaleFactor));
  }

  const defaultInnerR =
    innerRhos.length > 0
      ? innerRhos.reduce((a, b) => a + b, 0) / innerRhos.length
      : holderPos
      ? Math.hypot(holderPos.x / scaleFactor, -holderPos.y / scaleFactor) + R_INNER_MM
      : R_INNER_MM;

  const defaultOuterR =
    outerRhos.length > 0
      ? outerRhos.reduce((a, b) => a + b, 0) / outerRhos.length
      : holderPos
      ? Math.hypot(holderPos.x / scaleFactor, -holderPos.y / scaleFactor) + R_OUTER_MM
      : R_OUTER_MM;

  const isOuterRack =
    activeLetter !== null &&
    activeLetter.toUpperCase() >= 'N' &&
    activeLetter.toUpperCase() <= 'Z';

  // Find targeted slot if activeLetter is selected
  const targetSlot =
    activeLetter && slotData ? slotData.find((s) => s.letter === activeLetter) : null;
  const targetSlotRho = targetSlot
    ? Math.hypot(targetSlot.worldX / scaleFactor, -targetSlot.worldY / scaleFactor)
    : null;

  const innerSlotR = targetSlot && !isOuterRack ? targetSlotRho! : defaultInnerR;
  const outerSlotR = targetSlot && isOuterRack ? targetSlotRho! : defaultOuterR;
  const targetRackRadius =
    targetSlotRho !== null ? targetSlotRho : isOuterRack ? outerSlotR : innerSlotR;

  // Stamp rack baseplate radial extent
  const allSlotRhos = [...innerRhos, ...outerRhos];
  const minSlotR =
    allSlotRhos.length > 0 ? Math.min(...allSlotRhos) : Math.min(innerSlotR, outerSlotR);
  const maxSlotR =
    allSlotRhos.length > 0 ? Math.max(...allSlotRhos) : Math.max(innerSlotR, outerSlotR);

  const rackStartR = Math.max(15, Math.min(innerSlotR, minSlotR) - 18);
  const rackEndR = Math.max(outerSlotR, maxSlotR) + 18;

  // Render canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high-DPI crisp rendering
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = rect.width || 400;
    const height = rect.height || 220;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const isDark = theme === 'dark';

    // Color definitions based on theme
    const colors = {
      bg: isDark ? '#080d1a' : '#f8fafc',
      gridLines: isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(226, 232, 240, 0.8)',
      gridSub: isDark ? 'rgba(30, 41, 59, 0.3)' : 'rgba(241, 245, 249, 0.6)',
      axisText: isDark ? '#64748b' : '#94a3b8',
      tableSurface: isDark ? '#1e293b' : '#cbd5e1',
      tableFill: isDark ? 'rgba(15, 23, 42, 0.8)' : 'rgba(241, 245, 249, 0.9)',
      baseColumn: isDark ? '#334155' : '#94a3b8',
      linkUpper: isDark ? '#0284c7' : '#0369a1',
      linkForearm: isDark ? '#0ea5e9' : '#0284c7',
      jointPivot: isDark ? '#f1f5f9' : '#0f172a',
      jointRim: isDark ? '#38bdf8' : '#0284c7',
      magnetTool: isDark ? '#f59e0b' : '#d97706',
      magnetGlow: isDark ? 'rgba(245, 158, 11, 0.3)' : 'rgba(217, 119, 6, 0.25)',
      rackBody: isDark ? '#1e293b' : '#94a3b8',
      rackLip: isDark ? '#475569' : '#64748b',
      stampSteel: isDark ? '#94a3b8' : '#64748b',
      stampRubber: isDark ? '#e11d48' : '#be123c',
      reachEnvelope: isDark ? 'rgba(148, 163, 184, 0.15)' : 'rgba(100, 116, 139, 0.15)',
      trail: isDark ? 'rgba(56, 189, 248, 0.7)' : 'rgba(2, 132, 199, 0.7)',
    };

    ctx.clearRect(0, 0, width, height);

    // Coordinate mapping:
    // r (mm) mapped horizontally from origin offset X_OFFSET to right
    // z (mm) mapped vertically upwards from table line Y_TABLE
    const X_OFFSET = width < 420 ? 46 : 54;
    const Y_TABLE = height - (height < 240 ? 34 : 38);
    const max_r = Math.max(260, rackEndR + 25);
    const max_z = 240;

    // Scaling factor (pixels per mm)
    const scale = Math.min((width - X_OFFSET - 20) / max_r, (Y_TABLE - 25) / max_z);

    // Helpers to convert mm to canvas coordinates
    const toCanvasX = (r_mm: number) => X_OFFSET + r_mm * scale;
    const toCanvasY = (z_mm: number) => Y_TABLE - z_mm * scale;

    // --- 1. Draw Background Grid ---
    ctx.lineWidth = 1;
    // Radial grid vertical lines (every 20mm & 50mm)
    for (let r = 0; r <= max_r; r += 20) {
      const x = toCanvasX(r);
      ctx.strokeStyle = r % 50 === 0 ? colors.gridLines : colors.gridSub;
      ctx.beginPath();
      ctx.moveTo(x, 15);
      ctx.lineTo(x, Y_TABLE);
      ctx.stroke();

      if (r % 50 === 0) {
        ctx.fillStyle = colors.axisText;
        ctx.font = '8px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${r}mm`, x, Y_TABLE + 12);
      }
    }

    // Vertical height grid horizontal lines (every 20mm & 50mm)
    for (let z = 0; z <= max_z; z += 20) {
      const y = toCanvasY(z);
      ctx.strokeStyle = z % 50 === 0 ? colors.gridLines : colors.gridSub;
      ctx.beginPath();
      ctx.moveTo(X_OFFSET - 8, y);
      ctx.lineTo(width - 15, y);
      ctx.stroke();

      if (z > 0 && z % 50 === 0) {
        ctx.fillStyle = colors.axisText;
        ctx.font = '8px "JetBrains Mono", monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`${z}`, X_OFFSET - 10, y + 3);
      }
    }

    // --- 2. Table Surface Plane (W = 0) ---
    ctx.fillStyle = colors.tableFill;
    ctx.fillRect(0, Y_TABLE, width, height - Y_TABLE);

    ctx.strokeStyle = colors.tableSurface;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, Y_TABLE);
    ctx.lineTo(width, Y_TABLE);
    ctx.stroke();

    ctx.fillStyle = colors.axisText;
    ctx.font = 'bold 8px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('TABLE W=0', 4, Y_TABLE - 4);

    // --- 3. Clearance Reference Lines ---
    if (showClearanceLines) {
      // Hover Clearance line (Z = 50mm)
      const yHover50 = toCanvasY(50);
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = isDark ? 'rgba(56, 189, 248, 0.4)' : 'rgba(2, 132, 199, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(X_OFFSET, yHover50);
      ctx.lineTo(width - 20, yHover50);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = isDark ? '#38bdf8' : '#0284c7';
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText('Hover Z=50mm', width - 22, yHover50 - 3);

      // Shoulder Axis height line (Z = L1 = 100mm)
      const yShoulder = toCanvasY(armParams.L1);
      ctx.save();
      ctx.setLineDash([2, 3]);
      ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(X_OFFSET, yShoulder);
      ctx.lineTo(toCanvasX(100), yShoulder);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = colors.axisText;
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`Shoulder L1=${armParams.L1}mm`, X_OFFSET + 6, yShoulder - 3);

      // Max Reach Boundary Arc
      ctx.save();
      ctx.strokeStyle = colors.reachEnvelope;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 4]);
      const maxReach = armParams.L2 + armParams.L3;
      ctx.beginPath();
      ctx.arc(toCanvasX(0), toCanvasY(armParams.L1), maxReach * scale, -Math.PI / 2, Math.PI / 4, false);
      ctx.stroke();
      ctx.restore();
    }

    // --- 4. Stamp Holder Rack Profile (Side View) DYNAMICALLY POSITIONED ---
    const rackHeightMm = 18;
    const stampDiscHeightMm = 24;

    const r1X = toCanvasX(rackStartR);
    const r2X = toCanvasX(rackEndR);
    const rackTopY = toCanvasY(rackHeightMm);
    const rackW = r2X - r1X;

    // Rack main block
    ctx.fillStyle = colors.rackBody;
    ctx.strokeStyle = isDark ? '#475569' : '#64748b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(r1X, rackTopY, rackW, Y_TABLE - rackTopY, [3, 3, 0, 0]);
    ctx.fill();
    ctx.stroke();

    // Inner Arc Slot Profile
    const innerSlotX = toCanvasX(innerSlotR);
    const slotDepthMm = 14;
    const slotY = toCanvasY(rackHeightMm - slotDepthMm);
    const isInnerTarget = !isOuterRack && activeLetter !== null;

    // Slot 1 pocket cut-out
    ctx.fillStyle = isDark ? '#0f172a' : '#f1f5f9';
    ctx.fillRect(innerSlotX - 7, rackTopY, 14, Y_TABLE - slotY);

    // Retaining wipe lip on inner slot
    ctx.fillStyle = colors.rackLip;
    ctx.fillRect(innerSlotX + 7, rackTopY - 4, 3, 8);

    // Stamp 1 in Slot 1 (Inner Arc: A-M)
    const stamp1InRack = holdingLetter !== activeLetter || isOuterRack;
    if (stamp1InRack) {
      // Stamp rubber body
      ctx.fillStyle = isInnerTarget ? '#f43f5e' : colors.stampRubber;
      ctx.fillRect(innerSlotX - 5, toCanvasY(stampDiscHeightMm - 3), 10, (stampDiscHeightMm - 3) * scale);
      // Steel disc on top
      ctx.fillStyle = isInnerTarget ? '#fbbf24' : colors.stampSteel;
      ctx.beginPath();
      ctx.roundRect(innerSlotX - 6, toCanvasY(stampDiscHeightMm), 12, 4 * scale, [1, 1, 1, 1]);
      ctx.fill();
    }

    // Outer Arc Slot Profile
    const outerSlotX = toCanvasX(outerSlotR);
    const isOuterTarget = isOuterRack && activeLetter !== null;

    // Slot 2 pocket cut-out
    ctx.fillStyle = isDark ? '#0f172a' : '#f1f5f9';
    ctx.fillRect(outerSlotX - 7, rackTopY, 14, Y_TABLE - slotY);

    // Retaining wipe lip on outer slot
    ctx.fillStyle = colors.rackLip;
    ctx.fillRect(outerSlotX + 7, rackTopY - 4, 3, 8);

    // Stamp 2 in Slot 2 (Outer Arc: N-Z)
    const stamp2InRack = holdingLetter !== activeLetter || !isOuterRack;
    if (stamp2InRack) {
      // Stamp rubber body
      ctx.fillStyle = isOuterTarget ? '#f43f5e' : colors.stampRubber;
      ctx.fillRect(outerSlotX - 5, toCanvasY(stampDiscHeightMm - 3), 10, (stampDiscHeightMm - 3) * scale);
      // Steel disc on top
      ctx.fillStyle = isOuterTarget ? '#fbbf24' : colors.stampSteel;
      ctx.beginPath();
      ctx.roundRect(outerSlotX - 6, toCanvasY(stampDiscHeightMm), 12, 4 * scale, [1, 1, 1, 1]);
      ctx.fill();
    }

    // Labels for Stamp Rack in side view
    ctx.fillStyle = isDark ? '#cbd5e1' : '#334155';
    ctx.font = 'bold 8px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('STAMP RACK', (r1X + r2X) / 2, Y_TABLE - 3);

    // Target Stamp indicator
    if (activeLetter) {
      const targetSlotX = isOuterRack ? outerSlotX : innerSlotX;
      ctx.fillStyle = isDark ? '#fbbf24' : '#d97706';
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      ctx.fillText(`[${activeLetter}]`, targetSlotX, toCanvasY(stampDiscHeightMm) - 7);

      // Target approach indicator arrow pointing down to slot
      ctx.strokeStyle = isDark ? '#fbbf24' : '#d97706';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(targetSlotX, toCanvasY(48));
      ctx.lineTo(targetSlotX, toCanvasY(stampDiscHeightMm + 2));
      ctx.stroke();

      // Arrowhead
      ctx.beginPath();
      ctx.moveTo(targetSlotX - 3, toCanvasY(stampDiscHeightMm + 6));
      ctx.lineTo(targetSlotX, toCanvasY(stampDiscHeightMm + 1));
      ctx.lineTo(targetSlotX + 3, toCanvasY(stampDiscHeightMm + 6));
      ctx.stroke();
    }

    // Tag 0 & Tag 1 reference markers on rack
    ctx.fillStyle = isDark ? '#38bdf8' : '#0284c7';
    ctx.font = '7.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`Tag 0 (${innerSlotR.toFixed(0)}mm)`, innerSlotX, Y_TABLE + 20);
    ctx.fillText(`Tag 1 (${outerSlotR.toFixed(0)}mm)`, outerSlotX, Y_TABLE + 20);

    // --- 5. Draw Trajectory Trail in (r, z) plane ---
    if (showTrail && trailRef.current.length > 1) {
      ctx.save();
      ctx.strokeStyle = colors.trail;
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < trailRef.current.length; i++) {
        const pt = trailRef.current[i];
        const px = toCanvasX(pt.r);
        const py = toCanvasY(pt.z);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.restore();
    }

    // --- 6. Arm Link Kinematics in Side Elevation Profile ---
    const baseOriginX = toCanvasX(0);
    const baseOriginY = toCanvasY(0);
    const shoulderX = toCanvasX(0);
    const shoulderY = toCanvasY(armParams.L1);

    const shoulderRad = (angles3DOF.shoulderDeg * Math.PI) / 180;
    const elbowRad = (angles3DOF.elbowDeg * Math.PI) / 180;

    // Elbow position in side plane:
    const r_elbow = armParams.L2 * Math.cos(shoulderRad);
    const z_elbow = armParams.L1 + armParams.L2 * Math.sin(shoulderRad);
    const elbowX = toCanvasX(r_elbow);
    const elbowY = toCanvasY(z_elbow);

    // End-Effector tip position in side plane:
    const forearm_elev = shoulderRad - elbowRad;
    const r_ee = r_elbow + armParams.L3 * Math.cos(forearm_elev);
    const z_ee = z_elbow + armParams.L3 * Math.sin(forearm_elev);
    const eeX = toCanvasX(r_ee);
    const eeY = toCanvasY(z_ee);

    // A. Base Column / Mast (L1 = 100mm)
    ctx.fillStyle = colors.baseColumn;
    ctx.strokeStyle = isDark ? '#1e293b' : '#64748b';
    ctx.lineWidth = 2;
    // Mounting base flange on table
    ctx.beginPath();
    ctx.roundRect(baseOriginX - 14, baseOriginY - 6, 28, 6, [2, 2, 0, 0]);
    ctx.fill();
    ctx.stroke();

    // Vertical column shaft
    ctx.beginPath();
    ctx.roundRect(baseOriginX - 7, shoulderY, 14, baseOriginY - 6 - shoulderY, [2, 2, 0, 0]);
    ctx.fill();
    ctx.stroke();

    // Base Servo Motor M2 representation
    ctx.fillStyle = isDark ? '#0f172a' : '#475569';
    ctx.fillRect(baseOriginX - 10, baseOriginY - 22, 20, 14);
    ctx.fillStyle = isDark ? '#38bdf8' : '#0284c7';
    ctx.font = '7.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('M2', baseOriginX, baseOriginY - 12);

    // B. Upper Arm Link (L2 = 120mm)
    ctx.strokeStyle = colors.linkUpper;
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(shoulderX, shoulderY);
    ctx.lineTo(elbowX, elbowY);
    ctx.stroke();

    // Inner link accent highlight line
    ctx.strokeStyle = isDark ? '#38bdf8' : '#e0f2fe';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(shoulderX, shoulderY);
    ctx.lineTo(elbowX, elbowY);
    ctx.stroke();

    // C. Forearm Link (L3 = 120mm)
    ctx.strokeStyle = colors.linkForearm;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(elbowX, elbowY);
    ctx.lineTo(eeX, eeY);
    ctx.stroke();

    // Inner forearm highlight
    ctx.strokeStyle = isDark ? '#7dd3fc' : '#bae6fd';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(elbowX, elbowY);
    ctx.lineTo(eeX, eeY);
    ctx.stroke();

    // D. Shoulder Joint Pivot (θ1 / M1 / ssh)
    ctx.fillStyle = colors.jointPivot;
    ctx.strokeStyle = colors.jointRim;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(shoulderX, shoulderY, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Shoulder angle arc annotation
    ctx.save();
    ctx.strokeStyle = isDark ? 'rgba(56, 189, 248, 0.7)' : 'rgba(2, 132, 199, 0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(shoulderX, shoulderY, 15, 0, -shoulderRad, shoulderRad > 0);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = isDark ? '#38bdf8' : '#0284c7';
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`θ₁:${angles3DOF.shoulderDeg.toFixed(0)}°`, shoulderX + 12, shoulderY - 6);

    // E. Elbow Joint Pivot (θ2 / M3 / sel)
    ctx.fillStyle = colors.jointPivot;
    ctx.strokeStyle = colors.jointRim;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(elbowX, elbowY, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Elbow angle readout
    ctx.fillStyle = isDark ? '#38bdf8' : '#0284c7';
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`θ₂:${angles3DOF.elbowDeg.toFixed(0)}°`, elbowX + 8, elbowY - 4);

    // F. End-Effector Magnetic Tip
    const isMagneticActive = holdingLetter !== null || isStampingContact || isInkContact;
    const isOverRack = Math.abs(r_curr - targetRackRadius) < 18;

    // Magnet glow when approaching or latched
    if (isMagneticActive || isOverRack) {
      ctx.fillStyle = colors.magnetGlow;
      ctx.beginPath();
      ctx.arc(eeX, eeY, 12, 0, Math.PI * 2);
      ctx.fill();
    }

    // Magnet toolhead casing
    ctx.fillStyle = colors.magnetTool;
    ctx.strokeStyle = isDark ? '#fbbf24' : '#b45309';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(eeX - 4, eeY - 4, 8, 7, [2, 2, 2, 2]);
    ctx.fill();
    ctx.stroke();

    // Permanent magnet pole
    ctx.fillStyle = isDark ? '#e2e8f0' : '#334155';
    ctx.fillRect(eeX - 3, eeY + 3, 6, 2.5);

    // If holding a stamp, draw the stamp suspended below the magnet!
    if (holdingLetter) {
      // Steel disc snapped to magnet
      ctx.fillStyle = colors.stampSteel;
      ctx.fillRect(eeX - 5, eeY + 6, 10, 2.5);
      // Stamp rubber block
      ctx.fillStyle = colors.stampRubber;
      ctx.fillRect(eeX - 4, eeY + 8.5, 8, 11);
      // Letter badge on stamp
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 8px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(holdingLetter, eeX, eeY + 17);
    }

    // --- 7. Distance & Hover Dimension Indicators when moving towards stamp rack ---
    if (activeLetter) {
      const slotX = toCanvasX(targetRackRadius);
      const isApproaching = cyclePhase === 'APPROACH_SLOT' || cyclePhase === 'PICK_STAMP';

      if (isApproaching) {
        const dimY = Math.min(eeY, toCanvasY(50)) - 12;
        ctx.strokeStyle = isDark ? '#f59e0b' : '#d97706';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(eeX, eeY);
        ctx.lineTo(eeX, dimY);
        ctx.moveTo(slotX, toCanvasY(24));
        ctx.lineTo(slotX, dimY);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.moveTo(eeX, dimY);
        ctx.lineTo(slotX, dimY);
        ctx.stroke();

        const deltaR = Math.abs(r_curr - targetRackRadius).toFixed(1);
        ctx.fillStyle = isDark ? '#fbbf24' : '#b45309';
        ctx.font = 'bold 8px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`Δρ: ${deltaR}mm`, (eeX + slotX) / 2, dimY - 3);
      }
    }

    // Current coordinates badge at tip
    ctx.fillStyle = isDark ? '#f8fafc' : '#0f172a';
    ctx.font = 'bold 8.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`ρ=${r_curr.toFixed(0)}, Z=${z_curr.toFixed(0)}`, eeX + 7, eeY + 12);
  }, [
    currentPos3D,
    angles3DOF,
    armParams,
    activeLetter,
    holdingLetter,
    cyclePhase,
    isStampingContact,
    isInkContact,
    theme,
    showTrail,
    showClearanceLines,
    holderPos,
    slotData,
    innerSlotR,
    outerSlotR,
    targetRackRadius,
    rackStartR,
    rackEndR,
    r_curr,
    z_curr,
  ]);

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col h-full w-full overflow-hidden select-none ${
        theme === 'dark'
          ? 'bg-slate-950 text-slate-100'
          : 'bg-white text-slate-900'
      }`}
    >
      {/* Header Bar */}
      <div
        className={`flex items-center justify-between px-2.5 py-1 border-b text-xs shrink-0 ${
          theme === 'dark' ? 'bg-slate-900/90 border-slate-800' : 'bg-slate-50 border-slate-200'
        }`}
      >
        <div className="flex items-center gap-1.5">
          <MoveVertical className="w-3.5 h-3.5 text-sky-500" />
          <span className="font-semibold text-[11px] tracking-wide">Side Elevation</span>
          <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
            [Z vs ρ]
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          {/* Quick Action to Test Approach */}
          {onApproachSlot && (
            <button
              onClick={onApproachSlot}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition cursor-pointer ${
                theme === 'dark'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 hover:bg-sky-500/30'
                  : 'bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100'
              }`}
              title="Animate arm moving towards stamp holder slot"
            >
              <Play className="w-2.5 h-2.5 text-sky-500" />
              <span>Approach [{activeLetter || 'A'}]</span>
            </button>
          )}

          {/* Toggle Guides */}
          <button
            onClick={() => setShowClearanceLines((prev) => !prev)}
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono cursor-pointer transition ${
              showClearanceLines
                ? theme === 'dark'
                  ? 'bg-slate-800 text-sky-400'
                  : 'bg-slate-200 text-sky-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Toggle Hover & Shoulder clearance lines"
          >
            Clearance
          </button>

          {/* Toggle Trail */}
          <button
            onClick={() => {
              if (showTrail) trailRef.current = [];
              setShowTrail((prev) => !prev);
            }}
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono cursor-pointer transition ${
              showTrail
                ? theme === 'dark'
                  ? 'bg-slate-800 text-sky-400'
                  : 'bg-slate-200 text-sky-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Toggle elevation trajectory trail"
          >
            Trail
          </button>

          {onToggleMinimize && (
            <button
              onClick={onToggleMinimize}
              className="text-slate-400 hover:text-slate-200 px-1 py-0.5 font-mono text-xs cursor-pointer"
              title="Minimize Side Profile"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="relative flex-1 min-h-[140px] overflow-hidden">
        <canvas
          ref={canvasRef}
          className="w-full h-full block"
          style={{ width: '100%', height: '100%' }}
        />

        {/* Phase Overlay HUD Badge */}
        <div
          className={`absolute top-1.5 left-2 px-2 py-0.5 rounded border text-[9.5px] font-mono shadow-xs backdrop-blur-xs flex items-center gap-1.5 ${
            theme === 'dark'
              ? 'bg-slate-900/80 border-slate-700/80 text-slate-200'
              : 'bg-white/90 border-slate-200 text-slate-800'
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
          <span className="font-semibold text-sky-500 truncate max-w-[150px]">
            {cyclePhase === 'APPROACH_SLOT'
              ? `Approaching [${activeLetter || 'A'}]`
              : cyclePhase === 'PICK_STAMP'
              ? `Lowering (Z → 0mm)`
              : cyclePhase === 'LIFT_STAMP'
              ? `Lifting (Z → 50mm)`
              : cyclePhase === 'RETURN_TO_SLOT'
              ? `Returning to Rack`
              : cyclePhase === 'PUT_DOWN_HOLDER'
              ? `Releasing Stamp`
              : cyclePhase === 'MOVE_TO_INK' || cyclePhase === 'DIP_INK'
              ? `Re-inking`
              : cyclePhase === 'MOVE_TO_PAPER' || cyclePhase === 'STAMP_PAPER'
              ? `Stamping Paper`
              : 'Standby'}
          </span>
          <span className="text-slate-500">·</span>
          <span>ρ:{r_curr.toFixed(0)}mm</span>
          <span className="text-slate-500">·</span>
          <span>Z:{z_curr.toFixed(0)}mm</span>
        </div>
      </div>

      {/* Bottom Status Ribbon */}
      <div
        className={`flex items-center justify-between px-2.5 py-1 border-t text-[9.5px] font-mono shrink-0 ${
          theme === 'dark'
            ? 'bg-slate-900/80 border-slate-800 text-slate-400'
            : 'bg-slate-50 border-slate-200 text-slate-600'
        }`}
      >
        <div className="flex items-center gap-2">
          <span>
            θ₁: <strong className={theme === 'dark' ? 'text-emerald-400' : 'text-emerald-600'}>{angles3DOF.shoulderDeg.toFixed(0)}°</strong>
          </span>
          <span>
            θ₂: <strong className={theme === 'dark' ? 'text-sky-400' : 'text-sky-600'}>{angles3DOF.elbowDeg.toFixed(0)}°</strong>
          </span>
          <span>
            θ₀: <strong className={theme === 'dark' ? 'text-amber-400' : 'text-amber-600'}>{angles3DOF.baseDeg.toFixed(0)}°</strong>
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={`px-1.5 py-0.2 rounded font-bold ${
              isOuterRack ? 'text-purple-400 bg-purple-500/10' : 'text-sky-400 bg-sky-500/10'
            }`}
          >
            Rack: {isOuterRack ? `Outer (${outerSlotR.toFixed(0)}mm)` : `Inner (${innerSlotR.toFixed(0)}mm)`}
          </span>
        </div>
      </div>
    </div>
  );
};
