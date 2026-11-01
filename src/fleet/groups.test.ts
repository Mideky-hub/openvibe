// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from "vitest";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { canvasStore } from "@/canvas/canvasStore";
import { nodesStore, terminalOf } from "@/store/nodes";
import { terminalStatusStore } from "@/store/terminalStatus";
import { workspacesStore } from "@/store/workspaces";
import { toast } from "sonner";
import { addAgentToGroup, closeGroup, launchGroup, setGroupFolded, setGroupSpeciality, showGroups } from "./groups";

vi.mock("@excalidraw/excalidraw", () => ({ CaptureUpdateAction: { IMMEDIATELY: "i" }, newElementWith: (e: object, patch: object) => ({ ...e, ...patch }) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
vi.mock("@/nodes/terminal/registry", () => ({ markForAutostart: vi.fn() }));
vi.mock("./naming", async (importOriginal) => ({ ...(await importOriginal<typeof import("./naming")>()), nameForNewAgent: vi.fn(() => Promise.resolve("Isis")) }));
vi.mock("./terminals", async (importOriginal) => ({ ...(await importOriginal<typeof import("./terminals")>()), addTerminal: vi.fn(() => Promise.resolve()) }));

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
    getAppState: vi.fn(() => ({ width: 1400, height: 800 })),
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

it("sets a group's speciality as one undoable step, and leaves other frames alone (spec groupes spécialisés §2)", () => {
  const data = { kind: "group", role: "general", pantheon: "egyptian" };
  scene = [
    { id: "f1", type: "frame", customData: { openvibe: data } },
    { id: "f2", type: "frame", customData: { openvibe: data } },
    { id: "plain", type: "frame" },
  ];
  setGroupSpeciality("f1", "Frontend");
  expect(scene[0].customData?.openvibe).toEqual({ ...data, speciality: "Frontend" });
  expect(scene[1].customData?.openvibe).toEqual(data);
  setGroupSpeciality("plain", "Frontend");
  expect(scene[2].customData).toBeUndefined();
  setGroupSpeciality("f1", "");
  expect(scene[0].customData?.openvibe).toEqual(data);
});

it("frames the groups it is given, and does nothing without one", () => {
  scene = [{ id: "f1", type: "frame" }, { id: "f2", type: "frame" }, { id: "t1", type: "embeddable" }];
  const scroll = vi.mocked(canvasStore.getState().api!.scrollToContent);
  showGroups([]);
  expect(scroll).not.toHaveBeenCalled();
  showGroups(["f1", "f2", "gone"]);
  expect(scroll.mock.calls[0][0]).toEqual([scene[0], scene[1]]);
});

it("shows a group too wide to read whole once, for all its agents to start, then frames its first terminals (review)", async () => {
  const api = canvasStore.getState().api!;
  vi.mocked(api.getAppState).mockReturnValue({ width: 1440, height: 900 } as never);
  const made = await launchGroup(
    { name: "Mission Auth", role: "general", agents: ["claude", "claude", "claude", "claude"] },
    { cwd: "C:/code", shell: "default", title: "", command: "" },
    { x: 0, y: 0 },
    { pantheon: "egyptian", names: ["Isis", "Horus", "Thot", "Anubis"], cwds: ["C:/a", "C:/b", "C:/c", "C:/d"] },
  );
  const scroll = vi.mocked(api.scrollToContent);
  await vi.waitFor(() => expect(scroll.mock.calls.length).toBeGreaterThan(1));
  const first = scroll.mock.calls[0][0] as unknown as { id: string }[];
  expect(first.map((e) => e.id)).toEqual([made!.frameId]);
  const last = scroll.mock.calls[scroll.mock.calls.length - 1][0] as unknown as { id: string }[];
  expect(last.map((e) => e.id)).toEqual(made!.nodeIds.slice(0, last.length));
  expect(last.length).toBeLessThan(4);
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

it("folds and unfolds a group as one undoable step, keeping everything else (spec replier un groupe §3)", () => {
  const data = { kind: "group", role: "general", pantheon: "egyptian", speciality: "API" };
  scene = [{ id: "f1", type: "frame", customData: { openvibe: data } }, { id: "plain", type: "frame" }, { id: "t1", type: "embeddable", customData: { kind: "terminal" }, frameId: "f1" } as never];
  setGroupFolded("f1", true);
  // Hidden agents cannot be selected, moved or deleted by a click on their empty cell.
  expect((scene[2] as { locked?: boolean }).locked).toBe(true);
  expect(scene[0].customData?.openvibe).toEqual({ ...data, folded: true });
  setGroupFolded("plain", true);
  expect(scene[1].customData).toBeUndefined();
  setGroupFolded("f1", false);
  expect(scene[0].customData?.openvibe).toEqual(data);
  expect((scene[2] as { locked?: boolean }).locked).toBe(false);
});

it("unfolds a folded group before adding an agent to it, so the agent shows and starts", async () => {
  const data = { kind: "group", role: "general", pantheon: "egyptian", folded: true };
  scene = [{ id: "f1", type: "frame", customData: { openvibe: data } }];
  canvasStore.setState({ frames: [{ id: "f1", name: "G", x: 0, y: 0, width: 800, height: 500, group: { role: "general", pantheon: "egyptian", folded: true }, memberIds: [] }] as never });
  workspacesStore.setState({ activeId: "w1" });
  await addAgentToGroup("f1", "shell");
  expect(scene[0].customData?.openvibe).not.toHaveProperty("folded");
});

it("does not fold a group whose agents have not started yet: a hidden agent never starts", () => {
  const data = { kind: "group", role: "general", pantheon: "egyptian" };
  scene = [{ id: "f1", type: "frame", customData: { openvibe: data } }, { id: "t1", type: "embeddable", customData: { kind: "terminal" }, frameId: "f1" } as never];
  canvasStore.setState({ frames: [{ id: "f1", name: "G", x: 0, y: 0, width: 1, height: 1, group: { role: "general", pantheon: "egyptian" }, memberIds: ["t1"] }] as never });
  terminalStatusStore.getState().set("t1", { state: "starting" });
  setGroupFolded("f1", true);
  expect(scene[0].customData?.openvibe).toEqual(data);
  expect(toast.error).toHaveBeenCalled();
  terminalStatusStore.getState().set("t1", { state: "running" });
  setGroupFolded("f1", true);
  expect(scene[0].customData?.openvibe).toEqual({ ...data, folded: true });
});
