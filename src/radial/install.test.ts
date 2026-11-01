// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { canvasStore } from "@/canvas/canvasStore";
import { requestClose } from "@/fleet/terminals";
import { nodesStore } from "@/store/nodes";
import { projectsStore } from "@/store/projects";
import { workspacesStore } from "@/store/workspaces";
import { openNativeMenuAt } from "./bridges";
import { installRadial } from "./install";
import { radialStore } from "./radialState";

vi.mock("@excalidraw/excalidraw", () => ({}));
vi.mock("@/fleet/terminals", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/fleet/terminals")>()),
  requestClose: vi.fn(),
}));

const rect = { id: "r1", type: "rectangle", x: 100, y: 100, width: 100, height: 80, angle: 0, strokeWidth: 2, isDeleted: false, frameId: null, groupIds: [], containerId: null } as unknown as ExcalidrawElement;
const updateScene = vi.fn();
let uninstall: () => void;

beforeAll(async () => {
  mockIPC(() => undefined);
  await nodesStore.getState().create("isis", {
    workspaceId: "w1",
    kind: "terminal",
    payload: { title: "Isis", name: "Isis", agent: "claude", cwd: "C:/code", shell: "default", command: "" },
  });
});
beforeEach(() => {
  document.body.innerHTML =
    '<div class="excalidraw"><div class="excalidraw-container" tabindex="0"><canvas class="excalidraw__canvas interactive"></canvas><div id="ex-frame-name-g1"><span id="dot"></span></div><div class="excalidraw__embeddable-container"><div data-terminal="isis"><div class="xterm"><span id="text">PS C:\\&gt;</span></div><input id="name" /></div></div></div></div>';
  updateScene.mockClear();
  canvasStore.setState({
    api: { getSceneElements: () => [rect], getAppState: () => ({ selectedElementIds: {} }), updateScene } as unknown as ExcalidrawImperativeAPI,
    view: { scrollX: 0, scrollY: 0, zoom: 1, width: 1000, height: 800, offsetLeft: 0, offsetTop: 0, tool: "selection", selectedIds: [], editingFrame: null, mode: null },
    frames: [],
    nodeIds: ["isis"],
  });
  projectsStore.setState({ view: "project" } as never);
  workspacesStore.setState({ status: "ready", activeId: "w1" } as never);
  radialStore.setState({ ring: null });
  uninstall = installRadial(window);
});
afterEach(() => uninstall());

const pointer = (target: Element, type: string, x: number, y: number, button = 2) => {
  const event = new PointerEvent(type, { clientX: x, clientY: y, button, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
};
const canvas = () => document.querySelector("canvas")!;
const text = () => document.getElementById("text")!;
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

describe("opening the ring (spec menu radial §5.2, §6.4)", () => {
  it("opens the terminal's ring on a right press in its text, the press kept from xterm", () => {
    const xterm = vi.fn();
    text().addEventListener("pointerdown", xterm);
    const press = pointer(text(), "pointerdown", 300, 300);
    expect(xterm).not.toHaveBeenCalled();
    expect(press.defaultPrevented).toBe(true);
    expect(radialStore.getState().ring).toMatchObject({ kind: "terminal", client: { x: 300, y: 300 }, context: { terminalId: "isis", at: { x: 300, y: 300 } } });
  });

  it("closes Excalidraw's own menu and the open dropdowns when the ring opens (plan G1)", () => {
    document.body.insertAdjacentHTML("beforeend", '<div role="menu" data-state="open"></div>');
    const escapes: string[] = [];
    document.addEventListener("keydown", (e) => escapes.push(e.key), { once: true });
    pointer(canvas(), "pointerdown", 500, 400);
    expect(escapes).toEqual(["Escape"]);
    expect(updateScene).toHaveBeenCalledWith({ appState: { contextMenu: null } });
    expect(radialStore.getState().ring).not.toBeNull();
    document.querySelector('[role="menu"]')!.remove();
  });

  it("opens the canvas ring on the empty canvas, at the scene point of the click", () => {
    pointer(canvas(), "pointerdown", 500, 400);
    expect(radialStore.getState().ring).toMatchObject({ kind: "canvas", context: { at: { x: 500, y: 400 } } });
  });

  it("selects a drawing alone before opening its ring", () => {
    pointer(canvas(), "pointerdown", 150, 140);
    expect(radialStore.getState().ring!.kind).toBe("selection");
    expect(updateScene).toHaveBeenCalledWith({ appState: { selectedElementIds: { r1: true }, selectedGroupIds: {}, activeEmbeddable: null } });
  });

  it("selects a group of drawings whole, as Excalidraw does (final review)", () => {
    const a = { ...rect, id: "a", groupIds: ["g"] };
    const b = { ...rect, id: "b", x: 400, groupIds: ["g"] };
    canvasStore.setState({ api: { getSceneElements: () => [a, b], getAppState: () => ({ selectedElementIds: {} }), updateScene } as unknown as ExcalidrawImperativeAPI });
    pointer(canvas(), "pointerdown", 150, 140);
    expect(updateScene).toHaveBeenCalledWith({ appState: { selectedElementIds: { a: true, b: true }, selectedGroupIds: { g: true }, activeEmbeddable: null } });
  });

  it("opens a group's ring on Excalidraw's name of its frame, whose own menu never opens (final review)", () => {
    canvasStore.setState({ frames: [{ id: "g1", name: "Serveurs", x: 0, y: 0, width: 10, height: 10, group: { role: "backend", pantheon: "egypt" }, memberIds: [] }] });
    pointer(document.getElementById("dot")!, "pointerdown", 20, 20);
    expect(radialStore.getState().ring).toMatchObject({ kind: "group", context: { groupId: "g1" } });
    radialStore.setState({ ring: null });
    const menu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    document.getElementById("dot")!.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
  });

  it("keeps the native behavior in a text field", () => {
    const name = document.getElementById("name")!;
    pointer(name, "pointerdown", 10, 10);
    expect(radialStore.getState().ring).toBeNull();
    const menu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    name.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(false);
  });

  it("blocks the native menu on the canvas, lets « Plus… » through", () => {
    const excalidraw = vi.fn();
    canvas().addEventListener("contextmenu", excalidraw);
    const blocked = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    canvas().dispatchEvent(blocked);
    expect(blocked.defaultPrevented).toBe(true);
    expect(excalidraw).not.toHaveBeenCalled();
    openNativeMenuAt({ x: 1, y: 1 });
    expect(excalidraw).toHaveBeenCalledTimes(1);
  });
});

describe("choosing in the ring", () => {
  it("runs the slot a slide points at when the right button comes up, a frame after the ring left (Fermer, below)", async () => {
    pointer(text(), "pointerdown", 300, 300);
    pointer(text(), "pointermove", 300, 380);
    expect(radialStore.getState().ring!.hovered).toBe(4);
    pointer(text(), "pointerup", 300, 380);
    expect(radialStore.getState().ring).toBeNull();
    expect(requestClose).not.toHaveBeenCalled();
    await nextFrame();
    expect(requestClose).toHaveBeenCalledWith("isis");
  });

  it("points at nothing for a jitter when the ring moved off the window's edge (final review)", () => {
    pointer(canvas(), "pointerdown", window.innerWidth - 14, 400);
    pointer(canvas(), "pointermove", window.innerWidth - 14, 412);
    expect(radialStore.getState().ring).toMatchObject({ sliding: true, hovered: null });
  });

  it("swallows the one contextmenu that follows a slide, wherever the slide ends (final review)", async () => {
    const outside = document.createElement("div");
    document.body.append(outside);
    pointer(text(), "pointerdown", 300, 300);
    pointer(text(), "pointermove", 300, 380);
    pointer(text(), "pointerup", 300, 380);
    const menu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    outside.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
    const later = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    outside.dispatchEvent(later);
    expect(later.defaultPrevented).toBe(false);
    await nextFrame();
  });

  it("stays open after a short right click; Escape, the wheel or a press outside close it", () => {
    const open = () => {
      pointer(canvas(), "pointerdown", 500, 400);
      pointer(canvas(), "pointerup", 502, 401);
    };
    open();
    expect(radialStore.getState().ring).toMatchObject({ pressed: false, sliding: false });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(radialStore.getState().ring).toBeNull();
    open();
    window.dispatchEvent(new WheelEvent("wheel"));
    expect(radialStore.getState().ring).toBeNull();
    open();
    pointer(canvas(), "pointerdown", 700, 100, 0);
    expect(radialStore.getState().ring).toBeNull();
  });
});
