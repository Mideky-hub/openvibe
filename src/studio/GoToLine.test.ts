import { afterEach, describe, expect, it } from "vitest";
import { projectsStore } from "@/store/projects";
import { workspacesStore } from "@/store/workspaces";
import { goToLine, inCodeWorkspace } from "./GoToLine";
import { studioStore } from "./studioStore";

afterEach(() => {
  studioStore.setState({ active: null, pendingLine: null });
  workspacesStore.setState({ workspaces: [], activeId: null } as never);
});

describe("Ctrl+G, go to line", () => {
  it("is for a Code workspace only", () => {
    projectsStore.setState({ view: "project" } as never);
    workspacesStore.setState({ workspaces: [{ id: "w1", kind: "code" }, { id: "w2", kind: "canvas" }], activeId: "w1" } as never);
    expect(inCodeWorkspace()).toBe(true);
    workspacesStore.setState({ activeId: "w2" } as never);
    expect(inCodeWorkspace()).toBe(false);
  });

  it("asks the active file's editor for the line, and the column", () => {
    studioStore.setState({ active: "src/App.tsx" });
    expect(goToLine("42:7")).toBe(true);
    expect(studioStore.getState().pendingLine).toEqual({ path: "src/App.tsx", line: 42, column: 7 });
  });

  it("refuses what is not a line, or when no file is open", () => {
    studioStore.setState({ active: "src/App.tsx" });
    expect(goToLine("abc")).toBe(false);
    studioStore.setState({ active: null });
    expect(goToLine("3")).toBe(false);
    expect(studioStore.getState().pendingLine).toBeNull();
  });
});
