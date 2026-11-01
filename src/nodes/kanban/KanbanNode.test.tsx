// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { mockIPC } from "@tauri-apps/api/mocks";
import { langStore } from "@/i18n";
import { nodesStore } from "@/store/nodes";
import { KanbanNode } from "./KanbanNode";

vi.mock("@excalidraw/excalidraw", () => ({}));
vi.mock("@/kanban/dropOnTerminal", () => ({ dropCardOutside: vi.fn(), startCardDrag: vi.fn() }));
const opened = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: opened }));
const github = vi.hoisted(() => ({ syncBoard: vi.fn(() => Promise.resolve(true)) }));
vi.mock("@/kanban/github", async (importOriginal) => ({ ...(await importOriginal<object>()), syncBoard: github.syncBoard }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Types into a React-controlled field. */
function type(field: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

const button = (text: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === text)!;

it("shows its columns with their counts, and adds a card through the dialog (issue #29)", async () => {
  mockIPC(() => undefined);
  langStore.setState({ choice: "fr", lang: "fr" });
  await nodesStore.getState().create("board", {
    workspaceId: "w1",
    kind: "kanban",
    payload: {
      columns: [
        { id: "todo", title: "À faire", cardIds: ["c1"] },
        { id: "done", title: "Fait", cardIds: [] },
      ],
      cards: { c1: { id: "c1", title: "Écrire le test", notes: "", priority: "high" } },
    },
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<KanbanNode nodeId="board" />));

  const columns = [...host.querySelectorAll("[data-column-id]")];
  expect(columns.map((c) => c.querySelector("h3")!.textContent)).toEqual(["À faire", "Fait"]);
  expect(columns.map((c) => c.querySelector('[data-testid="column-count"]')!.textContent)).toEqual(["1", "0"]);
  expect(host.querySelector('[data-card-id="c1"]')!.textContent).toContain("Écrire le test");

  await act(async () => columns[1].querySelector<HTMLButtonElement>('button[aria-label="Nouvelle carte"]')!.click());
  const title = document.querySelector<HTMLInputElement>("#kanban-card-title")!;
  await act(async () => type(title, "Relire la PR"));
  await act(async () => button("Haute").click());
  await act(async () => button("Valider").click());

  const record = nodesStore.getState().nodes.board;
  if (record?.kind !== "kanban") throw new Error("not a kanban");
  const done = record.payload.columns.find((c) => c.id === "done")!;
  expect(done.cardIds).toHaveLength(1);
  expect(record.payload.cards[done.cardIds[0]]).toMatchObject({ title: "Relire la PR", notes: "", priority: "high" });
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(host.querySelectorAll('[data-column-id="done"] [data-card-id]')).toHaveLength(1);

  await act(async () => root.unmount());
  document.body.replaceChildren();
});

it("renders nothing for a node that is not a board", async () => {
  mockIPC(() => undefined);
  await nodesStore.getState().create("chef", { workspaceId: "w1", kind: "orchestrator", payload: { name: "Chef" } });
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => root.render(<KanbanNode nodeId="chef" />));
  expect(host.innerHTML).toBe("");
  await act(async () => root.unmount());
});

it("opens a linked card's issue from its chip, and syncs a linked board (issue #29)", async () => {
  mockIPC(() => undefined);
  langStore.setState({ choice: "fr", lang: "fr" });
  const url = "https://github.com/o/r/issues/7";
  await nodesStore.getState().create("linked", {
    workspaceId: "w1",
    kind: "kanban",
    payload: {
      columns: [{ id: "todo", title: "À faire", cardIds: ["c1"] }],
      cards: { c1: { id: "c1", title: "Bug", notes: "", priority: "none", github: { repo: "o/r", number: 7, url, state: "open" } } },
      github: { repo: "o/r" },
    },
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<KanbanNode nodeId="linked" />));

  const chip = [...host.querySelectorAll("button")].find((b) => b.textContent === "#7")!;
  await act(async () => chip.click());
  expect(opened).toHaveBeenCalledWith(url);
  // The chip opens the issue, not the card's dialog.
  expect(document.querySelector('[role="dialog"]')).toBeNull();

  await act(async () => button("Synchroniser").click());
  expect(github.syncBoard).toHaveBeenCalledWith("linked");

  await act(async () => root.unmount());
  document.body.replaceChildren();
});
