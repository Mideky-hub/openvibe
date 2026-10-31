// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { goToAgent } from "@/commands/goToRun";
import { langStore } from "@/i18n";
import { agentActivityStore } from "@/store/agentActivity";
import { nodesStore, type NodeRecord } from "@/store/nodes";
import { terminalStatusStore } from "@/store/terminalStatus";
import { workspacesStore } from "@/store/workspaces";
import { WaitingNotice } from "./WaitingNotice";

vi.mock("@/commands/goToRun", () => ({ goToAgent: vi.fn() }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const IDS = ["isis", "thot", "ra", "nout", "seth"];
const terminal = (workspaceId: string, name: string): NodeRecord => ({
  workspaceId,
  kind: "terminal",
  payload: { title: name, name, agent: "claude", cwd: "C:/code", shell: "default", command: "" },
});

let host: HTMLDivElement;
let root: Root;

const wait = (nodeId: string, since = 0) => act(async () => agentActivityStore.getState().apply({ nodeId, activity: "waiting", since }));
const rows = () => [...host.querySelectorAll("button")].map((b) => b.textContent);
const last = <T,>(list: readonly T[]) => list[list.length - 1];

beforeEach(async () => {
  workspacesStore.setState({
    activeId: "w1",
    workspaces: [
      { id: "w1", projectId: "p1", name: "Workspace 1", position: 0, pantheon: null },
      { id: "w2", projectId: "p1", name: "Backend", position: 1, pantheon: null },
    ],
  });
  nodesStore.setState({
    nodes: { isis: terminal("w1", "Isis"), thot: terminal("w2", "Thot"), ra: terminal("w1", "Ra"), nout: terminal("w1", "Nout"), seth: terminal("w1", "Seth") },
  });
  terminalStatusStore.setState({ statuses: Object.fromEntries(IDS.map((id) => [id, { state: "running" }])) });
  agentActivityStore.setState({ activities: {} });
  vi.mocked(goToAgent).mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<WaitingNotice />));
});

afterEach(async () => {
  langStore.setState({ lang: "fr" });
  await act(async () => root.unmount());
  host.remove();
});

describe("WaitingNotice (spec notification §4)", () => {
  it("shows nothing while nobody waits, its live region already mounted so the first question is announced", () => {
    expect(host.querySelector("section")).toBeNull();
    expect(host.querySelector("[aria-live]")).not.toBeNull();
  });

  it("appears when an agent starts waiting and disappears when it stops", async () => {
    await wait("isis");
    expect(rows()).toEqual(["Isis a une question"]);
    await act(async () => agentActivityStore.getState().apply({ nodeId: "isis", activity: "working", since: 1 }));
    expect(host.querySelector("section")).toBeNull();
  });

  it("disappears when the agent's process ends", async () => {
    await wait("isis");
    await act(async () => agentActivityStore.getState().remove("isis"));
    expect(host.querySelector("section")).toBeNull();
  });

  it("clears the tool rail, at any window height", async () => {
    await wait("isis");
    expect(host.querySelector("section")?.className).toContain("left-[70px]");
  });

  it("names the workspace of an agent that is not on screen", async () => {
    await wait("thot");
    expect(rows()).toEqual(["Thot a une questionBackend"]);
  });

  it("takes the keyboard to the agent on a click", async () => {
    await wait("thot");
    await act(async () => host.querySelector("button")!.click());
    expect(goToAgent).toHaveBeenCalledWith(expect.objectContaining({ id: "thot", workspaceId: "w2" }));
  });

  it("stacks three agents, the one waiting longest first", async () => {
    await wait("ra", 3);
    await wait("isis", 1);
    await wait("nout", 2);
    expect(rows()).toEqual(["Isis a une question", "Nout a une question", "Ra a une question"]);
  });

  it("counts the others past three, and its line goes to the first of them", async () => {
    await wait("isis", 1);
    await wait("nout", 2);
    await wait("ra", 3);
    await wait("seth", 4);
    expect(last(rows())).toBe("+ 1 autre");
    await wait("thot", 5);
    expect(last(rows())).toBe("+ 2 autres");
    await act(async () => last([...host.querySelectorAll("button")]).click());
    expect(goToAgent).toHaveBeenCalledWith(expect.objectContaining({ id: "seth" }));
  });

  it("speaks English", async () => {
    await act(async () => langStore.setState({ lang: "en" }));
    await wait("isis", 1);
    expect(rows()).toEqual(["Isis has a question"]);
    expect(host.querySelector("section")?.getAttribute("aria-label")).toBe("Agents waiting for your answer");
    for (const [id, since] of [["nout", 2], ["ra", 3], ["seth", 4]] as const) await wait(id, since);
    expect(last(rows())).toBe("+ 1 more");
  });
});
