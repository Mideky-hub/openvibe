import type { GoalsPayload } from "@/nodes/types";

/** Operations on a goals list (issue #36). Each returns a new list and leaves its input untouched. */

const uuid = () => crypto.randomUUID();

/** Adds a goal at the end; a blank one leaves the list as it is. */
export function addGoal(list: GoalsPayload, text: string, newId: () => string = uuid): GoalsPayload {
  const trimmed = text.trim();
  if (!trimmed) return list;
  return { goals: [...list.goals, { id: newId(), text: trimmed, done: false }] };
}

export function toggleGoal(list: GoalsPayload, id: string): GoalsPayload {
  if (!list.goals.some((g) => g.id === id)) return list;
  return { goals: list.goals.map((g) => (g.id === id ? { ...g, done: !g.done } : g)) };
}

/** A blank text keeps the old one. */
export function editGoal(list: GoalsPayload, id: string, text: string): GoalsPayload {
  const trimmed = text.trim();
  if (!trimmed || !list.goals.some((g) => g.id === id)) return list;
  return { goals: list.goals.map((g) => (g.id === id ? { ...g, text: trimmed } : g)) };
}

export function removeGoal(list: GoalsPayload, id: string): GoalsPayload {
  if (!list.goals.some((g) => g.id === id)) return list;
  return { goals: list.goals.filter((g) => g.id !== id) };
}

/** Moves a goal to `index` among the others, clamped to the list. */
export function moveGoal(list: GoalsPayload, id: string, index: number): GoalsPayload {
  const from = list.goals.findIndex((g) => g.id === id);
  if (from < 0) return list;
  const rest = list.goals.filter((g) => g.id !== id);
  const to = Math.max(0, Math.min(index, rest.length));
  if (to === from) return list;
  return { goals: [...rest.slice(0, to), list.goals[from], ...rest.slice(to)] };
}

export function doneCount(list: GoalsPayload): number {
  return list.goals.filter((g) => g.done).length;
}
