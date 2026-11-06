// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { projectsStore } from "@/store/projects";
import { workspacesStore } from "@/store/workspaces";
import { completeArrival, requestArrival } from "./pendingArrival";
import { reach } from "./reach";

vi.mock("./reach", () => ({ reach: vi.fn(() => true) }));

const thot = { workspaceId: "w2", kind: "terminal", id: "thot", label: "Thot" } as const;

beforeEach(() => {
  vi.mocked(reach).mockClear();
  projectsStore.setState({ view: "project", activeId: "p1" } as never);
  workspacesStore.setState({ projectId: "p1", activeId: "w1" } as never);
});

describe("a pending arrival (spec fenêtre §7.2)", () => {
  it("is reached once its workspace, just selected, shows its scene", () => {
    requestArrival(thot);
    workspacesStore.setState({ activeId: "w2" });
    completeArrival("w2");
    expect(reach).toHaveBeenCalledWith("terminal", "thot");
  });

  it("is dropped when the user picks another tab before its scene is on screen", () => {
    requestArrival(thot);
    workspacesStore.setState({ activeId: "w2" });
    workspacesStore.setState({ activeId: "w3" });
    workspacesStore.setState({ activeId: "w2" });
    completeArrival("w2");
    expect(reach).not.toHaveBeenCalled();
  });

  it("is dropped when the user goes home, closes the project or opens another one", () => {
    for (const moveOn of [{ view: "home" }, { view: "home", activeId: null }, { activeId: "p2" }]) {
      requestArrival(thot);
      workspacesStore.setState({ activeId: "w2" });
      projectsStore.setState(moveOn as never);
      projectsStore.setState({ view: "project", activeId: "p1" } as never);
      completeArrival("w2");
    }
    expect(reach).not.toHaveBeenCalled();
  });

  it("survives a store change that moves nothing", () => {
    requestArrival(thot);
    projectsStore.setState({ view: "project" } as never);
    workspacesStore.setState({ status: "ready" } as never);
    completeArrival("w2");
    expect(reach).toHaveBeenCalledTimes(1);
  });
});
