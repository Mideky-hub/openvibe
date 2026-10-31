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

/**
 * How far apart Rust's dates of one transition can fall: it converts the same
 * instant to the wall clock again for each event, which moves it a few ms.
 */
const SAME_WAIT_MS = 50;

/**
 * A new question during a wait is no transition: it only replaces the message
 * and the agent keeps its place. A later wait stays a transition, or an older
 * event could pass for newer than the `since` kept.
 */
function sameWait(held: AgentActivity, event: AgentActivity): boolean {
  return held.activity === "waiting" && event.activity === "waiting" && Math.abs(held.since - event.since) <= SAME_WAIT_MS;
}

export const agentActivityStore = createStore<AgentActivityState>()((set) => ({
  activities: {},
  // `since` dates each transition: an event older than the one held arrived out of order (two Rust threads
  // emit after releasing their lock) or is a startup snapshot overtaken by a live event, and is dropped.
  apply: ({ nodeId, ...event }) =>
    set((s) => {
      const held = s.activities[nodeId];
      if (held && sameWait(held, event)) return { activities: { ...s.activities, [nodeId]: { ...event, since: held.since } } };
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
