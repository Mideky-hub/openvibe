import { AppError } from "@/ipc/invoke";
import { getScrollback, ptyAttach, ptyKill, ptySpawn } from "@/ipc/pty";
import type { TerminalPayload } from "@/nodes/types";
import { nodesStore } from "@/store/nodes";
import { isRunning, terminalStatusStore, waitForExit } from "@/store/terminalStatus";
import { accountsStore, loadAccounts } from "@/accounts/store";
import { markResumedLaunch } from "@/usage/usageStore";
import { buildSpawnSpec, type LaunchMode } from "./launch";
import { accountsMessages } from "@/accounts/messages";
import { messages } from "@/i18n";
import { nodesMessages } from "@/nodes/messages";

/** The part of an xterm `Terminal` the session logic needs (lets tests use a fake). */
export interface TermSink {
  write(data: string | Uint8Array, callback?: () => void): void;
  readonly cols: number;
  readonly rows: number;
}

/** Per-terminal flag: true while replayed output is being written (see attachSession). */
export interface SessionState {
  replaying: boolean;
  /** True while a keystroke restarts the terminal: that keystroke is not sent. */
  restarting?: boolean;
}

const setStatus = terminalStatusStore.getState().set;

/** Keystrokes go to the process only while it runs, no old output is replayed and no restart is under way. */
export function acceptsInput(nodeId: string, state: SessionState): boolean {
  return !state.replaying && !state.restarting && isRunning(nodeId);
}

/**
 * A Claude terminal from before conversation ids gets one, kept in its node:
 * the next "Reprendre" must name the conversation this launch starts.
 */
function withConversationId(nodeId: string, payload: TerminalPayload): TerminalPayload {
  if (payload.agent !== "claude" || payload.claudeSessionId) return payload;
  const claudeSessionId = crypto.randomUUID();
  nodesStore.getState().update(nodeId, { claudeSessionId });
  return { ...payload, claudeSessionId };
}

/**
 * A new Claude conversation starts with the profile in use (spec comptes §3), unless it already has one; a resumed one keeps the
 * profile it started with, or its conversation would not be found.
 */
async function withAccount(nodeId: string, payload: TerminalPayload, mode: LaunchMode): Promise<TerminalPayload> {
  if (payload.agent !== "claude") return payload;
  await loadAccounts();
  // Its folder is unknown, not gone: the default account would spend for the wrong one.
  if (payload.accountId && accountsStore.getState().unread) throw new Error(messages(accountsMessages).notRead);
  const active = accountsStore.getState().active;
  if (mode !== "new" || payload.accountId || !active) return payload;
  nodesStore.getState().update(nodeId, { accountId: active });
  return { ...payload, accountId: active };
}

export async function startSession(nodeId: string, term: TermSink, payload: TerminalPayload, mode: LaunchMode) {
  // "running" is set before spawning: ConPTY's cursor query arrives before the
  // spawn command returns, and xterm's answer must be let through.
  setStatus(nodeId, { state: "running" });
  try {
    const spec = buildSpawnSpec(withConversationId(nodeId, await withAccount(nodeId, payload, mode)), mode);
    // A resumed conversation brings its earlier spending: the usage counts this launch's only.
    if (payload.agent === "claude" && mode !== "new") markResumedLaunch(nodeId);
    await ptySpawn(nodeId, spec, term.cols, term.rows, (bytes) => term.write(bytes));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const kind = error instanceof AppError ? error.kind : undefined;
    setStatus(nodeId, kind ? { state: "error", message, kind } : { state: "error", message });
    // A refused orchestrator says why over its terminal (spec première version §4.1).
    if (kind !== "toolsUnavailable") term.write(`\r\n\x1b[31m${message}\x1b[0m\r\n`);
  }
}

/**
 * Reconnects to a process that kept running while the webview reloaded. Rust
 * always sends the replay first; it contains past terminal queries (cursor
 * position, device attributes…) that xterm would answer into the live process,
 * so input is ignored until the replay has been written.
 */
export async function attachSession(nodeId: string, term: TermSink, state: SessionState): Promise<boolean> {
  state.replaying = true;
  setStatus(nodeId, { state: "running" });
  let first = true;
  const attached = await ptyAttach(nodeId, (bytes) => {
    if (!first) return term.write(bytes);
    first = false;
    term.write(bytes, () => {
      state.replaying = false;
    });
  });
  if (!attached) {
    state.replaying = false;
    setStatus(nodeId, { state: "stopped" });
  }
  return attached;
}

/**
 * Shows the last saved output of a stopped terminal (spec §6.5). Like a
 * replay, it holds the input back until written: a long screen may still be
 * parsing when the terminal is relaunched, and xterm's answers to its old
 * queries must not reach the new process.
 */
export async function restoreSession(nodeId: string, term: TermSink, state?: SessionState) {
  setStatus(nodeId, { state: "stopped" });
  const bytes = await getScrollback(nodeId);
  if (bytes.length === 0) return;
  if (state) state.replaying = true;
  term.write(bytes, () => {
    if (state) state.replaying = false;
  });
}

/** Re-attaches to a live process; when it is gone, the terminal shows its saved screen instead. */
export async function reattachSession(nodeId: string, term: TermSink, state: SessionState) {
  if (!(await attachSession(nodeId, term, state))) await restoreSession(nodeId, term, state);
}

/**
 * Stops the process if it runs, waits for its exit, then starts it again.
 * `beforeStart` runs in between: what follows is the new session's.
 */
export async function relaunchSession(
  nodeId: string,
  term: TermSink,
  payload: TerminalPayload,
  mode: LaunchMode,
  beforeStart?: () => void | Promise<void>,
) {
  if (isRunning(nodeId)) {
    await ptyKill(nodeId);
    await waitForExit(nodeId);
  }
  await beforeStart?.();
  term.write(`\r\n\x1b[2m${messages(nodesMessages).session.restartMarker}\x1b[0m\r\n`);
  await startSession(nodeId, term, payload, mode);
}
