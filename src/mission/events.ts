import { messages } from "@/i18n";
import { ptySendText } from "@/ipc/pty";
import { agentMessages } from "@/mcp/messages";
import { freshText, quietFor, typedAgo } from "@/nodes/terminal/registry";
import { agentActivityStore } from "@/store/agentActivity";
import { nodesStore } from "@/store/nodes";
import { isRunning, terminalStatusStore } from "@/store/terminalStatus";
import { whenReady } from "./ready";
import { memberOf } from "./store";

/** Lines waiting for their orchestrator to be free. */
const queues = new Map<string, { line: string; typed?: () => void }[]>();
/** Orchestrators just (re)started whose Claude's prompt is not up yet (final review H2). */
const starting = new Set<string>();

/** A line waits this long after the user's last keystroke: it would be typed into their half-written text. */
export const TYPING_PAUSE_MS = 4000;

/** An orchestrator takes a line while its Claude's prompt is up and no dialog waits for the user (spec §7.5). */
function free(orchestratorId: string): boolean {
  return (
    isRunning(orchestratorId) &&
    !starting.has(orchestratorId) &&
    agentActivityStore.getState().activities[orchestratorId]?.activity !== "waiting"
  );
}

function flush(orchestratorId: string) {
  const queue = queues.get(orchestratorId);
  if (!queue?.length || !free(orchestratorId)) return;
  const sinceKey = typedAgo(orchestratorId);
  if (sinceKey < TYPING_PAUSE_MS) {
    // Looked at again when the pause is over.
    setTimeout(() => flush(orchestratorId), TYPING_PAUSE_MS - sinceKey + 50);
    return;
  }
  queues.delete(orchestratorId);
  // ptySendText keeps a node's writes in order; Claude queues what comes while it works.
  for (const entry of queue) {
    void ptySendText(orchestratorId, `[OpenVibe] ${entry.line}`).then(
      () => entry.typed?.(),
      () => {
        // Not typed (its session ended meanwhile): back in line for its next start.
        queues.set(orchestratorId, [...(queues.get(orchestratorId) ?? []), entry]);
      },
    );
  }
}

/** Holds an orchestrator's lines from its start until its Claude's prompt is up; its trust prompt is the user's. */
function awaitPrompt(orchestratorId: string) {
  if (starting.has(orchestratorId)) return;
  starting.add(orchestratorId);
  const probe = {
    running: () => isRunning(orchestratorId),
    quietMs: () => quietFor(orchestratorId),
    screen: () => freshText(orchestratorId, 50),
    press: () => Promise.resolve(),
  };
  void (async () => {
    while (isRunning(orchestratorId) && !(await whenReady(probe, undefined, false)));
    starting.delete(orchestratorId);
    flush(orchestratorId);
  })();
}

/** Types `line` in the orchestrator's terminal, now or as soon as it is free; `typed` runs once it has been. */
export function notify(orchestratorId: string, line: string, typed?: () => void) {
  queues.set(orchestratorId, [...(queues.get(orchestratorId) ?? []), { line, typed }]);
  flush(orchestratorId);
}

export function pendingEvents(orchestratorId: string): readonly string[] {
  return (queues.get(orchestratorId) ?? []).map((entry) => entry.line);
}

/** Watches the members of running missions, and frees held lines when an orchestrator is free again. */
export function installMissionEvents(): () => void {
  const flushAll = () => [...queues.keys()].forEach(flush);
  const offActivity = agentActivityStore.subscribe((state, previous) => {
    for (const [nodeId, now] of Object.entries(state.activities)) {
      if (now.activity !== "waiting" || previous.activities[nodeId]?.activity === "waiting") continue;
      const found = memberOf(nodeId);
      if (found) notify(found.orchestratorId, messages(agentMessages).lines.waiting(found.member.name));
    }
    flushAll();
  });
  const offStatus = terminalStatusStore.subscribe((state, previous) => {
    // A terminal removed from the canvas leaves the statuses: it stopped too.
    for (const nodeId of new Set([...Object.keys(previous.statuses), ...Object.keys(state.statuses)])) {
      const started = previous.statuses[nodeId]?.state !== "running" && state.statuses[nodeId]?.state === "running";
      if (started && nodesStore.getState().nodes[nodeId]?.kind === "orchestrator") awaitPrompt(nodeId);
      if (previous.statuses[nodeId]?.state !== "running" || state.statuses[nodeId]?.state === "running") continue;
      const found = memberOf(nodeId);
      if (found) notify(found.orchestratorId, messages(agentMessages).lines.stopped(found.member.name));
    }
    flushAll();
  });
  return () => {
    offActivity();
    offStatus();
  };
}
