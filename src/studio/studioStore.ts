import { createStore, useStore } from "zustand";

/** Whether the code studio is open. Light on purpose: the rail and the palette import it, CodeMirror stays out of the first load. */
export const studioStore = createStore<{ open: boolean }>()(() => ({ open: false }));

export const useStudioOpen = () => useStore(studioStore, (s) => s.open);
export const openStudio = () => studioStore.setState({ open: true });
export const closeStudio = () => studioStore.setState({ open: false });

let hold: (() => boolean) | null = null;

/** While the studio is open, `check` tells whether the window must wait for it. */
export function guardQuit(check: () => boolean): () => void {
  hold = check;
  return () => {
    if (hold === check) hold = null;
  };
}

export const holdQuit = () => hold?.() ?? false;
