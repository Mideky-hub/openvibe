import { Terminal, type IMarker } from "@xterm/xterm";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { openUrl } from "@tauri-apps/plugin-opener";
import "@xterm/xterm/css/xterm.css";
import { ptyKill, ptyResize, ptyWrite } from "@/ipc/pty";
import type { TerminalPayload } from "@/nodes/types";
import { nodesStore, sessionOf, updateSession } from "@/store/nodes";
import { isRunning, statusOf, terminalStatusStore } from "@/store/terminalStatus";
import { createAutostart } from "./autostart";
import { TERMINAL_THEME } from "./terminalTheme";
import { watchDevicePixelRatio } from "./dprWatch";
import { BASE_FONT_SIZE, canvasMeasure, fontFor, gridFor, renderZoom, type FontMeasure } from "./crisp";
import { bufferText } from "./bufferText";
import { freshScreen, textSince } from "./freshScreen";
import { keyAction, NEWLINE_SEQUENCE } from "./keys";
import { newConversation, type LaunchMode } from "./launch";
import { isTypingKey, startsNewConversation, startsOnKeystroke } from "./pill";
import { acceptsInput, attachSession, relaunchSession, restoreSession, startSession, type SessionState } from "./session";

// Terminals live outside React (spec §6.4): Excalidraw unmounts embeddables on a
// workspace switch, and the xterm instance must survive it. Remounting moves the
// existing DOM element into the new host instead of creating a new terminal.
interface Entry {
  term: Terminal;
  /** Holds xterm at screen resolution inside the zoomed host (see crisp.ts). */
  screen: HTMLDivElement;
  /** Where it was last shown, and at which zoom: a scaling change lays it out again. */
  host?: HTMLElement;
  zoom: number;
  opened: boolean;
  session: SessionState;
  /** When output was last written: a quiet agent is ready (spec orchestrateur §7.3). */
  lastOutput?: number;
  /** Where the current session's output starts; above it is the previous session's (final review H2). */
  since?: IMarker;
}

const FONT_FAMILY = "'Cascadia Code', Consolas, monospace";
const entries = new Map<string, Entry>();
const autostart = createAutostart();
let livePtys = new Set<string>();
let measure: FontMeasure | null = null;
let watchingScale = false;

/** Sessions still running in Rust after a webview reload; they are re-attached. */
export function setLivePtys(nodeIds: string[]) {
  livePtys = new Set(nodeIds);
}

/**
 * A terminal just created starts on its first mount, `delayMs` later (groups
 * stagger their agents). Until then it reads DÉMARRAGE, not ARRÊTÉ.
 */
export function markForAutostart(nodeId: string, delayMs = 0) {
  autostart.mark(nodeId, delayMs);
  terminalStatusStore.getState().set(nodeId, { state: "starting" });
}

function create(nodeId: string): Entry {
  const term = new Terminal({
    allowProposedApi: true, // needed by the unicode11 addon
    cursorBlink: true,
    fontFamily: FONT_FAMILY,
    fontSize: BASE_FONT_SIZE,
    theme: { ...TERMINAL_THEME },
    windowsPty: { backend: "conpty" },
  });
  term.loadAddon(new Unicode11Addon());
  term.unicode.activeVersion = "11";
  term.loadAddon(new WebLinksAddon((_event, uri) => void openUrl(uri)));
  const screen = document.createElement("div");
  screen.style.cssText = "position:absolute;left:0;top:0;overflow:hidden;transform-origin:0 0";
  const entry: Entry = { term, screen, zoom: 1, opened: false, session: { replaying: false } };
  term.onWriteParsed(() => {
    entry.lastOutput = Date.now();
  });

  term.attachCustomKeyEventHandler((event) => {
    const action = keyAction(event, term.hasSelection());
    if (action === "default") return true;
    if (event.type === "keydown") {
      if (action === "copy") {
        void navigator.clipboard.writeText(term.getSelection());
        term.clearSelection();
      } else if (action === "newline") {
        term.input(NEWLINE_SEQUENCE);
      }
      // "paste": returning false lets the browser fire its paste event, which
      // xterm turns into a (bracketed) paste.
    }
    return false;
  });
  term.onData((data) => {
    if (acceptsInput(nodeId, entry.session)) void ptyWrite(nodeId, data).catch(() => undefined);
  });
  // Spec habillage §7.3: typing in a terminal where nothing runs starts it again.
  // onKey, not onData: xterm also answers the queries of a restored screen.
  term.onKey(({ domEvent }) => {
    const oneShot = sessionOf(nodesStore.getState().nodes[nodeId])?.oneShot;
    if (!entry.session.replaying && isTypingKey(domEvent) && startsOnKeystroke(statusOf(nodeId), oneShot)) {
      void startFresh(nodeId, entry);
    }
  });
  term.onResize(({ cols, rows }) => {
    if (isRunning(nodeId)) void ptyResize(nodeId, cols, rows).catch(() => undefined);
  });
  entries.set(nodeId, entry);
  return entry;
}

function loadWebgl(term: Terminal) {
  try {
    const webgl = new WebglAddon();
    // Browsers keep about 16 WebGL contexts; past that, fall back to the DOM renderer.
    webgl.onContextLoss(() => webgl.dispose());
    term.loadAddon(webgl);
  } catch {
    // No WebGL: xterm keeps its DOM renderer.
  }
}

/**
 * Sizes the grid from the host's CSS size, then draws it at the screen
 * resolution of `zoom`: the screen box is `zoom` times larger and scaled back
 * by 1 / zoom, which Excalidraw's own scale cancels out. Past `renderZoom`'s
 * cap, Excalidraw enlarges the rest. Skips hidden or not-yet-laid-out hosts,
 * which would shrink the PTY to 2x1.
 */
export function layoutTerminal(nodeId: string, host: HTMLElement, zoom: number) {
  const entry = entries.get(nodeId);
  const box = { width: host.clientWidth, height: host.clientHeight };
  if (!entry || box.width === 0 || box.height === 0) return;
  const dpr = window.devicePixelRatio || 1;
  measure ??= canvasMeasure(FONT_FAMILY);
  entry.zoom = zoom;
  const { term, screen } = entry;
  const grid = gridFor(box, measure, dpr);
  if (grid.cols !== term.cols || grid.rows !== term.rows) term.resize(grid.cols, grid.rows);
  const scale = renderZoom(zoom, box, dpr);
  const fontSize = fontFor(grid, box, scale, measure, dpr);
  if (term.options.fontSize !== fontSize) term.options.fontSize = fontSize;
  screen.style.width = `${box.width * scale}px`;
  screen.style.height = `${box.height * scale}px`;
  screen.style.transform = `scale(${1 / scale})`;
}

/**
 * Shows the terminal of `nodeId` in `host`. The first time a node is shown in this
 * session, its process is started (new node), re-attached (still running after a
 * webview reload) or restored as stopped with its saved output (spec §6.5).
 */
export function mountTerminal(nodeId: string, host: HTMLElement, payload: TerminalPayload, zoom: number) {
  const existing = entries.get(nodeId);
  const entry = existing ?? create(nodeId);
  entry.host = host;
  if (entry.screen.parentElement !== host) host.appendChild(entry.screen);
  if (!watchingScale) {
    watchingScale = true;
    // Cells are whole device pixels only for the ratio they were sized for.
    watchDevicePixelRatio(window, () => {
      for (const [id, shown] of entries) if (shown.host) layoutTerminal(id, shown.host, shown.zoom);
    });
  }
  if (!entry.opened) {
    entry.term.open(entry.screen);
    entry.opened = true;
    loadWebgl(entry.term);
  }
  layoutTerminal(nodeId, host, zoom);
  if (existing) return;
  const started = autostart.run(nodeId, () => {
    // Started by hand meanwhile ("Relancer"): it must not be spawned twice.
    if (statusOf(nodeId).state !== "starting") return;
    // The node may have been edited while it waited for its turn.
    const latest = sessionOf(nodesStore.getState().nodes[nodeId]) ?? payload;
    void startSession(nodeId, entry.term, latest, "new");
  });
  if (started) return;
  if (livePtys.delete(nodeId)) void attachSession(nodeId, entry.term, entry.session);
  else void restoreSession(nodeId, entry.term);
}

/** A new session starts: its screen and its silence are measured from here, not from the previous one's. */
async function freshen(entry: Entry) {
  entry.since?.dispose();
  entry.since = await freshScreen(entry.term);
  entry.lastOutput = undefined;
}

/** Starts a terminal again from a keystroke: a new conversation for Claude. */
async function startFresh(nodeId: string, entry: Entry) {
  let payload = sessionOf(nodesStore.getState().nodes[nodeId]);
  if (!payload) return;
  if (payload.agent === "claude" && startsNewConversation(statusOf(nodeId))) {
    const fresh = newConversation();
    updateSession(nodeId, fresh);
    payload = { ...payload, ...fresh };
  }
  autostart.cancel(nodeId);
  // Set before the first await: xterm sends the triggering key to onData right
  // after onKey, and it would reach the shell before the agent starts.
  entry.session.restarting = true;
  try {
    await relaunchSession(nodeId, entry.term, payload, "new", () => freshen(entry));
  } finally {
    entry.session.restarting = false;
  }
}

/** How long the terminal has written nothing; 0 before its first output. */
export function quietFor(nodeId: string): number {
  const last = entries.get(nodeId)?.lastOutput;
  return last === undefined ? 0 : Date.now() - last;
}

/** The last `lines` lines its current session wrote: a relaunched agent is judged on its new screen (final review H2). */
export function freshText(nodeId: string, lines: number): string {
  const entry = entries.get(nodeId);
  if (!entry) return "";
  return textSince(entry.term, entry.since, lines);
}

/** The last `lines` lines of the terminal, as plain text (spec orchestrateur §7.2 `lire_sortie`). */
export function terminalText(nodeId: string, lines: number): string {
  const term = entries.get(nodeId)?.term;
  return term ? bufferText(term.buffer.active, lines) : "";
}

/** True while a process started before a webview reload awaits re-attachment. */
export function isLiveInRust(nodeId: string): boolean {
  return livePtys.has(nodeId);
}

/**
 * Starts a terminal that may not be on screen yet ("Reprendre toutes les
 * conversations"): Claude resumes its session, other agents start anew. Its
 * output waits in xterm's buffer until the node is shown.
 */
export function resumeTerminal(nodeId: string) {
  const payload = sessionOf(nodesStore.getState().nodes[nodeId]);
  if (!payload) return;
  const entry = entries.get(nodeId) ?? create(nodeId);
  autostart.cancel(nodeId);
  const mode = payload.agent === "claude" && payload.claudeSessionId ? "resume" : "new";
  void relaunchSession(nodeId, entry.term, payload, mode, () => freshen(entry));
}

/** Resolves once the new process is spawned. */
export function relaunchTerminal(nodeId: string, payload: TerminalPayload, mode: LaunchMode): Promise<void> {
  // A terminal not shown since the app started has no xterm yet: a mission still starts it.
  const entry = entries.get(nodeId) ?? create(nodeId);
  autostart.cancel(nodeId);
  return relaunchSession(nodeId, entry.term, payload, mode, () => freshen(entry));
}

export function stopTerminal(nodeId: string) {
  void ptyKill(nodeId).catch(() => undefined);
}

export function focusTerminal(nodeId: string) {
  entries.get(nodeId)?.term.focus();
}

/** The terminal's selection, empty without one (« Copier » of its radial menu). */
export function terminalSelection(nodeId: string): string {
  return entries.get(nodeId)?.term.getSelection() ?? "";
}

/** Text pasted into a terminal as by Ctrl+V: bracketed when its program asks for it. */
export function pasteIntoTerminal(nodeId: string, text: string) {
  entries.get(nodeId)?.term.paste(text);
}

/** Stops the process and frees the terminal of a node removed from the canvas. */
export function disposeTerminal(nodeId: string) {
  stopTerminal(nodeId);
  entries.get(nodeId)?.term.dispose();
  entries.delete(nodeId);
  autostart.cancel(nodeId);
  terminalStatusStore.getState().remove(nodeId);
}
