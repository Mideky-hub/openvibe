// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from "vitest";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { canvasStore } from "@/canvas/canvasStore";
import { nodesStore, terminalOf } from "@/store/nodes";
import { workspacesStore } from "@/store/workspaces";
import { closeGroup, launchGroup } from "./groups";

vi.mock("@excalidraw/excalidraw", () => ({ CaptureUpdateAction: { IMMEDIATELY: "i" }, newElementWith: (e: object, patch: object) => ({ ...e, ...patch }) }));
vi.mock("@/nodes/terminal/registry", () => ({ markForAutostart: vi.fn() }));

interface Element {
  id: string;
  type: string;
  isDeleted?: boolean;
  frameId?: string | null;
  customData?: Record<string, unknown>;
  startBinding?: { elementId: string } | null;
  endBinding?: { elementId: string } | null;
}
let scene: Element[] = [];
beforeEach(() => {
  mockIPC(() => undefined);
  scene = [];
  const api = {
    getSceneElements: () => scene,
    getSceneElementsIncludingDeleted: () => scene,
    updateScene: ({ elements }: { elements?: typeof scene }) => {
      if (elements) scene = elements;
    },
    scrollToContent: vi.fn(),
  };
  canvasStore.setState({ api: api as unknown as ExcalidrawImperativeAPI });
  workspacesStore.setState({ activeId: "w1" });
});

it("staffs a mission's group with the names, folders and pantheon it is given, and says what it made", async () => {
  const made = await launchGroup(
    { name: "Mission Auth", role: "general", agents: ["claude", "claude"] },
    { cwd: "C:/code", shell: "default", title: "", command: "" },
    { x: 0, y: 0 },
    { pantheon: "egyptian", names: ["Isis", "Horus"], cwds: ["C:/w/auth-isis", "C:/w/auth-horus"] },
  );
  const frame = scene.find((e) => e.type === "frame");
  expect(made?.frameId).toBe(frame?.id);
  expect(made!.nodeIds.map((id) => [terminalOf(nodesStore.getState().nodes[id])?.name, terminalOf(nodesStore.getState().nodes[id])?.cwd])).toEqual([
    ["Isis", "C:/w/auth-isis"],
    ["Horus", "C:/w/auth-horus"],
  ]);
  expect(frame?.customData?.openvibe).toMatchObject({ kind: "group", pantheon: "egyptian" });
});

it("gives each agent of a staffed group the model the router chose, and none otherwise (backlog 27 oct)", async () => {
  const made = await launchGroup(
    { name: "Mission Auth", role: "general", agents: ["claude", "claude"] },
    { cwd: "C:/code", shell: "default", title: "", command: "" },
    { x: 0, y: 0 },
    { pantheon: "egyptian", names: ["Isis", "Horus"], cwds: ["C:/a", "C:/b"], models: ["opus", undefined] },
  );
  expect(made!.nodeIds.map((id) => terminalOf(nodesStore.getState().nodes[id])?.model)).toEqual(["opus", undefined]);
});

it("closes a group with the wires that led to it (final review H2)", () => {
  const wire = (id: string, to: string): Element => ({ id, type: "arrow", customData: { openvibe: { kind: "wire" } }, startBinding: { elementId: "chef" }, endBinding: { elementId: to } });
  scene = [
    { id: "f1", type: "frame", customData: { openvibe: { kind: "group", role: "general", pantheon: "egyptian" } } },
    { id: "t1", type: "embeddable", frameId: "f1" },
    wire("w1", "f1"),
    wire("w2", "t1"),
    wire("w3", "ailleurs"),
  ];
  closeGroup("f1");
  expect(scene.filter((e) => e.isDeleted).map((e) => e.id)).toEqual(["f1", "t1", "w1", "w2"]);
});
