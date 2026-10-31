// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { openUrl } from "@tauri-apps/plugin-opener";
import { langStore } from "@/i18n";
import NotesDialog from "./NotesDialog";
import { closeNotes, notesStore, openNotes } from "./notesStore";

vi.mock("@/shell/windowState", () => ({ closeWindow: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn(() => Promise.resolve()) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let disk: Record<string, string>;
let writes: { name: string; text: string; expected: string | null }[];
let host: HTMLElement;
let root: Root;

const versionOf = (name: string) => (name in disk ? `v:${disk[name]}` : null);

function serve() {
  mockIPC((command, args) => {
    const { name, text, expected } = (args ?? {}) as { name: string; text: string; expected: string | null };
    if (command === "notes_all") return { notes: Object.keys(disk).map((n) => ({ name: n, text: disk[n], version: versionOf(n) })), skipped: 0 };
    if (command === "notes_read") return { text: disk[name], version: versionOf(name) };
    if (command === "notes_version") return versionOf(name);
    if (command === "notes_write") {
      if (versionOf(name) !== expected) return { status: "conflict", disk: versionOf(name) };
      writes.push({ name, text, expected });
      disk[name] = text;
      return { status: "saved", version: versionOf(name) };
    }
    return undefined;
  });
}

beforeEach(async () => {
  disk = { Auth: "# Auth\n\nSee [[Deploy]] and [[Ghost]], at https://a.dev.\n\n<b>raw</b>", Deploy: "Back to [[auth]].", Plain: "Nothing." };
  writes = [];
  serve();
  openNotes();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<NotesDialog projectId="p1" />));
  await settle();
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  closeNotes();
  clearMocks();
  langStore.setState({ lang: "fr" });
  vi.mocked(openUrl).mockClear();
});

const dialog = () => document.body.querySelector<HTMLElement>("[data-notes]")!;
const button = (label: string) => document.body.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
const textButton = (text: string) => [...document.body.querySelectorAll("button")].find((b) => b.textContent === text);
const tab = (text: string) => [...document.body.querySelectorAll('[role="tab"]')].find((b) => b.textContent === text) as HTMLElement;
const row = (name: string) => dialog().querySelector<HTMLElement>(`[data-note="${name}"]`);
const reader = () => dialog().querySelector<HTMLElement>("[data-reader]")!;
const click = (element: HTMLElement | null | undefined) => act(async () => element!.click());
async function settle() {
  await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 0))));
}
async function open(name: string) {
  await click(row(name));
  await settle();
}
function type(field: HTMLInputElement, value: string) {
  return act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const searchField = () => dialog().querySelector<HTMLInputElement>('input[aria-label="Rechercher dans les notes"]')!;
const nameField = () => dialog().querySelector<HTMLInputElement>('input[aria-label="Nom de la note"]')!;
const pressEnter = (field: HTMLElement) => act(async () => void field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
const editor = () => EditorView.findFromDOM(dialog().querySelector<HTMLElement>(".cm-editor")!)!;
const typeInEditor = (text: string) =>
  act(async () => {
    const view = editor();
    view.dispatch({ changes: { from: view.state.doc.length, insert: text } });
  });
const pressSave = () => act(async () => void window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true, cancelable: true })));

describe("the notes (spec notes §6)", () => {
  it("lists the project's notes", () => {
    expect(row("Auth")).not.toBeNull();
    expect(row("Deploy")).not.toBeNull();
  });

  it("reads a note rendered, HTML left as text", async () => {
    await open("Auth");
    expect(reader().querySelector("h1")?.textContent).toBe("Auth");
    expect(reader().textContent).toContain("<b>raw</b>");
    expect(reader().querySelector("b")).toBeNull();
  });

  it("follows a wikilink to its note, whatever its case", async () => {
    await open("Deploy");
    await click(textButton("auth"));
    await settle();
    expect(reader().querySelector("h1")?.textContent).toBe("Auth");
  });

  it("opens web links with the system, not in the window", async () => {
    await open("Auth");
    await click(textButton("https://a.dev"));
    expect(openUrl).toHaveBeenCalledWith("https://a.dev");
  });

  it("offers to create the note of a dead link", async () => {
    await open("Auth");
    await click(textButton("Ghost"));
    expect(nameField().value).toBe("Ghost");
    await pressEnter(nameField());
    await settle();
    expect(disk.Ghost).toBe("# Ghost\n");
    expect(writes[0].expected).toBeNull();
    expect(editor().state.doc.toString()).toBe("# Ghost\n");
  });

  it("shows the notes that link here", async () => {
    await open("Auth");
    const back = dialog().querySelector<HTMLElement>("[data-backlinks]")!;
    expect(back.textContent).toContain("Deploy");
    await click(back.querySelector("button"));
    await settle();
    expect(reader().textContent).toContain("Back to");
  });

  it("searches names and text, with the matching line", async () => {
    await type(searchField(), "back to");
    expect(row("Deploy")?.textContent).toContain("Back to [[auth]].");
    expect(row("Plain")).toBeNull();
  });

  it("edits with Ctrl+S, the reading view following", async () => {
    await open("Plain");
    await click(tab("Édition"));
    await typeInEditor(" More.");
    expect(dialog().querySelector("[data-dirty]")).not.toBeNull();
    await click(tab("Lecture"));
    expect(reader().textContent).toContain("Nothing. More.");
    await pressSave();
    await settle();
    expect(disk.Plain).toBe("Nothing. More.");
    expect(writes[0].expected).toBe("v:Nothing.");
  });

  it("keeps the undo history across the views", async () => {
    await open("Plain");
    await click(tab("Édition"));
    const view = editor();
    await click(tab("Lecture"));
    await click(tab("Édition"));
    expect(editor()).toBe(view);
  });

  it("shows new links in the list of backlinks once saved", async () => {
    await open("Plain");
    await click(tab("Édition"));
    await typeInEditor(" [[Auth]]");
    await pressSave();
    await settle();
    await open("Auth");
    expect(dialog().querySelector("[data-backlinks]")?.textContent).toContain("Plain");
  });

  it("creates a note with a valid name only", async () => {
    await click(button("Nouvelle note"));
    await type(nameField(), "a/b");
    await pressEnter(nameField());
    await settle();
    expect(writes).toEqual([]);
    expect(dialog().textContent).toContain("Ce nom ne convient pas");
    await type(nameField(), "Idées");
    await pressEnter(nameField());
    await settle();
    expect(disk["Idées"]).toBe("# Idées\n");
  });

  it("opens a note instead of creating it twice", async () => {
    await click(button("Nouvelle note"));
    await type(nameField(), "auth");
    await pressEnter(nameField());
    await settle();
    expect(writes).toEqual([]);
    expect(reader().querySelector("h1")?.textContent).toBe("Auth");
  });

  it("asks before leaving a modified note", async () => {
    await open("Plain");
    await click(tab("Édition"));
    await typeInEditor("x");
    await click(row("Auth"));
    expect(document.body.textContent).toContain("Enregistrer Plain ?");
    await click(textButton("Annuler"));
    expect(editor().state.doc.toString()).toBe("Nothing.x");
  });

  it("closes through the same guard", async () => {
    await open("Plain");
    await click(button("Fermer les notes"));
    expect(notesStore.getState().open).toBe(false);
  });

  it("shows a note an agent changed instead of overwriting it", async () => {
    await open("Plain");
    await click(tab("Édition"));
    await typeInEditor("x");
    disk.Plain = "agent";
    await pressSave();
    await settle();
    expect(disk.Plain).toBe("agent");
    expect(dialog().querySelector('[role="alert"]')).not.toBeNull();
  });

  it("draws the notes and their links, and opens a note from the graph", async () => {
    await click(tab("Graphe"));
    const graph = dialog().querySelector("[data-graph]")!;
    expect(graph.querySelectorAll("[data-graph-note]")).toHaveLength(3);
    expect(graph.querySelectorAll("[data-graph-link]")).toHaveLength(1);
    const note = graph.querySelector<SVGElement>('[data-graph-note="Deploy"]')!;
    await act(async () => void note.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    await settle();
    expect(dialog().textContent).toContain("Back to");
  });

  it("does not ask for the list again and again when a modified note differs from the disk", async () => {
    await open("Plain");
    await click(tab("Édition"));
    await typeInEditor("x");
    disk.Plain = "agent";
    let lists = 0;
    mockIPC((command, args) => {
      if (command === "notes_all") {
        lists++;
        return { notes: Object.keys(disk).map((n) => ({ name: n, text: disk[n], version: versionOf(n) })), skipped: 0 };
      }
      if (command === "notes_version") return versionOf((args as { name: string }).name);
      return undefined;
    });
    await click(button("Rafraîchir"));
    await settle();
    await settle();
    await settle();
    expect(lists).toBe(1);
  });

  it("says why a note could not be created", async () => {
    await click(button("Nouvelle note"));
    mockIPC((command) => {
      if (command === "notes_write") throw { kind: "invalidInput", message: "chemin refusé : x" };
      return undefined;
    });
    await type(nameField(), "x");
    await pressEnter(nameField());
    await settle();
    expect(dialog().textContent).toContain("chemin refusé : x");
  });

  it("says when notes were left out", async () => {
    mockIPC((command) => (command === "notes_all" ? { notes: [], skipped: 2 } : undefined));
    await click(button("Rafraîchir"));
    await settle();
    expect(dialog().textContent).toContain("2 notes non affichées");
  });

  it("says when there are no notes yet", async () => {
    mockIPC((command) => (command === "notes_all" ? { notes: [], skipped: 0 } : undefined));
    await click(button("Rafraîchir"));
    await settle();
    expect(dialog().textContent).toContain("Aucune note");
  });

  it("speaks English", async () => {
    await act(async () => langStore.setState({ lang: "en" }));
    expect(button("Close the notes")).not.toBeNull();
    expect(tab("Graph")).toBeDefined();
    await open("Plain");
    await click(tab("Edit"));
    await typeInEditor("x");
    await click(button("Close the notes"));
    expect(document.body.textContent).toContain("Save Plain?");
  });
});
