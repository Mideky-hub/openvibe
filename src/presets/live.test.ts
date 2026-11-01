// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { canvasStore } from "@/canvas/canvasStore";
import { framesFromScene } from "@/canvas/groups";
import { agentsStore } from "@/fleet/agentsStore";
import { workspacesStore } from "@/store/workspaces";
import { deployPreset } from "./deploy";
import { liveDeployDeps } from "./live";
import type { TeamPreset } from "./model";

vi.mock("@excalidraw/excalidraw", () => ({
  CaptureUpdateAction: { IMMEDIATELY: "i", NEVER: "n" },
  newElementWith: (e: object, patch: object) => ({ ...e, ...patch }),
}));
vi.mock("@/nodes/terminal/registry", () => ({ markForAutostart: vi.fn() }));

let scene: ExcalidrawElement[] = [];

beforeEach(() => {
  mockIPC((cmd) => (cmd === "list_agents" ? [{ id: "claude", available: true, binary: "claude" }] : undefined));
  scene = [];
  agentsStore.setState({ agents: [{ id: "claude", available: true }] as never, loaded: true });
  workspacesStore.setState({ activeId: "w1" });
  canvasStore.setState({
    frames: [],
    api: {
      getSceneElements: () => scene.filter((e) => !e.isDeleted),
      getSceneElementsIncludingDeleted: () => scene,
      // As in the app: the frames follow Excalidraw's onChange, after React's commit.
      updateScene: ({ elements }: { elements?: ExcalidrawElement[] }) => {
        if (!elements) return;
        scene = elements;
        setTimeout(() => canvasStore.getState().setFrames(framesFromScene(scene)), 0);
      },
      getAppState: () => ({ width: 1400, height: 800 }),
      scrollToContent: vi.fn(),
    } as unknown as ExcalidrawImperativeAPI,
  });
});
afterEach(() => {
  clearMocks();
  canvasStore.setState({ api: null, frames: [] });
});

it("links the orchestrator of the last group it posed, whose frame the canvas has not told yet (review)", async () => {
  const preset: TeamPreset = {
    id: "p",
    name: "Dev HQ",
    savedAt: 1,
    groups: [{ name: "Front", role: "general", agents: ["claude"], x: 0, y: 0 }],
    orchestrators: [{ name: "Chef", groups: [0] }],
  };
  const result = await deployPreset(preset, await liveDeployDeps());
  expect(result).toMatchObject({ groups: 1, orchestrators: 1, orchestratorsSkipped: 0 });
});
