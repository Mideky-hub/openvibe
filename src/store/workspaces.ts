import { createStore, useStore } from "zustand";
import {
  createWorkspace,
  deleteWorkspace,
  getSetting,
  listWorkspaces,
  renameWorkspace,
  setSetting,
  setWorkspacePantheon,
  type Workspace,
} from "@/ipc/db";
import { nextPantheon } from "@/fleet/names";
import { messages } from "@/i18n";
import { storeMessages } from "./messages";

export type { Workspace };

/** Plan 2 kept a single active workspace; it seeds the first project opened. */
const LEGACY_ACTIVE_KEY = "ui.activeWorkspaceId";
const orderKey = (projectId: string) => `ui.workspaceOrder.${projectId}`;
const activeKey = (projectId: string) => `ui.activeWorkspaceId.${projectId}`;

export interface WorkspacesState {
  projectId: string | null;
  workspaces: Workspace[];
  activeId: string | null;
  status: "loading" | "ready" | "error";
  error?: string;
  /** Loads the workspaces of a project, creating one if it has none. */
  load: (projectId: string) => Promise<void>;
  create: () => Promise<void>;
  rename: (id: string, name: string) => Promise<void>;
  /** Deletes a workspace (never the last one) and selects its neighbor if it was active. */
  remove: (id: string) => Promise<void>;
  select: (id: string) => void;
  /** Puts a tab at `index` (clamped); the order is saved in the settings, per project. */
  move: (id: string, index: number) => Promise<void>;
  setPantheon: (id: string, pantheon: string) => Promise<void>;
  /**
   * The pantheon of the agents outside any group, chosen and saved on first
   * use; it avoids `taken`, the pantheons of the workspace's groups.
   */
  ensurePantheon: (id: string, taken?: readonly string[]) => Promise<string>;
}

/** The workspaces in the order saved for the project; unknown ids are dropped, new ones go last. */
export function inSavedOrder(workspaces: Workspace[], saved: unknown): Workspace[] {
  if (!Array.isArray(saved)) return workspaces;
  const rank = (w: Workspace) => {
    const i = saved.indexOf(w.id);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...workspaces].sort((a, b) => rank(a) - rank(b));
}

/** "Workspace N" with the smallest N not already taken. */
export function nextDefaultName(workspaces: Workspace[]): string {
  const taken = new Set(workspaces.map((w) => w.name));
  let n = 1;
  while (taken.has(`Workspace ${n}`)) n++;
  return `Workspace ${n}`;
}

export function createWorkspacesStore() {
  return createStore<WorkspacesState>()((set, get) => {
    const rememberActive = (id: string) => {
      const projectId = get().projectId;
      if (!projectId) return;
      setSetting(activeKey(projectId), id).catch((error: unknown) => console.warn("active workspace not saved", error));
    };

    return {
      projectId: null,
      workspaces: [],
      activeId: null,
      status: "loading",

      load: async (projectId) => {
        set({ projectId, workspaces: [], activeId: null, status: "loading", error: undefined });
        try {
          let workspaces = await listWorkspaces(projectId);
          if (workspaces.length === 0) workspaces = [await createWorkspace(projectId, nextDefaultName([]))];
          workspaces = inSavedOrder(workspaces, await getSetting<unknown>(orderKey(projectId)).catch(() => null));
          const saved = (await getSetting<string>(activeKey(projectId))) ?? (await getSetting<string>(LEGACY_ACTIVE_KEY));
          const activeId = workspaces.some((w) => w.id === saved) ? saved! : workspaces[0].id;
          if (get().projectId === projectId) set({ workspaces, activeId, status: "ready" });
        } catch (error) {
          set({ status: "error", error: String(error) });
        }
      },

      create: async () => {
        const projectId = get().projectId;
        if (!projectId) return;
        const workspace = await createWorkspace(projectId, nextDefaultName(get().workspaces));
        set((s) => ({ workspaces: [...s.workspaces, workspace], activeId: workspace.id }));
        rememberActive(workspace.id);
      },

      rename: async (id, name) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        // Two tabs of one project with the same name cannot be told apart.
        const clash = get().workspaces.some((w) => w.id !== id && w.name.toLowerCase() === trimmed.toLowerCase());
        if (clash) throw new Error(messages(storeMessages).duplicateName(trimmed));
        await renameWorkspace(id, trimmed);
        set((s) => ({ workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, name: trimmed } : w)) }));
      },

      remove: async (id) => {
        const { workspaces, activeId } = get();
        const index = workspaces.findIndex((w) => w.id === id);
        if (index === -1 || workspaces.length === 1) return;
        await deleteWorkspace(id);
        const remaining = workspaces.filter((w) => w.id !== id);
        const nextActive = id === activeId ? remaining[Math.min(index, remaining.length - 1)].id : activeId;
        set({ workspaces: remaining, activeId: nextActive });
        if (nextActive && nextActive !== activeId) rememberActive(nextActive);
      },

      select: (id) => {
        if (id === get().activeId || !get().workspaces.some((w) => w.id === id)) return;
        set({ activeId: id });
        rememberActive(id);
      },

      move: async (id, index) => {
        const { workspaces, projectId } = get();
        const from = workspaces.findIndex((w) => w.id === id);
        if (from === -1 || !projectId) return;
        const next = workspaces.filter((w) => w.id !== id);
        next.splice(Math.max(0, Math.min(index, next.length)), 0, workspaces[from]);
        set({ workspaces: next });
        // The order is a convenience: a refused save keeps it for the session.
        await setSetting(orderKey(projectId), next.map((w) => w.id)).catch((error: unknown) => console.warn("workspace order not saved", error));
      },

      setPantheon: async (id, pantheon) => {
        await setWorkspacePantheon(id, pantheon);
        set((s) => ({ workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, pantheon } : w)) }));
      },

      ensurePantheon: async (id, taken = []) => {
        const workspace = get().workspaces.find((w) => w.id === id);
        if (workspace?.pantheon) return workspace.pantheon;
        const pantheon = nextPantheon(taken);
        await get().setPantheon(id, pantheon);
        return pantheon;
      },
    };
  });
}

export const workspacesStore = createWorkspacesStore();

export function useWorkspaces<T>(selector: (state: WorkspacesState) => T): T {
  return useStore(workspacesStore, selector);
}
