/** What starts a loop's next run (spec boucles §3). */
export type LoopTrigger =
  | { kind: "interval"; minutes: number }
  | { kind: "idle" }
  | { kind: "output"; text: string };

/** A loop as the user fills it in: the stop conditions are optional here, not in a valid loop. */
export interface LoopDraft {
  name: string;
  instruction: string;
  /** Terminal nodes the instruction goes to. */
  targets: string[];
  trigger: LoopTrigger;
  /** Stops after this many runs. */
  maxRuns?: number;
  /** Stops this long after it was turned on. */
  maxMinutes?: number;
}

/** A valid loop: it has a name, an instruction, a target and at least one stop condition. */
export interface LoopDef extends LoopDraft {
  id: string;
}

export const MAX_LOOPS = 30;
export const MAX_RUNS = 1000;
export const MAX_MINUTES = 1440;
export const MAX_TEXT = 200;
/** Version of the saved setting (`loops.list`). */
export const LOOPS_VERSION = 1;

export type LoopError = "name" | "instruction" | "targets" | "interval" | "text" | "runs" | "minutes" | "stop";

export type LoopValidation = { ok: true; loop: LoopDraft } | { ok: false; error: LoopError };

const isCount = (value: unknown, max: number): value is number => typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= max;

/** A draft as kept, or the first thing wrong with it. No loop is valid without a stop condition (spec boucles §1). */
export function validateLoop(draft: LoopDraft): LoopValidation {
  const name = draft.name.replace(/\s+/g, " ").trim();
  const instruction = draft.instruction.trim();
  if (name === "") return { ok: false, error: "name" };
  if (instruction === "") return { ok: false, error: "instruction" };
  const targets = [...new Set(draft.targets)];
  if (targets.length === 0) return { ok: false, error: "targets" };
  let trigger = draft.trigger;
  if (trigger.kind === "interval" && !isCount(trigger.minutes, MAX_MINUTES)) return { ok: false, error: "interval" };
  if (trigger.kind === "output") {
    const text = trigger.text.trim();
    if (text === "" || text.length > MAX_TEXT) return { ok: false, error: "text" };
    trigger = { kind: "output", text };
  }
  if (draft.maxRuns === undefined && draft.maxMinutes === undefined) return { ok: false, error: "stop" };
  if (draft.maxRuns !== undefined && !isCount(draft.maxRuns, MAX_RUNS)) return { ok: false, error: "runs" };
  if (draft.maxMinutes !== undefined && !isCount(draft.maxMinutes, MAX_MINUTES)) return { ok: false, error: "minutes" };
  return {
    ok: true,
    loop: {
      name,
      instruction,
      targets,
      trigger,
      ...(draft.maxRuns !== undefined ? { maxRuns: draft.maxRuns } : {}),
      ...(draft.maxMinutes !== undefined ? { maxMinutes: draft.maxMinutes } : {}),
    },
  };
}

/** The stop conditions of a loop. */
export function stopsAfter(loop: LoopDraft): { runs?: number; minutes?: number } {
  return { ...(loop.maxRuns !== undefined ? { runs: loop.maxRuns } : {}), ...(loop.maxMinutes !== undefined ? { minutes: loop.maxMinutes } : {}) };
}

/** A starting point for the form: it fills a draft, it never starts a loop (spec boucles §3). */
export interface LoopTemplate {
  id: "progress" | "relaunch" | "tests";
  /** Everything but the name, the instruction (in the language of the moment) and the targets. */
  draft: Omit<LoopDraft, "name" | "instruction" | "targets">;
}

export const LOOP_TEMPLATES: readonly LoopTemplate[] = [
  { id: "progress", draft: { trigger: { kind: "interval", minutes: 30 }, maxRuns: 8 } },
  { id: "relaunch", draft: { trigger: { kind: "idle" }, maxRuns: 5 } },
  { id: "tests", draft: { trigger: { kind: "output", text: "FAIL" }, maxRuns: 5 } },
];

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function readTrigger(raw: unknown): LoopTrigger | null {
  if (!isObject(raw)) return null;
  if (raw.kind === "idle") return { kind: "idle" };
  if (raw.kind === "interval" && typeof raw.minutes === "number") return { kind: "interval", minutes: raw.minutes };
  if (raw.kind === "output" && typeof raw.text === "string") return { kind: "output", text: raw.text };
  return null;
}

function readLoop(raw: unknown): LoopDef | null {
  if (!isObject(raw) || typeof raw.id !== "string" || typeof raw.name !== "string" || typeof raw.instruction !== "string") return null;
  const trigger = readTrigger(raw.trigger);
  if (!trigger || !Array.isArray(raw.targets) || !raw.targets.every((t): t is string => typeof t === "string")) return null;
  const result = validateLoop({
    name: raw.name,
    instruction: raw.instruction,
    targets: raw.targets,
    trigger,
    ...(typeof raw.maxRuns === "number" ? { maxRuns: raw.maxRuns } : {}),
    ...(typeof raw.maxMinutes === "number" ? { maxMinutes: raw.maxMinutes } : {}),
  });
  return result.ok ? { ...result.loop, id: raw.id } : null;
}

/** The loops of the saved setting: an invalid one is left out, the others stay (spec boucles §3). */
export function readLoops(raw: unknown): LoopDef[] {
  if (!isObject(raw) || raw.version !== LOOPS_VERSION || !Array.isArray(raw.loops)) return [];
  return raw.loops.flatMap((l) => readLoop(l) ?? []).slice(0, MAX_LOOPS);
}

/** The list with `loop` added, or replacing the one of its id; null when the list is full. */
export function withLoop(list: readonly LoopDef[], loop: LoopDef): LoopDef[] | null {
  const at = list.findIndex((l) => l.id === loop.id);
  if (at !== -1) return list.map((l, i) => (i === at ? loop : l));
  return list.length >= MAX_LOOPS ? null : [...list, loop];
}

export function withoutLoop(list: readonly LoopDef[], id: string): LoopDef[] {
  return list.filter((l) => l.id !== id);
}
