import { createStore, useStore } from "zustand";

interface NotesUi {
  open: boolean;
  /** The group whose notes are being chosen. */
  attaching: string | null;
}

/** Light on purpose: the rail, the palette and the group menu import it, CodeMirror stays out of the first load. */
export const notesStore = createStore<NotesUi>()(() => ({ open: false, attaching: null }));

export const useNotesUi = <T,>(selector: (state: NotesUi) => T) => useStore(notesStore, selector);
export const openNotes = () => notesStore.setState({ open: true });
export const closeNotes = () => notesStore.setState({ open: false });
export const openGroupNotes = (groupId: string) => notesStore.setState({ attaching: groupId });
export const closeGroupNotes = () => notesStore.setState({ attaching: null });
