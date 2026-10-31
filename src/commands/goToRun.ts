import { toast } from "sonner";
import { currentWaitingAgents, nextWaiting, type WaitingAgent } from "@/fleet/waitingAgents";
import { messages } from "@/i18n";
import { projectsStore } from "@/store/projects";
import { workspacesStore } from "@/store/workspaces";
import type { GoToItem } from "./goTo";
import { commandsMessages } from "./messages";
import { requestArrival, type PendingArrival } from "./pendingArrival";
import { reach } from "./reach";

/** Reaches a node or a group, switching to its workspace first if it is not on screen. */
function reachTarget(target: PendingArrival) {
  const workspaces = workspacesStore.getState();
  if (target.workspaceId !== workspaces.activeId) {
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

/** A click on the notification (spec notification §5). */
export function goToAgent(agent: WaitingAgent) {
  reachTarget({ workspaceId: agent.workspaceId, kind: agent.kind, id: agent.id, label: agent.name });
}

let lastReached: string | null = null;

/**
 * The next waiting agent (spec notification §6), after the last one reached
 * while it still waits: the keyboard of an orchestrator is not in the
 * context, so `currentId` alone would never get past one.
 */
export function goToNextWaiting(currentId: string | null) {
  const agents = currentWaitingAgents();
  const next = nextWaiting(agents, agents.some((a) => a.id === lastReached) ? lastReached : currentId);
  if (!next) return;
  lastReached = next.id;
  goToAgent(next);
}
