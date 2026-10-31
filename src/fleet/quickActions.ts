import { toast } from "sonner";
import { canvasStore } from "@/canvas/canvasStore";
import { returnKeyboardToCanvas } from "@/canvas/keyboardFocus";
import { nextGroupName } from "@/canvas/groups";
import { messages } from "@/i18n";
import type { AgentId } from "@/ipc/pty";
import { workspacesStore } from "@/store/workspaces";
import { agentsStore } from "./agentsStore";
import { defaultAgent } from "./catalog";
import { launchGroup } from "./groups";
import { defaultLaunchOptions, launchAgent } from "./launchAgent";
import { fleetMessages } from "./messages";
import { addOrchestrator } from "./orchestrators";
import { viewportCenter } from "./placement";
import type { Point } from "./terminals";

const reportLaunchError = (error: unknown) => toast.error(messages(fleetMessages).launchFailed(String(error)));

/** An agent at `at`, else at the center of the view, in the group under it if any (spec habillage §11.3, spec menu radial §4.1). */
export function launchAt(agent: AgentId, at?: Point) {
  const center = at ?? viewportCenter(canvasStore.getState().view);
  void launchAgent(agent, defaultLaunchOptions(), center).catch(reportLaunchError);
}

/** "Nouvelle console": the default agent (spec habillage §5.6). */
export function newConsole(at?: Point) {
  launchAt(defaultAgent(agentsStore.getState().agents), at);
}

/** "Lancer 4 agents": a Général group of four default agents (spec habillage §11.3). */
export function launchFour(at?: Point) {
  const agent = defaultAgent(agentsStore.getState().agents);
  const name = nextGroupName(canvasStore.getState().frames);
  void launchGroup({ name, role: "general", agents: [agent, agent, agent, agent] }, defaultLaunchOptions(), at).catch(reportLaunchError);
  returnKeyboardToCanvas();
}

/** « Orchestrateur »: at `at`, else at the center of the view, like a launch (plan F2, décision 3). */
export function placeOrchestrator(at?: Point) {
  const workspaceId = workspacesStore.getState().activeId;
  if (!workspaceId) return;
  void addOrchestrator(workspaceId, at ?? viewportCenter(canvasStore.getState().view)).catch(reportLaunchError);
}
