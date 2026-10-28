import { describe, expect, it } from "vitest";
import { langStore } from "@/i18n";
import { budgetBar, budgetOf, clockText, memberTime, NEW_MISSION, oneLine, overruns, proposedPlan, readMission, remainingGlobal, sameName, spentMin, type Member, type Mission } from "./mission";

const task = (agent: string, budget = 20) => ({ titre: "Login", consigne: "Fais le login", agent, budget_min: budget });
const args = (...sous_taches: object[]) => ({ nom: "Auth", tache: "Ajoute l'authentification", sous_taches });

describe("proposedPlan (spec orchestrateur §7.2)", () => {
  it("takes a plan of linked agents, named case and accents aside, and new ones", () => {
    const result = proposedPlan(args(task("athena"), { ...task("nouveau", 30), titre: "API" }), NEW_MISSION, ["Athéna", "Apollon"]);
    expect(result).toEqual({
      name: "Auth",
      task: "Ajoute l'authentification",
      plan: [
        { title: "Login", brief: "Fais le login", agent: "Athéna", budgetMin: 20 },
        { title: "API", brief: "Fais le login", agent: "nouveau", budgetMin: 30 },
      ],
    });
  });

  it("refuses what the team cannot do, with a reason the orchestrator can read", () => {
    const budgeted: Mission = { ...NEW_MISSION, budgetMin: 30, maxAgents: 2 };
    expect(proposedPlan(args(task("Zeus")), NEW_MISSION, ["Athéna"])).toContain("Zeus");
    expect(proposedPlan(args(task("Athéna"), task("Athéna")), NEW_MISSION, ["Athéna"])).toContain("une sous-tâche par agent");
    expect(proposedPlan(args(task("nouveau", 20), task("nouveau", 20)), budgeted, [])).toContain("budget global");
    expect(proposedPlan(args(task("nouveau"), task("nouveau"), task("nouveau")), budgeted, [])).toContain("2 sous-tâches");
    expect(proposedPlan(args(task("nouveau", 0)), NEW_MISSION, [])).toContain("budget");
    expect(proposedPlan({ tache: "x", sous_taches: [task("nouveau")] }, NEW_MISSION, [])).toContain("nom");
    expect(proposedPlan(args(), NEW_MISSION, [])).toContain("au moins une");
  });

  it("keeps the Kanban card of a sub-task, when its boards have it", () => {
    const result = proposedPlan(args({ ...task("nouveau"), card: "c1" }), NEW_MISSION, [], ["c1"]);
    expect(typeof result !== "string" && result.plan[0].card).toBe("c1");
    expect(proposedPlan(args({ ...task("nouveau"), card: "zz" }), NEW_MISSION, [], ["c1"])).toContain("zz");
    // Kept through a save; an unreadable card is dropped.
    const plan = [{ title: "Login", brief: "b", agent: "nouveau", budgetMin: 5, card: "c1" }, { title: "API", brief: "b", agent: "nouveau", budgetMin: 5, card: 3 }];
    expect(readMission({ ...NEW_MISSION, plan })!.plan!.map((s) => s.card)).toEqual(["c1", undefined]);
  });
});

describe("a refused plan in English (spec première version §7.1)", () => {
  it("explains what is wrong in the interface's language", () => {
    langStore.setState({ lang: "en" });
    try {
      expect(proposedPlan(args(task("Zeus")), NEW_MISSION, ["Athéna"])).toBe('Sub-task 1: "Zeus" is not a linked Claude agent (a first name, or "new").');
      expect(proposedPlan(args(task("nouveau", 0)), NEW_MISSION, [])).toBe("Sub-task 1: a budget in minutes (a whole number, 1 at least).");
      expect(proposedPlan(args(task("nouveau")), { ...NEW_MISSION, router: true }, [])).toBe("Sub-task 1: a level (low, medium, high or extreme) — the router chooses the agent's model with it.");
    } finally {
      langStore.setState({ lang: "fr" });
    }
  });
});

describe("each sub-task's level (spec maj §3)", () => {
  it("reads it as written; the router needs one per sub-task", () => {
    const leveled = proposedPlan(args({ ...task("nouveau"), niveau: "Élevé" }), NEW_MISSION, []);
    expect(typeof leveled === "object" && leveled.plan[0].level).toBe("eleve");
    const plain = proposedPlan(args(task("nouveau")), NEW_MISSION, []);
    expect(typeof plain === "object" && plain.plan[0]).toEqual({ title: "Login", brief: "Fais le login", agent: "nouveau", budgetMin: 20 });
    expect(proposedPlan(args(task("nouveau")), { ...NEW_MISSION, router: true }, [])).toContain("niveau");
    expect(proposedPlan(args({ ...task("nouveau"), niveau: "énorme" }), NEW_MISSION, [])).toContain("niveau");
  });

  it("reads the router, the levels and the members' models back", () => {
    const saved = {
      state: "en_cours",
      maxAgents: 4,
      router: true,
      plan: [{ title: "Login", brief: "b", agent: "nouveau", budgetMin: 5, level: "faible" }],
      members: [{ nodeId: "n1", name: "Isis", task: "Login", budgetMin: 5, linked: false, branch: "b", worktree: "w", model: "claude-haiku-5-5" }],
    };
    expect(readMission(saved)).toEqual(saved);
    expect(readMission({ ...saved, router: "oui", plan: [{ ...saved.plan[0], level: "x" }] })).toMatchObject({ plan: [{ title: "Login" }] });
    expect(readMission({ ...saved, router: "oui" })?.router).toBeUndefined();
    expect(readMission({ ...saved, plan: [{ ...saved.plan[0], level: "x" }] })?.plan?.[0].level).toBeUndefined();
  });
});

describe("readMission", () => {
  it("reads a saved mission back; a launch cut short by a restart is back to its plan", () => {
    const saved = { state: "lancement", maxAgents: 3, name: "Auth", plan: [{ title: "Login", brief: "b", agent: "nouveau", budgetMin: 5 }], members: [] };
    expect(readMission(saved)).toEqual({ ...saved, state: "plan" });
    const member = { nodeId: "n1", name: "Isis", task: "Login", budgetMin: 5, linked: false, branch: "openvibe/auth-isis", worktree: "C:/w", sentAt: 4, report: { summary: "ok", status: "termine", at: 9 } };
    expect(readMission({ state: "en_cours", maxAgents: 4, members: [member, { nodeId: 3 }] })?.members).toEqual([member]);
  });

  it("drops what is not a mission", () => {
    expect(readMission({ state: "partie" })).toBeUndefined();
    expect(readMission("x")).toBeUndefined();
  });
});

it("compares names case and accents aside, and keeps typed text on one line", () => {
  expect(sameName(" HÉRA", "hera")).toBe(true);
  expect(sameName("Héra", "Hermès")).toBe(false);
  expect(oneLine("Fais ceci\r\n\n  puis cela ")).toBe("Fais ceci puis cela");
});

describe("the time of a mission (spec orchestrateur §8)", () => {
  const min = 60_000;
  const member = (extra: Partial<Member> = {}): Member => ({ nodeId: "n1", name: "Isis", task: "Login", budgetMin: 10, linked: false, branch: "b", worktree: "w", sentAt: 0, ...extra });
  const running = (members: Member[], extra: Partial<Mission> = {}): Mission => ({ ...NEW_MISSION, state: "en_cours", name: "Auth", members, ...extra });

  it("counts a member's time from its sub-task to its report, its budget with its extensions", () => {
    expect(spentMin(member(), 6 * min)).toBe(6);
    expect(spentMin(member({ report: { summary: "ok", status: "termine", at: 4 * min } }), 9 * min)).toBe(4);
    expect(spentMin(member({ sentAt: undefined }), 9 * min)).toBe(0);
    expect(budgetOf(member({ extraMin: 5 }))).toBe(15);
  });

  it("stops a member's time when the mission ends (spec première version §5.3)", () => {
    const ended = running([member()], { state: "terminee", endedAt: 30 * min });
    expect(memberTime(ended, member(), 1440 * min)).toBe(30);
    expect(memberTime(running([member()]), member(), 9 * min)).toBe(9);
    const before = running([member()], { state: "terminee" });
    expect(memberTime(before, member(), 1440 * min)).toBeUndefined();
    expect(memberTime(before, member({ report: { summary: "ok", status: "termine", at: 6 * min } }), 1440 * min)).toBe(6);
    expect(readMission({ ...ended })?.endedAt).toBe(30 * min);
  });

  it("finds each overrun once per step, 100 % then 200 %, and the end of the global budget", () => {
    const report = { summary: "ok", status: "termine" as const, at: min };
    const mission = running(
      [member(), member({ nodeId: "n2", name: "Horus", overdue: 1 }), member({ nodeId: "n3", name: "Seth", report }), member({ nodeId: "n4", name: "Thot", handedTo: "Horus" })],
      { budgetMin: 30, startedAt: 0 },
    );
    expect(overruns(mission, 11 * min)).toEqual({ members: [{ nodeId: "n1", name: "Isis", task: "Login", level: 1, budget: 10 }], global: false });
    expect(overruns(mission, 21 * min).members.map((o) => [o.nodeId, o.level])).toEqual([["n1", 2], ["n2", 2]]);
    expect(overruns(mission, 31 * min).global).toBe(true);
    expect(overruns({ ...mission, globalOverdue: true }, 31 * min).global).toBe(false);
    expect(overruns({ ...mission, state: "terminee" }, 31 * min)).toEqual({ members: [], global: false });
  });

  it("knows what is left of the global budget, without the handed-over sub-tasks", () => {
    expect(remainingGlobal(running([member(), member({ nodeId: "n2", extraMin: 5 }), member({ nodeId: "n3", handedTo: "Isis" })], { budgetMin: 30 }))).toBe(5);
    expect(remainingGlobal(running([member()]))).toBeUndefined();
    // A member who reported only took what it spent (final review H3).
    const early = member({ report: { summary: "ok", status: "termine", at: 5 * min } });
    expect(remainingGlobal(running([early, member({ nodeId: "n2" }), member({ nodeId: "n3" })], { budgetMin: 60 }))).toBe(35);
  });

  it("colours a budget's bar: green, orange past 80 %, red past 100 %", () => {
    expect(budgetBar(4, 10)).toEqual({ ratio: 0.4, tone: "ok" });
    expect(budgetBar(9, 10)).toEqual({ ratio: 0.9, tone: "late" });
    expect(budgetBar(25, 10)).toEqual({ ratio: 1, tone: "over" });
  });

  it("writes the mission's time for the orchestrator's header", () => {
    expect(clockText(running([], { startedAt: 0, budgetMin: 60 }), 12.4 * min)).toBe("12 / 60 min");
    expect(clockText(running([], { startedAt: 0 }), 3 * min)).toBe("3 min");
    expect(clockText({ ...NEW_MISSION }, 3 * min)).toBeNull();
  });

  it("reads the time fields back", () => {
    const saved = { state: "en_cours", maxAgents: 4, startedAt: 5, globalOverdue: true, members: [{ ...member(), extraMin: 5, overdue: 2, handedTo: "Horus", done: ["API"] }] };
    expect(readMission(saved)).toEqual(saved);
  });
});
