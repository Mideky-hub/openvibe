import { exportToSvg, restoreElements } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { IconItem } from "./library";

const drawn = new Map<string, Promise<SVGSVGElement | null>>();
/** The drawings kept: the oldest go past this, so 600+ icons × 2 themes do not stay in memory. */
export const MAX_DRAWN = 300;

/** An icon drawn as Excalidraw would, in the canvas's theme; drawn once per theme. */
export function iconThumbnail(item: IconItem, dark: boolean): Promise<SVGSVGElement | null> {
  const key = `${item.id}:${dark ? "dark" : "light"}`;
  const known = drawn.get(key);
  if (known) return known;
  const svg: Promise<SVGSVGElement | null> = exportToSvg({
    elements: restoreElements(item.elements as unknown as ExcalidrawElement[], null),
    appState: { exportBackground: false, exportWithDarkMode: dark },
    files: null,
    exportPadding: 4,
    skipInliningFonts: true,
  }).catch(() => null);
  drawn.set(key, svg);
  // A failed drawing is not kept until the restart: the next look tries again.
  void svg.then((done) => {
    if (done === null && drawn.get(key) === svg) drawn.delete(key);
  });
  if (drawn.size > MAX_DRAWN) drawn.delete(drawn.keys().next().value!);
  return svg;
}
