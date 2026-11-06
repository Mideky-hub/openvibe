// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mockIPC } from "@tauri-apps/api/mocks";
import { langStore } from "@/i18n";
import type { Goal } from "@/nodes/types";
import { nodesStore } from "@/store/nodes";
import { GoalsNode } from "./GoalsNode";

vi.mock("@excalidraw/excalidraw", () => ({}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Types into a React-controlled field. */
function type(field: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

const key = (target: Element, name: string) => target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));
const button = (text: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);
const goals = (): Goal[] => {
  const record = nodesStore.getState().nodes.list;
  if (record?.kind !== "goals") throw new Error("not a goals list");
  return record.payload.goals;
};
const rows = (host: HTMLElement) => [...host.querySelectorAll<HTMLElement>("[data-goal-id]")];

let host: HTMLDivElement;
let root: Root;

async function show(initial: Goal[]) {
  await nodesStore.getState().create("list", { workspaceId: "w1", kind: "goals", payload: { goals: initial } });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<GoalsNode nodeId="list" />));
}

beforeEach(() => {
  mockIPC(() => undefined);
  langStore.setState({ choice: "fr", lang: "fr" });
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
});

it("starts empty, then adds goals one after the other from « Ajouter un objectif » (issue #36)", async () => {
  await show([]);
  expect(host.textContent).toContain("Aucun objectif");

  await act(async () => button("Ajouter un objectif")!.click());
  const field = host.querySelector<HTMLInputElement>('input[aria-label="Nouvel objectif"]')!;
  await act(async () => type(field, "Publier la bêta"));
  await act(async () => key(field, "Enter"));
  // The field stays open for the next one.
  const next = host.querySelector<HTMLInputElement>('input[aria-label="Nouvel objectif"]')!;
  expect(next.value).toBe("");
  await act(async () => type(next, "Écrire la doc"));
  await act(async () => key(next, "Enter"));

  expect(goals().map((g) => [g.text, g.done])).toEqual([
    ["Publier la bêta", false],
    ["Écrire la doc", false],
  ]);
  expect(rows(host).map((r) => r.textContent)).toEqual([expect.stringContaining("Publier la bêta"), expect.stringContaining("Écrire la doc")]);
  expect(host.textContent).not.toContain("Aucun objectif");
});

it("ticks, edits and removes a goal", async () => {
  await show([
    { id: "a", text: "Publier", done: false },
    { id: "b", text: "Tester", done: false },
  ]);
  expect(host.textContent).toContain("0/2");

  const tick = host.querySelector<HTMLButtonElement>('[data-goal-id="a"] [role="checkbox"]')!;
  expect(tick.getAttribute("aria-checked")).toBe("false");
  await act(async () => tick.click());
  expect(goals()[0].done).toBe(true);
  expect(host.querySelector('[data-goal-id="a"] [role="checkbox"]')!.getAttribute("aria-checked")).toBe("true");
  expect(host.textContent).toContain("1/2");

  const text = host.querySelector<HTMLElement>('[data-goal-id="b"] [data-testid="goal-text"]')!;
  await act(async () => text.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
  const edit = host.querySelector<HTMLInputElement>('[data-goal-id="b"] input')!;
  expect(edit.value).toBe("Tester");
  await act(async () => type(edit, "Tester sur Windows"));
  await act(async () => key(edit, "Enter"));
  expect(goals()[1].text).toBe("Tester sur Windows");

  await act(async () => host.querySelector<HTMLButtonElement>('[data-goal-id="a"] button[aria-label="Retirer l\'objectif"]')!.click());
  expect(goals().map((g) => g.id)).toEqual(["b"]);
  expect(rows(host)).toHaveLength(1);
});

it("cancels an edit with Escape", async () => {
  await show([{ id: "a", text: "Publier", done: false }]);
  await act(async () => host.querySelector('[data-testid="goal-text"]')!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
  const edit = host.querySelector<HTMLInputElement>('[data-goal-id="a"] input')!;
  await act(async () => type(edit, "Autre chose"));
  await act(async () => key(edit, "Escape"));
  expect(goals()[0].text).toBe("Publier");
  expect(host.querySelector('[data-goal-id="a"] input')).toBeNull();
});

it("reorders goals with the arrows on their handle", async () => {
  await show([
    { id: "a", text: "Un", done: false },
    { id: "b", text: "Deux", done: false },
    { id: "c", text: "Trois", done: false },
  ]);
  const handle = (id: string) => host.querySelector<HTMLElement>(`[data-goal-id="${id}"] [data-testid="goal-handle"]`)!;
  await act(async () => key(handle("c"), "ArrowUp"));
  expect(goals().map((g) => g.id)).toEqual(["a", "c", "b"]);
  await act(async () => key(handle("a"), "ArrowDown"));
  expect(goals().map((g) => g.id)).toEqual(["c", "a", "b"]);
  expect(rows(host).map((r) => r.dataset.goalId)).toEqual(["c", "a", "b"]);
});

it("renders nothing for a node that is not a goals list", async () => {
  await nodesStore.getState().create("chef", { workspaceId: "w1", kind: "orchestrator", payload: { name: "Chef" } });
  host = document.createElement("div");
  root = createRoot(host);
  await act(async () => root.render(<GoalsNode nodeId="chef" />));
  expect(host.innerHTML).toBe("");
});
