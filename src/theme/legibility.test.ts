import { expect, it, vi } from "vitest";

// Slow under the load of the full suite: this file's tests get their own timeout.
vi.setConfig({ testTimeout: 30_000 });
import { cssBlock, readSource, sourceFiles } from "./cssBlocks";

const tokens = readSource("theme/tokens.css");

it("writes on role colors with one dark ink, the same in both themes", () => {
  // Role colors do not change with the theme; Ivoire's canvas color on them read at 2:1.
  for (const theme of [':root, :root[data-theme="dark"]', ':root[data-theme="light"]']) {
    expect(cssBlock(tokens, theme)["--ov-on-role"]).toBe("#1F1E1D");
  }
});

it("never inks with the canvas color, nor with an agent's raw tint", () => {
  for (const [file, text] of Object.entries(sourceFiles())) {
    expect(/text-ov-canvas/.test(text), `${file} : texte couleur du canvas`).toBe(false);
    expect(/color:\s*(meta|AGENTS\[[^\]]+\])\.tint\b/.test(text), `${file} : teinte brute en couleur de texte`).toBe(false);
  }
});
