import { describe, expect, it } from "vitest";
import type { CalendarEvent, CalendarPayload } from "@/nodes/types";
import { addEvent, eventsOn, isoDate, monthDays, monthOf, moveEvent, removeEvent, shiftMonth, updateEvent } from "./month";

const event = (id: string, patch: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id,
  title: id,
  date: "2026-11-06",
  allDay: true,
  time: "",
  color: "terracotta",
  notes: "",
  ...patch,
});

describe("the month grid (issue #32)", () => {
  it("writes a local date as YYYY-MM-DD", () => {
    expect(isoDate(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
    expect(monthOf(new Date(2026, 10, 6))).toEqual({ year: 2026, month: 10 });
  });

  it("steps from month to month across the years", () => {
    expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
    expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(shiftMonth({ year: 2026, month: 5 }, 0)).toEqual({ year: 2026, month: 5 });
  });

  it("lays out six weeks from the Monday on or before the 1st", () => {
    // November 2026 starts on a Sunday.
    const days = monthDays({ year: 2026, month: 10 });
    expect(days).toHaveLength(42);
    expect(days[0]).toBe("2026-10-26");
    expect(days[6]).toBe("2026-11-01");
    expect(days[41]).toBe("2026-12-06");
    // February 2027 starts on a Monday: no day of January.
    expect(monthDays({ year: 2027, month: 1 })[0]).toBe("2027-02-01");
  });
});

describe("the events of a calendar (issue #32)", () => {
  const list: CalendarPayload = { events: [event("a"), event("b", { date: "2026-11-07" })] };

  it("adds an event with its title trimmed, and leaves the list as it is for a blank title or a bad date", () => {
    const draft = { title: "  Démo  ", date: "2026-11-09", allDay: false, time: "14:30", color: "sage" as const, notes: "salle 2" };
    expect(addEvent(list, draft, () => "c").events.slice(-1)[0]).toEqual({ id: "c", ...draft, title: "Démo" });
    expect(addEvent(list, { ...draft, title: " " })).toBe(list);
    expect(addEvent(list, { ...draft, date: "9 novembre" })).toBe(list);
  });

  it("drops the time of an all-day event", () => {
    const added = addEvent(list, { title: "Off", date: "2026-11-09", allDay: true, time: "09:00", color: "rose", notes: "" }, () => "c");
    expect(added.events.slice(-1)[0]?.time).toBe("");
  });

  it("edits, moves and removes an event without touching its input", () => {
    const edited = updateEvent(list, "a", { title: "Revue", date: "2026-11-10", allDay: false, time: "10:00", color: "slate", notes: "n" });
    expect(edited.events[0]).toEqual({ id: "a", title: "Revue", date: "2026-11-10", allDay: false, time: "10:00", color: "slate", notes: "n" });
    expect(list.events[0].title).toBe("a");
    expect(updateEvent(list, "a", { ...edited.events[0], title: "" })).toBe(list);
    expect(updateEvent(list, "zz", edited.events[0])).toBe(list);

    expect(moveEvent(list, "b", "2026-11-20").events[1].date).toBe("2026-11-20");
    expect(moveEvent(list, "b", "2026-11-07")).toBe(list);
    expect(moveEvent(list, "b", "nope")).toBe(list);

    expect(removeEvent(list, "a").events.map((e) => e.id)).toEqual(["b"]);
    expect(removeEvent(list, "zz")).toBe(list);
  });

  it("lists a day's events, all-day ones first, then by time", () => {
    const day: CalendarPayload = {
      events: [
        event("late", { allDay: false, time: "18:00" }),
        event("other", { date: "2026-11-08" }),
        event("early", { allDay: false, time: "08:15" }),
        event("all"),
      ],
    };
    expect(eventsOn(day, "2026-11-06").map((e) => e.id)).toEqual(["all", "early", "late"]);
    expect(eventsOn(day, "2026-11-01")).toEqual([]);
  });
});
