import { beforeEach, describe, expect, it } from "vitest";
import { agentActivityStore } from "@/store/agentActivity";
import { nodesStore, type NodeRecord } from "@/store/nodes";
import { terminalStatusStore } from "@/store/terminalStatus";
import { workspacesStore } from "@/store/workspaces";
import { currentWaitingAgents, nextWaiting, waitingAgents, type WaitingAgent } from "./waitingAgents";

const terminal = (workspaceId: string, name: string): NodeRecord => ({
  workspaceId,
  kind: "terminal",
  payload: { title: name, name, agent: "claude", cwd: "C:/code", shell: "default", command: "" },
});
const orchestrator = (workspaceId: string, name: string) => ({ workspaceId, kind: "orchestrator", payload: { name } }) as NodeRecord;
const running = { state: "running" };
const waiting = (since: number) => ({ activity: "waiting", since });
const agent = (id: string): WaitingAgent => ({ id, kind: "terminal", name: id, workspaceId: "w1", since: 0 });

describe("waitingAgents (spec notification §3)", () => {
  it("names the running agents waiting for an answer, the one waiting longest first", () => {
    const nodes = { isis: terminal("w1", "Isis"), thot: terminal("w2", "Thot") };
    const list = waitingAgents(["w1", "w2"], nodes, { isis: running, thot: running }, { isis: waiting(20), thot: waiting(10) });
    expect(list).toEqual([
      { id: "thot", kind: "terminal", name: "Thot", workspaceId: "w2", since: 10 },
      { id: "isis", kind: "terminal", name: "Isis", workspaceId: "w1", since: 20 },
    ]);
  });

  it("leaves out an agent that works, is stopped, has no node or belongs to another project", () => {
    const nodes = { busy: terminal("w1", "Busy"), gone: terminal("w1", "Gone"), other: terminal("w9", "Other") };
    const statuses = { busy: running, gone: { state: "exited" }, other: running, closed: running };
    const activities = { busy: { activity: "working", since: 0 }, gone: waiting(0), other: waiting(0), closed: waiting(0) };
    expect(waitingAgents(["w1"], nodes, statuses, activities)).toEqual([]);
  });

  it("counts an orchestrator: its session asks questions too", () => {
    const list = waitingAgents(["w1"], { chef: orchestrator("w1", "Chef") }, { chef: running }, { chef: waiting(0) });
    expect(list).toEqual([{ id: "chef", kind: "orchestrator", name: "Chef", workspaceId: "w1", since: 0 }]);
  });

  it("names a terminal without a first name after its agent", () => {
    const list = waitingAgents(["w1"], { t: terminal("w1", "") }, { t: running }, { t: waiting(0) });
    expect(list[0].name).toBe("Claude");
  });

  it("keeps a stable order when two agents started waiting at the same time", () => {
    const nodes = { b: terminal("w1", "B"), a: terminal("w1", "A") };
    const list = waitingAgents(["w1"], nodes, { a: running, b: running }, { b: waiting(5), a: waiting(5) });
    expect(list.map((a) => a.id)).toEqual(["a", "b"]);
  });
});

describe("currentWaitingAgents", () => {
  beforeEach(() => {
    agentActivityStore.setState({ activities: {} });
    terminalStatusStore.setState({ statuses: {} });
  });

  it("reads the open project's workspaces from the stores", () => {
    workspacesStore.setState({ workspaces: [{ id: "w1", projectId: "p1", name: "Workspace 1", position: 0, pantheon: null }] });
    nodesStore.setState({ nodes: { isis: terminal("w1", "Isis"), thot: terminal("w9", "Thot") } });
    terminalStatusStore.setState({ statuses: { isis: { state: "running" }, thot: { state: "running" } } });
    agentActivityStore.getState().apply({ nodeId: "isis", activity: "waiting", since: 1 });
    agentActivityStore.getState().apply({ nodeId: "thot", activity: "waiting", since: 2 });
    expect(currentWaitingAgents().map((a) => a.id)).toEqual(["isis"]);
  });
});

describe("nextWaiting (spec notification §6)", () => {
  const agents = [agent("a"), agent("b"), agent("c")];

  it("takes the agent after the current one, then loops", () => {
    expect(nextWaiting(agents, "a")?.id).toBe("b");
    expect(nextWaiting(agents, "c")?.id).toBe("a");
  });

  it("takes the first one when the current node does not wait", () => {
    expect(nextWaiting(agents, "other")?.id).toBe("a");
    expect(nextWaiting(agents, null)?.id).toBe("a");
  });

  it("stays on the only agent waiting, and finds nobody in an empty list", () => {
    expect(nextWaiting([agent("a")], "a")?.id).toBe("a");
    expect(nextWaiting([], "a")).toBeUndefined();
  });
});
