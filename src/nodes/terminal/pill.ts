import type { Activity } from "@/ipc/activity";
import type { AgentId } from "@/ipc/pty";
import type { TerminalStatus } from "@/store/terminalStatus";
import { messages } from "@/i18n";
import { nodesMessages } from "@/nodes/messages";

export type PillTone = "live" | "ready" | "working" | "workingIndigo" | "waiting" | "stopped" | "done" | "failed";

/**
 * The status pill of a terminal header (spec habillage §7.2): the process
 * state, and for a running process its activity.
 */
export function pillOf(status: TerminalStatus, activity?: Activity, indigo = false): { label: string; tone: PillTone } {
  const t = messages(nodesMessages).pill;
  switch (status.state) {
    case "starting":
      return { label: t.starting, tone: "stopped" };
    case "running":
      if (activity === "working") return { label: t.working, tone: indigo ? "workingIndigo" : "working" };
      if (activity === "waiting") return { label: t.waiting, tone: "waiting" };
      if (activity === "idle") return { label: t.ready, tone: "ready" };
      return { label: t.active, tone: "live" };
    case "stopped":
      return { label: t.stopped, tone: "stopped" };
    case "exited":
      return {
        label: status.code === null ? t.exited : t.exitedWith(status.code),
        tone: status.code === null || status.code === 0 ? "done" : "failed",
      };
    case "error":
      return { label: t.error, tone: "failed" };
  }
}

/** What the card over a stopped terminal offers (spec habillage §7.3). */
export function resumeOfferOf(status: TerminalStatus, agent: AgentId, hasSession: boolean): "resume" | "relaunch" | null {
  if (status.state === "running" || status.state === "starting") return null;
  // A refused orchestrator's node says why and offers its own retry.
  if (status.state === "error" && status.kind === "toolsUnavailable") return null;
  return agent === "claude" && hasSession ? "resume" : "relaunch";
}

/**
 * Typing in a terminal where nothing runs starts it again. Only real keystrokes
 * count: a restored screen makes xterm answer old terminal queries by itself.
 * A stray key must not run an installer again: a one-shot command never starts this way.
 */
export function startsOnKeystroke(status: TerminalStatus, oneShot = false): boolean {
  return !oneShot && status.state !== "running" && status.state !== "starting";
}

/**
 * "Taper" in "taper démarre à neuf": a character or Enter. Escape, arrows,
 * function keys and shortcuts (Ctrl+C, Ctrl+Z…) are reflexes, not typing, and
 * must not throw away the conversation the card offers to resume. AltGr
 * characters (Ctrl+Alt on Windows) count as typing.
 */
export function isTypingKey(e: Pick<KeyboardEvent, "key" | "ctrlKey" | "altKey" | "metaKey">): boolean {
  const altGr = e.ctrlKey && e.altKey;
  const shortcut = e.metaKey || (!altGr && (e.ctrlKey || e.altKey));
  return !shortcut && ([...e.key].length === 1 || e.key === "Enter");
}

/** A failed launch created no conversation: retrying keeps the same Claude session id. */
export function startsNewConversation(status: TerminalStatus): boolean {
  return status.state !== "error";
}
