import { expect, it } from "vitest";
import { formatClock, formatDecimal, keyLabel } from "./format";

it("writes decimals with the language's separator", () => {
  expect(formatDecimal(67.84, 1, "fr")).toBe("67,8");
  expect(formatDecimal(67.84, 1, "en")).toBe("67.8");
});

it("names the keys the way each keyboard prints them", () => {
  expect(keyLabel("Ctrl+Maj+P", "en")).toBe("Ctrl+Shift+P");
  expect(keyLabel("Maj+Échap", "en")).toBe("Shift+Esc");
  expect(keyLabel("Suppr", "en")).toBe("Del");
  expect(keyLabel("Ctrl+Maj+P", "fr")).toBe("Ctrl+Maj+P");
});

it("dates a usage reset: the time today, the weekday and time another day", () => {
  const now = new Date(2026, 9, 27, 14, 0).getTime();
  const tuesday = new Date(2026, 9, 28, 9, 0).getTime();
  const nextTuesday = new Date(2026, 10, 3, 9, 0).getTime();
  expect(formatClock(new Date(2026, 9, 27, 18, 5).getTime(), now, "en")).toBe("18:05");
  expect(formatClock(tuesday, now, "en")).toBe("Wed 09:00");
  expect(formatClock(tuesday, now, "fr")).toBe("mer. 09:00");
  // Beyond six days the weekday alone could be read as the nearest one: the date is added.
  expect(formatClock(nextTuesday, now, "en")).toBe("3 Nov 09:00");
  expect(formatClock(nextTuesday, now, "fr")).toBe("3 nov. 09:00");
});
