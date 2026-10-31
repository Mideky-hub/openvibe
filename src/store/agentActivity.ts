import { createStore, useStore } from "zustand";
import type { Activity, ActivityEvent } from "@/ipc/activity";

export interface AgentActivity {
  activity: Activity;
  since: number;
  message?: string;
}

interface AgentActivityState {
  activities: Record<string, AgentActivity>;
  /** One change computed by Rust (spec habillage §10.2). */
  apply: (event: ActivityEvent) => void;
  /** Rust's state when the webview (re)loads. */
  load: (events: readonly ActivityEvent[]) => void;
  remove: (nodeId: string) => void;
}

export const agentActivityStore = createStore<AgentActivityState>()((set) => ({
  activities: {},
  apply: ({ nodeId, ...activity }) => set((s) => ({ activities: { ...s.activities, [nodeId]: activity } })),
  load: (events) => set({ activities: Object.fromEntries(events.map(({ nodeId, ...activity }) => [nodeId, activity])) }),
  remove: (nodeId) =>
    set((s) => ({ activities: Object.fromEntries(Object.entries(s.activities).filter(([id]) => id !== nodeId)) })),
}));

export function useActivity(nodeId: string): AgentActivity | undefined {
  return useStore(agentActivityStore, (s) => s.activities[nodeId]);
}

export function useActivities(): Record<string, AgentActivity> {
  return useStore(agentActivityStore, (s) => s.activities);
}
