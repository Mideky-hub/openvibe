// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { langStore } from "@/i18n";
import { closeWindow } from "@/shell/windowState";
import StudioDialog from "./StudioDialog";
import { closeStudio, holdQuit, openStudio, studioStore } from "./studioStore";

vi.mock("@/shell/windowState", () => ({ closeWindow: vi.fn() }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Args = Record<string, unknown>;

let disk: Record<string, string>;
let writes: Args[];
let host: HTMLElement;
let root: Root;

const versionOf = (file: string) => (file in disk ? `v:${disk[file]}` : null);

beforeEach(async () => {
  disk = { "src/App.tsx": "const a = 1;\n", "src/b.ts": "b\n", "README.md": "# hi\n" };
  writes = [];
  mockIPC((command, args) => {
    const { file, text, expected } = (args ?? {}) as Args & { file: string; text: string; expected: string | null };
    if (command === "studio_files") return Object.keys(disk);
    if (command === "studio_read") return { text: disk[file], version: versionOf(file) };
    if (command === "studio_version") return versionOf(file);
    if (command === "studio_write") {
      if (versionOf(file) !== expected) return { status: "conflict", disk: versionOf(file) };
      writes.push(args as Args);
      disk[file] = text;
      return { status: "saved", version: versionOf(file) };
    }
    return undefined;
  });
  openStudio();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<StudioDialog projectId="p1" />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  closeStudio();
  clearMocks();
  vi.mocked(closeWindow).mockClear();
  langStore.setState({ lang: "fr" });
});

const dialog = () => document.body.querySelector<HTMLElement>('[data-studio]')!;
const button = (label: string) => document.body.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
const textButton = (text: string) => [...document.body.querySelectorAll("button")].find((b) => b.textContent === text);
const click = (element: HTMLElement | null | undefined) => act(async () => element!.click());
const settle = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 0))));

async function openFile(name: string, ...folders: string[]) {
  for (const folder of folders) await click(textButton(folder));
  await click(textButton(name));
  await settle();
}

const editor = () => EditorView.findFromDOM(dialog().querySelector<HTMLElement>(".cm-editor")!)!;
const typeAtEnd = (text: string) =>
  act(async () => {
    const view = editor();
    view.dispatch({ changes: { from: view.state.doc.length, insert: text } });
  });
const pressSave = () =>
  act(async () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true, cancelable: true }));
  });

describe("the code studio (spec studio code §6)", () => {
  it("lists the project's files, folders folded", () => {
    expect(textButton("src")).toBeDefined();
    expect(textButton("README.md")).toBeDefined();
    expect(textButton("App.tsx")).toBeUndefined();
  });

  it("opens a file in the editor", async () => {
    await openFile("App.tsx", "src");
    expect(editor().state.doc.toString()).toBe("const a = 1;\n");
    expect(dialog().textContent).toContain("src/App.tsx");
  });

  it("filters the files by their path", async () => {
    const field = document.body.querySelector<HTMLInputElement>('input[aria-label="Filtrer les fichiers"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, "app");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(textButton("src/App.tsx")).toBeDefined();
    expect(textButton("README.md")).toBeUndefined();
  });

  it("saves with Ctrl+S, ahead of the WebView", async () => {
    await openFile("README.md");
    await typeAtEnd("more\n");
    expect(dialog().querySelector("[data-dirty]")).not.toBeNull();
    const event = new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true, cancelable: true });
    await act(async () => void window.dispatchEvent(event));
    await settle();
    expect(event.defaultPrevented).toBe(true);
    expect(disk["README.md"]).toBe("# hi\nmore\n");
    expect(writes[0].expected).toBe("v:# hi\n");
    expect(dialog().querySelector("[data-dirty]")).toBeNull();
  });

  it("leaves Ctrl+S alone once closed", async () => {
    await act(async () => root.render(null));
    const event = new KeyboardEvent("keydown", { key: "s", ctrlKey: true, cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("closes at once without changes", async () => {
    await openFile("README.md");
    await click(button("Fermer le studio"));
    expect(studioStore.getState().open).toBe(false);
  });

  it("asks before closing with changes; Cancel keeps everything", async () => {
    await openFile("README.md");
    await typeAtEnd("x");
    await click(button("Fermer le studio"));
    expect(studioStore.getState().open).toBe(true);
    expect(document.body.textContent).toContain("Enregistrer README.md ?");
    await click(textButton("Annuler"));
    expect(document.body.textContent).not.toContain("Enregistrer README.md ?");
    expect(editor().state.doc.toString()).toBe("# hi\nx");
  });

  it("Don't save closes and writes nothing", async () => {
    await openFile("README.md");
    await typeAtEnd("x");
    await click(button("Fermer le studio"));
    await click(textButton("Ne pas enregistrer"));
    expect(studioStore.getState().open).toBe(false);
    expect(writes).toEqual([]);
  });

  it("asks before leaving a modified file for another; Save goes on", async () => {
    await openFile("README.md");
    await typeAtEnd("x");
    await openFile("b.ts", "src");
    expect(document.body.textContent).toContain("Enregistrer README.md ?");
    await click(document.body.querySelector<HTMLElement>('[data-unsaved] [data-save]'));
    await settle();
    expect(disk["README.md"]).toBe("# hi\nx");
    expect(editor().state.doc.toString()).toBe("b\n");
  });

  it("shows the conflict instead of overwriting; Overwrite then writes", async () => {
    await openFile("README.md");
    await typeAtEnd("mine");
    disk["README.md"] = "agent\n";
    await pressSave();
    await settle();
    expect(disk["README.md"]).toBe("agent\n");
    expect(dialog().querySelector('[role="alert"]')?.textContent).toContain("a changé sur le disque");
    await click(textButton("Écraser avec ma version"));
    await settle();
    expect(disk["README.md"]).toBe("# hi\nmine");
    expect(dialog().querySelector('[role="alert"]')).toBeNull();
  });

  it("gives the disk's version on Reload, in the same document", async () => {
    await openFile("README.md");
    await typeAtEnd("mine");
    disk["README.md"] = "# agent\n";
    await pressSave();
    await settle();
    const view = editor();
    await click(textButton("Recharger (perd mes modifications)"));
    await settle();
    expect(editor()).toBe(view);
    expect(view.state.doc.toString()).toBe("# agent\n");
    expect(dialog().querySelector("[data-dirty]")).toBeNull();
  });

  it("says when a file cannot be edited", async () => {
    mockIPC((command) => {
      if (command === "studio_files") return ["big.log"];
      if (command === "studio_read") throw { kind: "invalidInput", message: "big.log dépasse 2 Mo" };
      return undefined;
    });
    await click(button("Rafraîchir"));
    await settle();
    await openFile("big.log");
    expect(dialog().textContent).toContain("big.log dépasse 2 Mo");
    expect(dialog().querySelector(".cm-editor")).toBeNull();
  });

  it("keeps the open file when the list can no longer be read", async () => {
    await openFile("README.md");
    await typeAtEnd("x");
    const view = editor();
    mockIPC((command) => {
      if (command === "studio_files") throw { kind: "invalidInput", message: "git a échoué" };
      return undefined;
    });
    await click(button("Rafraîchir"));
    await settle();
    expect(editor()).toBe(view);
    expect(view.state.doc.toString()).toBe("# hi\nx");
  });

  it("holds the window's closing while changes wait, then closes it", async () => {
    await openFile("README.md");
    expect(holdQuit()).toBe(false);
    await typeAtEnd("x");
    let held = false;
    await act(async () => void (held = holdQuit()));
    expect(held).toBe(true);
    expect(closeWindow).not.toHaveBeenCalled();
    await click(textButton("Ne pas enregistrer"));
    expect(closeWindow).toHaveBeenCalledOnce();
  });

  it("speaks English", async () => {
    await act(async () => langStore.setState({ lang: "en" }));
    await openFile("README.md");
    await typeAtEnd("x");
    await click(button("Close the studio"));
    expect(document.body.textContent).toContain("Save README.md?");
    expect(textButton("Don't save")).toBeDefined();
  });
});
