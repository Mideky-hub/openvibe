import { Channel } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { call } from "./invoke";

export type ShellKind = "default" | "powershell" | "pwsh" | "cmd" | "gitbash";
export type ClaudeMode = "new" | "resume" | "continue";

export interface ClaudeLaunch {
  mode: ClaudeMode;
  sessionId: string;
  title: string;
  role: "agent" | "orchestrator";
  /** Started with Remote Control, under this name (spec maj §2). */
  remoteControl?: string;
  /** `--model`, chosen by a mission's router (spec maj §3). */
  model?: string;
}

/** Agents of the launch menu (spec habillage §8), in menu order. */
export const AGENT_IDS = ["claude", "codex", "gemini", "qwen", "cursor", "opencode", "aider", "ollama", "shell", "custom"] as const;
export type AgentId = (typeof AGENT_IDS)[number];

export type OllamaMode = "chat" | "code";

export interface OllamaLaunch {
  model: string;
  mode: OllamaMode;
}

/** Mirrors Rust's `SpawnSpec`. */
export interface SpawnSpec {
  cwd: string;
  shell: ShellKind;
  agent: AgentId;
  command: string;
  claude?: ClaudeLaunch;
  ollama?: OllamaLaunch;
}

export interface AgentInfo {
  id: AgentId;
  available: boolean;
}

export interface PtyExitEvent {
  nodeId: string;
  exitCode: number | null;
  /**
   * The process that exited, the number `ptySpawn` resolved with. A terminal relaunched
   * since runs under another pid: an exit with a different pid is the old process's
   * and must be ignored.
   */
  pid: number | null;
}

/** Raw channel payloads arrive as ArrayBuffer; Tauri < 2.5.1 sent small ones as number[]. */
export function toBytes(message: ArrayBuffer | number[]): Uint8Array {
  return message instanceof ArrayBuffer ? new Uint8Array(message) : Uint8Array.from(message);
}

// Output stays as bytes end to end: decoding chunk by chunk would corrupt UTF-8
// sequences split across reads, while xterm's write(Uint8Array) decodes statefully.
function byteChannel(onData: (bytes: Uint8Array) => void): Channel<ArrayBuffer | number[]> {
  const channel = new Channel<ArrayBuffer | number[]>();
  channel.onmessage = (message) => onData(toBytes(message));
  return channel;
}

export function ptySpawn(
  nodeId: string,
  spec: SpawnSpec,
  cols: number,
  rows: number,
  onData: (bytes: Uint8Array) => void,
): Promise<number | null> {
  return call<number | null>("pty_spawn", { nodeId, spec, cols, rows, onData: byteChannel(onData) }).then((pid) => {
    if (pid !== null) spawnedPids.set(nodeId, pid);
    return pid;
  });
}

/** The process each terminal was last started with; a terminal re-attached after a reload has none. */
const spawnedPids = new Map<string, number>();

/** An exit of another process than the terminal's current one: a late event of an older run. */
export function isStaleExit(event: PtyExitEvent): boolean {
  const current = spawnedPids.get(event.nodeId);
  return event.pid !== null && event.pid !== undefined && current !== undefined && event.pid !== current;
}

/** Reconnects to a live session; the current scrollback is sent first. */
export function ptyAttach(nodeId: string, onData: (bytes: Uint8Array) => void): Promise<boolean> {
  return call("pty_attach", { nodeId, onData: byteChannel(onData) });
}

// Tauri runs async commands concurrently, so two writes sent back to back could
// reach the PTY swapped. Each terminal's writes are chained to keep their order.
const writeQueues = new Map<string, Promise<unknown>>();

function queued<T>(nodeId: string, run: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(nodeId) ?? Promise.resolve();
  const result = previous.then(run);
  const tail = result.catch(() => undefined);
  writeQueues.set(nodeId, tail);
  void tail.then(() => {
    if (writeQueues.get(nodeId) === tail) writeQueues.delete(nodeId);
  });
  return result;
}

export function ptyWrite(nodeId: string, data: string): Promise<void> {
  return queued(nodeId, () => call<void>("pty_write", { nodeId, data }));
}

/** Types a command into the terminal, then Enter (spec habillage §15.3). */
export function ptySendText(nodeId: string, text: string): Promise<void> {
  return queued(nodeId, () => call<void>("pty_send_text", { nodeId, text }));
}

/** Interrupts the agent's turn; false for a plain shell (spec §14). */
export function ptyInterrupt(nodeId: string): Promise<boolean> {
  return queued(nodeId, () => call<boolean>("pty_interrupt", { nodeId }));
}

export const ptyResize = (nodeId: string, cols: number, rows: number) => call<void>("pty_resize", { nodeId, cols, rows });
export const ptyKill = (nodeId: string) => call<void>("pty_kill", { nodeId });
export const ptyList = () => call<string[]>("pty_list");
export const listAgents = () => call<AgentInfo[]>("list_agents");
export const listOllamaModels = () => call<string[]>("list_ollama_models");
export const listShells = () => call<ShellKind[]>("list_shells");
export const npmAvailable = () => call<boolean>("npm_available");
/** Reads Windows' PATH again from the registry: an agent installed since the start is found (spec première version §7.2). */
export const refreshPath = () => call<void>("refresh_path");

export async function getScrollback(nodeId: string): Promise<Uint8Array> {
  return toBytes(await call<ArrayBuffer | number[]>("get_scrollback", { nodeId }));
}

export function onPtyExit(handler: (event: PtyExitEvent) => void): Promise<UnlistenFn> {
  return listen<PtyExitEvent>("pty-exit", (event) => {
    // A late exit of an older process must not mark the relaunched terminal as ended.
    if (isStaleExit(event.payload)) return;
    spawnedPids.delete(event.payload.nodeId);
    handler(event.payload);
  });
}
