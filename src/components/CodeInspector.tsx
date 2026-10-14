import React, { useState } from 'react';
import { SlotData, Position2D, Position3D } from '../types';
import {
  solve3DOF_IK,
  TAG_BASE,
  TAG_RACK_A,
  TAG_RACK_B,
  TAG_STAMP_LEFT,
  TAG_STAMP_RIGHT,
  TAG_INK_PAD,
  TAG_PAPER,
  R_INNER_MM,
  R_OUTER_MM,
  THETA_START_RAD,
  THETA_END_RAD,
  radToDeg,
} from '../utils/kinematics';
import { Copy, Check, Terminal, FileCode2 } from 'lucide-react';

interface CodeInspectorProps {
  slots: SlotData[];
  selectedLetter: string;
  inkPos: Position2D;
  paperPos: Position2D;
  scale: number;
}

export const CodeInspector: React.FC<CodeInspectorProps> = ({
  slots,
  selectedLetter,
  inkPos,
  paperPos,
  scale,
}) => {
  const [tab, setTab] = useState<'matlab' | 'serial'>('matlab');
  const [copied, setCopied] = useState(false);

  const slot = slots.find((s) => s.letter === selectedLetter);
  const slotPosRob: Position3D = {
    x: slot ? slot.worldX / scale : 150,
    y: slot ? -slot.worldY / scale : 0,
    z: 10,
  };
  const inkPosRob: Position3D = {
    x: inkPos.x / scale,
    y: -inkPos.y / scale,
    z: 15,
  };
  const paperPosRob: Position3D = {
    x: paperPos.x / scale,
    y: -paperPos.y / scale,
    z: 5,
  };

  // Compute sample IK and motor commands for each step
  const ikSlotHover = solve3DOF_IK(slotPosRob.x, slotPosRob.y, slotPosRob.z + 50);
  const ikSlotGrasp = solve3DOF_IK(slotPosRob.x, slotPosRob.y, slotPosRob.z);
  const ikInkHover = solve3DOF_IK(inkPosRob.x, inkPosRob.y, inkPosRob.z + 50);
  const ikInkPress = solve3DOF_IK(inkPosRob.x, inkPosRob.y, inkPosRob.z);
  const ikPaperHover = solve3DOF_IK(paperPosRob.x, paperPosRob.y, paperPosRob.z + 50);
  const ikPaperContact = solve3DOF_IK(paperPosRob.x, paperPosRob.y, paperPosRob.z);

  const matlabScript = `% =========================================================================
%                  MATLAB 3-DOF ROBOT ARM STAMPING CONTROLLER              
% =========================================================================

clear; clc;

% --- 1. Connect to ESP32-S3 over Serial ---
portName = "COM3"; % Update to match your ESP32 COM port
baudRate = 115200;

s = serialport(portName, baudRate);
configureTerminator(s, "LF"); % Set newline character
pause(2); % Wait for ESP32 serial interface to settle

% Auto-cleanup serial object when script terminates
cleanupObj = onCleanup(@() clear("s"));

% --- 2. Setup Camera and AprilTag Detector ---
cam = webcam(1);
tagFamily = "tag36h11";
detector = apriltagDetector(tagFamily);

% Camera intrinsic parameters (Calibrate using cameraCalibrator app)
focalLength    = [800, 800]; 
principalPoint = [320, 240];
imageSize      = [640, 480];
intrinsics     = cameraIntrinsics(focalLength, principalPoint, imageSize);
tagSize        = 0.05; % Tag size in meters (0.05m = 50mm)

% Tag ID Assignments matching physical layout
tagId_base  = ${TAG_BASE};   % Base tag at world origin [0,0,0]
tagId_ink   = ${TAG_INK_PAD};   % Ink pad tag
tagId_paper = ${TAG_PAPER};   % Paper pad tag 
tagId_rackA = ${TAG_RACK_A};   % Stamp rack reference tag 0
tagId_rackB = ${TAG_RACK_B};   % Stamp rack reference tag 1

% Stamp Rack Radial Geometry Configuration (in meters / radians)
R_INNER     = ${(R_INNER_MM / 1000).toFixed(3)};            % Distance from rack origin to inner arc (A-M)
R_OUTER     = ${(R_OUTER_MM / 1000).toFixed(3)};            % Distance from rack origin to outer arc (N-Z)
THETA_START = deg2rad(${Math.round(radToDeg(THETA_START_RAD))});    % Angular start of arc (left side)
THETA_END   = deg2rad(${Math.round(radToDeg(THETA_END_RAD))});     % Angular end of arc (right side)

% --- 3. Prompt User for Letter Input ---
userInput = '${selectedLetter}';
fprintf('\\nStarting workspace scan to execute letter: %s...\\n', userInput);

% --- 4. Detect AprilTags & Locate Workspace Objects ---
tagPoses = containers.Map('KeyType','int32','ValueType','any');

while numel(keys(tagPoses)) < 5
    img = snapshot(cam);
    grayImg = rgb2gray(img);
    [ids, ~, poses] = readAprilTag(grayImg, tagFamily, intrinsics, tagSize);
    
    for i = 1:length(ids)
        tagPoses(ids(i)) = poses(i).Translation; % [X, Y, Z] in camera frame
    end
    fprintf('Detected %d/5 tags...\\n', numel(keys(tagPoses)));
    pause(0.1);
end

disp('All AprilTags detected successfully!');

% Convert key tag camera poses to Robot Base Frame
pTagBase  = camToRobot(tagPoses(tagId_base));  % World origin [0, 0, 0]
pTagRackA = camToRobot(tagPoses(tagId_rackA)); % Reference tag 0 (under ABC)
pTagRackB = camToRobot(tagPoses(tagId_rackB)); % Reference tag 1 (under KLM)
pInk      = camToRobot(tagPoses(tagId_ink));   % Ink pad tag
pPaper    = camToRobot(tagPoses(tagId_paper)); % Paper pad tag

% Center midpoint between tagId_rackA and tagId_rackB acts as origin for stamp arc
pRackOrigin = (pTagRackA + pTagRackB) / 2;

% Calculate 3D pick coordinate for the requested letter stamp
pStamp = getStampLocation(userInput, pRackOrigin, R_INNER, R_OUTER, THETA_START, THETA_END);

% --- 5. Execute Stamping & Drawing Sequence ---
fprintf('1/4: Picking up Stamp [%s]...\\n', userInput);
moveToPosition(s, pStamp(1), pStamp(2), pStamp(3) + 0.05); % Hover above stamp
moveToPosition(s, pStamp(1), pStamp(2), pStamp(3));        % Lower to grasp
moveToPosition(s, pStamp(1), pStamp(2), pStamp(3) + 0.05); % Lift up

disp('2/4: Re-inking Stamp on Ink Pad...');
moveToPosition(s, pInk(1), pInk(2), pInk(3) + 0.05);       % Hover above ink pad
moveToPosition(s, pInk(1), pInk(2), pInk(3));              % Press into ink
pause(0.5);
moveToPosition(s, pInk(1), pInk(2), pInk(3) + 0.05);       % Lift up

fprintf('3/4: Drawing letter %s on Paper...\\n', userInput);
moveToPosition(s, pPaper(1), pPaper(2), pPaper(3) + 0.05); % Hover over paper
drawLetter(s, userInput, pPaper);                          % Trace letter strokes

disp('4/4: Returning Stamp to Holder...');
moveToPosition(s, pStamp(1), pStamp(2), pStamp(3) + 0.05);
moveToPosition(s, pStamp(1), pStamp(2), pStamp(3));

disp('Task complete!');


% =========================================================================
%                             HELPER FUNCTIONS
% =========================================================================

% Transforms 3D Camera coordinates to Robot Base coordinates
function pRob = camToRobot(pCam)
    x_robot = pCam(3);       
    y_robot = -pCam(1);
    z_robot = -pCam(2);
    pRob = [x_robot, y_robot, z_robot];
end

% Interpolates exact Cartesian position of a stamp along polar arcs (A-M / N-Z)
function pStamp = getStampLocation(letter, pRackOrigin, r_inner, r_outer, theta_start, theta_end)
    if ismember(letter, 'A':'M')
        idx = letter - 'A'; % Index 0 to 12
        radius = r_inner;
        numStamps = 13;
    elseif ismember(letter, 'N':'Z')
        idx = letter - 'N'; % Index 0 to 12
        radius = r_outer;
        numStamps = 13;
    else
        error('Invalid character provided.');
    end
    
    % Interpolate polar angle for requested stamp
    theta = theta_start + idx * (theta_end - theta_start) / (numStamps - 1);
    
    % Polar to Cartesian translation offset relative to rack origin
    x_offset = radius * cos(theta);
    y_offset = radius * sin(theta);
    
    pStamp = [pRackOrigin(1) + x_offset, pRackOrigin(2) + y_offset, pRackOrigin(3)];
end

% Solves IK and streams motor commands directly to ESP32 over Serial
function moveToPosition(s, x, y, z)
    [base_deg, shoulder_deg, elbow_deg] = solve3DOF_IK(x, y, z);
    
    % Map joint angles to microsecond pulse widths [1500, 2500] (0 deg = 1500us, +90 deg = 2500us)
    m1_us = mapAngleToUs(abs(base_deg),     0, 90, 1500, 2500);
    m2_us = mapAngleToUs(abs(shoulder_deg), 0, 90, 1500, 2500);
    m3_us = mapAngleToUs(abs(elbow_deg),    0, 90, 1500, 2500);
    
    % Write plain-text Serial string expected by Arduino loop()
    writeline(s, sprintf('M1 %d', m1_us));
    writeline(s, sprintf('M2 %d', m2_us));
    writeline(s, sprintf('M3 %d', m3_us));
    
    pause(0.4); % Allow physical motion update time
end

% Traces stroke trajectories for character execution on paper
function drawLetter(s, letter, paperOrigin)
    x0 = paperOrigin(1);
    y0 = paperOrigin(2);
    z0 = paperOrigin(3); % Paper contact plane
    scale = 0.03; % Trajectory stroke scale (3 cm)
    
    switch letter
        case 'A'
            moveToPosition(s, x0 - scale/2, y0, z0);
            moveToPosition(s, x0, y0 + scale, z0);
            moveToPosition(s, x0 + scale/2, y0, z0);
            moveToPosition(s, x0 + scale/2, y0, z0 + 0.02);
            moveToPosition(s, x0 - scale/4, y0 + scale/2, z0 + 0.02);
            moveToPosition(s, x0 - scale/4, y0 + scale/2, z0);
            moveToPosition(s, x0 + scale/4, y0 + scale/2, z0);
        case 'H'
            moveToPosition(s, x0 - scale/2, y0, z0);
            moveToPosition(s, x0 - scale/2, y0 + scale, z0);
            moveToPosition(s, x0 - scale/2, y0 + scale, z0 + 0.02);
            moveToPosition(s, x0 + scale/2, y0, z0 + 0.02);
            moveToPosition(s, x0 + scale/2, y0, z0);
            moveToPosition(s, x0 + scale/2, y0 + scale, z0);
            moveToPosition(s, x0 + scale/2, y0 + scale, z0 + 0.02);
            moveToPosition(s, x0 - scale/2, y0 + scale/2, z0 + 0.02);
            moveToPosition(s, x0 - scale/2, y0 + scale/2, z0);
            moveToPosition(s, x0 + scale/2, y0 + scale/2, z0);
        case 'L'
            moveToPosition(s, x0 - scale/2, y0 + scale, z0);
            moveToPosition(s, x0 - scale/2, y0, z0);
            moveToPosition(s, x0 + scale/2, y0, z0);
        otherwise
            moveToPosition(s, x0, y0, z0);
            pause(0.2);
    end
    moveToPosition(s, x0, y0, z0 + 0.05);
end

% Linear mapping helper for joint angles to microsecond PWM pulse width
function us = mapAngleToUs(angleDeg, minDeg, maxDeg, minUs, maxUs)
    clampedAngle = max(minDeg, min(maxDeg, angleDeg));
    us = round(minUs + (clampedAngle - minDeg) * (maxUs - minUs) / (maxDeg - minDeg));
    us = max(1500, min(2500, us));
end

% 3-DOF Analytical Inverse Kinematics solver
function [base_deg, shoulder_deg, elbow_deg] = solve3DOF_IK(x, y, z)
    L1 = 0.10; % Base height (m)
    L2 = 0.12; % Upper arm length (m)
    L3 = 0.12; % Forearm length (m)
    
    base_rad = atan2(y, x);
    r = sqrt(x^2 + y^2);
    z_adj = z - L1;
    D = sqrt(r^2 + z_adj^2);
    
    cos_elbow = (D^2 - L2^2 - L3^2) / (2 * L2 * L3);
    cos_elbow = max(-1, min(1, cos_elbow));
    elbow_rad = acos(cos_elbow);
    
    alpha = atan2(z_adj, r);
    beta = atan2(L3 * sin(elbow_rad), L2 + L3 * cos(elbow_rad));
    shoulder_rad = alpha + beta;
    
    base_deg     = rad2deg(base_rad);
    shoulder_deg = rad2deg(shoulder_rad);
    elbow_deg    = rad2deg(elbow_rad);
end`;

  const serialStream = `// =========================================================================
//            ESP32-S3 SERIAL DATA MONITOR (COM3 @ 115200 BAUD)
// =========================================================================
// Plain-text ASCII string format:
//   M1 <PWM_us>  (Base Yaw Servo, range [1300, 1700] us)
//   M2 <PWM_us>  (Shoulder Servo, range [1300, 1700] us)
//   M3 <PWM_us>  (Elbow Servo,    range [1300, 1700] us)

[00:00.00] CONNECTED: COM3 @ 115200 baud (ESP32-S3 Terminator: LF)
[00:00.02] INITIALIZING: Camera stream (640x480, tag36h11)
[00:00.12] APRILTAG DETECTED: TAG ${TAG_BASE} (tagId_base = 2, Base tag at world origin [0,0,0])
[00:00.15] APRILTAG DETECTED: TAG ${TAG_RACK_A} (tagId_rackA = 0, Stamp rack reference tag 0)
[00:00.18] APRILTAG DETECTED: TAG ${TAG_RACK_B} (tagId_rackB = 1, Stamp rack reference tag 1)
[00:00.22] APRILTAG DETECTED: TAG ${TAG_INK_PAD} (tagId_ink = 3, Ink pad tag)
[00:00.25] APRILTAG DETECTED: TAG ${TAG_PAPER} (tagId_paper = 5, Paper pad tag)
[00:00.30] RACK ORIGIN COMPUTED: pRackOrigin = (pTagRackA + pTagRackB) / 2

// --- 1/4: Picking up Stamp ['${selectedLetter}'] ---
// Hover above slot (z + 0.05m):
M1 ${ikSlotHover?.m1_us || 1500}
M2 ${ikSlotHover?.m2_us || 1480}
M3 ${ikSlotHover?.m3_us || 1520}
// Lower to grasp (z):
M1 ${ikSlotGrasp?.m1_us || 1500}
M2 ${ikSlotGrasp?.m2_us || 1420}
M3 ${ikSlotGrasp?.m3_us || 1580}
// Lift up (z + 0.05m):
M1 ${ikSlotHover?.m1_us || 1500}
M2 ${ikSlotHover?.m2_us || 1480}
M3 ${ikSlotHover?.m3_us || 1520}

// --- 2/4: Re-inking Stamp on Ink Pad ---
// Hover above ink pad (z + 0.05m):
M1 ${ikInkHover?.m1_us || 1350}
M2 ${ikInkHover?.m2_us || 1480}
M3 ${ikInkHover?.m3_us || 1520}
// Press into ink (z):
M1 ${ikInkPress?.m1_us || 1350}
M2 ${ikInkPress?.m2_us || 1410}
M3 ${ikInkPress?.m3_us || 1600}
// Lift up (z + 0.05m):
M1 ${ikInkHover?.m1_us || 1350}
M2 ${ikInkHover?.m2_us || 1480}
M3 ${ikInkHover?.m3_us || 1520}

// --- 3/4: Drawing letter '${selectedLetter}' on Paper ---
// Hover over paper (z + 0.05m):
M1 ${ikPaperHover?.m1_us || 1650}
M2 ${ikPaperHover?.m2_us || 1480}
M3 ${ikPaperHover?.m3_us || 1520}
// Contact plane (z):
M1 ${ikPaperContact?.m1_us || 1650}
M2 ${ikPaperContact?.m2_us || 1420}
M3 ${ikPaperContact?.m3_us || 1590}

// --- 4/4: Returning Stamp to Holder ---
// Hover above slot (z + 0.05m):
M1 ${ikSlotHover?.m1_us || 1500}
M2 ${ikSlotHover?.m2_us || 1480}
M3 ${ikSlotHover?.m3_us || 1520}
// Lower to release (z):
M1 ${ikSlotGrasp?.m1_us || 1500}
M2 ${ikSlotGrasp?.m2_us || 1420}
M3 ${ikSlotGrasp?.m3_us || 1580}

[00:03.45] Task complete! All servos in standby.`;

  const copyToClipboard = () => {
    const text = tab === 'matlab' ? matlabScript : serialStream;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-3 h-full overflow-hidden text-slate-200">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <FileCode2 className="w-5 h-5 text-amber-400" />
          <h3 className="font-semibold text-slate-100 text-sm">
            MATLAB Controller Script & ESP32-S3 Serial Feed
          </h3>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-slate-900 p-0.5 rounded border border-slate-800 text-xs font-medium">
            <button
              onClick={() => setTab('matlab')}
              className={`px-3 py-1 rounded transition ${
                tab === 'matlab'
                  ? 'bg-amber-600 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              MATLAB Script (.m)
            </button>
            <button
              onClick={() => setTab('serial')}
              className={`px-3 py-1 rounded transition ${
                tab === 'serial'
                  ? 'bg-purple-600 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              ESP32 Serial Stream
            </button>
          </div>

          <button
            onClick={copyToClipboard}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs border border-slate-700 transition"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 bg-slate-950 rounded-lg border border-slate-800 overflow-hidden flex flex-col font-mono text-xs">
        <div className="px-3 py-1.5 bg-slate-900/80 border-b border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5 text-amber-400" />
            {tab === 'matlab'
              ? 'robot_arm_stamping_controller.m — Complete 3-DOF Kinematics & Vision Loop'
              : 'Serial COM3 Monitor (115200 baud, LF terminator)'}
          </span>
          <span className="text-slate-500 font-mono text-[10px]">
            Target: Letter '{selectedLetter}'
          </span>
        </div>

        <pre className="flex-1 p-3.5 overflow-auto text-slate-300 font-mono text-[11px] leading-relaxed select-all">
          {tab === 'matlab' ? matlabScript : serialStream}
        </pre>
      </div>
    </div>
  );
};
