// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockIPC } from "@tauri-apps/api/mocks";
import { showNode } from "@/canvas/arrive";
import { canvasStore } from "@/canvas/canvasStore";
import { pauseAgents } from "@/fleet/broadcast";
import { closeGroup, launchGroup, showGroups } from "@/fleet/groups";
import { nextName } from "@/fleet/names";
import { linkOrchestrator } from "@/fleet/orchestrators";
import { addTerminal, removeNodes } from "@/fleet/terminals";
import { missionAddAgent, missionCleanup, missionDiscard, missionMerge, missionPrepare, type Worktree } from "@/ipc/mission";
import { langStore } from "@/i18n";
import { ptySendText } from "@/ipc/pty";
import { relaunchTerminal, stopTerminal } from "@/nodes/terminal/registry";
import type { TerminalPayload } from "@/nodes/types";
import { nodesStore, terminalOf } from "@/store/nodes";
import { terminalStatusStore } from "@/store/terminalStatus";
import { workspacesStore } from "@/store/workspaces";
import { notify } from "./events";
import { whenReady } from "./ready";
import { cleanMission, endMission, handoverText, launchMission, mergeMission, reassignTask, subTaskText } from "./launch";
import type { Member, Mission } from "./mission";
import { missionOf, updateMember } from "./store";

vi.mock("@excalidraw/excalidraw", () => ({}));
vi.mock("@/ipc/mission", () => ({ missionPrepare: vi.fn(), missionAddAgent: vi.fn(), missionMerge: vi.fn(), missionCleanup: vi.fn(), missionDiscard: vi.fn(() => Promise.resolve({ removed: [], kept: [] })) }));
vi.mock("@/ipc/pty", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/ipc/pty")>()),
  ptySendText: vi.fn(() => Promise.resolve()),
  ptyWrite: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/nodes/terminal/registry", () => ({ relaunchTerminal: vi.fn(), stopTerminal: vi.fn(), quietFor: vi.fn(() => 0), typedAgo: vi.fn(() => Infinity), freshText: vi.fn(() => ""), markForAutostart: vi.fn() }));
vi.mock("@/fleet/groups", () => ({ launchGroup: vi.fn(), closeGroup: vi.fn(), showGroups: vi.fn() }));
vi.mock("@/fleet/orchestrators", () => ({ linkOrchestrator: vi.fn() }));
vi.mock("@/fleet/terminals", () => ({ addTerminal: vi.fn(() => Promise.resolve("n9")), removeNodes: vi.fn() }));
vi.mock("@/fleet/broadcast", () => ({ pauseAgents: vi.fn(() => Promise.resolve(1)) }));
vi.mock("@/canvas/arrive", () => ({ showNode: vi.fn() }));
vi.mock("./ready", () => ({ whenReady: vi.fn(() => Promise.resolve(true)) }));
vi.mock("./events", () => ({ notify: vi.fn() }));
vi.mock("./store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./store")>()),
  linkedClaudeAgents: vi.fn(() => [{ nodeId: "isis", name: "Isis" }]),
}));

const session: TerminalPayload = { title: "Chef", name: "Chef", agent: "claude", cwd: "C:/code/proj", shell: "default", command: "", claudeSessionId: "s0", role: "orchestrator" };
const plan = [
  { title: "Login", brief: "Fais le login.", agent: "Isis", budgetMin: 20 },
  { title: "API", brief: "Fais l'API\npuis teste", agent: "nouveau", budgetMin: 30 },
];
const tree = (slug: string): Worktree => ({ slug, branch: `openvibe/${slug}`, path: `C:/code/proj.worktrees/${slug}` });
const member = (nodeId: string, name: string, linked: boolean, extra: Partial<Member> = {}): Member => ({
  nodeId, name, task: "t", budgetMin: 5, linked, branch: `openvibe/auth-${nodeId}`, worktree: `C:/w/${nodeId}`, sentAt: 1, ...extra,
});
const missionNow = () => missionOf(nodesStore.getState().nodes.chef)!;

async function setup(mission: Partial<Mission> = {}) {
  await nodesStore.getState().create("chef", {
    workspaceId: "w1",
    kind: "orchestrator",
    payload: { name: "Chef", session, mission: { state: "plan", maxAgents: 4, members: [], name: "Auth", plan, ...mission } },
  });
  await nodesStore.getState().create("isis", {
    workspaceId: "w1",
    kind: "terminal",
    payload: { ...session, role: undefined, name: "Isis", claudeSessionId: "old", steps: [{ title: "Plan", state: "fait" }] },
  });
}

beforeEach(() => {
  mockIPC(() => undefined);
  vi.clearAllMocks();
  vi.mocked(missionPrepare).mockResolvedValue(tree("auth"));
  vi.mocked(missionAddAgent).mockImplementation(async (_project, mission, agent) => tree(`${mission}-${agent.toLowerCase()}`));
  vi.mocked(launchGroup).mockResolvedValue({ frameId: "f1", nodeIds: ["n1"] });
  for (const id of ["chef", "isis", "n1"]) terminalStatusStore.getState().set(id, { state: "running" });
  workspacesStore.setState({ activeId: "w1" });
  canvasStore.setState({ frames: [], links: {} });
});

it("writes an agent's sub-task on one line, with its budget, branch and duties (spec §7.3)", () => {
  expect(subTaskText("Auth", plan[1], "openvibe/auth-horus")).toBe(
    "[OpenVibe · mission Auth] API — Fais l'API puis teste. Budget : 30 min. Branche : openvibe/auth-horus. Ce worktree est neuf : les dépendances (node_modules…) n'y sont pas installées. Déclare tes étapes, délègue à tes sous-agents, commit sur ta branche, puis rends compte avec report.",
  );
});

describe("what OpenVibe types to agents, in English (spec première version §7.1)", () => {
  const english = async (check: () => Promise<void> | void) => {
    langStore.setState({ lang: "en" });
    try {
      await check();
    } finally {
      langStore.setState({ lang: "fr" });
    }
  };

  it("writes the sub-task and the handover in the interface's language", () =>
    english(() => {
      expect(subTaskText("Auth", plan[1], "openvibe/auth-horus")).toBe(
        "[OpenVibe · mission Auth] API — Fais l'API puis teste. Budget: 30 min. Branch: openvibe/auth-horus. This worktree is new: its dependencies (node_modules…) are not installed. Declare your steps, delegate to your sub-agents, commit on your branch, then report with report.",
      );
      expect(handoverText(member("n1", "Horus", false, { report: { summary: "API done", status: "termine", at: 1 } }))).toBe(
        'Taking over Horus\'s work: its report (done): "API done". Its branch openvibe/auth-n1: merge it into yours to start from its work.',
      );
      expect(handoverText(member("n1", "Horus", false))).toContain("it did not report");
    }));

  it("tells the orchestrator in English that the mission could not start", () =>
    english(async () => {
      await setup();
      vi.mocked(missionPrepare).mockRejectedValueOnce(new Error("boom"));
      await launchMission("chef");
      expect(notify).toHaveBeenCalledWith("chef", "The mission could not start: boom");
    }));

  it("says what was merged in English", () =>
    english(async () => {
      const done = { summary: "ok", status: "termine" as const, at: 1 };
      await setup({ state: "en_cours", worktree: "C:/w/auth", branch: "openvibe/auth", members: [member("isis", "Isis", true, { report: done }), member("n1", "Horus", false, { report: done })] });
      vi.mocked(missionMerge).mockImplementation(async (_mission, _agent, branch) =>
        branch.endsWith("isis") ? { merge: { kind: "merged" }, uncommitted: true } : { merge: { kind: "conflict", files: ["a.ts"] }, uncommitted: false },
      );
      expect(await mergeMission("chef")).toBe("Branch openvibe/auth:\nIsis: merged (uncommitted changes in its worktree are not merged)\nHorus: conflict, merge undone — a.ts");
    }));

  it("refuses a reassignment in English, and tells the previous agent in English", () =>
    english(async () => {
      const report = { summary: "API done", status: "termine" as const, at: 1 };
      await setup({ state: "en_cours", project: "C:/code/proj", slug: "auth", frameId: "f1", members: [member("isis", "Isis", true, { task: "Login" }), member("n1", "Horus", false, { task: "API", report, merged: true })] });
      expect(await reassignTask("chef", "n1", "Isis")).toBe('Isis has not finished its sub-task: choose an agent that has reported, or "new".');
      expect(await reassignTask("chef", "isis", "Horus")).toEqual({ name: "Horus" });
      expect(ptySendText).toHaveBeenCalledWith("isis", '[OpenVibe] Your sub-task "Login" goes to Horus: stop it and commit nothing more on it.');
    }));
});

describe("the model router (spec maj §3)", () => {
  it("starts each agent on the model of its sub-task's level, and gives the linked ones theirs back at the end", async () => {
    await setup({ router: true, plan: [{ ...plan[0], level: "eleve" }, { ...plan[1], level: "faible" }] });
    await launchMission("chef");
    expect(launchGroup).toHaveBeenCalledWith(expect.anything(), expect.anything(), undefined, expect.objectContaining({ models: ["claude-haiku-5-5"] }));
    expect(terminalOf(nodesStore.getState().nodes.isis)?.model).toBe("claude-opus-5-5");
    expect(relaunchTerminal).toHaveBeenCalledWith("isis", expect.objectContaining({ model: "claude-opus-5-5" }), "new");
    expect(missionNow().members.map((m) => m.model)).toEqual(["claude-opus-5-5", "claude-haiku-5-5"]);
    endMission("chef", "Fini.");
    expect(terminalOf(nodesStore.getState().nodes.isis)?.model).toBeUndefined();
    expect(relaunchTerminal).toHaveBeenLastCalledWith("isis", expect.objectContaining({ cwd: "C:/code/proj", model: undefined }), "new");
  });

  it("does not launch with the router on and a sub-task without a level: it would run on the default model (final review maj §3)", async () => {
    await setup({ router: true });
    await launchMission("chef");
    expect(missionPrepare).not.toHaveBeenCalled();
    expect(missionNow()).toMatchObject({ state: "plan", error: expect.stringContaining("niveau") });
    expect(notify).toHaveBeenCalledWith("chef", expect.stringContaining("niveau"));
  });

  it("leaves the models alone without the router", async () => {
    await setup({ plan: [{ ...plan[0], level: "eleve" }, { ...plan[1], level: "faible" }] });
    await launchMission("chef");
    expect(launchGroup).toHaveBeenCalledWith(expect.anything(), expect.anything(), undefined, expect.objectContaining({ models: [undefined] }));
    expect(terminalOf(nodesStore.getState().nodes.isis)?.model).toBeUndefined();
    expect(missionNow().members.map((m) => m.model)).toEqual([undefined, undefined]);
  });
});

describe("launchMission (spec §7.3)", () => {
  it("forms the team: a worktree each, linked agents relaunched there anew, new ones in the mission's group", async () => {
    await setup();
    await launchMission("chef");
    const mission = missionNow();
    const fresh = mission.members[1].name;
    expect(missionPrepare).toHaveBeenCalledWith("C:/code/proj", "Auth");
    expect(vi.mocked(missionAddAgent).mock.calls).toEqual([
      ["C:/code/proj", "auth", "Isis"],
      ["C:/code/proj", "auth", fresh],
    ]);
    const isis = terminalOf(nodesStore.getState().nodes.isis)!;
    expect(isis.cwd).toBe("C:/code/proj.worktrees/auth-isis");
    expect(isis.claudeSessionId).not.toBe("old");
    expect(isis.steps).toBeUndefined();
    expect(relaunchTerminal).toHaveBeenCalledWith("isis", expect.objectContaining({ cwd: isis.cwd, claudeSessionId: isis.claudeSessionId }), "new");
    expect(launchGroup).toHaveBeenCalledWith(
      { name: "Mission Auth", role: "general", agents: ["claude"] },
      expect.anything(),
      undefined,
      expect.objectContaining({ names: [fresh], cwds: [tree(`auth-${fresh.toLowerCase()}`).path] }),
    );
    expect(linkOrchestrator).toHaveBeenCalledWith("chef", "f1");
    expect(mission).toMatchObject({ state: "en_cours", project: "C:/code/proj", slug: "auth", branch: "openvibe/auth", frameId: "f1" });
    expect(mission.startedAt).toEqual(expect.any(Number));
    expect(mission.members.map((m) => [m.nodeId, m.linked, m.branch])).toEqual([
      ["isis", true, "openvibe/auth-isis"],
      ["n1", false, tree(`auth-${fresh.toLowerCase()}`).branch],
    ]);
    expect(vi.mocked(notify).mock.calls[0]).toEqual(["chef", expect.stringContaining("Feu vert")]);
    await vi.waitFor(() => expect(missionNow().members.every((m) => m.sentAt !== undefined)).toBe(true));
    expect(ptySendText).toHaveBeenCalledWith("isis", subTaskText("Auth", plan[0], "openvibe/auth-isis"));
    expect(ptySendText).toHaveBeenCalledWith("n1", subTaskText("Auth", plan[1], tree(`auth-${fresh.toLowerCase()}`).branch));
  });

  it("judges a linked agent ready only once it is relaunched in its worktree (final review H2)", async () => {
    await setup();
    let relaunched!: () => void;
    vi.mocked(relaunchTerminal).mockReturnValueOnce(new Promise<void>((resolve) => (relaunched = resolve)));
    await launchMission("chef");
    await vi.waitFor(() => expect(ptySendText).toHaveBeenCalledWith("n1", expect.any(String)));
    expect(whenReady).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ptySendText).mock.calls.some(([id]) => id === "isis")).toBe(false);
    relaunched();
    await vi.waitFor(() => expect(ptySendText).toHaveBeenCalledWith("isis", expect.any(String)));
    expect(whenReady).toHaveBeenCalledTimes(2);
  });

  it("takes a mission whose git fails back to its plan, with the error, and launches no one", async () => {
    await setup();
    vi.mocked(missionPrepare).mockRejectedValueOnce(new Error("Le dossier du projet n'est pas un dépôt git."));
    await launchMission("chef");
    expect(missionNow()).toMatchObject({ state: "plan", error: "Le dossier du projet n'est pas un dépôt git.", members: [] });
    expect(notify).toHaveBeenCalledWith("chef", "La mission n'a pas pu démarrer : Le dossier du projet n'est pas un dépôt git.");
    vi.mocked(missionAddAgent).mockResolvedValueOnce(tree("auth-isis")).mockRejectedValueOnce(new Error("La branche openvibe/auth-x existe déjà."));
    await launchMission("chef");
    expect(missionNow()).toMatchObject({ state: "plan", error: "La branche openvibe/auth-x existe déjà." });
    expect(relaunchTerminal).not.toHaveBeenCalled();
    expect(launchGroup).not.toHaveBeenCalled();
  });

  it("forms one team for two go-aheads in a row", async () => {
    await setup();
    let release!: (tree: Worktree) => void;
    vi.mocked(missionPrepare).mockReturnValueOnce(new Promise((resolve) => (release = resolve)));
    const first = launchMission("chef");
    await launchMission("chef");
    expect(missionNow().state).toBe("lancement");
    release(tree("auth"));
    await first;
    expect(missionPrepare).toHaveBeenCalledTimes(1);
    expect(launchGroup).toHaveBeenCalledTimes(1);
  });

  it("types no sub-task into the shell of an agent whose Claude never got ready (README mission)", async () => {
    await setup();
    // Its terminal still runs: the shell outlived a Claude that exited at its trust prompt.
    vi.mocked(whenReady).mockResolvedValueOnce(false).mockResolvedValueOnce(false);
    await launchMission("chef");
    await vi.waitFor(() => expect(vi.mocked(notify).mock.calls.filter(([, text]) => text.includes("n'est pas prêt"))).toHaveLength(2));
    expect(ptySendText).not.toHaveBeenCalled();
  });

  it("tells the orchestrator when an agent did not start, instead of typing into nothing", async () => {
    await setup();
    terminalStatusStore.getState().set("n1", { state: "stopped" });
    await launchMission("chef");
    await vi.waitFor(() => expect(notify).toHaveBeenCalledWith("chef", expect.stringContaining("n'a pas démarré")));
    expect(vi.mocked(ptySendText).mock.calls.some(([id]) => id === "n1")).toBe(false);
  });
});

describe("a new agent in a chosen group (spec groupes spécialisés §4)", () => {
  const front = { id: "g1", name: "Interface", x: 100, y: 100, width: 200, height: 100, memberIds: [], group: { role: "frontend" as const, pantheon: "norse", speciality: "Frontend" } };
  const inFront = { ...plan[1], group: { id: "g1", name: "Interface" } };

  beforeEach(() => {
    canvasStore.setState({ frames: [front], links: { chef: { groupIds: ["g1"], nodeIds: [] } } });
    terminalStatusStore.getState().set("n9", { state: "running" });
  });

  it("joins the group with a name of its pantheon, in its worktree, and gets its sub-task", async () => {
    await setup({ router: true, plan: [{ ...inFront, level: "faible" }] });
    await launchMission("chef");
    const mission = missionNow();
    const joined = mission.members[0];
    expect(launchGroup).not.toHaveBeenCalled();
    expect(joined).toMatchObject({ nodeId: "n9", name: nextName("norse", ["Isis"]), linked: false, group: "g1" });
    expect(addTerminal).toHaveBeenCalledWith("w1", expect.objectContaining({ name: joined.name, cwd: joined.worktree, agent: "claude", model: "claude-haiku-5-5" }), { x: 200, y: 150 }, "g1");
    expect(mission.frameId).toBeUndefined();
    expect(showGroups).toHaveBeenCalledWith(["g1"]);
    await vi.waitFor(() => expect(ptySendText).toHaveBeenCalledWith("n9", expect.stringContaining("API")));
  });

  it("leaves the others in the mission's group and frames both, each name unique", async () => {
    await setup({ plan: [plan[0], plan[1], inFront, { ...inFront, title: "Style" }] });
    vi.mocked(addTerminal).mockResolvedValueOnce("n9").mockResolvedValueOnce("n8");
    terminalStatusStore.getState().set("n8", { state: "running" });
    await launchMission("chef");
    expect(launchGroup).toHaveBeenCalledWith(expect.objectContaining({ agents: ["claude"] }), expect.anything(), undefined, expect.anything());
    expect(missionNow().members.map((m) => m.nodeId)).toEqual(["isis", "n1", "n9", "n8"]);
    expect(new Set(missionNow().members.map((m) => m.name)).size).toBe(4);
    expect(showGroups).toHaveBeenCalledWith(["g1", "f1"]);
    expect(missionNow().frameId).toBe("f1");
  });

  it("frames nothing more when nobody joins a group, as before", async () => {
    await setup();
    await launchMission("chef");
    expect(addTerminal).not.toHaveBeenCalled();
    expect(showGroups).not.toHaveBeenCalled();
  });

  it("does not start when the group is no longer linked, before any git work", async () => {
    await setup({ plan: [inFront] });
    canvasStore.setState({ links: {} });
    await launchMission("chef");
    expect(missionNow()).toMatchObject({ state: "plan", error: "Le groupe Interface n'est plus relié à l'orchestrateur." });
    expect(missionPrepare).not.toHaveBeenCalled();
  });

  it("does not start when the group goes during the git work, and takes the worktrees back", async () => {
    await setup({ plan: [inFront] });
    vi.mocked(missionPrepare).mockImplementationOnce(async () => {
      canvasStore.setState({ frames: [] });
      return tree("auth");
    });
    await launchMission("chef");
    expect(missionNow()).toMatchObject({ state: "plan", error: "Le groupe Interface n'est plus relié à l'orchestrateur." });
    expect(addTerminal).not.toHaveBeenCalled();
    expect(missionDiscard).toHaveBeenCalled();
  });

  it("does not start when the group goes while the mission's group is made: no member without a terminal (final review)", async () => {
    await setup({ plan: [plan[1], inFront] });
    vi.mocked(launchGroup).mockImplementationOnce(async () => {
      canvasStore.setState({ frames: [] });
      return { frameId: "f1", nodeIds: ["n1"] };
    });
    await launchMission("chef");
    expect(missionNow()).toMatchObject({ state: "plan", error: "Le groupe Interface n'est plus relié à l'orchestrateur.", members: [] });
    expect(closeGroup).toHaveBeenCalledWith("f1");
    expect(missionDiscard).toHaveBeenCalled();
  });

  it("takes back what it created when an agent cannot join, so no terminal sits in a removed worktree", async () => {
    await setup({ plan: [plan[1], inFront, { ...inFront, title: "Style" }] });
    vi.mocked(addTerminal).mockResolvedValueOnce("n9").mockResolvedValueOnce(null);
    await launchMission("chef");
    expect(missionNow().state).toBe("plan");
    expect(closeGroup).toHaveBeenCalledWith("f1");
    expect(removeNodes).toHaveBeenCalledWith(["n9"]);
    expect(missionDiscard).toHaveBeenCalled();
    expect(relaunchTerminal).not.toHaveBeenCalled();
  });

  it("closes it at the end, the group and its own agents staying", async () => {
    await setup({ state: "en_cours", project: "C:/code/proj", members: [member("n9", "Thor", false, { group: "g1" })] });
    endMission("chef", "Fini.");
    expect(removeNodes).toHaveBeenCalledWith(["n9"]);
    expect(closeGroup).not.toHaveBeenCalled();
  });

  it("closes both kinds at the end of a mixed team", async () => {
    await setup({ state: "en_cours", project: "C:/code/proj", frameId: "f1", members: [member("n1", "Horus", false), member("n9", "Thor", false, { group: "g1" })] });
    endMission("chef", "Fini.");
    expect(closeGroup).toHaveBeenCalledWith("f1");
    expect(removeNodes).toHaveBeenCalledWith(["n9"]);
  });

  it("only stops it when the mission ends away from its workspace", async () => {
    await setup({ state: "en_cours", project: "C:/code/proj", members: [member("n9", "Thor", false, { group: "g1" })] });
    workspacesStore.setState({ activeId: "w2" });
    endMission("chef", "Fini.");
    expect(removeNodes).not.toHaveBeenCalled();
    expect(stopTerminal).toHaveBeenCalledWith("n9");
  });

  it("sends a new agent taking over its sub-task to the same group, else the mission's", async () => {
    const running = { state: "en_cours" as const, project: "C:/code/proj", slug: "auth", plan: [{ ...inFront, title: "t" }], members: [member("n7", "Thor", false, { group: "g1" })] };
    await setup(running);
    await reassignTask("chef", "n7", "nouveau");
    expect(addTerminal).toHaveBeenCalledWith("w1", expect.anything(), { x: 200, y: 150 }, "g1");
    expect(missionNow().members.find((m) => m.nodeId === "n9")).toMatchObject({ group: "g1" });

    nodesStore.setState({ nodes: {} });
    await setup({ ...running, frameId: "m1" });
    canvasStore.setState({ frames: [{ ...front, id: "m1" }] });
    vi.mocked(addTerminal).mockClear();
    await reassignTask("chef", "n7", "nouveau");
    expect(addTerminal).toHaveBeenCalledWith("w1", expect.anything(), { x: 200, y: 150 }, "m1");
    expect(missionNow().members.find((m) => m.nodeId === "n9")?.group).toBeUndefined();
  });
});

it("ends the mission: created agents closed, linked ones back in the project in a new conversation (spec §7.7)", async () => {
  await setup({ state: "en_cours", project: "C:/code/proj", frameId: "f1", members: [member("isis", "Isis", true), member("n1", "Horus", false)] });
  vi.spyOn(Date, "now").mockReturnValue(1_234_567);
  endMission("chef", "Tout est fait.");
  vi.mocked(Date.now).mockRestore();
  expect(missionNow()).toMatchObject({ state: "terminee", summary: "Tout est fait.", endedAt: 1_234_567 });
  expect(relaunchTerminal).toHaveBeenCalledWith("isis", expect.objectContaining({ cwd: "C:/code/proj" }), "new");
  expect(closeGroup).toHaveBeenCalledWith("f1");
});

it("merges the branches of the agents done, and says what happened to each (spec §7.6)", async () => {
  const done = { summary: "ok", status: "termine" as const, at: 1 };
  await setup({
    state: "en_cours",
    worktree: "C:/w/auth",
    branch: "openvibe/auth",
    members: [member("isis", "Isis", true, { report: done }), member("n1", "Horus", false, { report: done }), member("n2", "Anubis", false, { report: { ...done, status: "bloque" } })],
  });
  vi.mocked(missionMerge).mockImplementation(async (_mission, _agent, branch) =>
    branch.endsWith("isis") ? { merge: { kind: "merged" }, uncommitted: true } : { merge: { kind: "conflict", files: ["a.ts"] }, uncommitted: false },
  );
  expect(await mergeMission("chef")).toBe(
    "Branche openvibe/auth :\nIsis : fusionné (des changements non commités de son worktree ne sont pas fusionnés)\nHorus : conflit, fusion annulée — a.ts",
  );
  expect(vi.mocked(missionMerge).mock.calls.map(([mission, agent, branch]) => [mission, agent, branch])).toEqual([
    ["C:/w/auth", "C:/w/isis", "openvibe/auth-isis"],
    ["C:/w/auth", "C:/w/n1", "openvibe/auth-n1"],
  ]);
  expect(missionNow().members.map((m) => m.merged === true)).toEqual([true, false, false]);
});

it("cleans a finished mission and frees the orchestrator for the next, its settings kept", async () => {
  await setup({ state: "terminee", budgetMin: 90, maxAgents: 3, project: "C:/code/proj", slug: "auth", summary: "ok", members: [member("isis", "Isis", true)] });
  vi.mocked(missionCleanup).mockResolvedValue({ removed: ["auth-isis", "auth"], kept: [] });
  expect(await cleanMission("chef")).toEqual({ removed: ["auth-isis", "auth"], kept: [] });
  expect(missionCleanup).toHaveBeenCalledWith("C:/code/proj", "auth", ["Isis"]);
  expect(missionNow()).toEqual({ state: "redaction", budgetMin: 90, maxAgents: 3, members: [] });
});

it("keeps the router setting when the mission is cleaned (backlog 27 oct)", async () => {
  await setup({ state: "terminee", budgetMin: 90, maxAgents: 3, router: true, project: "C:/code/proj", slug: "auth", summary: "ok", members: [member("isis", "Isis", true)] });
  vi.mocked(missionCleanup).mockResolvedValue({ removed: [], kept: [] });
  await cleanMission("chef");
  expect(missionNow()).toMatchObject({ state: "redaction", router: true });
});

describe("what the final review of H2 found", () => {
  it("undoes the worktrees of a launch that fails, and moves no linked agent before the group exists", async () => {
    await setup();
    vi.mocked(launchGroup).mockResolvedValueOnce(null);
    await launchMission("chef");
    expect(missionNow()).toMatchObject({ state: "plan", error: "Le groupe des nouveaux agents n'a pas pu être créé." });
    expect(relaunchTerminal).not.toHaveBeenCalled();
    expect(terminalOf(nodesStore.getState().nodes.isis)?.cwd).toBe("C:/code/proj");
    const fresh = vi.mocked(missionAddAgent).mock.calls[1][2];
    expect(missionDiscard).toHaveBeenCalledWith("C:/code/proj", [tree("auth"), tree("auth-isis"), tree(`auth-${fresh.toLowerCase()}`)]);
  });

  it("forms no team once the user left the orchestrator's workspace", async () => {
    await setup();
    vi.mocked(missionPrepare).mockImplementationOnce(async () => {
      workspacesStore.setState({ activeId: "w2" });
      return tree("auth");
    });
    await launchMission("chef");
    expect(missionNow()).toMatchObject({ state: "plan", error: expect.stringContaining("n'est plus affiché") });
    expect(launchGroup).not.toHaveBeenCalled();
    expect(relaunchTerminal).not.toHaveBeenCalled();
    expect(missionDiscard).toHaveBeenCalled();
  });

  it("stops the created agents when the mission ends away from its workspace", async () => {
    await setup({ state: "en_cours", project: "C:/code/proj", frameId: "f1", members: [member("isis", "Isis", true), member("n1", "Horus", false)] });
    workspacesStore.setState({ activeId: "w2" });
    endMission("chef", "Fini.");
    expect(closeGroup).not.toHaveBeenCalled();
    expect(stopTerminal).toHaveBeenCalledWith("n1");
    expect(relaunchTerminal).toHaveBeenCalledWith("isis", expect.objectContaining({ cwd: "C:/code/proj" }), "new");
  });

  it("frees the orchestrator even when the cleanup fails", async () => {
    await setup({ state: "terminee", project: "C:/gone", slug: "auth", members: [member("isis", "Isis", true)] });
    vi.mocked(missionCleanup).mockRejectedValueOnce(new Error("Le dossier du projet n'est pas un dépôt git."));
    expect(await cleanMission("chef")).toBe("Le dossier du projet n'est pas un dépôt git.");
    expect(missionNow().state).toBe("redaction");
  });

  it("keeps a merged branch merged when nothing new came since", async () => {
    const done = { summary: "ok", status: "termine" as const, at: 1 };
    await setup({ state: "en_cours", worktree: "C:/w/auth", branch: "openvibe/auth", members: [member("isis", "Isis", true, { report: done, merged: true })] });
    vi.mocked(missionMerge).mockResolvedValue({ merge: { kind: "empty" }, uncommitted: false });
    expect(await mergeMission("chef")).toBe("Branche openvibe/auth :\nIsis : déjà fusionné, rien de nouveau");
    expect(missionNow().members[0].merged).toBe(true);
  });
});

describe("reassignTask (spec §7.2 reattribuer)", () => {
  const report = { summary: "API faite", status: "termine" as const, at: 1 };
  const team = () =>
    setup({ state: "en_cours", project: "C:/code/proj", slug: "auth", frameId: "f1", members: [member("isis", "Isis", true, { task: "Login" }), member("n1", "Horus", false, { task: "API", report, merged: true })] });

  it("gives a sub-task to an agent who is done, with the previous one's report and branch", async () => {
    await team();
    expect(await reassignTask("chef", "isis", "horus")).toEqual({ name: "Horus" });
    const [isis, horus] = missionNow().members;
    expect(isis.handedTo).toBe("Horus");
    expect(horus).toMatchObject({ task: "Login", budgetMin: 20, report: undefined, overdue: undefined, extraMin: undefined, merged: undefined, done: ["API"] });
    // The previous agent stops: its sub-task is another's now (final review H3).
    expect(pauseAgents).toHaveBeenCalledWith(["isis"]);
    expect(ptySendText).toHaveBeenCalledWith("isis", "[OpenVibe] Ta sous-tâche « Login » passe à Horus : arrête-la et ne commite plus rien dessus.");
    await vi.waitFor(() => expect(ptySendText).toHaveBeenCalledWith("n1", expect.stringContaining("Reprise du travail d'Isis")));
    const text = vi.mocked(ptySendText).mock.calls.find(([id]) => id === "n1")![1];
    expect(text.startsWith(subTaskText("Auth", plan[0], "openvibe/auth-n1"))).toBe(true);
    expect(text).toContain("openvibe/auth-isis");
    expect(handoverText(member("n1", "Horus", false, { report }))).toContain("« API faite »");
  });

  it("refuses an agent who is not done, the same agent, or a stranger; nothing changes", async () => {
    await team();
    const before = missionNow();
    expect(await reassignTask("chef", "n1", "Isis")).toContain("n'a pas fini");
    expect(await reassignTask("chef", "isis", "Isis")).toContain("n'est pas un autre agent");
    expect(await reassignTask("chef", "isis", "Zeus")).toContain("n'est pas un autre agent");
    expect(missionNow()).toEqual(before);
    // Its finished work must reach the mission's branch before its entry takes another sub-task (final review H3).
    updateMember("chef", "n1", { merged: false });
    const unmerged = missionNow();
    expect(await reassignTask("chef", "isis", "Horus")).toContain("appelle merge d'abord");
    expect(missionNow()).toEqual(unmerged);
    expect(pauseAgents).not.toHaveBeenCalled();
  });

  it("refuses at once an agent that is stopped, instead of failing a minute later", async () => {
    await team();
    terminalStatusStore.getState().set("n1", { state: "stopped" });
    expect(await reassignTask("chef", "isis", "Horus")).toContain("est arrêté");
    expect(missionNow().members[0].handedTo).toBeUndefined();
    expect(pauseAgents).not.toHaveBeenCalled();
  });

  it("does not open a new agent past Max agents", async () => {
    await setup({ state: "en_cours", maxAgents: 2, project: "C:/code/proj", slug: "auth", frameId: "f1", members: [member("isis", "Isis", true, { task: "Login" }), member("n1", "Horus", false, { task: "API" })] });
    expect(await reassignTask("chef", "isis", "nouveau")).toContain("Agents max");
    expect(missionAddAgent).not.toHaveBeenCalled();
    expect(pauseAgents).not.toHaveBeenCalled();
  });

  it("gives a sub-task to a new agent in the mission's group, started at once", async () => {
    await team();
    canvasStore.setState({ frames: [{ id: "f1", x: 0, y: 0, width: 800, height: 500, name: "Mission Auth", group: { role: "general", pantheon: "egyptian" }, memberIds: ["n1"] }] });
    const result = await reassignTask("chef", "isis", "nouveau");
    expect(typeof result === "object" && result.name).toBeTruthy();
    const name = (result as { name: string }).name;
    expect(missionAddAgent).toHaveBeenCalledWith("C:/code/proj", "auth", name);
    expect(addTerminal).toHaveBeenCalledWith("w1", expect.objectContaining({ name, cwd: tree(`auth-${name.toLowerCase()}`).path, agent: "claude" }), { x: 400, y: 250 }, "f1");
    // Shown, it starts like any new agent; a second start would break its session (seen in the app, H3).
    expect(showNode).toHaveBeenCalledWith("n9");
    expect(relaunchTerminal).not.toHaveBeenCalled();
    expect(missionNow().members.map((m) => [m.nodeId, m.task, m.handedTo])).toEqual([
      ["isis", "Login", name],
      ["n1", "API", undefined],
      ["n9", "Login", undefined],
    ]);
  });
});

it("leaves a handed-over agent's branch to its successor when merging (final review H3)", async () => {
  const done = { summary: "ok", status: "termine" as const, at: 1 };
  await setup({ state: "en_cours", worktree: "C:/w/auth", branch: "openvibe/auth", members: [member("isis", "Isis", true, { report: done, handedTo: "Horus" }), member("n1", "Horus", false, { report: done })] });
  vi.mocked(missionMerge).mockResolvedValue({ merge: { kind: "merged" }, uncommitted: false });
  await mergeMission("chef");
  expect(vi.mocked(missionMerge).mock.calls.map(([, , branch]) => branch)).toEqual(["openvibe/auth-n1"]);
});


it("gives a reassigned new agent the model of the sub-task's level when the router is on (backlog Routeur)", async () => {
  await setup({
    state: "en_cours",
    router: true,
    plan: [{ title: "Login", brief: "b", agent: "Isis", budgetMin: 20, level: "eleve" }],
    project: "C:/code/proj",
    slug: "auth",
    frameId: "f1",
    members: [member("isis", "Isis", true, { task: "Login" })],
  });
  canvasStore.setState({ frames: [{ id: "f1", x: 0, y: 0, width: 800, height: 500, name: "Mission Auth", group: { role: "general", pantheon: "egyptian" }, memberIds: ["isis"] }] });
  const result = await reassignTask("chef", "isis", "nouveau");
  expect(typeof result).toBe("object");
  expect(addTerminal).toHaveBeenCalledWith("w1", expect.objectContaining({ model: "claude-opus-5-5" }), expect.anything(), "f1");
  expect(missionNow().members[missionNow().members.length - 1]?.model).toBe("claude-opus-5-5");
});
