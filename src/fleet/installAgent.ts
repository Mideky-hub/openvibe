import { toast } from "sonner";
import { arrive } from "@/canvas/arrive";
import { canvasStore } from "@/canvas/canvasStore";
import { messages } from "@/i18n";
import { listOllamaModels, type AgentId, type ShellKind } from "@/ipc/pty";
import { statusOf } from "@/store/terminalStatus";
import { agentsStore } from "./agentsStore";
import { AGENTS } from "./catalog";
import { AGENT_INSTALLS, ollamaPullCommand, sameOllamaModel, validOllamaModel } from "./installCommands";
import { defaultLaunchOptions, launchAgent } from "./launchAgent";
import { fleetMessages } from "./messages";
import { viewportCenter } from "./placement";
import type { Point } from "./terminals";

const WATCH_EVERY_MS = 4000;
const WATCH_FOR_MS = 30 * 60_000;

/**
 * Asks `found` every few seconds until it says yes, the terminal stops or the
 * time is up. The command is typed into a shell that stays open, so no
 * `pty-exit` marks the end of an install (spec installation §4.3).
 */
export function watchTerminal(nodeId: string, found: () => Promise<boolean>, onFound: () => void) {
  const deadline = Date.now() + WATCH_FOR_MS;
  const tick = async () => {
    // A new terminal reads "starting" from its creation; a closed one has no status left.
    const { state } = statusOf(nodeId);
    const ended = state !== "running" && state !== "starting";
    if (await found().catch(() => false)) onFound();
    else if (!ended && Date.now() < deadline) setTimeout(() => void tick(), WATCH_EVERY_MS);
  };
  setTimeout(() => void tick(), WATCH_EVERY_MS);
}

/** A terminal running `command` in plain sight: never in the background (spec installation §2). Its id, or null with the reason shown. */
async function openCommandTerminal(title: string, command: string, shell: ShellKind, at?: Point): Promise<string | null> {
  const t = messages(fleetMessages);
  try {
    const center = at ?? viewportCenter(canvasStore.getState().view);
    const nodeId = await launchAgent("custom", { ...defaultLaunchOptions(), title, command, shell, oneShot: true }, center);
    if (!nodeId) toast.error(t.install.noCanvas);
    // The installer may ask something: the terminal comes into view with the keyboard.
    else arrive(nodeId);
    return nodeId;
  } catch (error) {
    toast.error(t.launchFailed(String(error)));
    return null;
  }
}

async function agentDetected(agent: AgentId): Promise<boolean> {
  await agentsStore.getState().recheck();
  return agentsStore.getState().agents.some((a) => a.id === agent && a.available);
}

/** Runs the agent's official command in a terminal; the menus follow once it is found (spec installation §4). */
export async function installAgent(agent: AgentId, at?: Point): Promise<string | null> {
  const install = AGENT_INSTALLS[agent];
  if (!install) return null;
  const { label } = AGENTS[agent];
  const nodeId = await openCommandTerminal(messages(fleetMessages).install.terminalTitle(label), install.command, install.shell, at);
  if (nodeId) watchTerminal(nodeId, () => agentDetected(agent), () => toast(messages(fleetMessages).install.installed(label)));
  return nodeId;
}

/** `ollama pull` in a terminal; PowerShell runs ollama.exe whatever the execution policy (spec installation §5). */
export async function pullOllamaModel(model: string, at?: Point): Promise<string | null> {
  if (!validOllamaModel(model)) return null;
  const nodeId = await openCommandTerminal(`Ollama · ${model}`, ollamaPullCommand(model), "powershell", at);
  if (nodeId) {
    const pulled = async () => (await listOllamaModels()).some((name) => sameOllamaModel(name, model));
    watchTerminal(nodeId, pulled, () => toast(messages(fleetMessages).ollama.pulled(model)));
  }
  return nodeId;
}
