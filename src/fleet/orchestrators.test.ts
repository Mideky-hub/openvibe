// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from "vitest";
import { mockIPC } from "@tauri-apps/api/mocks";
import { toast } from "sonner";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { canvasStore } from "@/canvas/canvasStore";
import { markForAutostart } from "@/nodes/terminal/registry";
import { nodesStore, sessionOf } from "@/store/nodes";
import { terminalStatusStore } from "@/store/terminalStatus";
import { uiStore } from "@/store/ui";
import { agentsStore } from "./agentsStore";
import { addOrchestrator, orchestrateGroup, requestCloseOrchestrator } from "./orchestrators";
import { adoptCopies } from "./terminals";

vi.mock("@excalidraw/excalidraw", () => ({ CaptureUpdateAction: { IMMEDIATELY: "i", NEVER: "n" }, newElementWith: (e: object, patch: object) => ({ ...e, ...patch }) }));
vi.mock("@/nodes/terminal/registry", () => ({ markForAutostart: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

let scene: { id: string; isDeleted?: boolean; link?: string; customData?: object; type?: string; frameId?: string | null }[] = [];
beforeEach(() => {
  mockIPC(() => undefined);
  vi.clearAllMocks();
  agentsStore.setState({ agents: [{ id: "claude", available: true }], shells: [], loaded: true });
  scene = [];
  const api = {
    getSceneElementsIncludingDeleted: () => scene,
    getSceneElements: () => scene,
    updateScene: ({ elements }: { elements?: typeof scene }) => {
      if (elements) scene = elements;
    },
  };
  canvasStore.setState({ api: api as unknown as ExcalidrawImperativeAPI });
});

it("places an orchestrator with its Claude session, started when shown (spec orchestrateur §6)", async () => {
  await addOrchestrator("w1", { x: 0, y: 0 });
  const id = scene[0].id;
  expect(sessionOf(nodesStore.getState().nodes[id])).toMatchObject({ agent: "claude", role: "orchestrator", name: "Orchestrateur" });
  expect(markForAutostart).toHaveBeenCalledWith(id);
});

it("refuses an orchestrator without Claude Code, and creates nothing (spec première version §7.2)", async () => {
  agentsStore.setState({ agents: [{ id: "claude", available: false }], shells: [], loaded: true });
  await addOrchestrator("w1", { x: 0, y: 0 });
  expect(scene).toEqual([]);
  expect(markForAutostart).not.toHaveBeenCalled();
  expect(toast.error).toHaveBeenCalledWith(
    "Claude Code n'est pas installé : l'orchestrateur en a besoin. Installe-le (voir « Bien démarrer » sur l'accueil), puis réessaie.",
  );
});

it("looks for the agents first when they were never listed", async () => {
  agentsStore.setState({ agents: [], shells: [], loaded: false });
  mockIPC((cmd) => (cmd === "list_agents" ? [{ id: "claude", available: false }] : cmd === "list_shells" ? [] : undefined));
  await addOrchestrator("w1", { x: 0, y: 0 });
  expect(scene).toEqual([]);
  expect(toast.error).toHaveBeenCalled();
});

it("gives a copied orchestrator a session of its own, created when shown", async () => {
  const session = { title: "Chef", name: "Chef", agent: "claude" as const, cwd: "C:/code", shell: "default" as const, command: "", claudeSessionId: "s1", role: "orchestrator" as const };
  await nodesStore.getState().create("chef", { workspaceId: "w1", kind: "orchestrator", payload: { name: "Chef", session } });
  scene = [{ id: "copie", type: "embeddable", customData: { kind: "orchestrator" }, frameId: null }];
  await adoptCopies("w1", [{ id: "copie", sourceId: "chef" }]);
  expect(nodesStore.getState().nodes.copie.payload).toEqual({ name: "Chef" });
});

it("takes back a copied orchestrator when Claude Code is not installed", async () => {
  agentsStore.setState({ agents: [{ id: "claude", available: false }], shells: [], loaded: true });
  await nodesStore.getState().create("chef", { workspaceId: "w1", kind: "orchestrator", payload: { name: "Chef" } });
  scene = [{ id: "copie-refusee", type: "embeddable", customData: { kind: "orchestrator" }, frameId: null }];
  await adoptCopies("w1", [{ id: "copie-refusee", sourceId: "chef" }]);
  expect(nodesStore.getState().nodes["copie-refusee"]).toBeUndefined();
  expect(scene[0].isDeleted).toBe(true);
  expect(toast.error).toHaveBeenCalled();
});

it("asks before closing a working orchestrator, with its wires; a stopped one goes at once (spec première version §5.4)", () => {
  const wire = { id: "fil", type: "arrow", startBinding: { elementId: "chef" }, endBinding: { elementId: "isis" } };
  scene = [{ id: "chef", type: "embeddable" }, wire as (typeof scene)[number], { id: "isis", type: "embeddable" }];
  terminalStatusStore.getState().set("chef", { state: "running" });
  requestCloseOrchestrator("chef");
  expect(uiStore.getState().closing).toEqual({ agents: ["chef"], remove: ["chef", "fil"] });
  expect(scene.some((e) => e.isDeleted)).toBe(false);
  uiStore.getState().setClosing(null);
  terminalStatusStore.getState().set("chef", { state: "stopped" });
  requestCloseOrchestrator("chef");
  expect(uiStore.getState().closing).toBeNull();
  expect(scene.filter((e) => e.isDeleted).map((e) => e.id)).toEqual(["chef", "fil"]);
});

it("puts a second orchestrator of the same group clear of the first (plan B3)", async () => {
  const frame = { id: "g1", type: "frame", x: 1000, y: 0, width: 600, height: 400, isDeleted: false, frameId: null, customData: { openvibe: { kind: "group", role: "backend", pantheon: "egypt" } } };
  scene = [frame];
  canvasStore.setState({
    frames: [{ id: "g1", name: "G", x: 1000, y: 0, width: 600, height: 400, group: { role: "backend", pantheon: "egypt" }, memberIds: [] }],
  });
  const { workspacesStore } = await import("@/store/workspaces");
  workspacesStore.setState({ activeId: "w1" } as never);
  await orchestrateGroup("g1");
  await orchestrateGroup("g1");
  const chefs = scene.filter((e) => e.type === "embeddable") as unknown as { x: number; y: number; width: number; height: number }[];
  expect(chefs).toHaveLength(2);
  const [a, b] = chefs;
  const overlaps = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  expect(overlaps).toBe(false);
});

it("tells which orchestrator it posed, and null when Claude Code is missing (plan presets)", async () => {
  const frame = { id: "g1", type: "frame", x: 1000, y: 0, width: 600, height: 400, isDeleted: false, frameId: null, customData: { openvibe: { kind: "group", role: "backend", pantheon: "egypt" } } };
  scene = [frame];
  canvasStore.setState({
    frames: [{ id: "g1", name: "G", x: 1000, y: 0, width: 600, height: 400, group: { role: "backend", pantheon: "egypt" }, memberIds: [] }],
  });
  const { workspacesStore } = await import("@/store/workspaces");
  workspacesStore.setState({ activeId: "w1" } as never);
  const id = await orchestrateGroup("g1");
  expect(id).toBe((scene.find((e) => e.type === "embeddable") as { id: string }).id);
  agentsStore.setState({ agents: [{ id: "claude", available: false }], shells: [], loaded: true });
  expect(await orchestrateGroup("g1")).toBeNull();
  expect(await orchestrateGroup("nope")).toBeNull();
});
