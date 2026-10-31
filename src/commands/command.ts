import { toast } from "sonner";
import { messages } from "@/i18n";
import type { Point } from "@/fleet/terminals";
import { commandsMessages } from "./messages";
import type { Shortcut } from "./shortcuts";

/** What a command knows of the moment it runs in (spec fenêtre §7.3). */
export interface CommandContext {
  /** A project is open, its workspace on screen. */
  project: boolean;
  workspaceId: string | null;
  /** Terminals of the workspace on screen. */
  terminalCount: number;
  /** The terminal that has the keyboard, else the last of the workspace to have had it (spec fenêtre §6.3). */
  terminalId: string | null;
  /** Where the radial menu was opened, in scene coordinates: what it creates goes there (spec menu radial §6.1). */
  at?: Point;
  /** The group the radial menu points at; else the current terminal's (spec menu radial §6.1). */
  groupId?: string | null;
  /** The orchestrator the radial menu points at. */
  orchestratorId?: string | null;
}

/**
 * One function of the application. Its shortcut, its palette line (J8) and
 * its radial menu entry run this same command: they never diverge (spec
 * fenêtre §3).
 */
export interface Command {
  id: string;
  /** Fixed, or read when the palette lists it (« Agrandir » / « Restaurer »). */
  label: string | ((ctx: CommandContext) => string);
  /** Fixed, or named after the moment (« Terminal · Isis »). */
  section: string | ((ctx: CommandContext) => string);
  keywords: readonly string[];
  shortcut?: Shortcut;
  /** A key shown at the right for display only: Excalidraw's one-letter tools. */
  keys?: string;
  available: (ctx: CommandContext) => boolean;
  /** Listed but greyed, with why: an agent not found on this computer, as in the Agent menu. */
  disabled?: (ctx: CommandContext) => string | null;
  run: (ctx: CommandContext) => void | Promise<void>;
}

export function labelOf(command: Command, ctx: CommandContext): string {
  return typeof command.label === "function" ? command.label(ctx) : command.label;
}

export function sectionOf(command: Command, ctx: CommandContext): string {
  return typeof command.section === "function" ? command.section(ctx) : command.section;
}

/** The available command of a shortcut, if any. */
export function commandFor(commands: readonly Command[], shortcut: Shortcut, ctx: CommandContext): Command | null {
  return commands.find((command) => command.shortcut === shortcut && command.available(ctx)) ?? null;
}

/** Runs a command; a failure says so, like the menus (spec fenêtre §9). */
export function runCommand(command: Command, ctx: CommandContext) {
  const fail = (error: unknown) => {
    const text = messages(commandsMessages);
    const like = text.failedLike[command.id];
    toast.error(like ? like(String(error)) : text.failed(labelOf(command, ctx), String(error)));
  };
  try {
    void Promise.resolve(command.run(ctx)).catch(fail);
  } catch (error) {
    fail(error);
  }
}
