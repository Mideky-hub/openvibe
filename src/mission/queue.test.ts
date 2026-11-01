// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockIPC } from "@tauri-apps/api/mocks";
import { canvasStore } from "@/canvas/canvasStore";
import { missionMerge } from "@/ipc/mission";
import { ptySendText } from "@/ipc/pty";
import { langStore } from "@/i18n";
import { buildSpawnSpec } from "@/nodes/terminal/launch";
import { relaunchTerminal } from "@/nodes/terminal/registry";
import type { TerminalPayload } from "@/nodes/types";
import { agentActivityStore } from "@/store/agentActivity";
import { nodesStore, terminalOf } from "@/store/nodes";
import { terminalStatusStore } from "@/store/terminalStatus";
import { workspacesStore } from "@/store/workspaces";
import { notify } from "./events";
import { launchMission, mergeMember, reassignTask } from "./launch";
import type { Member, Mission, QueuedTask } from "./mission";
import { afterReport, giveNext, pumpQueue } from "./queue";
import { missionOf } from "./store";

vi.mock("@excalidraw/excalidraw", () => ({}));
vi.mock("@/ipc/mission", () => ({ missionPrepare: vi.fn(), missionAddAgent: vi.fn(), missionMerge: vi.fn(), missionCleanup: vi.fn(), missionDiscard: vi.fn() }));
vi.mock("@/ipc/pty", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/ipc/pty")>()),
  ptySendText: vi.fn(() => Promise.resolve()),
  ptyWrite: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/nodes/terminal/registry", () => ({ relaunchTerminal: vi.fn(() => Promise.resolve()), stopTerminal: vi.fn(), quietFor: vi.fn(() => 0), typedAgo: vi.fn(() => Infinity), freshText: vi.fn(() => ""), markForAutostart: vi.fn() }));
vi.mock("@/fleet/groups", () => ({ launchGroup: vi.fn(), closeGroup: vi.fn(), showGroups: vi.fn() }));
vi.mock("@/fleet/orchestrators", () => ({ linkOrchestrator: vi.fn() }));
vi.mock("@/fleet/terminals", () => ({ addTerminal: vi.fn(), removeNodes: vi.fn() }));
vi.mock("@/fleet/broadcast", () => ({ pauseAgents: vi.fn(() => Promise.resolve(1)) }));
vi.mock("@/canvas/arrive", () => ({ showNode: vi.fn() }));
vi.mock("./ready", () => ({ whenReady: vi.fn(() => Promise.resolve(true)) }));
vi.mock("./events", () => ({ notify: vi.fn() }));

const session: TerminalPayload = { title: "Chef", name: "Chef", agent: "claude", cwd: "C:/code/proj", shell: "default", command: "", claudeSessionId: "s0", role: "orchestrator" };
const done = { summary: "Login fait", status: "termine" as const, at: 600_000 };
const member = (nodeId: string, name: string, extra: Partial<Member> = {}): Member => ({
  nodeId, name, task: "Login", budgetMin: 20, linked: true, branch: `openvibe/auth-${nodeId}`, worktree: `C:/w/${nodeId}`, sentAt: 0, ...extra,
});
const next: QueuedTask = { title: "API", brief: "Fais l'API", budgetMin: 30 };
const missionNow = () => missionOf(nodesStore.getState().nodes.chef)!;
const lines = () => vi.mocked(notify).mock.calls.map(([, line]) => line);

async function setup(mission: Partial<Mission>) {
  await nodesStore.getState().create("chef", {
    workspaceId: "w1",
    kind: "orchestrator",
    payload: {
      name: "Chef",
      session,
      mission: {
        state: "en_cours", maxAgents: 4, name: "Auth", project: "C:/code/proj", slug: "auth", branch: "openvibe/auth", worktree: "C:/w/auth", startedAt: 0,
        plan: [{ title: "Login", brief: "Fais le login", agent: "Isis", budgetMin: 20 }],
        members: [member("isis", "Isis", { report: done })],
        queue: [next],
        ...mission,
      },
    },
  });
  await nodesStore.getState().create("isis", { workspaceId: "w1", kind: "terminal", payload: { ...session, role: undefined, name: "Isis", claudeSessionId: "old", steps: [{ title: "Plan", state: "fait" }] } });
}

beforeEach(() => {
  mockIPC(() => undefined);
  vi.clearAllMocks();
  langStore.setState({ lang: "fr" });
  vi.mocked(missionMerge).mockResolvedValue({ merge: { kind: "merged" }, uncommitted: false });
  for (const id of ["chef", "isis", "horus"]) terminalStatusStore.getState().set(id, { state: "running" });
  agentActivityStore.setState({ activities: {} });
  workspacesStore.setState({ activeId: "w1" });
  canvasStore.setState({ api: { getSceneElements: () => [], getSceneElementsIncludingDeleted: () => [] } as never, frames: [], links: {} });
});

describe("an agent that reports « done » (spec mission de nuit §4.3)", () => {
  it("has its branch merged, then takes the next task in a new conversation in its worktree", async () => {
    await setup({});
    await afterReport("chef", "isis");
    expect(missionMerge).toHaveBeenCalledWith("C:/w/auth", "C:/w/isis", "openvibe/auth-isis");
    const isis = terminalOf(nodesStore.getState().nodes.isis)!;
    expect(isis.claudeSessionId).not.toBe("old");
    expect(isis.steps).toBeUndefined();
    expect(relaunchTerminal).toHaveBeenCalledWith("isis", expect.objectContaining({ cwd: "C:/w/isis", claudeSessionId: isis.claudeSessionId }), "new");
    await vi.waitFor(() => expect(ptySendText).toHaveBeenCalled());
    expect(ptySendText).toHaveBeenCalledWith(
      "isis",
      "[OpenVibe · mission Auth] API — Fais l'API. Budget : 30 min. Branche : openvibe/auth-isis. Nouvelle tâche, nouvelle conversation, même worktree : commence par fusionner openvibe/auth dans ta branche. Déclare tes étapes, délègue à tes sous-agents, commit sur ta branche, puis rends compte avec report.",
    );
    await vi.waitFor(() => expect(missionNow().members[0].sentAt).toEqual(expect.any(Number)));
  });

  it("moves the task from the queue to the plan, and keeps what the agent finished", async () => {
    await setup({});
    await afterReport("chef", "isis");
    const mission = missionNow();
    expect(mission.queue).toEqual([]);
    expect(mission.plan?.map((s) => [s.title, s.agent])).toEqual([["Login", "Isis"], ["API", "Isis"]]);
    expect(mission.members).toHaveLength(1);
    const isis = mission.members[0];
    expect(isis).toMatchObject({ task: "API", budgetMin: 30, done: ["Login"] });
    expect(isis.report).toBeUndefined();
    expect(isis.merged).toBeUndefined();
    expect(isis.past).toEqual([{ task: "Login", status: "termine", summary: "Login fait", merged: true, spentMin: 10, budgetMin: 20, branch: "openvibe/auth-isis" }]);
    expect(lines()).toEqual(["Isis prend « API ». Reste en attente : 0."]);
  });

  it("waits for the end of its turn: report comes mid-turn, the last commit after it", async () => {
    vi.useFakeTimers();
    try {
      await setup({});
      agentActivityStore.setState({ activities: { isis: { activity: "working" } } as never });
      const handed = afterReport("chef", "isis");
      await vi.advanceTimersByTimeAsync(3000);
      expect(missionMerge).not.toHaveBeenCalled();
      agentActivityStore.setState({ activities: {} });
      await vi.advanceTimersByTimeAsync(1100);
      await handed;
      expect(missionMerge).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops waiting after a minute, rather than stall the queue", async () => {
    vi.useFakeTimers();
    try {
      await setup({});
      agentActivityStore.setState({ activities: { isis: { activity: "working" } } as never });
      const handed = afterReport("chef", "isis");
      await vi.advanceTimersByTimeAsync(61_000);
      await handed;
      expect(missionMerge).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the agent on a conflict and tells the orchestrator; merge restarts the queue", async () => {
    await setup({});
    vi.mocked(missionMerge).mockResolvedValueOnce({ merge: { kind: "conflict", files: ["a.ts"] }, uncommitted: false });
    await afterReport("chef", "isis");
    expect(missionNow().members[0].task).toBe("Login");
    expect(missionNow().queue).toEqual([next]);
    expect(relaunchTerminal).not.toHaveBeenCalled();
    expect(lines()[0]).toBe("Isis : conflit, fusion annulée — a.ts");
    await pumpQueue("chef");
    expect(missionNow().members[0].task).toBe("API");
  });

  it("passes on that uncommitted changes were left out of the merge", async () => {
    await setup({});
    vi.mocked(missionMerge).mockResolvedValueOnce({ merge: { kind: "merged" }, uncommitted: true });
    await afterReport("chef", "isis");
    expect(lines()[0]).toContain("non commités");
    expect(missionNow().members[0].task).toBe("API");
  });

  it("takes the model of the task with the router on", async () => {
    await setup({ router: true, queue: [{ ...next, level: "eleve" }] });
    await afterReport("chef", "isis");
    expect(relaunchTerminal).toHaveBeenCalledWith("isis", expect.objectContaining({ model: "claude-opus-5-5" }), "new");
    expect(missionNow().members[0].model).toBe("claude-opus-5-5");
  });

  it("merges nothing and restarts no one without a task waiting: the orchestrator merges as before", async () => {
    await setup({ queue: undefined });
    await afterReport("chef", "isis");
    expect(missionMerge).not.toHaveBeenCalled();
    expect(relaunchTerminal).not.toHaveBeenCalled();
    expect(lines()).toEqual([]);
  });

  it("gives nothing to a stopped agent", async () => {
    await setup({});
    terminalStatusStore.getState().set("isis", { state: "stopped" });
    await afterReport("chef", "isis");
    expect(missionNow().queue).toEqual([next]);
    expect(missionMerge).not.toHaveBeenCalled();
  });

  it("does not hand two tasks for two reports in a row", async () => {
    await setup({ queue: [next, { ...next, title: "Docs" }] });
    await Promise.all([afterReport("chef", "isis"), afterReport("chef", "isis")]);
    expect(missionNow().queue?.map((t) => t.title)).toEqual(["Docs"]);
  });

  it("stops handing out at the end of the night; the tasks stay for the report", async () => {
    await setup({ overnight: true, budgetMin: 100, startedAt: Date.now() - 95 * 60_000 });
    await afterReport("chef", "isis");
    expect(missionNow().queue).toEqual([next]);
    expect(missionMerge).not.toHaveBeenCalled();
  });
});

describe("an agent that reports « blocked » or « failed »", () => {
  const stuck = { summary: "Bloqué", status: "bloque" as const, at: 60_000 };

  it("keeps its task: the orchestrator decides", async () => {
    await setup({ members: [member("isis", "Isis", { report: stuck })] });
    await afterReport("chef", "isis");
    expect(missionNow().members[0].task).toBe("Login");
    expect(missionNow().queue).toEqual([next]);
  });

  it("can still be reassigned from", async () => {
    await setup({ members: [member("isis", "Isis", { report: stuck }), member("horus", "Horus", { task: "Docs", report: done, merged: true })], plan: [{ title: "Login", brief: "b", agent: "Isis", budgetMin: 20 }, { title: "Docs", brief: "b", agent: "Horus", budgetMin: 20 }] });
    expect(await reassignTask("chef", "isis", "Horus")).toEqual({ name: "Horus" });
  });

  it("takes the next task when next_task asks for it, nothing merged", async () => {
    await setup({ members: [member("isis", "Isis", { report: stuck })] });
    expect(await giveNext("chef", missionNow().members[0])).toEqual({ given: "Isis prend « API ». Reste en attente : 0." });
    expect(missionMerge).not.toHaveBeenCalled();
    const isis = missionNow().members[0];
    expect(isis).toMatchObject({ task: "API" });
    expect(isis.done).toBeUndefined();
    expect(isis.past?.[0]).toMatchObject({ task: "Login", status: "bloque", merged: false });
  });

  it("explains why next_task gives nothing", async () => {
    await setup({ queue: [], members: [member("isis", "Isis", { report: stuck })] });
    expect(await giveNext("chef", missionNow().members[0])).toEqual({ refused: "Aucune tâche en attente pour Isis." });
  });

  it("refuses next_task for an agent still at work", async () => {
    await setup({ members: [member("isis", "Isis")] });
    expect(await giveNext("chef", missionNow().members[0])).toEqual({ refused: "Isis n'a pas fini sa sous-tâche : choisis un agent qui a rendu compte, ou « new »." });
  });
});

describe("who takes what", () => {
  const front = { id: "g1", name: "Interface", x: 0, y: 0, width: 10, height: 10, memberIds: ["isis"], group: { role: "frontend" as const, pantheon: "egyptian" } };

  it("gives an agent the first task of its group, or with no group; never another group's", async () => {
    canvasStore.setState({ frames: [front] });
    const theirs = { ...next, title: "Serveur", group: { id: "g2", name: "Serveur" } };
    const ours = { ...next, title: "Style", group: { id: "g1", name: "Interface" } };
    await setup({ queue: [theirs, ours, next] });
    await afterReport("chef", "isis");
    expect(missionNow().members[0].task).toBe("Style");
    expect(missionNow().queue?.map((t) => t.title)).toEqual(["Serveur", "API"]);
  });

  it("says it in the plural too", async () => {
    await setup({ queue: [next, { ...next, title: "Docs" }], members: [member("isis", "Isis", { report: { ...done, status: "echec" } })] });
    await afterReport("chef", "isis");
    expect(lines()).toEqual(["2 tâches attendent et aucun agent libre ne peut les prendre : next_task, reassign, ou termine."]);
  });

  it("creates no agent: the team stays as it is, within « Agents max »", async () => {
    await setup({ maxAgents: 1, queue: [next, { ...next, title: "Docs" }, { ...next, title: "Tests" }] });
    await afterReport("chef", "isis");
    expect(missionNow().members).toHaveLength(1);
    expect(missionNow().queue).toHaveLength(2);
  });

  it("wakes a free agent when a task arrives", async () => {
    await setup({ queue: [], members: [member("isis", "Isis", { report: done, merged: true })] });
    await afterReport("chef", "isis");
    nodesStore.getState().update("chef", { mission: { ...missionNow(), queue: [next] } });
    await pumpQueue("chef");
    expect(missionNow().members[0].task).toBe("API");
    // Merged at its report or not, merging again is harmless and catches later commits.
    expect(missionMerge).toHaveBeenCalledTimes(1);
  });
});

describe("what the review of the queue found", () => {
  const stuck = { summary: "Bloqué", status: "bloque" as const, at: 60_000 };

  it("merges one branch at a time: two git merges in one worktree break each other", async () => {
    await setup({ queue: [next, { ...next, title: "Docs" }], members: [member("isis", "Isis", { report: done }), member("horus", "Horus", { task: "Docs0", report: done })] });
    let running = 0;
    let most = 0;
    vi.mocked(missionMerge).mockImplementation(async () => {
      most = Math.max(most, ++running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running--;
      return { merge: { kind: "merged" }, uncommitted: false };
    });
    await pumpQueue("chef");
    expect(vi.mocked(missionMerge)).toHaveBeenCalledTimes(2);
    expect(most).toBe(1);
  });

  it("goes on merging after a merge that failed", async () => {
    await setup({ queue: [next, { ...next, title: "Docs" }], members: [member("isis", "Isis", { report: done }), member("horus", "Horus", { task: "Docs0", report: done })] });
    vi.mocked(missionMerge).mockRejectedValueOnce(new Error("boom"));
    await pumpQueue("chef");
    expect(missionNow().members.map((m) => m.task)).toEqual(["Login", "API"]);
  });

  describe("while it waits for the end of a turn", () => {
    const waitingTurn = async (mission: Partial<Mission>, meanwhile: () => void) => {
      vi.useFakeTimers();
      try {
        await setup(mission);
        agentActivityStore.setState({ activities: { isis: { activity: "working" } } as never });
        const handed = afterReport("chef", "isis");
        await vi.advanceTimersByTimeAsync(1000);
        meanwhile();
        agentActivityStore.setState({ activities: {} });
        await vi.advanceTimersByTimeAsync(1100);
        await handed;
      } finally {
        vi.useRealTimers();
      }
    };

    it("merges nothing once the mission is finished", async () => {
      await waitingTurn({}, () => nodesStore.getState().update("chef", { mission: { ...missionNow(), state: "terminee" } }));
      expect(missionMerge).not.toHaveBeenCalled();
      expect(lines()).toEqual([]);
    });

    it("does not move on an agent that reports « blocked » after all", async () => {
      await waitingTurn({}, () => nodesStore.getState().update("chef", { mission: { ...missionNow(), members: [member("isis", "Isis", { report: { ...stuck, at: 700_000 } })] } }));
      expect(missionMerge).not.toHaveBeenCalled();
      expect(missionNow().members[0].task).toBe("Login");
    });

    it("revives no terminal stopped meanwhile", async () => {
      await waitingTurn({}, () => terminalStatusStore.getState().set("isis", { state: "stopped" }));
      expect(missionMerge).not.toHaveBeenCalled();
      expect(relaunchTerminal).not.toHaveBeenCalled();
    });

    it("gives nothing once the night is winding down", async () => {
      await waitingTurn({ overnight: true, budgetMin: 100, startedAt: Date.now() - 89 * 60_000 }, () => {
        nodesStore.getState().update("chef", { mission: { ...missionNow(), startedAt: Date.now() - 95 * 60_000 } });
      });
      expect(relaunchTerminal).not.toHaveBeenCalled();
    });
  });

  it("does not mark the new task merged when a merge ends after the agent moved on", async () => {
    await setup({});
    let release!: (report: { merge: { kind: "merged" }; uncommitted: boolean }) => void;
    vi.mocked(missionMerge).mockReturnValueOnce(new Promise((resolve) => (release = resolve)));
    const merging = mergeMember("chef", "C:/w/auth", missionNow().members[0]);
    const moved = { ...missionNow().members[0], task: "API", report: undefined };
    nodesStore.getState().update("chef", { mission: { ...missionNow(), members: [moved] } });
    release({ merge: { kind: "merged" }, uncommitted: false });
    await merging;
    expect(missionNow().members[0].merged).toBeUndefined();
  });

  it("does not say the queue is stuck while an agent is still on its way to a task", async () => {
    vi.useFakeTimers();
    try {
      await setup({ members: [member("isis", "Isis", { report: done }), member("horus", "Horus", { task: "Docs0", report: stuck })] });
      agentActivityStore.setState({ activities: { isis: { activity: "working" } } as never });
      const handed = afterReport("chef", "isis");
      await afterReport("chef", "horus");
      expect(lines()).toEqual([]);
      agentActivityStore.setState({ activities: {} });
      await vi.advanceTimersByTimeAsync(1100);
      await handed;
    } finally {
      vi.useRealTimers();
    }
  });

  it("tells once that the queue is stuck, and says nothing after the mission's end", async () => {
    await setup({ startedAt: 1, members: [member("isis", "Isis", { report: stuck })] });
    await afterReport("chef", "isis");
    await afterReport("chef", "isis");
    expect(lines()).toHaveLength(1);
    vi.mocked(notify).mockClear();
    await nodesStore.getState().create("chef", { workspaceId: "w1", kind: "orchestrator", payload: { name: "Chef", session, mission: { ...missionNow(), startedAt: 2, state: "terminee" } } });
    await afterReport("chef", "isis");
    expect(lines()).toEqual([]);
  });

  it("says why next_task gave nothing", async () => {
    await setup({ members: [member("isis", "Isis", { report: stuck })] });
    terminalStatusStore.getState().set("isis", { state: "stopped" });
    expect(await giveNext("chef", missionNow().members[0])).toEqual({ refused: "Isis est arrêté." });
    terminalStatusStore.getState().set("isis", { state: "running" });
    nodesStore.getState().update("chef", { mission: { ...missionNow(), overnight: true, budgetMin: 100, startedAt: Date.now() - 95 * 60_000 } });
    expect(await giveNext("chef", missionNow().members[0])).toEqual({ refused: "La fin de nuit approche : la file ne donne plus de tâche." });
    nodesStore.getState().update("chef", { mission: { ...missionNow(), overnight: undefined, members: [member("isis", "Isis", { report: done })] } });
    vi.mocked(missionMerge).mockResolvedValueOnce({ merge: { kind: "conflict", files: ["a.ts"] }, uncommitted: false });
    expect(await giveNext("chef", missionNow().members[0])).toEqual({ refused: "Isis ne prend rien pour l'instant : sa branche n'est pas fusionnée." });
  });
});

describe("a task taken from the queue keeps every tool working (spec mission de nuit §4.4)", () => {
  it("can be reassigned like a sub-task of the plan", async () => {
    await setup({ members: [member("isis", "Isis", { report: done }), member("horus", "Horus", { task: "Docs", report: done, merged: true })], plan: [{ title: "Login", brief: "b", agent: "Isis", budgetMin: 20 }, { title: "Docs", brief: "b", agent: "Horus", budgetMin: 20 }], queue: [next] });
    await afterReport("chef", "isis");
    expect(missionNow().members[0].task).toBe("API");
    expect(await reassignTask("chef", "isis", "Horus")).toEqual({ name: "Horus" });
    expect(missionNow().members.find((m) => m.name === "Horus")?.task).toBe("API");
  });
});

describe("what the orchestrator hears when nobody is left working", () => {
  it("is told once all have reported and the queue is empty", async () => {
    await setup({ queue: [] });
    await afterReport("chef", "isis");
    expect(lines()).toEqual(["La file est vide et tous ont rendu compte : fusionne, fais vérifier, puis termine."]);
  });

  it("is told when tasks wait that no free agent can take", async () => {
    await setup({ members: [member("isis", "Isis", { report: { ...done, status: "echec" } })] });
    await afterReport("chef", "isis");
    expect(lines()).toEqual(["1 tâche attend et aucun agent libre ne peut la prendre : next_task, reassign, ou termine."]);
  });

  it("says nothing while someone still works", async () => {
    await setup({ queue: [], members: [member("isis", "Isis", { report: done }), member("horus", "Horus", { task: "Docs" })] });
    await afterReport("chef", "isis");
    expect(lines()).toEqual([]);
  });
});

it("does not launch a queued task without a level with the router on: it would run on the default model", async () => {
  await setup({ state: "plan", router: true, plan: [{ title: "Login", brief: "b", agent: "Isis", budgetMin: 20, level: "faible" }], queue: [next], members: [] });
  await launchMission("chef");
  expect(missionNow()).toMatchObject({ state: "plan", error: expect.stringContaining("niveau") });
});

it("keeps the task an agent finished when reassign gives it another one", async () => {
  await setup({ members: [member("isis", "Isis", { task: "API" }), member("horus", "Horus", { task: "Login", report: done, merged: true })], plan: [{ title: "Login", brief: "b", agent: "Horus", budgetMin: 20 }, { title: "API", brief: "b", agent: "Isis", budgetMin: 30 }], queue: [] });
  await reassignTask("chef", "isis", "Horus");
  expect(missionNow().members.find((m) => m.name === "Horus")?.past).toEqual([{ task: "Login", status: "termine", summary: "Login fait", merged: true, spentMin: 10, budgetMin: 20, branch: "openvibe/auth-horus" }]);
});

it("carries what an agent left to check into what it went through", async () => {
  await setup({ members: [member("isis", "Isis", { report: { ...done, check: "Le bouton" } })] });
  await afterReport("chef", "isis");
  expect(missionNow().members[0].past?.[0].check).toBe("Le bouton");
});

it("keeps the mission's permissions through a new conversation, and launches with them", async () => {
  await setup({ permission: "work" });
  await afterReport("chef", "isis");
  expect(relaunchTerminal).toHaveBeenCalledWith("isis", expect.objectContaining({ permission: "work" }), "new");
  expect(buildSpawnSpec(terminalOf(nodesStore.getState().nodes.isis)!, "new").claude?.permission).toBe("work");
});

it("speaks English when the interface does", async () => {
  langStore.setState({ lang: "en" });
  await setup({});
  await afterReport("chef", "isis");
  await vi.waitFor(() => expect(ptySendText).toHaveBeenCalled());
  expect(lines()).toEqual(['Isis takes "API". Still waiting: 0.']);
  expect(vi.mocked(ptySendText).mock.calls[0][1]).toBe(
    "[OpenVibe · mission Auth] API — Fais l'API. Budget: 30 min. Branch: openvibe/auth-isis. New task, new conversation, same worktree: start by merging openvibe/auth into your branch. Declare your steps, delegate to your sub-agents, commit on your branch, then report with report.",
  );
});

describe("the global budget (review)", () => {
  it("starts no new task once it is spent: nobody asked for more usage", async () => {
    await setup({ budgetMin: 30 });
    const clock = vi.spyOn(Date, "now").mockReturnValue(31 * 60_000);
    await afterReport("chef", "isis");
    clock.mockRestore();
    expect(relaunchTerminal).not.toHaveBeenCalled();
    expect(ptySendText).not.toHaveBeenCalled();
    expect(missionNow().queue).toHaveLength(1);
  });

  it("still moves on while some of it is left", async () => {
    await setup({ budgetMin: 30 });
    const clock = vi.spyOn(Date, "now").mockReturnValue(29 * 60_000);
    await afterReport("chef", "isis");
    clock.mockRestore();
    expect(relaunchTerminal).toHaveBeenCalled();
    expect(missionNow().queue).toEqual([]);
  });

  it("does not let next_task spend past it either", async () => {
    await setup({ budgetMin: 30 });
    const clock = vi.spyOn(Date, "now").mockReturnValue(31 * 60_000);
    const result = await giveNext("chef", missionNow().members[0]);
    clock.mockRestore();
    expect(result).toHaveProperty("refused");
    expect(relaunchTerminal).not.toHaveBeenCalled();
  });
});
