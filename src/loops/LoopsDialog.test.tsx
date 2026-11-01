// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { requestUi } from "@/commands/uiRequests";
import { langStore } from "@/i18n";
import { nodesStore } from "@/store/nodes";
import { LoopsDialog } from "./LoopsDialog";
import { LoopsIndicator } from "./LoopsIndicator";
import { loopsStore } from "./live";

const sends: string[][] = [];

vi.mock("@excalidraw/excalidraw", () => ({}));
vi.mock("./live", async () => {
  const { useStore } = await import("zustand");
  const { createLoopsStore } = await import("./store");
  const store = createLoopsStore(
    { now: () => Date.now(), isLive: () => true, activityOf: () => undefined, screenOf: () => "", send: async (ids) => (sends.push(ids), { sent: ids.length }) },
    { read: async () => null, write: async () => undefined },
    { setInterval: () => 0 as never, clearInterval: () => undefined },
  );
  return { loopsStore: store, useLoops: (selector: (s: never) => unknown) => useStore(store, selector as never) };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  mockIPC(() => null);
  langStore.setState({ lang: "fr" });
  sends.length = 0;
  loopsStore.setState({ loops: [], loaded: true, runtime: {} });
  await nodesStore.getState().create("isis", {
    workspaceId: "w1",
    kind: "terminal",
    payload: { title: "Isis", name: "Isis", agent: "claude", cwd: "C:/code", shell: "default", command: "" },
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      <>
        <LoopsDialog />
        <LoopsIndicator />
      </>,
    ),
  );
});
afterEach(async () => {
  loopsStore.getState().stopAll();
  await act(async () => root.unmount());
  document.body.replaceChildren();
  clearMocks();
});

const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === label)!;
const field = (label: string) => document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`)!;
const write = async (label: string, value: string) =>
  act(async () => {
    const el = field(label);
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
const open = async () => act(async () => requestUi({ kind: "loops" }));

it("opens on the list, empty at first, with the spending warning in the description", async () => {
  expect(document.body.textContent).not.toContain("Nouvelle boucle");
  await open();
  expect(document.body.textContent).toContain("Aucune boucle");
  expect(document.body.textContent).toContain("consomme de l'usage réel");
});

it("fills the form from a template and starts nothing (spec boucles §3)", async () => {
  await open();
  await act(async () => button("Nouvelle boucle").click());
  await act(async () => button("Relance").click());
  expect(field("Consigne envoyée").value).toContain("Continue");
  expect(field("Nombre de tours").value).toBe("5");
  expect(loopsStore.getState().loops).toEqual([]);
  expect(loopsStore.getState().runningCount()).toBe(0);
  expect(sends).toEqual([]);
});

it("refuses a loop without an end and says so", async () => {
  await open();
  await act(async () => button("Nouvelle boucle").click());
  await write("Nom", "Point");
  await write("Consigne envoyée", "va");
  await act(async () => document.querySelector<HTMLInputElement>('[data-target="isis"]')!.click());
  await act(async () => button("Enregistrer").click());
  expect(document.body.textContent).toContain("Fixe une fin : un nombre de tours ou une durée");
  expect(loopsStore.getState().loops).toEqual([]);
});

it("saves a bounded loop, lists it off with its end, turns it on, shows the runs and stops all from the indicator", async () => {
  await open();
  await act(async () => button("Nouvelle boucle").click());
  await write("Nom", "Point");
  await write("Consigne envoyée", "va");
  await act(async () => document.querySelector<HTMLInputElement>('[data-target="isis"]')!.click());
  await write("Nombre de tours", "4");
  await act(async () => button("Enregistrer").click());
  await vi.waitFor(() => expect(loopsStore.getState().loops).toHaveLength(1));
  expect(document.body.textContent).toContain("Point");
  expect(document.body.textContent).toContain("jusqu'à 4 tours");
  expect(document.body.textContent).toContain("éteinte");
  // Turned on only by a click.
  expect(loopsStore.getState().runningCount()).toBe(0);
  await act(async () => button("Activer").click());
  expect(loopsStore.getState().runningCount()).toBe(1);
  expect(document.body.textContent).toContain("tour 0 / 4");
  expect(document.body.textContent).toContain("1 boucle · 0 tour");
  await act(async () => document.querySelector<HTMLButtonElement>('[data-loops-indicator] button[data-stop-all]')!.click());
  expect(loopsStore.getState().runningCount()).toBe(0);
  expect(document.querySelector("[data-loops-indicator]")).toBeNull();
});

it("shows no indicator while nothing runs", () => {
  expect(document.querySelector("[data-loops-indicator]")).toBeNull();
});
