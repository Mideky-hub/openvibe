// @vitest-environment happy-dom
import { afterEach, expect, it } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { forgetTokenReport, loadTokenReport, REPORT_FRESH_MS } from "./tokenReport";

const empty = { days: [], sessions: [], models: [], filesScanned: 0, truncated: false };

afterEach(() => {
  clearMocks();
  forgetTokenReport();
});

it("reads the logs once for the usage detail and the Tokens view opened right after", async () => {
  let scans = 0;
  mockIPC((cmd) => (cmd === "token_usage" ? (scans++, empty) : undefined));
  await loadTokenReport(1_000);
  await loadTokenReport(1_000 + REPORT_FRESH_MS - 1);
  expect(scans).toBe(1);
  await loadTokenReport(1_000 + REPORT_FRESH_MS + 1);
  expect(scans).toBe(2);
});

it("reads again after a failed scan", async () => {
  let scans = 0;
  mockIPC((cmd) => {
    if (cmd !== "token_usage") return undefined;
    scans++;
    if (scans === 1) throw new Error("busy");
    return empty;
  });
  await expect(loadTokenReport(1_000)).rejects.toThrow();
  await expect(loadTokenReport(1_001)).resolves.toEqual(empty);
  expect(scans).toBe(2);
});
