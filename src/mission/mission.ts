import { messages } from "@/i18n";
import type { Permission } from "@/ipc/pty";
import { agentMessages } from "@/mcp/messages";
import { readLevel, type Level } from "./router";
import type { TicketSource } from "./tickets";

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
  /** The linked group a new agent joins, else it goes in the mission's (spec groupes spécialisés §4). */
  group?: PlanGroup;
  /** The Kanban card it handles (`board`): it follows the sub-task on its board. */
  card?: string;
}

/** A task waiting for a free agent (spec mission de nuit §4.1). */
export type QueuedTask = Omit<SubTask, "agent">;

/** A task an agent is through with, for the morning report. */
export interface PastTask {
  task: string;
  status: ReportStatus;
  summary: string;
  merged: boolean;
  spentMin: number;
  budgetMin: number;
  branch: string;
  check?: string;
}

/** A group by its id, which survives a renaming, and the name to show. */
export interface PlanGroup {
  id: string;
  name: string;
}

export interface Report {
  summary: string;
  status: ReportStatus;
  at: number;
  /** What the agent leaves to check by hand (spec mission de nuit §6.2). */
  check?: string;
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
  /** The existing group it joined; it closes alone at the end (spec groupes spécialisés §4). */
  group?: string;
  /** The tasks it went through before this one. */
  past?: PastTask[];
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
  /** Tasks beyond the team, in order; a free agent takes the next one (spec mission de nuit §4). */
  queue?: QueuedTask[];
  /** Launched for the user's absence: the global budget is the time away, agents' budgets are targets (spec mission de nuit §3). */
  overnight?: boolean;
  /** The end of the night was told. */
  windDownTold?: boolean;
  /** Where an overnight mission takes its tasks. */
  tickets?: TicketSource;
  /** What its agents may do unasked; none outside a night (spec mission de nuit §5.3). */
  permission?: Permission;
  /** What `finish` leaves to check by hand. */
  handChecks?: string[];
  /** The dialog was the go-ahead: the plan starts as soon as it is proposed (spec mission de nuit §5.1). */
  autoLaunch?: boolean;
}

export const NEW_AGENT = "nouveau";
export const DEFAULT_MAX_AGENTS = 4;
export const MAX_AGENTS = 8;
export const MAX_QUEUE = 100;
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

function readTicketSource(raw: unknown): TicketSource | undefined {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  if (r.kind === "backlog") return { kind: "backlog" };
  return r.kind === "github" && typeof r.label === "string" ? { kind: "github", label: r.label } : undefined;
}

function readPast(raw: unknown): PastTask | null {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  if (typeof r.task !== "string" || typeof r.status !== "string" || !STATUSES.includes(r.status)) return null;
  return {
    task: r.task,
    status: r.status as ReportStatus,
    summary: typeof r.summary === "string" ? r.summary : "",
    merged: r.merged === true,
    spentMin: typeof r.spentMin === "number" ? r.spentMin : 0,
    budgetMin: typeof r.budgetMin === "number" ? r.budgetMin : 0,
    branch: typeof r.branch === "string" ? r.branch : "",
    ...(typeof r.check === "string" ? { check: r.check } : {}),
  };
}

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
    member.report = { summary: report.summary, status: report.status as ReportStatus, at: typeof report.at === "number" ? report.at : 0, ...(typeof report.check === "string" ? { check: report.check } : {}) };
  }
  if (typeof r.extraMin === "number") member.extraMin = r.extraMin;
  if (r.overdue === 1 || r.overdue === 2) member.overdue = r.overdue;
  if (typeof r.handedTo === "string") member.handedTo = r.handedTo;
  if (Array.isArray(r.done)) member.done = r.done.filter((title): title is string => typeof title === "string");
  if (typeof r.model === "string" && r.model) member.model = r.model;
  if (typeof r.group === "string") member.group = r.group;
  if (Array.isArray(r.past)) member.past = r.past.map(readPast).filter((p): p is PastTask => p !== null);
  return member;
}

function isQueued(raw: unknown): raw is QueuedTask {
  const r = raw as Record<string, unknown>;
  return typeof raw === "object" && raw !== null && typeof r.title === "string" && typeof r.brief === "string" && typeof r.budgetMin === "number";
}

const isSubTask = (raw: unknown): raw is SubTask => isQueued(raw) && typeof (raw as unknown as Record<string, unknown>).agent === "string";

function readSubTask(task: SubTask): SubTask {
  return { ...readQueued(task), agent: task.agent };
}

function readQueued(task: QueuedTask): QueuedTask {
  const { title, brief, budgetMin } = task;
  const level = readLevel(task.level);
  const group = task.group as Partial<PlanGroup> | undefined;
  return {
    title,
    brief,
    budgetMin,
    ...(level ? { level } : {}),
    ...(typeof group?.id === "string" && typeof group.name === "string" ? { group: { id: group.id, name: group.name } } : {}),
    ...(typeof task.card === "string" && task.card ? { card: task.card } : {}),
  };
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
  if (Array.isArray(r.queue)) mission.queue = r.queue.filter(isQueued).map(readQueued);
  if (typeof r.startedAt === "number") mission.startedAt = r.startedAt;
  if (typeof r.endedAt === "number") mission.endedAt = r.endedAt;
  if (r.globalOverdue === true) mission.globalOverdue = true;
  if (r.router === true) mission.router = true;
  if (r.overnight === true) mission.overnight = true;
  if (r.windDownTold === true) mission.windDownTold = true;
  const tickets = readTicketSource(r.tickets);
  if (tickets) mission.tickets = tickets;
  if (r.autoLaunch === true) mission.autoLaunch = true;
  if (Array.isArray(r.handChecks)) mission.handChecks = r.handChecks.filter((line): line is string => typeof line === "string");
  if (r.permission === "ask" || r.permission === "edits" || r.permission === "work") mission.permission = r.permission;
  return mission;
}

/** What a sub-task of the plan and a queued task share, read from internal names, or what is wrong. */
function readTaskFields(r: Record<string, unknown>, n: number, mission: Mission): Omit<QueuedTask, "group"> | string {
  const e = messages(agentMessages).plan;
  const title = text(r.titre);
  const brief = text(r.consigne);
  const budget = r.budget_min;
  if (!title || title.length > MAX_TITLE) return e.title(n, MAX_TITLE);
  if (!brief) return e.brief(n);
  if (typeof budget !== "number" || !Number.isInteger(budget) || budget < 1) return e.budget(n);
  // The global budget is real time: agents in parallel share it, only one sub-task alone could not fit (spec mission de nuit §3).
  if (mission.budgetMin !== undefined && budget > mission.budgetMin) return e.overBudget(n, budget, mission.budgetMin);
  const given = r.niveau !== undefined && r.niveau !== null;
  const level = readLevel(r.niveau);
  if (given && !level) return e.level(n);
  if (mission.router && !level) return e.levelRouter(n);
  return { title, brief, budgetMin: budget, ...(level ? { level } : {}) };
}

/** The titles the mission's tasks already use: `reassign` and `team` name a task by its title. */
const takenTitles = (mission: Mission, withPlan: boolean) => [
  ...(withPlan ? (mission.plan ?? []).map((s) => s.title) : []),
  ...(mission.queue ?? []).map((s) => s.title),
  ...mission.members.flatMap((m) => [m.task, ...(m.done ?? [])]),
];

/** The card a task names, "" for none; null when it is not one of `cards`. */
function namedCard(r: Record<string, unknown>, cards: readonly string[]): string | null {
  if (r.card === undefined || r.card === null) return "";
  const card = text(r.card);
  return cards.includes(card) ? card : null;
}

/** `add_tasks`' arguments as tasks for the queue, or what is wrong (spec mission de nuit §4.2). `cards`: ids of the cards of its linked boards. */
export function proposedTasks(args: Record<string, unknown>, mission: Mission, groups: readonly PlanGroup[], cards: readonly string[] = []): QueuedTask[] | string {
  const e = messages(agentMessages).plan;
  const raw = args.tasks;
  if (!Array.isArray(raw) || raw.length === 0) return e.atLeastOne;
  if ((mission.queue?.length ?? 0) + raw.length > MAX_QUEUE) return e.queueFull(MAX_QUEUE);
  const taken = takenTitles(mission, true);
  const tasks: QueuedTask[] = [];
  for (const [i, item] of raw.entries()) {
    const r = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>;
    const fields = readTaskFields(r, i + 1, mission);
    if (typeof fields === "string") return fields;
    if (taken.some((title) => sameName(title, fields.title))) return e.titleTaken(i + 1, fields.title);
    const wanted = text(r.groupe);
    const group = wanted ? groups.find((g) => sameName(g.name, wanted)) : undefined;
    if (wanted && !group) return e.notLinkedGroup(i + 1, wanted);
    const card = namedCard(r, cards);
    if (card === null) return e.card(i + 1, String(r.card));
    taken.push(fields.title);
    tasks.push({ ...fields, ...(group ? { group: { id: group.id, name: group.name } } : {}), ...(card ? { card } : {}) });
  }
  return tasks;
}

/**
 * `propose_plan`'s arguments (internal names, `@/mcp/protocol`) as a plan, or what is wrong (spec §7.2).
 * `linked`: names of the linked Claude agents; `groups`: the linked groups; `cards`: ids of the cards of its linked boards.
 */
export function proposedPlan(
  args: Record<string, unknown>,
  mission: Mission,
  linked: readonly string[],
  groups: readonly PlanGroup[] = [],
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
  // A plan replaces the pending one: only the queue's titles stand against it.
  const taken = takenTitles(mission, false);
  for (const [i, item] of raw.entries()) {
    const r = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>;
    const n = i + 1;
    const fields = readTaskFields(r, n, mission);
    if (typeof fields === "string") return fields;
    const agent = text(r.agent);
    const known = sameName(agent, NEW_AGENT) ? NEW_AGENT : linked.find((l) => sameName(l, agent));
    if (!known) return e.notLinked(n, agent);
    if (known !== NEW_AGENT && plan.some((s) => s.agent === known)) return e.alreadyHas(known);
    if ([...taken, ...plan.map((s) => s.title)].some((title) => sameName(title, fields.title))) return e.titleTaken(n, fields.title);
    const wanted = text(r.groupe);
    if (wanted && known !== NEW_AGENT) return e.groupForNew(n);
    const group = wanted ? groups.find((g) => sameName(g.name, wanted)) : undefined;
    if (wanted && !group) return e.notLinkedGroup(n, wanted);
    const card = namedCard(r, cards);
    if (card === null) return e.card(n, String(r.card));
    plan.push({ ...fields, agent: known, ...(group ? { group: { id: group.id, name: group.name } } : {}), ...(card ? { card } : {}) });
  }
  return { name, task, plan };
}

const MINUTE = 60_000;

/** What is kept of a task when its agent takes another (spec mission de nuit §6.2). */
export function pastTask(member: Member, report: Report): PastTask {
  return {
    task: member.task,
    status: report.status,
    summary: report.summary,
    merged: member.merged === true,
    spentMin: spentMin(member, report.at),
    budgetMin: member.budgetMin,
    branch: member.branch,
    ...(report.check ? { check: report.check } : {}),
  };
}

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
  const global = mission.startedAt !== undefined && !mission.globalOverdue && remainingGlobal(mission, now) === 0;
  return { members, global };
}

/**
 * The one measure of the global budget: real time from the go-ahead to the end, closed app included,
 * whatever the number of agents; the plan checks it the same way (spec mission de nuit §3).
 */
function elapsedMin(mission: Mission, now: number): number {
  return mission.startedAt === undefined ? 0 : ((mission.endedAt ?? now) - mission.startedAt) / MINUTE;
}

/** The whole minutes left of the global budget (spec mission de nuit §3); undefined without one, all of it before the go-ahead. */
export function remainingGlobal(mission: Mission, now: number): number | undefined {
  if (mission.budgetMin === undefined) return undefined;
  return Math.max(0, Math.ceil(mission.budgetMin - elapsedMin(mission, now)));
}

/** The last minutes of an overnight mission keep the time to merge and finish: 10 %, 10 min at least, half of a short one. */
const windDownMin = (budget: number) => Math.min(budget / 2, Math.max(10, budget / 10));

/** An overnight mission near its end: no new work, the orchestrator wraps up (spec mission de nuit §3). */
export function windingDown(mission: Mission, now: number): boolean {
  if (!mission.overnight || mission.budgetMin === undefined || mission.startedAt === undefined) return false;
  return elapsedMin(mission, now) >= mission.budgetMin - windDownMin(mission.budgetMin);
}

/** No new work starts: the mission is winding down, or the global budget is spent, overnight or not. */
export function noNewWork(mission: Mission, now: number): boolean {
  return windingDown(mission, now) || (mission.startedAt !== undefined && remainingGlobal(mission, now) === 0);
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
  const spent = Math.floor(elapsedMin(mission, now));
  return mission.budgetMin === undefined ? `${spent} min` : `${spent} / ${mission.budgetMin} min`;
}
