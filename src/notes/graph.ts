import type { Edge } from "./links";

export interface Point {
  x: number;
  y: number;
}

export type Layout = Record<string, Point>;

export interface View extends Point {
  scale: number;
}

const ROUNDS = 240;
const REPULSION = 9000;
const SPRING = 0.04;
const REST_LENGTH = 90;
const GRAVITY = 0.012;
const MIN_SCALE = 0.2;
const MAX_SCALE = 3;
const MARGIN = 48;

/** Golden angle: starting points that never line up, so that two notes never push exactly head-on. */
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/**
 * Where each note sits, by a small force simulation (spec notes §3): notes
 * push each other away, links pull. Sorted first and free of chance, the same
 * notes always give the same picture.
 */
export function layoutGraph(names: readonly string[], links: readonly Edge[]): Layout {
  const sorted = [...names].sort();
  const points: Point[] = sorted.map((_, i) => {
    const radius = 24 * Math.sqrt(i);
    return { x: radius * Math.cos(i * GOLDEN), y: radius * Math.sin(i * GOLDEN) };
  });
  const index = new Map(sorted.map((name, i) => [name, i]));
  const pairs = links.flatMap((link) => {
    const from = index.get(link.from);
    const to = index.get(link.to);
    return from === undefined || to === undefined ? [] : [[from, to]];
  });
  for (let round = 0; round < ROUNDS; round++) {
    const cooling = 1 - round / ROUNDS;
    const forces = points.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const dx = points[i].x - points[j].x;
        const dy = points[i].y - points[j].y;
        const squared = Math.max(dx * dx + dy * dy, 1);
        const push = REPULSION / squared / Math.sqrt(squared);
        forces[i].x += dx * push;
        forces[i].y += dy * push;
        forces[j].x -= dx * push;
        forces[j].y -= dy * push;
      }
    }
    for (const [from, to] of pairs) {
      const dx = points[to].x - points[from].x;
      const dy = points[to].y - points[from].y;
      const length = Math.max(Math.hypot(dx, dy), 1);
      const pull = (SPRING * (length - REST_LENGTH)) / length;
      forces[from].x += dx * pull;
      forces[from].y += dy * pull;
      forces[to].x -= dx * pull;
      forces[to].y -= dy * pull;
    }
    points.forEach((point, i) => {
      // Bounded step: a pair started close together must not fling itself out of the view.
      const step = (value: number) => Math.max(-30, Math.min(30, value)) * cooling;
      point.x += step(forces[i].x - point.x * GRAVITY);
      point.y += step(forces[i].y - point.y * GRAVITY);
    });
  }
  return Object.fromEntries(sorted.map((name, i) => [name, points[i]]));
}

/** A note and the notes it is linked to, either way. */
export function neighbours(name: string, links: readonly Edge[]): Set<string> {
  const near = new Set([name]);
  for (const link of links) {
    if (link.from === name) near.add(link.to);
    if (link.to === name) near.add(link.from);
  }
  return near;
}

/** The view that shows every note, at natural size at most. */
export function fitView(layout: Layout, size: { width: number; height: number }): View {
  const points = Object.values(layout);
  if (points.length === 0) return { x: size.width / 2, y: size.height / 2, scale: 1 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const [left, right, top, bottom] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const scale = Math.max(
    MIN_SCALE,
    Math.min(1, (size.width - 2 * MARGIN) / Math.max(right - left, 1), (size.height - 2 * MARGIN) / Math.max(bottom - top, 1)),
  );
  return { x: size.width / 2 - (scale * (left + right)) / 2, y: size.height / 2 - (scale * (top + bottom)) / 2, scale };
}

/** Zooms by `factor`, the point under the pointer staying where it is. */
export function zoomAt(view: View, pointer: Point, factor: number): View {
  const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, view.scale * factor));
  const ratio = scale / view.scale;
  return { scale, x: pointer.x - (pointer.x - view.x) * ratio, y: pointer.y - (pointer.y - view.y) * ratio };
}
