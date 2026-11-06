import { createStore, useStore } from "zustand";
import {
  createWorkspace,
  deleteSetting,
  deleteWorkspace,
  getSetting,
  listWorkspaces,
  renameWorkspace,
  reorderWorkspaces,
  setSetting,
  setWorkspacePantheon,
  type Workspace,
  type WorkspaceKind,
} from "@/ipc/db";
import { nextPantheon } from "@/fleet/names";
import { messages } from "@/i18n";
import { storeMessages } from "./messages";

export type { Workspace, WorkspaceKind };

/** Plan 2 kept a single active workspace; it seeds the first project opened. */
const LEGACY_ACTIVE_KEY = "ui.activeWorkspaceId";
/** Before the order moved to the database, a drag saved the ids in this setting. */
const legacyOrderKey = (projectId: string) => `ui.workspaceOrder.${projectId}`;
const activeKey = (projectId: string) => `ui.activeWorkspaceId.${projectId}`;

export interface WorkspacesState {
  projectId: string | null;
  workspaces: Workspace[];
  activeId: string | null;
  /** The last canvas workspace on screen: where the code workspace inserts its files. */
  lastCanvasId: string | null;
  status: "loading" | "ready" | "error";
  error?: string;
  /** Loads the workspaces of a project, creating one if it has none. */
  load: (projectId: string) => Promise<void>;
  create: () => Promise<void>;
  /** Selects the project's code workspace, creating it the first time; resolves with its id. */
  openCode: () => Promise<string | null>;
  rename: (id: string, name: string) => Promise<void>;
  /** Deletes a workspace (never the last one) and selects its neighbor if it was active. */
  remove: (id: string) => Promise<void>;
  select: (id: string) => void;
  /** Puts a tab at `index` (clamped); the order is saved with the workspaces. */
  move: (id: string, index: number) => Promise<void>;
  setPantheon: (id: string, pantheon: string) => Promise<void>;
  /**
   * The pantheon of the agents outside any group, chosen and saved on first
   * use; it avoids `taken`, the pantheons of the workspace's groups.
   */
  ensurePantheon: (id: string, taken?: readonly string[]) => Promise<string>;
}

/** Older rows (and an unknown kind) read as a canvas. */
const withKind = (w: Workspace): Workspace => ({ ...w, kind: w.kind === "code" ? "code" : "canvas" });

export const isCode = (w: Workspace | undefined) => w?.kind === "code";

/** The last canvas workspace is never deleted; the code workspace always may be. */
export function canRemove(workspaces: readonly Workspace[], workspace: Workspace): boolean {
  return isCode(workspace) || workspaces.filter((w) => !isCode(w)).length > 1;
}

/** "Workspace N" with the smallest N not already taken. */
export function nextDefaultName(workspaces: Workspace[]): string {
  const taken = new Set(workspaces.map((w) => w.name.toLowerCase()));
  let n = 1;
  while (taken.has(`workspace ${n}`)) n++;
  return `Workspace ${n}`;
}

/** One-off: applies the tab order saved in the old setting, then drops the key. */
async function migrateLegacyOrder(projectId: string, workspaces: Workspace[]): Promise<Workspace[]> {
  const key = legacyOrderKey(projectId);
  const saved = await getSetting<unknown>(key);
  if (saved === null || saved === undefined) return workspaces;
  const known = new Map(workspaces.map((w) => [w.id, w]));
  const ids = (Array.isArray(saved) ? saved : []).filter((id): id is string => typeof id === "string" && known.has(id));
  const ordered = [...new Set(ids)].map((id) => known.get(id)!);
  const next = [...ordered, ...workspaces.filter((w) => !ordered.includes(w))];
  if (ordered.length > 0) await reorderWorkspaces(projectId, next.map((w) => w.id));
  await deleteSetting(key);
  return ordered.length > 0 ? next : workspaces;
}

export function createWorkspacesStore() {
  const store = createStore<WorkspacesState>()((set, get) => {
    const rememberActive = (id: string) => {
      const projectId = get().projectId;
      if (!projectId) return;
      setSetting(activeKey(projectId), id).catch((error: unknown) => console.warn("active workspace not saved", error));
    };

    return {
      projectId: null,
      workspaces: [],
      activeId: null,
      lastCanvasId: null,
      status: "loading",

      load: async (projectId) => {
        set({ projectId, workspaces: [], activeId: null, lastCanvasId: null, status: "loading", error: undefined });
        try {
          let workspaces = (await listWorkspaces(projectId)).map(withKind);
          workspaces = await migrateLegacyOrder(projectId, workspaces);
          if (!workspaces.some((w) => !isCode(w)))
            workspaces = [withKind(await createWorkspace(projectId, nextDefaultName(workspaces))), ...workspaces];
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
        const workspace = withKind(await createWorkspace(projectId, nextDefaultName(get().workspaces)));
        set((s) => ({ workspaces: [...s.workspaces, workspace], activeId: workspace.id }));
        rememberActive(workspace.id);
      },

      openCode: async () => {
        const projectId = get().projectId;
        if (!projectId) return null;
        // One per project: the backend hands back the existing one too.
        let code = get().workspaces.find(isCode);
        if (!code) {
          code = withKind(await createWorkspace(projectId, "Code", "code"));
          const created = code;
          set((s) => ({ workspaces: s.workspaces.some((w) => w.id === created.id) ? s.workspaces : [...s.workspaces, created] }));
        }
        get().select(code.id);
        return code.id;
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
        if (index === -1 || !canRemove(workspaces, workspaces[index])) return;
        await deleteWorkspace(id);
        const remaining = workspaces.filter((w) => w.id !== id);
        const nextActive = id === activeId ? remaining[Math.min(index, remaining.length - 1)].id : activeId;
        set((s) => ({ lastCanvasId: s.lastCanvasId === id ? null : s.lastCanvasId }));
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
        await reorderWorkspaces(projectId, next.map((w) => w.id)).catch((error: unknown) => console.warn("workspace order not saved", error));
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
  store.subscribe((s) => {
    const active = s.workspaces.find((w) => w.id === s.activeId);
    if (active && !isCode(active) && s.lastCanvasId !== active.id) store.setState({ lastCanvasId: active.id });
  });
  return store;
}

export const workspacesStore = createWorkspacesStore();

export function useWorkspaces<T>(selector: (state: WorkspacesState) => T): T {
  return useStore(workspacesStore, selector);
}
