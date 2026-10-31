// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { canvasStore } from "@/canvas/canvasStore";
import { CANVAS_KEYS, copyCanvasSelection, openNativeMenuAt, pasteOnCanvasAt, pressCanvasKey, startTextAt } from "@/radial/bridges";
import { exportCurrentPng, exportCurrentScene, importIntoScene } from "@/shell/sceneActions";
import { labelOf, type CommandContext } from "../command";
import { DRAWING, SCENE } from "./drawing";

vi.mock("@excalidraw/excalidraw", () => ({}));
vi.mock("@/shell/sceneActions", () => ({ exportCurrentScene: vi.fn(), importIntoScene: vi.fn(), exportCurrentPng: vi.fn() }));
vi.mock("@/radial/bridges", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/radial/bridges")>()),
  pressCanvasKey: vi.fn(),
  copyCanvasSelection: vi.fn(),
  pasteOnCanvasAt: vi.fn(() => Promise.resolve()),
  startTextAt: vi.fn(),
  openNativeMenuAt: vi.fn(),
}));

const busy: CommandContext = { project: true, workspaceId: "w1", terminalCount: 0, terminalId: null };
const setActiveTool = vi.fn();
const updateScene = vi.fn();
let container: HTMLDivElement;
const keys: KeyboardEvent[] = [];

beforeEach(() => {
  setActiveTool.mockClear();
  keys.length = 0;
  canvasStore.setState({ api: { setActiveTool, updateScene, getAppState: () => ({ selectedElementIds: {} }), getSceneElements: () => [] } as unknown as ExcalidrawImperativeAPI });
  document.body.innerHTML = '<div class="excalidraw excalidraw-container" tabindex="0"></div><textarea></textarea>';
  container = document.querySelector<HTMLDivElement>(".excalidraw-container")!;
  container.addEventListener("keydown", (e) => keys.push(e));
});
afterEach(() => document.body.replaceChildren());

describe("Dessin (spec fenêtre §7.3)", () => {
  it("lists the tools, the hand included, with Excalidraw's keys, then Annuler and Rétablir", () => {
    expect(DRAWING.map((c) => [labelOf(c, busy), c.keys ?? null])).toEqual([
      ["Sélection", "V"],
      ["Main", "H"],
      ["Rectangle", "R"],
      ["Ellipse", "O"],
      ["Losange", "D"],
      ["Ligne", "L"],
      ["Flèche", "A"],
      ["Cadre", "F"],
      ["Texte", "T"],
      ["Stylo", "P"],
      ["Gomme", "E"],
      ["Image", null],
      ["Annuler", "Ctrl+Z"],
      ["Rétablir", "Ctrl+Y"],
      ["Copier", "Ctrl+C"],
      ["Coller", "Ctrl+V"],
      ["Dupliquer", "Ctrl+D"],
      ["Premier plan", "Ctrl+Maj+]"],
      ["Arrière-plan", "Ctrl+Maj+["],
      ["Verrouiller", "Ctrl+Maj+L"],
      ["Supprimer", "Suppr"],
      ["Plus…", null],
    ]);
  });

  it("picks a tool and gives the keyboard to the canvas", async () => {
    document.querySelector("textarea")!.focus();
    await DRAWING.find((c) => c.id === "tool.rectangle")!.run(busy);
    expect(setActiveTool).toHaveBeenCalledWith({ type: "rectangle" });
    expect(document.activeElement).toBe(container);
  });

  it("undoes and redoes with Excalidraw's own keys, sent to its container", async () => {
    await DRAWING.find((c) => c.id === "edit.undo")!.run(busy);
    await DRAWING.find((c) => c.id === "edit.redo")!.run(busy);
    expect(keys.map((k) => [k.key, k.ctrlKey])).toEqual([
      ["z", true],
      ["y", true],
    ]);
  });

  it("sends the key before giving the keyboard back, so Excalidraw's undo cannot overwrite the release", async () => {
    // Excalidraw computes an undo from the state of the moment: a release still
    // pending would be overwritten, leaving the terminal active and selected.
    const order: string[] = [];
    container.addEventListener("keydown", (e) => order.push(`key ${e.key}`));
    updateScene.mockImplementation(() => order.push("release"));
    await DRAWING.find((c) => c.id === "edit.undo")!.run(busy);
    await DRAWING.find((c) => c.id === "edit.redo")!.run(busy);
    expect(order).toEqual(["key z", "release", "key y", "release"]);
    expect(document.activeElement).toBe(container);
    updateScene.mockReset();
  });
});

describe("Dessin, sur la sélection (spec menu radial §4.5)", () => {
  const view = { scrollX: 0, scrollY: 0, zoom: 2, width: 800, height: 600, offsetLeft: 5, offsetTop: 7, tool: "selection", selectedIds: [], editingFrame: null, mode: null };
  const mixed = (selected: Record<string, boolean>) =>
    canvasStore.setState({
      view,
      api: { getAppState: () => ({ selectedElementIds: selected }), getSceneElements: () => [{ id: "r1", locked: true }, { id: "r2", locked: false }] } as unknown as ExcalidrawImperativeAPI,
    });
  const scene = (selected: Record<string, boolean>, locked = false) =>
    canvasStore.setState({
      view,
      api: {
        setActiveTool,
        updateScene,
        getAppState: () => ({ selectedElementIds: selected }),
        getSceneElements: () => [{ id: "r1", locked }],
      } as unknown as ExcalidrawImperativeAPI,
    });
  const run = (id: string, ctx: CommandContext = busy) => DRAWING.find((c) => c.id === id)!.run(ctx);

  it("acts on the selection with Excalidraw's own keys, offered only with a selection", async () => {
    scene({});
    expect(DRAWING.filter((c) => c.id.startsWith("drawing.") && c.available(busy)).map((c) => c.id)).toEqual(["drawing.paste"]);
    scene({ r1: true });
    await run("drawing.duplicate");
    expect(pressCanvasKey).toHaveBeenLastCalledWith(CANVAS_KEYS.duplicate);
    await run("drawing.front");
    expect(pressCanvasKey).toHaveBeenLastCalledWith(CANVAS_KEYS.front);
    await run("drawing.back");
    expect(pressCanvasKey).toHaveBeenLastCalledWith(CANVAS_KEYS.back);
    await run("drawing.delete");
    expect(pressCanvasKey).toHaveBeenLastCalledWith(CANVAS_KEYS.delete);
    await run("drawing.copy");
    expect(copyCanvasSelection).toHaveBeenCalled();
  });

  it("names the lock after the selection's state", () => {
    scene({ r1: true });
    expect(labelOf(DRAWING.find((c) => c.id === "drawing.lock")!, busy)).toBe("Verrouiller");
    scene({ r1: true }, true);
    expect(labelOf(DRAWING.find((c) => c.id === "drawing.lock")!, busy)).toBe("Déverrouiller");
  });

  it("offers « Déverrouiller » on a mixed selection: Excalidraw's lock unlocks it whole (plan G1)", () => {
    mixed({ r1: true, r2: true });
    expect(labelOf(DRAWING.find((c) => c.id === "drawing.lock")!, busy)).toBe("Déverrouiller");
  });

  it("pastes and starts a text where the radial menu was opened, else at the middle of the canvas", async () => {
    scene({});
    await run("drawing.paste", { ...busy, at: { x: 10, y: 20 } });
    expect(pasteOnCanvasAt).toHaveBeenLastCalledWith({ x: 25, y: 47 });
    await run("drawing.paste");
    expect(pasteOnCanvasAt).toHaveBeenLastCalledWith({ x: 405, y: 307 });
    await run("tool.text", { ...busy, at: { x: 10, y: 20 } });
    expect(startTextAt).toHaveBeenLastCalledWith({ x: 25, y: 47 });
    await run("tool.text");
    expect(setActiveTool).toHaveBeenLastCalledWith({ type: "text" });
  });

  it("offers « Plus… » in the radial menu only: Excalidraw's menu at its point", async () => {
    scene({ r1: true });
    const more = DRAWING.find((c) => c.id === "drawing.more")!;
    expect(more.available(busy)).toBe(false);
    expect(more.available({ ...busy, at: { x: 10, y: 20 } })).toBe(true);
    await more.run({ ...busy, at: { x: 10, y: 20 } });
    expect(openNativeMenuAt).toHaveBeenCalledWith({ x: 25, y: 47 });
  });
});

describe("Scène", () => {
  it("exports, imports and saves a PNG as the settings menu does", async () => {
    expect(SCENE.map((c) => labelOf(c, busy))).toEqual(["Exporter la scène…", "Importer une scène…", "Exporter en PNG…"]);
    for (const command of SCENE) await command.run(busy);
    expect([exportCurrentScene, importIntoScene, exportCurrentPng].every((f) => vi.mocked(f).mock.calls.length === 1)).toBe(true);
  });
});
