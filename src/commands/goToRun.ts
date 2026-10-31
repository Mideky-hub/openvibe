import { toast } from "sonner";
import { currentWaitingAgents, nextWaiting, type WaitingAgent } from "@/fleet/waitingAgents";
import { messages } from "@/i18n";
import { projectsStore } from "@/store/projects";
import { workspacesStore } from "@/store/workspaces";
import type { GoToItem } from "./goTo";
import { commandsMessages } from "./messages";
import { arrivalPending, requestArrival, type PendingArrival } from "./pendingArrival";
import { reach } from "./reach";

/** Reaches a node or a group, switching to its workspace first if it is not on screen. */
function reachTarget(target: PendingArrival) {
  const workspaces = workspacesStore.getState();
  // A second click during the switch finds the workspace active but its scene not there yet.
  if (target.workspaceId !== workspaces.activeId || arrivalPending(target.workspaceId)) {
    requestArrival(target);
    workspaces.select(target.workspaceId);
    return;
  }
  if (!reach(target.kind, target.id)) toast.error(messages(commandsMessages).goTo.gone(target.label));
}

/** Entrée on a line of « Aller à » (spec fenêtre §7.2). */
export function goTo(item: GoToItem) {
  switch (item.kind) {
    case "workspace":
      if (item.workspaceId) workspacesStore.getState().select(item.workspaceId);
      return;
    case "project":
      if (item.projectId) {
        void projectsStore
          .getState()
          .open(item.projectId)
          .catch((error: unknown) => toast.error(messages(commandsMessages).goTo.openFailed(String(error))));
      }
      return;
    default:
      if (item.workspaceId && item.targetId) reachTarget({ workspaceId: item.workspaceId, kind: item.kind, id: item.targetId, label: item.label });
  }
}

let lastReached: string | null = null;

/** A click on the notification (spec notification §5). */
export function goToAgent(agent: WaitingAgent) {
  lastReached = agent.id;
  reachTarget({ workspaceId: agent.workspaceId, kind: agent.kind, id: agent.id, label: agent.name });
}

/**
 * The next waiting agent (spec notification §6), after the current node. The
 * keyboard of an orchestrator is not in the context, which keeps naming the
 * last terminal: an orchestrator just reached counts as the current node, or
 * the command would never get past it.
 */
export function goToNextWaiting(currentId: string | null) {
  const agents = currentWaitingAgents();
  const reached = agents.find((a) => a.id === lastReached);
  const next = nextWaiting(agents, reached?.kind === "orchestrator" ? reached.id : currentId);
  if (next) goToAgent(next);
}
