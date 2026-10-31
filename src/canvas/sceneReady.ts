let pending: { workspaceId: string; run: () => void } | null = null;

/** Runs `run` once the scene of `workspaceId` is on screen: only a scene can take a new node. */
export function whenSceneReady(workspaceId: string, run: () => void) {
  pending = { workspaceId, run };
}

export function sceneReady(workspaceId: string) {
  if (pending?.workspaceId !== workspaceId) return;
  const { run } = pending;
  pending = null;
  run();
}
