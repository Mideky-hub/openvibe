import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { studioRead, studioWrite } from "@/ipc/studio";
import { closeStudio, closeTab, editFile, isDirty, openFile, openStudio, saveFile, studioStore } from "./studioStore";

vi.mock("@/ipc/studio", () => ({ studioTree: vi.fn(), studioRead: vi.fn(), studioWrite: vi.fn() }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

const tab = (path: string) => studioStore.getState().tabs.find((t) => t.path === path)!;

beforeEach(() => {
  studioStore.setState({ project: null, tabsFor: null, tabs: [], active: null });
  vi.mocked(studioRead).mockImplementation(async (_project, path) => `// ${path}\n`);
  vi.mocked(studioWrite).mockResolvedValue(undefined);
  openStudio("C:/code/proj");
});
afterEach(() => vi.clearAllMocks());

it("opens a file once, reading it from the project", async () => {
  await openFile("src/a.ts");
  await openFile("src/a.ts");
  expect(studioRead).toHaveBeenCalledTimes(1);
  expect(studioRead).toHaveBeenCalledWith("C:/code/proj", "src/a.ts");
  expect(tab("src/a.ts")).toMatchObject({ status: "ready", content: "// src/a.ts\n" });
  expect(isDirty(tab("src/a.ts"))).toBe(false);
});

it("is dirty while the content differs from the disk, clean after a save", async () => {
  await openFile("src/a.ts");
  editFile("src/a.ts", "changed");
  expect(isDirty(tab("src/a.ts"))).toBe(true);
  editFile("src/a.ts", "// src/a.ts\n");
  expect(isDirty(tab("src/a.ts"))).toBe(false);
  editFile("src/a.ts", "changed");
  expect(await saveFile("src/a.ts")).toBe(true);
  expect(studioWrite).toHaveBeenCalledWith("C:/code/proj", "src/a.ts", "changed");
  expect(isDirty(tab("src/a.ts"))).toBe(false);
});

it("keeps the changes and shows a toast when the save fails", async () => {
  vi.mocked(studioWrite).mockRejectedValue(new Error("read-only"));
  await openFile("src/a.ts");
  editFile("src/a.ts", "changed");
  expect(await saveFile("src/a.ts")).toBe(false);
  expect(isDirty(tab("src/a.ts"))).toBe(true);
  expect(tab("src/a.ts").saving).toBe(false);
  expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("read-only"));
});

it("does not write a file that failed to read", async () => {
  vi.mocked(studioRead).mockRejectedValue(new Error("gone"));
  await openFile("src/a.ts");
  expect(tab("src/a.ts")).toMatchObject({ status: "error", error: "gone" });
  editFile("src/a.ts", "x");
  expect(await saveFile("src/a.ts")).toBe(false);
  expect(studioWrite).not.toHaveBeenCalled();
});

it("keeps the tabs through a close, not for another project", async () => {
  await openFile("src/a.ts");
  await openFile("src/b.ts");
  closeTab("src/b.ts");
  expect(studioStore.getState().active).toBe("src/a.ts");
  closeStudio();
  openStudio("C:/code/proj");
  expect(studioStore.getState().tabs.map((t) => t.path)).toEqual(["src/a.ts"]);
  openStudio("C:/code/other");
  expect(studioStore.getState().tabs).toEqual([]);
});
