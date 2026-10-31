interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Below this zoom a terminal's text is unreadable. */
export const READABLE_ZOOM = 0.6;

const FIT_MARGIN = 0.9;

function bounds(boxes: readonly Box[]): Box {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.width));
  const bottom = Math.max(...boxes.map((b) => b.y + b.height));
  return { x, y, width: right - x, height: bottom - y };
}

const fitZoom = (boxes: readonly Box[], viewport: { width: number; height: number }) => {
  const b = bounds(boxes);
  return FIT_MARGIN * Math.min(viewport.width / b.width, viewport.height / b.height);
};

/**
 * What to bring into view after launching a group: the whole group when it
 * stays readable, else its first terminals, as many as fit at a readable zoom.
 */
export function readableTargets<T extends Box>(frame: T, terminals: readonly T[], viewport: { width: number; height: number }): T[] {
  if (terminals.length === 0 || fitZoom([frame], viewport) >= READABLE_ZOOM) return [frame];
  const shown: T[] = [terminals[0]];
  for (const terminal of terminals.slice(1)) {
    if (fitZoom([...shown, terminal], viewport) < READABLE_ZOOM) break;
    shown.push(terminal);
  }
  return shown;
}
