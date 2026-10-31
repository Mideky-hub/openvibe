import { useEffect, useRef } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { renameGroup, setGroupFolded } from "@/fleet/groups";
import { GroupMenu } from "@/fleet/GroupMenu";
import { countsText, membersIn, waitingText } from "@/fleet/groupSummary";
import { screenRectOf } from "@/fleet/placement";
import { ROLES } from "@/fleet/roles";
import { useActivities } from "@/store/agentActivity";
import { terminalStatusStore } from "@/store/terminalStatus";
import { useStore } from "zustand";
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
  const statuses = useStore(terminalStatusStore, (s) => s.statuses);
  // An activity ends with its process (`pty-exit`), but may outlive a stopped one for a moment: only running members count.
  const members = (group: SceneGroup, activity: "working" | "waiting") =>
    membersIn(group.memberIds, activity, (id) => activities[id]?.activity, (id) => statuses[id]?.state === "running");
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
      <style>{groups.map((g) => `.excalidraw [id$="-frame-name-${CSS.escape(g.id)}"]{color:transparent!important}`).join("\n")}</style>
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
  const { role: roleId, speciality, folded } = group.group;
  const t = useMessages(canvasMessages);
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
      <button
        type="button"
        aria-label={folded ? t.unfoldGroup : t.foldGroup}
        title={folded ? t.unfoldGroup : t.foldGroup}
        onClick={() => setGroupFolded(group.id, !folded)}
        className="pointer-events-auto grid h-full w-4 shrink-0 place-items-center text-ov-text-2 hover:text-ov-text"
      >
        {folded ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
      </button>
      <span className="mr-1.5 size-1.5 shrink-0 rounded-full" /* chevron 16 + dot 6 + gap 6 = the 28 px the native name is aligned on */ style={{ backgroundColor: role.color }} />
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
  const field = useRef<HTMLInputElement>(null);
  // `autoFocus` would scroll the label layer (overflow-hidden) when the label is still out of view.
  useEffect(() => {
    field.current?.focus({ preventScroll: true });
  }, []);
  const finish = (value: string | null) => {
    if (done.current) return;
    done.current = true;
    uiStore.getState().setRenamingGroup(null);
    onDone(value);
  };
  return (
    <input
      ref={field}
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
