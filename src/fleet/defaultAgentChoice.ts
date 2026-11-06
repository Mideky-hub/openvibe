import { createStore, useStore } from "zustand";
import type { AgentId } from "@/ipc/pty";

/** The default agent of the settings: one that starts without options, or "auto" (Claude, then Codex, then Shell). */
export type DefaultAgentChoice = "auto" | AgentId;

export const defaultAgentStore = createStore<{ choice: DefaultAgentChoice }>()(() => ({ choice: "auto" }));
export const useDefaultAgentChoice = () => useStore(defaultAgentStore, (s) => s.choice);
