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
  // `since` dates each transition: an event older than the one held arrived out of order (two Rust threads
  // emit after releasing their lock) or is a startup snapshot overtaken by a live event, and is dropped.
  // A new question during a wait is no transition: Rust converts the same `since` to the wall clock again,
  // up to 1 ms earlier, so it only replaces the message and the agent keeps its place.
  apply: ({ nodeId, ...event }) =>
    set((s) => {
      const held = s.activities[nodeId];
      if (held?.activity === "waiting" && event.activity === "waiting") {
        return { activities: { ...s.activities, [nodeId]: { ...event, since: held.since } } };
      }
      return held && held.since > event.since ? s : { activities: { ...s.activities, [nodeId]: event } };
    }),
  load: (events) =>
    set((s) => {
      // Rust's list is the truth about which terminals run; for those, a newer live event wins.
      const activities: Record<string, AgentActivity> = {};
      for (const { nodeId, ...event } of events) {
        const held = s.activities[nodeId];
        activities[nodeId] = held && held.since > event.since ? held : event;
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
