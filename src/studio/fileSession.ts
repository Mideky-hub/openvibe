import { createStore } from "zustand";
import type { OpenedFile, WriteOutcome } from "./ipc";
import { detectEol, toLf, withEol, type Eol } from "./text";

export interface StudioIo {
  read: (file: string) => Promise<OpenedFile>;
  version: (file: string) => Promise<string | null>;
  write: (file: string, text: string, expected: string | null) => Promise<WriteOutcome>;
}

export interface SessionExits {
  onClose: () => void;
  onQuit: () => void;
}

/** What waits for the answer of the unsaved changes dialog. */
export type Pending = { kind: "switch"; file: string } | { kind: "close" } | { kind: "quit" };

/** What the editor must take from `draft`: a new document, or the same one reloaded (the cursor stays). */
export interface Revision {
  id: number;
  kind: "open" | "reload";
}

export interface SessionState {
  file: string | null;
  loading: boolean;
  /** Why `file` cannot be edited: binary, too big. */
  refused: string | null;
  /** The text in step with the disk, in LF. */
  baseline: string;
  /** The text in the editor, in LF. */
  draft: string;
  revision: Revision;
  /** Where the buffer stands against the disk: the version it was read or written at. */
  version: string | null;
  eol: Eol;
  /** The disk moved from `version` and only the user can decide; `version: null` when the file is gone. */
  disk: { version: string | null } | null;
  pending: Pending | null;
  saving: boolean;
  /** The last write or reload that failed. */
  error: string | null;
  open: (file: string) => Promise<void>;
  edit: (text: string) => void;
  /** True when the disk has the buffer. */
  save: () => Promise<boolean>;
  /** Compares the disk with the buffer (spec studio code §3). */
  poll: () => Promise<void>;
  reload: () => Promise<void>;
  /** Writes the buffer over what the disk was last seen to hold; another change is another conflict. */
  overwrite: () => Promise<void>;
  dropFile: () => void;
  requestClose: () => void;
  /** True when the window must wait for the dialog. */
  holdQuit: () => boolean;
  resolve: (answer: "save" | "discard" | "cancel") => Promise<void>;
}

export const isDirty = (s: Pick<SessionState, "draft" | "baseline">) => s.draft !== s.baseline;

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

const empty = { refused: null, baseline: "", draft: "", version: null, eol: "\n", disk: null, error: null } as const;

/**
 * One open file against a disk that agents write to (spec studio code §3):
 * every write goes through the version the buffer knows, and nothing here
 * replaces a buffer holding changes without being told to.
 */
export function createFileSession(io: StudioIo, exits: SessionExits) {
  // Moves at every read or write of the buffer: the answer to an older question is dropped.
  let generation = 0;
  let revisions = 0;

  const store = createStore<SessionState>()((set, get) => {
    const load = async (file: string, kind: Revision["kind"], unlessEdited = false) => {
      const asked = ++generation;
      const keeping = kind === "reload";
      if (!keeping) set({ ...empty, file, loading: true });
      try {
        const { text, version } = await io.read(file);
        if (asked !== generation) return;
        // Typed while the silent reload was reading: the buffer now has changes to protect.
        if (unlessEdited && isDirty(get())) return set({ disk: { version } });
        const lf = toLf(text);
        set({ ...empty, file, loading: false, baseline: lf, draft: lf, version, eol: detectEol(text), revision: { id: ++revisions, kind } });
      } catch (error) {
        if (asked !== generation) return;
        if (keeping) throw error;
        set({ ...empty, file, loading: false, refused: errorText(error), revision: { id: ++revisions, kind } });
      }
    };

    const write = async (expected: string | null): Promise<boolean> => {
      const { file, draft, eol } = get();
      if (!file) return false;
      const asked = ++generation;
      set({ saving: true, error: null });
      try {
        const outcome = await io.write(file, withEol(draft, eol), expected);
        // Another file was opened meanwhile: this answer says nothing of it.
        if (asked !== generation) {
          set({ saving: false });
          return false;
        }
        if (outcome.status === "saved") {
          set({ baseline: draft, version: outcome.version, disk: null, saving: false });
          return true;
        }
        set({ disk: { version: outcome.disk }, pending: null, saving: false });
      } catch (error) {
        set({ error: errorText(error), pending: null, saving: false });
      }
      return false;
    };

    const proceed = async (pending: Pending) => {
      if (pending.kind === "switch") await load(pending.file, "open");
      else if (pending.kind === "close") exits.onClose();
      else {
        // The window comes back through here to close: nothing must hold it again.
        set((s) => ({ draft: s.baseline }));
        exits.onQuit();
      }
    };

    return {
      file: null,
      loading: false,
      revision: { id: 0, kind: "open" },
      pending: null,
      saving: false,
      ...empty,
      open: async (file) => {
        if (file === get().file) return;
        if (isDirty(get())) set({ pending: { kind: "switch", file } });
        else await load(file, "open");
      },
      edit: (text) => set({ draft: text }),
      save: async () => {
        const { file, refused, saving, version } = get();
        if (!file || refused || saving) return false;
        return isDirty(get()) ? write(version) : true;
      },
      poll: async () => {
        const { file, refused, loading, saving } = get();
        if (!file || refused || loading || saving) return;
        const asked = generation;
        let seen: string | null;
        try {
          seen = await io.version(file);
        } catch {
          return; // The next round asks again; a read that fails decides nothing.
        }
        if (asked !== generation) return;
        const { version, disk } = get();
        if (seen === version) {
          if (disk) set({ disk: null, error: null });
        } else if (disk?.version !== seen) {
          if (seen === null || isDirty(get())) set({ disk: { version: seen } });
          else await load(file, "reload", true).catch((error: unknown) => set({ error: errorText(error), disk: { version: seen } }));
        }
      },
      reload: async () => {
        const { file } = get();
        if (file) await load(file, "reload").catch((error: unknown) => set({ error: errorText(error) }));
      },
      overwrite: async () => {
        const { disk } = get();
        if (disk) await write(disk.version);
      },
      dropFile: () => {
        generation++;
        set({ ...empty, file: null });
      },
      requestClose: () => {
        if (isDirty(get())) set({ pending: { kind: "close" } });
        else exits.onClose();
      },
      holdQuit: () => {
        if (!isDirty(get())) return false;
        set({ pending: { kind: "quit" } });
        return true;
      },
      resolve: async (answer) => {
        const { pending } = get();
        if (!pending) return;
        if (answer === "cancel") {
          set({ pending: null });
        } else if (answer === "discard" || (await get().save())) {
          set({ pending: null });
          await proceed(pending);
        }
      },
    };
  });
  return store;
}

export type FileSession = ReturnType<typeof createFileSession>;
