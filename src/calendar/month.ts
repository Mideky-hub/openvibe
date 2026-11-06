import { isDate, type CalendarEvent, type CalendarPayload } from "@/nodes/types";

/** The month grid and the operations on a calendar's events (issue #32). Each operation returns a new list and leaves its input untouched. */

/** A month shown by the widget; `month` counts from 0, as Date does. */
export interface Month {
  year: number;
  month: number;
}

/** What the event dialog edits: an event without its id. */
export type EventDraft = Omit<CalendarEvent, "id">;

const uuid = () => crypto.randomUUID();
const pad = (n: number) => String(n).padStart(2, "0");

/** The local day of `date`, YYYY-MM-DD. */
export function isoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function monthOf(date: Date): Month {
  return { year: date.getFullYear(), month: date.getMonth() };
}

export function shiftMonth({ year, month }: Month, step: number): Month {
  return monthOf(new Date(year, month + step, 1));
}

/** The 42 days of six weeks, from the Monday on or before the 1st. */
export function monthDays({ year, month }: Month): string[] {
  const first = new Date(year, month, 1);
  const back = (first.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) => isoDate(new Date(year, month, 1 - back + i)));
}

/** A draft as it is stored: title trimmed, no time for an all-day event; null if it has no title or no real day. */
function clean(draft: EventDraft): EventDraft | null {
  const title = draft.title.trim();
  if (!title || !isDate(draft.date)) return null;
  return { ...draft, title, time: draft.allDay ? "" : draft.time };
}

export function addEvent(list: CalendarPayload, draft: EventDraft, newId: () => string = uuid): CalendarPayload {
  const event = clean(draft);
  if (!event) return list;
  return { events: [...list.events, { id: newId(), ...event }] };
}

export function updateEvent(list: CalendarPayload, id: string, draft: EventDraft): CalendarPayload {
  const event = clean(draft);
  if (!event || !list.events.some((e) => e.id === id)) return list;
  return { events: list.events.map((e) => (e.id === id ? { id, ...event } : e)) };
}

export function removeEvent(list: CalendarPayload, id: string): CalendarPayload {
  if (!list.events.some((e) => e.id === id)) return list;
  return { events: list.events.filter((e) => e.id !== id) };
}

/** Moves an event to another day, its time kept. */
export function moveEvent(list: CalendarPayload, id: string, date: string): CalendarPayload {
  const event = list.events.find((e) => e.id === id);
  if (!event || event.date === date || !isDate(date)) return list;
  return { events: list.events.map((e) => (e.id === id ? { ...e, date } : e)) };
}

/** A day's events: all-day ones first, then by time, else in the list's order. */
export function eventsOn(list: CalendarPayload, date: string): CalendarEvent[] {
  const rank = (e: CalendarEvent) => (e.allDay || !e.time ? "" : e.time);
  return list.events.filter((e) => e.date === date).sort((a, b) => rank(a).localeCompare(rank(b)));
}
