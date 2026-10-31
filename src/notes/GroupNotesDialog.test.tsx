// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { canvasStore } from "@/canvas/canvasStore";
import { langStore } from "@/i18n";
import { projectsStore } from "@/store/projects";
import { GroupNotesDialog } from "./GroupNotesDialog";
import { groupNotesOf, setGroupNotes } from "./groupNotes";
import { closeGroupNotes, notesStore, openGroupNotes } from "./notesStore";

vi.mock("@excalidraw/excalidraw", () => ({
  CaptureUpdateAction: { IMMEDIATELY: "IMMEDIATELY" },
  newElementWith: (element: object, updates: object) => ({ ...element, ...updates }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const frame = (notes?: string[]) =>
  ({ id: "g1", type: "frame", name: "Team", isDeleted: false, customData: { openvibe: { kind: "group", role: "custom", pantheon: "egypt", ...(notes ? { notes } : {}) } } }) as unknown as ExcalidrawElement;

let elements: ExcalidrawElement[];
const updateScene = vi.fn((update: { elements: ExcalidrawElement[] }) => void (elements = update.elements));
let host: HTMLElement;
let root: Root;

beforeEach(() => {
  updateScene.mockClear();
  elements = [frame()];
  canvasStore.setState({ api: { getSceneElementsIncludingDeleted: () => elements, updateScene } as unknown as ExcalidrawImperativeAPI });
  projectsStore.setState({ activeId: "p1" } as never);
  mockIPC((command) => (command === "notes_all" ? { notes: [{ name: "Auth", text: "", version: "v" }, { name: "Deploy", text: "", version: "v" }], skipped: 0 } : undefined));
});

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host?.remove();
  closeGroupNotes();
  clearMocks();
  langStore.setState({ lang: "fr" });
});

async function show() {
  openGroupNotes("g1");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<GroupNotesDialog />));
  await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 0))));
}
const box = (name: string) => document.body.querySelector<HTMLInputElement>(`input[data-attach="${name}"]`)!;
const textButton = (text: string) => [...document.body.querySelectorAll("button")].find((b) => b.textContent === text);
const toggle = (name: string) => act(async () => box(name).click());

describe("the notes of a group (spec notes §3)", () => {
  it("stores names with the group, keeping what it holds", () => {
    setGroupNotes("g1", ["Auth"]);
    expect(groupNotesOf("g1")).toEqual(["Auth"]);
    expect(updateScene).toHaveBeenCalledOnce();
    const data = elements[0].customData?.openvibe as Record<string, unknown>;
    expect(data).toMatchObject({ kind: "group", role: "custom", pantheon: "egypt", notes: ["Auth"] });
  });

  it("has none by default, and ignores what is not a name", () => {
    expect(groupNotesOf("g1")).toEqual([]);
    expect(groupNotesOf("nope")).toEqual([]);
    elements = [{ ...frame(), customData: { openvibe: { notes: ["ok", 3, "a/b"] } } } as unknown as ExcalidrawElement];
    expect(groupNotesOf("g1")).toEqual(["ok"]);
  });

  it("ticks the attached notes and saves the choice", async () => {
    elements = [frame(["Auth"])];
    await show();
    expect(box("Auth").checked).toBe(true);
    expect(box("Deploy").checked).toBe(false);
    await toggle("Deploy");
    await toggle("Auth");
    await act(async () => textButton("Enregistrer")!.click());
    expect(groupNotesOf("g1")).toEqual(["Deploy"]);
    expect(notesStore.getState().attaching).toBeNull();
  });

  it("writes nothing on Cancel", async () => {
    await show();
    await toggle("Auth");
    await act(async () => textButton("Annuler")!.click());
    expect(updateScene).not.toHaveBeenCalled();
    expect(notesStore.getState().attaching).toBeNull();
  });

  it("keeps showing a name whose note is gone, so it can be dropped", async () => {
    elements = [frame(["Old"])];
    await show();
    expect(box("Old").checked).toBe(true);
    expect(document.body.textContent).toContain("note absente");
    await toggle("Old");
    await act(async () => textButton("Enregistrer")!.click());
    expect(groupNotesOf("g1")).toEqual([]);
  });

  it("says so when the project has no notes", async () => {
    mockIPC((command) => (command === "notes_all" ? { notes: [], skipped: 0 } : undefined));
    await show();
    expect(document.body.textContent).toContain("Aucune note");
  });

  it("speaks English", async () => {
    await act(async () => langStore.setState({ lang: "en" }));
    await show();
    expect(textButton("Save")).toBeDefined();
    expect(document.body.textContent).toContain("Notes of the group");
  });
});
