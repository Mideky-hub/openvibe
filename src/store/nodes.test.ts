// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import type { TerminalPayload } from "@/nodes/types";
import { toast } from "sonner";
import { createNodesStore, nodesStore, sessionOf, terminalOf, updateSession } from "./nodes";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const payload: TerminalPayload = { title: "A", name: "", cwd: "C:/code", agent: "shell", command: "", shell: "default" };
let saves: { id: string; payloadJson: string }[];

beforeEach(() => {
  saves = [];
  mockIPC((cmd, args) => {
    if (cmd === "save_node") saves.push(args as { id: string; payloadJson: string });
  });
});
afterEach(() => {
  clearMocks();
  vi.useRealTimers();
});

it("saves a created node immediately", async () => {
  const { store } = createNodesStore();
  await store.getState().create("n1", { workspaceId: "w1", kind: "terminal", payload });
  expect(saves.map((s) => s.id)).toEqual(["n1"]);
  expect(JSON.parse(saves[0].payloadJson)).toEqual(payload);
});

it("groups quick updates into one save after 500 ms", async () => {
  const { store } = createNodesStore();
  await store.getState().create("n1", { workspaceId: "w1", kind: "terminal", payload });
  vi.useFakeTimers();
  store.getState().update("n1", { title: "B" });
  store.getState().update("n1", { title: "C" });
  expect(saves).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(500);
  expect(saves).toHaveLength(2);
  expect(JSON.parse(saves[1].payloadJson).title).toBe("C");
});

it("flushes pending updates on demand", async () => {
  const { store, flushPending } = createNodesStore();
  await store.getState().create("n1", { workspaceId: "w1", kind: "terminal", payload });
  store.getState().update("n1", { title: "Z" });
  await flushPending();
  expect(JSON.parse(saves[saves.length - 1].payloadJson).title).toBe("Z");
});

it("hydrates from SQLite without overwriting newer in-memory nodes", async () => {
  const { store } = createNodesStore();
  await store.getState().create("n1", { workspaceId: "w1", kind: "terminal", payload: { ...payload, title: "fresh" } });
  store.getState().hydrate("w1", [
    { id: "n1", kind: "terminal", payloadJson: JSON.stringify({ ...payload, title: "stale" }) },
    { id: "n2", kind: "terminal", payloadJson: JSON.stringify(payload) },
    { id: "bad", kind: "terminal", payloadJson: "{not json" },
  ]);
  const { nodes } = store.getState();
  expect(terminalOf(nodes.n1)?.title).toBe("fresh");
  expect(nodes.n2.workspaceId).toBe("w1");
  expect(nodes.bad).toBeUndefined();
});

it("forgets the nodes of a workspace", async () => {
  const { store } = createNodesStore();
  await store.getState().create("a", { workspaceId: "w1", kind: "terminal", payload });
  await store.getState().create("b", { workspaceId: "w2", kind: "terminal", payload });
  expect(store.getState().forgetWorkspace("w1")).toEqual(["a"]);
  expect(Object.keys(store.getState().nodes)).toEqual(["b"]);
});

it("reads payloads saved with a preset instead of an agent", () => {
  const store = createNodesStore().store;
  store.getState().hydrate("w1", [
    { id: "old", kind: "terminal", payloadJson: JSON.stringify({ title: "T", cwd: "C:/", preset: "codex", command: "", shell: "cmd" }) },
    { id: "bad", kind: "terminal", payloadJson: "{" },
  ]);
  expect(terminalOf(store.getState().nodes.old)?.agent).toBe("codex");
  expect(store.getState().nodes.bad).toBeUndefined();
});

it("reads orchestrator nodes and keeps them apart from terminals", () => {
  const { store } = createNodesStore();
  store.getState().hydrate("w1", [
    { id: "o1", kind: "orchestrator", payloadJson: '{"name":"Chef"}' },
    { id: "t1", kind: "terminal", payloadJson: JSON.stringify(payload) },
  ]);
  expect(store.getState().nodes.o1).toEqual({ workspaceId: "w1", kind: "orchestrator", payload: { name: "Chef" } });
  expect(terminalOf(store.getState().nodes.t1)).toEqual(payload);
  expect(terminalOf(store.getState().nodes.o1)).toBeUndefined();
  expect(terminalOf(undefined)).toBeUndefined();
});

it("finds a node's Claude session, a terminal's own or an orchestrator's, and changes it where it lives", async () => {
  const session: TerminalPayload = { title: "Chef", name: "Chef", agent: "claude", cwd: "C:/code", shell: "default", command: "", claudeSessionId: "s1", role: "orchestrator" };
  await nodesStore.getState().create("t1", { workspaceId: "w1", kind: "terminal", payload: { ...payload, agent: "claude", claudeSessionId: "s0" } });
  await nodesStore.getState().create("o1", { workspaceId: "w1", kind: "orchestrator", payload: { name: "Chef", session } });
  await nodesStore.getState().create("o2", { workspaceId: "w1", kind: "orchestrator", payload: { name: "Ancien" } });
  expect(sessionOf(nodesStore.getState().nodes.o1)).toEqual(session);
  expect(sessionOf(nodesStore.getState().nodes.o2)).toBeUndefined();
  updateSession("o1", { claudeSessionId: "s2" });
  updateSession("t1", { claudeSessionId: "s3" });
  updateSession("o2", { claudeSessionId: "s4" });
  expect(nodesStore.getState().nodes.o1.payload).toEqual({ name: "Chef", session: { ...session, claudeSessionId: "s2" } });
  expect(sessionOf(nodesStore.getState().nodes.t1)?.claudeSessionId).toBe("s3");
  expect(nodesStore.getState().nodes.o2.payload).toEqual({ name: "Ancien" });
});

it("tells the user when a deferred save is refused", async () => {
  const { store } = createNodesStore();
  await store.getState().create("n1", { workspaceId: "w1", kind: "terminal", payload });
  mockIPC((cmd) => {
    if (cmd === "save_node") throw new Error("disk full");
  });
  vi.useFakeTimers();
  store.getState().update("n1", { title: "B" });
  await vi.advanceTimersByTimeAsync(500);
  expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("disk full"));
});
