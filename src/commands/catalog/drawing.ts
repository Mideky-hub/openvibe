import { releaseToCanvas } from "@/canvas/canvasFocus";
import { canvasStore } from "@/canvas/canvasStore";
import { clientOf } from "@/fleet/placement";
import type { Point } from "@/fleet/terminals";
import { CANVAS_KEYS, copyCanvasSelection, openNativeMenuAt, pasteOnCanvasAt, pressCanvasKey, startTextAt } from "@/radial/bridges";
import { exportCurrentPng, exportCurrentScene, importIntoScene } from "@/shell/sceneActions";
import type { Command, CommandContext } from "../command";
import { command, derived, sectionNamed } from "./define";
import { catalog } from "./messages";
import { inProject } from "./navigation";

const drawing = sectionNamed((s) => s.drawing);
const scene = sectionNamed((s) => s.scene);

type Tool = "selection" | "hand" | "rectangle" | "ellipse" | "diamond" | "line" | "arrow" | "frame" | "text" | "freedraw" | "eraser" | "image";

/** The tools of the rail and the shapes menu, with the one-letter key Excalidraw gives them. */
const TOOLS: readonly { type: Tool; keys?: string }[] = [
  { type: "selection", keys: "V" },
  { type: "hand", keys: "H" },
  { type: "rectangle", keys: "R" },
  { type: "ellipse", keys: "O" },
  { type: "diamond", keys: "D" },
  { type: "line", keys: "L" },
  { type: "arrow", keys: "A" },
  { type: "frame", keys: "F" },
  { type: "text", keys: "T" },
  { type: "freedraw", keys: "P" },
  { type: "eraser", keys: "E" },
  { type: "image" },
];

/** A drawing tool, then the keyboard to the canvas (spec fenêtre §7.3). */
function pickTool(type: Tool) {
  canvasStore.getState().api?.setActiveTool({ type });
  releaseToCanvas();
}

/**
 * Annuler / Rétablir: Excalidraw's own keys, sent to its container (its API has
 * no undo). The keyboard goes back to the canvas after: Excalidraw computes the
 * undo from the state of the moment, which would overwrite a release still pending.
 */
function pressUndoKey(key: "z" | "y") {
  const container = document.querySelector<HTMLElement>(".excalidraw-container");
  container?.dispatchEvent(new KeyboardEvent("keydown", { key, code: key === "z" ? "KeyZ" : "KeyY", ctrlKey: true, bubbles: true, cancelable: true }));
  releaseToCanvas();
}

/** The ids Excalidraw has selected. */
function selectedIds(): string[] {
  const selection = canvasStore.getState().api?.getAppState().selectedElementIds ?? {};
  return Object.keys(selection).filter((id) => selection[id]);
}

/** Some selected element is locked: Excalidraw's lock then unlocks the whole selection, a mixed one included. */
export function selectionLocked(): boolean {
  const ids = new Set(selectedIds());
  const selected = canvasStore.getState().api?.getSceneElements().filter((e) => ids.has(e.id)) ?? [];
  return selected.some((e) => e.locked);
}

const withSelection = (ctx: CommandContext) => inProject(ctx) && selectedIds().length > 0;

/** The window point of the radial menu's click, else the middle of the canvas. */
function pointOf(ctx: CommandContext): Point {
  const { view } = canvasStore.getState();
  return ctx.at ? clientOf(ctx.at, view) : { x: view.offsetLeft + view.width / 2, y: view.offsetTop + view.height / 2 };
}

export const DRAWING: readonly Command[] = [
  ...TOOLS.map(
    ({ type, keys }): Command =>
      derived(
        {
          id: `tool.${type}`,
          section: drawing,
          keys,
          available: inProject,
          run: (ctx) => (type === "text" && ctx.at ? startTextAt(pointOf(ctx)) : pickTool(type)),
        },
        () => catalog().tools[type],
        () => [...catalog().toolKeywords, catalog().tools[type]],
      ),
  ),
  command("edit.undo", { section: drawing, keys: "Ctrl+Z", available: inProject, run: () => pressUndoKey("z") }),
  command("edit.redo", { section: drawing, keys: "Ctrl+Y", available: inProject, run: () => pressUndoKey("y") }),
  command("drawing.copy", { section: drawing, keys: "Ctrl+C", available: withSelection, run: () => copyCanvasSelection() }),
  command("drawing.paste", { section: drawing, keys: "Ctrl+V", available: inProject, run: (ctx) => pasteOnCanvasAt(pointOf(ctx)) }),
  command("drawing.duplicate", { section: drawing, keys: "Ctrl+D", available: withSelection, run: () => pressCanvasKey(CANVAS_KEYS.duplicate) }),
  command("drawing.front", { section: drawing, keys: "Ctrl+Maj+]", available: withSelection, run: () => pressCanvasKey(CANVAS_KEYS.front) }),
  command("drawing.back", { section: drawing, keys: "Ctrl+Maj+[", available: withSelection, run: () => pressCanvasKey(CANVAS_KEYS.back) }),
  command("drawing.lock", {
    label: () => (selectionLocked() ? catalog().unlock : catalog().lock),
    section: drawing,
    keys: "Ctrl+Maj+L",
    available: withSelection,
    run: () => pressCanvasKey(CANVAS_KEYS.lock),
  }),
  // Agents in the selection go through the closing guard (spec habillage §7.5).
  command("drawing.delete", { section: drawing, keys: "Suppr", available: withSelection, run: () => pressCanvasKey(CANVAS_KEYS.delete) }),
  // The radial menu's only: Excalidraw's full menu at its point (spec menu radial §4.5).
  command("drawing.more", { section: drawing, available: (ctx) => withSelection(ctx) && ctx.at !== undefined, run: (ctx) => openNativeMenuAt(pointOf(ctx)) }),
];

export const SCENE: readonly Command[] = [
  command("scene.export", { section: scene, available: inProject, run: () => exportCurrentScene() }),
  command("scene.import", { section: scene, available: inProject, run: () => importIntoScene() }),
  command("scene.png", { section: scene, available: inProject, run: () => exportCurrentPng() }),
];
