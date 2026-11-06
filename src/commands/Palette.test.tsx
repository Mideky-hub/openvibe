// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { toast } from "sonner";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { canvasStore } from "@/canvas/canvasStore";
import { agentsPanelStore } from "@/fleet/agentsPanelState";
import { agentsStore } from "@/fleet/agentsStore";
import { nodesStore } from "@/store/nodes";
import { projectsStore } from "@/store/projects";
import { workspacesStore } from "@/store/workspaces";
import type { CommandContext } from "./command";
import { goTo } from "./goToRun";
import { openPalette, paletteStore, setPaletteQuery } from "./paletteState";
import { Palette } from "./Palette";
import { recentStore } from "./recent";
import { presetsStore } from "@/presets/store";
import { openInCodeStudio } from "@/studio/navigate";

vi.mock("@excalidraw/excalidraw", () => ({}));
vi.mock("@/nodes/terminal/registry", () => ({ focusTerminal: vi.fn(), terminalSelection: vi.fn(() => "") }));
vi.mock("./goToRun", () => ({ goTo: vi.fn() }));
vi.mock("@/studio/navigate", () => ({ openInCodeStudio: vi.fn(async () => undefined), openCodeWorkspace: vi.fn(async () => undefined) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const home: CommandContext = { project: false, workspaceId: null, terminalCount: 0, terminalId: null };
const busy: CommandContext = { project: true, workspaceId: "w1", terminalCount: 1, terminalId: "isis" };
let host: HTMLDivElement;
let root: Root;

const projects = [
  { id: "p1", name: "mk-webapp", path: "C:/code/mk-webapp", lastOpenedAt: 1, missing: false },
  { id: "p2", name: "api", path: "C:/code/api", lastOpenedAt: 5, missing: false },
];

beforeEach(async () => {
  mockIPC(() => undefined);
  vi.mocked(goTo).mockClear();
  agentsStore.setState({ agents: [], loaded: true, load: () => Promise.resolve() });
  projectsStore.setState({ view: "home", projects, activeId: null } as never);
  paletteStore.setState({ open: false, query: "", context: null, returnFocus: null });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<Palette />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  clearMocks();
  vi.restoreAllMocks();
});

const items = () => [...document.querySelectorAll<HTMLElement>("[cmdk-item]")];
const selected = () => document.querySelector<HTMLElement>('[cmdk-item][data-selected="true"]');
const input = () => document.querySelector<HTMLInputElement>("[cmdk-input]")!;
const press = (key: string) => input().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));

describe("the palette (spec fenêtre §7.1, §7.2)", () => {
  it("opens on « Aller à », the first line chosen; at home, the projects, most recent first", async () => {
    await act(async () => openPalette("goTo", home));
    expect(input().placeholder).toBe("Aller à un terminal, un workspace, un fichier (fichier:ligne)… (> pour les fonctions)");
    expect(items().map((i) => i.textContent)).toEqual(["apiC:/code/api", "mk-webappC:/code/mk-webapp"]);
    expect(selected()).toBe(items()[0]);
    expect(document.body.textContent).toContain("↑↓ naviguer · Entrée ouvrir · Échap fermer");
  });

  it("chooses the first line again after each keystroke, and Entrée closes before going there", async () => {
    await act(async () => openPalette("goTo", home));
    await act(async () => setPaletteQuery("mk"));
    expect(selected()!.textContent).toContain("mk-webapp");
    await act(async () => press("Enter"));
    expect(paletteStore.getState().open).toBe(false);
    expect(goTo).toHaveBeenCalledWith(expect.objectContaining({ kind: "project", projectId: "p1" }));
  });

  it("Escape closes and gives the keyboard back where it was", async () => {
    const xterm = document.createElement("textarea");
    document.body.append(xterm);
    xterm.focus();
    await act(async () => openPalette("goTo", home));
    expect(document.activeElement).toBe(input());
    await act(async () => press("Escape"));
    expect(paletteStore.getState().open).toBe(false);
    expect(document.activeElement).toBe(xterm);
  });

  it("closes on a click outside, with no veil on the app", async () => {
    await act(async () => openPalette("goTo", home));
    const backdrop = document.querySelector<HTMLElement>("[data-palette-backdrop]")!;
    expect(backdrop.className).not.toMatch(/bg-/);
    await act(async () => void backdrop.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true })));
    await act(async () => void backdrop.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(paletteStore.getState().open).toBe(false);
  });

  it("stays open when a selection dragged out of the field ends on the backdrop", async () => {
    await act(async () => openPalette("goTo", home));
    const backdrop = document.querySelector<HTMLElement>("[data-palette-backdrop]")!;
    await act(async () => void input().dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true })));
    await act(async () => void backdrop.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(paletteStore.getState().open).toBe(true);
  });

  it("stays open until the click: the mousedown after the pointerdown would land on what lies under it (plan F1)", async () => {
    await act(async () => openPalette("goTo", home));
    const backdrop = document.querySelector<HTMLElement>("[data-palette-backdrop]")!;
    await act(async () => void backdrop.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
    const mousedown = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    await act(async () => void backdrop.dispatchEvent(mousedown));
    expect(paletteStore.getState().open).toBe(true);
    // The keyboard stays in the field until the palette closes.
    expect(mousedown.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input());
  });

  it("keeps the mousedown of a click inside the palette", async () => {
    await act(async () => openPalette("goTo", home));
    const mousedown = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    await act(async () => void input().dispatchEvent(mousedown));
    await act(async () => void input().dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(mousedown.defaultPrevented).toBe(false);
    expect(paletteStore.getState().open).toBe(true);
  });

  it("lists the functions available at that moment, with their shortcut, under > ", async () => {
    await act(async () => openPalette("functions", busy));
    expect(input().value).toBe("> ");
    const rows = items().map((i) => i.textContent);
    expect(rows).toContain("Terminal suivantCtrl+Tab");
    expect(rows).toContain("Aller à…Ctrl+P");
    expect(rows.some((r) => r?.startsWith("Rechercher une fonction"))).toBe(false);
  });

  it("keeps Tab in the field: the keyboard never leaves an open palette", async () => {
    await act(async () => openPalette("goTo", home));
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    await act(async () => input().dispatchEvent(tab));
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input());
  });

  it("reopens on « Aller à » with the keyboard in its field when chosen from the functions", async () => {
    const xterm = document.createElement("textarea");
    document.body.append(xterm);
    xterm.focus();
    await act(async () => openPalette("functions", busy));
    await act(async () => setPaletteQuery("> aller"));
    await act(async () => press("Enter"));
    expect(paletteStore.getState()).toMatchObject({ open: true, query: "" });
    expect(document.activeElement).toBe(input());
  });

  it("lists every project at home, the one just left included", async () => {
    // « Tous les projets… » keeps the last project's id: it is no longer open.
    projectsStore.setState({ view: "home", activeId: "p1" } as never);
    await act(async () => openPalette("goTo", home));
    expect(items().map((i) => i.textContent)).toEqual(["apiC:/code/api", "mk-webappC:/code/mk-webapp"]);
  });

  it("lists the readable workspaces when one is unreadable (spec fenêtre §9)", async () => {
    const error = vi.spyOn(toast, "error").mockImplementation(() => "");
    mockIPC((cmd, args) => {
      if (cmd === "load_workspace" && (args as { id: string }).id === "w2") throw new Error("corrompu");
      return undefined;
    });
    await nodesStore.getState().create("isis", {
      workspaceId: "w1",
      kind: "terminal",
      payload: { title: "Isis", name: "Isis", agent: "claude", cwd: "C:/code", shell: "default", command: "" },
    });
    const isis = { id: "isis", type: "embeddable", customData: { kind: "terminal" }, x: 0, y: 0, width: 300, height: 200, isDeleted: false, frameId: null };
    canvasStore.setState({ api: { getSceneElements: () => [isis], getAppState: () => ({ selectedElementIds: {} }) } as unknown as ExcalidrawImperativeAPI });
    projectsStore.setState({ view: "project", activeId: "p1" } as never);
    workspacesStore.setState({
      workspaces: [
        { id: "w1", projectId: "p1", name: "Workspace 1", position: 0, pantheon: null },
        { id: "w2", projectId: "p1", name: "Backend", position: 1, pantheon: null },
      ],
      activeId: "w1",
    } as never);
    await act(async () => openPalette("goTo", busy));
    await act(async () => new Promise<void>((resolve) => setTimeout(resolve, 0)));
    expect(error).toHaveBeenCalledWith("Workspace Backend illisible");
    expect(items()[0].textContent).toContain("Isis");
    expect(document.body.textContent).not.toContain("Chargement…");
  });

  it("greys what cannot be installed, with why, and never chooses it", async () => {
    agentsStore.setState({ agents: [{ id: "shell", available: false }], loaded: true } as never);
    await act(async () => openPalette("functions", busy));
    await act(async () => setPaletteQuery("> lancer shell"));
    const line = items().find((i) => i.textContent?.startsWith("Lancer Shell"))!;
    expect(line.getAttribute("data-disabled")).toBe("true");
    expect(line.textContent).toContain("introuvable dans le PATH");
    expect(selected()).not.toBe(line);
  });

  it("offers to install a missing agent (spec installation §4.1)", async () => {
    agentsStore.setState({ agents: [{ id: "claude", available: false }], loaded: true } as never);
    await act(async () => openPalette("functions", busy));
    await act(async () => setPaletteQuery("> installer claude"));
    const line = items().find((i) => i.textContent?.startsWith("Installer Claude…"))!;
    expect(line.getAttribute("data-disabled")).not.toBe("true");
  });

  it("offers the last function again first: Ctrl+Maj+P then Entrée repeats it (retours J8b)", async () => {
    recentStore.setState({ ids: [] });
    agentsPanelStore.setState({ open: false });
    await act(async () => openPalette("functions", busy));
    await act(async () => setPaletteQuery("> panneau"));
    await act(async () => press("Enter"));
    expect(agentsPanelStore.getState().open).toBe(true);
    await act(async () => openPalette("functions", busy));
    const first = items()[0];
    expect(first.closest("[cmdk-group]")!.textContent).toContain("Récentes");
    expect(first.textContent).toContain("Masquer le panneau Agents");
    expect(first.textContent).toContain("Navigation");
    expect(selected()).toBe(first);
  });

  it("lists the project's files while searching; `App.tsx:42` opens the file at line 42 in the Code Studio", async () => {
    mockIPC((cmd) => (cmd === "studio_tree" ? [{ path: "src", kind: "dir" }, { path: "src/App.tsx", kind: "file" }, { path: "src/app/AppShell.tsx", kind: "file" }] : undefined));
    canvasStore.setState({ api: { getSceneElements: () => [], getAppState: () => ({ selectedElementIds: {} }) } as unknown as ExcalidrawImperativeAPI });
    projectsStore.setState({ view: "project", activeId: "p1" } as never);
    workspacesStore.setState({ workspaces: [{ id: "w1", projectId: "p1", name: "Workspace 1", position: 0, pantheon: null }], activeId: "w1" } as never);
    await act(async () => openPalette("goTo", busy));
    await act(async () => new Promise<void>((resolve) => setTimeout(resolve, 0)));
    expect(document.body.textContent).not.toContain("Fichiers");
    await act(async () => setPaletteQuery("App.tsx:42"));
    expect(document.body.textContent).toContain("Fichiers");
    expect(selected()!.textContent).toBe("App.tsxsrcligne 42");
    await act(async () => press("Enter"));
    expect(paletteStore.getState().open).toBe(false);
    expect(openInCodeStudio).toHaveBeenCalledWith("src/App.tsx", 42, undefined);
  });
});

describe("Escape and held keys (plan F1 findings)", () => {
  it("Échap closes the palette without reaching the window listeners of placement and link modes", async () => {
    const heard = vi.fn();
    window.addEventListener("keydown", heard);
    await act(async () => openPalette("goTo", home));
    await act(async () => void press("Escape"));
    window.removeEventListener("keydown", heard);
    expect(paletteStore.getState().open).toBe(false);
    expect(heard).not.toHaveBeenCalled();
  });
});

describe("agents in the functions list (plan F2)", () => {
  it("looks for the agents when the functions open, and lists the agents already found", async () => {
    const load = vi.spyOn(agentsStore.getState(), "load").mockResolvedValue();
    await act(async () => openPalette("functions", busy));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("does not grey an agent before the first look has run", async () => {
    agentsStore.setState({ agents: [], loaded: false });
    await act(async () => openPalette("functions", busy));
    await act(async () => setPaletteQuery("> lancer shell"));
    const line = items().find((i) => i.textContent?.includes("Lancer Shell"));
    expect(line?.getAttribute("data-disabled")).not.toBe("true");
    expect(line?.textContent).not.toContain("introuvable");
  });
});

describe("while scenes are read (plan F1 finding)", () => {
  it("does not say « Aucun résultat » next to « Chargement… »", async () => {
    mockIPC(() => new Promise(() => undefined));
    workspacesStore.setState({ workspaces: [{ id: "w9", name: "Slow", projectId: "p1", position: 0 }], activeId: "w1" } as never);
    projectsStore.setState({ view: "project", activeId: "p1" } as never);
    await act(async () => openPalette("goTo", busy));
    await act(async () => setPaletteQuery("zzzz"));
    const text = document.body.textContent ?? "";
    expect(text).toContain("Chargement…");
    expect(text).not.toContain("Aucun résultat");
  });
});

describe("the team presets in the functions list (spec presets §3)", () => {
  it("lists the saved presets under « Équipes », and reads them when the functions open", async () => {
    presetsStore.setState({
      presets: [{ id: "1", name: "Dev HQ", savedAt: 1, groups: [{ name: "G", role: "docs", agents: ["claude", "codex"], x: 0, y: 0 }], orchestrators: [] }],
      loaded: true,
    });
    await act(async () => openPalette("functions", busy));
    await act(async () => setPaletteQuery("> dev hq"));
    expect(items().map((i) => i.textContent).sort()).toEqual(["Déployer l'équipe : Dev HQ (2 agents)", "Supprimer le preset : Dev HQ"]);
    expect(document.body.textContent).toContain("Équipes");
  });
});

describe("the loops in the functions list (spec boucles §4)", () => {
  it("lists « Gérer les boucles… » in a project, under « Boucles »", async () => {
    await act(async () => openPalette("functions", busy));
    await act(async () => setPaletteQuery("> boucles"));
    expect(items().map((i) => i.textContent)).toEqual(["Gérer les boucles…"]);
    expect(document.body.textContent).toContain("Boucles");
  });
});
