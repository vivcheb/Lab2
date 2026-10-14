import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Position2D,
  SlotData,
  StampedMark,
  ArmParameters,
} from '../types';
import {
  DEFAULT_SCALE,
  getHolderPlateGeometry,
  TAG_BASE,
  TAG_RACK_A,
  TAG_RACK_B,
  TAG_STAMP_LEFT,
  TAG_STAMP_RIGHT,
  TAG_INK_PAD,
  TAG_PAPER,
  TAG_SIZE_MM,
  HOLDER_PLATE_SIZE_MM,
  R_INNER_MM,
  R_OUTER_MM,
  THETA_START_RAD,
  THETA_END_RAD,
  CANVAS_HOLDER_BASE_ANGLE,
  radToDeg,
} from '../utils/kinematics';

interface WorkspaceCanvasProps {
  q1: number; // Base azimuth angle phi / theta0 (rad)
  q2: number; // Radial reach rho (px)
  holdingLetter: string | null;
  activeTargetLetter: string | null;
  isStampingContact: boolean;
  isInkContact: boolean;
  isHovering: boolean;
  showAprilTags: boolean;
  showReachEnvelope: boolean;
  showTrajectoryTrail: boolean;
  holderPos: Position2D;
  inkPadPos: Position2D;
  paperPos: Position2D;
  stampedMarks: StampedMark[];
  slotData: SlotData[];
  armParams: ArmParameters;
  onUpdateComponentPos: (type: 'holder' | 'ink' | 'paper', pos: Position2D) => void;
  onSelectSlot: (letter: string, worldPos: Position2D) => void;
  onClickWorkspace: (x: number, y: number) => void;
}

export const WorkspaceCanvas: React.FC<WorkspaceCanvasProps> = ({
  q1,
  q2,
  holdingLetter,
  activeTargetLetter,
  isStampingContact,
  isInkContact,
  isHovering,
  showAprilTags,
  showReachEnvelope,
  showTrajectoryTrail,
  holderPos,
  inkPadPos,
  paperPos,
  stampedMarks,
  slotData,
  armParams,
  onUpdateComponentPos,
  onSelectSlot,
  onClickWorkspace,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trailRef = useRef<Position2D[]>([]);
  const [dragState, setDragState] = useState<{
    item: 'holder' | 'ink' | 'paper' | null;
    offset: Position2D;
    hasDragged: boolean;
  }>({ item: null, offset: { x: 0, y: 0 }, hasDragged: false });

  const [hoverInfo, setHoverInfo] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);

  const scale = armParams.scale || DEFAULT_SCALE;
  const L1 = 120 * scale; // Elbow carriage pivot distance
  const maxReach = (armParams.L2 + armParams.L3) * scale;
  const minReach = 50 * scale;

  // AprilTag size: 50mm by 50mm scaled to canvas pixels
  const TAG_SIZE = TAG_SIZE_MM * scale;

  // Geometry for CAD baseplates
  const plateGeo = getHolderPlateGeometry(scale);

  // Track trajectory trail
  useEffect(() => {
    const ee = {
      x: q2 * Math.cos(q1),
      y: q2 * Math.sin(q1),
    };
    trailRef.current.push(ee);
    if (trailRef.current.length > 50) {
      trailRef.current.shift();
    }
  }, [q1, q2]);

  // Synthetic AprilTag renderer (3x3 payload with quiet zone)
  const drawAprilTag = useCallback(
    (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, id: number) => {
      ctx.save();
      ctx.translate(x, y);

      // Drop shadow
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(-size / 2 + 1, -size / 2 + 1, size, size);

      // Outer black border
      ctx.fillStyle = '#000000';
      ctx.fillRect(-size / 2, -size / 2, size, size);

      // White quiet zone border
      const margin = size * 0.16;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-size / 2 + margin, -size / 2 + margin, size - 2 * margin, size - 2 * margin);

      // 3x3 AprilTag payload grid
      const innerSize = size - 2 * margin;
      const cellSize = innerSize / 3;
      const startOffset = -size / 2 + margin;

      ctx.fillStyle = '#000000';
      if (id === TAG_RACK_A) {
        // Tag 0: tagId_rackA = 0 (Stamp rack reference tag 0 under A-C)
        ctx.fillRect(startOffset, startOffset, cellSize, cellSize);
        ctx.fillRect(startOffset + cellSize * 2, startOffset, cellSize, cellSize);
        ctx.fillRect(startOffset + cellSize, startOffset + cellSize, cellSize, cellSize);
        ctx.fillRect(startOffset, startOffset + cellSize * 2, cellSize, cellSize);
      } else if (id === TAG_RACK_B) {
        // Tag 1: tagId_rackB = 1 (Stamp rack reference tag 1 under K-L-M)
        ctx.fillRect(startOffset + cellSize, startOffset, cellSize, cellSize);
        ctx.fillRect(startOffset, startOffset + cellSize, cellSize, cellSize);
        ctx.fillRect(startOffset + cellSize * 2, startOffset, cellSize, cellSize);
        ctx.fillRect(startOffset + cellSize * 2, startOffset + cellSize * 2, cellSize, cellSize);
      } else if (id === TAG_BASE) {
        // Tag 2: tagId_base = 2 (Base tag at world origin [0,0,0])
        ctx.fillRect(startOffset + cellSize, startOffset, cellSize, cellSize);
        ctx.fillRect(startOffset, startOffset + cellSize, cellSize, cellSize);
        ctx.fillRect(startOffset + cellSize * 2, startOffset + cellSize, cellSize, cellSize);
        ctx.fillRect(startOffset + cellSize, startOffset + cellSize * 2, cellSize, cellSize);
      } else if (id === TAG_INK_PAD) {
        // Tag 3: tagId_ink = 3 (Ink pad tag)
        ctx.fillRect(startOffset + cellSize * 2, startOffset, cellSize, cellSize);
        ctx.fillRect(startOffset, startOffset + cellSize, cellSize, cellSize);
        ctx.fillRect(startOffset + cellSize * 2, startOffset, cellSize, cellSize);
        ctx.fillRect(startOffset, startOffset + cellSize * 2, cellSize, cellSize);
      } else {
        // Tag 5: tagId_paper = 5 (Paper pad tag)
        ctx.fillRect(startOffset, startOffset, cellSize, cellSize);
        ctx.fillRect(startOffset + cellSize, startOffset, cellSize, cellSize);
        ctx.fillRect(startOffset + cellSize * 2, startOffset, cellSize, cellSize);
        ctx.fillRect(startOffset + cellSize * 2, startOffset + cellSize * 2, cellSize, cellSize);
      }

      // Corner circles in neon green for fiducial visualizer
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 1.5;
      const corners = [
        [-size / 2, -size / 2],
        [size / 2, -size / 2],
        [size / 2, size / 2],
        [-size / 2, size / 2],
      ];
      corners.forEach(([cx, cy]) => {
        ctx.beginPath();
        ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
        ctx.stroke();
      });

      // Label tag with ID & name matching ME416 specifications
      ctx.fillStyle = '#4ade80';
      ctx.font = 'bold 8.5px monospace';
      ctx.textAlign = 'center';
      if (id === TAG_RACK_A) {
        ctx.fillText('tagId_rackA = 0', 0, size / 2 + 10);
        ctx.fillText('Rack Ref 0 (A-C)', 0, size / 2 + 19);
      } else if (id === TAG_RACK_B) {
        ctx.fillText('tagId_rackB = 1', 0, size / 2 + 10);
        ctx.fillText('Rack Ref 1 (KLM)', 0, size / 2 + 19);
      } else if (id === TAG_BASE) {
        ctx.fillText('tagId_base = 2', 0, size / 2 + 10);
        ctx.fillText('Base [0,0,0]', 0, size / 2 + 19);
      } else if (id === TAG_INK_PAD) {
        ctx.fillText('tagId_ink = 3', 0, size / 2 + 10);
        ctx.fillText('Ink pad tag', 0, size / 2 + 19);
      } else if (id === TAG_PAPER) {
        ctx.fillText('tagId_paper = 5', 0, size / 2 + 10);
        ctx.fillText('Paper pad tag', 0, size / 2 + 19);
      } else {
        ctx.fillText(`tagId = ${id}`, 0, size / 2 + 10);
      }

      ctx.restore();
    },
    []
  );

  // Main Canvas Render Loop
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const originX = width / 2;
    const originY = height * 0.74;

    ctx.clearRect(0, 0, width, height);

    // 1. Engineering Workbench Background Grid
    ctx.fillStyle = '#0b0f19';
    ctx.fillRect(0, 0, width, height);

    // Minor grid
    ctx.strokeStyle = '#151e33';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 20) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 20) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Major grid
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1.2;
    for (let x = 0; x < width; x += 100) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 100) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Overhead camera graphic removed per request

    // 3. SEMICIRCULAR ARC GUIDE (ME416 Handout Page 2 diagram)
    ctx.save();
    ctx.translate(originX, originY);
    ctx.beginPath();
    ctx.arc(0, 0, (R_OUTER_MM + 6) * scale, -Math.PI * 0.88, -Math.PI * 0.12, false);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Trajectory History Trail
    if (showTrajectoryTrail && trailRef.current.length > 1) {
      ctx.save();
      ctx.translate(originX, originY);
      ctx.beginPath();
      ctx.moveTo(trailRef.current[0].x, trailRef.current[0].y);
      for (let i = 1; i < trailRef.current.length; i++) {
        ctx.lineTo(trailRef.current[i].x, trailRef.current[i].y);
      }
      ctx.strokeStyle = 'rgba(168, 85, 247, 0.45)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Reach Envelope Circles
    if (showReachEnvelope) {
      ctx.save();
      ctx.translate(originX, originY);

      ctx.beginPath();
      ctx.arc(0, 0, maxReach, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, 0, minReach, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.3)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#64748b';
      ctx.font = '9px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`R_MAX: ${(maxReach / scale).toFixed(0)}mm`, maxReach - 8, -6);
      ctx.fillText(`R_MIN: ${(minReach / scale).toFixed(0)}mm`, minReach + 35, -6);
      ctx.setLineDash([]);
      ctx.restore();
    }

    // 4. DRAW PAPER PAD (US Letter Sheet: 279.4mm × 215.9mm clean industrial gray rectangle with TAG 4)
    ctx.save();
    ctx.translate(originX + paperPos.x, originY + paperPos.y);

    const paperW = 279.4 * scale;
    const paperH = 215.9 * scale;

    // Subtle drop shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(-paperW / 2 + 3, -paperH / 2 + 3, paperW, paperH);

    // Industrial gray sheet matching image.png (279.4mm x 215.9mm)
    ctx.fillStyle = '#94a3b8'; // Slate/CAD gray sheet
    ctx.fillRect(-paperW / 2, -paperH / 2, paperW, paperH);
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.6;
    ctx.strokeRect(-paperW / 2, -paperH / 2, paperW, paperH);

    // Inner subtle chamfer/border guide line
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(-paperW / 2 + 3 * scale, -paperH / 2 + 3 * scale, paperW - 6 * scale, paperH - 6 * scale);

    // Sheet corner registration ticks
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1;
    const tickLen = 6 * scale;
    // Top-right tick
    ctx.beginPath();
    ctx.moveTo(paperW / 2 - 8 * scale, -paperH / 2 + 8 * scale - tickLen);
    ctx.lineTo(paperW / 2 - 8 * scale, -paperH / 2 + 8 * scale);
    ctx.lineTo(paperW / 2 - 8 * scale + tickLen, -paperH / 2 + 8 * scale);
    ctx.stroke();
    // Bottom-right tick
    ctx.beginPath();
    ctx.moveTo(paperW / 2 - 8 * scale, paperH / 2 - 8 * scale + tickLen);
    ctx.lineTo(paperW / 2 - 8 * scale, paperH / 2 - 8 * scale);
    ctx.lineTo(paperW / 2 - 8 * scale + tickLen, paperH / 2 - 8 * scale);
    ctx.stroke();
    // Bottom-left tick
    ctx.beginPath();
    ctx.moveTo(-paperW / 2 + 8 * scale, paperH / 2 - 8 * scale + tickLen);
    ctx.lineTo(-paperW / 2 + 8 * scale, paperH / 2 - 8 * scale);
    ctx.lineTo(-paperW / 2 + 8 * scale - tickLen, paperH / 2 - 8 * scale);
    ctx.stroke();

    // Corner AprilTag on Paper Pad (TAG 4) in top-left (50mm by 50mm)
    if (showAprilTags) {
      const paperTagMargin = 5 * scale;
      const tagCornerX = -paperW / 2 + TAG_SIZE / 2 + paperTagMargin;
      const tagCornerY = -paperH / 2 + TAG_SIZE / 2 + paperTagMargin;

      drawAprilTag(ctx, tagCornerX, tagCornerY, TAG_SIZE, TAG_PAPER);
    }

    // Render Stamped Marks with RADIAL ROTATION (ME416 Handout Page 5 diagram)
    stampedMarks.forEach((mark) => {
      ctx.save();
      ctx.translate(mark.x, mark.y);

      // Rotate by radial yaw angle phi matching Handout Page 5:
      // "each letter is radial: its rotation is the yaw it was pressed at"
      if (mark.angle !== undefined) {
        ctx.rotate(mark.angle + Math.PI / 2);
      }

      // If stroke trajectories exist (e.g. from drawLetter for A, H, L)
      if (mark.strokes && mark.strokes.length > 0) {
        ctx.strokeStyle = mark.color || '#0284c7';
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        mark.strokes.forEach((stroke) => {
          ctx.beginPath();
          ctx.moveTo(stroke.x1 - mark.x, stroke.y1 - mark.y);
          ctx.lineTo(stroke.x2 - mark.x, stroke.y2 - mark.y);
          ctx.stroke();
        });
      }

      // Render crisp stamp tile mark on the gray sheet
      ctx.fillStyle = mark.color || '#1e293b';
      const markSize = 14 * scale;
      ctx.beginPath();
      ctx.roundRect(-markSize / 2, -markSize / 2, markSize, markSize, 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.round(9 * scale)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(mark.letter, 0, 0);

      ctx.restore();
    });

    // Stamping contact shockwave effect
    if (isStampingContact) {
      ctx.beginPath();
      ctx.arc(0, 0, 32 * scale, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.75)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    ctx.restore();

    // 5. DRAW OPEN INK PAD STATION (Orange CAD Clamshell Fixture with OPEN Lid)
    ctx.save();
    ctx.translate(originX + inkPadPos.x, originY + inkPadPos.y);

    const padW = 88 * scale;
    const padH = 58 * scale;
    const lidH = 58 * scale;
    const hingeY = -padH / 2; // Hinge line separating base tray from open lid

    // --- A. FLIPPED-OPEN LID (resting open behind the hinge in -Y direction) ---
    // Lid drop shadow on workbench
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.roundRect(-padW / 2 + 2, hingeY - lidH + 2, padW, lidH, [4 * scale, 4 * scale, 0, 0]);
    ctx.fill();

    // Open Lid Chassis (orange CAD plastic)
    ctx.fillStyle = '#ea580c';
    ctx.beginPath();
    ctx.roundRect(-padW / 2, hingeY - lidH, padW, lidH, [4 * scale, 4 * scale, 0, 0]);
    ctx.fill();
    ctx.strokeStyle = '#9a3412';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Lid inner cavity (recessed underside visible because lid is OPEN)
    const lidCavityMargin = 5 * scale;
    const lidCavityW = padW - 2 * lidCavityMargin;
    const lidCavityH = lidH - 2 * lidCavityMargin;
    ctx.fillStyle = '#c2410c'; // darker recessed hollow inside of open lid
    ctx.beginPath();
    ctx.roundRect(-lidCavityW / 2, hingeY - lidH + lidCavityMargin, lidCavityW, lidCavityH, 2.5 * scale);
    ctx.fill();
    ctx.strokeStyle = '#7c2d12';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Inner sealing ridge inside lid cavity
    ctx.strokeStyle = '#ea580c';
    ctx.lineWidth = 1;
    ctx.strokeRect(-lidCavityW / 2 + 3 * scale, hingeY - lidH + lidCavityMargin + 3 * scale, lidCavityW - 6 * scale, lidCavityH - 6 * scale);

    // Two small latch catches at top edge of lid
    ctx.fillStyle = '#7c2d12';
    ctx.fillRect(-padW * 0.25 - 4 * scale, hingeY - lidH - 1, 8 * scale, 2.5 * scale);
    ctx.fillRect(padW * 0.25 - 4 * scale, hingeY - lidH - 1, 8 * scale, 2.5 * scale);

    // Rubber bumper stops resting on table
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(-padW / 2 + 3 * scale, hingeY - lidH + 2 * scale, 3 * scale, 3 * scale);
    ctx.fillRect(padW / 2 - 6 * scale, hingeY - lidH + 2 * scale, 3 * scale, 3 * scale);

    // --- B. CENTRAL HINGE ASSEMBLY ---
    const knuckleW = 10 * scale;
    const knuckleH = 5 * scale;
    ctx.fillStyle = '#9a3412';
    // Left hinge knuckle
    ctx.fillRect(-padW * 0.3 - knuckleW / 2, hingeY - knuckleH / 2, knuckleW, knuckleH);
    // Center hinge knuckle
    ctx.fillRect(-knuckleW / 2, hingeY - knuckleH / 2, knuckleW, knuckleH);
    // Right hinge knuckle
    ctx.fillRect(padW * 0.3 - knuckleW / 2, hingeY - knuckleH / 2, knuckleW, knuckleH);

    // Stainless steel pivot pin line
    ctx.beginPath();
    ctx.moveTo(-padW * 0.35, hingeY);
    ctx.lineTo(padW * 0.35, hingeY);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // --- C. BASE TRAY WITH EXPOSED INK WELL (Accessible to Robot Arm) ---
    // Base drop shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.roundRect(-padW / 2 + 3, -padH / 2 + 3, padW, padH, [0, 0, 4 * scale, 4 * scale]);
    ctx.fill();

    // Base Orange Chassis Body
    ctx.fillStyle = '#ea580c'; // rich orange CAD plastic
    ctx.beginPath();
    ctx.roundRect(-padW / 2, -padH / 2, padW, padH, [0, 0, 4 * scale, 4 * scale]);
    ctx.fill();
    ctx.strokeStyle = '#9a3412';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Beveled outer perimeter highlight
    ctx.strokeStyle = '#fb923c';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(-padW / 2 + 1.5, -padH / 2 + 1.5, padW - 3, padH - 3, [0, 0, 3 * scale, 3 * scale]);
    ctx.stroke();

    // Front thumb lip / latch tab at bottom edge
    ctx.fillStyle = '#9a3412';
    ctx.fillRect(-8 * scale, padH / 2 - 1, 16 * scale, 3.5 * scale);
    ctx.fillStyle = '#fb923c';
    ctx.fillRect(-7 * scale, padH / 2, 14 * scale, 1.5 * scale);

    // Inner Recessed Reservoir Pocket Well
    const rimMargin = 6 * scale;
    const wellW = padW - 2 * rimMargin;
    const wellH = padH - 2 * rimMargin;

    ctx.fillStyle = '#c2410c'; // darker recessed well pocket
    ctx.beginPath();
    ctx.roundRect(-wellW / 2, -wellH / 2, wellW, wellH, 2.5 * scale);
    ctx.fill();
    ctx.strokeStyle = '#7c2d12';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // EXPOSED INK SPONGE / FELT RESERVOIR (Centered at (0, 0) for exact robot contact!)
    const spongeMargin = 2.5 * scale;
    const spongeW = wellW - 2 * spongeMargin;
    const spongeH = wellH - 2 * spongeMargin;

    // Saturated Orange-Red Ink Felt Pad
    const spongeGrad = ctx.createLinearGradient(-spongeW / 2, -spongeH / 2, spongeW / 2, spongeH / 2);
    spongeGrad.addColorStop(0, '#ea580c');
    spongeGrad.addColorStop(0.5, '#f97316');
    spongeGrad.addColorStop(1, '#c2410c');
    ctx.fillStyle = spongeGrad;
    ctx.beginPath();
    ctx.roundRect(-spongeW / 2, -spongeH / 2, spongeW, spongeH, 2 * scale);
    ctx.fill();
    ctx.strokeStyle = '#fb923c';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Fine ink felt texture / saturation sheen
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.roundRect(-spongeW / 2 + 2, -spongeH / 2 + 2, spongeW - 4, spongeH - 4, 1.5 * scale);
    ctx.stroke();

    // AprilTag 3 on open ink pad fixture (50mm by 50mm tag mounted cleanly on open lid)
    if (showAprilTags) {
      const tagCenterY = hingeY - lidH / 2;
      drawAprilTag(ctx, 0, tagCenterY, TAG_SIZE, TAG_INK_PAD);
    }

    // Inking contact shockwave effect in bright orange
    if (isInkContact) {
      ctx.beginPath();
      ctx.arc(0, 0, 26 * scale, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(249, 115, 22, 0.9)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    ctx.restore();

    // 6. DRAW STAMP HOLDERS ARC (Rescaled Sleek CAD Purple Arc with Letters Sitting INSIDE Channels)
    ctx.save();
    ctx.translate(originX + holderPos.x, originY + holderPos.y);

    const rInner = R_INNER_MM * scale;
    const rOuter = R_OUTER_MM * scale;
    const startAngle = CANVAS_HOLDER_BASE_ANGLE + THETA_START_RAD;
    const endAngle = CANVAS_HOLDER_BASE_ANGLE + THETA_END_RAD;

    // Sleek geometric radii: letters sit INSIDE the arc channels, rescaled to match paper
    const tileH = 19 * scale;
    const rimWidth = 4.5 * scale;
    const rMin = rInner - tileH / 2 - rimWidth; // Inner raised rim lower edge
    const rMax = rOuter + tileH / 2 + rimWidth; // Outer raised rim upper edge
    const anglePad = 0.04;
    const arcStart = startAngle - anglePad;
    const arcEnd = endAngle + anglePad;

    // Baseplate L (TAG 0 / 100 - under A-C) - 55.731mm by 55.731mm square
    ctx.save();
    ctx.translate(plateGeo.tag0Local.x, plateGeo.tag0Local.y);
    ctx.rotate(CANVAS_HOLDER_BASE_ANGLE + plateGeo.thetaL + Math.PI / 2);

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(-plateGeo.plateW / 2 + 3, -plateGeo.plateH / 2 + 3, plateGeo.plateW, plateGeo.plateH);

    ctx.fillStyle = '#7a468b';
    ctx.strokeStyle = '#4a2357';
    ctx.lineWidth = 1.8;
    ctx.fillRect(-plateGeo.plateW / 2, -plateGeo.plateH / 2, plateGeo.plateW, plateGeo.plateH);
    ctx.strokeRect(-plateGeo.plateW / 2, -plateGeo.plateH / 2, plateGeo.plateW, plateGeo.plateH);

    // Recessed border for the 50mm AprilTag pocket
    ctx.strokeStyle = '#5c2d6b';
    ctx.lineWidth = 1;
    ctx.strokeRect(-plateGeo.tagSize / 2 - 1, -plateGeo.tagSize / 2 - 1, plateGeo.tagSize + 2, plateGeo.tagSize + 2);

    if (showAprilTags) {
      drawAprilTag(ctx, 0, 0, plateGeo.tagSize, TAG_STAMP_LEFT);
    }
    ctx.restore();

    // Baseplate R (TAG 1 / 101 - under K-L-M) - 55.731mm by 55.731mm square
    ctx.save();
    ctx.translate(plateGeo.tag1Local.x, plateGeo.tag1Local.y);
    ctx.rotate(CANVAS_HOLDER_BASE_ANGLE + plateGeo.thetaR + Math.PI / 2);

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(-plateGeo.plateW / 2 + 3, -plateGeo.plateH / 2 + 3, plateGeo.plateW, plateGeo.plateH);

    ctx.fillStyle = '#7a468b';
    ctx.strokeStyle = '#4a2357';
    ctx.lineWidth = 1.8;
    ctx.fillRect(-plateGeo.plateW / 2, -plateGeo.plateH / 2, plateGeo.plateW, plateGeo.plateH);
    ctx.strokeRect(-plateGeo.plateW / 2, -plateGeo.plateH / 2, plateGeo.plateW, plateGeo.plateH);

    // Recessed border for the 50mm AprilTag pocket
    ctx.strokeStyle = '#5c2d6b';
    ctx.lineWidth = 1;
    ctx.strokeRect(-plateGeo.tagSize / 2 - 1, -plateGeo.tagSize / 2 - 1, plateGeo.tagSize + 2, plateGeo.tagSize + 2);

    if (showAprilTags) {
      drawAprilTag(ctx, 0, 0, plateGeo.tagSize, TAG_STAMP_RIGHT);
    }
    ctx.restore();

    // Curved Arc Rack Body: Sleek Purple Arc Band
    ctx.beginPath();
    ctx.arc(0, 0, rMax + 2.5, arcStart, arcEnd, false);
    ctx.arc(0, 0, rMin - 2.5, arcEnd, arcStart, true);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, 0, rMax, arcStart, arcEnd, false);
    ctx.arc(0, 0, rMin, arcEnd, arcStart, true);
    ctx.closePath();
    ctx.fillStyle = '#7a468b'; // rich CAD purple matching image.png
    ctx.strokeStyle = '#4a2357';
    ctx.lineWidth = 2.2;
    ctx.fill();
    ctx.stroke();

    // Recessed Inner and Outer Curved Channels where Letter Tiles Sit
    // Outer Track Channel Bed (for N..Z)
    ctx.beginPath();
    ctx.arc(0, 0, rOuter + tileH / 2 + 0.8, arcStart + 0.012, arcEnd - 0.012, false);
    ctx.arc(0, 0, rOuter - tileH / 2 - 0.8, arcEnd - 0.012, arcStart + 0.012, true);
    ctx.closePath();
    ctx.fillStyle = '#592966'; // recessed purple groove
    ctx.strokeStyle = '#3e174a';
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();

    // Inner Track Channel Bed (for A..M)
    ctx.beginPath();
    ctx.arc(0, 0, rInner + tileH / 2 + 0.8, arcStart + 0.012, arcEnd - 0.012, false);
    ctx.arc(0, 0, rInner - tileH / 2 - 0.8, arcEnd - 0.012, arcStart + 0.012, true);
    ctx.closePath();
    ctx.fillStyle = '#592966'; // recessed purple groove
    ctx.strokeStyle = '#3e174a';
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();

    // Raised Outer Rim, Middle Divider Rib & Inner Rim Highlights
    ctx.beginPath();
    ctx.arc(0, 0, rMax - 1, arcStart, arcEnd, false);
    ctx.strokeStyle = '#9c5dae'; // outer rim bevel highlight
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, rOuter - tileH / 2 - 0.8, arcStart, arcEnd, false);
    ctx.strokeStyle = '#9c5dae'; // middle rib upper border
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, rInner + tileH / 2 + 0.8, arcStart, arcEnd, false);
    ctx.strokeStyle = '#9c5dae'; // middle rib lower border
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, rMin + 1, arcStart, arcEnd, false);
    ctx.strokeStyle = '#4a2357'; // inner rim bottom border
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Center Mounting / Alignment Boss between F and G on Middle Rib (matching image.png)
    const midR = (rInner + rOuter) / 2;
    const bossX = midR * Math.cos(CANVAS_HOLDER_BASE_ANGLE);
    const bossY = midR * Math.sin(CANVAS_HOLDER_BASE_ANGLE);

    ctx.beginPath();
    ctx.arc(bossX, bossY, 6 * scale, 0, Math.PI * 2);
    ctx.fillStyle = '#6b3778';
    ctx.fill();
    ctx.strokeStyle = '#9c5dae';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(bossX, bossY, 3.2 * scale, 0, Math.PI * 2);
    ctx.fillStyle = '#1e0c24';
    ctx.fill();
    ctx.strokeStyle = '#4a2357';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(bossX, bossY, 1.4 * scale, 0, Math.PI * 2);
    ctx.fillStyle = '#9c5dae';
    ctx.fill();

    // 26 White Letter Tiles Sitting INSIDE the Channels (matching image.png)
    slotData.forEach((slot) => {
      const isTargeted = activeTargetLetter === slot.letter;
      const isPicked = holdingLetter === slot.letter;

      ctx.save();
      ctx.translate(slot.localX, slot.localY);
      ctx.rotate(slot.angle + Math.PI / 2);

      const tileW = (slot.tier === 'outer' ? 17.5 : 15.5) * scale;
      const tileHeight = 17 * scale;

      if (isPicked) {
        // Empty slot pocket inside channel
        ctx.fillStyle = '#421a4f';
        ctx.fillRect(-tileW / 2, -tileHeight / 2, tileW, tileHeight);
        ctx.strokeStyle = '#622f72';
        ctx.lineWidth = 0.8;
        ctx.strokeRect(-tileW / 2, -tileHeight / 2, tileW, tileHeight);
      } else {
        // Crisp white rectangular tile matching image.png
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-tileW / 2, -tileHeight / 2, tileW, tileHeight);
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1;
        ctx.strokeRect(-tileW / 2, -tileHeight / 2, tileW, tileHeight);

        // Bold black uppercase letter - enlarged to clearly match CAD image
        ctx.fillStyle = '#000000';
        ctx.font = `bold ${Math.round((slot.tier === 'outer' ? 13 : 12) * scale)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(slot.letter, 0, 0.5);
      }

      if (isTargeted) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.strokeRect(-tileW / 2 - 2, -tileHeight / 2 - 2, tileW + 4, tileHeight + 4);
      }

      ctx.restore();
    });

    ctx.restore();

    // 7. ROBOT BASE, COORDINATE AXES (U, V), BASE TAG & POLAR RAY (rho, phi) (ME416 Handout Page 2 diagram!)
    ctx.save();
    ctx.translate(originX, originY);

    // Circular Base Hub
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, Math.PI * 2);
    ctx.fillStyle = '#94a3b8'; // Grey circular base plate matching Page 2
    ctx.fill();
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Base center pivot
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#334155';
    ctx.fill();

    // Label: "base" (Page 2 diagram)
    ctx.fillStyle = '#64748b';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('base', 0, 38);

    // Coordinate Vector U pointing right (Page 2 diagram)
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(45, 0);
    ctx.stroke();
    // Arrow head for U
    ctx.beginPath();
    ctx.moveTo(45, 0);
    ctx.lineTo(38, -4);
    ctx.lineTo(38, 4);
    ctx.closePath();
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.font = 'italic bold 12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('U', 50, 4);

    // Coordinate Vector V pointing up/forward (Page 2 diagram)
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -45);
    ctx.stroke();
    // Arrow head for V
    ctx.beginPath();
    ctx.moveTo(0, -45);
    ctx.lineTo(-4, -38);
    ctx.lineTo(4, -38);
    ctx.closePath();
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.font = 'italic bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('V', 0, -52);

    // BASE TAG directly below the circular base plate (ME416 Handout Page 2: "base tag" - 50mm by 50mm)
    if (showAprilTags) {
      drawAprilTag(ctx, 0, 62 * scale, TAG_SIZE, TAG_BASE);
    }

    // Radial ray rho & Azimuth phi indicator (Handout Page 2 & Page 5: "phi is azimuth... rho is distance")
    const eeLocalX = q2 * Math.cos(q1);
    const eeLocalY = q2 * Math.sin(q1);

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(eeLocalX, eeLocalY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Label rho on radial ray
    const midRayX = eeLocalX * 0.55;
    const midRayY = eeLocalY * 0.55;
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'italic 11px sans-serif';
    ctx.fillText('ρ', midRayX + 8, midRayY - 6);

    // Azimuth angle arc phi
    const currentPhi = q1;
    ctx.beginPath();
    ctx.arc(0, 0, 28, currentPhi < 0 ? currentPhi : 0, currentPhi < 0 ? 0 : currentPhi);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'italic 11px sans-serif';
    ctx.fillText('ϕ', 22 * Math.cos(currentPhi / 2), 22 * Math.sin(currentPhi / 2));

    ctx.restore();

    // 8. RASTICRANE ROBOT ARM (STRAIGHT COLLINEAR FOREARM + MAGNETIC LEGO TOOL HEAD)
    const theta = q1;
    const currentReach = q2;

    const joint1X = originX;
    const joint1Y = originY;

    const elbowX = originX + L1 * Math.cos(theta);
    const elbowY = originY + L1 * Math.sin(theta);

    const eeX = originX + currentReach * Math.cos(theta);
    const eeY = originY + currentReach * Math.sin(theta);

    // Hover shadow underneath arm if elevated (+50mm)
    if (isHovering) {
      ctx.beginPath();
      ctx.arc(eeX + 6, eeY + 6, 14, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.fill();
    }

    // Link 1 (Primary Base Arm Beam)
    ctx.beginPath();
    ctx.moveTo(joint1X, joint1Y);
    ctx.lineTo(elbowX, elbowY);
    ctx.strokeStyle = '#1e40af';
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(joint1X, joint1Y);
    ctx.lineTo(elbowX, elbowY);
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Forearm (Straight linear extension along theta)
    ctx.beginPath();
    ctx.moveTo(elbowX, elbowY);
    ctx.lineTo(eeX, eeY);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(elbowX, elbowY);
    ctx.lineTo(eeX, eeY);
    ctx.strokeStyle = '#e0f2fe';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Elbow Carriage Bushing
    ctx.save();
    ctx.translate(elbowX, elbowY);
    ctx.rotate(theta);

    const carriageL = 22 * scale;
    const carriageW = 16 * scale;
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.fillRect(-carriageL / 2, -carriageW / 2, carriageL, carriageW);
    ctx.strokeRect(-carriageL / 2, -carriageW / 2, carriageL, carriageW);
    ctx.restore();

    // 9. END EFFECTOR: JUST A GREY RECTANGLE
    ctx.save();
    ctx.translate(eeX, eeY);
    ctx.rotate(theta + Math.PI / 2);

    const eeWidth = 24 * scale;
    const eeHeight = 14 * scale;

    // Just a grey rectangle
    ctx.fillStyle = '#94a3b8';
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.5;
    ctx.fillRect(-eeWidth / 2, -eeHeight / 2, eeWidth, eeHeight);
    ctx.strokeRect(-eeWidth / 2, -eeHeight / 2, eeWidth, eeHeight);

    // If holding letter stamp
    if (holdingLetter) {
      ctx.fillStyle = '#0f172a';
      ctx.font = `bold ${Math.round(10 * scale)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(holdingLetter, 0, 0);
    }

    ctx.restore();
  }, [
    q1,
    q2,
    holdingLetter,
    activeTargetLetter,
    isStampingContact,
    isInkContact,
    isHovering,
    showAprilTags,
    showReachEnvelope,
    showTrajectoryTrail,
    holderPos,
    inkPadPos,
    paperPos,
    stampedMarks,
    slotData,
    scale,
    L1,
    maxReach,
    minReach,
    TAG_SIZE,
    plateGeo,
    drawAprilTag,
  ]);

  // Window resize handler
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      render();
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [render]);

  useEffect(() => {
    render();
  }, [render]);

  // Mouse Interaction
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const originX = canvas.width / 2;
    const originY = canvas.height * 0.74;

    const mx = e.clientX - rect.left - originX;
    const my = e.clientY - rect.top - originY;

    // Check click on stamp holder slots first (outer arc R_OUTER_MM = 155.218mm)
    if (Math.hypot(mx - holderPos.x, my - holderPos.y) < 190 * scale) {
      for (const slot of slotData) {
        if (Math.hypot(mx - slot.worldX, my - slot.worldY) < slot.radius * 1.3) {
          onSelectSlot(slot.letter, { x: slot.worldX, y: slot.worldY });
          return;
        }
      }

      // Check click on AprilTag 100
      const tag0WorldX = holderPos.x + plateGeo.tag0Local.x;
      const tag0WorldY = holderPos.y + plateGeo.tag0Local.y;
      if (Math.hypot(mx - tag0WorldX, my - tag0WorldY) < plateGeo.tagSize * 0.8) {
        onClickWorkspace(tag0WorldX, tag0WorldY);
        return;
      }

      // Check click on AprilTag 101
      const tag1WorldX = holderPos.x + plateGeo.tag1Local.x;
      const tag1WorldY = holderPos.y + plateGeo.tag1Local.y;
      if (Math.hypot(mx - tag1WorldX, my - tag1WorldY) < plateGeo.tagSize * 0.8) {
        onClickWorkspace(tag1WorldX, tag1WorldY);
        return;
      }

      setDragState({
        item: 'holder',
        offset: { x: mx - holderPos.x, y: my - holderPos.y },
        hasDragged: false,
      });
      return;
    }

    // Check click on Ink Pad (open fixture: width 88, height extends from -80 to +32)
    if (
      Math.abs(mx - inkPadPos.x) < 48 * scale &&
      my >= inkPadPos.y - 82 * scale &&
      my <= inkPadPos.y + 34 * scale
    ) {
      setDragState({
        item: 'ink',
        offset: { x: mx - inkPadPos.x, y: my - inkPadPos.y },
        hasDragged: false,
      });
      return;
    }

    // Check click on Paper Sheet (279.4mm x 215.9mm gray rectangle)
    if (
      Math.abs(mx - paperPos.x) < (279.4 * scale) / 2 &&
      Math.abs(my - paperPos.y) < (215.9 * scale) / 2
    ) {
      setDragState({
        item: 'paper',
        offset: { x: mx - paperPos.x, y: my - paperPos.y },
        hasDragged: false,
      });
      return;
    }

    // Click on empty workspace
    onClickWorkspace(mx, my);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const originX = canvas.width / 2;
    const originY = canvas.height * 0.74;

    const mx = e.clientX - rect.left - originX;
    const my = e.clientY - rect.top - originY;

    if (dragState.item) {
      const newPos = {
        x: Math.round(mx - dragState.offset.x),
        y: Math.round(my - dragState.offset.y),
      };
      onUpdateComponentPos(dragState.item, newPos);
      setDragState((prev) => ({ ...prev, hasDragged: true }));
      return;
    }

    // Hover tooltip checking
    for (const slot of slotData) {
      if (Math.hypot(mx - slot.worldX, my - slot.worldY) < slot.radius) {
        setHoverInfo({
          text: `Slot '${slot.letter}' (${slot.tier.toUpperCase()}) | U:${(slot.worldX / scale).toFixed(0)}mm V:${(-slot.worldY / scale).toFixed(0)}mm`,
          x: e.clientX,
          y: e.clientY,
        });
        return;
      }
    }

    if (
      Math.abs(mx - inkPadPos.x) < 48 * scale &&
      my >= inkPadPos.y - 82 * scale &&
      my <= inkPadPos.y + 34 * scale
    ) {
      setHoverInfo({
        text: `ink pad [OPEN] (TAG ${TAG_INK_PAD}) | U:${(inkPadPos.x / scale).toFixed(0)}mm V:${(-inkPadPos.y / scale).toFixed(0)}mm`,
        x: e.clientX,
        y: e.clientY,
      });
      return;
    }

    if (
      Math.abs(mx - paperPos.x) < (279.4 * scale) / 2 &&
      Math.abs(my - paperPos.y) < (215.9 * scale) / 2
    ) {
      setHoverInfo({
        text: `paper sheet 279.4×215.9mm (TAG ${TAG_PAPER}) | U:${(paperPos.x / scale).toFixed(0)}mm V:${(-paperPos.y / scale).toFixed(0)}mm`,
        x: e.clientX,
        y: e.clientY,
      });
      return;
    }

    setHoverInfo(null);
  };

  const handleMouseUp = () => {
    setDragState({ item: null, offset: { x: 0, y: 0 }, hasDragged: false });
  };

  return (
    <div className="relative w-full h-full select-none overflow-hidden bg-slate-950">
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className="w-full h-full cursor-crosshair block"
      />

      {/* Floating coordinates indicator badge (RASTICrane [U, V, W] & [rho, phi]) */}
      <div className="absolute bottom-3 left-3 bg-slate-900/90 backdrop-blur-xs px-3 py-1.5 rounded border border-slate-800 text-[11px] font-mono text-slate-300 flex items-center gap-3">
        <span>
          Azimuth ϕ: <strong className="text-amber-400">{radToDeg(q1).toFixed(1)}°</strong>
        </span>
        <span>
          Distance ρ: <strong className="text-sky-400">{(q2 / scale).toFixed(1)} mm</strong>
        </span>
        <span>
          W-Height:{' '}
          <strong className={isHovering ? 'text-amber-400' : 'text-emerald-400'}>
            {isHovering ? '+50.0 mm [Hover]' : '0.0 mm [Table W=0]'}
          </strong>
        </span>
      </div>

      {/* Tooltip */}
      {hoverInfo && (
        <div
          className="fixed pointer-events-none z-50 px-2 py-1 bg-slate-900/95 text-slate-200 text-xs font-mono rounded shadow-lg border border-slate-700 whitespace-nowrap"
          style={{ left: hoverInfo.x + 12, top: hoverInfo.y + 12 }}
        >
          {hoverInfo.text}
        </div>
      )}
    </div>
  );
};
