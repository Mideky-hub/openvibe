import { createStore } from "zustand";
import { messages } from "@/i18n";
import { createLoopEngine, TICK_MS, type EngineDeps, type LoopRuntime } from "./engine";
import { loopsMessages } from "./messages";
import { LOOPS_VERSION, readLoops, validateLoop, withLoop, withoutLoop, type LoopDef } from "./model";

/** The setting that holds the loops (spec boucles §3): their definitions only, never that one is on. */
export const LOOPS_KEY = "loops.list";

export interface LoopsIo {
  read: () => Promise<unknown>;
  write: (value: unknown) => Promise<void>;
}

export interface Timers {
  setInterval: (fn: () => void, ms: number) => ReturnType<typeof setInterval>;
  clearInterval: (timer: ReturnType<typeof setInterval>) => void;
}

export interface LoopsState {
  loops: LoopDef[];
  loaded: boolean;
  /** The state of the loops turned on since the application started. */
  runtime: Record<string, LoopRuntime>;
  load: () => Promise<void>;
  /** "invalid" when the loop breaks a rule (no stop condition, say), "full" when the list is. */
  save: (loop: LoopDef) => Promise<"ok" | "invalid" | "full">;
  remove: (id: string) => Promise<void>;
  start: (id: string) => void;
  stop: (id: string) => void;
  stopAll: () => void;
  runningCount: () => number;
}

/**
 * The loops' store (spec boucles §4). Its inputs are passed in: the real ones
 * are wired in `live.ts`; tests pass fakes and never drive a real agent.
 */
export function createLoopsStore(
  engineDeps: EngineDeps,
  io: LoopsIo,
  timers: Timers = { setInterval: (fn, ms) => setInterval(fn, ms), clearInterval: (t) => clearInterval(t) },
) {
  let timer: ReturnType<typeof setInterval> | null = null;
  let reading: Promise<void> | null = null;

  const engine = createLoopEngine(engineDeps, (id, runtime) => {
    store.setState((s) => ({ runtime: { ...s.runtime, [id]: runtime } }));
    // The timer only runs while a loop does.
    if (timer !== null && engine.running().length === 0) {
      timers.clearInterval(timer);
      timer = null;
    }
  });

  const store = createStore<LoopsState>()((set, get) => {
    const persist = (loops: LoopDef[]) => io.write({ version: LOOPS_VERSION, loops });
    // A failed read stops the change: it does not read as an empty list.
    const readList = async () => {
      await get().load();
      if (!get().loaded) throw new Error(messages(loopsMessages).notRead);
    };
    const ticking = () => {
      timer ??= timers.setInterval(() => void engine.tick(), TICK_MS);
    };
    return {
      loops: [],
      loaded: false,
      runtime: {},
      load: () => {
        if (get().loaded) return Promise.resolve();
        reading ??= io
          .read()
          .then((raw) => set({ loops: readLoops(raw), loaded: true }))
          .catch((error: unknown) => console.warn("loops not read", error))
          .finally(() => {
            reading = null;
          });
        return reading;
      },
      save: async (loop) => {
        const checked = validateLoop(loop);
        if (!checked.ok) return "invalid";
        await readList();
        const kept: LoopDef = { ...checked.loop, id: loop.id };
        const next = withLoop(get().loops, kept);
        if (next === null) return "full";
        // A loop changed while it ran is no longer the one the user turned on.
        engine.stop(kept.id);
        set({ loops: next });
        await persist(next);
        return "ok";
      },
      remove: async (id) => {
        await readList();
        engine.stop(id);
        const next = withoutLoop(get().loops, id);
        set({ loops: next });
        await persist(next);
      },
      start: (id) => {
        const loop = get().loops.find((l) => l.id === id);
        if (!loop) return;
        engine.start(loop);
        ticking();
      },
      stop: (id) => engine.stop(id),
      stopAll: () => engine.stopAll(),
      runningCount: () => Object.values(get().runtime).filter((r) => r.running).length,
    };
  });

  return Object.assign(store, {
    /** The idle trigger's input: an agent's activity changed. */
    activity: engine.activity,
    /** Ticks the engine once (the timer does it every `TICK_MS`). */
    tick: engine.tick,
  });
}
