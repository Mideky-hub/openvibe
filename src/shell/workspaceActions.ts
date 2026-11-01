import { ask } from "@tauri-apps/plugin-dialog";
import { forgetWorkspaces } from "@/app/forget";
import { flushAll } from "@/lib/flush";
import { messages } from "@/i18n";
import { nodeNameOf, nodesStore } from "@/store/nodes";
import { isRunning } from "@/store/terminalStatus";
import { workspacesStore, type Workspace } from "@/store/workspaces";
import { shellMessages } from "./messages";

/** Deletes a workspace after confirmation, stopping its terminals (spec V1 §8.5): the tab's × and the palette. */
export async function removeWorkspace(workspace: Workspace, running: number) {
  const t = messages(shellMessages).removeWorkspace;
  // The agents it would stop, by name: a count alone does not say which work is lost.
  const names = Object.entries(nodesStore.getState().nodes)
    .filter(([id, node]) => node.workspaceId === workspace.id && isRunning(id))
    .map(([, node]) => nodeNameOf(node) || "Agent");
  const confirmed = await ask(t.confirm(workspace.name, running, names), {
    title: t.title,
    kind: "warning",
    okLabel: t.ok,
    cancelLabel: t.cancel,
  });
  if (!confirmed) return;
  // Pending saves are written first: once the row is gone they would fail.
  await flushAll();
  await workspacesStore.getState().remove(workspace.id);
  forgetWorkspaces([workspace.id]);
}
