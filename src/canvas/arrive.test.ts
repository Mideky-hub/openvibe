// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { focusTerminal } from "@/nodes/terminal/registry";
import { arrivalStore } from "./arrivalSignal";
import { arrivalView, arrive, arrivingNode, needsMove, showNode } from "./arrive";
import { canvasStore } from "./canvasStore";

vi.mock("@/nodes/terminal/registry", () => ({ focusTerminal: vi.fn() }));

const viewport = { width: 1400, height: 900 };
const at100 = { scrollX: 0, scrollY: 0, zoom: 1, ...viewport };
const isis = { id: "isis", type: "embeddable", customData: { kind: "terminal" }, x: 100, y: 200, width: 720, height: 440 };
const chef = { id: "chef", type: "embeddable", customData: { kind: "orchestrator" }, x: 100, y: 200, width: 320, height: 420 };

describe("needsMove (spec fenêtre §6.4, zone utile of spec identité §7)", () => {
  it("keeps the view when the terminal shows whole at 100 % in the zone utile", () => {
    expect(needsMove(isis, at100)).toBe(false);
  });

  it("moves it when the terminal is zoomed, under the bars, under the bottom band or off screen", () => {
    expect(needsMove(isis, { ...at100, zoom: 0.8 })).toBe(true);
    expect(needsMove({ ...isis, y: 60 }, at100)).toBe(true);
    expect(needsMove({ ...isis, y: 900 - 60 - 440 + 1 }, at100)).toBe(true);
    expect(needsMove({ ...isis, x: -10 }, at100)).toBe(true);
    expect(needsMove({ ...isis, x: 1400 - 720 + 1 }, at100)).toBe(true);
    expect(needsMove(isis, { ...at100, scrollY: -150 })).toBe(true);
  });
});

it("centers a moved terminal at 100 % in the zone utile", () => {
  const view = arrivalView(isis, viewport);
  expect(view.zoom.value).toBe(1);
  // Screen top of the terminal: equal margins under the 72 px bars and above the 60 px band.
  const top = isis.y + view.scrollY;
  expect(top - 72).toBe(900 - 60 - (top + isis.height));
  expect(isis.x + view.scrollX).toBe((1400 - 720) / 2);
});

describe("arrive", () => {
  let frames: FrameRequestCallback[];
  const updateScene = vi.fn();

  beforeEach(() => {
    frames = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
    updateScene.mockClear();
    vi.mocked(focusTerminal).mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  const withScene = (appState: Record<string, unknown>) =>
    canvasStore.setState({
      api: {
        getSceneElements: () => [isis, chef],
        getAppState: () => ({ ...appState, zoom: { value: appState.zoom } }),
        updateScene,
      } as unknown as ExcalidrawImperativeAPI,
    });

  it("activates the terminal without moving a view that already shows it, clears the selection, and flashes it", () => {
    withScene(at100);
    const before = arrivalStore.getState().seq;
    arrive("isis");
    // No stale selection left behind: the canvas keys (Suppr, arrows) must not act on a terminal out of sight.
    expect(updateScene).toHaveBeenCalledWith({
      appState: { activeEmbeddable: { element: isis, state: "active" }, selectedElementIds: {}, selectedGroupIds: {} },
    });
    expect(arrivalStore.getState()).toEqual({ nodeId: "isis", seq: before + 1 });
  });

  it("moves the view first when needed, then focuses xterm on the next frame, after the view moved", () => {
    withScene({ ...at100, zoom: 0.5 });
    arrive("isis");
    const { appState } = updateScene.mock.calls[0][0];
    expect(appState.zoom.value).toBe(1);
    expect(appState.activeEmbeddable).toEqual({ element: isis, state: "active" });
    expect(focusTerminal).not.toHaveBeenCalled();
    frames.forEach((frame) => frame(0));
    expect(focusTerminal).toHaveBeenCalledWith("isis");
  });

  it("keeps trying to give the keyboard for a few frames: a node shown late still gets it", () => {
    withScene(at100);
    expect(arrive("isis")).toBe(true);
    for (let i = 0; i < 3; i++) frames.shift()!(0);
    expect(vi.mocked(focusTerminal).mock.calls.length).toBe(3);
    // Then it stops trying.
    while (frames.length > 0) frames.shift()!(0);
    expect(vi.mocked(focusTerminal).mock.calls.length).toBe(10);
  });

  it("stops trying once the terminal has the keyboard", () => {
    withScene(at100);
    document.body.innerHTML = '<div data-terminal="isis"><textarea></textarea></div>';
    vi.mocked(focusTerminal).mockImplementation(() => document.querySelector("textarea")!.focus());
    arrive("isis");
    frames.shift()!(0);
    expect(frames).toHaveLength(0);
    vi.mocked(focusTerminal).mockReset();
    document.body.replaceChildren();
  });

  it("gives an orchestrator's terminal the keyboard, without the terminals' flash (spec orchestrateur §6)", () => {
    withScene(at100);
    const before = arrivalStore.getState();
    expect(arrive("chef")).toBe(true);
    frames.shift()!(0);
    expect(focusTerminal).toHaveBeenCalledWith("chef");
    expect(arrivalStore.getState()).toEqual(before);
  });

  it("lets only the latest arrival keep trying, and names the one still arriving", () => {
    withScene(at100);
    arrive("isis");
    arrive("chef");
    expect(arrivingNode()).toBe("chef");
    while (frames.length > 0) frames.shift()!(0);
    // The first loop stopped at its first frame; the second ran its ten.
    expect(vi.mocked(focusTerminal).mock.calls.filter(([id]) => id === "isis")).toHaveLength(0);
    expect(vi.mocked(focusTerminal).mock.calls.filter(([id]) => id === "chef")).toHaveLength(10);
    expect(arrivingNode()).toBeNull();
  });

  it("does nothing for a terminal that is not on the canvas", () => {
    withScene(at100);
    expect(arrive("closed")).toBe(false);
    expect(updateScene).not.toHaveBeenCalled();
    expect(frames).toHaveLength(0);
  });
});

describe("showNode", () => {
  const updateScene = vi.fn();
  const withScene = (appState: Record<string, unknown>) =>
    canvasStore.setState({
      api: {
        getSceneElements: () => [isis],
        getAppState: () => ({ ...appState, zoom: { value: appState.zoom } }),
        updateScene,
      } as unknown as ExcalidrawImperativeAPI,
    });

  beforeEach(() => updateScene.mockClear());

  it("shows the terminal without taking the keyboard or activating it (a rename in its header takes it)", () => {
    withScene({ ...at100, zoom: 0.5 });
    expect(showNode("isis")).toBe(true);
    const { appState } = updateScene.mock.calls[0][0];
    expect(appState.zoom.value).toBe(1);
    expect(appState).not.toHaveProperty("activeEmbeddable");
    withScene(at100);
    updateScene.mockClear();
    showNode("isis");
    expect(updateScene).not.toHaveBeenCalled();
    expect(showNode("closed")).toBe(false);
  });
});
