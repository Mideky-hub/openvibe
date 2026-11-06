import { describe, expect, it } from "vitest";
import { langStore } from "@/i18n";
import { budgetBar, budgetOf, clockText, memberTime, NEW_MISSION, noNewWork, oneLine, overruns, proposedPlan, proposedTasks, readMission, remainingGlobal, sameName, spentMin, windingDown, type Member, type Mission } from "./mission";

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
    // Real time: two agents in parallel share it, one sub-task alone must fit (spec mission de nuit §3).
    expect(proposedPlan(args({ ...task("nouveau", 30), titre: "A" }, { ...task("nouveau", 30), titre: "B" }), budgeted, [])).toMatchObject({ name: "Auth" });
    expect(proposedPlan(args(task("nouveau", 31)), budgeted, [])).toBe("Sous-tâche 1 : 31 min ne tiennent pas dans le budget global (30 min de temps réel).");
    expect(proposedPlan(args(task("nouveau"), task("nouveau"), task("nouveau")), budgeted, [])).toContain("2 sous-tâches");
    expect(proposedPlan(args(task("nouveau", 0)), NEW_MISSION, [])).toContain("budget");
    expect(proposedPlan({ tache: "x", sous_taches: [task("nouveau")] }, NEW_MISSION, [])).toContain("nom");
    expect(proposedPlan(args(), NEW_MISSION, [])).toContain("au moins une");
  });

  it("keeps the Kanban card of a sub-task, when its boards have it", () => {
    const result = proposedPlan(args({ ...task("nouveau"), card: "c1" }), NEW_MISSION, [], [], ["c1"]);
    expect(typeof result !== "string" && result.plan[0].card).toBe("c1");
    expect(proposedPlan(args({ ...task("nouveau"), card: "zz" }), NEW_MISSION, [], [], ["c1"])).toContain("zz");
    // Kept through a save; an unreadable card is dropped.
    const plan = [{ title: "Login", brief: "b", agent: "nouveau", budgetMin: 5, card: "c1" }, { title: "API", brief: "b", agent: "nouveau", budgetMin: 5, card: 3 }];
    expect(readMission({ ...NEW_MISSION, plan })!.plan!.map((s) => s.card)).toEqual(["c1", undefined]);
  });
});

describe("a new agent's group (spec groupes spécialisés §3)", () => {
  const groups = [{ id: "f1", name: "Interface" }];

  it("puts it in a linked group, named as the orchestrator reads it", () => {
    const result = proposedPlan(args({ ...task("nouveau"), groupe: "interface" }), NEW_MISSION, [], groups);
    expect(typeof result === "string" ? result : result.plan[0].group).toEqual({ id: "f1", name: "Interface" });
  });

  it("keeps the mission's group without one", () => {
    const result = proposedPlan(args(task("nouveau")), NEW_MISSION, [], groups);
    expect(typeof result === "string" ? result : Object.keys(result.plan[0])).not.toContain("group");
  });

  it("refuses an unknown group, and a group for a named agent", () => {
    expect(proposedPlan(args({ ...task("nouveau"), groupe: "Zeus" }), NEW_MISSION, [], groups)).toBe("Sous-tâche 1 : « Zeus » n'est pas un groupe relié.");
    expect(proposedPlan(args({ ...task("Athéna"), groupe: "Interface" }), NEW_MISSION, ["Athéna"], groups)).toBe("Sous-tâche 1 : group ne s'emploie qu'avec agent « new ».");
  });

  it("refuses them in English too", () => {
    langStore.setState({ lang: "en" });
    try {
      expect(proposedPlan(args({ ...task("nouveau"), groupe: "Zeus" }), NEW_MISSION, [], groups)).toBe('Sub-task 1: "Zeus" is not a linked group.');
      expect(proposedPlan(args({ ...task("Athéna"), groupe: "Interface" }), NEW_MISSION, ["Athéna"], groups)).toBe('Sub-task 1: group only goes with agent "new".');
    } finally {
      langStore.setState({ lang: "fr" });
    }
  });

  it("is saved with the plan and on the member", () => {
    const saved = readMission({
      state: "en_cours",
      plan: [{ title: "A", brief: "B", agent: "nouveau", budgetMin: 1, group: { id: "f1", name: "Interface" } }, { title: "C", brief: "D", agent: "nouveau", budgetMin: 1, group: { id: 3 } }],
      members: [{ nodeId: "n", name: "Isis", task: "A", budgetMin: 1, linked: false, branch: "b", worktree: "w", group: "f1" }],
    });
    expect(saved?.plan?.map((s) => s.group)).toEqual([{ id: "f1", name: "Interface" }, undefined]);
    expect(saved?.members[0].group).toBe("f1");
  });
});

describe("tasks for the queue (spec mission de nuit §4.2)", () => {
  const item = (titre: string, extra: object = {}) => ({ titre, consigne: "Fais-le", budget_min: 20, ...extra });
  const added = (...tasks: unknown[]) => ({ tasks });

  it("reads them in order, with their level and group", () => {
    const groups = [{ id: "g1", name: "Interface" }];
    expect(proposedTasks(added(item("A"), item("B", { niveau: "eleve", groupe: "interface" })), NEW_MISSION, groups)).toEqual([
      { title: "A", brief: "Fais-le", budgetMin: 20 },
      { title: "B", brief: "Fais-le", budgetMin: 20, level: "eleve", group: { id: "g1", name: "Interface" } },
    ]);
  });

  it("keeps the Kanban card of a task, one of its linked boards only", () => {
    expect(proposedTasks(added(item("A", { card: "c1" })), NEW_MISSION, [], ["c1"])).toEqual([{ title: "A", brief: "Fais-le", budgetMin: 20, card: "c1" }]);
    expect(proposedTasks(added(item("A", { card: "zz" })), NEW_MISSION, [], ["c1"])).toContain("« zz »");
  });

  it("checks them like a plan", () => {
    expect(proposedTasks(added(), NEW_MISSION, [])).toBe("Donne au moins une sous-tâche.");
    expect(proposedTasks(added(item("")), NEW_MISSION, [])).toContain("titre court");
    expect(proposedTasks(added(item("A", { consigne: "" })), NEW_MISSION, [])).toContain("brief");
    expect(proposedTasks(added(item("A", { budget_min: 0 })), NEW_MISSION, [])).toContain("budget");
    expect(proposedTasks(added(item("A", { budget_min: 31 })), { ...NEW_MISSION, budgetMin: 30 }, [])).toContain("budget global");
    expect(proposedTasks(added(item("A", { niveau: "énorme" })), NEW_MISSION, [])).toContain("niveau");
    expect(proposedTasks(added(item("A")), { ...NEW_MISSION, router: true }, [])).toContain("routeur");
    expect(proposedTasks(added(item("A", { groupe: "Zeus" })), NEW_MISSION, [])).toContain("Zeus");
  });

  it("keeps titles unique: reassign and team name a task by its title", () => {
    const mission = { ...NEW_MISSION, plan: [{ title: "Login", brief: "b", agent: "Isis", budgetMin: 5 }], queue: [{ title: "API", brief: "b", budgetMin: 5 }], members: [] };
    expect(proposedTasks(added(item("login")), mission, [])).toBe("Sous-tâche 1 : le titre « login » est déjà pris ; un titre par tâche.");
    expect(proposedTasks(added(item("api")), mission, [])).toContain("déjà pris");
    expect(proposedTasks(added(item("Docs"), item("docs")), mission, [])).toContain("Sous-tâche 2");
    expect(proposedPlan(args(task("nouveau")), { ...mission, plan: undefined, queue: [{ title: "Login", brief: "b", budgetMin: 5 }] }, [])).toContain("déjà pris");
  });

  it("holds 100 tasks at most", () => {
    const queue = Array.from({ length: 99 }, (_, i) => ({ title: `T${i}`, brief: "b", budgetMin: 5 }));
    expect(proposedTasks(added(item("A")), { ...NEW_MISSION, queue }, [])).toHaveLength(1);
    expect(proposedTasks(added(item("A"), item("B")), { ...NEW_MISSION, queue }, [])).toBe("La file tient 100 tâches au plus.");
  });

  it("says what is wrong in English", () => {
    langStore.setState({ lang: "en" });
    try {
      const mission = { ...NEW_MISSION, queue: [{ title: "API", brief: "b", budgetMin: 5 }] };
      expect(proposedTasks(added(item("api")), mission, [])).toBe('Sub-task 1: the title "api" is taken; one title per task.');
      expect(proposedTasks({ tasks: Array.from({ length: 101 }, (_, i) => item(`T${i}`)) }, NEW_MISSION, [])).toBe("The queue holds 100 tasks at most.");
    } finally {
      langStore.setState({ lang: "fr" });
    }
  });

  it("is saved with the mission, what an agent finished too", () => {
    const past = { task: "Login", status: "termine", summary: "ok", merged: true, spentMin: 3, budgetMin: 5, branch: "b" };
    const saved = readMission({
      state: "en_cours",
      queue: [{ title: "A", brief: "B", budgetMin: 1, level: "faible", group: { id: "g", name: "G" } }, { title: 3 }],
      members: [{ nodeId: "n", name: "Isis", task: "A", budgetMin: 1, linked: false, branch: "b", worktree: "w", past: [past, { task: "x" }] }],
    });
    expect(saved?.queue).toEqual([{ title: "A", brief: "B", budgetMin: 1, level: "faible", group: { id: "g", name: "G" } }]);
    expect(saved?.members[0].past).toEqual([past]);
    expect(readMission({ state: "plan" })).not.toHaveProperty("queue");
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

  it("counts the global budget in real time from the go-ahead, whatever the number of agents (spec mission de nuit §3)", () => {
    const team = [member(), member({ nodeId: "n2", extraMin: 5 }), member({ nodeId: "n3", handedTo: "Isis" })];
    expect(remainingGlobal(running(team, { budgetMin: 30, startedAt: 0 }), 12 * min)).toBe(18);
    expect(remainingGlobal(running(team), 12 * min)).toBeUndefined();
    expect(remainingGlobal(running(team, { budgetMin: 30 }), 12 * min)).toBe(30);
    expect(remainingGlobal(running(team, { budgetMin: 30, startedAt: 0 }), 40 * min)).toBe(0);
    expect(remainingGlobal(running(team, { state: "terminee", budgetMin: 30, startedAt: 0, endedAt: 10 * min }), 25 * min)).toBe(20);
  });

  it("plans and measures the global budget the same way: real time, agents in parallel share it (issue #67)", () => {
    const four = ["A", "B", "C", "D"].map((titre) => ({ ...task("nouveau", 30), titre }));
    const planned = proposedPlan(args(...four), { ...NEW_MISSION, budgetMin: 30, maxAgents: 4 }, []);
    expect(planned).toMatchObject({ name: "Auth" });
    const team = typeof planned === "string" ? [] : planned.plan.map((s, i) => member({ nodeId: `n${i}`, budgetMin: s.budgetMin }));
    const mission = running(team, { budgetMin: 30, startedAt: 0 });
    for (const now of [29.9 * min, 30 * min, 31 * min]) {
      const spent = overruns(mission, now).global;
      expect(spent).toBe(remainingGlobal(mission, now) === 0);
      expect(spent).toBe(noNewWork(mission, now));
      // Four agents of 30 min each fit: none is over its own budget before the global one ends.
      expect(overruns(mission, now).members.length > 0).toBe(spent);
    }
    expect(clockText(mission, 30 * min)).toBe("30 / 30 min");
  });

  it("winds an overnight mission down near its end, at 10 % or 10 min, and half of a short one", () => {
    const night = (budgetMin: number) => running([member()], { overnight: true, budgetMin, startedAt: 0 });
    expect(windingDown(night(480), 431 * min)).toBe(false);
    expect(windingDown(night(480), 432 * min)).toBe(true);
    expect(windingDown(night(60), 49 * min)).toBe(false);
    expect(windingDown(night(60), 50 * min)).toBe(true);
    expect(windingDown(night(15), 7 * min)).toBe(false);
    expect(windingDown(night(15), 8 * min)).toBe(true);
    expect(windingDown(running([member()], { budgetMin: 60, startedAt: 0 }), 59 * min)).toBe(false);
  });

  it("keeps the overnight marks of a saved mission", () => {
    expect(readMission({ state: "en_cours", overnight: true, windDownTold: true, autoLaunch: true, tickets: { kind: "github", label: "nuit" } })).toMatchObject({ overnight: true, windDownTold: true, autoLaunch: true, tickets: { kind: "github", label: "nuit" } });
    expect(readMission({ state: "plan", tickets: { kind: "backlog" } })?.tickets).toEqual({ kind: "backlog" });
    expect(readMission({ state: "plan", tickets: { kind: "kanban" } })).not.toHaveProperty("tickets");
    expect(readMission({ state: "en_cours" })).not.toHaveProperty("overnight");
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
