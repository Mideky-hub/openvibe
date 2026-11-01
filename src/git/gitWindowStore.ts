import { createStore, useStore } from "zustand";
import { reviewStore } from "@/review/reviewStore";

interface GitWindowState {
  /** The folder the window shows; null when it is closed. */
  path: string | null;
  open: (path: string) => void;
  close: () => void;
}

/** The git window: it takes the review panel's place, so opening one closes the other (spec fenêtre git §3). */
export const gitWindowStore = createStore<GitWindowState>()((set) => ({
  path: null,
  open: (path) => {
    reviewStore.getState().close();
    set({ path });
  },
  close: () => set({ path: null }),
}));

export function useGitWindow<T>(selector: (state: GitWindowState) => T): T {
  return useStore(gitWindowStore, selector);
}
