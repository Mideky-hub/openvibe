import { useEffect, useRef, useState, type DragEvent } from "react";
import { cn } from "cn";
import { Check, GripVertical, ListChecks, Pencil, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addGoal, doneCount, editGoal, moveGoal, removeGoal, toggleGoal } from "@/goals/list";
import { goalsMessages } from "@/goals/messages";
import { useMessages } from "@/i18n";
import { useNativeKeyDown } from "@/lib/useNativeKeyDown";
import { nodesStore, useNodes } from "@/store/nodes";
import type { Goal, GoalsPayload } from "@/nodes/types";

type Messages = (typeof goalsMessages)["fr"];

/** The data type of a goal being dragged within its list; no text, so Excalidraw makes nothing of it. */
const GOAL_MIME = "application/x-openvibe-goal";

/** Applies a change to the list as it is now, read when acting rather than when rendered. */
function commit(nodeId: string, change: (list: GoalsPayload) => GoalsPayload) {
  const record = nodesStore.getState().nodes[nodeId];
  if (record?.kind !== "goals") return;
  const next = change(record.payload);
  if (next !== record.payload) nodesStore.getState().update(nodeId, { goals: next.goals });
}

/** A goals checklist on the canvas (issue #36): tick, edit, remove and reorder the project's goals. */
export function GoalsNode({ nodeId }: { nodeId: string }) {
  const t = useMessages(goalsMessages);
  const record = useNodes((s) => s.nodes[nodeId]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const [spot, setSpot] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  // The wheel scrolls the list, not the canvas (Excalidraw listens below React's root).
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const listener = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) event.stopPropagation();
    };
    element.addEventListener("wheel", listener);
    return () => element.removeEventListener("wheel", listener);
  }, [record?.kind]);

  if (record?.kind !== "goals") return null;
  const { goals } = record.payload;
  const done = doneCount(record.payload);

  /** The index among the goals, the dragged one left out, above which the pointer is. */
  const spotOf = (e: DragEvent<HTMLElement>) =>
    [...e.currentTarget.querySelectorAll<HTMLElement>("[data-goal-id]")]
      .filter((el) => el.dataset.goalId !== dragged)
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.top + rect.height / 2 < e.clientY;
      }).length;

  const onDragOver = (e: DragEvent<HTMLElement>) => {
    if (!dragged || !e.dataTransfer.types.includes(GOAL_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const next = spotOf(e);
    if (next !== spot) setSpot(next);
  };

  const onDrop = (e: DragEvent<HTMLElement>) => {
    if (!dragged) return;
    e.preventDefault();
    const id = dragged;
    const index = spotOf(e);
    commit(nodeId, (list) => moveGoal(list, id, index));
    setDragged(null);
    setSpot(null);
  };

  const shown = goals.filter((g) => g.id !== dragged);
  const indicator = <div className="mx-2 h-0.5 shrink-0 rounded-full bg-ov-accent" />;

  return (
    <div data-goals={nodeId} className="flex h-full flex-col overflow-hidden rounded-xl border border-ov-line bg-card text-card-foreground">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-ov-line px-3">
        <ListChecks className="size-4 shrink-0 text-ov-accent" />
        <span className="truncate text-[13px] font-semibold text-ov-text">{t.title}</span>
        {goals.length > 0 && (
          <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground" title={t.progressLabel(done, goals.length)}>
            {t.progress(done, goals.length)}
          </span>
        )}
      </header>
      {goals.length > 0 && (
        <div className="h-0.5 shrink-0 bg-ov-surface-2">
          <div className="h-full bg-ov-done transition-[width]" style={{ width: `${(done / goals.length) * 100}%` }} />
        </div>
      )}
      <div ref={scroller} className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2">
        {goals.length === 0 && !adding ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
            <p>{t.empty}</p>
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus />
              {t.add}
            </Button>
          </div>
        ) : (
          <>
            <ul
              className="flex flex-col gap-0.5"
              onDragOver={onDragOver}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSpot(null);
              }}
              onDrop={onDrop}
            >
              {goals.map((goal) => {
                const index = shown.indexOf(goal);
                return (
                  <li key={goal.id} className="contents">
                    {spot !== null && index === spot && indicator}
                    <GoalRow
                      t={t}
                      goal={goal}
                      editing={editing === goal.id}
                      dragging={dragged === goal.id}
                      onToggle={() => commit(nodeId, (list) => toggleGoal(list, goal.id))}
                      onEditStart={() => setEditing(goal.id)}
                      onEditDone={(text) => {
                        if (text !== null) commit(nodeId, (list) => editGoal(list, goal.id, text));
                        setEditing(null);
                      }}
                      onRemove={() => commit(nodeId, (list) => removeGoal(list, goal.id))}
                      onMove={(step) => commit(nodeId, (list) => moveGoal(list, goal.id, list.goals.findIndex((g) => g.id === goal.id) + step))}
                      onDragStart={(e) => {
                        e.stopPropagation();
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData(GOAL_MIME, goal.id);
                        setDragged(goal.id);
                      }}
                      onDragEnd={() => {
                        setDragged(null);
                        setSpot(null);
                      }}
                    />
                  </li>
                );
              })}
              {spot !== null && spot >= shown.length && indicator}
            </ul>
            {adding ? (
              <NewGoalInput
                t={t}
                onAdd={(text) => commit(nodeId, (list) => addGoal(list, text))}
                onClose={() => setAdding(false)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="mt-1 flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-[12px] text-muted-foreground hover:bg-ov-hover hover:text-ov-text"
              >
                <Plus className="size-3.5" />
                {t.add}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function GoalRow({
  t,
  goal,
  editing,
  dragging,
  onToggle,
  onEditStart,
  onEditDone,
  onRemove,
  onMove,
  onDragStart,
  onDragEnd,
}: {
  t: Messages;
  goal: Goal;
  editing: boolean;
  dragging: boolean;
  onToggle: () => void;
  onEditStart: () => void;
  onEditDone: (text: string | null) => void;
  onRemove: () => void;
  onMove: (step: -1 | 1) => void;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
}) {
  const handle = useRef<HTMLButtonElement>(null);
  useNativeKeyDown(handle, (e) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      onMove(e.key === "ArrowUp" ? -1 : 1);
      // The row is rendered again elsewhere: the handle keeps the focus for the next press.
      requestAnimationFrame(() => handle.current?.focus());
    }
  });
  return (
    <div
      data-goal-id={goal.id}
      draggable={!editing}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn("group flex min-h-8 items-center gap-1 rounded-md px-1 hover:bg-ov-hover", dragging && "opacity-40")}
    >
      <button
        ref={handle}
        type="button"
        data-testid="goal-handle"
        aria-label={t.move(goal.text)}
        title={t.move(goal.text)}
        className="grid size-5 shrink-0 cursor-grab place-items-center rounded text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
      >
        <GripVertical className="size-3.5" />
      </button>
      <button
        type="button"
        role="checkbox"
        aria-checked={goal.done}
        aria-label={goal.done ? t.untick(goal.text) : t.tick(goal.text)}
        onClick={onToggle}
        className={cn(
          "grid size-4 shrink-0 place-items-center rounded border",
          goal.done ? "border-ov-done bg-ov-done text-ov-on-accent" : "border-ov-line bg-ov-field hover:border-ov-accent",
        )}
      >
        {goal.done && <Check className="size-3" strokeWidth={3} />}
      </button>
      {editing ? (
        <GoalTextInput initial={goal.text} onDone={onEditDone} />
      ) : (
        <span
          data-testid="goal-text"
          title={t.doubleClickEdit}
          onDoubleClick={onEditStart}
          className={cn("min-w-0 flex-1 px-1 text-[13px] leading-snug break-words", goal.done ? "text-muted-foreground line-through" : "text-ov-text")}
        >
          {goal.text}
        </span>
      )}
      {!editing && (
        <span className="flex shrink-0 items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100">
          <button
            type="button"
            aria-label={t.edit}
            title={t.edit}
            onClick={onEditStart}
            className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-ov-surface-2 hover:text-ov-text"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label={t.remove}
            title={t.remove}
            onClick={onRemove}
            className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-ov-surface-2 hover:text-ov-danger"
          >
            <X className="size-3.5" />
          </button>
        </span>
      )}
    </div>
  );
}

/** A goal being edited: Enter or a click elsewhere keeps it, Escape cancels. */
function GoalTextInput({ initial, onDone }: { initial: string; onDone: (text: string | null) => void }) {
  const [draft, setDraft] = useState(initial);
  const input = useRef<HTMLInputElement>(null);
  const finished = useRef(false);
  const finish = (text: string | null) => {
    if (finished.current) return;
    finished.current = true;
    onDone(text);
  };
  useNativeKeyDown(input, (e) => {
    if (e.key === "Enter") finish(draft);
    if (e.key === "Escape") finish(null);
  });
  useEffect(() => input.current?.select(), []);
  return (
    <input
      ref={input}
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => finish(draft)}
      className="min-w-0 flex-1 rounded bg-ov-field px-1 text-[13px] text-ov-text outline-none"
    />
  );
}

/** The field at the bottom: Enter adds the goal and stays open for the next; Escape, or leaving it empty, closes it. */
function NewGoalInput({ t, onAdd, onClose }: { t: Messages; onAdd: (text: string) => void; onClose: () => void }) {
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useNativeKeyDown(input, (e) => {
    if (e.key === "Enter" && draft.trim()) {
      onAdd(draft);
      setDraft("");
    }
    if (e.key === "Escape") onClose();
  });
  return (
    <div className="mt-1 flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-ov-line bg-ov-field px-2">
      <Plus className="size-3.5 shrink-0 text-muted-foreground" />
      <input
        ref={input}
        autoFocus
        aria-label={t.newGoal}
        placeholder={t.newGoalPlaceholder}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (!draft.trim()) onClose();
        }}
        className="min-w-0 flex-1 bg-transparent text-[13px] text-ov-text outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}
