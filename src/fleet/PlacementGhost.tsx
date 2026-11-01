import { useEffect, useState } from "react";
import { toast } from "sonner";
import { canvasStore, useCanvas } from "@/canvas/canvasStore";
import { groupAt } from "@/canvas/groups";
import { messages, useMessages } from "@/i18n";
import { TOP_ROW_HEIGHT } from "@/shell/layout";
import { uiStore, useUi } from "@/store/ui";
import { workspacesStore } from "@/store/workspaces";
import { fleetMessages } from "./messages";
import { freeCell } from "./groupLayout";
import { launchAgent } from "./launchAgent";
import { addOrchestrator } from "./orchestrators";
import { clientRectOf, ghostRect, sceneOf } from "./placement";
import type { Point } from "./terminals";

/** Dashed outline that follows the pointer until a click places the agent (spec habillage §10.1). */
export function PlacementGhost() {
  const t = useMessages(fleetMessages);
  const placing = useUi((s) => s.placing);
  const view = useCanvas((s) => s.view);
  const frames = useCanvas((s) => s.frames);
  const [pointer, setPointer] = useState<Point | null>(null);

  useEffect(() => {
    if (!placing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") uiStore.getState().setPlacing(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [placing]);

  if (!placing) return null;
  // Over a group the ghost shows the cell the agent will take (spec §10.1, §11.3).
  const orchestrator = "orchestrator" in placing;
  // An orchestrator is placed freely; an agent over a group takes the group's next cell.
  const group = pointer && !orchestrator ? groupAt(frames, sceneOf(pointer, view)) : null;
  const members = group ? (canvasStore.getState().api?.getSceneElements().filter((e) => e.frameId === group.id) ?? []) : [];
  const rect = group ? clientRectOf(freeCell(group, members).cell, view) : pointer ? ghostRect(pointer, view.zoom, orchestrator ? "orchestrator" : "terminal") : null;

  return (
    <div
      // Starts under the bars: the title bar's buttons and drag area keep working while placing or linking.
      className="fixed inset-x-0 bottom-0 z-40 cursor-crosshair"
      style={{ top: TOP_ROW_HEIGHT }}
      onPointerMove={(e) => setPointer({ x: e.clientX, y: e.clientY })}
      onContextMenu={(e) => {
        e.preventDefault();
        uiStore.getState().setPlacing(null);
      }}
      onClick={(e) => {
        uiStore.getState().setPlacing(null);
        const center = sceneOf({ x: e.clientX, y: e.clientY }, canvasStore.getState().view);
        const workspaceId = workspacesStore.getState().activeId;
        const placed =
          "orchestrator" in placing
            ? workspaceId
              ? addOrchestrator(workspaceId, center)
              : Promise.resolve()
            : launchAgent(placing.agent, placing.options, center);
        void placed.catch((error: unknown) => toast.error(messages(fleetMessages).launchFailed(String(error))));
      }}
    >
      {rect && (
        <div className="pointer-events-none fixed rounded-xl border-2 border-dashed border-ov-accent/80 bg-ov-accent/5" style={rect} />
      )}
      <div
        className="ov-glass-strong pointer-events-none fixed left-1/2 -translate-x-1/2 rounded-[10px] px-3 py-1 text-xs text-ov-text-2"
        style={{ top: TOP_ROW_HEIGHT + 14 }}
      >
        {group ? t.placement.addToGroup(group.name) : orchestrator ? t.placement.placeOrchestrator : t.placement.placeAgent}
      </div>
    </div>
  );
}
