// @vitest-environment happy-dom
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { showAbout } from "@/app/about";
import { fitScene, zoomTo } from "@/canvas/viewActions";
import { agentsPanelStore } from "@/fleet/agentsPanelState";
import { addProject } from "@/home/addProject";
import { focusCommandBar } from "@/shell/commandBarFocus";
import { closeWindow, minimizeWindow, toggleMaximizeWindow, windowStore } from "@/shell/windowState";
import { removeWorkspace } from "@/shell/workspaceActions";
import { projectsStore } from "@/store/projects";
import { workspacesStore } from "@/store/workspaces";
import { labelOf, type Command, type CommandContext } from "../command";
import { pendingUiRequest } from "../uiRequests";
import { APP } from "./app";
import { NAVIGATION } from "./navigation";
import { WORKSPACES } from "./workspaces";

vi.mock("@excalidraw/excalidraw", () => ({}));
vi.mock("@/canvas/arrive", () => ({ arrive: vi.fn(), showNode: vi.fn() }));
vi.mock("@/canvas/viewActions", () => ({ fitScene: vi.fn(), zoomTo: vi.fn() }));
vi.mock("@/shell/commandBarFocus", () => ({ focusCommandBar: vi.fn() }));
vi.mock("@/shell/workspaceActions", () => ({ removeWorkspace: vi.fn(() => Promise.resolve()) }));
vi.mock("@/app/about", () => ({ showAbout: vi.fn(() => Promise.resolve()) }));
vi.mock("@/home/addProject", () => ({ addProject: vi.fn(() => Promise.resolve()) }));
vi.mock("@/shell/windowState", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shell/windowState")>()),
  minimizeWindow: vi.fn(),
  toggleMaximizeWindow: vi.fn(),
  closeWindow: vi.fn(),
}));

const home: CommandContext = { project: false, workspaceId: null, terminalCount: 0, terminalId: null };
const busy: CommandContext = { project: true, workspaceId: "w1", terminalCount: 2, terminalId: "isis" };
const find = (list: readonly Command[], id: string) => list.find((c) => c.id === id)!;
const goHome = vi.fn();
const close = vi.fn(() => Promise.resolve());

beforeEach(() => {
  mockIPC(() => undefined);
  projectsStore.setState({ view: "project", goHome, close } as never);
  workspacesStore.setState({
    workspaces: [
      { id: "w1", projectId: "p1", name: "Workspace 1", position: 0, pantheon: null },
      { id: "w2", projectId: "p1", name: "Backend", position: 1, pantheon: null },
    ],
    activeId: "w1",
  } as never);
});
afterAll(() => clearMocks());

describe("Navigation (spec fenêtre §7.3)", () => {
  it("lists the spec's functions, in its order", () => {
    agentsPanelStore.setState({ open: true });
    expect(NAVIGATION.filter((c) => c.id !== "palette.functions").map((c) => labelOf(c, busy))).toEqual([
      "Terminal suivant",
      "Terminal précédent",
      "Aller à…",
      "Vue d'ensemble",
      "Rendre la main au canvas",
      "Ajuster à la scène",
      "Zoom 100 %",
      "Écrire une consigne",
      "Masquer le panneau Agents",
      "Accueil",
      "Fermer le projet",
      "Aller à la ligne…",
    ]);
  });

  it("does what the buttons do", async () => {
    await find(NAVIGATION, "canvas.fit").run(busy);
    expect(fitScene).toHaveBeenCalled();
    await find(NAVIGATION, "canvas.zoom100").run(busy);
    expect(zoomTo).toHaveBeenCalledWith(1);
    await find(NAVIGATION, "commandBar.focus").run(busy);
    expect(focusCommandBar).toHaveBeenCalled();
    await find(NAVIGATION, "project.home").run(busy);
    expect(goHome).toHaveBeenCalled();
    await find(NAVIGATION, "project.close").run(busy);
    expect(close).toHaveBeenCalled();
  });

  it("shows or hides the agents panel, named after its state", async () => {
    agentsPanelStore.setState({ open: false });
    const toggle = find(NAVIGATION, "agentsPanel.toggle");
    expect(labelOf(toggle, busy)).toBe("Afficher le panneau Agents");
    await toggle.run(busy);
    expect(agentsPanelStore.getState().open).toBe(true);
    expect(labelOf(toggle, busy)).toBe("Masquer le panneau Agents");
  });

  it("offers nothing but « Aller à… » outside a project", () => {
    expect(NAVIGATION.filter((c) => c.available(home)).map((c) => c.id)).toEqual(["palette.goTo", "palette.functions"]);
  });
});

describe("Workspaces", () => {
  it("creates, renames in the tab, deletes after the existing confirmation", async () => {
    const create = vi.fn(() => Promise.resolve());
    workspacesStore.setState({ create } as never);
    await find(WORKSPACES, "workspace.new").run(busy);
    expect(create).toHaveBeenCalled();
    await find(WORKSPACES, "workspace.rename").run(busy);
    expect(pendingUiRequest()).toEqual({ kind: "renameWorkspace", id: "w1" });
    await find(WORKSPACES, "workspace.delete").run(busy);
    expect(removeWorkspace).toHaveBeenCalledWith(expect.objectContaining({ id: "w1" }), 0);
  });

  it("never deletes the last workspace", () => {
    expect(find(WORKSPACES, "workspace.delete").available(busy)).toBe(true);
    workspacesStore.setState({ workspaces: [{ id: "w1", projectId: "p1", name: "Workspace 1", position: 0, pantheon: null }] } as never);
    expect(find(WORKSPACES, "workspace.delete").available(busy)).toBe(false);
  });
});

describe("Projets, Fenêtre, Aide", () => {
  it("adds a project at home only", async () => {
    const add = find(APP, "project.add");
    expect(add.available(busy)).toBe(false);
    projectsStore.setState({ view: "home" } as never);
    expect(add.available(home)).toBe(true);
    await add.run(home);
    expect(addProject).toHaveBeenCalled();
  });

  it("drives the window and tells the version, everywhere", async () => {
    for (const id of ["window.minimize", "window.maximize", "window.close", "app.about"]) expect(find(APP, id).available(home)).toBe(true);
    await find(APP, "window.minimize").run(home);
    await find(APP, "window.maximize").run(home);
    await find(APP, "window.close").run(home);
    await find(APP, "app.about").run(home);
    expect([minimizeWindow, toggleMaximizeWindow, closeWindow, showAbout].every((f) => vi.mocked(f).mock.calls.length === 1)).toBe(true);
  });

  it("names the maximize command after the window's state", () => {
    windowStore.setState({ maximized: false });
    expect(labelOf(find(APP, "window.maximize"), home)).toBe("Agrandir");
    windowStore.setState({ maximized: true });
    expect(labelOf(find(APP, "window.maximize"), home)).toBe("Restaurer");
  });
});
