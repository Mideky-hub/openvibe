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

export type NodePayload = TerminalPayload | OrchestratorPayload | FilePayload;

/** Reads a stored file payload; null without a usable path. */
export function readFilePayload(raw: unknown): FilePayload | null {
  if (typeof raw !== "object" || raw === null) return null;
  const path = (raw as Record<string, unknown>).path;
  return typeof path === "string" && path.trim() ? { path } : null;
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

/** The name an agent node shows; empty for a node that has none (a file). */
export function nodeNameOf(payload: NodePayload | undefined): string {
  return payload && "name" in payload ? payload.name : "";
}
