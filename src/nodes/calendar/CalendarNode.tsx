import { useEffect, useRef, useState, type CSSProperties, type DragEvent, type FormEvent } from "react";
import { cn } from "cn";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { calendarMessages } from "@/calendar/messages";
import { addEvent, eventsOn, isoDate, monthDays, monthOf, moveEvent, removeEvent, shiftMonth, updateEvent, type EventDraft, type Month } from "@/calendar/month";
import { useLang, useMessages } from "@/i18n";
import { nodesStore, useNodes } from "@/store/nodes";
import { EVENT_COLORS, type CalendarEvent, type CalendarPayload, type EventColor } from "@/nodes/types";

type Messages = (typeof calendarMessages)["fr"];

/** The data type of an event being dragged to another day; no text, so Excalidraw makes nothing of it. */
const EVENT_MIME = "application/x-openvibe-event";

/** The time an event gets when « Toute la journée » is unticked without one. */
const DEFAULT_TIME = "09:00";

/** Applies a change to the calendar as it is now, read when acting rather than when rendered. */
function commit(nodeId: string, change: (list: CalendarPayload) => CalendarPayload) {
  const record = nodesStore.getState().nodes[nodeId];
  if (record?.kind !== "calendar") return;
  const next = change(record.payload);
  if (next !== record.payload) nodesStore.getState().update(nodeId, { events: next.events });
}

const colorVar = (color: EventColor) => ({ "--event": `var(--ov-event-${color})` }) as CSSProperties;

/** What the dialog is open on: a new event on a day, or an existing one. */
type Editing = { kind: "new"; date: string } | { kind: "edit"; event: CalendarEvent };

/** A monthly calendar on the canvas (issue #32): events to create, edit, delete and drag from day to day. */
export function CalendarNode({ nodeId }: { nodeId: string }) {
  const t = useMessages(calendarMessages);
  const lang = useLang();
  const record = useNodes((s) => s.nodes[nodeId]);
  const [month, setMonth] = useState<Month>(() => monthOf(new Date()));
  const [editing, setEditing] = useState<Editing | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [spot, setSpot] = useState<string | null>(null);
  // Read by the drop as soon as the drag starts, before React renders again.
  const dragged = useRef<string | null>(null);
  const container = useRef<HTMLDivElement>(null);

  // The wheel scrolls a day's events, not the canvas (Excalidraw listens below React's root).
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const listener = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) event.stopPropagation();
    };
    element.addEventListener("wheel", listener);
    return () => element.removeEventListener("wheel", listener);
  }, [record?.kind]);

  if (record?.kind !== "calendar") return null;
  const today = isoDate(new Date());
  const days = monthDays(month);
  const inMonth = (date: string) => date.startsWith(`${month.year}-${String(month.month + 1).padStart(2, "0")}-`);
  const monthLabel = new Intl.DateTimeFormat(lang, { month: "long", year: "numeric" }).format(new Date(month.year, month.month, 1));
  // 1 January 2024 was a Monday.
  const weekdays = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(lang, { weekday: "short" }).format(new Date(2024, 0, 1 + i)));

  const endDrag = () => {
    dragged.current = null;
    setDragging(null);
    setSpot(null);
  };

  const onDragOver = (e: DragEvent<HTMLElement>, date: string) => {
    if (!dragged.current) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    if (spot !== date) setSpot(date);
  };

  const onDrop = (e: DragEvent<HTMLElement>, date: string) => {
    const id = dragged.current;
    if (!id) return;
    e.preventDefault();
    commit(nodeId, (list) => moveEvent(list, id, date));
    endDrag();
  };

  return (
    <div ref={container} data-calendar={nodeId} className="flex h-full flex-col overflow-hidden rounded-xl border border-ov-line bg-card text-card-foreground">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-ov-line px-3">
        <CalendarDays className="size-4 shrink-0 text-ov-accent" />
        <span className="truncate text-[13px] font-semibold text-ov-text">{t.title}</span>
        <span data-testid="calendar-month" className="truncate text-[13px] text-ov-text-2 capitalize">
          {monthLabel}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="icon-sm" aria-label={t.previous} title={t.previous} onClick={() => setMonth((m) => shiftMonth(m, -1))}>
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setMonth(monthOf(new Date()))}>
            {t.today}
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label={t.next} title={t.next} onClick={() => setMonth((m) => shiftMonth(m, 1))}>
            <ChevronRight />
          </Button>
          <Button size="sm" onClick={() => setEditing({ kind: "new", date: inMonth(today) ? today : days.find(inMonth)! })}>
            <Plus />
            {t.newEvent}
          </Button>
        </div>
      </header>
      <div data-testid="calendar-weekdays" className="grid h-6 shrink-0 grid-cols-7 border-b border-ov-line">
        {weekdays.map((name) => (
          <span key={name} className="truncate px-1.5 text-[11px] leading-6 text-ov-text-3">
            {name}
          </span>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6">
        {days.map((date) => {
          const isToday = date === today;
          const own = inMonth(date);
          return (
            <div
              key={date}
              data-day={date}
              aria-current={isToday ? "date" : undefined}
              title={t.doubleClickAdd}
              onDoubleClick={() => setEditing({ kind: "new", date })}
              onDragOver={(e) => onDragOver(e, date)}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null) && spot === date) setSpot(null);
              }}
              onDrop={(e) => onDrop(e, date)}
              className={cn(
                "flex min-h-0 min-w-0 flex-col gap-0.5 border-r border-b border-ov-line p-1 [&:nth-child(7n)]:border-r-0 [&:nth-last-child(-n+7)]:border-b-0",
                !own && "bg-ov-field",
                spot === date && "bg-ov-accent-soft",
              )}
            >
              <span
                className={cn(
                  "grid h-5 min-w-5 shrink-0 place-items-center self-end rounded-md px-1 font-mono text-[11px]",
                  isToday ? "bg-ov-accent font-semibold text-ov-on-accent" : own ? "text-ov-text-2" : "text-ov-text-3",
                )}
              >
                {Number(date.slice(8))}
              </span>
              <div className="flex min-h-0 flex-col gap-0.5 overflow-y-auto [scrollbar-width:none]">
                {eventsOn(record.payload, date).map((event) => (
                  <EventChip
                    key={event.id}
                    t={t}
                    event={event}
                    dragging={dragging === event.id}
                    onOpen={() => setEditing({ kind: "edit", event })}
                    onDragStart={(e) => {
                      e.stopPropagation();
                      if (e.dataTransfer) {
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData(EVENT_MIME, event.id);
                      }
                      dragged.current = event.id;
                      setDragging(event.id);
                    }}
                    onDragEnd={endDrag}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {editing && (
        <EventDialog
          key={editing.kind === "edit" ? editing.event.id : `new-${editing.date}`}
          t={t}
          title={editing.kind === "edit" ? t.editTitle : t.newTitle}
          initial={editing.kind === "edit" ? editing.event : { title: "", date: editing.date, allDay: true, time: "", color: "terracotta", notes: "" }}
          onClose={() => setEditing(null)}
          onSave={(draft) => {
            commit(nodeId, (list) => (editing.kind === "edit" ? updateEvent(list, editing.event.id, draft) : addEvent(list, draft)));
            setEditing(null);
          }}
          onDelete={
            editing.kind === "edit"
              ? () => {
                  commit(nodeId, (list) => removeEvent(list, editing.event.id));
                  setEditing(null);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

function EventChip({
  t,
  event,
  dragging,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  t: Messages;
  event: CalendarEvent;
  dragging: boolean;
  onOpen: () => void;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
}) {
  return (
    <button
      type="button"
      data-event-id={event.id}
      draggable
      title={t.move(event.title)}
      style={colorVar(event.color)}
      onClick={onOpen}
      onDoubleClick={(e) => e.stopPropagation()}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "flex h-4 w-full shrink-0 cursor-grab items-center gap-1 rounded-sm border-l-2 border-(--event) bg-[color-mix(in_srgb,var(--event)_20%,transparent)] px-1 text-left text-[11px] leading-4 text-ov-text hover:bg-[color-mix(in_srgb,var(--event)_32%,transparent)]",
        dragging && "opacity-40",
      )}
    >
      {!event.allDay && event.time && <span className="shrink-0 font-mono text-ov-text-2">{event.time}</span>}
      <span className="min-w-0 truncate">{event.title}</span>
    </button>
  );
}

/** The event dialog: title, date, « Toute la journée » or a time, one of six colors, notes. */
function EventDialog({
  t,
  title,
  initial,
  onClose,
  onSave,
  onDelete,
}: {
  t: Messages;
  title: string;
  initial: EventDraft;
  onClose: () => void;
  onSave: (draft: EventDraft) => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(initial.title);
  const [date, setDate] = useState(initial.date);
  const [allDay, setAllDay] = useState(initial.allDay);
  const [time, setTime] = useState(initial.time);
  const [color, setColor] = useState<EventColor>(initial.color);
  const [notes, setNotes] = useState(initial.notes);
  const ready = name.trim() !== "" && date !== "";

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ready) onSave({ title: name, date, allDay, time: allDay ? "" : time, color, notes });
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="calendar-event-title">{t.eventTitle}</Label>
            <Input id="calendar-event-title" autoFocus value={name} placeholder={t.eventTitlePlaceholder} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="calendar-event-date">{t.date}</Label>
              <Input id="calendar-event-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
            </div>
            <label htmlFor="calendar-event-all-day" className="flex h-8 items-center gap-2 text-sm text-ov-text">
              <input
                id="calendar-event-all-day"
                type="checkbox"
                checked={allDay}
                onChange={(e) => {
                  setAllDay(e.target.checked);
                  if (!e.target.checked && !time) setTime(DEFAULT_TIME);
                }}
                className="size-4 accent-(--ov-accent)"
              />
              {t.allDay}
            </label>
            {!allDay && (
              <div className="grid gap-1.5">
                <Label htmlFor="calendar-event-time">{t.time}</Label>
                <Input id="calendar-event-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-28" />
              </div>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label>{t.color}</Label>
            <div role="radiogroup" aria-label={t.color} className="flex items-center gap-1.5">
              {EVENT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color === c}
                  aria-label={t.colors[c]}
                  title={t.colors[c]}
                  style={colorVar(c)}
                  onClick={() => setColor(c)}
                  className={cn(
                    "grid size-6 place-items-center rounded-md bg-(--event) text-ov-on-role outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    color === c && "ring-2 ring-ov-text ring-offset-2 ring-offset-popover",
                  )}
                >
                  {color === c && <Check className="size-3.5" strokeWidth={3} />}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="calendar-event-notes">{t.notes}</Label>
            <textarea
              id="calendar-event-notes"
              rows={3}
              value={notes}
              placeholder={t.notesPlaceholder}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            />
          </div>
          <DialogFooter>
            {onDelete && (
              <Button type="button" variant="destructive" className="sm:mr-auto" onClick={onDelete}>
                {t.remove}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose}>
              {t.cancel}
            </Button>
            <Button type="submit" disabled={!ready}>
              {t.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
