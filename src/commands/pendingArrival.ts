import { toast } from "sonner";
import { messages } from "@/i18n";
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

/** An item of another workspace: reached once that workspace's scene is on screen (spec fenêtre §7.2). */
export function requestArrival(target: PendingArrival) {
  pending = target;
}

/** Reaches the pending item of `workspaceId`, now on screen; says so when it is gone (spec fenêtre §9). */
export function completeArrival(workspaceId: string) {
  if (!pending) return;
  // Another workspace came first: the user went elsewhere, the arrival is abandoned.
  if (pending.workspaceId !== workspaceId) {
    pending = null;
    return;
  }
  const target = pending;
  pending = null;
  if (!reach(target.kind, target.id)) toast.error(messages(commandsMessages).goTo.gone(target.label));
}
