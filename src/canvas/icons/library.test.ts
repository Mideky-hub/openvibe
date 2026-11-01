import { describe, expect, it } from "vitest";
import { instantiate, libraryFile, matchIcons, readLibrary } from "./library";

const meta = { source: "rohanp/system-design", name: "System Design Components", authors: ["Rohan Pithadiya"] };
const rect = (id: string, extra: object = {}) => ({ id, type: "rectangle", x: 0, y: 0, width: 100, height: 50, groupIds: [], isDeleted: false, ...extra });
const text = (id: string, value: string, extra: object = {}) => ({ id, type: "text", x: 10, y: 10, width: 80, height: 20, text: value, groupIds: [], isDeleted: false, ...extra });

describe("readLibrary (spec maj §4)", () => {
  it("reads named items of a version 2 library, and names the others by their text", () => {
    const items = readLibrary(
      {
        type: "excalidrawlib",
        version: 2,
        libraryItems: [
          { id: "a", status: "published", name: "Amazon S3", elements: [rect("r1")] },
          { id: "b", status: "published", elements: [rect("r2"), text("t2", "Load\nBalancer")] },
          { id: "c", status: "published", elements: [rect("r3")] },
        ],
      },
      meta,
    );
    expect(items.map((i) => [i.id, i.name, i.library])).toEqual([
      ["rohanp/system-design#0", "Amazon S3", "System Design Components"],
      ["rohanp/system-design#1", "Load Balancer", "System Design Components"],
      ["rohanp/system-design#2", "System Design Components 3", "System Design Components"],
    ]);
  });

  it("reads a version 1 library of bare element lists, and drops deleted elements and empty items", () => {
    const items = readLibrary({ type: "excalidrawlib", version: 1, library: [[text("t", "Cache"), rect("x", { isDeleted: true })], [rect("gone", { isDeleted: true })]] }, meta);
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("Cache");
    expect(items[0].elements.map((e) => e.id)).toEqual(["t"]);
  });

  it("reads nothing from what is not a library", () => {
    expect(readLibrary(null, meta)).toEqual([]);
    expect(readLibrary({ libraryItems: "x" }, meta)).toEqual([]);
  });

  it("finds its file among the app's assets", () => {
    expect(libraryFile("7demonsrising/azure-general")).toBe("/libraries/7demonsrising__azure-general.excalidrawlib");
  });
});

describe("matchIcons", () => {
  const items = readLibrary({ libraryItems: [{ name: "Load Balancer", elements: [rect("a")] }, { name: "Base de données", elements: [rect("b")] }] }, meta);

  it("finds by name or library, case and accents aside", () => {
    expect(matchIcons(items, "load bal").map((i) => i.name)).toEqual(["Load Balancer"]);
    expect(matchIcons(items, "donnees").map((i) => i.name)).toEqual(["Base de données"]);
    expect(matchIcons(items, "system design")).toHaveLength(2);
    expect(matchIcons(items, "  ")).toHaveLength(2);
  });
});

describe("instantiate", () => {
  let n = 0;
  const newId = () => `n${++n}`;

  it("gives new ids, keeps the item's links, centers it on the point and holds it as one group", () => {
    n = 0;
    const box = rect("r1", { groupIds: ["g1"], boundElements: [{ id: "t1", type: "text" }, { id: "elsewhere", type: "arrow" }], frameId: "f0", index: "a1" });
    const label = text("t1", "API", { groupIds: ["g1"], containerId: "r1" });
    const arrow = { id: "a1", type: "arrow", x: 0, y: 100, width: 50, height: 20, points: [[0, 0], [50, -20]], groupIds: [], startBinding: { elementId: "r1", focus: 0, gap: 4 }, endBinding: { elementId: "zz", focus: 0, gap: 4 } };
    const [newBox, newLabel, newArrow] = instantiate([box, label, arrow], { x: 500, y: 500 }, newId);
    expect([newBox.id, newLabel.id, newArrow.id]).toEqual(["n1", "n2", "n3"]);
    expect(newLabel.containerId).toBe("n1");
    expect(newBox.boundElements).toEqual([{ id: "n2", type: "text" }]);
    expect(newArrow.startBinding).toEqual({ elementId: "n1", focus: 0, gap: 4 });
    expect(newArrow.endBinding).toBeNull();
    // The bounds run from (0, 0) to (100, 100): their center goes to (500, 500).
    expect([newBox.x, newBox.y, newArrow.x, newArrow.y]).toEqual([450, 450, 450, 550]);
    // g1 becomes a new group; a group around everything keeps the icon whole.
    expect(newBox.groupIds).toEqual(["n4", "n5"]);
    expect(newLabel.groupIds).toEqual(["n4", "n5"]);
    expect(newArrow.groupIds).toEqual(["n5"]);
    expect(newBox.frameId).toBeNull();
    expect(newBox.index).toBeNull();
  });

  it("adds no group to an item already grouped whole, nor to a single element", () => {
    n = 0;
    expect(instantiate([rect("a", { groupIds: ["g"] }), rect("b", { groupIds: ["g"] })], { x: 0, y: 0 }, newId).map((e) => e.groupIds)).toEqual([["n3"], ["n3"]]);
    expect(instantiate([rect("c")], { x: 0, y: 0 }, newId)[0].groupIds).toEqual([]);
  });
});

describe("what a library may bring (backlog 27 oct)", () => {
  it("drops embeddables, frames and images, and strips links, custom data and locks", () => {
    const [item] = readLibrary(
      { libraryItems: [{ name: "X", elements: [rect("a", { link: "https://evil", customData: { openvibe: {} }, locked: true }), { ...rect("b"), type: "embeddable" }, { ...rect("c"), type: "image" }, { ...rect("d"), type: "frame" }] }] },
      meta,
    );
    expect(item.elements.map((e) => e.id)).toEqual(["a"]);
    expect(item.elements[0]).not.toHaveProperty("link");
    expect(item.elements[0]).not.toHaveProperty("customData");
    expect(item.elements[0].locked).toBe(false);
  });
});

describe("instantiate, rotation and seeds (backlog 27 oct)", () => {
  it("centres by the turned bounds of a rotated shape", () => {
    // The second one, turned a quarter, spans y 60 to 160: the whole spans y 0 to 160, centre 80.
    const [first] = instantiate([rect("a", { width: 100, height: 20 }), rect("b", { y: 100, width: 100, height: 20, angle: Math.PI / 2 })], { x: 0, y: 0 }, () => "n");
    expect(first.y).toBeCloseTo(-80);
  });

  it("gives each copy fresh drawing seeds", () => {
    const ids = (() => { let n = 0; return () => `i${n++}`; })();
    const [a] = instantiate([rect("a", { seed: 7 })], { x: 0, y: 0 }, ids);
    const [b] = instantiate([rect("a", { seed: 7 })], { x: 0, y: 0 }, ids);
    expect(a.seed).not.toBe(7);
    expect(a.seed).not.toBe(b.seed);
  });
});
