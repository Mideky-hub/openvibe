import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Activity } from "@/ipc/activity";
import { COOLDOWN_MS, createLoopEngine, type EngineDeps, type LoopRuntime } from "./engine";
import type { LoopDef } from "./model";

const MIN = 60_000;
let now: number;
let activities: Record<string, Activity | undefined>;
let screens: Record<string, string>;
let live: Set<string>;
let sent: { ids: string[]; text: string }[];
let reach: number | null;
let runtimes: Record<string, LoopRuntime>;

const deps = (): EngineDeps => ({
  now: () => now,
  isLive: (id) => live.has(id),
  activityOf: (id) => activities[id],
  screenOf: (id) => screens[id] ?? "",
  send: async (ids, text) => {
    sent.push({ ids, text });
    return { sent: reach ?? ids.length };
  },
});

const loop = (over: Partial<LoopDef> = {}): LoopDef => ({
  id: "l1",
  name: "Point",
  instruction: "fais un point",
  targets: ["a", "b"],
  trigger: { kind: "interval", minutes: 10 },
  maxRuns: 3,
  ...over,
});

const engine = () => createLoopEngine(deps(), (id, runtime) => (runtimes[id] = runtime));
const tick = async (e: ReturnType<typeof engine>, advance = 0) => {
  now += advance;
  await e.tick();
};

beforeEach(() => {
  now = 1_000_000;
  activities = {};
  screens = {};
  live = new Set(["a", "b"]);
  sent = [];
  reach = null;
  runtimes = {};
});

describe("the interval trigger", () => {
  it("waits one interval, then sends to every target, and counts the runs", async () => {
    const e = engine();
    e.start(loop());
    await tick(e);
    expect(sent).toEqual([]);
    await tick(e, 10 * MIN);
    expect(sent).toEqual([{ ids: ["a", "b"], text: "fais un point" }]);
    expect(runtimes.l1).toMatchObject({ running: true, runs: 1 });
    await tick(e, 5 * MIN);
    expect(sent).toHaveLength(1);
    await tick(e, 5 * MIN);
    expect(sent).toHaveLength(2);
    expect(runtimes.l1.runs).toBe(2);
  });

  it("stops after its last run, and says why", async () => {
    const e = engine();
    e.start(loop({ maxRuns: 2 }));
    await tick(e, 10 * MIN);
    await tick(e, 10 * MIN);
    expect(runtimes.l1).toMatchObject({ running: false, runs: 2, stoppedBecause: "runs" });
    await tick(e, 10 * MIN);
    expect(sent).toHaveLength(2);
  });

  it("stops by its duration, before a run that would come after it", async () => {
    const e = engine();
    e.start(loop({ maxRuns: undefined, maxMinutes: 25 }));
    await tick(e, 10 * MIN);
    await tick(e, 10 * MIN);
    expect(sent).toHaveLength(2);
    await tick(e, 10 * MIN);
    expect(runtimes.l1).toMatchObject({ running: false, stoppedBecause: "duration" });
    expect(sent).toHaveLength(2);
  });
});

describe("the idle trigger", () => {
  it("sends to the target that just became idle, not to the others, and only after work or a wait", async () => {
    const e = engine();
    e.start(loop({ trigger: { kind: "idle" } }));
    e.activity("a", "idle", undefined);
    e.activity("a", "idle", "idle");
    await tick(e);
    expect(sent).toEqual([]);
    e.activity("a", "idle", "working");
    await tick(e);
    expect(sent).toEqual([{ ids: ["a"], text: "fais un point" }]);
  });

  it("leaves 30 seconds between two runs, and ignores an agent that is not a target", async () => {
    const e = engine();
    e.start(loop({ trigger: { kind: "idle" }, maxRuns: 10 }));
    e.activity("a", "idle", "working");
    await tick(e);
    e.activity("a", "idle", "working");
    await tick(e);
    expect(sent).toHaveLength(1);
    await tick(e, COOLDOWN_MS);
    e.activity("a", "idle", "waiting");
    await tick(e);
    expect(sent).toHaveLength(2);
    e.activity("zz", "idle", "working");
    await tick(e, COOLDOWN_MS);
    expect(sent).toHaveLength(2);
  });
});

describe("the output trigger", () => {
  it("fires when the text appears, not while it stays on screen, ignoring case", async () => {
    const e = engine();
    e.start(loop({ trigger: { kind: "output", text: "fail" }, maxRuns: 10 }));
    await tick(e, 2000);
    expect(sent).toEqual([]);
    screens.a = "3 tests FAILED";
    await tick(e, 2000);
    expect(sent).toEqual([{ ids: ["a"], text: "fais un point" }]);
    await tick(e, COOLDOWN_MS);
    expect(sent).toHaveLength(1);
    // The text goes, then comes back: a new run.
    screens.a = "all green";
    await tick(e, 2000);
    screens.a = "FAIL again";
    await tick(e, COOLDOWN_MS);
    expect(sent).toHaveLength(2);
  });

  it("does not fire for a text already on screen when the loop is turned on", async () => {
    screens.a = "old FAIL";
    const e = engine();
    e.start(loop({ trigger: { kind: "output", text: "FAIL" } }));
    await tick(e, 2000);
    expect(sent).toEqual([]);
  });

  it("holds a text that appears during the pause until the pause ends", async () => {
    const e = engine();
    e.start(loop({ trigger: { kind: "output", text: "FAIL" }, maxRuns: 10 }));
    screens.a = "FAIL";
    await tick(e, 2000);
    screens.a = "ok";
    await tick(e, 2000);
    screens.a = "FAIL";
    await tick(e, 2000);
    expect(sent).toHaveLength(1);
    await tick(e, COOLDOWN_MS);
    expect(sent).toHaveLength(2);
  });
});

describe("the spending guards (spec boucles §1)", () => {
  it("never sends to an agent that is waiting for an answer, a permission dialog included", async () => {
    activities.a = "waiting";
    const e = engine();
    e.start(loop());
    await tick(e, 10 * MIN);
    expect(sent).toEqual([{ ids: ["b"], text: "fais un point" }]);
    activities.b = "waiting";
    await tick(e, 10 * MIN);
    // Everyone waits: nothing is sent and nothing is counted.
    expect(sent).toHaveLength(1);
    expect(runtimes.l1.runs).toBe(1);
  });

  it("does not count a run that reached nobody", async () => {
    reach = 0;
    const e = engine();
    e.start(loop());
    await tick(e, 10 * MIN);
    expect(runtimes.l1.runs).toBe(0);
    expect(runtimes.l1.running).toBe(true);
  });

  it("does not let a failing send break the loop, nor count", async () => {
    const failing: EngineDeps = { ...deps(), send: vi.fn(async () => Promise.reject(new Error("dead"))) };
    const e = createLoopEngine(failing, (id, runtime) => (runtimes[id] = runtime));
    e.start(loop());
    now += 10 * MIN;
    await expect(e.tick()).resolves.toBeUndefined();
    expect(runtimes.l1.runs).toBe(0);
  });

  it("skips the targets that were closed, and turns itself off when none is left", async () => {
    live.delete("a");
    const e = engine();
    e.start(loop());
    await tick(e, 10 * MIN);
    expect(sent).toEqual([{ ids: ["b"], text: "fais un point" }]);
    live.delete("b");
    await tick(e, 10 * MIN);
    expect(runtimes.l1).toMatchObject({ running: false, stoppedBecause: "noTargets" });
  });

  it("stops one loop, and all of them in one go", async () => {
    const e = engine();
    e.start(loop());
    e.start(loop({ id: "l2" }));
    e.stop("l1");
    expect(runtimes.l1).toMatchObject({ running: false, stoppedBecause: "manual" });
    expect(runtimes.l2.running).toBe(true);
    e.stopAll();
    expect(runtimes.l2).toMatchObject({ running: false, stoppedBecause: "manual" });
    await tick(e, 60 * MIN);
    expect(sent).toEqual([]);
    expect(e.running()).toEqual([]);
  });

  it("restarts a loop from zero: runs back to 0, the interval from the new start", async () => {
    const e = engine();
    e.start(loop({ maxRuns: 1 }));
    await tick(e, 10 * MIN);
    expect(runtimes.l1.stoppedBecause).toBe("runs");
    e.start(loop({ maxRuns: 1 }));
    expect(runtimes.l1).toMatchObject({ running: true, runs: 0, stoppedBecause: null });
    await tick(e, 5 * MIN);
    expect(sent).toHaveLength(1);
  });

  it("does not send twice at once when a tick comes while a send is still pending", async () => {
    let release: (value: { sent: number }) => void = () => undefined;
    const slow: EngineDeps = { ...deps(), send: vi.fn(() => new Promise<{ sent: number }>((resolve) => (release = resolve))) };
    const e = createLoopEngine(slow, (id, runtime) => (runtimes[id] = runtime));
    e.start(loop());
    now += 10 * MIN;
    const first = e.tick();
    now += 10 * MIN;
    await e.tick();
    expect(slow.send).toHaveBeenCalledTimes(1);
    release({ sent: 2 });
    await first;
    expect(runtimes.l1.runs).toBe(1);
  });
});
