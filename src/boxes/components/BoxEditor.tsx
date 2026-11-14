import { useMantineTheme } from '@mantine/core';
import { useRef, useState, type PointerEvent, type RefObject } from 'react';
import type { Crop } from '../../shared/types';
import type { Box } from '../types';

interface Props {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  region: Crop;
  /** The detector's guess, drawn dashed. */
  guess: Box | null;
  /** The boxes that Enter will save: the ones drawn, or the saved answer. Drawn solid. */
  boxes: Box[];
  /** Saved as "no ball": the frame gets a red outline. */
  noBall: boolean;
  /** Size of the box a single click places, in video pixels. */
  clickSize: number;
  /** A finished box. `add` is true when Shift was held: keep the other boxes. */
  onBox: (b: Box, add: boolean) => void;
}

/** Drags shorter than this many screen pixels count as a click. */
const CLICK_PX = 4;

/**
 * The frame's region, with an overlay for drawing the ball's box. The overlay's coordinates are video pixels,
 * so boxes need no conversion. Drag to draw a box; click to place one of `clickSize` centered there.
 */
export const BoxEditor = ({ canvasRef, region, guess, boxes, noBall, clickSize, onBox }: Props) => {
  const theme = useMantineTheme();
  const start = useRef<{ x: number; y: number; sx: number; sy: number; add: boolean } | null>(null);
  const [draft, setDraft] = useState<Box | null>(null);

  const toVideo = (e: PointerEvent<SVGSVGElement>) => {
    const m = e.currentTarget.getScreenCTM();
    const p = m ? new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()) : new DOMPoint();
    return { x: p.x, y: p.y };
  };
  const rect = (a: { x: number; y: number }, b: { x: number; y: number }): Box =>
    ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) });

  const down = (e: PointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toVideo(e);
    start.current = { ...p, sx: e.clientX, sy: e.clientY, add: e.shiftKey };
  };
  const move = (e: PointerEvent<SVGSVGElement>) => {
    if (start.current) setDraft(rect(start.current, toVideo(e)));
  };
  const up = (e: PointerEvent<SVGSVGElement>) => {
    const s = start.current;
    start.current = null;
    setDraft(null);
    if (!s) return;
    const p = toVideo(e);
    if (Math.hypot(e.clientX - s.sx, e.clientY - s.sy) < CLICK_PX) {
      onBox({ x: p.x - clickSize / 2, y: p.y - clickSize / 2, w: clickSize, h: clickSize }, s.add);
    } else {
      onBox(rect(s, p), s.add);
    }
  };

  const shown = draft ? [...(start.current?.add ? boxes : []), draft] : boxes;
  return (
    <div style={{ position: 'relative', width: 'min(100%, 720px)', aspectRatio: '1' }}>
      <canvas ref={canvasRef} width={region.side} height={region.side}
        style={{
          width: '100%', height: '100%', display: 'block', background: 'black', borderRadius: 'var(--mantine-radius-sm)',
          outline: noBall ? `3px solid ${theme.colors.red[6]}` : undefined,
        }} />
      <svg viewBox={`${region.x} ${region.y} ${region.side} ${region.side}`} onPointerDown={down} onPointerMove={move}
        onPointerUp={up} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'crosshair', touchAction: 'none' }}>
        {guess && !draft && (
          <rect x={guess.x} y={guess.y} width={guess.w} height={guess.h} fill="none" stroke={theme.colors.yellow[4]}
            strokeWidth={1.5} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
        )}
        {shown.map((b, i) => (
          <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} fill="none" stroke={theme.colors.green[5]}
            strokeWidth={2} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
    </div>
  );
};
