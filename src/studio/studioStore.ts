import { createStore, useStore } from "zustand";

/** Whether the code studio is open. Light on purpose: the rail and the palette import it, CodeMirror stays out of the first load. */
export const studioStore = createStore<{ open: boolean }>()(() => ({ open: false }));

export const useStudioOpen = () => useStore(studioStore, (s) => s.open);
export const openStudio = () => studioStore.setState({ open: true });
export const closeStudio = () => studioStore.setState({ open: false });

let guard: { check: () => boolean; unsaved: () => boolean } | null = null;

/** While a dialog holds a file, `check` asks whether the window must wait for it (and asks the user); `unsaved` only tells. */
export function guardQuit(check: () => boolean, unsaved: () => boolean = () => false): () => void {
  const mine = { check, unsaved };
  guard = mine;
  return () => {
    if (guard === mine) guard = null;
  };
}

export const holdQuit = () => guard?.check() ?? false;
export const hasUnsavedWork = () => guard?.unsaved() ?? false;
