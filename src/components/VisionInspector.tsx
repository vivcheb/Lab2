import React from 'react';
import { AprilTagPose, Position3D } from '../types';
import { Camera, CheckCircle2, Crosshair, RefreshCw, Eye } from 'lucide-react';
import {
  getHolderPlateGeometry,
  radToDeg,
  TAG_BASE,
  TAG_STAMP_LEFT,
  TAG_STAMP_RIGHT,
  TAG_INK_PAD,
  TAG_PAPER,
  TAG_SIZE_METERS,
  R_INNER_MM,
  R_OUTER_MM,
  robotToCam,
} from '../utils/kinematics';

interface VisionInspectorProps {
  holderPos: { x: number; y: number };
  inkPadPos: { x: number; y: number };
  paperPos: { x: number; y: number };
  scale: number;
  showAprilTags: boolean;
  onCalibrateHolder: () => void;
  selectedLetter?: string;
}

export const VisionInspector: React.FC<VisionInspectorProps> = ({
  holderPos,
  inkPadPos,
  paperPos,
  scale,
  showAprilTags,
  onCalibrateHolder,
}) => {
  const plateGeo = getHolderPlateGeometry(scale);

  // Base tag positioned directly at world origin [0,0,0] (tagId_base = 2)
  const baseTagRob: Position3D = {
    x: 0,
    y: 0,
    z: 0.0,
  };

  // Compute exact Robot Base coordinates (in mm) from canvas workspace layout
  const leftTagRob: Position3D = {
    x: (holderPos.x + plateGeo.tag0Local.x) / scale,
    y: (-holderPos.y - plateGeo.tag0Local.y) / scale,
    z: 10.0,
  };

  const rightTagRob: Position3D = {
    x: (holderPos.x + plateGeo.tag1Local.x) / scale,
    y: (-holderPos.y - plateGeo.tag1Local.y) / scale,
    z: 10.0,
  };

  const inkPadTagRob: Position3D = {
    x: inkPadPos.x / scale,
    y: (-inkPadPos.y + 58 * scale) / scale,
    z: 15.0,
  };

  const paperTagRob: Position3D = {
    x: (paperPos.x - (279.4 / 2 - 30) * scale) / scale,
    y: (-paperPos.y + (215.9 / 2 - 30) * scale) / scale,
    z: 5.0,
  };

  const baseCam = robotToCam({
    x: baseTagRob.x / 1000,
    y: baseTagRob.y / 1000,
    z: baseTagRob.z / 1000,
  });
  const leftCam = robotToCam({
    x: leftTagRob.x / 1000,
    y: leftTagRob.y / 1000,
    z: leftTagRob.z / 1000,
  });
  const rightCam = robotToCam({
    x: rightTagRob.x / 1000,
    y: rightTagRob.y / 1000,
    z: rightTagRob.z / 1000,
  });
  const inkCam = robotToCam({
    x: inkPadTagRob.x / 1000,
    y: inkPadTagRob.y / 1000,
    z: inkPadTagRob.z / 1000,
  });
  const paperCam = robotToCam({
    x: paperTagRob.x / 1000,
    y: paperTagRob.y / 1000,
    z: paperTagRob.z / 1000,
  });

  // Calculate pRackOrigin = (pTagLeft + pTagRight) / 2 matching MATLAB:
  const rackOriginRob: Position3D = {
    x: (leftTagRob.x + rightTagRob.x) / 2,
    y: (leftTagRob.y + rightTagRob.y) / 2,
    z: (leftTagRob.z + rightTagRob.z) / 2,
  };

  const tags: AprilTagPose[] = [
    {
      id: TAG_BASE,
      name: `tagId_base = 2 (Base tag at world origin [0,0,0])`,
      worldX: Number(baseTagRob.x.toFixed(1)),
      worldY: Number(baseTagRob.y.toFixed(1)),
      z: baseTagRob.z,
      yawDeg: 0,
      detected: showAprilTags,
      hammingError: 0,
      corners: [
        { x: -25, y: -25 },
        { x: 25, y: -25 },
        { x: 25, y: 25 },
        { x: -25, y: 25 },
      ],
      camTranslation: [Number(baseCam.x.toFixed(3)), Number(baseCam.y.toFixed(3)), Number(baseCam.z.toFixed(3))],
    },
    {
      id: TAG_STAMP_LEFT,
      name: `tagId_rackA = 0 (Stamp rack reference tag 0 / under A-C)`,
      worldX: Number(leftTagRob.x.toFixed(1)),
      worldY: Number(leftTagRob.y.toFixed(1)),
      z: leftTagRob.z,
      yawDeg: Number(radToDeg(plateGeo.thetaL + Math.PI / 2).toFixed(1)),
      detected: showAprilTags,
      hammingError: 0,
      corners: [
        { x: -25, y: -25 },
        { x: 25, y: -25 },
        { x: 25, y: 25 },
        { x: -25, y: 25 },
      ],
      camTranslation: [Number(leftCam.x.toFixed(3)), Number(leftCam.y.toFixed(3)), Number(leftCam.z.toFixed(3))],
    },
    {
      id: TAG_STAMP_RIGHT,
      name: `tagId_rackB = 1 (Stamp rack reference tag 1 / under K-L-M)`,
      worldX: Number(rightTagRob.x.toFixed(1)),
      worldY: Number(rightTagRob.y.toFixed(1)),
      z: rightTagRob.z,
      yawDeg: Number(radToDeg(plateGeo.thetaR + Math.PI / 2).toFixed(1)),
      detected: showAprilTags,
      hammingError: 0,
      corners: [
        { x: -25, y: -25 },
        { x: 25, y: -25 },
        { x: 25, y: 25 },
        { x: -25, y: 25 },
      ],
      camTranslation: [Number(rightCam.x.toFixed(3)), Number(rightCam.y.toFixed(3)), Number(rightCam.z.toFixed(3))],
    },
    {
      id: TAG_INK_PAD,
      name: `tagId_ink = 3 (Ink pad tag)`,
      worldX: Number(inkPadTagRob.x.toFixed(1)),
      worldY: Number(inkPadTagRob.y.toFixed(1)),
      z: inkPadTagRob.z,
      yawDeg: 0,
      detected: showAprilTags,
      hammingError: 0,
      corners: [
        { x: -25, y: -25 },
        { x: 25, y: -25 },
        { x: 25, y: 25 },
        { x: -25, y: 25 },
      ],
      camTranslation: [Number(inkCam.x.toFixed(3)), Number(inkCam.y.toFixed(3)), Number(inkCam.z.toFixed(3))],
    },
    {
      id: TAG_PAPER,
      name: `tagId_paper = 5 (Paper pad tag)`,
      worldX: Number(paperTagRob.x.toFixed(1)),
      worldY: Number(paperTagRob.y.toFixed(1)),
      z: paperTagRob.z,
      yawDeg: 0,
      detected: showAprilTags,
      hammingError: 0,
      corners: [
        { x: -25, y: -25 },
        { x: 25, y: -25 },
        { x: 25, y: 25 },
        { x: -25, y: 25 },
      ],
      camTranslation: [Number(paperCam.x.toFixed(3)), Number(paperCam.y.toFixed(3)), Number(paperCam.z.toFixed(3))],
    },
  ];

  return (
    <div className="flex flex-col gap-3 h-full overflow-y-auto pr-1 text-slate-200">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Camera className="w-5 h-5 text-purple-400" />
          <h3 className="font-semibold text-slate-100 text-sm">
            ME416 Vision Pipeline & Table Homography (H)
          </h3>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono text-[11px]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            5/5 Fiducials Detected
          </span>
          <button
            onClick={onCalibrateHolder}
            className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 transition"
          >
            <RefreshCw className="w-3 h-3 text-purple-400" />
            <span>Recalibrate H</span>
          </button>
        </div>
      </div>

      {/* Vision Pipeline Chain from Handout Page 3 */}
      <div className="p-2.5 bg-slate-900/90 rounded border border-purple-500/30 text-xs font-mono">
        <span className="text-slate-400 text-[10px] block mb-1">
          ME416 Lab 2 Handout Pipeline Chain (Section 3):
        </span>
        <div className="flex items-center gap-2 text-[11px] text-purple-300 font-semibold overflow-x-auto pb-0.5">
          <span className="bg-slate-950 px-2 py-1 rounded border border-slate-800">camera frame</span>
          <span className="text-slate-500">&rarr;</span>
          <span className="bg-slate-950 px-2 py-1 rounded border border-slate-800 text-emerald-300">base tag &rarr; H</span>
          <span className="text-slate-500">&rarr;</span>
          <span className="bg-slate-950 px-2 py-1 rounded border border-slate-800 text-sky-300">stamp, ink, paper tags &rarr; [U, V]ᵀ</span>
          <span className="text-slate-500">&rarr;</span>
          <span className="bg-slate-950 px-2 py-1 rounded border border-slate-800 text-amber-300">rasticraneIk &rarr; θ</span>
        </div>
      </div>

      {/* Camera Intrinsics & Calibration Specs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs font-mono">
        <div className="p-2.5 bg-slate-900/90 rounded border border-slate-800">
          <span className="text-slate-400 text-[10px] block">tagFamily:</span>
          <span className="text-purple-300 font-semibold">tag36h11</span>
        </div>
        <div className="p-2.5 bg-slate-900/90 rounded border border-slate-800">
          <span className="text-slate-400 text-[10px] block">tagSize L:</span>
          <span className="text-sky-300 font-semibold">{TAG_SIZE_METERS} m (50 mm)</span>
        </div>
        <div className="p-2.5 bg-slate-900/90 rounded border border-slate-800">
          <span className="text-slate-400 text-[10px] block">Camera K:</span>
          <span className="text-amber-300 font-semibold">f=[800,800] c=[320,240]</span>
        </div>
        <div className="p-2.5 bg-slate-900/90 rounded border border-slate-800">
          <span className="text-slate-400 text-[10px] block">World Frame [U,V,W]:</span>
          <span className="text-emerald-300 font-semibold">Table W = 0</span>
        </div>
      </div>

      {/* AprilTag Poses Table */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-400 font-medium px-1">
          <span>Detected Workspace AprilTags (Camera Frame &rarr; World Frame [U, V, W]ᵀ)</span>
          <span className="font-mono text-[10px]">U: lateral, V: forward, W: vertical</span>
        </div>

        {tags.map((tag) => (
          <div
            key={tag.id}
            className="p-3 bg-slate-900/80 rounded-lg border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs font-mono"
          >
            <div className="flex items-start gap-2.5">
              <div className="p-1.5 rounded bg-purple-950/60 text-purple-400 border border-purple-800/60 mt-0.5">
                <Crosshair className="w-4 h-4" />
              </div>
              <div>
                <div className="font-semibold text-slate-200 flex items-center gap-2">
                  <span>{tag.name}</span>
                  <span className="text-[10px] px-1.5 py-0.2 bg-purple-500/20 text-purple-300 rounded border border-purple-500/30">
                    ID #{tag.id}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Camera Translation [X, Y, Z] (meters):{' '}
                  <span className="text-purple-300 font-semibold">
                    [{tag.camTranslation?.join(', ')}] m
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 bg-slate-950/80 px-3 py-2 rounded border border-slate-800/80 text-right">
              <div>
                <span className="text-slate-500 block text-[10px]">U (mm)</span>
                <span className="text-sky-400 font-semibold">{tag.worldX.toFixed(1)}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">V (mm)</span>
                <span className="text-sky-400 font-semibold">{tag.worldY.toFixed(1)}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">W (mm)</span>
                <span className="text-emerald-400 font-semibold">{tag.z.toFixed(1)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
