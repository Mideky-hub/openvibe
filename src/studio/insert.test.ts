import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn(() => Promise.resolve());
const updateScene = vi.fn();
const api = {
  getAppState: () => ({ width: 1000, height: 800, scrollX: 0, scrollY: 0, zoom: { value: 1 } }),
  getSceneElementsIncludingDeleted: () => [],
  updateScene,
};

vi.mock("@excalidraw/excalidraw", () => ({ CaptureUpdateAction: { IMMEDIATELY: "immediately" } }));
vi.mock("@/canvas/canvasStore", () => ({ canvasStore: { getState: () => ({ api }) } }));
vi.mock("@/store/nodes", () => ({ nodesStore: { getState: () => ({ create }) } }));
vi.mock("@/store/workspaces", () => ({ workspacesStore: { getState: () => ({ activeId: "w1" }) } }));

import { insertFileNode } from "./insert";

describe("insertFileNode", () => {
  beforeEach(() => vi.clearAllMocks());

  it("saves a file node then puts it at the center of the view", async () => {
    insertFileNode("docs/a.md");
    expect(create).toHaveBeenCalledWith(expect.any(String), { workspaceId: "w1", kind: "file", payload: { path: "docs/a.md" } });
    await Promise.resolve();
    await Promise.resolve();
    const [{ elements }] = updateScene.mock.calls[0];
    expect(elements).toHaveLength(1);
    expect(elements[0].customData.kind).toBe("file");
    expect(elements[0].x + elements[0].width / 2).toBe(500);
    expect(elements[0].y + elements[0].height / 2).toBe(400);
  });
});
