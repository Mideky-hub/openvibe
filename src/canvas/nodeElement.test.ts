import { describe, expect, it } from "vitest";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { createNodeElement, isOpenVibeLink, nodeKindOf } from "./nodeElement";

describe("createNodeElement", () => {
  it("makes a 640 × 760 orchestrator linked to its own id", () => {
    const element = createNodeElement("orchestrator", { x: 0, y: 0 });
    expect(element).toMatchObject({ x: -320, y: -380, width: 640, height: 760, customData: { kind: "orchestrator" } });
    expect(element.link).toBe(`openvibe://orchestrator/${element.id}`);
    expect(isOpenVibeLink(element.link!)).toBe(true);
    expect(nodeKindOf(element as unknown as ExcalidrawElement)).toBe("orchestrator");
  });

  it("centers a terminal on the given point and links it to its own id", () => {
    const element = createNodeElement("terminal", { x: 100, y: 50 });
    expect(element).toMatchObject({ type: "embeddable", x: -260, y: -170, width: 720, height: 440 });
    expect(element.link).toBe(`openvibe://terminal/${element.id}`);
    expect(element.customData).toEqual({ kind: "terminal" });
  });

  it("gives every node a fresh id", () => {
    expect(createNodeElement("note", { x: 0, y: 0 }).id).not.toBe(createNodeElement("note", { x: 0, y: 0 }).id);
  });
});

describe("isOpenVibeLink", () => {
  it("accepts our node links only", () => {
    expect(isOpenVibeLink("openvibe://kanban/3f2a-b1")).toBe(true);
    expect(isOpenVibeLink("openvibe://goals/3f2a-b1")).toBe(true);
    expect(isOpenVibeLink("openvibe://calendar/3f2a-b1")).toBe(true);
    expect(isOpenVibeLink("https://youtube.com/watch?v=x")).toBe(false);
    expect(isOpenVibeLink("openvibe://browser/1")).toBe(false);
    expect(isOpenVibeLink("openvibe://note/1?x=<script>")).toBe(false);
  });
});

describe("nodeKindOf", () => {
  it("reads the kind of an OpenVibe embeddable", () => {
    expect(nodeKindOf(createNodeElement("git", { x: 0, y: 0 }))).toBe("git");
  });

  it("ignores other elements and unknown kinds", () => {
    const rectangle = { ...createNodeElement("note", { x: 0, y: 0 }), type: "rectangle" } as unknown as ExcalidrawElement;
    expect(nodeKindOf(rectangle)).toBeNull();
    const unknown = { ...createNodeElement("note", { x: 0, y: 0 }), customData: { kind: "browser" } };
    expect(nodeKindOf(unknown)).toBeNull();
  });
});
