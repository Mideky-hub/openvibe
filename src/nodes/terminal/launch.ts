import type { AgentId, OllamaLaunch, ShellKind, SpawnSpec } from "@/ipc/pty";
import { AGENTS } from "@/fleet/catalog";
import type { TerminalPayload } from "@/nodes/types";
import { messages } from "@/i18n";
import { nodesMessages } from "@/nodes/messages";

/** How "Relancer" starts a Claude terminal (spec V1 §5.3); other agents ignore it. */
export type LaunchMode = "new" | "resume" | "continue";

export const SHELL_LABELS: Record<ShellKind, string> = {
  // Read when used, so they follow the language.
  get default() {
    return messages(nodesMessages).shells.default;
  },
  powershell: "PowerShell",
  pwsh: "PowerShell 7",
  get cmd() {
    return messages(nodesMessages).shells.cmd;
  },
  gitbash: "Git Bash",
};

/** "Claude · openvibe": the agent and the last folder of the working directory. */
export function defaultTitle(agent: AgentId, cwd: string): string {
  const folder = cwd.split(/[\\/]/).filter(Boolean).pop();
  return folder ? `${AGENTS[agent].label} · ${folder}` : AGENTS[agent].label;
}

export interface LaunchInput {
  title: string;
  cwd: string;
  agent: AgentId;
  command: string;
  shell: ShellKind;
  ollama?: OllamaLaunch;
  oneShot?: boolean;
}

/** The payload of a new terminal; a Claude terminal gets its own conversation id. */
export function newTerminalPayload(input: LaunchInput, name = ""): TerminalPayload {
  const payload: TerminalPayload = {
    title: input.title.trim() || defaultTitle(input.agent, input.cwd),
    name,
    agent: input.agent,
    cwd: input.cwd,
    shell: input.shell,
    command: input.command.trim(),
  };
  if (input.agent === "claude") payload.claudeSessionId = crypto.randomUUID();
  if (input.agent === "ollama" && input.ollama) payload.ollama = input.ollama;
  if (input.oneShot) payload.oneShot = true;
  return payload;
}

/** A fresh Claude conversation: its own id, none of the previous one's steps (spec orchestrateur §5). */
export function newConversation(): Partial<TerminalPayload> {
  return { claudeSessionId: crypto.randomUUID(), steps: undefined };
}

/** Another agent in the same terminal: the steps and a one-shot mark go with the old one; Claude gets a conversation if it has none. */
export function switchedAgent(payload: TerminalPayload, agent: AgentId): Partial<TerminalPayload> {
  const left = { agent, steps: undefined, oneShot: undefined };
  return agent === "claude" && !payload.claudeSessionId ? { ...left, claudeSessionId: crypto.randomUUID() } : left;
}

export function buildSpawnSpec(payload: TerminalPayload, mode: LaunchMode): SpawnSpec {
  const spec: SpawnSpec = { cwd: payload.cwd, shell: payload.shell, agent: payload.agent, command: payload.command };
  if (payload.agent === "claude") {
    spec.claude = { mode, sessionId: payload.claudeSessionId ?? crypto.randomUUID(), title: payload.title, role: payload.role ?? "agent" };
    if (payload.remoteControl) spec.claude.remoteControl = payload.name || payload.title;
    if (payload.model) spec.claude.model = payload.model;
    if (payload.permission) spec.claude.permission = payload.permission;
  }
  if (payload.agent === "ollama" && payload.ollama) spec.ollama = payload.ollama;
  return spec;
}

/** An orchestrator's brain: Claude in the project folder, with the manager's role (spec orchestrateur §6). */
export function orchestratorSession(name: string, options: { cwd: string; shell: ShellKind }): TerminalPayload {
  return { ...newTerminalPayload({ title: name, cwd: options.cwd, agent: "claude", command: "", shell: options.shell }, name), role: "orchestrator" };
}
