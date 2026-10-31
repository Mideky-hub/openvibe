// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from "vitest";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { returnKeyboardToCanvas } from "@/canvas/keyboardFocus";
import { canvasStore } from "@/canvas/canvasStore";
import { workspacesStore } from "@/store/workspaces";
import { closeGroup, ungroup } from "./groups";
import { launchFour } from "./quickActions";

vi.mock("@excalidraw/excalidraw", () => ({ CaptureUpdateAction: { IMMEDIATELY: "i" }, newElementWith: (e: object, patch: object) => ({ ...e, ...patch }) }));
vi.mock("@/nodes/terminal/registry", () => ({ markForAutostart: vi.fn() }));
vi.mock("@/canvas/keyboardFocus", () => ({ returnKeyboardToCanvas: vi.fn() }));

beforeEach(() => {
  // The agent list is awaited before a group of four: it must answer a list.
  mockIPC((cmd) => (cmd === "list_agents" || cmd === "list_shells" ? [] : undefined));
  vi.mocked(returnKeyboardToCanvas).mockClear();
  canvasStore.setState({
    api: {
      getSceneElements: () => [],
      getSceneElementsIncludingDeleted: () => [],
      updateScene: vi.fn(),
      getAppState: () => ({ width: 1400, height: 800 }),
      scrollToContent: vi.fn(),
    } as unknown as ExcalidrawImperativeAPI,
  });
  workspacesStore.setState({ activeId: "w1" });
});

it("gives Excalidraw its keyboard back after Dégrouper, Fermer le groupe and Lancer 4 (plan B1)", async () => {
  ungroup("g");
  expect(returnKeyboardToCanvas).toHaveBeenCalledTimes(1);
  closeGroup("g");
  expect(returnKeyboardToCanvas).toHaveBeenCalledTimes(2);
  await launchFour();
  expect(returnKeyboardToCanvas).toHaveBeenCalledTimes(3);
});
