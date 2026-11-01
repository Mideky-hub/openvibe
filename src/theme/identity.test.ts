import { expect, it, vi } from "vitest";

// Slow under the load of the full suite: this file's tests get their own timeout.
vi.setConfig({ testTimeout: 30_000 });
import { sourceFiles } from "./cssBlocks";

// What the habillage spec took from Symvibe (spec identité §5.11, §12).
const FORBIDDEN: [RegExp, string][] = [
  [/#f4602e/i, "l'orange de Symvibe"],
  [/#322f28/i, "le fond fixe des badges d'état"],
  [/#12110e/i, "l'ancien fond du canvas"],
  [/Geist/, "la police Geist"],
  [/ov-orb/, "l'orbe"],
  [/#4fc2c2/i, "la bordure dégradée des puces"],
];

it("keeps no trace of the habillage identity", () => {
  const sources = sourceFiles();
  expect(Object.keys(sources).length).toBeGreaterThan(50);
  for (const [file, text] of Object.entries(sources)) {
    for (const [pattern, what] of FORBIDDEN) expect(pattern.test(text), `${file} : ${what}`).toBe(false);
  }
});
