import { toast } from "sonner";
import { createStore } from "zustand";
import { canvasStore } from "@/canvas/canvasStore";
import { messages } from "@/i18n";
import type { Activity } from "@/ipc/activity";
import { ptyInterrupt, ptySendText, type AgentId } from "@/ipc/pty";
import { agentActivityStore } from "@/store/agentActivity";
import { nodesStore, terminalOf } from "@/store/nodes";
import { statusOf, terminalStatusStore } from "@/store/terminalStatus";
import { AGENTS } from "./catalog";
import { fleetMessages } from "./messages";
import { isSlashCommand, takesCommands } from "./slashCommands";

/** "Tout reprendre" only restarts agents OpenVibe paused less than this ago (spec habillage §14). */
export const RESUME_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * What "Reprendre" types (spec §14), on a line of its own: Claude Code puts a
 * prompt interrupted before any answer back in its input, and "continue" must
 * not be glued to it.
 */
const RESUME_TEXT = "\ncontinue";

interface PausedState {
  /** When OpenVibe paused each agent; kept in memory only. */
  pausedAt: Record<string, number>;
  mark: (ids: readonly string[], at: number) => void;
  clear: (ids: readonly string[]) => void;
}

export const pausedStore = createStore<PausedState>()((set) => ({
  pausedAt: {},
  mark: (ids, at) => set((s) => ({ pausedAt: { ...s.pausedAt, ...Object.fromEntries(ids.map((id) => [id, at])) } })),
  clear: (ids) => set((s) => ({ pausedAt: Object.fromEntries(Object.entries(s.pausedAt).filter(([id]) => !ids.includes(id))) })),
}));

// A paused agent that works or waits again (restarted by hand, sent a command)
// or whose process stops is no longer OpenVibe's to resume. Its pause itself
// only ends work: it never makes an agent working.
agentActivityStore.subscribe((state, previous) => {
  const restarted = Object.keys(pausedStore.getState().pausedAt).filter((id) => {
    const activity = state.activities[id];
    return activity !== previous.activities[id] && (activity?.activity === "working" || activity?.activity === "waiting");
  });
  if (restarted.length > 0) pausedStore.getState().clear(restarted);
});
terminalStatusStore.subscribe((state) => {
  const stopped = Object.keys(pausedStore.getState().pausedAt).filter((id) => state.statuses[id]?.state !== "running");
  if (stopped.length > 0) pausedStore.getState().clear(stopped);
});

/** What pause and resume look at. */
export interface AgentFacts {
  agent: AgentId;
  running: boolean;
  activity: Activity | undefined;
}

/** A running agent at work, other than a plain shell (spec §14). */
export function canPause(facts: AgentFacts): boolean {
  return facts.running && facts.agent !== "shell" && facts.activity === "working";
}

/** A running agent that is idle, other than a plain shell. */
export function canResume(facts: AgentFacts): boolean {
  return facts.running && facts.agent !== "shell" && (facts.activity ?? "idle") === "idle";
}

function factsOf(id: string): AgentFacts | null {
  const payload = terminalOf(nodesStore.getState().nodes[id]);
  if (!payload) return null;
  return {
    agent: payload.agent,
    running: statusOf(id).state === "running",
    activity: agentActivityStore.getState().activities[id]?.activity,
  };
}

function nameOf(id: string): string {
  const payload = terminalOf(nodesStore.getState().nodes[id]);
  return payload ? payload.name || AGENTS[payload.agent].label : messages(fleetMessages).agentFallback;
}

/**
 * Types `text` into each running terminal of `ids` (spec §12). Stopped ones,
 * and those whose process dies meanwhile, are ignored and named (spec §17).
 * An agent waiting for an answer is left alone: the Enter after the text
 * would confirm its dialog's highlighted choice (spec §12). A `/command`
 * goes to the agents only, never to a plain terminal.
 */
export async function sendToAgents(
  ids: readonly string[],
  text: string,
): Promise<{ sent: number; skipped: string[]; waiting: string[]; unsuited: string[]; starting: string[] }> {
  const waiting: string[] = [];
  const unsuited: string[] = [];
  const starting: string[] = [];
  const command = isSlashCommand(text);
  const results = await Promise.all(
    ids.map(async (id) => {
      const facts = factsOf(id);
      if (!facts) return null;
      if (statusOf(id).state === "starting") {
        // Waiting for its staggered start: not stopped, only not there yet.
        starting.push(nameOf(id));
        return null;
      }
      if (!facts.running) return nameOf(id);
      if (command && !takesCommands(facts.agent)) {
        unsuited.push(nameOf(id));
        return null;
      }
      if (facts.activity === "waiting") {
        waiting.push(nameOf(id));
        return null;
      }
      try {
        await ptySendText(id, text);
        return true;
      } catch {
        return nameOf(id);
      }
    }),
  );
  return {
    sent: results.filter((result) => result === true).length,
    skipped: results.filter((result): result is string => typeof result === "string"),
    waiting,
    unsuited,
    starting,
  };
}

/** Interrupts the agents of `ids` that are at work, and remembers them for "Tout reprendre". */
export async function pauseAgents(ids: readonly string[], now = Date.now()): Promise<number> {
  const targets = ids.filter((id) => {
    const facts = factsOf(id);
    return facts !== null && canPause(facts);
  });
  const paused = await Promise.all(targets.map((id) => ptyInterrupt(id).then((sent) => (sent ? id : null), () => null)));
  const done = paused.filter((id): id is string => id !== null);
  pausedStore.getState().mark(done, now);
  return done.length;
}

/** Sends "continue" to the idle agents of `ids` OpenVibe paused less than 24 h ago (spec §14). */
export async function resumeAgents(ids: readonly string[], now = Date.now()): Promise<number> {
  const { pausedAt } = pausedStore.getState();
  const targets = ids.filter((id) => {
    const facts = factsOf(id);
    const at = pausedAt[id];
    return facts !== null && canResume(facts) && at !== undefined && now - at < RESUME_WINDOW_MS;
  });
  const resumed = await Promise.all(targets.map((id) => ptySendText(id, RESUME_TEXT).then(() => id, () => null)));
  const done = resumed.filter((id): id is string => id !== null);
  pausedStore.getState().clear(done);
  return done.length;
}

/** "Reprendre" of one agent: an explicit request, so no 24 h limit. */
export async function resumeAgent(id: string): Promise<boolean> {
  const facts = factsOf(id);
  if (!facts || !canResume(facts)) return false;
  try {
    await ptySendText(id, RESUME_TEXT);
  } catch {
    // The process died between the click and the send.
    toast.warning(messages(fleetMessages).broadcast.resumeFailed(nameOf(id)));
    return false;
  }
  pausedStore.getState().clear([id]);
  return true;
}

/** "2 agents arrêtés ignorés : Thot, Anubis" (spec §12). */
export function skippedText(names: readonly string[]): string | null {
  return names.length === 0 ? null : messages(fleetMessages).broadcast.skipped(names);
}

/** "1 agent en démarrage ignoré : Thot — réessaie dans un instant". */
export function startingText(names: readonly string[]): string | null {
  return names.length === 0 ? null : messages(fleetMessages).broadcast.starting(names);
}

/** "1 agent en attente ignoré : Horus — réponds-lui dans son terminal" (spec §12). */
export function waitingText(names: readonly string[]): string | null {
  return names.length === 0 ? null : messages(fleetMessages).broadcast.waiting(names);
}

/** "1 terminal sans agent ignoré : Thot — une commande / ne va qu'aux agents". */
export function unsuitedText(names: readonly string[]): string | null {
  return names.length === 0 ? null : messages(fleetMessages).broadcast.unsuited(names);
}

export function pausedText(count: number): string {
  return messages(fleetMessages).broadcast.paused(count);
}

export function resumedText(count: number): string {
  return messages(fleetMessages).broadcast.resumed(count);
}

/** The command bar's and the orchestrator's send, with the toasts of ignored agents. */
export async function sendCommand(ids: readonly string[], text: string) {
  const { skipped, waiting, unsuited, starting } = await sendToAgents(ids, text);
  for (const warning of [skippedText(skipped), startingText(starting), waitingText(waiting), unsuitedText(unsuited)]) {
    if (warning) toast.warning(warning);
  }
}

/** "Tout mettre en pause" of the chips, a group or an orchestrator. */
export async function pauseAll(ids: readonly string[]) {
  toast(pausedText(await pauseAgents(ids)));
}

/** "Tout reprendre" of the chips, a group or an orchestrator. */
export async function resumeAll(ids: readonly string[]) {
  toast(resumedText(await resumeAgents(ids)));
}

/** The terminals of the workspace on screen. */
export function workspaceTerminalIds(): string[] {
  const { nodes } = nodesStore.getState();
  return canvasStore.getState().nodeIds.filter((id) => nodes[id]?.kind === "terminal");
}
