import { createStore } from "zustand";
import { getSetting, setSetting } from "@/ipc/db";

/** ↑ and ↓ go through the last 50 commands (spec habillage §12). */
export const HISTORY_SIZE = 50;

/** One history per project, shared by the command bar and the orchestrators. */
export const historyKey = (projectId: string) => `command.history.${projectId}`;

/** Set once the first-use hint of the command bar was dismissed. */
export const HINT_KEY = "command.hintDismissed";

/** `entries` with `text` added last; an earlier copy moves to the end; blank text is ignored. */
export function pushHistory(entries: readonly string[], text: string): string[] {
  const command = text.trim();
  if (!command) return [...entries];
  return [...entries.filter((entry) => entry !== command), command].slice(-HISTORY_SIZE);
}

/** One step of ↑ or ↓: `index` null is the draft being typed. */
export function browseHistory(entries: readonly string[], index: number | null, direction: "up" | "down"): number | null {
  if (entries.length === 0) return null;
  if (direction === "up") return index === null ? entries.length - 1 : Math.max(0, index - 1);
  if (index === null) return null;
  return index + 1 < entries.length ? index + 1 : null;
}

interface HistoryState {
  projectId: string | null;
  entries: string[];
  /** The saved commands were read: until then a send is kept in memory only. */
  loaded: boolean;
  load: (projectId: string) => Promise<void>;
  add: (text: string) => void;
}

export const historyStore = createStore<HistoryState>()((set, get) => ({
  projectId: null,
  entries: [],
  loaded: false,
  load: async (projectId) => {
    if (get().projectId === projectId) return;
    set({ projectId, entries: [], loaded: false });
    const saved = await getSetting<unknown>(historyKey(projectId)).catch(() => null);
    if (get().projectId !== projectId) return;
    const before = saved === null || !Array.isArray(saved) ? [] : saved.filter((entry): entry is string => typeof entry === "string");
    // Commands sent while the history was being read go after the saved ones, and are saved with them.
    const sent = get().entries;
    const merged = sent.reduce(pushHistory, before.slice(-HISTORY_SIZE));
    set({ entries: merged, loaded: true });
    if (sent.length > 0) {
      setSetting(historyKey(projectId), merged).catch((error: unknown) => console.warn("command history not saved", error));
    }
  },
  add: (text) => {
    const { projectId, entries, loaded } = get();
    const next = pushHistory(entries, text);
    set({ entries: next });
    if (projectId && loaded) {
      setSetting(historyKey(projectId), next).catch((error: unknown) => console.warn("command history not saved", error));
    }
  },
}));
