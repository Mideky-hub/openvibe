// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mockIPC } from "@tauri-apps/api/mocks";
import { langStore } from "@/i18n";
import type { CalendarEvent } from "@/nodes/types";
import { nodesStore } from "@/store/nodes";
import { CalendarNode } from "./CalendarNode";

vi.mock("@excalidraw/excalidraw", () => ({}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Types into a React-controlled field. */
function type(field: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

const button = (text: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);
const byLabel = (label: string) => document.querySelector<HTMLElement>(`[aria-label="${label}"]`)!;
const field = <T extends HTMLElement = HTMLInputElement>(id: string) => document.getElementById(id) as T;
const day = (date: string) => host.querySelector<HTMLElement>(`[data-day="${date}"]`)!;
const events = (): CalendarEvent[] => {
  const record = nodesStore.getState().nodes.cal;
  if (record?.kind !== "calendar") throw new Error("not a calendar");
  return record.payload.events;
};
const monthLabel = () => host.querySelector('[data-testid="calendar-month"]')!.textContent;

const demo: CalendarEvent = { id: "e1", title: "Démo", date: "2026-11-06", allDay: true, time: "", color: "sage", notes: "" };

let host: HTMLDivElement;
let root: Root;

async function show(initial: CalendarEvent[]) {
  await nodesStore.getState().create("cal", { workspaceId: "w1", kind: "calendar", payload: { events: initial } });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<CalendarNode nodeId="cal" />));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 6, 12));
  mockIPC(() => undefined);
  langStore.setState({ choice: "fr", lang: "fr" });
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.useRealTimers();
});

it("shows the month of today with today highlighted, and goes from month to month (issue #32)", async () => {
  await show([]);
  expect(monthLabel()).toBe("novembre 2026");
  expect(host.querySelectorAll("[data-day]")).toHaveLength(42);
  expect(host.querySelectorAll('[aria-current="date"]')).toHaveLength(1);
  expect(day("2026-11-06").getAttribute("aria-current")).toBe("date");
  // Mondays first.
  expect(host.querySelector('[data-testid="calendar-weekdays"]')!.textContent).toMatch(/^lun/);

  await act(async () => byLabel("Mois suivant").click());
  expect(monthLabel()).toBe("décembre 2026");
  expect(host.querySelector('[aria-current="date"]')).toBeNull();
  await act(async () => byLabel("Mois précédent").click());
  await act(async () => byLabel("Mois précédent").click());
  expect(monthLabel()).toBe("octobre 2026");
  await act(async () => button("Aujourd'hui")!.click());
  expect(monthLabel()).toBe("novembre 2026");
});

it("creates an event from « Nouveau » with its date, time, color and notes", async () => {
  await show([]);
  await act(async () => button("Nouveau")!.click());
  expect(document.body.textContent).toContain("Nouvel événement");
  expect(field("calendar-event-date").value).toBe("2026-11-06");

  await act(async () => type(field("calendar-event-title"), "Revue de code"));
  await act(async () => type(field("calendar-event-date"), "2026-11-12"));
  const allDay = field("calendar-event-all-day");
  expect(allDay.checked).toBe(true);
  await act(async () => allDay.click());
  await act(async () => type(field("calendar-event-time"), "14:30"));
  expect(document.querySelectorAll('[role="radiogroup"] [role="radio"]')).toHaveLength(6);
  await act(async () => byLabel("Ardoise").click());
  await act(async () => type(field<HTMLTextAreaElement>("calendar-event-notes"), "salle 2"));
  await act(async () => button("Enregistrer")!.click());

  expect(events()).toEqual([
    { id: expect.any(String), title: "Revue de code", date: "2026-11-12", allDay: false, time: "14:30", color: "slate", notes: "salle 2" },
  ]);
  expect(document.body.textContent).not.toContain("Nouvel événement");
  expect(day("2026-11-12").textContent).toContain("14:30");
  expect(day("2026-11-12").textContent).toContain("Revue de code");
});

it("opens a new event on the day double-clicked", async () => {
  await show([]);
  await act(async () => day("2026-11-20").dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
  expect(field("calendar-event-date").value).toBe("2026-11-20");
  // No title, no event.
  expect(button("Enregistrer")!.disabled).toBe(true);
  await act(async () => button("Annuler")!.click());
  expect(events()).toEqual([]);
});

it("edits and deletes an event from its dialog", async () => {
  await show([demo, { ...demo, id: "e2", title: "Bêta", date: "2026-11-07" }]);
  const chip = () => host.querySelector<HTMLElement>('[data-event-id="e1"]');
  await act(async () => chip()!.click());
  expect(document.body.textContent).toContain("Modifier l'événement");
  expect(field("calendar-event-title").value).toBe("Démo");
  expect(byLabel("Sauge").getAttribute("aria-checked")).toBe("true");
  await act(async () => type(field("calendar-event-title"), "Démo client"));
  await act(async () => button("Enregistrer")!.click());
  expect(events()[0].title).toBe("Démo client");
  expect(chip()!.textContent).toContain("Démo client");

  await act(async () => chip()!.click());
  await act(async () => button("Supprimer")!.click());
  expect(events().map((e) => e.id)).toEqual(["e2"]);
  expect(chip()).toBeNull();
});

it("moves an event to the day it is dropped on", async () => {
  await show([demo]);
  await act(async () => {
    host.querySelector('[data-event-id="e1"]')!.dispatchEvent(new Event("dragstart", { bubbles: true }));
    day("2026-11-18").dispatchEvent(new Event("dragover", { bubbles: true, cancelable: true }));
    day("2026-11-18").dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
  });
  expect(events()[0].date).toBe("2026-11-18");
  expect(day("2026-11-18").querySelector('[data-event-id="e1"]')).not.toBeNull();
  expect(day("2026-11-06").querySelector('[data-event-id="e1"]')).toBeNull();
});

it("renders nothing for a node that is not a calendar", async () => {
  await nodesStore.getState().create("chef", { workspaceId: "w1", kind: "orchestrator", payload: { name: "Chef" } });
  host = document.createElement("div");
  root = createRoot(host);
  await act(async () => root.render(<CalendarNode nodeId="chef" />));
  expect(host.innerHTML).toBe("");
});
