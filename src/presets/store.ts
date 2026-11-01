import { createStore, useStore } from "zustand";
import { messages } from "@/i18n";
import { getSetting, setSetting } from "@/ipc/db";
import { presetsMessages } from "./messages";
import { PRESETS_VERSION, readPresets, withoutPreset, withPreset, type TeamPreset } from "./model";

/** The setting that holds the presets (spec presets §3). */
export const PRESETS_KEY = "presets.teams";

interface PresetsState {
  presets: TeamPreset[];
  /** The saved list was read: nothing is saved over a list not read. */
  loaded: boolean;
  load: () => Promise<void>;
  /** False when the list is full. */
  save: (preset: TeamPreset) => Promise<boolean>;
  remove: (id: string) => Promise<void>;
}

const persist = (presets: TeamPreset[]) => setSetting(PRESETS_KEY, { version: PRESETS_VERSION, presets });

let reading: Promise<void> | null = null;

/** The list before changing it: a failed read stops the change, it does not read as an empty list. */
async function read() {
  await presetsStore.getState().load();
  if (!presetsStore.getState().loaded) throw new Error(messages(presetsMessages).notRead);
}

export const presetsStore = createStore<PresetsState>()((set, get) => ({
  presets: [],
  loaded: false,
  load: () => {
    if (get().loaded) return Promise.resolve();
    // One read at a time: the palette and a save ask together.
    reading ??= getSetting<unknown>(PRESETS_KEY)
      .then((raw) => set({ presets: readPresets(raw), loaded: true }))
      .catch((error: unknown) => console.warn("presets not read", error))
      .finally(() => {
        reading = null;
      });
    return reading;
  },
  save: async (preset) => {
    await read();
    const next = withPreset(get().presets, preset);
    if (next === null) return false;
    set({ presets: next });
    await persist(next);
    return true;
  },
  remove: async (id) => {
    await read();
    const next = withoutPreset(get().presets, id);
    set({ presets: next });
    await persist(next);
  },
}));

export function usePresets<T>(selector: (state: PresetsState) => T): T {
  return useStore(presetsStore, selector);
}
