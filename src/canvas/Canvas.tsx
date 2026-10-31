import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CaptureUpdateAction, Excalidraw, getSceneVersion, newElementWith } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import { toast } from "sonner";
import { useTheme } from "@/app/theme";
import { completeArrival } from "@/commands/pendingArrival";
import { assignMissingNames } from "@/fleet/naming";
import { dismissResumeOffer, offerResumeAll } from "@/fleet/ResumeAllToast";
import { adoptCopies } from "@/fleet/terminals";
import { orchestratorLinks, unmarkedWires } from "@/fleet/wires";
import { saveFiles, saveScene } from "@/ipc/db";
import { onFlushAll } from "@/lib/flush";
import { NodeHost } from "@/nodes/NodeHost";
import { setOrchestratorClosed } from "@/mission/store";
import { disposeTerminal, focusTerminal } from "@/nodes/terminal/registry";
import { nodesStore } from "@/store/nodes";
import { isRunning } from "@/store/terminalStatus";
import { uiStore } from "@/store/ui";
import { createActivationTracker } from "./activation";
import { canvasStore, fullSizeView, viewFrom } from "./canvasStore";
import { framesFromScene } from "./groups";
import { isOpenVibeLink } from "./nodeElement";
import { classifyAddedNodes } from "./nodeCopies";
import { createRemovalGuard, type RemovalVerdict } from "./removalGuard";
import { DotGrid } from "./overlay/DotGrid";
import { GroupBackdrops } from "./overlay/GroupBackdrops";
import { GroupLabels } from "./overlay/GroupLabels";
import { StepTimelines } from "./overlay/StepTimelines";
import { loadScene, rememberScene, type LoadedScene } from "./sceneCache";
import { EXCALIDRAW_UI_OPTIONS, withSceneDefaults } from "./sceneDefaults";
import { sceneReady } from "./sceneReady";
import { createSceneSync, liveNodeIds, liveNodeRects } from "./sceneSync";
import { messages, useLang, useMessages } from "@/i18n";
import { canvasMessages, EXCALIDRAW_LANG } from "./messages";

const reportSaveError = (error: unknown) => toast.error(messages(canvasMessages).saveFailed(String(error)));

/** One Excalidraw instance per workspace; remounted (via `key`) when switching. */
export function Canvas({ workspaceId }: { workspaceId: string }) {
  const [scene, setScene] = useState<LoadedScene | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = useMessages(canvasMessages);

  useEffect(() => {
    let alive = true;
    loadScene(workspaceId).then(
      (loaded) => alive && setScene(loaded),
      (failure: unknown) => alive && setError(String(failure)),
    );
    return () => {
      alive = false;
    };
  }, [workspaceId]);

  if (error) return <Centered>{t.loadFailed(error)}</Centered>;
  if (!scene) return <Centered>{t.loading}</Centered>;
  return <LoadedCanvas workspaceId={workspaceId} scene={scene} />;
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="absolute inset-0 grid place-items-center text-sm text-ov-text-2">{children}</div>;
}

function LoadedCanvas({ workspaceId, scene }: { workspaceId: string; scene: LoadedScene }) {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const theme = useTheme();
  const lang = useLang();
  const initialData = useMemo(() => withSceneDefaults(scene.initialData), [scene]);
  // A running agent never leaves unasked (retours J8b); sceneSync tells which nodes left.
  const guardRemovals = useMemo(() => createRemovalGuard(isRunning, scene.initialData.elements ?? []), [scene]);
  const removedNow = useRef<string[]>([]);

  // The shell (rails, zoom, panels) drives the Excalidraw instance on screen.
  useEffect(() => {
    canvasStore.getState().setApi(api);
    return () => {
      if (canvasStore.getState().api === api) canvasStore.getState().setApi(null);
    };
  }, [api]);

  // A Ctrl+P target of this workspace waits for its scene to be on screen (spec fenêtre §7.2).
  useEffect(() => {
    if (!api) return;
    const frame = requestAnimationFrame(() => {
      completeArrival(workspaceId);
      sceneReady(workspaceId);
    });
    return () => cancelAnimationFrame(frame);
  }, [api, workspaceId]);

  // The next workspace must not show this one's groups before its first change.
  useEffect(
    () => () => {
      canvasStore.getState().setFrames([]);
      canvasStore.getState().setNodeIds([]);
      canvasStore.getState().setNodeRects({});
      canvasStore.getState().setLinks({});
    },
    [],
  );

  const sync = useMemo(
    () =>
      createSceneSync(
        { elements: scene.initialData.elements ?? [], savedFileIds: scene.savedFileIds },
        {
          saveScene: (elementsJson, appStateJson, nodeIds) => saveScene(workspaceId, elementsJson, appStateJson, nodeIds),
          saveFiles: (files) => saveFiles(workspaceId, files),
          onSceneChanged: (elements, appState, files, savedFileIds) =>
            rememberScene(workspaceId, elements, appState, files, savedFileIds),
          // An undo can bring back a node whose row the last scene save purged.
          onNodesAdded: (ids) => {
            const elements = canvasStore.getState().api?.getSceneElementsIncludingDeleted() ?? [];
            const added = classifyAddedNodes(ids, elements, (id) => id in nodesStore.getState().nodes);
            // An undo can bring back a node whose row the last scene save purged.
            added.restored.forEach((id) => void nodesStore.getState().persist(id).catch(reportSaveError));
            // A closed orchestrator brought back takes its mission up again (spec première version §5.4).
            added.restored.forEach((id) => setOrchestratorClosed(id, false));
            if (added.copies.length) void adoptCopies(workspaceId, added.copies).catch(reportSaveError);
          },
          onNodesRemoved: (ids) => {
            removedNow.current = ids;
          },
        },
      ),
    [workspaceId, scene],
  );

  useEffect(() => {
    const unregister = onFlushAll(() => sync.flush());
    return () => {
      unregister();
      void sync.flush()?.catch(reportSaveError);
    };
  }, [sync]);

  // Terminals saved before plan A have no name yet (spec habillage §9.2).
  useEffect(() => {
    void assignMissingNames(workspaceId, liveNodeIds(scene.initialData.elements ?? [])).catch(reportSaveError);
  }, [workspaceId, scene]);

  // After the scene is shown, restored terminals have their status.
  useEffect(() => {
    const timer = setTimeout(() => offerResumeAll(workspaceId), 800);
    return () => {
      clearTimeout(timer);
      dismissResumeOffer(workspaceId);
    };
  }, [workspaceId]);

  const trackActivation = useMemo(() => createActivationTracker(), []);

  const onChange = useCallback(
    (elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
      sync.onChange(elements, appState, files, getSceneVersion(elements));
      const verdict = guardRemovals(elements, removedNow.current);
      removedNow.current = [];
      settleRemovals(verdict);
      canvasStore.getState().setView(viewFrom(appState));
      canvasStore.getState().setFrames(framesFromScene(elements));
      canvasStore.getState().setNodeIds(liveNodeIds(elements));
      canvasStore.getState().setNodeRects(liveNodeRects(elements));
      canvasStore.getState().setLinks(orchestratorLinks(elements));
      const unmarked = unmarkedWires(elements);
      if (unmarked.length > 0 && api) requestAnimationFrame(() => markWires(api, unmarked));
      const activated = trackActivation(appState.activeEmbeddable);
      // Deferred: changing the view from inside onChange would re-enter it.
      if (activated && api) requestAnimationFrame(() => showAtFullSize(api, activated));
    },
    [sync, guardRemovals, trackActivation, api],
  );

  return (
    <div className="absolute inset-0">
      <DotGrid />
      <GroupBackdrops />
      <GroupLabels />
      <StepTimelines />
      <div className="absolute inset-0">
        <Excalidraw
          theme={theme}
          langCode={EXCALIDRAW_LANG[lang]}
          excalidrawAPI={setApi}
          initialData={initialData}
          onChange={onChange}
          UIOptions={EXCALIDRAW_UI_OPTIONS}
          validateEmbeddable={isOpenVibeLink}
          renderEmbeddable={(element) => <NodeHost element={element} />}
        />
      </div>
    </div>
  );
}

/**
 * Spec §6.3: an activated terminal is shown at 100 %, where xterm text is sharp
 * and mouse selection lines up; the view is only moved when it was zoomed.
 */
function showAtFullSize(api: ExcalidrawImperativeAPI, nodeId: string) {
  focusTerminal(nodeId);
  if (api.getAppState().zoom.value === 1) return;
  const element = api.getSceneElements().find((e) => e.id === nodeId);
  if (!element) return;
  api.updateScene({ appState: fullSizeView(element, api.getAppState()) });
}

/**
 * Frees the terminals that may go; puts back the running agents that left
 * unasked, as they were and outside the undo history, then asks (retours J8b).
 */
function settleRemovals({ dispose, restore, ask }: RemovalVerdict) {
  for (const id of dispose) {
    if (nodesStore.getState().nodes[id]?.kind === "orchestrator") setOrchestratorClosed(id, true);
    disposeTerminal(id);
  }
  if (restore.length === 0) return;
  // Deferred: changing the scene from inside onChange would re-enter it.
  requestAnimationFrame(() => {
    const api = canvasStore.getState().api;
    if (!api) return;
    const current = api.getSceneElementsIncludingDeleted();
    const now = new Map(current.map((e) => [e.id, e]));
    // The earlier state, its version above the one it replaces.
    const back = new Map(restore.map((e) => [e.id, { ...newElementWith(e, {}, true), version: Math.max(e.version, now.get(e.id)?.version ?? 0) + 1 }]));
    api.updateScene({
      elements: [...current.map((e) => back.get(e.id) ?? e), ...restore.filter((e) => !now.has(e.id)).map((e) => back.get(e.id)!)],
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    if (ask && "group" in ask) uiStore.getState().setClosingGroup(ask.group);
    else if (ask) uiStore.getState().setClosing(ask);
  });
}

/** Hand-drawn wires get their mark, outside the undo history (spec habillage §13). */
function markWires(api: ExcalidrawImperativeAPI, ids: readonly string[]) {
  const marked = new Set(ids);
  api.updateScene({
    elements: api
      .getSceneElementsIncludingDeleted()
      .map((e) => (marked.has(e.id) ? newElementWith(e, { customData: { ...e.customData, openvibe: { kind: "wire" } } }) : e)),
    captureUpdate: CaptureUpdateAction.NEVER,
  });
}
