export interface Position2D {
  x: number;
  y: number;
}

export interface Position3D {
  x: number; // mm (U)
  y: number; // mm (V)
  z: number; // mm (W)
}

export interface JointAngles {
  q1: number; // radians (base yaw phi / theta0)
  q2: number; // radians or radial reach rho
}

export interface JointAngles3DOF {
  baseDeg: number;       // theta0 / s0 degrees
  shoulderDeg: number;   // theta1 / ssh degrees
  elbowDeg: number;      // theta2 / sel degrees
  baseRad: number;
  shoulderRad: number;
  elbowRad: number;
  m1_us: number;         // microsecond PWM: Motor 1 = Shoulder [1500, 2500]
  m2_us: number;         // microsecond PWM: Motor 2 = Base Yaw [1600, 2600]
  m3_us: number;         // microsecond PWM: Motor 3 = Elbow [1500, 2500]
}

export interface SlotData {
  letter: string;
  tier: 'inner' | 'outer';
  index: number;
  localX: number;
  localY: number;
  worldX: number;
  worldY: number;
  angle: number;
  radius: number;
}

export interface ComponentPositions {
  holder: Position2D;
  inkPad: Position2D;
  paper: Position2D;
}

export interface StrokeSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface StampedMark {
  id: string;
  letter: string;
  x: number; // relative to paper center (px)
  y: number; // relative to paper center (px)
  worldX: number;
  worldY: number;
  timestamp: string;
  color?: string;
  angle?: number; // radians of radial rotation (phi)
  yawDeg?: number; // degrees of rotation on paper
  rho?: number; // distance from base axis (mm)
  phi?: number; // azimuth from base axis (rad)
  strokes?: StrokeSegment[];
}

export type CyclePhase =
  | 'IDLE'
  | 'APPROACH_SLOT'
  | 'PICK_STAMP'
  | 'LIFT_STAMP'
  | 'MOVE_TO_INK'
  | 'DIP_INK'
  | 'MOVE_TO_PAPER'
  | 'STAMP_PAPER'
  | 'LIFT_PAPER'
  | 'RETURN_TO_SLOT'
  | 'PUT_DOWN_HOLDER'
  | 'WIPE_OUTWARD'
  | 'RELEASE_STAMP'
  | 'RETURN_HOME';

export interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
  level: 'info' | 'success' | 'warn' | 'error' | 'kinematics';
}

export interface SerialCommand {
  id: string;
  timestamp: string;
  m1_us: number;
  m2_us: number;
  m3_us: number;
  note?: string;
}

export interface ArmParameters {
  L1: number; // mm (Base height = 100mm in RASTICrane, 0.10m)
  L2: number; // mm (Upper arm = 120mm in RASTICrane, 0.12m)
  L3: number; // mm (Forearm = 120mm in RASTICrane, 0.12m)
  scale: number; // mm to px
  elbowUp: boolean;
}

export interface AprilTagPose {
  id: number;
  name: string;
  worldX: number; // mm in robot frame (U)
  worldY: number; // mm in robot frame (V)
  z: number;      // mm in robot frame (W)
  yawDeg: number;
  detected: boolean;
  corners: [Position2D, Position2D, Position2D, Position2D];
  hammingError: number;
  camTranslation?: [number, number, number]; // [X, Y, Z] in meters
}
