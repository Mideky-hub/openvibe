// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { arrive } from "@/canvas/arrive";
import { focusGroup } from "@/canvas/canvasFocus";
import { langStore } from "@/i18n";
import { projectsStore } from "@/store/projects";
import { workspacesStore } from "@/store/workspaces";
import { readSource } from "@/theme/cssBlocks";
import type { GoToItem } from "./goTo";
import { goTo } from "./goToRun";
import { completeArrival } from "./pendingArrival";

vi.mock("@/canvas/arrive", () => ({ arrive: vi.fn(() => true) }));
vi.mock("@/canvas/canvasFocus", () => ({ focusGroup: vi.fn(() => true) }));

const select = vi.fn();
const open = vi.fn(() => Promise.resolve());
const item = (fields: Partial<GoToItem>): GoToItem => ({ key: "k", kind: "terminal", label: "Isis", keywords: [], ...fields });

beforeEach(() => {
  vi.mocked(arrive).mockClear().mockReturnValue(true);
  vi.mocked(focusGroup).mockClear().mockReturnValue(true);
  select.mockClear();
  workspacesStore.setState({ activeId: "w1", select } as never);
  projectsStore.setState({ open } as never);
});
afterEach(() => vi.restoreAllMocks());

describe("goTo (spec fenêtre §7.2)", () => {
  it("arrives on a terminal or an orchestrator of the workspace on screen, fits a group", () => {
    goTo(item({ workspaceId: "w1", targetId: "isis" }));
    expect(arrive).toHaveBeenCalledWith("isis");
    goTo(item({ kind: "orchestrator", workspaceId: "w1", targetId: "chef" }));
    expect(arrive).toHaveBeenLastCalledWith("chef");
    goTo(item({ kind: "group", workspaceId: "w1", targetId: "g" }));
    expect(focusGroup).toHaveBeenCalledWith("g");
    expect(select).not.toHaveBeenCalled();
  });

  it("switches to a workspace, opens a project", () => {
    goTo(item({ kind: "workspace", workspaceId: "w2" }));
    expect(select).toHaveBeenCalledWith("w2");
    goTo(item({ kind: "project", projectId: "p2" }));
    expect(open).toHaveBeenCalledWith("p2");
  });

  it("goes to another workspace first, then arrives once its scene is on screen", () => {
    goTo(item({ workspaceId: "w2", targetId: "thot", label: "Thot" }));
    expect(select).toHaveBeenCalledWith("w2");
    expect(arrive).not.toHaveBeenCalled();
    completeArrival("w1");
    expect(arrive).not.toHaveBeenCalled();
    completeArrival("w2");
    expect(arrive).toHaveBeenCalledWith("thot");
    completeArrival("w2");
    expect(arrive).toHaveBeenCalledTimes(1);
  });

  it("says so when the target is gone (spec fenêtre §9)", async () => {
    const error = vi.spyOn(toast, "error").mockImplementation(() => "");
    vi.mocked(arrive).mockReturnValue(false);
    goTo(item({ workspaceId: "w2", targetId: "isis", label: "Isis" }));
    completeArrival("w2");
    expect(error).toHaveBeenCalledWith("Isis n'existe plus");
    goTo(item({ kind: "group", workspaceId: "w1", targetId: "g", label: "Serveurs" }));
    vi.mocked(focusGroup).mockReturnValue(false);
    goTo(item({ kind: "group", workspaceId: "w1", targetId: "g", label: "Serveurs" }));
    expect(error).toHaveBeenLastCalledWith("Serveurs n'existe plus");
  });

  it("says so in the interface's language when a target of another workspace is gone", () => {
    const error = vi.spyOn(toast, "error").mockImplementation(() => "");
    vi.mocked(arrive).mockReturnValue(false);
    langStore.setState({ lang: "en" });
    goTo(item({ workspaceId: "w2", targetId: "isis", label: "Isis" }));
    completeArrival("w2");
    langStore.setState({ lang: "fr" });
    expect(error).toHaveBeenCalledWith("Isis no longer exists");
  });

  it("is completed by the canvas of a workspace, and orchestrators are found by their field", () => {
    expect(readSource("canvas/Canvas.tsx")).toContain("completeArrival(workspaceId)");
    expect(readSource("nodes/orchestrator/OrchestratorNode.tsx")).toContain("data-orchestrator={nodeId}");
  });
});
