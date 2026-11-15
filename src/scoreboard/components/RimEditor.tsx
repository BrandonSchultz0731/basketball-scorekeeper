import { Box, Button, Group, Text } from '@mantine/core';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { BOX_HANDLE, type HOOP } from '../../shared/enums';
import { HOOP_COLOR } from '../../shared/theme';
import type { Region, Rim } from '../../shared/types';

interface Props {
  video: HTMLVideoElement;
  frame: { width: number; height: number };
  hoop: HOOP;
  name: string;
  /** The box to start from. */
  rim: Rim;
  onDone: (rim: Rim) => void;
  onCancel: () => void;
  /** Go back to tapping the rim on the whole picture, when it's somewhere else. */
  onElsewhere: () => void;
}

interface Box4 { left: number; right: number; top: number; bottom: number }

const toBox = (r: Rim): Box4 => ({
  left: r.x - r.width / 2, right: r.x + r.width / 2, top: r.y, bottom: r.netBottom ?? r.y + r.width,
});
const toRim = (b: Box4): Rim => ({ x: (b.left + b.right) / 2, y: b.top, width: b.right - b.left, netBottom: b.bottom });

/** The view: a square `widths` box-widths across, centered on the box, kept inside the frame where it fits. */
const viewAround = (b: Box4, widths: number, frame: { width: number; height: number }): Region => {
  const side = Math.min(Math.max(widths * (b.right - b.left), 40), frame.width, frame.height);
  const cx = (b.left + b.right) / 2, cy = (b.top + b.bottom) / 2;
  return {
    x: Math.max(0, Math.min(frame.width - side, cx - side / 2)),
    y: Math.max(0, Math.min(frame.height - side, cy - side / 2)),
    w: side, h: side,
  };
};

const CANVAS_PX = 720;

/**
 * A zoomed-in, live view around one rim, with its box. Drag a corner to resize, or the middle to move. Fine
 * placement is much easier here than on the whole picture, where a fingertip covers the rim.
 */
export const RimEditor = ({ video, frame, hoop, name, rim, onDone, onCancel, onElsewhere }: Props) => {
  const [box, setBox] = useState(() => toBox(rim));
  const [widths, setWidths] = useState(5);
  // The view only moves when zooming, not while dragging, so the picture doesn't slide under the finger.
  const [view, setView] = useState(() => viewAround(toBox(rim), 5, frame));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ handle: BOX_HANDLE; from: { x: number; y: number }; start: Box4 } | null>(null);

  // Draw the zoomed area of the live video on every animation frame, so you can wait for a clear view.
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return undefined;
    let handle = 0;
    const draw = () => {
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(video, view.x, view.y, view.w, view.h, 0, 0, CANVAS_PX, CANVAS_PX);
      handle = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(handle);
  }, [video, view]);

  const zoom = (k: number) => {
    const w = Math.min(Math.max(widths * k, 2.5), 20);
    setWidths(w);
    setView(viewAround(box, w, frame));
  };

  const point = (e: PointerEvent<SVGSVGElement>) => {
    const m = e.currentTarget.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };
  const grab = (handle: BOX_HANDLE) => (e: PointerEvent<SVGElement>) => {
    const svg = e.currentTarget.ownerSVGElement;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return;
    e.stopPropagation();
    svg.setPointerCapture(e.pointerId);
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    drag.current = { handle, from: { x: p.x, y: p.y }, start: box };
  };
  const move = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current, p = point(e);
    if (!d || !p) return;
    const dx = p.x - d.from.x, dy = p.y - d.from.y, s = d.start;
    const min = view.w / 40;
    const next = { ...s };
    if (d.handle === BOX_HANDLE.BODY) Object.assign(next, { left: s.left + dx, right: s.right + dx, top: s.top + dy, bottom: s.bottom + dy });
    if (d.handle === BOX_HANDLE.TOP_LEFT || d.handle === BOX_HANDLE.BOTTOM_LEFT) next.left = Math.min(s.left + dx, s.right - min);
    if (d.handle === BOX_HANDLE.TOP_RIGHT || d.handle === BOX_HANDLE.BOTTOM_RIGHT) next.right = Math.max(s.right + dx, s.left + min);
    if (d.handle === BOX_HANDLE.TOP_LEFT || d.handle === BOX_HANDLE.TOP_RIGHT) next.top = Math.min(s.top + dy, s.bottom - min);
    if (d.handle === BOX_HANDLE.BOTTOM_LEFT || d.handle === BOX_HANDLE.BOTTOM_RIGHT) next.bottom = Math.max(s.bottom + dy, s.top + min);
    setBox(next);
  };
  const release = () => { drag.current = null; };

  const color = `var(--mantine-color-${HOOP_COLOR[hoop]}-filled)`;
  const r = view.w / 28;  // corner handle radius, in video pixels
  const corners: [BOX_HANDLE, number, number][] = [
    [BOX_HANDLE.TOP_LEFT, box.left, box.top], [BOX_HANDLE.TOP_RIGHT, box.right, box.top],
    [BOX_HANDLE.BOTTOM_LEFT, box.left, box.bottom], [BOX_HANDLE.BOTTOM_RIGHT, box.right, box.bottom],
  ];

  return (
    <Box>
      <Text size="sm" mb={6}>
        Fit the box to the {name} rim: top of the rim to the bottom of the net, sides on the ends of the rim. Drag a
        corner to resize, or the middle to move it.
      </Text>
      <Box pos="relative" style={{ aspectRatio: '1', width: '100%', maxWidth: 480, marginInline: 'auto' }}>
        <canvas ref={canvasRef} width={CANVAS_PX} height={CANVAS_PX}
          style={{ width: '100%', height: '100%', display: 'block', background: 'black' }} />
        <svg viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          onPointerMove={move} onPointerUp={release} onPointerCancel={release}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none' }}>
          <rect x={box.left} y={box.top} width={box.right - box.left} height={box.bottom - box.top}
            fill="transparent" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke"
            style={{ cursor: 'move' }} onPointerDown={grab(BOX_HANDLE.BODY)} />
          {corners.map(([h, x, y]) => (
            <g key={h} onPointerDown={grab(h)} style={{ cursor: 'pointer' }}>
              {/* A bigger invisible circle, so a fingertip catches the handle. */}
              <circle cx={x} cy={y} r={2 * r} fill="transparent" />
              <circle cx={x} cy={y} r={r / 2} fill={color} stroke="white" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            </g>
          ))}
        </svg>
      </Box>
      <Group justify="space-between" mt="sm">
        <Group gap="xs">
          <Button size="xs" variant="default" onClick={() => zoom(1 / 1.5)}>Zoom in</Button>
          <Button size="xs" variant="default" onClick={() => zoom(1.5)}>Zoom out</Button>
          <Button size="xs" variant="subtle" onClick={onElsewhere}>It&apos;s somewhere else</Button>
        </Group>
        <Group gap="xs">
          <Button size="sm" variant="default" onClick={onCancel}>Cancel</Button>
          <Button size="sm" color={HOOP_COLOR[hoop]} onClick={() => onDone(toRim(box))}>Done</Button>
        </Group>
      </Group>
    </Box>
  );
};
