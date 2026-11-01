import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Activity } from "@/ipc/activity";
import { acceptsInstruction, COOLDOWN_MS, createLoopEngine, type EngineDeps, type LoopRuntime } from "./engine";
import type { LoopDef } from "./model";

const MIN = 60_000;
let now: number;
let activities: Record<string, Activity | undefined>;
let screens: Record<string, string>;
const gone = new Set<string>();
let live: Set<string>;
let sent: { ids: string[]; text: string }[];
let reach: number | null;
let runtimes: Record<string, LoopRuntime>;

const deps = (): EngineDeps => ({
  now: () => now,
  isLive: (id) => live.has(id),
  activityOf: (id) => activities[id],
  screenOf: (id) => screens[id] ?? "",
  canReceive: (id) => !gone.has(id),
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

describe("proof by mutation (guards that stayed green)", () => {
  it("counts a run after a failed one as the first: the failure is not a run", async () => {
    let failing = true;
    const flaky: EngineDeps = {
      ...deps(),
      send: async (ids) => {
        if (failing) throw new Error("dead");
        sent.push({ ids, text: "x" });
        return { sent: ids.length };
      },
    };
    const e = createLoopEngine(flaky, (id, runtime) => (runtimes[id] = runtime));
    e.start(loop({ maxRuns: 2 }));
    now += 10 * MIN;
    await e.tick();
    failing = false;
    now += 10 * MIN;
    await e.tick();
    // One real run so far, not two: the loop still has a run left.
    expect(runtimes.l1).toMatchObject({ running: true, runs: 1 });
    now += 10 * MIN;
    await e.tick();
    expect(runtimes.l1).toMatchObject({ running: false, runs: 2, stoppedBecause: "runs" });
  });

  it("never lets a send overlap the one in flight, whichever trigger comes", async () => {
    let release: (value: { sent: number }) => void = () => undefined;
    const slow: EngineDeps = { ...deps(), send: vi.fn(() => new Promise<{ sent: number }>((resolve) => (release = resolve))) };
    const e = createLoopEngine(slow, (id, runtime) => (runtimes[id] = runtime));
    e.start(loop({ trigger: { kind: "idle" }, maxRuns: 10 }));
    e.activity("a", "idle", "working");
    const first = e.tick();
    now += COOLDOWN_MS;
    e.activity("b", "idle", "working");
    await e.tick();
    expect(slow.send).toHaveBeenCalledTimes(1);
    release({ sent: 1 });
    await first;
  });
});

describe("the timing race: an agent starts waiting between the check and the send", () => {
  it("re-reads the activity at the last moment: the interval run spares an agent that turned waiting after the check", async () => {
    // `isLive` is read in the check, before the run's own look: the agent turns waiting there.
    const racing: EngineDeps = {
      ...deps(),
      isLive: (id) => {
        if (id === "a") activities.a = "waiting";
        return live.has(id);
      },
    };
    const e = createLoopEngine(racing, (id, runtime) => (runtimes[id] = runtime));
    e.start(loop());
    now += 10 * MIN;
    await e.tick();
    expect(sent).toEqual([{ ids: ["b"], text: "fais un point" }]);
  });

  it("spares an agent that became idle, then turned waiting before the tick (idle trigger)", async () => {
    const e = engine();
    e.start(loop({ trigger: { kind: "idle" } }));
    e.activity("a", "idle", "working");
    activities.a = "waiting";
    await tick(e);
    expect(sent).toEqual([]);
    expect(runtimes.l1.runs).toBe(0);
  });

  it("spares an agent whose screen showed the text but who is now waiting (output trigger)", async () => {
    const e = engine();
    e.start(loop({ trigger: { kind: "output", text: "FAIL" } }));
    screens.a = "FAIL";
    activities.a = "waiting";
    await tick(e, 2000);
    expect(sent).toEqual([]);
  });
});

describe("the timing race: an agent is closed between the check and the send", () => {
  it("does not type into a terminal that went after the check", async () => {
    const seen = new Map<string, number>();
    const racing: EngineDeps = {
      ...deps(),
      // Live for the check, gone when the run looks again.
      isLive: (id) => {
        seen.set(id, (seen.get(id) ?? 0) + 1);
        return id === "b" || seen.get(id) === 1;
      },
    };
    const e = createLoopEngine(racing, (id, runtime) => (runtimes[id] = runtime));
    e.start(loop());
    now += 10 * MIN;
    await e.tick();
    expect(sent).toEqual([{ ids: ["b"], text: "fais un point" }]);
  });
});

describe("a terminal whose Claude has quit (review)", () => {
  const def: LoopDef = { id: "q", name: "Q", instruction: "del build", targets: ["a", "b"], trigger: { kind: "interval", minutes: 1 }, maxRuns: 2 };

  it("gets nothing typed, and the others still do", async () => {
    gone.clear();
    gone.add("a");
    now = 0;
    live = new Set(["a", "b"]);
    activities = {};
    screens = {};
    sent = [];
    reach = null;
    runtimes = {};
    const engine = createLoopEngine(deps(), (id, runtime) => (runtimes[id] = runtime));
    engine.start(def);
    now = MIN;
    await engine.tick();
    expect(sent).toEqual([{ ids: ["b"], text: "del build" }]);
    gone.clear();
  });

  it("is no run when no target can take it", async () => {
    gone.clear();
    gone.add("a");
    gone.add("b");
    now = 0;
    live = new Set(["a", "b"]);
    activities = {};
    screens = {};
    sent = [];
    reach = null;
    runtimes = {};
    const engine = createLoopEngine(deps(), (id, runtime) => (runtimes[id] = runtime));
    engine.start(def);
    now = MIN;
    await engine.tick();
    expect(sent).toEqual([]);
    expect(runtimes.q.runs).toBe(0);
    gone.clear();
  });
});

describe("what a terminal can take", () => {
  const box = "Some answer\n──────────\n❯ \n──────────\n  ? for shortcuts";

  it("needs Claude's input box for a Claude terminal: its shell would run the text", () => {
    expect(acceptsInstruction("claude", box)).toBe(true);
    expect(acceptsInstruction("claude", "PS C:\\code> ")).toBe(false);
    expect(acceptsInstruction("claude", "")).toBe(false);
  });

  it("leaves the other agents as they were", () => {
    expect(acceptsInstruction("codex", "anything")).toBe(true);
    expect(acceptsInstruction(undefined, "")).toBe(true);
  });
});
