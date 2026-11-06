// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { flushAll } from "@/lib/flush";
import { nodesStore } from "@/store/nodes";
import { currentScene, editStoredScene, forgetScene, loadScene, rememberScene } from "./sceneCache";

afterEach(() => {
  forgetScene("w1");
  clearMocks();
});

it("reads a scene once while the first read is still pending (plan F1)", async () => {
  const reads = vi.fn();
  mockIPC((cmd) => {
    if (cmd === "load_workspace") {
      reads();
      return { nodes: [], files: [], elementsJson: null, appStateJson: null };
    }
  });
  const [a, b] = await Promise.all([loadScene("w1"), loadScene("w1")]);
  expect(a).toBe(b);
  expect(reads).toHaveBeenCalledTimes(1);
});

describe("a stored scene being edited (review)", () => {
  const terminal = (id: string, isDeleted = false) => ({ id, type: "embeddable", isDeleted, frameId: null, customData: { kind: "terminal" } });
  const payload = { title: "", name: "", agent: "shell" as const, cwd: "C:/", shell: "default" as const, command: "" };

  it("keeps the row of a node whose element is still to come: the save purges what it does not list", async () => {
    const saved: { nodeIds: string[] }[] = [];
    mockIPC((cmd, args) => {
      if (cmd === "save_scene") saved.push(args as { nodeIds: string[] });
    });
    nodesStore.setState({ nodes: { old: { workspaceId: "w1", kind: "terminal", payload }, gone: { workspaceId: "w1", kind: "terminal", payload }, coming: { workspaceId: "w1", kind: "terminal", payload }, other: { workspaceId: "w2", kind: "terminal", payload } } });
    rememberScene("w1", [] as never, {} as never, {}, []);
    editStoredScene("w1", [terminal("old"), terminal("gone", true)] as never);
    await flushAll();
    expect(saved[0].nodeIds.sort()).toEqual(["coming", "old"]);
    nodesStore.setState({ nodes: {} });
  });

  it("saves one at a time, the last one last: a late older save would purge a newer node", async () => {
    nodesStore.setState({ nodes: {} });
    const sent: string[][] = [];
    const release: (() => void)[] = [];
    mockIPC((cmd, args) => {
      if (cmd !== "save_scene") return undefined;
      sent.push((args as { nodeIds: string[] }).nodeIds);
      return new Promise<void>((resolve) => release.push(resolve));
    });
    rememberScene("w1", [] as never, {} as never, {}, []);
    editStoredScene("w1", [terminal("a")] as never);
    editStoredScene("w1", [terminal("a"), terminal("b")] as never);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sent).toEqual([["a"]]);
    release[0]();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sent).toEqual([["a"], ["a", "b"]]);
    release[1]();
    await flushAll();
  });

  it("is waited for when the window closes", async () => {
    nodesStore.setState({ nodes: {} });
    let done = false;
    let finish: () => void = () => undefined;
    mockIPC((cmd) => {
      if (cmd === "save_scene") return new Promise<void>((resolve) => (finish = resolve));
      return undefined;
    });
    rememberScene("w1", [] as never, {} as never, {}, []);
    editStoredScene("w1", [terminal("a")] as never);
    const closing = flushAll().then(() => (done = true));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(done).toBe(false);
    finish();
    await closing;
    expect(done).toBe(true);
  });
});

describe("a canvas mounted again while the app runs (issue 11)", () => {
  it("starts from the scene as last remembered, not from the one first read", async () => {
    mockIPC((cmd) => (cmd === "load_workspace" ? { nodes: [], files: [], elementsJson: "[]", appStateJson: null } : undefined));
    const first = await loadScene("w1");
    rememberScene("w1", [{ id: "n" }] as never, {} as never, {}, []);
    expect(currentScene("w1", first).initialData.elements).toHaveLength(1);
  });

  it("falls back on the scene it was given when nothing is remembered", async () => {
    const given = { initialData: { elements: [] }, savedFileIds: [] };
    expect(currentScene("w1", given)).toBe(given);
  });
});
