import { toast } from "sonner";
import { createStore, useStore } from "zustand";
import { messages } from "@/i18n";
import { studioRead, studioVersion, studioWrite } from "@/ipc/studio";
import { createFileSession, isDirty as sessionIsDirty, type FileSession, type StudioIo } from "./fileSession";
import { studioMessages } from "./messages";

/** An open file: its session holds the text and stands against the disk (spec studio code §3). */
export interface StudioTab {
  path: string;
  session: FileSession;
}

/** A project's open files. */
interface TabSet {
  tabs: StudioTab[];
  active: string | null;
}

export interface StudioState extends TabSet {
  /** The project (its id) while the studio is open; null when it is closed. */
  project: string | null;
  /** Whose the tabs are: they wait for it through a close. */
  tabsFor: string | null;
  /** The tabs of the other projects: leaving a project loses nothing. */
  parked: Record<string, TabSet>;
  /** A line to show once its file is in the editor (Ctrl+G, go-to-file). */
  pendingLine: { path: string; line: number; column?: number } | null;
  /** The window wants to close over unsaved tabs: the user decides. */
  quitting: boolean;
  /** Same as the exported `openFile`. */
  openFile: (path: string) => Promise<void>;
}

export const isDirty = (tab: StudioTab) => sessionIsDirty(tab.session.getState());

/** The Code Studio (issue #49), shown by the code workspace: one project at a time; open files stay through a close. */
export const studioStore = createStore<StudioState>()(() => ({
  project: null,
  tabsFor: null,
  tabs: [],
  active: null,
  parked: {},
  pendingLine: null,
  quitting: false,
  openFile: (path) => openFile(path),
}));

export function useStudio<T>(selector: (state: StudioState) => T): T {
  return useStore(studioStore, selector);
}

const tabOf = (path: string) => studioStore.getState().tabs.find((t) => t.path === path);

const ioFor = (project: string): StudioIo => ({
  read: (path) => studioRead(project, path),
  version: (path) => studioVersion(project, path),
  write: (path, text, expected) => studioWrite(project, path, text, expected),
});

export function openStudio(project: string) {
  const { tabsFor, tabs, active, parked } = studioStore.getState();
  if (tabsFor === project) {
    studioStore.setState({ project });
    return;
  }
  const { [project]: back, ...others } = parked;
  studioStore.setState({
    project,
    tabsFor: project,
    tabs: back?.tabs ?? [],
    active: back?.active ?? null,
    pendingLine: null,
    parked: tabsFor && tabs.length > 0 ? { ...others, [tabsFor]: { tabs, active } } : others,
  });
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
  const session = createFileSession(ioFor(project));
  studioStore.setState((s) => ({ tabs: [...s.tabs, { path, session }], active: path }));
  await session.getState().open(path);
}

export function editFile(path: string, content: string) {
  const session = tabOf(path)?.session.getState();
  if (session && session.file && !session.loading && !session.refused) session.edit(content);
}

/** Writes the tab against the version it knows; a failure shows in a toast, a conflict in the banner, and the changes stay. */
async function saveTab({ path, session }: StudioTab): Promise<boolean> {
  const saved = await session.getState().save();
  const { error } = session.getState();
  if (!saved && error) toast.error(messages(studioMessages).saveFailed(path, error));
  return saved;
}

/** Resolves to whether the disk has the file. */
export async function saveFile(path: string): Promise<boolean> {
  const tab = tabOf(path);
  return tab ? saveTab(tab) : false;
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

/** Every tab with unsaved changes, those of the projects left included. */
export function unsavedTabs(): StudioTab[] {
  const { tabs, parked } = studioStore.getState();
  return [...tabs, ...Object.values(parked).flatMap((set) => set.tabs)].filter(isDirty);
}

/** Saves them all, one by one; false at the first that could not be, its changes kept. */
export async function saveUnsavedTabs(): Promise<boolean> {
  for (const tab of unsavedTabs()) {
    if (await saveTab(tab)) continue;
    if (tab.session.getState().disk) toast.error(messages(studioMessages).saveConflict(tab.path));
    return false;
  }
  return true;
}

export const dropAllTabs = () => studioStore.setState({ tabs: [], active: null, parked: {}, pendingLine: null });

let guard: { check: () => boolean; unsaved: () => boolean } | null = null;

/** While a dialog holds a file, `check` asks whether the window must wait for it (and asks the user); `unsaved` only tells. */
export function guardQuit(check: () => boolean, unsaved: () => boolean = () => false): () => void {
  const mine = { check, unsaved };
  guard = mine;
  return () => {
    if (guard === mine) guard = null;
  };
}

/** Whether the window must wait, the dialog's file first, then the tabs. */
export function holdQuit(): boolean {
  if (guard?.check()) return true;
  if (unsavedTabs().length === 0) return false;
  studioStore.setState({ quitting: true });
  return true;
}

export const hasUnsavedWork = () => (guard?.unsaved() ?? false) || unsavedTabs().length > 0;
