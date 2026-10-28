import { removeWorkspace } from "@/shell/workspaceActions";
import { nodesStore } from "@/store/nodes";
import { countRunning } from "@/store/running";
import { terminalStatusStore } from "@/store/terminalStatus";
import { canRemove, workspacesStore } from "@/store/workspaces";
import { openCodeWorkspace } from "@/studio/navigate";
import type { Command } from "../command";
import { requestUi } from "../uiRequests";
import { command, sectionNamed } from "./define";
import { inProject } from "./navigation";

const section = sectionNamed((s) => s.workspaces);

const onScreen = () => {
  const { workspaces, activeId } = workspacesStore.getState();
  return workspaces.find((w) => w.id === activeId);
};

export const WORKSPACES: readonly Command[] = [
  command("workspace.new", {
    section,
    available: inProject,
    run: async () => {
      await workspacesStore.getState().create();
    },
  }),
  command("workspace.code", {
    section,
    available: inProject,
    run: openCodeWorkspace,
  }),
  command("workspace.rename", {
    section,
    available: inProject,
    run: (ctx) => {
      if (ctx.workspaceId) requestUi({ kind: "renameWorkspace", id: ctx.workspaceId });
    },
  }),
  command("workspace.delete", {
    section,
    // Never the last one (spec fenêtre §7.3), like the tab's ×.
    available: (ctx) => {
      const workspace = onScreen();
      return ctx.project && !!workspace && canRemove(workspacesStore.getState().workspaces, workspace);
    },
    run: async () => {
      const workspace = onScreen();
      if (!workspace) return;
      const running = countRunning(nodesStore.getState().nodes, terminalStatusStore.getState().statuses, [workspace.id]);
      await removeWorkspace(workspace, running);
    },
  }),
];
