import { expect, it } from "vitest";
import { readSource } from "@/theme/cssBlocks";

/** Runs public/first-paint.js against a fake page. */
function paint(stored: Record<string, string>, systemDark: boolean) {
  const root = { dataset: {} as Record<string, string>, style: {} as Record<string, string> };
  const storage = { getItem: (key: string) => stored[key] ?? null };
  new Function("document", "localStorage", "matchMedia", readSource("../public/first-paint.js"))({ documentElement: root }, storage, () => ({ matches: systemDark }));
  return root;
}

it("paints the saved theme before the app loads, else Windows'", () => {
  expect(paint({}, false).dataset.theme).toBe("light");
  expect(paint({}, true).dataset.theme).toBe("dark");
  expect(paint({ "ov.theme": "dark" }, false).dataset.theme).toBe("dark");
  expect(paint({ "ov.theme": "light" }, true).style.colorScheme).toBe("light");
  expect(paint({ "ov.transparency": "off" }, true).dataset.transparency).toBe("off");
});

it("is loaded by the page, from its own origin (the CSP forbids inline scripts)", () => {
  expect(readSource("../index.html")).toMatch(/<script src="\/first-paint\.js"><\/script>/);
});

it("is fed by the theme module", () => {
  const theme = readSource("app/theme.ts");
  expect(theme).toContain('"ov.theme"');
  expect(theme).toContain('"ov.transparency"');
});
