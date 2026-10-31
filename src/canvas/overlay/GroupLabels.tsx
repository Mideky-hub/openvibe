import { useEffect, useRef } from "react";
import { renameGroup } from "@/fleet/groups";
import type { Activity } from "@/ipc/activity";
import { GroupMenu } from "@/fleet/GroupMenu";
import { countsText, waitingText } from "@/fleet/groupSummary";
import { screenRectOf } from "@/fleet/placement";
import { ROLES } from "@/fleet/roles";
import { useActivities } from "@/store/agentActivity";
import { uiStore, useUi } from "@/store/ui";
import { canvasStore, useCanvas, type CanvasView } from "../canvasStore";
import { groupBeingRenamed, isGroup, type SceneGroup } from "../groups";
import { useMessages } from "@/i18n";
import { canvasMessages } from "../messages";

/** The label sits on the frame's top edge, 16 px from its corner, like a tab (spec §11.4). */
const LABEL_INSET = 16;
const LABEL_HEIGHT = 24;

/**
 * Group labels, above the canvas. Excalidraw's own frame name stays below as
 * the handle that selects, drags and renames the frame: excalidraw.css gives
 * it the label's font and place, and it is made transparent here.
 *
 * `.excalidraw` makes no stacking context, so its layers compete with ours:
 * at z-index 3, placed before Excalidraw in the DOM, the labels cover frame
 * names and nodes (2) but stay under its text editor (3) and its panels (4).
 */
export function GroupLabels() {
  const frames = useCanvas((s) => s.frames);
  const view = useCanvas((s) => s.view);
  const activities = useActivities();
  // An activity ends with its process (`pty-exit`): stopped members never count.
  const members = (group: SceneGroup, activity: Activity) =>
    group.memberIds.filter((id) => activities[id]?.activity === activity).length;
  const groups = frames.filter(isGroup);
  const renaming = useUi((s) => s.renamingGroup);
  const takeover = groupBeingRenamed(view.editingFrame, frames);

  // Double-click (or Enter) on a group's name opened Excalidraw's editor:
  // close it before anything is typed, and rename in the label instead.
  useEffect(() => {
    if (!takeover) return;
    canvasStore.getState().api?.updateScene({ appState: { editingFrame: null } });
    uiStore.getState().setRenamingGroup(takeover);
  }, [takeover]);

  return (
    <div className="pointer-events-none absolute inset-0 z-[3] overflow-hidden">
      <style>{groups.map((g) => `.excalidraw [id$="-frame-name-${g.id}"]{color:transparent!important}`).join("\n")}</style>
      {groups.map((group) =>
        group.id === view.editingFrame ? null : (
          <GroupLabel
            key={group.id}
            group={group}
            view={view}
            renaming={group.id === renaming}
            working={members(group, "working")}
            waiting={members(group, "waiting")}
          />
        ),
      )}
    </div>
  );
}

function GroupLabel(props: { group: SceneGroup; view: CanvasView; working: number; waiting: number; renaming: boolean }) {
  const { group, view, working, waiting, renaming } = props;
  const waits = waitingText(waiting);
  const rect = screenRectOf(group, view);
  const { role: roleId, speciality } = group.group;
  const role = ROLES[roleId];
  return (
    <div
      className="absolute flex items-center rounded-t-lg border border-b-0 bg-ov-surface pr-1.5 text-[11px] whitespace-nowrap"
      style={{
        // One pixel left so the name lines up with the native one under it, despite the border.
        left: rect.x + LABEL_INSET - 1,
        top: rect.y - LABEL_HEIGHT,
        height: LABEL_HEIGHT,
        borderColor: `color-mix(in srgb, ${role.color} 60%, transparent)`,
      }}
    >
      <span className="grid w-7 shrink-0 place-items-center">
        <span className="size-1.5 rounded-full" style={{ backgroundColor: role.color }} />
      </span>
      {renaming ? (
        <NameField name={group.name} onDone={(name) => name !== null && renameGroup(group.id, name)} />
      ) : (
        <span className="font-semibold tracking-[0.08em] text-ov-text uppercase">{group.name}</span>
      )}
      {speciality && (
        <span title={speciality} className="pointer-events-auto ml-2 max-w-40 truncate text-ov-text-2">
          {speciality}
        </span>
      )}
      <span className="ml-2 font-mono text-ov-text-2">{countsText(group.memberIds.length, working)}</span>
      {waits && <span className="ml-1 font-mono text-ov-waiting">{waits}</span>}
      <GroupMenu groupId={group.id} />
    </div>
  );
}

/** The group's name, edited in place: Enter or a click elsewhere keeps it, Escape cancels. */
function NameField({ name, onDone }: { name: string; onDone: (name: string | null) => void }) {
  const t = useMessages(canvasMessages);
  // Removing the focused field may fire one last blur: only the first ending counts.
  const done = useRef(false);
  const finish = (value: string | null) => {
    if (done.current) return;
    done.current = true;
    uiStore.getState().setRenamingGroup(null);
    onDone(value);
  };
  return (
    <input
      autoFocus
      defaultValue={name}
      aria-label={t.groupNameLabel}
      size={Math.max(4, name.length + 1)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={(e) => finish(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") finish(null);
      }}
      className="pointer-events-auto rounded bg-ov-card px-1 font-semibold tracking-[0.08em] text-ov-text uppercase outline-none ring-1 ring-ov-accent"
    />
  );
}
