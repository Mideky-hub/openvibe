// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from "vitest";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { canvasStore } from "@/canvas/canvasStore";
import { framesFromScene } from "@/canvas/groups";
import { nodesStore, terminalOf } from "@/store/nodes";
import { workspacesStore } from "@/store/workspaces";
import { adoptCopies } from "./terminals";

vi.mock("@excalidraw/excalidraw", () => ({
  CaptureUpdateAction: { IMMEDIATELY: "i", NEVER: "n" },
  newElementWith: (e: object, patch: object) => ({ ...e, ...patch }),
}));
vi.mock("@/nodes/terminal/registry", () => ({ markForAutostart: vi.fn() }));
vi.mock("@/canvas/arrive", () => ({ revealNode: vi.fn() }));

const group = (id: string, pantheon: string) =>
  ({ id, type: "frame", x: 0, y: 0, width: 800, height: 400, isDeleted: false, frameId: null, groupIds: [], customData: { openvibe: { kind: "group", role: "backend", pantheon } } }) as unknown as ExcalidrawElement;
const terminal = (id: string, frameId: string, link: string | null) =>
  ({ id, type: "embeddable", x: 0, y: 0, width: 300, height: 200, isDeleted: false, frameId, groupIds: [], link, customData: { kind: "terminal" } }) as unknown as ExcalidrawElement;

let scene: ExcalidrawElement[] = [];

beforeEach(async () => {
  mockIPC(() => undefined);
  nodesStore.getState().forgetWorkspace("w1");
  await nodesStore.getState().create("isis", {
    workspaceId: "w1",
    kind: "terminal",
    payload: { title: "Isis", name: "Isis", agent: "shell", cwd: "C:/code", shell: "default", command: "" },
  });
  scene = [group("g1", "egyptian"), terminal("isis", "g1", "openvibe://terminal/isis"), group("copy", "egyptian"), terminal("isis2", "copy", "openvibe://terminal/isis")];
  canvasStore.setState({
    api: {
      getSceneElementsIncludingDeleted: () => scene,
      getSceneElements: () => scene,
      updateScene: ({ elements }: { elements?: ExcalidrawElement[] }) => {
        if (elements) scene = elements;
      },
    } as unknown as ExcalidrawImperativeAPI,
    frames: framesFromScene(scene),
  });
  workspacesStore.setState({ workspaces: [{ id: "w1", projectId: "p1", name: "A", position: 0, pantheon: "greek" }] } as never);
});

it("gives a group copied whole a pantheon of its own and names its agents from it (plan B1)", async () => {
  await adoptCopies("w1", [{ id: "isis2", sourceId: "isis" }]);
  const pantheonOf = (id: string) => (scene.find((e) => e.id === id)!.customData!.openvibe as { pantheon: string }).pantheon;
  expect(pantheonOf("g1")).toBe("egyptian");
  const copied = pantheonOf("copy");
  expect(["egyptian", "greek"]).not.toContain(copied);
  // The copy's agent is named from the new pantheon, not Isis again or another Egyptian name.
  const name = terminalOf(nodesStore.getState().nodes.isis2)!.name;
  expect(name).not.toBe("Isis");
  expect(name).toMatch(/\S/);
  const egyptianNames = ["Isis", "Osiris", "Horus", "Anubis", "Ra", "Thot", "Seth", "Bastet"];
  expect(egyptianNames.some((n) => name === n || name.startsWith(`${n} `))).toBe(false);
});

it("unfolds a folded group copied whole: its copies would never mount, nor start (review)", async () => {
  const folded = group("copy", "egyptian");
  scene = [group("g1", "egyptian"), terminal("isis", "g1", "openvibe://terminal/isis"), { ...folded, customData: { openvibe: { ...(folded.customData!.openvibe as object), folded: true } } } as ExcalidrawElement, terminal("isis2", "copy", "openvibe://terminal/isis")];
  canvasStore.setState({ frames: framesFromScene(scene) });
  await adoptCopies("w1", [{ id: "isis2", sourceId: "isis" }]);
  const copy = scene.find((e) => e.id === "copy")!;
  expect((copy.customData!.openvibe as Record<string, unknown>).folded).toBeUndefined();
});
