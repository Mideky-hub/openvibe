import { describe, expect, it } from "vitest";
import { displayColorFor, exportBackground, sceneColorFor, toDisplayColor, toSceneColor } from "./sceneColors";

describe("scene colors under Excalidraw's dark filter", () => {
  it("matches reference values", () => {
    expect(toDisplayColor("#1e1e1e")).toBe("#d3d3d3");
    expect(toDisplayColor("#ffffff")).toBe("#121212");
    expect(toSceneColor("#5E9A55")).toBe("#448a3a");
    expect(toSceneColor("#EDE8DF")).toBe("#0b0500");
  });

  it("round-trips colors the filter can show", () => {
    for (const color of ["#5e9a55", "#4b5675", "#12110e"]) {
      expect(toDisplayColor(toSceneColor(color))).toBe(color === "#12110e" ? "#121210" : color);
    }
  });

  it("leaves non-hex values alone", () => {
    expect(toSceneColor("transparent")).toBe("transparent");
    expect(toDisplayColor("transparent")).toBe("transparent");
  });
});

describe("colors in each theme", () => {
  it("shows a stored color as is in light, through Excalidraw's inversion in dark", () => {
    expect(displayColorFor("#C2603F", "light")).toBe("#C2603F");
    expect(displayColorFor("#C2603F", "dark")).toBe(toDisplayColor("#C2603F"));
  });

  it("stores what was picked as is in light, inverted back in dark", () => {
    expect(sceneColorFor("#3F74A8", "light")).toBe("#3F74A8");
    expect(sceneColorFor("#3F74A8", "dark")).toBe(toSceneColor("#3F74A8"));
  });

  it("exports a PNG in the theme on screen, on its canvas color", () => {
    expect(exportBackground("light")).toEqual({ exportWithDarkMode: false, viewBackgroundColor: "#F7F5EF" });
    expect(exportBackground("dark")).toEqual({ exportWithDarkMode: true, viewBackgroundColor: toSceneColor("#232220") });
  });
});

describe("selection color under the dark filter", () => {
  it("is stored pre-inverted so that the canvas shows the accent token", async () => {
    const { readFileSync } = await import("node:fs");
    const tokens = readFileSync("src/theme/tokens.css", "utf8");
    const accent = /data-theme="dark"[^}]*?--ov-accent:\s*(#[0-9a-f]{6})/i.exec(tokens)?.[1];
    const scene = /data-theme="dark"[^}]*?--ov-accent-scene:\s*(#[0-9a-f]{6})/i.exec(tokens)?.[1];
    expect(accent).toBeDefined();
    expect(scene?.toLowerCase()).toBe(toSceneColor(accent!));
    const css = readFileSync("src/theme/excalidraw.css", "utf8");
    expect(css).toMatch(/--color-selection:\s*var\(--ov-accent-scene\)/);
  });
});
