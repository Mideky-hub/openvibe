import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { studioRead, studioVersion, studioWrite } from "@/ipc/studio";
import { closeStudio, closeTab, dropAllTabs, editFile, guardQuit, hasUnsavedWork, holdQuit, isDirty, openFile, openStudio, saveFile, saveUnsavedTabs, studioStore, unsavedTabs } from "./studioStore";

vi.mock("@/ipc/studio", () => ({ studioTree: vi.fn(), studioRead: vi.fn(), studioVersion: vi.fn(), studioWrite: vi.fn() }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

const tab = (path: string) => studioStore.getState().tabs.find((t) => t.path === path)!;
const session = (path: string) => tab(path).session.getState();

beforeEach(() => {
  studioStore.setState({ project: null, tabsFor: null, tabs: [], active: null, parked: {}, quitting: false });
  vi.mocked(studioRead).mockImplementation(async (_project, path) => ({ text: `// ${path}\n`, version: `v:${path}` }));
  vi.mocked(studioVersion).mockImplementation(async (_project, path) => `v:${path}`);
  vi.mocked(studioWrite).mockResolvedValue({ status: "saved", version: "v2" });
  openStudio("p1");
});
afterEach(() => vi.clearAllMocks());

it("opens a file once, reading it from the project", async () => {
  await openFile("src/a.ts");
  await openFile("src/a.ts");
  expect(studioRead).toHaveBeenCalledTimes(1);
  expect(studioRead).toHaveBeenCalledWith("p1", "src/a.ts");
  expect(session("src/a.ts")).toMatchObject({ loading: false, refused: null, draft: "// src/a.ts\n" });
  expect(isDirty(tab("src/a.ts"))).toBe(false);
});

it("is dirty while the content differs from the disk, clean after a save against the version it read", async () => {
  await openFile("src/a.ts");
  editFile("src/a.ts", "changed");
  expect(isDirty(tab("src/a.ts"))).toBe(true);
  editFile("src/a.ts", "// src/a.ts\n");
  expect(isDirty(tab("src/a.ts"))).toBe(false);
  editFile("src/a.ts", "changed");
  expect(await saveFile("src/a.ts")).toBe(true);
  expect(studioWrite).toHaveBeenCalledWith("p1", "src/a.ts", "changed", "v:src/a.ts");
  expect(isDirty(tab("src/a.ts"))).toBe(false);
});

it("keeps the changes and shows a toast when the save fails", async () => {
  vi.mocked(studioWrite).mockRejectedValue(new Error("read-only"));
  await openFile("src/a.ts");
  editFile("src/a.ts", "changed");
  expect(await saveFile("src/a.ts")).toBe(false);
  expect(isDirty(tab("src/a.ts"))).toBe(true);
  expect(session("src/a.ts").saving).toBe(false);
  expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("read-only"));
});

it("does not write a file that failed to read", async () => {
  vi.mocked(studioRead).mockRejectedValue(new Error("gone"));
  await openFile("src/a.ts");
  expect(session("src/a.ts").refused).toBe("gone");
  editFile("src/a.ts", "x");
  expect(await saveFile("src/a.ts")).toBe(false);
  expect(studioWrite).not.toHaveBeenCalled();
});

it("never saves over what changed on the disk: the conflict waits for the user, the changes stay", async () => {
  vi.mocked(studioWrite).mockResolvedValue({ status: "conflict", disk: "agent" });
  await openFile("src/a.ts");
  editFile("src/a.ts", "mine");
  expect(await saveFile("src/a.ts")).toBe(false);
  expect(session("src/a.ts").disk).toEqual({ version: "agent" });
  expect(session("src/a.ts").draft).toBe("mine");

  // Overwriting is writing against the version seen.
  vi.mocked(studioWrite).mockResolvedValue({ status: "saved", version: "v3" });
  await session("src/a.ts").overwrite();
  expect(studioWrite).toHaveBeenLastCalledWith("p1", "src/a.ts", "mine", "agent");
  expect(session("src/a.ts").disk).toBeNull();
});

it("reloads a clean tab that changed on the disk, and warns over a dirty one", async () => {
  await openFile("src/a.ts");
  await openFile("src/b.ts");
  vi.mocked(studioRead).mockResolvedValue({ text: "from the agent\n", version: "agent" });
  vi.mocked(studioVersion).mockResolvedValue("agent");
  await session("src/a.ts").poll();
  expect(session("src/a.ts")).toMatchObject({ draft: "from the agent\n", disk: null, revision: { kind: "reload" } });

  editFile("src/b.ts", "mine");
  await session("src/b.ts").poll();
  expect(session("src/b.ts")).toMatchObject({ draft: "mine", disk: { version: "agent" } });
});

it("brings a CRLF file back in CRLF", async () => {
  vi.mocked(studioRead).mockResolvedValue({ text: "a\r\nb\r\n", version: "v1" });
  await openFile("a.txt");
  expect(session("a.txt").draft).toBe("a\nb\n");
  editFile("a.txt", "a\nc\n");
  await saveFile("a.txt");
  expect(studioWrite).toHaveBeenCalledWith("p1", "a.txt", "a\r\nc\r\n", "v1");
});

it("keeps the tabs through a close, and parks them for another project with nothing lost", async () => {
  await openFile("src/a.ts");
  await openFile("src/b.ts");
  closeTab("src/b.ts");
  expect(studioStore.getState().active).toBe("src/a.ts");
  closeStudio();
  openStudio("p1");
  expect(studioStore.getState().tabs.map((t) => t.path)).toEqual(["src/a.ts"]);

  editFile("src/a.ts", "unsaved");
  openStudio("p2");
  expect(studioStore.getState().tabs).toEqual([]);
  expect(hasUnsavedWork()).toBe(true);
  openStudio("p1");
  expect(studioStore.getState().active).toBe("src/a.ts");
  expect(session("src/a.ts").draft).toBe("unsaved");
});

it("writes a parked tab to its own project", async () => {
  await openFile("src/a.ts");
  editFile("src/a.ts", "unsaved");
  openStudio("p2");
  expect(await saveUnsavedTabs()).toBe(true);
  expect(studioWrite).toHaveBeenCalledWith("p1", "src/a.ts", "unsaved", "v:src/a.ts");
});

it("holds the window over unsaved tabs, and lets it go once they are dropped", async () => {
  await openFile("src/a.ts");
  expect(holdQuit()).toBe(false);
  editFile("src/a.ts", "unsaved");
  expect(holdQuit()).toBe(true);
  expect(studioStore.getState().quitting).toBe(true);
  dropAllTabs();
  expect(unsavedTabs()).toEqual([]);
  expect(holdQuit()).toBe(false);
});

it("asks the dialog holding a file first", async () => {
  await openFile("src/a.ts");
  editFile("src/a.ts", "unsaved");
  const release = guardQuit(() => true, () => true);
  expect(holdQuit()).toBe(true);
  expect(studioStore.getState().quitting).toBe(false);
  release();
  expect(holdQuit()).toBe(true);
  expect(studioStore.getState().quitting).toBe(true);
});

it("stops at a tab that cannot be saved, naming it", async () => {
  vi.mocked(studioWrite).mockResolvedValue({ status: "conflict", disk: "agent" });
  await openFile("src/a.ts");
  editFile("src/a.ts", "mine");
  expect(await saveUnsavedTabs()).toBe(false);
  expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("src/a.ts"));
  expect(isDirty(tab("src/a.ts"))).toBe(true);
});
