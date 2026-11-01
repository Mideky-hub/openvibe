import { useStore } from "zustand";
import { sendToAgents } from "@/fleet/broadcast";
import { getSetting, setSetting } from "@/ipc/db";
import { freshText } from "@/nodes/terminal/registry";
import { agentActivityStore } from "@/store/agentActivity";
import { nodesStore, terminalOf } from "@/store/nodes";
import { acceptsInstruction } from "./engine";
import { createLoopsStore, LOOPS_KEY, type LoopsState } from "./store";

/**
 * The real loops store (spec boucles §4): its engine reads the application's
 * agents and sends through `sendToAgents`, which spares those that wait.
 */
export const loopsStore = createLoopsStore(
  {
    now: () => Date.now(),
    isLive: (id) => nodesStore.getState().nodes[id]?.kind === "terminal",
    activityOf: (id) => agentActivityStore.getState().activities[id]?.activity,
    screenOf: (id) => freshText(id, 40),
    canReceive: (id) => acceptsInstruction(terminalOf(nodesStore.getState().nodes[id])?.agent, freshText(id, 40)),
    send: async (ids, text) => {
      const { sent } = await sendToAgents(ids, text);
      return { sent };
    },
  },
  { read: () => getSetting<unknown>(LOOPS_KEY), write: (value) => setSetting(LOOPS_KEY, value) },
);

// The idle trigger hears each change of an agent's activity.
agentActivityStore.subscribe((state, previous) => {
  for (const [id, now] of Object.entries(state.activities)) {
    const before = previous.activities[id];
    if (before !== now) loopsStore.activity(id, now.activity, before?.activity);
  }
});

export function useLoops<T>(selector: (state: LoopsState) => T): T {
  return useStore(loopsStore, selector);
}
