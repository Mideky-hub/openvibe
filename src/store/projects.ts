import { createStore, useStore } from "zustand";
import {
  createProject,
  deleteProject,
  getSetting,
  listProjects,
  openProject,
  relocateProject,
  renameProject,
  setSetting,
  type Project,
} from "@/ipc/db";
import { flushAll } from "@/lib/flush";
import { rebaseTerminalFolders } from "./nodes";
import { workspacesStore } from "./workspaces";

export type { Project };

const ACTIVE_KEY = "ui.activeProjectId";
/** Stored when the user closed the project: the next launch shows the home screen. */
const CLOSED = "";

export type ProjectsView = "loading" | "home" | "project" | "error";

/** The most recently opened project whose folder still exists. */
export function recentProject(projects: readonly Project[]): Project | null {
  return projects.filter((p) => !p.missing).sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)[0] ?? null;
}

/**
 * The project to reopen at launch (spec habillage §5.1): the saved one if its
 * folder still exists; the most recently opened one when none was ever saved
 * (first launch after migration 002); none after "Fermer" or if it is gone.
 */
export function startupProject(projects: readonly Project[], saved: string | null): string | null {
  if (saved === CLOSED) return null;
  if (saved !== null) {
    const last = projects.find((p) => p.id === saved);
    return last && !last.missing ? last.id : null;
  }
  return recentProject(projects)?.id ?? null;
}

export interface ProjectsDeps {
  loadWorkspaces: (projectId: string) => Promise<void>;
  forgetWorkspaces: (workspaceIds: string[]) => void;
  /** Moves the folder of the terminals in memory, as Rust did for the saved ones. */
  rebaseTerminals: (from: string, to: string) => void;
}

export interface ProjectsState {
  projects: Project[];
  activeId: string | null;
  view: ProjectsView;
  error?: string;
  /** Reopens the last project, or shows the home screen (spec habillage §5.1). */
  init: () => Promise<void>;
  open: (id: string) => Promise<void>;
  /** Adds a folder as a project and opens it. */
  add: (path: string) => Promise<void>;
  /** Shows the home screen; the project stays the one reopened at next launch. */
  goHome: () => void;
  /** Shows the home screen and forgets the project for the next launch. */
  close: () => Promise<void>;
  rename: (id: string, name: string) => Promise<void>;
  relocate: (id: string, path: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function createProjectsStore(deps: ProjectsDeps) {
  return createStore<ProjectsState>()((set, get) => ({
    projects: [],
    activeId: null,
    view: "loading",

    init: async () => {
      try {
        const projects = await listProjects();
        const saved = await getSetting<string>(ACTIVE_KEY);
        set({ projects });
        const target = startupProject(projects, saved);
        if (target) await get().open(target);
        else set({ view: "home" });
      } catch (error) {
        set({ view: "error", error: String(error) });
      }
    },

    open: async (id) => {
      await flushAll();
      await openProject(id);
      await deps.loadWorkspaces(id);
      const now = Date.now();
      set((s) => ({
        activeId: id,
        view: "project",
        projects: s.projects.map((p) => (p.id === id ? { ...p, lastOpenedAt: now } : p)),
      }));
      await setSetting(ACTIVE_KEY, id);
    },

    add: async (path) => {
      const project = await createProject(path);
      set((s) => ({ projects: [...s.projects, project] }));
      await get().open(project.id);
    },

    goHome: () => {
      set({ view: "home" });
      void get().refresh();
    },

    close: async () => {
      set({ view: "home", activeId: null });
      await setSetting(ACTIVE_KEY, CLOSED);
      void get().refresh();
    },

    rename: async (id, name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      await renameProject(id, trimmed);
      set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, name: trimmed } : p)) }));
    },

    relocate: async (id, path) => {
      const old = get().projects.find((p) => p.id === id)?.path;
      await relocateProject(id, path);
      if (old) deps.rebaseTerminals(old, path);
      set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, path, missing: false } : p)) }));
    },

    remove: async (id) => {
      await flushAll();
      const workspaceIds = await deleteProject(id);
      deps.forgetWorkspaces(workspaceIds);
      const wasActive = get().activeId === id;
      set((s) => ({
        projects: s.projects.filter((p) => p.id !== id),
        ...(wasActive ? { activeId: null, view: "home" as const } : {}),
      }));
      if (wasActive) await setSetting(ACTIVE_KEY, CLOSED);
    },

    refresh: async () => {
      try {
        set({ projects: await listProjects() });
      } catch (error) {
        console.warn("projects not refreshed", error);
      }
    },
  }));
}
let forgetHook: (workspaceIds: string[]) => void = () => undefined;

/** Called once by boot(): forgetting workspaces needs the terminal registry. */
export function setForgetWorkspaces(forget: (workspaceIds: string[]) => void) {
  forgetHook = forget;
}

export const projectsStore = createProjectsStore({
  loadWorkspaces: (projectId) => workspacesStore.getState().load(projectId),
  forgetWorkspaces: (workspaceIds) => forgetHook(workspaceIds),
  rebaseTerminals: rebaseTerminalFolders,
});

export function useProjects<T>(selector: (state: ProjectsState) => T): T {
  return useStore(projectsStore, selector);
}
