import { describe, expect, it } from "vitest";
import {
  LOOP_TEMPLATES,
  MAX_LOOPS,
  readLoops,
  stopsAfter,
  validateLoop,
  withLoop,
  withoutLoop,
  type LoopDef,
  type LoopDraft,
} from "./model";

const draft = (over: Partial<LoopDraft> = {}): LoopDraft => ({
  name: "Point",
  instruction: "Fais un point d'avancement",
  targets: ["a"],
  trigger: { kind: "interval", minutes: 30 },
  maxRuns: 8,
  ...over,
});

describe("validateLoop (spec boucles §3)", () => {
  it("accepts a loop with a stop condition, trimming its texts", () => {
    const result = validateLoop(draft({ name: "  Point  ", instruction: "  go  " }));
    expect(result).toEqual({ ok: true, loop: expect.objectContaining({ name: "Point", instruction: "go", targets: ["a"], maxRuns: 8 }) });
  });

  it("refuses a loop without any stop condition, whatever the rest", () => {
    expect(validateLoop(draft({ maxRuns: undefined, maxMinutes: undefined }))).toEqual({ ok: false, error: "stop" });
    expect(validateLoop(draft({ maxRuns: undefined, maxMinutes: 60 })).ok).toBe(true);
  });

  it("bounds the runs, the duration and the interval", () => {
    expect(validateLoop(draft({ maxRuns: 0 }))).toEqual({ ok: false, error: "runs" });
    expect(validateLoop(draft({ maxRuns: 1001 }))).toEqual({ ok: false, error: "runs" });
    expect(validateLoop(draft({ maxRuns: 2.5 }))).toEqual({ ok: false, error: "runs" });
    expect(validateLoop(draft({ maxRuns: undefined, maxMinutes: 1441 }))).toEqual({ ok: false, error: "minutes" });
    expect(validateLoop(draft({ trigger: { kind: "interval", minutes: 0 } }))).toEqual({ ok: false, error: "interval" });
    expect(validateLoop(draft({ trigger: { kind: "interval", minutes: 1441 } }))).toEqual({ ok: false, error: "interval" });
  });

  it("needs a name, an instruction, a target and, for the output trigger, a text of 200 characters at most", () => {
    expect(validateLoop(draft({ name: "  " }))).toEqual({ ok: false, error: "name" });
    expect(validateLoop(draft({ instruction: "" }))).toEqual({ ok: false, error: "instruction" });
    expect(validateLoop(draft({ targets: [] }))).toEqual({ ok: false, error: "targets" });
    expect(validateLoop(draft({ trigger: { kind: "output", text: "  " } }))).toEqual({ ok: false, error: "text" });
    expect(validateLoop(draft({ trigger: { kind: "output", text: "x".repeat(201) } }))).toEqual({ ok: false, error: "text" });
    expect(validateLoop(draft({ trigger: { kind: "output", text: "FAIL" } })).ok).toBe(true);
    expect(validateLoop(draft({ trigger: { kind: "idle" } })).ok).toBe(true);
  });

  it("keeps each target once", () => {
    const result = validateLoop(draft({ targets: ["a", "b", "a"] }));
    expect(result.ok && result.loop.targets).toEqual(["a", "b"]);
  });
});

describe("the templates", () => {
  it("are three, each a valid loop once given a target, and none starts anything by itself", () => {
    expect(LOOP_TEMPLATES.map((t) => t.id)).toEqual(["progress", "relaunch", "tests"]);
    for (const template of LOOP_TEMPLATES) {
      const filled = validateLoop({ ...template.draft, name: "n", instruction: "x", targets: ["a"] });
      expect(filled.ok, template.id).toBe(true);
      expect(template.draft.maxRuns ?? template.draft.maxMinutes, template.id).toBeDefined();
    }
  });
});

describe("stopsAfter", () => {
  it("reads which condition a loop has", () => {
    const loop = validateLoop(draft({ maxRuns: 3, maxMinutes: 10 }));
    expect(loop.ok && stopsAfter(loop.loop)).toEqual({ runs: 3, minutes: 10 });
  });
});

describe("readLoops and the list", () => {
  const good = (() => {
    const r = validateLoop(draft());
    return { ...(r.ok ? r.loop : ({} as LoopDef)), id: "1" };
  })();

  it("reads a good list, nothing from a damaged setting, and drops an invalid loop alone", () => {
    expect(readLoops({ version: 1, loops: [good] })).toEqual([good]);
    for (const bad of [null, 4, "x", [], { version: 2, loops: [good] }, { version: 1, loops: "no" }]) expect(readLoops(bad)).toEqual([]);
    const noStop = { ...good, id: "2", maxRuns: undefined };
    expect(readLoops({ version: 1, loops: [noStop, good, { id: 3 }] })).toEqual([good]);
  });

  it("keeps at most 30 loops, replaces one by id, removes one by id", () => {
    const many = Array.from({ length: MAX_LOOPS + 5 }, (_, i) => ({ ...good, id: String(i) }));
    expect(readLoops({ version: 1, loops: many })).toHaveLength(MAX_LOOPS);
    expect(withLoop([good], { ...good, name: "Autre" })!.map((l) => l.name)).toEqual(["Autre"]);
    expect(withLoop(many.slice(0, MAX_LOOPS), { ...good, id: "new" })).toBeNull();
    expect(withoutLoop([good], "1")).toEqual([]);
  });
});
