import { toast } from "sonner";
import { whenSceneReady } from "@/canvas/sceneReady";
import { installAgent } from "@/fleet/installAgent";
import { messages } from "@/i18n";
import type { AgentId } from "@/ipc/pty";
import { projectsStore, recentProject } from "@/store/projects";
import { isCode, workspacesStore } from "@/store/workspaces";
import { addProject } from "./addProject";
import { homeMessages } from "./messages";

/**
 * An install asked from the home screen: a terminal lives on a canvas, so the
 * last project opens first, or a new one is added (spec installation §4.2).
 */
export async function installFromHome(agent: AgentId) {
  const projects = projectsStore.getState();
  const project = recentProject(projects.projects);
  try {
    if (project) await projects.open(project.id);
    else await addProject();
  } catch (error) {
    toast.error(messages(homeMessages).noAgent.openFailed(String(error)));
    return;
  }
  const { workspaces, activeId, select } = workspacesStore.getState();
  // A project left on its code workspace reopens there, and that one has no scene to wait for.
  const onCode = isCode(workspaces.find((w) => w.id === activeId));
  const workspaceId = onCode ? workspaces.find((w) => !isCode(w))?.id : activeId;
  if (projectsStore.getState().view !== "project" || !workspaceId) return;
  if (onCode) select(workspaceId);
  whenSceneReady(workspaceId, () => void installAgent(agent));
}
