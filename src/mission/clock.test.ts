// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mockIPC } from "@tauri-apps/api/mocks";
import { toast } from "sonner";
import { langStore } from "@/i18n";
import { nodesStore } from "@/store/nodes";
import { checkBudgets } from "./clock";
import { notify } from "./events";
import { terminalStatusStore } from "@/store/terminalStatus";
import { missionOf, setMission, setOrchestratorClosed, updateMember } from "./store";

vi.mock("@excalidraw/excalidraw", () => ({}));
vi.mock("sonner", () => ({ toast: { warning: vi.fn() } }));
vi.mock("./events", () => ({ notify: vi.fn((_orchestrator: string, _line: string, typed?: () => void) => typed?.()) }));

const min = 60_000;
beforeAll(async () => {
  mockIPC(() => undefined);
  terminalStatusStore.getState().set("isis", { state: "running" });
  await nodesStore.getState().create("chef", {
    workspaceId: "w1",
    kind: "orchestrator",
    payload: {
      name: "Chef",
      mission: {
        state: "en_cours",
        name: "Auth",
        maxAgents: 4,
        budgetMin: 30,
        startedAt: 0,
        members: [{ nodeId: "isis", name: "Isis", task: "Login", budgetMin: 10, linked: false, branch: "b", worktree: "w", sentAt: 0 }],
      },
    },
  });
});

it("tells the orchestrator once when a budget runs out, warns the user at 200 % and at the end of the global budget (spec §8.2)", () => {
  checkBudgets(5 * min);
  expect(notify).not.toHaveBeenCalled();
  checkBudgets(11 * min);
  checkBudgets(12 * min);
  expect(vi.mocked(notify).mock.calls.map(([to, line]) => [to, line])).toEqual([
    ["chef", "Budget écoulé : Isis (Login) a passé ses 10 min sans rendre compte. Décide : write, extend, interrupt ou reassign."],
  ]);
  expect(missionOf(nodesStore.getState().nodes.chef)?.members[0].overdue).toBe(1);
  checkBudgets(21 * min);
  checkBudgets(22 * min);
  expect(toast.warning).toHaveBeenCalledTimes(1);
  expect(toast.warning).toHaveBeenCalledWith("Isis a dépassé deux fois son budget (10 min) sans rendre compte.");
  checkBudgets(31 * min);
  checkBudgets(40 * min);
  expect(vi.mocked(notify).mock.calls.map(([to, line]) => [to, line])[1]).toEqual(["chef", "Budget global écoulé (30 min) : termine avec ce qui est fait."]);
  expect(notify).toHaveBeenCalledTimes(2);
  expect(toast.warning).toHaveBeenLastCalledWith("Budget global de la mission Auth écoulé (30 min).");
  expect(missionOf(nodesStore.getState().nodes.chef)?.globalOverdue).toBe(true);
});

describe("an overnight mission (spec mission de nuit §3)", () => {
  const fresh = { nodeId: "isis", name: "Isis", task: "Login", budgetMin: 10, linked: false, branch: "b", worktree: "w", sentAt: 0 };
  const night = () => setMission("chef", { overnight: true, budgetMin: 100, startedAt: 0, members: [fresh], globalOverdue: undefined, windDownTold: undefined });

  beforeEach(() => {
    vi.clearAllMocks();
    terminalStatusStore.getState().set("isis", { state: "running" });
  });
  afterEach(() => setMission("chef", { overnight: undefined, windDownTold: undefined, globalOverdue: undefined, budgetMin: 30 }));

  it("treats an agent's budget as a target: a line that says so, and no toast for an empty room", () => {
    night();
    checkBudgets(11 * min);
    expect(vi.mocked(notify).mock.calls[0][1]).toBe("Cible dépassée : Isis (Login) a passé ses 10 min, ce n'est qu'une cible. Regarde où il en est avec read_output ; laisse-le finir s'il avance.");
    checkBudgets(21 * min);
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("tells the orchestrator once to wind down, and leaves the end of the budget without a toast", () => {
    night();
    updateMember("chef", "isis", { overdue: 2 });
    checkBudgets(89 * min);
    expect(notify).not.toHaveBeenCalled();
    checkBudgets(90 * min);
    checkBudgets(91 * min);
    expect(vi.mocked(notify).mock.calls.map(([, line]) => line)).toEqual(["Plus que 10 min : la file ne donne plus de tâche. Fusionne ce qui est fait, fais vérifier, puis termine."]);
    expect(missionOf(nodesStore.getState().nodes.chef)?.windDownTold).toBe(true);
    checkBudgets(100 * min);
    expect(notify).toHaveBeenCalledTimes(2);
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("does not wind down a night whose budget was already told as over: the app was closed through it", () => {
    night();
    setMission("chef", { globalOverdue: true });
    updateMember("chef", "isis", { overdue: 2 });
    checkBudgets(120 * min);
    expect(notify).not.toHaveBeenCalled();
  });

  it("says it in English", () => {
    langStore.setState({ lang: "en" });
    try {
      night();
      checkBudgets(11 * min);
      expect(vi.mocked(notify).mock.calls[0][1]).toBe("Target passed: Isis (Login) went past its 10 min, which is only a target. See where it stands with read_output; let it finish if it is moving.");
      updateMember("chef", "isis", { overdue: 2 });
      checkBudgets(90 * min);
      expect(vi.mocked(notify).mock.calls[1][1]).toBe("10 min left: the queue gives out no more tasks. Merge what is done, have it checked, then finish.");
    } finally {
      langStore.setState({ lang: "fr" });
    }
  });
});

it("says nothing about the mission of a closed orchestrator (spec première version §5.4)", () => {
  const fresh = { nodeId: "isis", name: "Isis", task: "Login", budgetMin: 10, linked: false, branch: "b", worktree: "w", sentAt: 0 };
  setMission("chef", { members: [fresh], globalOverdue: undefined });
  vi.mocked(notify).mockClear();
  vi.mocked(toast.warning).mockClear();
  setOrchestratorClosed("chef", true);
  checkBudgets(100 * min);
  expect(notify).not.toHaveBeenCalled();
  expect(toast.warning).not.toHaveBeenCalled();
  setOrchestratorClosed("chef", false);
  checkBudgets(100 * min);
  expect(notify).toHaveBeenCalled();
});

it("tells the orchestrator and the user in English when the interface is (spec première version §7.1)", () => {
  const fresh = { nodeId: "isis", name: "Isis", task: "Login", budgetMin: 10, linked: false, branch: "b", worktree: "w", sentAt: 0 };
  setMission("chef", { members: [fresh], globalOverdue: undefined });
  vi.mocked(notify).mockClear();
  vi.mocked(toast.warning).mockClear();
  langStore.setState({ lang: "en" });
  try {
    checkBudgets(100 * min);
    expect(vi.mocked(notify).mock.calls.map(([to, line]) => [to, line])).toEqual([
      ["chef", "Budget used up: Isis (Login) went past its 10 min without reporting. Decide: write, extend, interrupt or reassign."],
      ["chef", "Overall budget used up (30 min): finish with what is done."],
    ]);
    expect(vi.mocked(toast.warning).mock.calls).toEqual([
      ["Isis has gone over twice its budget (10 min) without reporting."],
      ["Mission Auth: overall budget used up (30 min)."],
    ]);
  } finally {
    langStore.setState({ lang: "fr" });
  }
});

it("says nothing for a stopped agent, and records an overrun as told only once its line is typed (backlog H3)", () => {
  const fresh = { nodeId: "isis", name: "Isis", task: "Login", budgetMin: 10, linked: false, branch: "b", worktree: "w", sentAt: 0 };
  setMission("chef", { state: "en_cours", members: [fresh], globalOverdue: undefined, budgetMin: undefined });
  vi.mocked(notify).mockClear();
  vi.mocked(toast.warning).mockClear();
  terminalStatusStore.getState().set("isis", { state: "stopped" });
  checkBudgets(60 * min);
  expect(notify).not.toHaveBeenCalled();
  expect(toast.warning).not.toHaveBeenCalled();
  terminalStatusStore.getState().set("isis", { state: "running" });
  // The orchestrator is busy: the line waits, and the overrun is not recorded as told.
  vi.mocked(notify).mockImplementationOnce(() => undefined);
  checkBudgets(60 * min);
  expect(missionOf(nodesStore.getState().nodes.chef)?.members[0].overdue).toBeUndefined();
  checkBudgets(60 * min);
  expect(notify).toHaveBeenCalledTimes(1);
});

it("tells a budget once even while the orchestrator cannot hear, and records the worst (review)", async () => {
  vi.mocked(notify).mockReset();
  vi.mocked(toast.warning).mockClear();
  const pending: (() => void)[] = [];
  vi.mocked(notify).mockImplementation((_orchestrator: string, _line: string, typed?: () => void) => void (typed && pending.push(typed)));
  await nodesStore.getState().create("chef2", {
    workspaceId: "w1",
    kind: "orchestrator",
    payload: {
      name: "Chef",
      mission: {
        state: "en_cours",
        name: "Auth",
        maxAgents: 4,
        members: [{ nodeId: "isis", name: "Isis", task: "Login", budgetMin: 10, linked: false, branch: "b", worktree: "w", sentAt: 0 }],
      },
    },
  });
  const lines = () => vi.mocked(notify).mock.calls.filter(([to]) => to === "chef2").length;
  checkBudgets(11 * min);
  expect(lines()).toBe(1);
  checkBudgets(21 * min);
  expect(lines()).toBe(1);
  expect(toast.warning).toHaveBeenCalledTimes(1);
  for (const typed of pending) typed();
  checkBudgets(22 * min);
  expect(lines()).toBe(1);
  expect(toast.warning).toHaveBeenCalledTimes(1);
  expect(missionOf(nodesStore.getState().nodes.chef2)?.members[0].overdue).toBe(2);
});
