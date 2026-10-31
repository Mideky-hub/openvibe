import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useMessages } from "@/i18n";
import { fitView, layoutGraph, neighbours, zoomAt, type Layout, type Point, type View } from "./graph";
import { edges, type LinkedNote } from "./links";
import { notesMessages } from "./messages";

/** Past this, a press is a drag, not a click. */
const DRAG_THRESHOLD = 4;
const ZOOM_STEP = 1.15;
/** Under this scale the labels of notes not hovered would only overlap. */
const LABELS_FROM = 0.55;
const FALLBACK_SIZE = { width: 800, height: 600 };

type Gesture = { kind: "pan"; from: Point; view: View } | { kind: "note"; name: string; from: Point; at: Point; moved: boolean };

interface Props {
  notes: readonly LinkedNote[];
  current: string | null;
  onOpen: (name: string) => void;
}

/** The notes and their links, in SVG: wheel to zoom, drag the background or a note, click to open (spec notes §3). */
export function NoteGraph({ notes, current, onOpen }: Props) {
  const t = useMessages(notesMessages);
  const links = useMemo(() => edges(notes), [notes]);
  const names = useMemo(() => notes.map((note) => note.name), [notes]);
  // By content: a refreshed list that says the same must not move the notes nor reset the view.
  const shape = JSON.stringify([names, links]);
  const computed = useMemo(() => layoutGraph(names, links), [shape]);
  const [moved, setMoved] = useState<Layout>({});
  const layout = useMemo(() => ({ ...computed, ...moved }), [computed, moved]);
  const svg = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const gesture = useRef<Gesture | null>(null);

  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const { width, height } = element.getBoundingClientRect();
    setView(fitView(computed, width > 0 && height > 0 ? { width, height } : FALLBACK_SIZE));
  }, [computed]);

  const near = useMemo(() => (hovered ? neighbours(hovered, links) : null), [hovered, links]);

  if (notes.length === 0) return <p className="grid flex-1 place-items-center p-6 text-center text-xs text-ov-text-2">{t.graphEmpty}</p>;

  const pointerOf = (event: { clientX: number; clientY: number }): Point => {
    const box = svg.current?.getBoundingClientRect();
    return { x: event.clientX - (box?.left ?? 0), y: event.clientY - (box?.top ?? 0) };
  };

  const press = (event: ReactPointerEvent, next: Gesture) => {
    event.stopPropagation();
    svg.current?.setPointerCapture?.(event.pointerId);
    gesture.current = next;
  };

  const drag = (event: ReactPointerEvent) => {
    const active = gesture.current;
    if (!active || !view) return;
    const pointer = pointerOf(event);
    const dx = pointer.x - active.from.x;
    const dy = pointer.y - active.from.y;
    if (active.kind === "pan") {
      setView({ ...active.view, x: active.view.x + dx, y: active.view.y + dy });
    } else if (active.moved || Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      active.moved = true;
      setMoved((placed) => ({ ...placed, [active.name]: { x: active.at.x + dx / view.scale, y: active.at.y + dy / view.scale } }));
    }
  };

  const release = () => {
    const active = gesture.current;
    gesture.current = null;
    if (active?.kind === "note" && !active.moved) onOpen(active.name);
  };

  const faded = (name: string) => near !== null && !near.has(name);

  return (
    <svg
      ref={svg}
      data-graph
      role="group"
      aria-label={t.graphLabel}
      className="min-h-0 min-w-0 flex-1 cursor-grab touch-none select-none active:cursor-grabbing"
      onWheel={(event) => view && setView(zoomAt(view, pointerOf(event), event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP))}
      onPointerDown={(event) => view && press(event, { kind: "pan", from: pointerOf(event), view })}
      onPointerMove={drag}
      onPointerUp={release}
      onPointerCancel={() => (gesture.current = null)}
    >
      {view && (
        <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
          {links.map((link) => {
            const from = layout[link.from];
            const to = layout[link.to];
            const lit = hovered === link.from || hovered === link.to;
            return (
              <line
                key={`${link.from}/${link.to}`}
                data-graph-link
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={lit ? "var(--ov-accent)" : "var(--ov-text-3)"}
                strokeOpacity={lit ? 1 : near ? 0.15 : 0.45}
                strokeWidth={1 / view.scale}
              />
            );
          })}
          {notes.map(({ name }) => {
            const { x, y } = layout[name];
            const open = name === current;
            const degree = links.filter((link) => link.from === name || link.to === name).length;
            const radius = 5 + Math.min(degree, 9);
            return (
              <g
                key={name}
                data-graph-note={name}
                role="button"
                tabIndex={0}
                aria-label={name}
                aria-current={open}
                transform={`translate(${x} ${y})`}
                opacity={faded(name) ? 0.3 : 1}
                className="cursor-pointer outline-none"
                onPointerDown={(event) => press(event, { kind: "note", name, from: pointerOf(event), at: { x, y }, moved: false })}
                onPointerEnter={() => setHovered(name)}
                onPointerLeave={() => setHovered(null)}
                onFocus={() => setHovered(name)}
                onBlur={() => setHovered(null)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  onOpen(name);
                }}
              >
                <circle
                  r={radius}
                  fill={open ? "var(--ov-accent)" : hovered === name ? "var(--ov-text)" : "var(--ov-text-3)"}
                  stroke={hovered === name ? "var(--ov-accent)" : "transparent"}
                  strokeWidth={2}
                />
                {(view.scale >= LABELS_FROM || hovered === name || open) && (
                  <text y={radius + 13 / view.scale} textAnchor="middle" fontSize={11.5 / view.scale} fill={open ? "var(--ov-text)" : "var(--ov-text-2)"}>
                    {name}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      )}
    </svg>
  );
}
