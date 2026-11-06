// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import type { TokenReport } from "@/ipc/tokens";
import { langStore } from "@/i18n";
import { SESSIONS_CAP } from "@/usage/activity";
import { ActivityMap } from "./ActivityMap";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const counts = (input: number) => ({ input, output: 0, cacheRead: 0, cacheWrite: 0 });
const report = (sessions: TokenReport["sessions"]): TokenReport => ({
  days: [10, 0, 30_000, 20, 5, 0].map((n, i) => ({ date: `2026-11-0${i + 1}`, counts: counts(n) })),
  sessions,
  models: [],
  filesScanned: 2,
  truncated: false,
});
const two = [
  { sessionId: "a", model: null, counts: counts(20_000) },
  { sessionId: "b", model: null, counts: counts(10_035) },
];

async function show(r: TokenReport) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<ActivityMap report={r} />));
  const stat = (key: string) => host.querySelector(`[data-activity-stat="${key}"]`)?.textContent ?? "";
  return { host, stat, done: () => act(async () => root.unmount()) };
}

it("maps each day of the window by its tokens, and sums up the sessions", async () => {
  const { host, stat, done } = await show(report(two));
  const cells = [...host.querySelectorAll<HTMLElement>("[data-activity-day]")];
  expect(cells.map((cell) => cell.dataset.activityDay)).toEqual(["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"]);
  expect(cells[2].dataset.level).toBe("4");
  expect(cells[1].dataset.level).toBe("0");
  expect(cells[2].title).toContain("3 nov.");
  expect(cells[2].title).toContain("30,0 k");
  expect(stat("active")).toContain("Jours actifs");
  expect(stat("active")).toContain("4 / 6");
  expect(stat("streak")).toContain("3 jours");
  expect(stat("longest")).toContain("3 jours");
  expect(stat("busiest")).toContain("3 nov. · 30,0 k");
  expect(stat("perDay")).toContain("7,5 k");
  expect(stat("sessions")).toContain("2");
  expect(stat("perSession")).toContain("15,0 k");
  await done();
});

it("says « at least » when the logs hold more sessions than listed, without an average", async () => {
  const many = Array.from({ length: SESSIONS_CAP }, (_, i) => ({ sessionId: `s${i}`, model: null, counts: counts(1) }));
  const { stat, done } = await show(report(many));
  expect(stat("sessions")).toContain(`${SESSIONS_CAP} et plus`);
  expect(stat("perSession")).toBe("");
  await done();
});

it("speaks English", async () => {
  langStore.setState({ lang: "en" });
  const { host, stat, done } = await show(report(two));
  expect(stat("active")).toContain("Active days");
  expect(stat("streak")).toContain("3 days");
  expect(stat("busiest")).toContain("3 Nov · 30.0 k");
  expect(stat("perSession")).toContain("Average per session");
  expect(host.querySelector("[role=img]")?.getAttribute("aria-label")).toContain("4 active days out of 6");
  await done();
  langStore.setState({ lang: "fr" });
});
