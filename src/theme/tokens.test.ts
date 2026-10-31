import { describe, expect, it } from "vitest";
import { cssBlock, readSource } from "./cssBlocks";

const tokens = readSource("theme/tokens.css");
const index = readSource("index.css");

// Spec identité §4.2, column by column.
const DARK: Record<string, string> = {
  "--ov-canvas": "#232220",
  "--ov-dot": "rgba(255,255,255,.07)",
  "--ov-surface": "#2B2A27",
  "--ov-field": "rgba(255,255,255,.05)",
  "--ov-line": "rgba(255,255,255,.09)",
  "--ov-hover": "rgba(255,255,255,.07)",
  "--ov-text": "#F5F4EF",
  "--ov-text-2": "#B3B0A8",
  "--ov-text-3": "#86837C",
  "--ov-accent": "#D97757",
  "--ov-accent-soft": "rgba(217,119,87,.18)",
  "--ov-on-accent": "#1F1E1D",
  "--ov-wait": "#D4A27F",
  "--ov-ok": "#8FA876",
  "--ov-danger": "#E5534B",
  "--ov-terminal": "#1A1918",
  "--ov-glass": "rgba(40,39,36,.52)",
  "--ov-glass-strong": "rgba(42,41,38,.84)",
  "--ov-glass-line": "rgba(255,255,255,.10)",
  "--ov-glass-hi": "inset 0 1px 0 rgba(255,255,255,.07)",
  "--ov-glass-edge": "0 0 0 1px rgba(0,0,0,.28)",
  "--ov-tray": "rgba(255,255,255,.028)",
  "--ov-head": "rgba(32,31,29,.70)",
  "--ov-tab-on": "rgba(255,255,255,.08)",
  "--ov-glow-1": "rgba(217,119,87,.16)",
  "--ov-glow-2": "rgba(143,168,118,.12)",
  "--ov-glow-3": "rgba(106,155,204,.08)",
  "--ov-shadow": "0 12px 40px rgba(0,0,0,.45)",
  "--ov-float-shadow": "0 8px 28px rgba(0,0,0,.32)",
  "--ov-draw": "#E8E5DD",
};
const LIGHT: Record<string, string> = {
  "--ov-canvas": "#F7F5EF",
  "--ov-dot": "rgba(41,38,27,.10)",
  "--ov-surface": "#FFFFFF",
  "--ov-field": "rgba(255,255,255,.60)",
  "--ov-line": "rgba(41,38,27,.10)",
  "--ov-hover": "rgba(41,38,27,.06)",
  "--ov-text": "#29261B",
  "--ov-text-2": "#625F57",
  "--ov-text-3": "#8F8C83",
  "--ov-accent": "#C2603F",
  "--ov-accent-soft": "rgba(194,96,63,.13)",
  "--ov-on-accent": "#FFFFFF",
  "--ov-wait": "#B07D3A",
  "--ov-ok": "#5E7A43",
  "--ov-danger": "#C93C37",
  "--ov-terminal": "#1A1918",
  "--ov-glass": "rgba(255,255,255,.50)",
  "--ov-glass-strong": "rgba(252,251,248,.88)",
  "--ov-glass-line": "rgba(255,255,255,.80)",
  "--ov-glass-hi": "inset 0 1px 0 rgba(255,255,255,.90)",
  "--ov-glass-edge": "0 0 0 1px rgba(41,38,27,.08)",
  "--ov-tray": "rgba(255,255,255,.38)",
  "--ov-head": "rgba(255,255,255,.66)",
  "--ov-tab-on": "rgba(255,255,255,.88)",
  "--ov-glow-1": "rgba(217,119,87,.16)",
  "--ov-glow-2": "rgba(106,155,204,.14)",
  "--ov-glow-3": "rgba(143,168,118,.12)",
  "--ov-shadow": "0 12px 40px rgba(41,38,27,.16)",
  "--ov-float-shadow": "0 8px 28px rgba(41,38,27,.10)",
  "--ov-draw": "#29261B",
};
const OPAQUE = { "--ov-glass": "var(--ov-surface)", "--ov-glass-strong": "var(--ov-surface)", "--ov-head": "var(--ov-terminal-head)", "--ov-blur": "none" };

describe("design tokens (spec identité §4.2)", () => {
  it("defines every token of the dark theme, Argile, with the spec's value", () => {
    expect(cssBlock(tokens, ':root, :root[data-theme="dark"]')).toMatchObject(DARK);
  });

  it("defines every token of the light theme, Ivoire, with the spec's value", () => {
    expect(cssBlock(tokens, ':root[data-theme="light"]')).toMatchObject(LIGHT);
  });

  it("keeps the habillage names as aliases until R2 and R3 rebuild their components", () => {
    const shared = cssBlock(tokens, ":root");
    for (const alias of ["--ov-surface-2", "--ov-command", "--ov-selected", "--ov-working", "--ov-waiting", "--ov-idle", "--ov-done", "--ov-live"]) {
      expect(shared[alias], alias).toMatch(/^var\(--ov-/);
    }
    for (const themed of [':root, :root[data-theme="dark"]', ':root[data-theme="light"]']) {
      expect(cssBlock(tokens, themed)).toHaveProperty("--ov-card");
      expect(cssBlock(tokens, themed)).toHaveProperty("--ov-terminal-head");
    }
    expect(shared["--ov-blur"]).toBe("blur(18px) saturate(150%)");
  });

  it("turns every glass opaque without transparency, from Windows or from the setting", () => {
    expect(tokens).toContain("@media (prefers-reduced-transparency: reduce)");
    expect(cssBlock(tokens, ':root[data-theme="dark"], :root[data-theme="light"]', "@media (prefers-reduced-transparency: reduce)")).toMatchObject(OPAQUE);
    expect(cssBlock(tokens, ':root[data-theme][data-transparency="off"]')).toMatchObject(OPAQUE);
  });

  it("offers the glass and ambient utilities built on these tokens", () => {
    expect(index).toMatch(/\.ov-glass \{[^}]*var\(--ov-glass\)[^}]*var\(--ov-blur\)/);
    expect(index).toMatch(/\.ov-glass-strong \{[^}]*var\(--ov-glass-strong\)[^}]*var\(--ov-blur\)/);
    expect(index).toMatch(/\.ov-ambient \{[^}]*var\(--ov-glow-1\)[^}]*var\(--ov-glow-2\)[^}]*var\(--ov-glow-3\)/);
  });
});
