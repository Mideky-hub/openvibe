import { describe, expect, it } from "vitest";
import { PEN_COLORS } from "@/theme/penColors";
import { PEN_WIDTHS, railToolOf } from "./tools";

describe("railToolOf", () => {
  it("lights the rail button of Excalidraw's active tool", () => {
    expect(railToolOf("selection")).toBe("selection");
    expect(railToolOf("lasso")).toBe("selection");
    for (const shape of ["rectangle", "ellipse", "diamond", "line", "arrow", "frame"]) {
      expect(railToolOf(shape)).toBe("shapes");
    }
    expect(railToolOf("text")).toBe("text");
    expect(railToolOf("freedraw")).toBe("pen");
    expect(railToolOf("eraser")).toBe("eraser");
    expect(railToolOf("image")).toBe("image");
    expect(railToolOf("hand")).toBe("hand");
  });
});

describe("pen palette", () => {
  it("offers eight pen colors, stored once for both themes, ink first, and 5 widths", () => {
    expect(PEN_COLORS).toHaveLength(8);
    expect(PEN_COLORS[0]).toEqual({ label: "Encre", scene: "#29261B" });
    for (const { scene } of PEN_COLORS) expect(scene).toMatch(/^#[0-9A-F]{6}$/);
    expect(PEN_WIDTHS).toEqual([1, 2, 4, 6, 8]);
  });
});
