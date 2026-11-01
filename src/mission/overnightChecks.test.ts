import { describe, expect, it } from "vitest";
import type { Limits } from "@/usage/usage";
import { blockers, usageWarning } from "./overnightChecks";

const limits = (fiveHour: number, sevenDay: number): Limits => ({ fiveHour: { usedPercent: fiveHour }, sevenDay: { usedPercent: sevenDay }, models: [] }) as unknown as Limits;

describe("what stops a night before it starts (spec mission de nuit §5.2)", () => {
  it("needs a git repository, whatever the source", () => {
    expect(blockers({ git: false, gh: true }, "backlog")).toEqual(["git"]);
    expect(blockers({ git: true, gh: true }, "backlog")).toEqual([]);
  });

  it("needs gh only to read GitHub", () => {
    expect(blockers({ git: true, gh: false }, "github")).toEqual(["gh"]);
    expect(blockers({ git: true, gh: false }, "backlog")).toEqual([]);
  });
});

describe("the plan's usage", () => {
  it("warns from 80 %, on the fuller window", () => {
    expect(usageWarning(limits(10, 79), 0)).toBeNull();
    expect(usageWarning(limits(80, 10), 0)).toBe(80);
    expect(usageWarning(limits(10, 91.6), 0)).toBe(92);
  });

  it("says nothing when it is unknown", () => {
    expect(usageWarning(null, 0)).toBeNull();
    expect(usageWarning({ models: [] } as unknown as Limits, 0)).toBeNull();
  });
});
