import { beforeEach, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { sceneGone, sceneReady } from "@/canvas/sceneReady";
import { installAgent } from "@/fleet/installAgent";
import type { Project } from "@/ipc/db";
import { projectsStore } from "@/store/projects";
import { workspacesStore } from "@/store/workspaces";
import { addProject } from "./addProject";
import { installFromHome } from "./installFromHome";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
vi.mock("@/fleet/installAgent", () => ({ installAgent: vi.fn(() => Promise.resolve("node")) }));
vi.mock("./addProject", () => ({ addProject: vi.fn(() => Promise.resolve()) }));

const project = (id: string, lastOpenedAt: number, missing = false): Project => ({
  id,
  name: id,
  path: `C:/code/${id}`,
  position: 0,
  lastOpenedAt,
  workspaceCount: 1,
  missing,
  liveAgents: 0,
});

const open = vi.fn(async (_id: string) => {
  projectsStore.setState({ view: "project" });
  workspacesStore.setState({ activeId: "w1" });
});

beforeEach(() => {
  vi.mocked(installAgent).mockClear();
  vi.mocked(addProject).mockClear();
  vi.mocked(toast.error).mockClear();
  open.mockClear();
  // Nothing left waiting or on screen from the previous test.
  sceneReady("w1");
  sceneGone("w1");
  vi.mocked(installAgent).mockClear();
  workspacesStore.setState({ activeId: null, workspaces: [] });
  projectsStore.setState({ view: "home", projects: [], open });
});

it("goes to a canvas when the project reopens on its code workspace", async () => {
  const workspace = (id: string, kind: "canvas" | "code") => ({ id, projectId: "a", name: id, position: 0, pantheon: null, kind });
  workspacesStore.setState({ workspaces: [workspace("code", "code"), workspace("w1", "canvas")] });
  projectsStore.setState({ projects: [project("a", 1)] });
  open.mockImplementationOnce(async () => {
    projectsStore.setState({ view: "project" });
    workspacesStore.setState({ activeId: "code" });
  });
  await installFromHome("codex");
  expect(workspacesStore.getState().activeId).toBe("w1");
  sceneReady("w1");
  expect(installAgent).toHaveBeenCalledWith("codex");
});

it("opens the last project and installs once its scene is on screen (spec installation §4.2)", async () => {
  projectsStore.setState({ projects: [project("old", 1), project("new", 2), project("gone", 3, true)] });
  await installFromHome("codex");
  expect(open).toHaveBeenCalledWith("new");
  expect(addProject).not.toHaveBeenCalled();
  expect(installAgent).not.toHaveBeenCalled();
  sceneReady("w1");
  expect(installAgent).toHaveBeenCalledWith("codex");
});

it("installs at once when a cached scene was on screen before the opening ended", async () => {
  projectsStore.setState({ projects: [project("a", 1)] });
  open.mockImplementationOnce(async () => {
    projectsStore.setState({ view: "project" });
    workspacesStore.setState({ activeId: "w1" });
    sceneReady("w1");
  });
  await installFromHome("codex");
  expect(installAgent).toHaveBeenCalledWith("codex");
});

it("asks for a folder when no project can be opened", async () => {
  projectsStore.setState({ projects: [project("gone", 3, true)] });
  vi.mocked(addProject).mockImplementationOnce(async () => {
    projectsStore.setState({ view: "project" });
    workspacesStore.setState({ activeId: "w1" });
  });
  await installFromHome("claude");
  expect(addProject).toHaveBeenCalledTimes(1);
  expect(open).not.toHaveBeenCalled();
  sceneReady("w1");
  expect(installAgent).toHaveBeenCalledWith("claude");
});

it("installs nothing when the folder dialog is cancelled", async () => {
  await installFromHome("claude");
  sceneReady("w1");
  expect(installAgent).not.toHaveBeenCalled();
});

it("says so when the project cannot be opened", async () => {
  projectsStore.setState({ projects: [project("a", 1)] });
  open.mockRejectedValueOnce(new Error("locked"));
  await installFromHome("claude");
  expect(toast.error).toHaveBeenCalledWith("Ouverture du projet impossible : Error: locked");
  sceneReady("w1");
  expect(installAgent).not.toHaveBeenCalled();
});
