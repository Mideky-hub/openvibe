import { CaptureUpdateAction, newElementWith } from "@excalidraw/excalidraw";
import { canvasStore } from "@/canvas/canvasStore";
import { withGroupSpeciality } from "@/canvas/groups";
import { nodeKindOf } from "@/canvas/nodeElement";
import { agentsStore } from "@/fleet/agentsStore";
import { defaultAgent } from "@/fleet/catalog";
import { launchGroup } from "@/fleet/groups";
import { defaultLaunchOptions } from "@/fleet/launchAgent";
import { linkOrchestrator, orchestrateGroup, renameOrchestrator } from "@/fleet/orchestrators";
import { viewportCenter } from "@/fleet/placement";
import { readOrchestratorPayload } from "@/nodes/types";
import { nodesStore, terminalOf } from "@/store/nodes";
import type { DeployDeps } from "./deploy";
import { capturePreset, type TeamPreset } from "./model";

/** The team of the workspace on screen as a preset; null without a group of agents. */
export function captureCurrentTeam(name: string): TeamPreset | null {
  const { api, frames, links } = canvasStore.getState();
  const nodes = nodesStore.getState().nodes;
  const orchestrators = (api?.getSceneElements() ?? [])
    .filter((e) => nodeKindOf(e) === "orchestrator")
    .map((e) => ({ id: e.id, name: readOrchestratorPayload(nodes[e.id]?.payload).name }));
  return capturePreset({ frames, agentOf: (id) => terminalOf(nodes[id])?.agent, orchestrators, links }, name, crypto.randomUUID(), Date.now());
}

/** The real functions of a deployment: the agents it starts are the user's choice (spec presets §3). */
export async function liveDeployDeps(): Promise<DeployDeps> {
  if (!agentsStore.getState().loaded) await agentsStore.getState().load().catch(() => undefined);
  const { agents } = agentsStore.getState();
  const { api, view } = canvasStore.getState();
  return {
    center: viewportCenter(view),
    obstacles: (api?.getSceneElements() ?? []).map(({ x, y, width, height }) => ({ x, y, width, height })),
    fallback: defaultAgent(agents),
    isAvailable: (agent) => agents.length === 0 || agents.some((a) => a.id === agent && a.available),
    launchGroup: (plan, at) => launchGroup(plan, defaultLaunchOptions(), at),
    setSpeciality: (frameId, speciality) => {
      const scene = canvasStore.getState().api;
      scene?.updateScene({
        elements: scene
          .getSceneElementsIncludingDeleted()
          .map((e) => (e.id === frameId ? newElementWith(e, { customData: withGroupSpeciality(e.customData, speciality) }) : e)),
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    },
    orchestrate: orchestrateGroup,
    link: linkOrchestrator,
    rename: renameOrchestrator,
  };
}
