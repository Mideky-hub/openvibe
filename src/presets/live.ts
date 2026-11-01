import { CaptureUpdateAction, newElementWith } from "@excalidraw/excalidraw";
import { ZONE_OFFSETS } from "@/canvas/canvasFocus";
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

const FRAME_WAIT_MS = 2000;

/** The team of the workspace on screen as a preset; `noCanvas` when none is mounted, null without a group of agents. */
export function captureCurrentTeam(name: string): TeamPreset | "noCanvas" | null {
  const { api, frames, links } = canvasStore.getState();
  if (!api) return "noCanvas";
  const nodes = nodesStore.getState().nodes;
  const orchestrators = api.getSceneElements()
    .filter((e) => nodeKindOf(e) === "orchestrator")
    .map((e) => ({ id: e.id, name: readOrchestratorPayload(nodes[e.id]?.payload).name }));
  return capturePreset({ frames, agentOf: (id) => terminalOf(nodes[id])?.agent, orchestrators, links }, name, crypto.randomUUID(), Date.now());
}

/** The canvas tells its frames after React's commit: what follows a group needs it known. */
function frameKnown(frameId: string): Promise<void> {
  const known = () => canvasStore.getState().frames.some((f) => f.id === frameId);
  if (known()) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      stop();
      resolve();
    };
    const timer = setTimeout(done, FRAME_WAIT_MS);
    const stop = canvasStore.subscribe(() => {
      if (known()) done();
    });
  });
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
    launchGroup: async (plan, at) => {
      const made = await launchGroup(plan, defaultLaunchOptions(), at);
      if (made) await frameKnown(made.frameId);
      return made;
    },
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
    fit: (ids) => {
      const scene = canvasStore.getState().api;
      const targets = scene?.getSceneElements().filter((e) => ids.includes(e.id) || (e.frameId !== null && ids.includes(e.frameId)));
      if (scene && targets && targets.length > 0) {
        scene.scrollToContent(targets, { fitToViewport: true, viewportZoomFactor: 0.9, animate: true, canvasOffsets: ZONE_OFFSETS });
      }
    },
  };
}
