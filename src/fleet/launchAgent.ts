import { canvasStore } from "@/canvas/canvasStore";
import { groupAt } from "@/canvas/groups";
import type { AgentId, OllamaLaunch, ShellKind } from "@/ipc/pty";
import { newTerminalPayload } from "@/nodes/terminal/launch";
import { projectsStore } from "@/store/projects";
import { workspacesStore } from "@/store/workspaces";
import { agentsStore } from "./agentsStore";
import { nameForNewAgent } from "./naming";
import { addTerminal, type Point } from "./terminals";

/** What the "Options" of the agent menu set for the next launches. */
export interface LaunchOptions {
  cwd: string;
  shell: ShellKind;
  title: string;
  command: string;
  ollama?: OllamaLaunch;
  oneShot?: boolean;
}

/** Agents start in the project folder, in the first available shell (spec habillage §6.1). */
export function defaultLaunchOptions(): LaunchOptions {
  const { projects, activeId } = projectsStore.getState();
  const cwd = projects.find((p) => p.id === activeId)?.path ?? "";
  return { cwd, shell: agentsStore.getState().shells[0] ?? "default", title: "", command: "" };
}

/**
 * Creates and starts an agent of the active workspace at `center` (scene
 * coordinates). Inside a group it takes the group's next free cell and a name
 * from the group's pantheon (spec habillage §10.1, §11.3).
 */
export async function launchAgent(agent: AgentId, options: LaunchOptions, center: Point): Promise<string | null> {
  const workspaceId = workspacesStore.getState().activeId;
  if (!workspaceId) return null;
  const group = groupAt(canvasStore.getState().frames, center);
  const name = await nameForNewAgent(workspaceId, group?.group.pantheon);
  return addTerminal(workspaceId, newTerminalPayload({ ...options, agent }, name), center, group?.id ?? null);
}
