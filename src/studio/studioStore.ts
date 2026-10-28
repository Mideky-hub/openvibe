import { toast } from "sonner";
import { createStore, useStore } from "zustand";
import { messages } from "@/i18n";
import { studioRead, studioWrite } from "@/ipc/studio";
import { studioMessages } from "./messages";

/** An open file: `saved` is what the disk holds, `content` what the editor holds. */
export interface StudioTab {
  path: string;
  saved: string;
  content: string;
  status: "loading" | "ready" | "error";
  error?: string;
  saving: boolean;
}

export interface StudioState {
  /** The project's folder while the studio is open; null when it is closed. */
  project: string | null;
  /** Whose the tabs are: they wait for it through a close. */
  tabsFor: string | null;
  tabs: StudioTab[];
  active: string | null;
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const isDirty = (tab: StudioTab) => tab.status === "ready" && tab.content !== tab.saved;

/** The Code Studio (issue #49): one project at a time; its open files stay through a close. */
export const studioStore = createStore<StudioState>()(() => ({ project: null, tabsFor: null, tabs: [], active: null }));

export function useStudio<T>(selector: (state: StudioState) => T): T {
  return useStore(studioStore, selector);
}

const patch = (path: string, change: Partial<StudioTab>) =>
  studioStore.setState((s) => ({ tabs: s.tabs.map((t) => (t.path === path ? { ...t, ...change } : t)) }));

const tabOf = (path: string) => studioStore.getState().tabs.find((t) => t.path === path);

export function openStudio(project: string) {
  if (studioStore.getState().tabsFor === project) studioStore.setState({ project });
  else studioStore.setState({ project, tabsFor: project, tabs: [], active: null });
}

export const closeStudio = () => studioStore.setState({ project: null });

/** Shows the file's tab, reading the file the first time. */
export async function openFile(path: string) {
  const { project } = studioStore.getState();
  if (!project) return;
  if (tabOf(path)) {
    studioStore.setState({ active: path });
    return;
  }
  studioStore.setState((s) => ({ tabs: [...s.tabs, { path, saved: "", content: "", status: "loading", saving: false }], active: path }));
  try {
    const text = await studioRead(project, path);
    patch(path, { saved: text, content: text, status: "ready" });
  } catch (error) {
    patch(path, { status: "error", error: errorText(error) });
  }
}

export function editFile(path: string, content: string) {
  const tab = tabOf(path);
  if (tab && tab.status === "ready" && tab.content !== content) patch(path, { content });
}

/** Writes the file; a failure shows in a toast and the changes stay. Resolves to whether it was written. */
export async function saveFile(path: string): Promise<boolean> {
  const { project } = studioStore.getState();
  const tab = tabOf(path);
  if (!project || !tab || tab.status !== "ready" || tab.saving) return false;
  const content = tab.content;
  patch(path, { saving: true });
  try {
    await studioWrite(project, path, content);
    // What was typed while it was written stays modified.
    patch(path, { saved: content, saving: false });
    return true;
  } catch (error) {
    patch(path, { saving: false });
    toast.error(messages(studioMessages).saveFailed(path, errorText(error)));
    return false;
  }
}

/** Closes the tab, losing its unsaved changes: the screen asks first. */
export function closeTab(path: string) {
  studioStore.setState((s) => {
    const index = s.tabs.findIndex((t) => t.path === path);
    if (index < 0) return s;
    const tabs = s.tabs.filter((t) => t.path !== path);
    const active = s.active === path ? (tabs[Math.min(index, tabs.length - 1)]?.path ?? null) : s.active;
    return { tabs, active };
  });
}
