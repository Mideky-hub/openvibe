import { toast } from "sonner";
import { createStore, useStore } from "zustand";
import { messages } from "@/i18n";
import { ptySendText, ptyWrite } from "@/ipc/pty";
import { freshText } from "@/nodes/terminal/registry";
import { agentActivityStore } from "@/store/agentActivity";
import { nodesStore, sessionOf, updateSession } from "@/store/nodes";
import { isRunning, terminalStatusStore } from "@/store/terminalStatus";
import { AGENTS } from "./catalog";
import { fleetMessages } from "./messages";

/**
 * Claude Code's Remote Control (spec maj §2): a session followed from
 * claude.ai or the phone. OpenVibe types `/remote-control` and reads the
 * answer on the terminal's screen; a terminal that has it on starts with it.
 */
const COMMAND = "/remote-control";
const ESCAPE = "\x1b";
const UP = "\x1b[A";
const STEP_MS = 250;
const ANSWER_MS = 20_000;
/** A session started with `--remote-control` shows its link within this time. */
const LAUNCH_MS = 60_000;
const consentError = () => messages(fleetMessages).remote.consent;

/** What the last `/remote-control` of a screen says. */
export type RemoteScreen =
  | { kind: "menu"; url?: string; choice: string | null }
  | { kind: "consent" }
  | { kind: "active"; url?: string }
  | { kind: "disconnected" }
  | { kind: "error"; message: string }
  | { kind: "none" };

const LINK = /https:\/\/claude\.ai\/code\/session_[A-Za-z0-9_-]+/g;
const lastLink = (lines: readonly string[]) => lines.join("\n").match(LINK)?.pop();
/** Claude's echo of a submitted `/remote-control`, at the start of its line. */
const ECHO = /^❯ \/(remote-control|rc)$/;
const ACTIVE = /^\s*\/remote-control is active\b/;
const DISCONNECTED = /^\s*(⎿\s*)?Remote Control disconnected\b/;
const REFUSED = /^\s*(⎿\s*)?(Remote Control requires a claude\.ai subscription|Remote Control\b.*\b(not available|unavailable|disabled|failed)\b)/i;

/**
 * Reads a Claude screen (final review maj §2): a menu only at its bottom,
 * an answer only on the lines right after the last echo of the command, or
 * in the banner of a session started with Remote Control. The same words
 * printed elsewhere (a file, a diff) count for nothing.
 */
export function remoteScreen(text: string): RemoteScreen {
  const lines = text.split("\n").map((line) => line.replace(/\s+$/, ""));
  const filled = lines.filter((line) => line.trim() !== "");
  const bottom = filled.slice(-8);
  const closing = filled.slice(-3);
  if (closing.some((line) => line.includes("Esc to continue"))) {
    const start = bottom.findIndex((line) => line.includes("Disconnect this session"));
    if (start >= 0) {
      const choice = bottom
        .slice(start, start + 4)
        .map((line) => /❯\s*(.+)$/.exec(line)?.[1].trim())
        .find((label) => label !== undefined);
      return { kind: "menu", url: lastLink(bottom), choice: choice ?? null };
    }
  }
  if (bottom.some((line) => /Enable Remote Control/.test(line)) && bottom.some((line) => line.includes("Never mind"))) return { kind: "consent" };
  let echo = -1;
  lines.forEach((line, i) => {
    if (ECHO.test(line)) echo = i;
  });
  const answer = echo >= 0 ? lines.slice(echo + 1, echo + 4) : filled.slice(0, 8);
  for (const line of answer) {
    // Without an echo, only the banner of a session started with Remote Control says anything.
    if (echo >= 0 && DISCONNECTED.test(line)) return { kind: "disconnected" };
    if (echo >= 0 && REFUSED.test(line)) return { kind: "error", message: line.replace(/^[\s⎿]+/, "").trim() };
    if (ACTIVE.test(line)) return { kind: "active", url: lastLink(answer) };
  }
  return { kind: "none" };
}

/** What the flows need of a terminal; injected so they can be tested. */
export interface RemoteIo {
  screen: () => string;
  /** Typed as a paste, then Enter. */
  send: (text: string) => Promise<void>;
  /** Raw keys. */
  press: (keys: string) => Promise<void>;
  sleep: (ms: number) => Promise<void>;
}

/** `later`: the agent is in a turn or a dialog; it is done at the end of its turn. */
export type RemoteResult = { on: true; url?: string } | { on: false } | { error: string } | { later: true };

async function waitFor(io: RemoteIo, done: (screen: RemoteScreen) => boolean, timeoutMs: number): Promise<RemoteScreen | null> {
  for (let waited = 0; waited < timeoutMs; waited += STEP_MS) {
    await io.sleep(STEP_MS);
    const screen = remoteScreen(io.screen());
    if (done(screen)) return screen;
  }
  return null;
}

/** Turns Remote Control on: `/remote-control`, unless the screen says it already is. */
export async function enableRemote(io: RemoteIo, timeoutMs = ANSWER_MS): Promise<RemoteResult> {
  const before = remoteScreen(io.screen());
  if (before.kind === "consent") return { error: consentError() };
  if (before.kind === "active") return { on: true, url: before.url };
  if (before.kind === "menu") {
    await io.press(ESCAPE);
    return { on: true, url: before.url };
  }
  await io.send(COMMAND);
  const after = await waitFor(io, (s) => s.kind === "menu" || s.kind === "active" || s.kind === "error" || s.kind === "consent", timeoutMs);
  if (!after) return { error: messages(fleetMessages).remote.notConfirmed };
  if (after.kind === "consent") return { error: consentError() };
  if (after.kind === "error") return { error: after.message };
  // Its menu: it was on already.
  if (after.kind === "menu") await io.press(ESCAPE);
  return { on: true, url: after.kind === "menu" || after.kind === "active" ? after.url : undefined };
}

/** Turns Remote Control off: its menu, then « Disconnect this session ». */
export async function disableRemote(io: RemoteIo, timeoutMs = ANSWER_MS): Promise<RemoteResult> {
  let screen = remoteScreen(io.screen());
  if (screen.kind === "consent") return { error: consentError() };
  if (screen.kind === "disconnected") return { on: false };
  if (screen.kind !== "menu") {
    const wasOn = screen.kind === "active";
    const opened = (s: RemoteScreen) => s.kind === "menu" || s.kind === "error" || s.kind === "consent";
    await io.send(COMMAND);
    let after = await waitFor(io, (s) => opened(s) || (!wasOn && s.kind === "active"), timeoutMs);
    // It was off: that command turned it on, the next one opens its menu.
    if (after?.kind === "active") {
      await io.send(COMMAND);
      after = await waitFor(io, opened, timeoutMs);
    }
    if (!after) return { error: messages(fleetMessages).remote.menuNotOpened };
    if (after.kind === "consent") return { error: consentError() };
    if (after.kind === "error") return { error: after.message };
    screen = after;
  }
  for (let tries = 0; tries < 3 && screen.kind === "menu" && !screen.choice?.startsWith("Disconnect"); tries++) {
    await io.press(UP);
    await io.sleep(STEP_MS);
    screen = remoteScreen(io.screen());
  }
  if (screen.kind !== "menu" || !screen.choice?.startsWith("Disconnect")) {
    await io.press(ESCAPE);
    return { error: messages(fleetMessages).remote.menuUnreadable };
  }
  await io.press("\r");
  const done = await waitFor(io, (s) => s.kind === "disconnected", timeoutMs);
  return done ? { on: false } : { error: messages(fleetMessages).remote.disconnectNotConfirmed };
}

/** What OpenVibe knows of a running session's Remote Control. */
export interface RemoteLink {
  state: "pending" | "connecting" | "on" | "error";
  url?: string;
  error?: string;
}

interface RemoteState {
  links: Record<string, RemoteLink>;
  set: (nodeId: string, link: RemoteLink | null) => void;
}

export const remoteStore = createStore<RemoteState>()((set) => ({
  links: {},
  set: (nodeId, link) =>
    set((s) => {
      const links = { ...s.links };
      if (link) links[nodeId] = link;
      else delete links[nodeId];
      return { links };
    }),
}));

export function useRemoteLink(nodeId: string): RemoteLink | undefined {
  return useStore(remoteStore, (s) => s.links[nodeId]);
}

/** Replaced in tests: the flows wait between two looks at the screen. */
export const remoteDeps = { sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)) };

function ioOf(nodeId: string): RemoteIo {
  return {
    // The current session's screen only: an earlier run's output says nothing of this one (final review maj §2).
    screen: () => freshText(nodeId, 80),
    send: (text) => ptySendText(nodeId, text),
    press: (keys) => ptyWrite(nodeId, keys),
    sleep: (ms) => remoteDeps.sleep(ms),
  };
}

function nameOf(nodeId: string): string {
  const session = sessionOf(nodesStore.getState().nodes[nodeId]);
  return session?.name || (session ? AGENTS[session.agent].label : messages(fleetMessages).agentFallback);
}

/** Only Claude sessions have Remote Control. */
export function hasRemote(nodeId: string): boolean {
  return sessionOf(nodesStore.getState().nodes[nodeId])?.agent === "claude";
}

const wanted = (nodeId: string) => sessionOf(nodesStore.getState().nodes[nodeId])?.remoteControl === true;

/** One flow at a time per session: two would interleave their keys (final review maj §2). */
const flows = new Map<string, Promise<unknown>>();
function locked<T>(nodeId: string, flow: () => Promise<T>): Promise<T> {
  const run = (flows.get(nodeId) ?? Promise.resolve()).then(flow, flow);
  const tail = run.catch(() => undefined);
  flows.set(nodeId, tail);
  void tail.then(() => {
    if (flows.get(nodeId) === tail) flows.delete(nodeId);
  });
  return run;
}

/** Whether a Remote Control flow is typing in this session: nothing else may be written meanwhile. */
export function remoteBusy(nodeId: string): boolean {
  return flows.has(nodeId);
}

/** Sessions to bring to their wanted state at the end of their turn. */
const pending = new Set<string>();

/** Types the wanted state into an idle session. */
async function apply(nodeId: string): Promise<RemoteResult> {
  const on = wanted(nodeId);
  if (!isRunning(nodeId)) {
    pending.delete(nodeId);
    remoteStore.getState().set(nodeId, null);
    return on ? { on: true } : { on: false };
  }
  // In a turn or a dialog, the Enter after the command would answer for the user (final review maj §2).
  if ((agentActivityStore.getState().activities[nodeId]?.activity ?? "idle") !== "idle") {
    pending.add(nodeId);
    remoteStore.getState().set(nodeId, { state: "pending", url: remoteStore.getState().links[nodeId]?.url });
    return { later: true };
  }
  pending.delete(nodeId);
  const previous = remoteStore.getState().links[nodeId];
  remoteStore.getState().set(nodeId, { state: "connecting", url: previous?.url });
  let result: RemoteResult;
  try {
    result = on ? await enableRemote(ioOf(nodeId)) : await disableRemote(ioOf(nodeId));
  } catch (error) {
    result = { error: String(error) };
  }
  if ("error" in result) remoteStore.getState().set(nodeId, { state: "error", error: result.error });
  else if ("on" in result) remoteStore.getState().set(nodeId, result.on ? { state: "on", url: result.url } : null);
  return result;
}

/**
 * Remote Control on or off for one session: remembered for its next starts,
 * typed into it when it runs and is idle, else at the end of its turn. Null
 * for a node without a Claude session.
 */
export function setRemoteControl(nodeId: string, on: boolean): Promise<RemoteResult | null> {
  if (!hasRemote(nodeId)) return Promise.resolve(null);
  return locked(nodeId, () => {
    updateSession(nodeId, { remoteControl: on || undefined });
    return apply(nodeId);
  });
}

/** Several sessions at once; one toast says how it went. */
export async function setRemoteControlAll(nodeIds: readonly string[], on: boolean): Promise<void> {
  const ids = nodeIds.filter(hasRemote);
  if (ids.length === 0) {
    toast(messages(fleetMessages).remote.noClaudeSession);
    return;
  }
  const settled = await Promise.allSettled(ids.map((id) => setRemoteControl(id, on)));
  const results: (RemoteResult | null)[] = settled.map((s) => (s.status === "fulfilled" ? s.value : { error: String(s.reason) }));
  // A stopped session only remembers it for its next start: the tool says so.
  const stopped = ids.filter((id, i) => { const r = results[i]; return r !== null && "on" in r && !isRunning(id); });
  const done = ids.filter((id, i) => { const r = results[i]; return r !== null && "on" in r && isRunning(id); });
  const later = ids.filter((_, i) => { const r = results[i]; return r !== null && "later" in r; });
  if (done.length > 0) toast(messages(fleetMessages).remote.done(on, done.map(nameOf).join(", ")));
  if (stopped.length > 0) toast(messages(fleetMessages).remote.nextStartFor(stopped.map(nameOf).join(", ")));
  if (later.length > 0) toast(messages(fleetMessages).remote.later(later.map(nameOf).join(", ")));
  ids.forEach((id, i) => {
    const result = results[i];
    if (result && "error" in result) toast.error(messages(fleetMessages).remote.failedFor(nameOf(id), result.error));
  });
}

/** A session started with Remote Control shows its link: OpenVibe reads it. */
async function watchStart(nodeId: string) {
  remoteStore.getState().set(nodeId, { state: "connecting" });
  const seen = await waitFor(ioOf(nodeId), (s) => s.kind === "active" || s.kind === "error" || s.kind === "consent" || !isRunning(nodeId), LAUNCH_MS);
  if (!isRunning(nodeId) || remoteStore.getState().links[nodeId]?.state !== "connecting") return;
  if (seen?.kind === "active") remoteStore.getState().set(nodeId, { state: "on", url: seen.url });
  else if (seen?.kind === "error") remoteStore.getState().set(nodeId, { state: "error", error: seen.message });
  else if (seen?.kind === "consent") remoteStore.getState().set(nodeId, { state: "error", error: consentError() });
  // No link within the time: the phone cannot be followed, which is an error, not an active session.
  else remoteStore.getState().set(nodeId, { state: "error", error: messages(fleetMessages).remote.notConfirmed });
}

// A session that stops loses its link; one that starts with Remote Control gets it.
terminalStatusStore.subscribe((state, previous) => {
  // A node removed from the canvas loses its status: its link would stay for good.
  for (const nodeId of Object.keys(previous.statuses)) {
    if (state.statuses[nodeId]) continue;
    pending.delete(nodeId);
    if (remoteStore.getState().links[nodeId]) remoteStore.getState().set(nodeId, null);
  }
  for (const [nodeId, status] of Object.entries(state.statuses)) {
    const before = previous.statuses[nodeId]?.state;
    if (status.state === before) continue;
    if (status.state !== "running") {
      pending.delete(nodeId);
      if (remoteStore.getState().links[nodeId]) remoteStore.getState().set(nodeId, null);
    } else if (wanted(nodeId)) {
      void watchStart(nodeId);
    }
  }
});

// A session back to idle gets the Remote Control it was asked for during its turn.
agentActivityStore.subscribe((state, previous) => {
  for (const nodeId of [...pending]) {
    const activity = state.activities[nodeId]?.activity;
    if (activity === "idle" && activity !== previous.activities[nodeId]?.activity) void locked(nodeId, () => apply(nodeId));
  }
});

