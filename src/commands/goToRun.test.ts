// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { arrive } from "@/canvas/arrive";
import { focusGroup } from "@/canvas/canvasFocus";
import { langStore } from "@/i18n";
import { agentActivityStore } from "@/store/agentActivity";
import { nodesStore } from "@/store/nodes";
import { projectsStore } from "@/store/projects";
import { terminalStatusStore } from "@/store/terminalStatus";
import { workspacesStore } from "@/store/workspaces";
import { readSource } from "@/theme/cssBlocks";
import type { GoToItem } from "./goTo";
import { goTo, goToAgent, goToNextWaiting } from "./goToRun";
import { completeArrival } from "./pendingArrival";

vi.mock("@/canvas/arrive", () => ({ arrive: vi.fn(() => true) }));
vi.mock("@/canvas/canvasFocus", () => ({ focusGroup: vi.fn(() => true) }));

const select = vi.fn();
const open = vi.fn(() => Promise.resolve());
const item = (fields: Partial<GoToItem>): GoToItem => ({ key: "k", kind: "terminal", label: "Isis", keywords: [], ...fields });

beforeEach(() => {
  vi.mocked(arrive).mockClear().mockReturnValue(true);
  vi.mocked(focusGroup).mockClear().mockReturnValue(true);
  select.mockClear();
  workspacesStore.setState({ activeId: "w1", select } as never);
  projectsStore.setState({ open } as never);
});
afterEach(() => vi.restoreAllMocks());

describe("goTo (spec fenêtre §7.2)", () => {
  it("arrives on a terminal or an orchestrator of the workspace on screen, fits a group", () => {
    goTo(item({ workspaceId: "w1", targetId: "isis" }));
    expect(arrive).toHaveBeenCalledWith("isis");
    goTo(item({ kind: "orchestrator", workspaceId: "w1", targetId: "chef" }));
    expect(arrive).toHaveBeenLastCalledWith("chef");
    goTo(item({ kind: "group", workspaceId: "w1", targetId: "g" }));
    expect(focusGroup).toHaveBeenCalledWith("g");
    expect(select).not.toHaveBeenCalled();
  });

  it("switches to a workspace, opens a project", () => {
    goTo(item({ kind: "workspace", workspaceId: "w2" }));
    expect(select).toHaveBeenCalledWith("w2");
    goTo(item({ kind: "project", projectId: "p2" }));
    expect(open).toHaveBeenCalledWith("p2");
  });

  it("goes to another workspace first, then arrives once its scene is on screen", () => {
    goTo(item({ workspaceId: "w2", targetId: "thot", label: "Thot" }));
    expect(select).toHaveBeenCalledWith("w2");
    expect(arrive).not.toHaveBeenCalled();
    completeArrival("w2");
    expect(arrive).toHaveBeenCalledWith("thot");
    completeArrival("w2");
    expect(arrive).toHaveBeenCalledTimes(1);
  });

  it("abandons an arrival when another workspace's scene comes up first", () => {
    goTo(item({ workspaceId: "w2", targetId: "thot", label: "Thot" }));
    completeArrival("w3");
    completeArrival("w2");
    expect(arrive).not.toHaveBeenCalled();
  });

  it("says so when the target is gone (spec fenêtre §9)", async () => {
    const error = vi.spyOn(toast, "error").mockImplementation(() => "");
    vi.mocked(arrive).mockReturnValue(false);
    goTo(item({ workspaceId: "w2", targetId: "isis", label: "Isis" }));
    completeArrival("w2");
    expect(error).toHaveBeenCalledWith("Isis n'existe plus");
    goTo(item({ kind: "group", workspaceId: "w1", targetId: "g", label: "Serveurs" }));
    vi.mocked(focusGroup).mockReturnValue(false);
    goTo(item({ kind: "group", workspaceId: "w1", targetId: "g", label: "Serveurs" }));
    expect(error).toHaveBeenLastCalledWith("Serveurs n'existe plus");
  });

  it("says so in English too", () => {
    const error = vi.spyOn(toast, "error").mockImplementation(() => "");
    langStore.setState({ lang: "en" });
    vi.mocked(arrive).mockReturnValue(false);
    goTo(item({ workspaceId: "w2", targetId: "isis", label: "Isis" }));
    completeArrival("w2");
    langStore.setState({ lang: "fr" });
    expect(error).toHaveBeenCalledWith("Isis no longer exists");
  });

  it("goes to a waiting agent like a line of « Aller à »", () => {
    goToAgent({ id: "isis", kind: "terminal", name: "Isis", workspaceId: "w1", since: 0 });
    expect(arrive).toHaveBeenCalledWith("isis");
    goToAgent({ id: "chef", kind: "orchestrator", name: "Chef", workspaceId: "w2", since: 0 });
    expect(select).toHaveBeenCalledWith("w2");
    completeArrival("w2");
    expect(arrive).toHaveBeenLastCalledWith("chef");
  });

  it("waits for the scene when a second click comes during the switch of workspace", () => {
    const error = vi.spyOn(toast, "error").mockImplementation(() => "");
    vi.mocked(arrive).mockReturnValue(false);
    const agent = { id: "thot", kind: "terminal", name: "Thot", workspaceId: "w2", since: 0 } as const;
    goToAgent(agent);
    workspacesStore.setState({ activeId: "w2" } as never);
    goToAgent(agent);
    expect(arrive).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    vi.mocked(arrive).mockReturnValue(true);
    completeArrival("w2");
    expect(arrive).toHaveBeenCalledTimes(1);
  });

  it("is completed by the canvas of a workspace, and orchestrators are found by their field", () => {
    expect(readSource("canvas/Canvas.tsx")).toContain("completeArrival(workspaceId)");
    expect(readSource("nodes/orchestrator/OrchestratorNode.tsx")).toContain("data-orchestrator={nodeId}");
  });
});

describe("goToNextWaiting (spec notification §6)", () => {
  const terminal = (name: string) => ({
    workspaceId: "w1",
    kind: "terminal",
    payload: { title: name, name, agent: "claude", cwd: "C:/code", shell: "default", command: "" },
  });

  beforeEach(() => {
    workspacesStore.setState({ workspaces: [{ id: "w1", projectId: "p1", name: "Workspace 1", position: 0, pantheon: null }] } as never);
    nodesStore.setState({ nodes: { a: terminal("A"), b: terminal("B") } } as never);
    terminalStatusStore.setState({ statuses: { a: { state: "running" }, b: { state: "running" } } });
    agentActivityStore.setState({ activities: { a: { activity: "waiting", since: 1 }, b: { activity: "waiting", since: 2 } } });
  });

  it("gets past an orchestrator, whose keyboard is not in the context", () => {
    nodesStore.setState({ nodes: { chef: { workspaceId: "w1", kind: "orchestrator", payload: { name: "Chef" } }, a: terminal("A") } } as never);
    terminalStatusStore.setState({ statuses: { chef: { state: "running" }, a: { state: "running" } } });
    agentActivityStore.setState({ activities: { chef: { activity: "waiting", since: 1 }, a: { activity: "waiting", since: 2 } } });
    // The context keeps naming the last terminal, « a », while the orchestrator has the keyboard.
    for (const expected of ["chef", "a", "chef"]) {
      goToNextWaiting("a");
      expect(arrive).toHaveBeenLastCalledWith(expected);
    }
  });

  it("follows the keyboard when a terminal took it since the last agent reached", () => {
    nodesStore.setState({ nodes: { a: terminal("A"), b: terminal("B"), c: terminal("C") } } as never);
    terminalStatusStore.setState({ statuses: { a: { state: "running" }, b: { state: "running" }, c: { state: "running" } } });
    agentActivityStore.setState({
      activities: { a: { activity: "waiting", since: 1 }, b: { activity: "waiting", since: 2 }, c: { activity: "waiting", since: 3 } },
    });
    goToNextWaiting(null);
    expect(arrive).toHaveBeenLastCalledWith("a");
    goToAgent({ id: "b", kind: "terminal", name: "B", workspaceId: "w1", since: 2 });
    goToNextWaiting("b");
    expect(arrive).toHaveBeenLastCalledWith("c");
  });

  it("remembers an orchestrator reached from the notice", () => {
    nodesStore.setState({ nodes: { chef: { workspaceId: "w1", kind: "orchestrator", payload: { name: "Chef" } }, a: terminal("A"), b: terminal("B") } } as never);
    terminalStatusStore.setState({ statuses: { chef: { state: "running" }, a: { state: "running" }, b: { state: "running" } } });
    agentActivityStore.setState({
      activities: { chef: { activity: "waiting", since: 1 }, a: { activity: "waiting", since: 2 }, b: { activity: "waiting", since: 3 } },
    });
    goToAgent({ id: "chef", kind: "orchestrator", name: "Chef", workspaceId: "w1", since: 1 });
    goToNextWaiting("b");
    expect(arrive).toHaveBeenLastCalledWith("a");
  });

  it("does nothing when nobody waits", () => {
    agentActivityStore.setState({ activities: {} });
    goToNextWaiting(null);
    expect(arrive).not.toHaveBeenCalled();
  });
});
