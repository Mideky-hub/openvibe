import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFileSession, isDirty, type StudioIo } from "./fileSession";
import type { WriteOutcome } from "./ipc";

/** A disk in memory, whose version is its text: enough to see every comparison. */
function fakeDisk(files: Record<string, string>) {
  const disk = { ...files };
  const io: StudioIo & { writes: { file: string; text: string; expected: string | null }[] } = {
    writes: [],
    read: vi.fn(async (file: string) => {
      if (!(file in disk)) throw new Error(`absent: ${file}`);
      if (disk[file].includes("\0")) throw new Error("binaire");
      return { text: disk[file], version: `v:${disk[file]}` };
    }),
    version: vi.fn(async (file: string) => (file in disk ? `v:${disk[file]}` : null)),
    write: vi.fn(async (file: string, text: string, expected: string | null): Promise<WriteOutcome> => {
      const current = file in disk ? `v:${disk[file]}` : null;
      if (current !== expected) return { status: "conflict", disk: current };
      disk[file] = text;
      io.writes.push({ file, text, expected });
      return { status: "saved", version: `v:${text}` };
    }),
  };
  return { disk, io };
}

const onClose = vi.fn();
const onQuit = vi.fn();
beforeEach(() => {
  onClose.mockClear();
  onQuit.mockClear();
});

function session(files: Record<string, string>) {
  const { disk, io } = fakeDisk(files);
  const store = createFileSession(io, { onClose, onQuit });
  return { disk, io, store, s: () => store.getState() };
}

describe("opening a file", () => {
  it("shows it in LF, clean", async () => {
    const { store, s } = session({ "a.ts": "x\r\ny\r\n" });
    await s().open("a.ts");
    expect(s()).toMatchObject({ file: "a.ts", draft: "x\ny\n", baseline: "x\ny\n", refused: null });
    expect(isDirty(store.getState())).toBe(false);
  });

  it("says why a file cannot be opened", async () => {
    const { s } = session({ "a.bin": "\0" });
    await s().open("a.bin");
    expect(s()).toMatchObject({ file: "a.bin", refused: "binaire", draft: "" });
  });

  it("ignores the answer of a file left in the meantime", async () => {
    const { io, s } = session({ "a.ts": "a", "b.ts": "b" });
    let finish: (value: { text: string; version: string }) => void = () => {};
    vi.mocked(io.read).mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    const first = s().open("a.ts");
    await s().open("b.ts");
    finish({ text: "late", version: "v:late" });
    await first;
    expect(s()).toMatchObject({ file: "b.ts", draft: "b" });
  });

  it("gives the editor a new document at each opening", async () => {
    const { s } = session({ "a.ts": "a", "b.ts": "b" });
    await s().open("a.ts");
    const first = s().revision;
    await s().open("b.ts");
    expect(s().revision.id).toBeGreaterThan(first.id);
    expect(s().revision.kind).toBe("open");
  });
});

describe("saving", () => {
  it("writes against the version it read, with the file's line endings", async () => {
    const { disk, io, store, s } = session({ "a.ts": "x\r\ny\r\n" });
    await s().open("a.ts");
    s().edit("x\nz\n");
    expect(isDirty(store.getState())).toBe(true);
    expect(await s().save()).toBe(true);
    expect(disk["a.ts"]).toBe("x\r\nz\r\n");
    expect(io.writes[0].expected).toBe("v:x\r\ny\r\n");
    expect(isDirty(store.getState())).toBe(false);
    expect(s().version).toBe("v:x\r\nz\r\n");
  });

  it("writes nothing when nothing changed", async () => {
    const { io, s } = session({ "a.ts": "x" });
    await s().open("a.ts");
    expect(await s().save()).toBe(true);
    expect(io.write).not.toHaveBeenCalled();
  });

  it("keeps what is typed while the save runs as unsaved", async () => {
    const { io, store, s } = session({ "a.ts": "x" });
    await s().open("a.ts");
    s().edit("one");
    let finish: (outcome: WriteOutcome) => void = () => {};
    vi.mocked(io.write).mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    const saving = s().save();
    s().edit("one two");
    finish({ status: "saved", version: "v:one" });
    await saving;
    expect(s().baseline).toBe("one");
    expect(isDirty(store.getState())).toBe(true);
  });

  it("never overwrites a file an agent wrote: the choice comes back", async () => {
    const { disk, io, s } = session({ "a.ts": "mine" });
    await s().open("a.ts");
    s().edit("my edit");
    disk["a.ts"] = "agent";
    expect(await s().save()).toBe(false);
    expect(disk["a.ts"]).toBe("agent");
    expect(io.writes).toEqual([]);
    expect(s().disk).toEqual({ version: "v:agent" });
    expect(s().draft).toBe("my edit");
  });

  it("does not mark another file as saved when the write answers late", async () => {
    const { io, s } = session({ "a.ts": "a", "b.ts": "b" });
    await s().open("a.ts");
    s().edit("a!");
    let finish: (outcome: WriteOutcome) => void = () => {};
    vi.mocked(io.write).mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    const saving = s().save();
    s().edit("a");
    await s().open("b.ts");
    finish({ status: "saved", version: "v:a!" });
    await saving;
    expect(s()).toMatchObject({ file: "b.ts", baseline: "b", draft: "b", version: "v:b", saving: false });
  });

  it("says when the write fails, and keeps the buffer", async () => {
    const { io, s } = session({ "a.ts": "x" });
    await s().open("a.ts");
    s().edit("y");
    vi.mocked(io.write).mockRejectedValueOnce(new Error("disque plein"));
    expect(await s().save()).toBe(false);
    expect(s()).toMatchObject({ error: "disque plein", draft: "y", saving: false });
  });
});

describe("the conflict", () => {
  async function inConflict() {
    const parts = session({ "a.ts": "mine" });
    await parts.s().open("a.ts");
    parts.s().edit("my edit");
    parts.disk["a.ts"] = "agent";
    await parts.s().poll();
    return parts;
  }

  it("Reload takes the disk's version", async () => {
    const { store, s } = await inConflict();
    await s().reload();
    expect(s()).toMatchObject({ draft: "agent", baseline: "agent", disk: null });
    expect(isDirty(store.getState())).toBe(false);
  });

  it("Overwrite writes against the version seen on the disk", async () => {
    const { disk, s } = await inConflict();
    await s().overwrite();
    expect(disk["a.ts"]).toBe("my edit");
    expect(s().disk).toBeNull();
  });

  it("Overwrite stays a conflict if the disk moved again since it was seen", async () => {
    const { disk, s } = await inConflict();
    disk["a.ts"] = "agent again";
    await s().overwrite();
    expect(disk["a.ts"]).toBe("agent again");
    expect(s().disk).toEqual({ version: "v:agent again" });
  });
});

describe("watching the disk (spec studio code §3)", () => {
  it("reloads a clean buffer without a word", async () => {
    const { disk, s } = session({ "a.ts": "old" });
    await s().open("a.ts");
    disk["a.ts"] = "new";
    await s().poll();
    expect(s()).toMatchObject({ draft: "new", baseline: "new", disk: null });
    expect(s().revision.kind).toBe("reload");
  });

  it("leaves a modified buffer alone and says so", async () => {
    const { disk, s } = session({ "a.ts": "old" });
    await s().open("a.ts");
    s().edit("mine");
    disk["a.ts"] = "new";
    await s().poll();
    expect(s()).toMatchObject({ draft: "mine", disk: { version: "v:new" } });
  });

  it("clears the warning when the disk comes back to what was read", async () => {
    const { disk, s } = session({ "a.ts": "old" });
    await s().open("a.ts");
    s().edit("mine");
    disk["a.ts"] = "new";
    await s().poll();
    disk["a.ts"] = "old";
    await s().poll();
    expect(s().disk).toBeNull();
  });

  it("says when the file is gone, keeps the buffer, and can write it back", async () => {
    const { disk, s } = session({ "a.ts": "old" });
    await s().open("a.ts");
    delete disk["a.ts"];
    await s().poll();
    expect(s()).toMatchObject({ draft: "old", disk: { version: null } });
    await s().overwrite();
    expect(disk["a.ts"]).toBe("old");
    expect(s().disk).toBeNull();
  });

  it("keeps a clean buffer when the new content cannot be read, and asks only once", async () => {
    const { disk, io, s } = session({ "a.ts": "old" });
    await s().open("a.ts");
    disk["a.ts"] = "bin\0";
    await s().poll();
    expect(s()).toMatchObject({ draft: "old", error: "binaire", disk: { version: "v:bin\0" } });
    vi.mocked(io.read).mockClear();
    await s().poll();
    expect(io.read).not.toHaveBeenCalled();
  });

  it("does not take its own save for an outside change", async () => {
    const { io, s } = session({ "a.ts": "old" });
    await s().open("a.ts");
    s().edit("new");
    let answer: (version: string | null) => void = () => {};
    vi.mocked(io.version).mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    const polling = s().poll();
    await s().save();
    answer("v:old");
    await polling;
    expect(s()).toMatchObject({ disk: null, version: "v:new" });
  });

  it("does not replace what is typed during a silent reload", async () => {
    const { disk, io, s } = session({ "a.ts": "old" });
    await s().open("a.ts");
    disk["a.ts"] = "new";
    let finish: (value: { text: string; version: string }) => void = () => {};
    vi.mocked(io.read).mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    const polling = s().poll();
    await vi.waitFor(() => expect(io.read).toHaveBeenCalledTimes(2));
    s().edit("old, typed");
    finish({ text: "new", version: "v:new" });
    await polling;
    expect(s()).toMatchObject({ draft: "old, typed", baseline: "old", disk: { version: "v:new" } });
  });

  it("does not poll while a save runs", async () => {
    const { io, s } = session({ "a.ts": "old" });
    await s().open("a.ts");
    s().edit("new");
    const saving = s().save();
    await s().poll();
    expect(io.version).not.toHaveBeenCalled();
    await saving;
  });

  it("does not poll a refused file, nor without a file", async () => {
    const { io, s } = session({ "a.bin": "\0" });
    await s().poll();
    await s().open("a.bin");
    await s().poll();
    expect(io.version).not.toHaveBeenCalled();
  });
});

describe("the guard on unsaved changes (spec studio code §6)", () => {
  async function edited() {
    const parts = session({ "a.ts": "a", "b.ts": "b" });
    await parts.s().open("a.ts");
    parts.s().edit("a!");
    return parts;
  }

  it("lets a clean buffer go at once", async () => {
    const { s } = session({ "a.ts": "a", "b.ts": "b" });
    await s().open("a.ts");
    await s().open("b.ts");
    expect(s().file).toBe("b.ts");
    s().requestClose();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("holds a switch of file, and Save then goes on", async () => {
    const { disk, s } = await edited();
    await s().open("b.ts");
    expect(s()).toMatchObject({ file: "a.ts", pending: { kind: "switch", file: "b.ts" } });
    await s().resolve("save");
    expect(disk["a.ts"]).toBe("a!");
    expect(s()).toMatchObject({ file: "b.ts", pending: null });
  });

  it("Don't save goes on and writes nothing", async () => {
    const { disk, s } = await edited();
    await s().open("b.ts");
    await s().resolve("discard");
    expect(disk["a.ts"]).toBe("a");
    expect(s()).toMatchObject({ file: "b.ts", pending: null });
  });

  it("Cancel stays where it was, buffer included", async () => {
    const { s } = await edited();
    s().requestClose();
    await s().resolve("cancel");
    expect(onClose).not.toHaveBeenCalled();
    expect(s()).toMatchObject({ file: "a.ts", draft: "a!", pending: null });
  });

  it("holds the closing of the studio", async () => {
    const { s } = await edited();
    s().requestClose();
    expect(onClose).not.toHaveBeenCalled();
    await s().resolve("discard");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("drops what was asked when Save meets a conflict: the banner decides", async () => {
    const { disk, s } = await edited();
    s().requestClose();
    disk["a.ts"] = "agent";
    await s().resolve("save");
    expect(onClose).not.toHaveBeenCalled();
    expect(s()).toMatchObject({ pending: null, disk: { version: "v:agent" }, draft: "a!" });
  });

  it("holds the closing of the window, then lets it through", async () => {
    const { store, s } = await edited();
    expect(s().holdQuit()).toBe(true);
    await s().resolve("discard");
    expect(onQuit).toHaveBeenCalledOnce();
    expect(isDirty(store.getState())).toBe(false);
    expect(s().holdQuit()).toBe(false);
  });

  it("does not hold the window for a clean buffer", async () => {
    const { s } = session({ "a.ts": "a" });
    await s().open("a.ts");
    expect(s().holdQuit()).toBe(false);
  });
});

it("can drop a file that is gone", async () => {
  const { disk, s } = session({ "a.ts": "old" });
  await s().open("a.ts");
  delete disk["a.ts"];
  await s().poll();
  s().dropFile();
  expect(s()).toMatchObject({ file: null, disk: null, draft: "" });
});
