import { describe, expect, it } from "vitest";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import {
  createGroupFrame,
  framesFromScene,
  groupAt,
  groupBeingRenamed,
  groupInfoOf,
  groupOf,
  groupPantheons,
  insertIntoFrame,
  MAX_SPECIALITY,
  nextGroupName,
  withGroupSpeciality,
} from "./groups";

const element = (fields: Record<string, unknown>) =>
  ({ x: 0, y: 0, width: 100, height: 100, isDeleted: false, frameId: null, ...fields }) as unknown as ExcalidrawElement;
const frame = (id: string, fields: Record<string, unknown> = {}) => element({ id, type: "frame", name: id, ...fields });
const group = (id: string, role = "backend", pantheon = "greek", fields: Record<string, unknown> = {}) =>
  frame(id, { customData: { openvibe: { kind: "group", role, pantheon } }, ...fields });
const terminal = (id: string, frameId: string | null, fields: Record<string, unknown> = {}) =>
  element({ id, type: "embeddable", customData: { kind: "terminal" }, frameId, width: 720, height: 440, ...fields });

describe("framesFromScene", () => {
  it("derives each group, its role, pantheon and terminals in scene order", () => {
    const scene = [
      terminal("a", "g1"),
      terminal("b", null),
      element({ id: "r", type: "rectangle", frameId: "g1" }),
      terminal("c", "g1"),
      group("g1", "backend", "greek", { x: 10, y: 20, width: 800, height: 500, name: "Backend" }),
    ];
    expect(framesFromScene(scene)).toEqual([
      {
        id: "g1",
        name: "Backend",
        x: 10,
        y: 20,
        width: 800,
        height: 500,
        group: { role: "backend", pantheon: "greek" },
        memberIds: ["a", "c"],
      },
    ]);
  });

  it("keeps hand-drawn frames as plain frames", () => {
    expect(framesFromScene([frame("f")])[0].group).toBeNull();
    expect(framesFromScene([group("g", "pirates")])[0].group).toBeNull();
  });

  it("ignores deleted frames and deleted terminals", () => {
    const frames = framesFromScene([group("g"), terminal("a", "g", { isDeleted: true }), group("old", "docs", "norse", { isDeleted: true })]);
    expect(frames.map((f) => [f.id, f.memberIds])).toEqual([["g", []]]);
  });
});

describe("groups of the scene", () => {
  const frames = framesFromScene([
    group("g1", "backend", "greek", { x: 0, y: 0, width: 1000, height: 1000, name: "Groupe 1" }),
    frame("plain", { x: 0, y: 0, width: 3000, height: 3000, name: "Groupe 3" }),
    group("g2", "docs", "norse", { x: 500, y: 500, width: 1000, height: 1000, name: "Docs" }),
    terminal("a", "g2"),
  ]);

  it("finds the topmost group under a point, never a plain frame", () => {
    expect(groupAt(frames, { x: 100, y: 100 })?.id).toBe("g1");
    expect(groupAt(frames, { x: 600, y: 600 })?.id).toBe("g2");
    expect(groupAt(frames, { x: 2500, y: 2500 })).toBeNull();
  });

  it("finds the group of a terminal", () => {
    expect(groupOf(frames, "a")?.id).toBe("g2");
    expect(groupOf(frames, "zzz")).toBeNull();
  });

  it("names a new group with the smallest free number", () => {
    expect(nextGroupName(frames)).toBe("Groupe 2");
    expect(nextGroupName([])).toBe("Groupe 1");
  });

  it("lists the pantheons the groups use", () => {
    expect(groupPantheons(frames)).toEqual(["greek", "norse"]);
  });
});

describe("group frame elements", () => {
  it("creates a frame carrying its role and pantheon", () => {
    const created = createGroupFrame({ x: 1, y: 2, width: 3, height: 4 }, "Backend", { role: "backend", pantheon: "greek" });
    expect(created).toMatchObject({ type: "frame", name: "Backend", x: 1, y: 2, width: 3, height: 4, isDeleted: false, frameId: null });
    expect(groupInfoOf(created)).toEqual({ role: "backend", pantheon: "greek" });
  });

  it("reads a group's speciality, tidied; without one the group is as before", () => {
    const withSpeciality = (speciality: unknown) => groupInfoOf(frame("g", { customData: { openvibe: { kind: "group", role: "backend", pantheon: "greek", speciality } } }));
    expect(withSpeciality("  API\n et  bases ")).toEqual({ role: "backend", pantheon: "greek", speciality: "API et bases" });
    expect(withSpeciality("x".repeat(60))?.speciality).toHaveLength(MAX_SPECIALITY);
    for (const none of ["", "   ", 12, null, undefined]) expect(withSpeciality(none)).toEqual({ role: "backend", pantheon: "greek" });
  });

  it("creates a frame with its speciality, and sets or clears it keeping the rest of its data", () => {
    const created = createGroupFrame({ x: 0, y: 0, width: 1, height: 1 }, "Backend", { role: "backend", pantheon: "greek", speciality: "API" });
    expect(groupInfoOf(created)?.speciality).toBe("API");
    const data = { other: 1, openvibe: { kind: "group", role: "backend", pantheon: "greek", speciality: "API" } };
    expect(withGroupSpeciality(data, " Tests ")).toEqual({ other: 1, openvibe: { kind: "group", role: "backend", pantheon: "greek", speciality: "Tests" } });
    expect(withGroupSpeciality(data, "  ")).toEqual({ other: 1, openvibe: { kind: "group", role: "backend", pantheon: "greek" } });
  });

  it("puts a new child right under its frame, which takes its grown size", () => {
    const scene = [{ id: "x" }, { id: "f", size: 1 }, { id: "y" }];
    expect(insertIntoFrame(scene, { id: "t" }, { id: "f", size: 2 })).toEqual([{ id: "x" }, { id: "t" }, { id: "f", size: 2 }, { id: "y" }]);
  });

  it("appends the child and its frame when the frame is not in the scene", () => {
    expect(insertIntoFrame([{ id: "x" }], { id: "t" }, { id: "f" })).toEqual([{ id: "x" }, { id: "t" }, { id: "f" }]);
  });
});

describe("groupBeingRenamed", () => {
  const frames = framesFromScene([group("g"), frame("plain")]);

  it("takes over Excalidraw's name editor for a group", () => {
    expect(groupBeingRenamed("g", frames)).toBe("g");
  });

  it("leaves plain frames and the idle editor to Excalidraw", () => {
    expect(groupBeingRenamed("plain", frames)).toBeNull();
    expect(groupBeingRenamed(null, frames)).toBeNull();
  });
});
