import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("gives the update signing key to the build step only, not to installs and tests (final review R4)", () => {
  const workflow = readFileSync(".github/workflows/release.yml", "utf8").replace(/\r\n/g, "\n");
  const [header, ...steps] = workflow.split("\n      - ");
  expect(header).not.toContain("TAURI_SIGNING");
  const holding = steps.filter((step) => step.includes("TAURI_SIGNING"));
  expect(holding.length).toBeGreaterThan(0);
  // Pinned by commit SHA (# v1), so only the action is named here.
  for (const step of holding) expect(step).toContain("uses: tauri-apps/tauri-action@");
});
