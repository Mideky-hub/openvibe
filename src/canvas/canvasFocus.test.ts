// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { uiStore } from "@/store/ui";
import { canvasStore } from "./canvasStore";
import { focusGroup, overview, overviewTargets, releaseToCanvas } from "./canvasFocus";

const element = (fields: Record<string, unknown>) =>
  ({ x: 0, y: 0, width: 100, height: 100, isDeleted: false, frameId: null, ...fields }) as unknown as ExcalidrawElement;
const node = (id: string, kind: string, frameId: string | null = null) => element({ id, type: "embeddable", customData: { kind }, frameId });
const groupFrame = (id: string) => element({ id, type: "frame", customData: { openvibe: { kind: "group", role: "backend", pantheon: "egypt" } } });

const updateScene = vi.fn();
const scrollToContent = vi.fn();
let container: HTMLDivElement;

beforeEach(() => {
  updateScene.mockClear();
  scrollToContent.mockClear();
  document.body.innerHTML =
    '<div class="excalidraw excalidraw-container" tabindex="0"><div data-terminal="isis"><textarea></textarea></div></div>';
  container = document.querySelector<HTMLDivElement>(".excalidraw-container")!;
});
afterEach(() => document.body.replaceChildren());

const withScene = (elements: ExcalidrawElement[]) =>
  canvasStore.setState({
    api: { getSceneElements: () => elements, updateScene, scrollToContent } as unknown as ExcalidrawImperativeAPI,
  });

describe("releaseToCanvas (spec fenêtre §6.5)", () => {
  it("takes the keyboard from the terminal, deactivates it and gives the keyboard to Excalidraw's container", () => {
    withScene([]);
    document.querySelector("textarea")!.focus();
    releaseToCanvas();
    expect(document.activeElement).toBe(container);
    expect(updateScene).toHaveBeenCalledWith({ appState: { activeEmbeddable: null, selectedElementIds: {}, selectedGroupIds: {} } });
  });

  it("ends placement and link modes", () => {
    withScene([]);
    uiStore.setState({ placing: { agent: "claude" } as never, linking: "chef" });
    releaseToCanvas();
    expect(uiStore.getState().placing).toBeNull();
    expect(uiStore.getState().linking).toBeNull();
  });

  it("creates no selection and leaves none behind: Suppr must not delete the terminal just left", () => {
    withScene([]);
    releaseToCanvas();
    for (const [update] of updateScene.mock.calls) expect(update.appState.selectedElementIds).toEqual({});
  });
});

describe("overview (spec fenêtre §6.6)", () => {
  it("frames the nodes and their group frames, not drawings nor drawing frames", () => {
    const scene = [
      groupFrame("backend"),
      node("isis", "terminal", "backend"),
      node("chef", "orchestrator"),
      element({ id: "drawing", type: "frame" }),
      node("in-drawing", "terminal", "drawing"),
      element({ id: "box", type: "rectangle" }),
      node("gone", "terminal", null),
    ];
    const gone = { ...scene[6], isDeleted: true } as ExcalidrawElement;
    expect(overviewTargets([...scene.slice(0, 6), gone]).map((e) => e.id)).toEqual(["backend", "isis", "chef", "in-drawing"]);
  });

  it("frames the whole scene when there is no node", () => {
    const scene = [element({ id: "box", type: "rectangle" }), element({ id: "arrow", type: "arrow" })];
    expect(overviewTargets(scene).map((e) => e.id)).toEqual(["box", "arrow"]);
  });

  it("fits them with an animation and a 10 % margin, then gives the keyboard to the canvas", () => {
    const scene = [node("isis", "terminal")];
    withScene(scene);
    overview();
    expect(scrollToContent).toHaveBeenCalledWith(scene, { fitToViewport: true, viewportZoomFactor: 0.9, animate: true, canvasOffsets: { top: 72, bottom: 60 } });
    expect(document.activeElement).toBe(container);
  });

  it("leaves an empty canvas alone", () => {
    withScene([]);
    overview();
    expect(scrollToContent).not.toHaveBeenCalled();
  });
});

describe("focusGroup (spec fenêtre §7.2)", () => {
  it("fits the group's frame, at 100 % at most, and gives the keyboard to the canvas", () => {
    const frame = groupFrame("backend");
    withScene([frame]);
    expect(focusGroup("backend")).toBe(true);
    expect(scrollToContent).toHaveBeenCalledWith(frame, { fitToViewport: true, viewportZoomFactor: 0.9, animate: true, maxZoom: 1, canvasOffsets: { top: 96, bottom: 60 } });
    expect(document.activeElement).toBe(container);
  });

  it("reports a group that is gone", () => {
    withScene([]);
    expect(focusGroup("backend")).toBe(false);
    expect(scrollToContent).not.toHaveBeenCalled();
  });
});
