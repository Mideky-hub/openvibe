// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from "vitest";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { focusCanvas } from "@/radial/bridges";
import { canvasStore } from "../canvasStore";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ICON_CATEGORIES } from "./library";
import { insertIcon } from "./place";

vi.mock("@excalidraw/excalidraw", () => ({ CaptureUpdateAction: { IMMEDIATELY: "immediately" }, restoreElements: (elements: unknown[]) => elements }));
vi.mock("@/radial/bridges", () => ({ focusCanvas: vi.fn() }));

const updateScene = vi.fn();
const setActiveTool = vi.fn();

beforeEach(() => {
  updateScene.mockClear();
  canvasStore.setState({
    api: {
      getAppState: () => ({ width: 1000, height: 800, scrollX: 0, scrollY: 0, zoom: { value: 1 } }),
      getSceneElementsIncludingDeleted: () => [],
      updateScene,
      setActiveTool,
    } as unknown as ExcalidrawImperativeAPI,
  });
});

it("puts the icon at the view's center and gives the keyboard back to the canvas, a terminal no longer active (final review maj §4)", () => {
  const box = (id: string, x: number) => ({ id, type: "rectangle", x, y: 0, width: 10, height: 10, groupIds: [] });
  insertIcon({ id: "lib#0", name: "Cache", library: "Lib", elements: [box("a", 0), box("b", 30)] });
  const { elements, appState } = updateScene.mock.calls[0][0];
  expect(elements.map((e: { x: number; y: number }) => [e.x, e.y])).toEqual([
    [480, 395],
    [510, 395],
  ]);
  expect(appState).toMatchObject({ activeEmbeddable: null, editingGroupId: null, selectedGroupIds: { [elements[0].groupIds[0]]: true } });
  expect(focusCanvas).toHaveBeenCalled();
});

it("ships the full MIT notice of the libraries with their credits (final review maj §4)", () => {
  const credits = readFileSync(join(process.cwd(), "public", "libraries", "CREDITS.md"), "utf8");
  expect(credits).toContain("Copyright (c) 2020 Excalidraw");
  expect(credits).toContain("Permission is hereby granted, free of charge, to any person obtaining a copy");
  expect(credits).toContain('THE SOFTWARE IS PROVIDED "AS IS"');
  for (const library of ICON_CATEGORIES.flatMap((c) => c.libraries)) expect(credits).toContain(library.name);
});

it("puts an icon dropped on a group into its frame, under it in the scene, as Excalidraw would (plan D1)", () => {
  const frame = { id: "g1", type: "frame", x: 300, y: 200, width: 400, height: 400, isDeleted: false, frameId: null, groupIds: [], customData: { openvibe: { kind: "group", role: "backend", pantheon: "egypt" } } };
  const other = { id: "z", type: "rectangle", x: 0, y: 0, width: 5, height: 5, isDeleted: false, groupIds: [], frameId: null };
  canvasStore.setState({
    api: {
      getAppState: () => ({ width: 1000, height: 800, scrollX: 0, scrollY: 0, zoom: { value: 1 } }),
      getSceneElementsIncludingDeleted: () => [other, frame],
      updateScene,
      setActiveTool,
    } as unknown as ExcalidrawImperativeAPI,
    frames: [{ id: "g1", name: "G", x: 300, y: 200, width: 400, height: 400, group: { role: "backend", pantheon: "egypt" }, memberIds: [] }],
  });
  insertIcon({ id: "lib#0", name: "Cache", library: "Lib", elements: [{ id: "a", type: "rectangle", x: 0, y: 0, width: 10, height: 10, groupIds: [] }] });
  const { elements } = updateScene.mock.calls[0][0];
  expect(elements.map((e: { id: string }) => e.id)).toEqual(["z", expect.any(String), "g1"]);
  expect(elements[1].frameId).toBe("g1");
});

it("leaves an icon dropped outside every group free", () => {
  canvasStore.setState({ frames: [] });
  insertIcon({ id: "lib#0", name: "Cache", library: "Lib", elements: [{ id: "a", type: "rectangle", x: 0, y: 0, width: 10, height: 10, groupIds: [] }] });
  const { elements } = updateScene.mock.calls[0][0];
  expect(elements[0].frameId ?? null).toBeNull();
});
