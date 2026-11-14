import type { MouseEvent } from 'react';
import type { HOOP } from '../../shared/enums';
import { HOOP_COLOR } from '../../shared/theme';
import type { Crop, Rim } from '../../shared/types';
import { HOOPS } from '../../shared/utils';

/** Rim marking in progress: which rim, and the left edge once it's been clicked. */
export interface RimMarking {
  hoop: HOOP;
  first: { x: number; y: number } | null;
}

interface Props {
  frame: { width: number; height: number };
  rims: Partial<Record<HOOP, Rim>>;
  names: Record<HOOP, string>;
  /** The area the detector will look at around each rim. */
  crops: Partial<Record<HOOP, Crop>>;
  marking: RimMarking | null;
  /** A click on the video while marking, in video pixels. */
  onPoint: (p: { x: number; y: number }) => void;
}

const colorVar = (hoop: HOOP) => `var(--mantine-color-${HOOP_COLOR[hoop]}-filled)`;

/**
 * Drawn over the video in video-pixel coordinates. The viewBox is the video's own size and the video keeps its
 * aspect ratio, so the two line up exactly. It only takes clicks while a rim is being marked, so the video's
 * own controls keep working otherwise.
 */
export const RimOverlay = ({ frame, rims, names, crops, marking, onPoint }: Props) => {
  const click = (e: MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const m = svg.getScreenCTM();
    if (!m) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    onPoint({ x: p.x, y: p.y });
  };
  const font = frame.height / 40;

  return (
    <svg viewBox={`0 0 ${frame.width} ${frame.height}`} preserveAspectRatio="xMidYMid meet" onClick={click}
      style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        pointerEvents: marking ? 'auto' : 'none', cursor: marking ? 'crosshair' : undefined,
      }}>
      {HOOPS.map((hoop) => {
        const rim = rims[hoop], crop = crops[hoop];
        if (!rim) return null;
        return (
          <g key={hoop} style={{ stroke: colorVar(hoop), fill: 'none' }}>
            {crop && (
              <rect x={crop.x} y={crop.y} width={crop.side} height={crop.side}
                strokeWidth={1.5} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
            )}
            <rect x={rim.x - rim.width / 2} y={rim.y} width={rim.width} height={(rim.netBottom ?? rim.y) - rim.y}
              strokeWidth={1} vectorEffect="non-scaling-stroke" />
            {crop && (
              <text x={crop.x} y={crop.y - font * 0.4} fontSize={font} style={{ fill: colorVar(hoop), stroke: 'none' }}>
                {names[hoop]} rim
              </text>
            )}
          </g>
        );
      })}
      {marking?.first && (
        <circle cx={marking.first.x} cy={marking.first.y} r={frame.height / 200}
          style={{ fill: colorVar(marking.hoop) }} />
      )}
    </svg>
  );
};
