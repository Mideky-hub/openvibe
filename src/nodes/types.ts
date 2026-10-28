import type { IssueState } from "@/ipc/github";
import { AGENT_IDS, type AgentId, type OllamaLaunch, type ShellKind } from "@/ipc/pty";
import { readMission, type Mission } from "@/mission/mission";
import { readSteps, type Step } from "./steps";

/** Content of a terminal node (spec habillage §15.2). */
export interface TerminalPayload {
  /** Full title: tooltip of the header, and the session name given to Claude. */
  title: string;
  /** Mythological first name shown in the header ("" until one is given). */
  name: string;
  agent: AgentId;
  cwd: string;
  shell: ShellKind;
  /** Used by the "custom" agent only. */
  command: string;
  /** The Claude Code conversation of this node, for `--session-id` / `--resume`. */
  claudeSessionId?: string;
  ollama?: OllamaLaunch;
  /** The steps its agent declared (spec orchestrateur §5). */
  steps?: Step[];
  /** An orchestrator's session (spec orchestrateur §4.2); absent for an agent. */
  role?: "orchestrator";
  /** Claude starts with Remote Control (spec maj §2). */
  remoteControl?: boolean;
  /** Claude's model, chosen by a mission's router (spec maj §3). */
  model?: string;
}

/** Content of an orchestrator node (spec habillage §13, spec orchestrateur §6). */
export interface OrchestratorPayload {
  name: string;
  /** Its Claude session, created when it is first shown. */
  session?: TerminalPayload;
  /** Its mission (spec orchestrateur §7). */
  mission?: Mission;
}

export const ORCHESTRATOR_NAME = "Orchestrateur";

/** Content of a file node (issue #49): a file of the project, shown read-only. */
export interface FilePayload {
  /** Relative to the project's folder. */
  path: string;
}

export type NodePayload = TerminalPayload | OrchestratorPayload | KanbanPayload | FilePayload;

/** Reads a stored file payload; null without a usable path. */
export function readFilePayload(raw: unknown): FilePayload | null {
  if (typeof raw !== "object" || raw === null) return null;
  const path = (raw as Record<string, unknown>).path;
  return typeof path === "string" && path.trim() ? { path } : null;
}
export type KanbanPriority = "none" | "low" | "medium" | "high";

export const KANBAN_PRIORITIES: readonly KanbanPriority[] = ["none", "low", "medium", "high"];

/** The GitHub issue a card mirrors; written by the GitHub sync. */
export interface KanbanGithubLink {
  repo: string;
  number: number;
  url: string;
  state: IssueState;
}

export interface KanbanCard {
  id: string;
  title: string;
  notes: string;
  /** ISO date (YYYY-MM-DD). */
  due?: string;
  priority: KanbanPriority;
  github?: KanbanGithubLink;
  /** The mission agent working on it: shown as a chip. */
  agent?: string;
}

export interface KanbanColumn {
  id: string;
  title: string;
  cardIds: string[];
}

/** The GitHub repository a board syncs with, and optionally one of its owner's Projects (v2). */
export interface KanbanBoardLink {
  /** "owner/name". */
  repo: string;
  project?: { owner: string; number: number };
}

/** Content of a Kanban node (issue #29). */
export interface KanbanPayload {
  columns: KanbanColumn[];
  cards: Record<string, KanbanCard>;
  /** Set by « Lier à GitHub ». */
  github?: KanbanBoardLink;
  /** Set by « Planifier avec l'orchestrateur »: the orchestrator node planning one of its columns. */
  orchestrator?: KanbanOrchestratorLink;
}

/** A board's column handed to an orchestrator node. */
export interface KanbanOrchestratorLink {
  nodeId: string;
  columnId: string;
}



/** Reads a stored orchestrator payload; a missing or blank name becomes "Orchestrateur". */
export function readOrchestratorPayload(raw: unknown): OrchestratorPayload {
  const r = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const payload: OrchestratorPayload = { name: typeof r.name === "string" && r.name.trim() ? r.name : ORCHESTRATOR_NAME };
  const session = readTerminalPayload(r.session);
  if (session?.agent === "claude") payload.session = { ...session, role: "orchestrator" };
  const mission = readMission(r.mission);
  if (mission) payload.mission = mission;
  return payload;
}

const SHELLS = new Set<string>(["default", "powershell", "pwsh", "cmd", "gitbash"]);

/**
 * Reads a stored terminal payload, including those saved before agents and names
 * existed (`preset` instead of `agent`, no `name`). Null when it cannot be launched.
 */
export function readTerminalPayload(raw: unknown): TerminalPayload | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const agent = typeof r.agent === "string" ? r.agent : r.preset;
  if (typeof agent !== "string" || !(AGENT_IDS as readonly string[]).includes(agent) || typeof r.cwd !== "string") {
    return null;
  }
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  const payload: TerminalPayload = {
    title: text(r.title),
    name: text(r.name),
    agent: agent as AgentId,
    cwd: r.cwd,
    shell: (typeof r.shell === "string" && SHELLS.has(r.shell) ? r.shell : "default") as ShellKind,
    command: text(r.command),
  };
  if (typeof r.claudeSessionId === "string") payload.claudeSessionId = r.claudeSessionId;
  const ollama = r.ollama as Record<string, unknown> | undefined;
  if (ollama && typeof ollama.model === "string" && (ollama.mode === "chat" || ollama.mode === "code")) {
    payload.ollama = { model: ollama.model, mode: ollama.mode };
  }
  const steps = readSteps(r.steps);
  if (steps) payload.steps = steps;
  if (r.role === "orchestrator") payload.role = "orchestrator";
  if (r.remoteControl === true) payload.remoteControl = true;
  if (typeof r.model === "string" && r.model) payload.model = r.model;
  return payload;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function readGithubLink(raw: unknown): KanbanGithubLink | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.repo !== "string" || typeof r.number !== "number" || !Number.isInteger(r.number) || typeof r.url !== "string") return undefined;
  if (r.state !== "open" && r.state !== "closed") return undefined;
  return { repo: r.repo, number: r.number, url: r.url, state: r.state };
}

function readKanbanCard(id: string, raw: unknown): KanbanCard | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const card: KanbanCard = {
    id,
    title: typeof r.title === "string" ? r.title : "",
    notes: typeof r.notes === "string" ? r.notes : "",
    priority: (KANBAN_PRIORITIES as readonly unknown[]).includes(r.priority) ? (r.priority as KanbanPriority) : "none",
  };
  if (typeof r.due === "string" && ISO_DATE.test(r.due)) card.due = r.due;
  const github = readGithubLink(r.github);
  if (github) card.github = github;
  if (typeof r.agent === "string" && r.agent.trim()) card.agent = r.agent;
  return card;
}

/**
 * Reads a stored Kanban payload. Never fails: unreadable cards and columns are
 * dropped, a card listed twice keeps its first place, and a card no column
 * lists is dropped with it.
 */
export function readKanbanPayload(raw: unknown): KanbanPayload {
  const r = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const rawCards = typeof r.cards === "object" && r.cards !== null ? (r.cards as Record<string, unknown>) : {};
  const cards: Record<string, KanbanCard> = {};
  const columns: KanbanColumn[] = [];
  const placed = new Set<string>();
  const columnIds = new Set<string>();
  for (const column of Array.isArray(r.columns) ? r.columns : []) {
    if (typeof column !== "object" || column === null) continue;
    const c = column as Record<string, unknown>;
    if (typeof c.id !== "string" || !c.id || columnIds.has(c.id)) continue;
    columnIds.add(c.id);
    const cardIds: string[] = [];
    for (const cardId of Array.isArray(c.cardIds) ? c.cardIds : []) {
      if (typeof cardId !== "string" || placed.has(cardId)) continue;
      const card = readKanbanCard(cardId, rawCards[cardId]);
      if (!card) continue;
      placed.add(cardId);
      cards[cardId] = card;
      cardIds.push(cardId);
    }
    columns.push({ id: c.id, title: typeof c.title === "string" ? c.title : "", cardIds });
  }
  const payload: KanbanPayload = { columns, cards };
  const github = readBoardLink(r.github);
  if (github) payload.github = github;
  const orchestrator = r.orchestrator as Record<string, unknown> | undefined;
  if (orchestrator && typeof orchestrator.nodeId === "string" && orchestrator.nodeId && typeof orchestrator.columnId === "string") {
    payload.orchestrator = { nodeId: orchestrator.nodeId, columnId: orchestrator.columnId };
  }
  return payload;
}

const REPO = /^[\w.-]+\/[\w.-]+$/;

function readBoardLink(raw: unknown): KanbanBoardLink | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.repo !== "string" || !REPO.test(r.repo)) return undefined;
  const link: KanbanBoardLink = { repo: r.repo };
  const project = r.project as Record<string, unknown> | undefined;
  if (project && typeof project.owner === "string" && project.owner && typeof project.number === "number" && Number.isInteger(project.number) && project.number > 0) {
    link.project = { owner: project.owner, number: project.number };
  }
  return link;
}
