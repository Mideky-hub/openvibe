let pending: { workspaceId: string; run: () => void } | null = null;
let onScreen: string | null = null;

/** Runs `run` once the scene of `workspaceId` is on screen, at once if it already is: only a scene can take a new node. */
export function whenSceneReady(workspaceId: string, run: () => void) {
  if (onScreen === workspaceId) run();
  else pending = { workspaceId, run };
}

export function sceneGone(workspaceId: string) {
  if (onScreen === workspaceId) onScreen = null;
}

export function sceneReady(workspaceId: string) {
  onScreen = workspaceId;
  if (pending?.workspaceId !== workspaceId) return;
  const { run } = pending;
  pending = null;
  run();
}
