import { JointAngles3DOF, Position2D, Position3D, SlotData, StrokeSegment } from '../types';

// =========================================================================
//            ME416 LAB 2: THE STAMP MACHINE & RASTICrane CONSTANTS
// =========================================================================

// RASTICrane 3-DOF Arm Dimensions (matching OnShape CAD & MATLAB: L1=100mm, L2=120mm, L3=120mm)
export const MATLAB_L1 = 100; // Base height (mm)
export const MATLAB_L2 = 120; // Upper arm length (mm)
export const MATLAB_L3 = 120; // Forearm length (mm)

export const DEFAULT_SCALE = 1.1; // mm to canvas pixels (calibrated for 279.4mm x 215.9mm paper)

// AprilTag IDs matching ME416 Lab 2 Handout (Page 2) & MATLAB script:
// AprilTag IDs matching ME416 specifications:
// tagId_base  = 2;   % Base tag at world origin [0,0,0]
// tagId_ink   = 3;   % Ink pad tag
// tagId_paper = 5;   % Paper pad tag 
// tagId_rackA = 0;   % Stamp rack reference tag 0
// tagId_rackB = 1;   % Stamp rack reference tag 1
export const TAG_BASE = 2;          // Base tag at world origin [0,0,0]
export const TAG_INK_PAD = 3;       // Ink pad tag
export const TAG_PAPER = 5;         // Paper pad tag
export const TAG_RACK_A = 0;        // Stamp rack reference tag 0 (under A-C)
export const TAG_RACK_B = 1;        // Stamp rack reference tag 1 (under K-L-M)

// Aliases for rack reference plates
export const TAG_STAMP_LEFT = TAG_RACK_A;  // tagId_rackA = 0
export const TAG_STAMP_RIGHT = TAG_RACK_B; // tagId_rackB = 1

export const TAG_SIZE_METERS = 0.05; // 50mm (as specified in Handout L = 50 mm)
export const TAG_SIZE_MM = 50;

// Home posture constants: all motors set to 1.5ms (1500 microseconds)
export const HOME_MOTOR_PULSE_MS = 1.5;
export const HOME_MOTOR_PULSE_US = 1500;
export const HOME_POSITION_3D: Position3D = {
  x: 0,
  y: 240, // mm (fully extended neutral reach where shoulder & elbow elevation are 0 deg)
  z: 100, // mm (MATLAB_L1 = 100mm height)
};
export const HOME_ANGLES: JointAngles3DOF = {
  baseDeg: 0,
  shoulderDeg: 0,
  elbowDeg: 0,
  baseRad: 0,
  shoulderRad: 0,
  elbowRad: 0,
  m1_us: HOME_MOTOR_PULSE_US,
  m2_us: HOME_MOTOR_PULSE_US,
  m3_us: HOME_MOTOR_PULSE_US,
};

// AprilTag mounting square plates on stamp holder (55.731mm by 55.731mm)
export const HOLDER_PLATE_SIZE_MM = 55.731; // mm
export const HOLDER_PLATE_CENTER_R_MM = 76.2025; // mm (center radius attaching cleanly to inner arc rim)

// Stamp Rack Radial Geometry Configuration
// inner arc is 115.568mm while the outer arc is 155.218mm
export const R_INNER_MM = 115.568;  // mm (inner arc A-M)
export const R_OUTER_MM = 155.218;  // mm (outer arc N-Z)
export const THETA_START_RAD = (-56 * Math.PI) / 180; // -56 deg
export const THETA_END_RAD = (56 * Math.PI) / 180;    // +56 deg

// Canvas visual mapping angle for top-down perspective (facing forward towards -Y)
export const CANVAS_HOLDER_BASE_ANGLE = -Math.PI / 2; // -90 deg (forward)

export const ALPHABET_26 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// Outward wiping release distance along rho (Handout Page 3: "wipe outward... along rho at constant phi")
export const WIPE_DISTANCE_MM = 22; // 22mm outward wipe to slide magnet off steel disc against holder lip

// =========================================================================
//            3-DOF ANALYTICAL INVERSE KINEMATICS (MATLAB solve3DOF_IK)
// =========================================================================

/**
 * 3-DOF Analytical Inverse Kinematics solver matching MATLAB function solve3DOF_IK(x, y, z)
 * and ME416 Handout notation:
 * theta0 (base yaw), theta1 (shoulder), theta2 (absolute elbow)
 * Coordinates in millimeters [U, V, W] where table is W = 0.
 * Neutral home position yields 1.5ms (1500us) for all motors.
 */
export function solve3DOF_IK(
  x: number,
  y: number,
  z: number,
  L1: number = MATLAB_L1,
  L2: number = MATLAB_L2,
  L3: number = MATLAB_L3
): JointAngles3DOF | null {
  // If at or close to home posture, return exact 1.5ms for all motors
  if (Math.abs(x) < 0.1 && Math.abs(y - HOME_POSITION_3D.y) < 2 && Math.abs(z - HOME_POSITION_3D.z) < 2) {
    return { ...HOME_ANGLES };
  }

  // Azimuth angle phi relative to center forward (x: lateral, y: forward)
  // phi = 0 at center forward (yielding 1.5ms / 1500us on motor 1)
  const base_rad = Math.atan2(x, y);
  const r = Math.hypot(x, y);        // rho = sqrt(x^2 + y^2)
  const z_adj = z - L1;
  const D = Math.hypot(r, z_adj);

  // Check physical reach limits
  if (D > L2 + L3 || D < Math.abs(L2 - L3)) {
    // If within slight tolerance of max reach
    if (Math.abs(D - (L2 + L3)) < 1.0) {
      const base_deg = radToDeg(base_rad);
      return {
        baseDeg: base_deg,
        shoulderDeg: 0,
        elbowDeg: 0,
        baseRad: base_rad,
        shoulderRad: 0,
        elbowRad: 0,
        m1_us: mapAngleToUs(base_deg, -45, 45, 1300, 1700),
        m2_us: 1500,
        m3_us: 1500,
      };
    }
  }

  // Cosine rule for elbow
  const cos_elbow = (D * D - L2 * L2 - L3 * L3) / (2 * L2 * L3);
  const clamped_cos_elbow = Math.max(-1, Math.min(1, cos_elbow));
  const elbow_rad = Math.acos(clamped_cos_elbow);

  // Shoulder angle
  const alpha = Math.atan2(z_adj, r);
  const beta = Math.atan2(L3 * Math.sin(elbow_rad), L2 + L3 * Math.cos(elbow_rad));
  const shoulder_rad = alpha + beta;

  const base_deg = radToDeg(base_rad);
  const shoulder_deg = radToDeg(shoulder_rad);
  const elbow_deg = radToDeg(elbow_rad);

  // Map joint angles to microsecond pulse widths [1300, 1700] over [-45, 45] deg (s0, ssh, sel)
  const m1_us = mapAngleToUs(base_deg, -45, 45, 1300, 1700);
  const m2_us = mapAngleToUs(shoulder_deg, -45, 45, 1300, 1700);
  const m3_us = mapAngleToUs(elbow_deg, -45, 45, 1300, 1700);

  return {
    baseDeg: base_deg,
    shoulderDeg: shoulder_deg,
    elbowDeg: elbow_deg,
    baseRad: base_rad,
    shoulderRad: shoulder_rad,
    elbowRad: elbow_rad,
    m1_us,
    m2_us,
    m3_us,
  };
}

/**
 * Linear mapping helper for joint angles to microsecond PWM pulse width
 * Matching MATLAB function mapAngleToUs(angleDeg, minDeg, maxDeg, minUs, maxUs)
 */
export function mapAngleToUs(
  angleDeg: number,
  minDeg: number = -45,
  maxDeg: number = 45,
  minUs: number = 1300,
  maxUs: number = 1700
): number {
  const clampedAngle = Math.max(minDeg, Math.min(maxDeg, angleDeg));
  const us = Math.round(minUs + ((clampedAngle - minDeg) * (maxUs - minUs)) / (maxDeg - minDeg));
  return Math.max(minUs, Math.min(maxUs, us));
}

/**
 * Forward Kinematics for 3-DOF robot arm
 * Returns 3D positions of Base, Shoulder, Elbow, and End-Effector tip
 */
export function forwardKinematics3DOF(
  base_rad: number,
  shoulder_rad: number,
  elbow_rad: number,
  L1: number = MATLAB_L1,
  L2: number = MATLAB_L2,
  L3: number = MATLAB_L3
): {
  base: Position3D;
  shoulder: Position3D;
  elbow: Position3D;
  ee: Position3D;
  radialReach: number;
} {
  const base: Position3D = { x: 0, y: 0, z: 0 };
  const shoulder: Position3D = { x: 0, y: 0, z: L1 };

  const r_elbow = L2 * Math.cos(shoulder_rad);
  const z_elbow = L1 + L2 * Math.sin(shoulder_rad);
  const elbow: Position3D = {
    x: r_elbow * Math.cos(base_rad),
    y: r_elbow * Math.sin(base_rad),
    z: z_elbow,
  };

  const forearm_elev = shoulder_rad - elbow_rad;
  const r_ee = r_elbow + L3 * Math.cos(forearm_elev);
  const z_ee = z_elbow + L3 * Math.sin(forearm_elev);

  const ee: Position3D = {
    x: r_ee * Math.cos(base_rad),
    y: r_ee * Math.sin(base_rad),
    z: z_ee,
  };

  return {
    base,
    shoulder,
    elbow,
    ee,
    radialReach: r_ee,
  };
}

/**
 * Camera to Robot Base Frame Coordinate Transformation
 * Matching MATLAB function camToRobot(pCam):
 * x_robot = pCam(3); y_robot = -pCam(1); z_robot = -pCam(2);
 */
export function camToRobot(pCam: { x: number; y: number; z: number }): Position3D {
  return {
    x: pCam.z,
    y: -pCam.x,
    z: -pCam.y,
  };
}

/**
 * Inverse of camToRobot: Robot to Camera Frame
 */
export function robotToCam(pRob: Position3D): { x: number; y: number; z: number } {
  return {
    x: -pRob.y,
    y: -pRob.z,
    z: pRob.x,
  };
}

/**
 * Interpolates exact Cartesian position of a stamp along polar arcs (A-M / N-Z)
 * Matching MATLAB function getStampLocation
 */
export function getStampLocation(
  letter: string,
  pRackOrigin: Position3D,
  r_inner: number = R_INNER_MM,
  r_outer: number = R_OUTER_MM,
  theta_start: number = THETA_START_RAD,
  theta_end: number = THETA_END_RAD
): Position3D {
  const upper = letter.toUpperCase();
  let idx = 0;
  let radius = r_inner;
  const numStamps = 13;

  if (upper >= 'A' && upper <= 'M') {
    idx = upper.charCodeAt(0) - 'A'.charCodeAt(0);
    radius = r_inner;
  } else if (upper >= 'N' && upper <= 'Z') {
    idx = upper.charCodeAt(0) - 'N'.charCodeAt(0);
    radius = r_outer;
  } else {
    throw new Error('Invalid character provided: ' + letter);
  }

  // Interpolate polar angle for requested stamp
  const theta = theta_start + (idx * (theta_end - theta_start)) / (numStamps - 1);

  // Polar to Cartesian translation offset relative to rack origin
  const x_offset = radius * Math.cos(theta);
  const y_offset = radius * Math.sin(theta);

  return {
    x: pRackOrigin.x + x_offset,
    y: pRackOrigin.y + y_offset,
    z: pRackOrigin.z,
  };
}

/**
 * Computes radial target position and orientation on paper for a letter in a word sequence.
 * Matching ME416 Handout Page 3 & 5:
 * "A letter goes at [rho, phi]^T from the base, and the next letter goes at the same rho and a larger phi."
 * "each letter is radial: its rotation is the yaw it was pressed at"
 */
export function getPaperArcTarget(
  charIndex: number,
  totalChars: number,
  paperCenterRob: Position2D,
  scale: number = DEFAULT_SCALE
): {
  posRob: Position2D;
  canvasOffsetPx: Position2D;
  phi: number; // azimuth in radians
  rho: number; // radius from base in mm
  yawDeg: number; // radial rotation
} {
  const centerRho = Math.hypot(paperCenterRob.x, paperCenterRob.y);
  const centerPhi = Math.atan2(paperCenterRob.y, paperCenterRob.x);

  // Fixed spacing of ~22mm along the arc
  const charSpacingMm = 22;
  const dPhi = charSpacingMm / centerRho;
  const startPhi = centerPhi - ((totalChars - 1) * dPhi) / 2;
  const charPhi = startPhi + charIndex * dPhi;

  const charRobX = centerRho * Math.cos(charPhi);
  const charRobY = centerRho * Math.sin(charPhi);

  // Offset in canvas pixels relative to paper center
  const dRobX = charRobX - paperCenterRob.x;
  const dRobY = charRobY - paperCenterRob.y;
  const canvasOffsetX = dRobX * scale;
  const canvasOffsetY = -dRobY * scale;

  return {
    posRob: { x: charRobX, y: charRobY },
    canvasOffsetPx: { x: canvasOffsetX, y: canvasOffsetY },
    phi: charPhi,
    rho: centerRho,
    yawDeg: radToDeg(charPhi),
  };
}

/**
 * Get accurate CAD base plate geometry matching image.png and MATLAB code:
 * Left plate (Tag 100) under A-C, Right plate (Tag 101) under K-L-M.
 * Square plate size: 55.731mm by 55.731mm.
 * AprilTag size: 50mm by 50mm.
 */
export function getHolderPlateGeometry(scale: number = DEFAULT_SCALE) {
  const slotsPerTier = 13;
  const angleStep = (THETA_END_RAD - THETA_START_RAD) / (slotsPerTier - 1);

  // Left plate under A-C (centered at letter B, index 1) matching image.png "TAG 0 (ABC)"
  const thetaL = THETA_START_RAD + 1.0 * angleStep;
  // Right plate under K-L-M (centered at letter L, index 11) matching image.png "TAG 1 (KLM)"
  const thetaR = THETA_START_RAD + 11.0 * angleStep;

  // Sized strictly 55.731mm by 55.731mm square holding the 50mm AprilTag
  const plateW = HOLDER_PLATE_SIZE_MM * scale;
  const plateH = HOLDER_PLATE_SIZE_MM * scale;
  const plateCenterR = HOLDER_PLATE_CENTER_R_MM * scale;

  // AprilTag size: 50mm by 50mm
  const tagSize = TAG_SIZE_MM * scale;

  const tag0Local = {
    x: plateCenterR * Math.cos(CANVAS_HOLDER_BASE_ANGLE + thetaL),
    y: plateCenterR * Math.sin(CANVAS_HOLDER_BASE_ANGLE + thetaL),
  };

  const tag1Local = {
    x: plateCenterR * Math.cos(CANVAS_HOLDER_BASE_ANGLE + thetaR),
    y: plateCenterR * Math.sin(CANVAS_HOLDER_BASE_ANGLE + thetaR),
  };

  return {
    thetaL,
    thetaR,
    plateW,
    plateH,
    plateCenterR,
    tagSize,
    tag0Local,
    tag1Local,
  };
}

/**
 * Compute the 26 slot positions for the stamp holder (13 per tier: A-M and N-Z)
 * Sized and angled strictly according to calibrated CAD proportions:
 * R_INNER = 115.568mm (A-M), R_OUTER = 155.218mm (N-Z), THETA = -56° to +56°
 */
export function calculateSlotData(
  holderPos: Position2D,
  scale: number = DEFAULT_SCALE
): SlotData[] {
  const rInner = R_INNER_MM * scale;
  const rOuter = R_OUTER_MM * scale;

  const startAngle = THETA_START_RAD;
  const endAngle = THETA_END_RAD;
  const slotsPerTier = 13;
  const angleStep = (endAngle - startAngle) / (slotsPerTier - 1);

  const slots: SlotData[] = [];

  for (let i = 0; i < 26; i++) {
    const isInner = i < 13;
    const tier = isInner ? 'inner' : 'outer';
    const indexInTier = isInner ? i : i - 13;
    const letter = ALPHABET_26[i];

    const radius = isInner ? rInner : rOuter;
    const relativeAngle = startAngle + indexInTier * angleStep;
    const angle = CANVAS_HOLDER_BASE_ANGLE + relativeAngle;

    const localX = radius * Math.cos(angle);
    const localY = radius * Math.sin(angle);

    slots.push({
      letter,
      tier,
      index: i,
      localX,
      localY,
      worldX: holderPos.x + localX,
      worldY: holderPos.y + localY,
      angle,
      radius: 9 * scale,
    });
  }

  return slots;
}

/**
 * Traces stroke trajectories for character execution on paper matching MATLAB drawLetter
 */
export function getLetterStrokes(
  letter: string,
  paperCenterPx: Position2D,
  scaleFactor: number = DEFAULT_SCALE
): StrokeSegment[] {
  const strokeScale = 30 * scaleFactor;
  const x0 = paperCenterPx.x;
  const y0 = paperCenterPx.y;
  const s = strokeScale;

  const strokes: StrokeSegment[] = [];

  switch (letter.toUpperCase()) {
    case 'A':
      strokes.push({ x1: x0 - s / 2, y1: y0 + s / 2, x2: x0, y2: y0 - s / 2 });
      strokes.push({ x1: x0, y1: y0 - s / 2, x2: x0 + s / 2, y2: y0 + s / 2 });
      strokes.push({ x1: x0 - s / 4, y1: y0, x2: x0 + s / 4, y2: y0 });
      break;

    case 'H':
      strokes.push({ x1: x0 - s / 2, y1: y0 - s / 2, x2: x0 - s / 2, y2: y0 + s / 2 });
      strokes.push({ x1: x0 + s / 2, y1: y0 - s / 2, x2: x0 + s / 2, y2: y0 + s / 2 });
      strokes.push({ x1: x0 - s / 2, y1: y0, x2: x0 + s / 2, y2: y0 });
      break;

    case 'L':
      strokes.push({ x1: x0 - s / 2, y1: y0 - s / 2, x2: x0 - s / 2, y2: y0 + s / 2 });
      strokes.push({ x1: x0 - s / 2, y1: y0 + s / 2, x2: x0 + s / 2, y2: y0 + s / 2 });
      break;

    default:
      break;
  }

  return strokes;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
