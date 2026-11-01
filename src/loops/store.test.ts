import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EngineDeps } from "./engine";
import { TICK_MS } from "./engine";
import { LOOPS_VERSION, type LoopDef } from "./model";
import { createLoopsStore } from "./store";

const loop = (id: string, over: Partial<LoopDef> = {}): LoopDef => ({
  id,
  name: `Boucle ${id}`,
  instruction: "go",
  targets: ["a"],
  trigger: { kind: "interval", minutes: 1 },
  maxRuns: 3,
  ...over,
});

let stored: unknown;
let saved: unknown[];
let now: number;
let timers: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; fire: () => void };
let sent: string[][];

const engineDeps = (): EngineDeps => ({
  now: () => now,
  isLive: () => true,
  activityOf: () => undefined,
  screenOf: () => "",
  canReceive: () => true,
  send: async (ids) => {
    sent.push(ids);
    return { sent: ids.length };
  },
});

function make() {
  let callback: () => void = () => undefined;
  timers = {
    start: vi.fn((fn: () => void) => {
      callback = fn;
      return 1 as never;
    }),
    stop: vi.fn(),
    fire: () => callback(),
  };
  return createLoopsStore(
    engineDeps(),
    {
      read: async () => stored,
      write: async (value) => void saved.push(value),
    },
    { setInterval: timers.start as never, clearInterval: timers.stop as never },
  );
}

beforeEach(() => {
  now = 0;
  saved = [];
  sent = [];
  stored = { version: LOOPS_VERSION, loops: [loop("1"), loop("2")] };
});

describe("the loops store", () => {
  it("saves nothing over a list it could not read: a read error must not wipe the loops (review)", async () => {
    const store = createLoopsStore(engineDeps(), { read: () => Promise.reject(new Error("database is locked")), write: async (value) => void saved.push(value) });
    await expect(store.getState().save(loop("9"))).rejects.toThrow();
    await expect(store.getState().remove("1")).rejects.toThrow();
    expect(saved).toEqual([]);
    expect(store.getState().loaded).toBe(false);
  });

  it("loads the saved loops all off: nothing runs after a restart (spec boucles §1)", async () => {
    const store = make();
    await store.getState().load();
    expect(store.getState().loops.map((l) => l.id)).toEqual(["1", "2"]);
    expect(store.getState().runtime).toEqual({});
    expect(timers.start).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
  });

  it("turns a loop on, ticks the engine while one runs, and stops the timer when none does", async () => {
    const store = make();
    await store.getState().load();
    store.getState().start("1");
    expect(store.getState().runtime["1"]).toMatchObject({ running: true, runs: 0 });
    expect(timers.start).toHaveBeenCalledWith(expect.any(Function), TICK_MS);
    now = 60_000;
    timers.fire();
    await vi.waitFor(() => expect(store.getState().runtime["1"].runs).toBe(1));
    expect(sent).toEqual([["a"]]);
    store.getState().stop("1");
    expect(timers.stop).toHaveBeenCalled();
  });

  it("stops all loops at once", async () => {
    const store = make();
    await store.getState().load();
    store.getState().start("1");
    store.getState().start("2");
    expect(store.getState().runningCount()).toBe(2);
    store.getState().stopAll();
    expect(store.getState().runningCount()).toBe(0);
    expect(store.getState().runtime["2"].stoppedBecause).toBe("manual");
  });

  it("saves definitions only, versioned: never that a loop is on", async () => {
    const store = make();
    await store.getState().load();
    store.getState().start("1");
    expect(await store.getState().save(loop("3"))).toBe("ok");
    expect(saved[saved.length - 1]).toEqual({ version: LOOPS_VERSION, loops: [loop("1"), loop("2"), loop("3")] });
    expect(JSON.stringify(saved)).not.toContain("running");
  });

  it("refuses a loop without stop condition, even if the interface let it through", async () => {
    const store = make();
    await store.getState().load();
    expect(await store.getState().save(loop("9", { maxRuns: undefined }))).toBe("invalid");
    expect(saved).toEqual([]);
    expect(store.getState().loops).toHaveLength(2);
  });

  it("removes a loop, stopping it first", async () => {
    const store = make();
    await store.getState().load();
    store.getState().start("1");
    await store.getState().remove("1");
    expect(store.getState().loops.map((l) => l.id)).toEqual(["2"]);
    expect(store.getState().runtime["1"]?.running ?? false).toBe(false);
  });

  it("changing a loop that runs turns it off: it was not the loop the user turned on", async () => {
    const store = make();
    await store.getState().load();
    store.getState().start("1");
    await store.getState().save(loop("1", { instruction: "autre chose" }));
    expect(store.getState().runtime["1"].running).toBe(false);
  });

  it("does not save over a list it has not read", async () => {
    let release: (value: unknown) => void = () => undefined;
    const store = createLoopsStore(engineDeps(), {
      read: () => new Promise((resolve) => (release = resolve)),
      write: async (value) => void saved.push(value),
    });
    const saving = store.getState().save(loop("3"));
    release({ version: LOOPS_VERSION, loops: [loop("1")] });
    expect(await saving).toBe("ok");
    expect(saved[saved.length - 1]).toEqual({ version: LOOPS_VERSION, loops: [loop("1"), loop("3")] });
  });
});
