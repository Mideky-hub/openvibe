// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import type { Workspace } from "@/ipc/db";
import { createWorkspacesStore, nextDefaultName } from "./workspaces";

/** In-memory stand-in for the Rust workspace commands of project "p1". */
function fakeBackend(initial: string[] = [], activeSetting: string | null = null) {
  let counter = 0;
  const make = (name: string, position: number): Workspace => ({
    id: `w${++counter}`,
    projectId: "p1",
    name,
    position,
    pantheon: null,
  });
  const db = {
    workspaces: initial.map(make),
    settings: new Map<string, unknown>(activeSetting ? [["ui.activeWorkspaceId.p1", activeSetting]] : []),
  };
  mockIPC((cmd, raw) => {
    const args = raw as Record<string, string>;
    switch (cmd) {
      case "list_workspaces":
        return db.workspaces.filter((w) => w.projectId === args.projectId).map((w) => ({ ...w }));
      case "create_workspace": {
        const w = make(args.name, db.workspaces.length);
        db.workspaces.push(w);
        return w;
      }
      case "rename_workspace":
        db.workspaces = db.workspaces.map((w) => (w.id === args.id ? { ...w, name: args.name } : w));
        return;
      case "delete_workspace":
        db.workspaces = db.workspaces.filter((w) => w.id !== args.id);
        return;
      case "set_workspace_pantheon":
        db.workspaces = db.workspaces.map((w) => (w.id === args.id ? { ...w, pantheon: args.pantheon } : w));
        return;
      case "get_setting":
        return db.settings.get(args.key) ?? null;
      case "set_setting":
        db.settings.set(args.key, (raw as { value: unknown }).value);
        return;
    }
  });
  return db;
}

let store: ReturnType<typeof createWorkspacesStore>;
const state = () => store.getState();
const names = () => state().workspaces.map((w) => w.name);
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  store = createWorkspacesStore();
});
afterEach(() => clearMocks());

describe("nextDefaultName", () => {
  it("uses the smallest free number", () => {
    const ws = (...n: string[]) =>
      n.map((name, i) => ({ id: String(i), projectId: "p1", name, position: i, pantheon: null }));
    expect(nextDefaultName([])).toBe("Workspace 1");
    expect(nextDefaultName(ws("Workspace 2"))).toBe("Workspace 1");
    expect(nextDefaultName(ws("Workspace 1", "Workspace 2"))).toBe("Workspace 3");
  });
});

describe("workspaces store", () => {
  it("creates a first workspace when a project has none", async () => {
    const db = fakeBackend();
    await state().load("p1");
    expect(names()).toEqual(["Workspace 1"]);
    expect(db.workspaces).toHaveLength(1);
    expect(state().status).toBe("ready");
    expect(state().projectId).toBe("p1");
  });

  it("reopens the workspace that was active last time in this project", async () => {
    fakeBackend(["A", "B"], "w2");
    await state().load("p1");
    expect(state().activeId).toBe("w2");
  });

  it("falls back to the first workspace when the saved one is gone", async () => {
    fakeBackend(["A"], "deleted");
    await state().load("p1");
    expect(state().activeId).toBe("w1");
  });

  it("creates a workspace in the project, makes it active and remembers it", async () => {
    const db = fakeBackend(["Workspace 1"]);
    await state().load("p1");
    await state().create();
    await settled();
    expect(names()).toEqual(["Workspace 1", "Workspace 2"]);
    expect(db.workspaces[1].projectId).toBe("p1");
    expect(db.settings.get("ui.activeWorkspaceId.p1")).toBe(state().activeId);
  });

  it("renames with trimming and ignores blank names", async () => {
    const db = fakeBackend(["A"]);
    await state().load("p1");
    await state().rename("w1", "  Front  ");
    await state().rename("w1", "   ");
    expect(names()).toEqual(["Front"]);
    expect(db.workspaces[0].name).toBe("Front");
  });

  it("refuses a name another workspace of the project already has, case aside", async () => {
    const db = fakeBackend(["A", "Front"]);
    await state().load("p1");
    await expect(state().rename("w1", " front ")).rejects.toThrow("front");
    expect(names()).toEqual(["A", "Front"]);
    expect(db.workspaces[0].name).toBe("A");
    await state().rename("w2", "FRONT");
    expect(names()).toEqual(["A", "FRONT"]);
  });

  it("never removes the last workspace", async () => {
    const db = fakeBackend(["A"]);
    await state().load("p1");
    await state().remove("w1");
    expect(names()).toEqual(["A"]);
    expect(db.workspaces).toHaveLength(1);
  });

  it("selects the next workspace when the active one is removed, or the previous when it was last", async () => {
    fakeBackend(["A", "B", "C"]);
    await state().load("p1");
    state().select("w2");
    await state().remove("w2");
    expect(state().activeId).toBe("w3");
    await state().remove("w3");
    expect(state().activeId).toBe("w1");
  });

  it("saves the pantheon of a workspace", async () => {
    const db = fakeBackend(["A"]);
    await state().load("p1");
    await state().setPantheon("w1", "greek");
    expect(state().workspaces[0].pantheon).toBe("greek");
    expect(db.workspaces[0].pantheon).toBe("greek");
  });

  it("chooses the pantheon of a workspace once", async () => {
    const db = fakeBackend(["A"]);
    await state().load("p1");
    expect(await state().ensurePantheon("w1")).toBe("egyptian");
    expect(await state().ensurePantheon("w1")).toBe("egyptian");
    expect(db.workspaces[0].pantheon).toBe("egyptian");
  });

  it("gives the agents outside groups a pantheon no group uses", async () => {
    const db = fakeBackend(["A"]);
    await state().load("p1");
    expect(await state().ensurePantheon("w1", ["egyptian", "greek"])).toBe("norse");
    expect(db.workspaces[0].pantheon).toBe("norse");
  });

  it("reports a backend failure", async () => {
    mockIPC(() => {
      throw { kind: "db", message: "disk I/O error" };
    });
    await state().load("p1");
    expect(state().status).toBe("error");
    expect(state().error).toContain("disk I/O error");
  });
});
