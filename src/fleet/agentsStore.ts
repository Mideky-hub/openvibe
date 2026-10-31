import { createStore, useStore } from "zustand";
import { listAgents, listShells, refreshPath, type AgentInfo, type ShellKind } from "@/ipc/pty";

interface AgentsState {
  agents: AgentInfo[];
  shells: ShellKind[];
  /** The agents were looked for at least once. */
  loaded: boolean;
  /** Looks for the agents on the PATH again (an install shows up without restart). */
  load: () => Promise<void>;
  /** « Vérifier à nouveau »: Windows' PATH is read again first (spec première version §7.2). */
  recheck: () => Promise<void>;
}

export const agentsStore = createStore<AgentsState>()((set, get) => ({
  agents: [],
  shells: [],
  loaded: false,
  load: async () => {
    const [agents, shells] = await Promise.all([listAgents(), listShells()]);
    set({ agents, shells, loaded: true });
  },
  recheck: async () => {
    await refreshPath();
    await get().load();
  },
}));

export function useAgents<T>(selector: (state: AgentsState) => T): T {
  return useStore(agentsStore, selector);
}

/** The agents, looked for first if they never were: a launch before the list loads must not fall back to a Shell. */
export async function loadedAgents(): Promise<AgentInfo[]> {
  if (!agentsStore.getState().loaded) await agentsStore.getState().load().catch(() => undefined);
  return agentsStore.getState().agents ?? [];
}

/** Whether Claude Code is installed, the agents looked for first if they never were. */
export async function claudeInstalled(): Promise<boolean> {
  if (!agentsStore.getState().loaded) await agentsStore.getState().load();
  return agentsStore.getState().agents.some((a) => a.id === "claude" && a.available);
}
