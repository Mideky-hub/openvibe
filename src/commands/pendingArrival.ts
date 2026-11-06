import { toast } from "sonner";
import { messages } from "@/i18n";
import { projectsStore } from "@/store/projects";
import { workspacesStore } from "@/store/workspaces";
import { commandsMessages } from "./messages";
import { reach, type ReachKind } from "./reach";

export interface PendingArrival {
  workspaceId: string;
  kind: ReachKind;
  id: string;
  /** For the message when it is gone. */
  label: string;
}

let pending: PendingArrival | null = null;
let stopWatching: (() => void) | null = null;

function drop() {
  pending = null;
  stopWatching?.();
  stopWatching = null;
}

/**
 * An item of another workspace: reached once that workspace's scene is on
 * screen (spec fenêtre §7.2). The user may move on before: another tab, the
 * home screen or another project abandons it, or it would fire on a later
 * visit.
 */
export function requestArrival(target: PendingArrival) {
  drop();
  pending = target;
  const offWorkspaces = workspacesStore.subscribe((s, previous) => {
    const elsewhere = s.activeId !== previous.activeId && s.activeId !== null && s.activeId !== target.workspaceId;
    if (elsewhere || s.projectId !== previous.projectId) drop();
  });
  const offProjects = projectsStore.subscribe((s, previous) => {
    if (s.view !== previous.view || s.activeId !== previous.activeId) drop();
  });
  stopWatching = () => {
    offWorkspaces();
    offProjects();
  };
}

/** An arrival still waits for the scene of `workspaceId`, which may already be the active workspace. */
export function arrivalPending(workspaceId: string): boolean {
  return pending?.workspaceId === workspaceId;
}

/** Reaches the pending item of `workspaceId`, now on screen; says so when it is gone (spec fenêtre §9). */
export function completeArrival(workspaceId: string) {
  if (!pending) return;
  const target = pending;
  drop();
  // Another workspace came first: the user went elsewhere, the arrival is abandoned.
  if (target.workspaceId !== workspaceId) return;
  if (!reach(target.kind, target.id)) toast.error(messages(commandsMessages).goTo.gone(target.label));
}
