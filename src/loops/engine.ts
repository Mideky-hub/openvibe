import type { Activity } from "@/ipc/activity";
import type { LoopDef } from "./model";

/** The least time between two runs of an idle or output loop (spec boucles §3). */
export const COOLDOWN_MS = 30_000;
/** How often the engine is ticked (output screens are read at each tick). */
export const TICK_MS = 2000;

export type StopReason = "runs" | "duration" | "manual" | "noTargets";

/** What the interface shows of a loop. */
export interface LoopRuntime {
  running: boolean;
  runs: number;
  startedAt: number | null;
  stoppedBecause: StopReason | null;
}

/** What the engine needs from the application: tests pass fakes, so no real agent is ever driven. */
export interface EngineDeps {
  now: () => number;
  /** The agent is still on the canvas. */
  isLive: (nodeId: string) => boolean;
  activityOf: (nodeId: string) => Activity | undefined;
  /** What the agent's terminal shows now. */
  screenOf: (nodeId: string) => string;
  /** Types the instruction into the agents; how many it reached (it spares those that wait, stopped or starting). */
  send: (nodeIds: string[], text: string) => Promise<{ sent: number }>;
}

interface State {
  def: LoopDef;
  runtime: LoopRuntime;
  nextAt: number;
  lastRunAt: number | null;
  /** Output trigger: whether each target's screen showed the text at the last look. */
  matched: Map<string, boolean>;
  /** Idle trigger: the targets that just became idle. */
  idle: Set<string>;
  busy: boolean;
}

const shows = (screen: string, text: string) => screen.toLocaleLowerCase().includes(text.toLocaleLowerCase());

/**
 * The loops' engine (spec boucles §3). Nothing here runs by itself: the
 * caller ticks it and reports activity changes. Every run goes through the
 * guards: a stop condition checked before each run, no send to an agent that
 * waits (a permission dialog included), a pause between runs, one send at a
 * time per loop.
 */
export function createLoopEngine(deps: EngineDeps, onChange: (id: string, runtime: LoopRuntime) => void) {
  const states = new Map<string, State>();

  const publish = (state: State) => onChange(state.def.id, { ...state.runtime });

  function stop(id: string, reason: StopReason = "manual") {
    const state = states.get(id);
    if (!state || !state.runtime.running) return;
    state.runtime = { ...state.runtime, running: false, stoppedBecause: reason };
    publish(state);
  }

  function start(def: LoopDef) {
    const now = deps.now();
    const state: State = {
      def,
      runtime: { running: true, runs: 0, startedAt: now, stoppedBecause: null },
      nextAt: def.trigger.kind === "interval" ? now + def.trigger.minutes * 60_000 : 0,
      lastRunAt: null,
      matched: new Map(),
      idle: new Set(),
      busy: false,
    };
    // A text already on screen is not news: only its appearing fires.
    if (def.trigger.kind === "output") for (const id of def.targets) state.matched.set(id, shows(deps.screenOf(id), def.trigger.text));
    states.set(def.id, state);
    publish(state);
  }

  /** One send to `ids`; counted only if it reached someone. */
  async function run(state: State, ids: string[]) {
    const targets = ids.filter((id) => deps.isLive(id) && deps.activityOf(id) !== "waiting");
    if (targets.length === 0 || state.busy) return;
    state.busy = true;
    state.lastRunAt = deps.now();
    try {
      const { sent } = await deps.send(targets, state.def.instruction);
      if (sent > 0 && state.runtime.running) {
        state.runtime = { ...state.runtime, runs: state.runtime.runs + 1 };
        publish(state);
        if (state.def.maxRuns !== undefined && state.runtime.runs >= state.def.maxRuns) stop(state.def.id, "runs");
      }
    } catch {
      // A dead agent: not a run, and the loop goes on to its next trigger or stop.
    } finally {
      state.busy = false;
    }
  }

  const cooledDown = (state: State) => state.lastRunAt === null || deps.now() - state.lastRunAt >= COOLDOWN_MS;

  async function check(state: State) {
    const { def } = state;
    const now = deps.now();
    if (def.maxMinutes !== undefined && now - (state.runtime.startedAt ?? now) >= def.maxMinutes * 60_000) return stop(def.id, "duration");
    const targets = def.targets.filter(deps.isLive);
    if (targets.length === 0) return stop(def.id, "noTargets");
    if (state.busy) return;
    const { trigger } = def;
    if (trigger.kind === "interval") {
      if (now < state.nextAt) return;
      state.nextAt = now + trigger.minutes * 60_000;
      await run(state, targets);
    } else if (trigger.kind === "idle") {
      const fired = targets.filter((id) => state.idle.has(id));
      state.idle.clear();
      if (fired.length > 0 && cooledDown(state)) await run(state, [fired[0]]);
    } else {
      for (const id of targets) {
        const now = shows(deps.screenOf(id), trigger.text);
        // Held while the pause lasts: the text is still new when it ends.
        if (now && state.matched.get(id) !== true && !cooledDown(state)) continue;
        const appeared = now && state.matched.get(id) !== true;
        state.matched.set(id, now);
        if (appeared && state.runtime.running) await run(state, [id]);
      }
    }
  }

  return {
    start,
    stop,
    stopAll() {
      for (const id of [...states.keys()]) stop(id, "manual");
    },
    running: () => [...states.values()].filter((s) => s.runtime.running).map((s) => s.def.id),
    /** An agent's activity changed (the idle trigger). */
    activity(nodeId: string, activity: Activity, previous: Activity | undefined) {
      if (activity !== "idle" || (previous !== "working" && previous !== "waiting")) return;
      for (const state of states.values()) {
        if (state.runtime.running && state.def.trigger.kind === "idle" && state.def.targets.includes(nodeId)) state.idle.add(nodeId);
      }
    },
    async tick() {
      for (const state of [...states.values()]) if (state.runtime.running) await check(state);
    },
  };
}

export type LoopEngine = ReturnType<typeof createLoopEngine>;
