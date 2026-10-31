import { createStore, useStore } from "zustand";
import type { Activity, ActivityEvent } from "@/ipc/activity";

export interface AgentActivity {
  activity: Activity;
  since: number;
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
  // `since` dates each transition: an event older than the one held arrived out of order (two Rust threads
  // emit after releasing their lock) or is a startup snapshot overtaken by a live event, and is dropped.
  apply: ({ nodeId, activity, since }) =>
    set((s) => (s.activities[nodeId] && s.activities[nodeId].since > since ? s : { activities: { ...s.activities, [nodeId]: { activity, since } } })),
  load: (events) =>
    set((s) => {
      // Rust's list is the truth about which terminals run; for those, a newer live event wins.
      const activities: Record<string, AgentActivity> = {};
      for (const { nodeId, activity, since } of events) {
        const held = s.activities[nodeId];
        activities[nodeId] = held && held.since > since ? held : { activity, since };
      }
      return { activities };
    }),
  remove: (nodeId) =>
    set((s) => ({ activities: Object.fromEntries(Object.entries(s.activities).filter(([id]) => id !== nodeId)) })),
}));

export function useActivity(nodeId: string): AgentActivity | undefined {
  return useStore(agentActivityStore, (s) => s.activities[nodeId]);
}

export function useActivities(): Record<string, AgentActivity> {
  return useStore(agentActivityStore, (s) => s.activities);
}
