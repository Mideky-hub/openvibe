import { messages } from "@/i18n";
import { agentMessages } from "@/mcp/messages";

/** A step an agent declared (spec orchestrateur §4.4, §5): its frieze shows them in order. */
export type StepState = "a_venir" | "en_cours" | "fait" | "echec";

export interface Step {
  title: string;
  state: StepState;
}

export const MAX_STEPS = 12;
export const MAX_STEP_TITLE = 40;
const STATES: readonly string[] = ["a_venir", "en_cours", "fait", "echec"];
const MARKS: readonly string[] = ["en_cours", "fait", "echec"];

const titleOf = (raw: unknown) => (typeof raw === "string" && raw.trim() ? raw.trim().slice(0, MAX_STEP_TITLE) : null);
const t = () => messages(agentMessages).steps;
/** An agent's title past the limit is refused, never cut: it would no longer name its step. */
const tooLong = (raw: unknown) => typeof raw === "string" && raw.trim().length > MAX_STEP_TITLE;

/** Steps saved in a terminal's payload; undefined when absent or unreadable. */
export function readSteps(raw: unknown): Step[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_STEPS) return undefined;
  const steps = raw.map((s) => (typeof s === "object" && s !== null ? (s as Record<string, unknown>) : {}));
  if (!steps.every((s) => titleOf(s.title) && typeof s.state === "string" && STATES.includes(s.state))) return undefined;
  return steps.map((s) => ({ title: titleOf(s.title)!, state: s.state as StepState }));
}

/** `declare_steps`: the steps, all to come; or what is wrong. */
export function declaredSteps(raw: unknown): Step[] | string {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_STEPS) return t().count(MAX_STEPS);
  if (raw.some(tooLong)) return t().tooLong(MAX_STEP_TITLE);
  const titles = raw.map(titleOf);
  if (titles.some((title) => title === null)) return t().shortTitle;
  // The second of two equal titles could never be marked: marking finds the first.
  const seen = new Set<string>();
  for (const title of titles as string[]) {
    if (seen.has(title.toLowerCase())) return t().duplicate(title);
    seen.add(title.toLowerCase());
  }
  return titles.map((title) => ({ title: title!, state: "a_venir" }));
}

/** `step`: the step of that title (case aside) takes the state; an unknown one is added at the end. */
export function markedSteps(steps: readonly Step[], rawTitle: unknown, state: unknown): Step[] | string {
  if (tooLong(rawTitle)) return t().tooLong(MAX_STEP_TITLE);
  const title = titleOf(rawTitle);
  if (!title) return t().shortTitle;
  if (typeof state !== "string" || !MARKS.includes(state)) return t().unknownState(String(state));
  const at = steps.findIndex((s) => s.title.toLowerCase() === title.toLowerCase());
  if (at === -1) return steps.length >= MAX_STEPS ? t().tooMany(MAX_STEPS) : [...steps, { title, state: state as StepState }];
  return steps.map((s, i) => (i === at ? { ...s, state: state as StepState } : s));
}
