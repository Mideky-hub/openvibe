import { createStore, useStore } from "zustand";
import type { Activity, ActivityEvent } from "@/ipc/activity";

export interface AgentActivity {
  activity: Activity;
  since: number;
  message?: string;
  seq?: number;
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

/**
 * An event older than the one held arrived out of order (two Rust threads emit after releasing their lock)
 * or is a startup snapshot overtaken by a live event. Rust numbers its changes; without numbers, `since`
 * dates them, on a wall clock that can go back.
 */
function stale(held: AgentActivity, event: AgentActivity): boolean {
  if (held.seq !== undefined && event.seq !== undefined) return event.seq < held.seq;
  return !sameWait(held, event) && held.since > event.since;
}

/** The event, keeping the place of an agent that still waits. */
function newer(held: AgentActivity | undefined, event: AgentActivity): AgentActivity {
  return held && sameWait(held, event) ? { ...event, since: held.since } : event;
}

export const agentActivityStore = createStore<AgentActivityState>()((set) => ({
  activities: {},
  apply: ({ nodeId, ...event }) =>
    set((s) => {
      const held = s.activities[nodeId];
      return held && stale(held, event) ? s : { activities: { ...s.activities, [nodeId]: newer(held, event) } };
    }),
  load: (events) =>
    set((s) => {
      // Rust's list is the truth about which terminals run; for those, a newer live event wins.
      const activities: Record<string, AgentActivity> = {};
      for (const { nodeId, ...event } of events) {
        const held = s.activities[nodeId];
        activities[nodeId] = held && stale(held, event) ? held : newer(held, event);
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
