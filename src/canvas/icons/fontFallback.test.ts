import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

// Excalidraw lists an esm.sh address as the last resort for every font; the CSP
// refuses it but the console logs ~460 refusals per load. A pnpm patch removes
// the use of that address: it must still be applied after an upgrade.
describe("Excalidraw font fallback (issue #13)", () => {
  it("is never added to the addresses a font is tried at", () => {
    const root = join(dirname(createRequire(import.meta.url).resolve("@excalidraw/excalidraw")), "..");
    for (const flavour of ["dev", "prod"]) {
      const dir = join(root, flavour);
      for (const file of readdirSync(dir).filter((name) => name.endsWith(".js"))) {
        expect(readFileSync(join(dir, file), "utf8"), `${flavour}/${file}`).not.toMatch(/push\(new URL\(\w+,\s*\w+\.ASSETS_FALLBACK_URL\)\)|urls\.push\(new URL\(assetUrl, _ExcalidrawFontFace\.ASSETS_FALLBACK_URL\)\)/);
      }
    }
  });
});
