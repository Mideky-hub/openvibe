import { createStore } from "zustand";

export const shortcutsDialogStore = createStore<{ open: boolean }>()(() => ({ open: false }));

/** « Raccourcis clavier… » of the settings menu (issue #84). */
export const showShortcuts = () => shortcutsDialogStore.setState({ open: true });
