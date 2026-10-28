import { messages } from "@/i18n";
import { agentMessages } from "@/mcp/messages";
import { readLevel, type Level } from "./router";

/** The mission of an orchestrator (spec orchestrateur §7), saved in its payload. */
export type MissionState = "redaction" | "plan" | "lancement" | "en_cours" | "terminee";
export type ReportStatus = "termine" | "bloque" | "echec";

/** A sub-task of the plan; `agent` is a linked agent's name, or `nouveau`. */
export interface SubTask {
  title: string;
  brief: string;
  agent: string;
  budgetMin: number;
  /** Its difficulty: with the router, its agent's model (spec maj §3). */
  level?: Level;
  /** The Kanban card it handles (`board`): it follows the sub-task on its board. */
  card?: string;
}

export interface Report {
  summary: string;
  status: ReportStatus;
  at: number;
}

/** An agent of the formed team, in its worktree. */
export interface Member {
  nodeId: string;
  name: string;
  /** The title of its sub-task. */
  task: string;
  budgetMin: number;
  /** Linked before the mission (back to the project at its end), else created for it (closed). */
  linked: boolean;
  branch: string;
  worktree: string;
  /** When its sub-task was typed: its events are watched from then on. */
  sentAt?: number;
  report?: Report;
  merged?: boolean;
  /** Minutes added by `prolonger` (spec §8.2). */
  extraMin?: number;
  /** The overruns already told: 1 at 100 % of its budget, 2 at 200 % (spec §8.2). */
  overdue?: 1 | 2;
  /** Its sub-task went to this agent (`reattribuer`): its clock stops. */
  handedTo?: string;
  /** Sub-tasks it finished before taking another one (`reattribuer`). */
  done?: string[];
  /** The model the router started it on (spec maj §3). */
  model?: string;
}

export interface Mission {
  state: MissionState;
  /** Settings of the panel (spec §7.1). */
  budgetMin?: number;
  maxAgents: number;
  name?: string;
  task?: string;
  plan?: SubTask[];
  /** Set by « Lancer la mission ». */
  project?: string;
  slug?: string;
  branch?: string;
  worktree?: string;
  /** The group of the agents created for it. */
  frameId?: string;
  members: Member[];
  summary?: string;
  error?: string;
  /** The go-ahead: the global budget runs from then (spec §8.1). */
  startedAt?: number;
  /** « terminer »: the members' times stop there (spec première version §5.3). */
  endedAt?: number;
  /** The end of the global budget was told (spec §8.2). */
  globalOverdue?: boolean;
  /** Each agent gets the model of its sub-task's level (spec maj §3). */
  router?: boolean;
}

export const NEW_AGENT = "nouveau";
export const DEFAULT_MAX_AGENTS = 4;
export const MAX_AGENTS = 8;
export const NEW_MISSION: Mission = { state: "redaction", maxAgents: DEFAULT_MAX_AGENTS, members: [] };

const STATES: readonly string[] = ["redaction", "plan", "lancement", "en_cours", "terminee"];
const STATUSES: readonly string[] = ["termine", "bloque", "echec"];
const MAX_TITLE = 60;

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const fold = (name: string) => name.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLocaleLowerCase("fr");

/** The orchestrator names agents as it reads them: case and accents aside. */
export const sameName = (a: string, b: string) => fold(a) === fold(b);

/** Text typed in a terminal ends at its first line break: briefs and messages go on one line. */
export const oneLine = (value: string) => value.replace(/\s*[\r\n]+\s*/g, " ").trim();

function readMember(raw: unknown): Member | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.nodeId !== "string" || typeof r.name !== "string" || typeof r.branch !== "string" || typeof r.worktree !== "string") return null;
  const member: Member = {
    nodeId: r.nodeId,
    name: r.name,
    task: text(r.task),
    budgetMin: typeof r.budgetMin === "number" ? r.budgetMin : 0,
    linked: r.linked === true,
    branch: r.branch,
    worktree: r.worktree,
  };
  if (typeof r.sentAt === "number") member.sentAt = r.sentAt;
  if (r.merged === true) member.merged = true;
  const report = r.report as Record<string, unknown> | undefined;
  if (report && typeof report.summary === "string" && typeof report.status === "string" && STATUSES.includes(report.status)) {
    member.report = { summary: report.summary, status: report.status as ReportStatus, at: typeof report.at === "number" ? report.at : 0 };
  }
  if (typeof r.extraMin === "number") member.extraMin = r.extraMin;
  if (r.overdue === 1 || r.overdue === 2) member.overdue = r.overdue;
  if (typeof r.handedTo === "string") member.handedTo = r.handedTo;
  if (Array.isArray(r.done)) member.done = r.done.filter((title): title is string => typeof title === "string");
  if (typeof r.model === "string" && r.model) member.model = r.model;
  return member;
}

function isSubTask(raw: unknown): raw is SubTask {
  const r = raw as Record<string, unknown>;
  return typeof raw === "object" && raw !== null && typeof r.title === "string" && typeof r.brief === "string" && typeof r.agent === "string" && typeof r.budgetMin === "number";
}

function readSubTask(task: SubTask): SubTask {
  const { title, brief, agent, budgetMin } = task;
  const read: SubTask = { title, brief, agent, budgetMin };
  const level = readLevel(task.level);
  if (level) read.level = level;
  if (typeof task.card === "string" && task.card) read.card = task.card;
  return read;
}

/** A saved mission; undefined when absent or unreadable. A launch cut short by a restart is back to its plan. */
export function readMission(raw: unknown): Mission | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.state !== "string" || !STATES.includes(r.state)) return undefined;
  const mission: Mission = {
    state: r.state === "lancement" ? "plan" : (r.state as MissionState),
    maxAgents: typeof r.maxAgents === "number" ? r.maxAgents : DEFAULT_MAX_AGENTS,
    members: Array.isArray(r.members) ? r.members.map(readMember).filter((m): m is Member => m !== null) : [],
  };
  if (typeof r.budgetMin === "number") mission.budgetMin = r.budgetMin;
  for (const key of ["name", "task", "project", "slug", "branch", "worktree", "frameId", "summary", "error"] as const) {
    if (typeof r[key] === "string") mission[key] = r[key];
  }
  if (Array.isArray(r.plan)) mission.plan = r.plan.filter(isSubTask).map(readSubTask);
  if (typeof r.startedAt === "number") mission.startedAt = r.startedAt;
  if (typeof r.endedAt === "number") mission.endedAt = r.endedAt;
  if (r.globalOverdue === true) mission.globalOverdue = true;
  if (r.router === true) mission.router = true;
  return mission;
}

/**
 * `propose_plan`'s arguments (internal names, `@/mcp/protocol`) as a plan, or what is wrong (spec §7.2).
 * `linked`: names of the linked Claude agents; `cards`: ids of the cards of its linked boards.
 */
export function proposedPlan(
  args: Record<string, unknown>,
  mission: Mission,
  linked: readonly string[],
  cards: readonly string[] = [],
): { name: string; task: string; plan: SubTask[] } | string {
  const e = messages(agentMessages).plan;
  const name = text(args.nom);
  if (!name || name.length > MAX_TITLE) return e.name(MAX_TITLE);
  const task = text(args.tache);
  if (!task) return e.task;
  const raw = args.sous_taches;
  if (!Array.isArray(raw) || raw.length === 0) return e.atLeastOne;
  if (raw.length > mission.maxAgents) return e.tooMany(mission.maxAgents);
  const plan: SubTask[] = [];
  for (const [i, item] of raw.entries()) {
    const r = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>;
    const n = i + 1;
    const title = text(r.titre);
    const brief = text(r.consigne);
    const agent = text(r.agent);
    const budget = r.budget_min;
    if (!title || title.length > MAX_TITLE) return e.title(n, MAX_TITLE);
    if (!brief) return e.brief(n);
    if (typeof budget !== "number" || !Number.isInteger(budget) || budget < 1) return e.budget(n);
    const known = sameName(agent, NEW_AGENT) ? NEW_AGENT : linked.find((l) => sameName(l, agent));
    if (!known) return e.notLinked(n, agent);
    if (known !== NEW_AGENT && plan.some((s) => s.agent === known)) return e.alreadyHas(known);
    const given = r.niveau !== undefined && r.niveau !== null;
    const level = readLevel(r.niveau);
    if (given && !level) return e.level(n);
    if (mission.router && !level) return e.levelRouter(n);
    const card = r.card === undefined || r.card === null ? "" : text(r.card);
    if (r.card !== undefined && r.card !== null && !cards.includes(card)) return e.card(n, String(r.card));
    const task: SubTask = { title, brief, agent: known, budgetMin: budget };
    if (level) task.level = level;
    if (card) task.card = card;
    plan.push(task);
  }
  const total = plan.reduce((sum, s) => sum + s.budgetMin, 0);
  if (mission.budgetMin !== undefined && total > mission.budgetMin) {
    return e.overBudget(total, mission.budgetMin);
  }
  return { name, task, plan };
}

const MINUTE = 60_000;

/** A member's budget with its extensions. */
export const budgetOf = (member: Member) => member.budgetMin + (member.extraMin ?? 0);

/** Minutes a member has spent: from its sub-task's sending to its report, in real time (spec §8.1). */
export function spentMin(member: Member, now: number): number {
  if (member.sentAt === undefined) return 0;
  return Math.max(0, ((member.report?.at ?? now) - member.sentAt) / MINUTE);
}

/**
 * A member's time as shown: it stops at its report, else at the mission's end
 * (spec première version §5.3). Unknown for a mission ended before end times
 * were kept: its members without a report would count on forever.
 */
export function memberTime(mission: Mission, member: Member, now: number): number | undefined {
  if (member.report || mission.state !== "terminee") return spentMin(member, now);
  return mission.endedAt === undefined ? undefined : spentMin(member, mission.endedAt);
}

export interface Overrun {
  nodeId: string;
  name: string;
  task: string;
  level: 1 | 2;
  budget: number;
}

/**
 * What the clock has to tell (spec §8.2): the members past 100 % or 200 % of
 * their budget without a report, each step once, and the end of the global budget.
 */
export function overruns(mission: Mission, now: number): { members: Overrun[]; global: boolean } {
  if (mission.state !== "en_cours") return { members: [], global: false };
  const members = mission.members.flatMap((m): Overrun[] => {
    if (m.sentAt === undefined || m.report || m.handedTo) return [];
    const ratio = spentMin(m, now) / budgetOf(m);
    const level = ratio >= 2 ? 2 : ratio >= 1 ? 1 : 0;
    return level > (m.overdue ?? 0) ? [{ nodeId: m.nodeId, name: m.name, task: m.task, level: level as 1 | 2, budget: budgetOf(m) }] : [];
  });
  const global =
    mission.budgetMin !== undefined && mission.startedAt !== undefined && !mission.globalOverdue && (now - mission.startedAt) / MINUTE >= mission.budgetMin;
  return { members, global };
}

/** What `prolonger` may still take from the global budget; undefined without one. */
export function remainingGlobal(mission: Mission): number | undefined {
  if (mission.budgetMin === undefined) return undefined;
  // A member who reported only took what it spent (final review H3).
  const taken = (m: Member) => (m.report ? Math.min(budgetOf(m), Math.ceil(spentMin(m, m.report.at))) : budgetOf(m));
  return mission.budgetMin - mission.members.filter((m) => !m.handedTo).reduce((sum, m) => sum + taken(m), 0);
}

export type BudgetTone = "ok" | "late" | "over";

/** A budget's bar (spec §8.3): green, orange past 80 %, red past 100 %. */
export function budgetBar(spent: number, budget: number): { ratio: number; tone: BudgetTone } {
  const ratio = budget > 0 ? spent / budget : 0;
  return { ratio: Math.min(1, ratio), tone: ratio > 1 ? "over" : ratio > 0.8 ? "late" : "ok" };
}

/** The orchestrator's header during a mission (spec §8.3): time spent, over the global budget if any. */
export function clockText(mission: Mission, now: number): string | null {
  if (mission.state !== "en_cours" || mission.startedAt === undefined) return null;
  const spent = Math.floor((now - mission.startedAt) / MINUTE);
  return mission.budgetMin === undefined ? `${spent} min` : `${spent} / ${mission.budgetMin} min`;
}
