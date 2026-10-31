// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from "vitest";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { revealNode } from "@/canvas/arrive";
import { canvasStore } from "@/canvas/canvasStore";
import { addTerminal } from "./terminals";

vi.mock("@excalidraw/excalidraw", () => ({
  CaptureUpdateAction: { IMMEDIATELY: "i", NEVER: "n" },
  newElementWith: (e: object, patch: object) => ({ ...e, ...patch }),
}));
vi.mock("@/nodes/terminal/registry", () => ({ markForAutostart: vi.fn() }));
vi.mock("@/canvas/arrive", () => ({ revealNode: vi.fn(() => true) }));

let scene: { id: string }[] = [];

beforeEach(() => {
  mockIPC(() => undefined);
  vi.mocked(revealNode).mockClear();
  scene = [];
  canvasStore.setState({
    api: {
      getSceneElementsIncludingDeleted: () => scene,
      getSceneElements: () => scene,
      updateScene: ({ elements }: { elements?: typeof scene }) => {
        if (elements) scene = elements;
      },
    } as unknown as ExcalidrawImperativeAPI,
  });
});

it("scrolls to the agent it added: out of sight it would neither show nor start (plan B1)", async () => {
  const id = await addTerminal("w1", { title: "T", name: "T", agent: "shell", cwd: "C:/code", shell: "default", command: "" }, { x: 9000, y: 0 });
  expect(id).not.toBeNull();
  expect(revealNode).toHaveBeenCalledWith(id);
});
