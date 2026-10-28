// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { canvasStore } from "@/canvas/canvasStore";
import { flushAll } from "@/lib/flush";
import { nodeNameOf, nodesStore } from "@/store/nodes";
import { workspacesStore } from "@/store/workspaces";
import { assignMissingNames, nameForNewAgent, pantheonForNewGroup } from "./naming";

const terminal = (name?: string) =>
  JSON.stringify({ title: "t", cwd: "C:/code", agent: "claude", shell: "default", command: "", ...(name ? { name } : {}) });

let pantheonSaves: string[] = [];

beforeEach(async () => {
  pantheonSaves = [];
  mockIPC((cmd, raw) => {
    const args = raw as Record<string, string>;
    if (cmd === "list_workspaces") return [{ id: "w1", projectId: "p1", name: "A", position: 0, pantheon: null }];
    if (cmd === "set_workspace_pantheon") pantheonSaves.push(args.pantheon);
    if (cmd === "get_setting") return null;
    return undefined;
  });
  await workspacesStore.getState().load("p1");
  nodesStore.getState().forgetWorkspace("w1");
  nodesStore.getState().hydrate("w1", [
    { id: "a", kind: "terminal", payloadJson: terminal() },
    { id: "b", kind: "terminal", payloadJson: terminal("Isis") },
    { id: "c", kind: "terminal", payloadJson: terminal() },
  ]);
});

afterEach(async () => {
  canvasStore.getState().setFrames([]);
  await flushAll(); // debounced node saves must not outlive the IPC mock
  clearMocks();
});

const nameOf = (id: string) => nodeNameOf(nodesStore.getState().nodes[id]);

it("names the terminals saved before names existed, in scene order", async () => {
  await assignMissingNames("w1", ["c", "b", "a"]);
  expect([nameOf("c"), nameOf("b"), nameOf("a")]).toEqual(["Osiris", "Isis", "Horus"]);
  expect(pantheonSaves).toEqual(["egyptian"]);
});

it("gives a new agent the next free name of the workspace's pantheon", async () => {
  await assignMissingNames("w1", ["a", "b", "c"]);
  expect(await nameForNewAgent("w1")).toBe("Anubis");
  expect(pantheonSaves).toEqual(["egyptian"]);
});

it("names each terminal once when two passes run at the same time (StrictMode)", async () => {
  await Promise.all([assignMissingNames("w1", ["a", "c"]), assignMissingNames("w1", ["a", "c"])]);
  expect([nameOf("a"), nameOf("c")]).toEqual(["Osiris", "Horus"]);
});

const groupFrame = (id: string, pantheon: string) => ({
  id,
  name: id,
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  group: { role: "general" as const, pantheon },
  memberIds: [],
});

it("keeps the pantheons of the groups for their own agents", async () => {
  canvasStore.getState().setFrames([groupFrame("g", "egyptian")]);
  expect(await nameForNewAgent("w1")).toBe("Athéna");
  expect(pantheonSaves).toEqual(["greek"]);
});

it("names a group's agent from the group's pantheon", async () => {
  expect(await nameForNewAgent("w1", "norse")).toBe("Odin");
  expect(pantheonSaves).toEqual([]);
});

it("gives a new group the first pantheon nobody in the workspace uses", async () => {
  await nameForNewAgent("w1"); // the agents outside groups take "egyptian"
  canvasStore.getState().setFrames([groupFrame("g", "greek")]);
  expect(pantheonForNewGroup("w1")).toBe("norse");
});
