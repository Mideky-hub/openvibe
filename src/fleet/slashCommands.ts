import { messages } from "@/i18n";
import type { AgentId } from "@/ipc/pty";
import { fleetMessages } from "./messages";

/** A command of the agents' CLI, typed as is (Claude Code's `/effort`, `/model`…). */
export interface SlashCommand {
  name: string;
  hint: string;
}

/** Claude Code's commands worth sending to several agents at once. */
export const SLASH_COMMANDS: readonly SlashCommand[] = (
  [
    ["/effort", "effort"],
    ["/model", "model"],
    ["/remote-control", "remoteControl"],
    ["/compact", "compact"],
    ["/clear", "clear"],
    ["/context", "context"],
    ["/usage", "usage"],
    ["/fast", "fast"],
    ["/status", "status"],
  ] as const
).map(([name, key]) => ({
  name,
  get hint() {
    return messages(fleetMessages).slashHints[key];
  },
}));

/** "/effort ultracode": a command for the agents' CLI, not a request in words nor a path ("/usr/bin/make"). */
export function isSlashCommand(text: string): boolean {
  return /^\s*\/[\w-]+(?=\s|$)/.test(text);
}

/** A command after mentions that did not resolve ("@thot/ /clear"): it still must not go to the selection. */
export function isCommandAfterMentions(text: string): boolean {
  return /^(?:\s*@\S+\s)*\s*\/[\w-]+(?=\s|$)/.test(text);
}

/** A command of the list typed in full: Enter sends it rather than completing it. */
export function isKnownCommand(name: string): boolean {
  return SLASH_COMMANDS.some((command) => command.name === name);
}

/** The `/word` typed at the caret at the start of the command, after its mentions only. */
export function commandAt(text: string, caret: number): { start: number; query: string } | null {
  const match = /^((?:\s*@\S+\s)*\s*)\/([\w-]*)$/.exec(text.slice(0, caret));
  return match ? { start: match[1].length, query: match[2] } : null;
}

/** The commands whose name starts with the query, then those containing it. */
export function matchCommands(query: string): SlashCommand[] {
  const wanted = query.toLowerCase();
  const name = (command: SlashCommand) => command.name.slice(1);
  const starts = SLASH_COMMANDS.filter((c) => name(c).startsWith(wanted));
  const contains = SLASH_COMMANDS.filter((c) => !name(c).startsWith(wanted) && name(c).includes(wanted));
  return [...starts, ...contains];
}

/** A terminal without an agent would run `/effort` as a program. */
export function takesCommands(agent: AgentId): boolean {
  return agent !== "shell" && agent !== "custom";
}
