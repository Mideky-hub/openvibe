import type { SceneFrame } from "@/canvas/groups";
import { messages } from "@/i18n";
import { agentsText } from "./groupSummary";
import { fleetMessages } from "./messages";

/** Who a command goes to (spec habillage §12). */
export type Target = { kind: "all" } | { kind: "group"; id: string } | { kind: "agent"; id: string };

/** Both languages' words for everyone: `@tous` and `@all` work whatever the interface's language. */
const ALL_NAMES: readonly string[] = ["tous", "all"];

/** The options a typed name designates: the one of that name, and the "all" option for either of its words. */
function optionsNamed(options: readonly TargetOption[], word: string): TargetOption[] {
  const name = slug(word);
  return options.filter((o) => o.label === `@${name}` || (o.target.kind === "all" && ALL_NAMES.includes(name)));
}

/** One line of the `@` list. */
export interface TargetOption {
  target: Target;
  /** "@tous", "@backend", "@isis". */
  label: string;
  /** In grey: the size of a group, or the group of an agent ("Hors groupe"). */
  detail: string;
}

/** An agent as the `@` list sees it. */
export interface TargetAgent {
  id: string;
  name: string;
  groupName: string | null;
}

/** "Équipe Back" → "equipeback": no spaces nor accents, lower case. */
export function slug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

export function targetKey(target: Target): string {
  return target.kind === "all" ? "all" : `${target.kind}:${target.id}`;
}

export function uniqueTargets(targets: readonly Target[]): Target[] {
  const seen = new Set<string>();
  return targets.filter((target) => {
    const key = targetKey(target);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The terminals among `ids` (those `nameOf` names), with their group. */
export function targetAgents(
  ids: readonly string[],
  nameOf: (id: string) => string | undefined,
  frames: readonly SceneFrame[],
): TargetAgent[] {
  return ids.flatMap((id) => {
    const name = nameOf(id);
    if (name === undefined) return [];
    const group = frames.find((f) => f.group !== null && f.memberIds.includes(id));
    return [{ id, name, groupName: group?.name ?? null }];
  });
}

/** @tous, then the groups, then the agents; two agents of the same name both show, with their group (spec §12). */
export function targetOptions(agents: readonly TargetAgent[], groups: readonly SceneFrame[]): TargetOption[] {
  const all: TargetOption = { target: { kind: "all" }, label: messages(fleetMessages).targets.all, detail: agentsText(agents.length) };
  const groupOptions = groups
    .filter((g) => g.group !== null && slug(g.name))
    .map((g): TargetOption => ({ target: { kind: "group", id: g.id }, label: `@${slug(g.name)}`, detail: agentsText(g.memberIds.length) }));
  const agentOptions = agents
    .filter((a) => slug(a.name))
    .map((a): TargetOption => ({ target: { kind: "agent", id: a.id }, label: `@${slug(a.name)}`, detail: a.groupName ?? messages(fleetMessages).outsideGroup }));
  return [all, ...groupOptions, ...agentOptions];
}

/** The options whose name starts with the query, then those containing it; case and accents ignored. */
export function matchOptions(options: readonly TargetOption[], query: string): TargetOption[] {
  const wanted = slug(query);
  // The "all" option answers to either language's word.
  const names = (option: TargetOption) => (option.target.kind === "all" ? ALL_NAMES : [option.label.slice(1)]);
  const starts = options.filter((o) => names(o).some((n) => n.startsWith(wanted)));
  const contains = options.filter((o) => !names(o).some((n) => n.startsWith(wanted)) && names(o).some((n) => n.includes(wanted)));
  return [...starts, ...contains];
}

/** The `@word` being typed at the caret: where its `@` is and what follows it. */
export function mentionAt(text: string, caret: number): { start: number; query: string } | null {
  const match = /(^|\s)@([^\s@]*)$/.exec(text.slice(0, caret));
  return match ? { start: caret - match[2].length - 1, query: match[2] } : null;
}

/** The names of a slashed mention ("thot/ze"): those already typed, and the one being completed. */
export function mentionParts(query: string, options: readonly TargetOption[] = []): { typed: string[]; query: string } {
  // A name that contains a slash ("Front/Back") is tried whole before being split.
  if (query.includes("/") && matchOptions(options, query).length > 0) return { typed: [], query };
  const names = query.split("/");
  const last = names.pop() ?? "";
  return { typed: names.filter(Boolean), query: last };
}

/** The typed names that match exactly one option, as targets. */
export function partTargets(names: readonly string[], options: readonly TargetOption[]): Target[] {
  return names.flatMap((name) => {
    const found = optionsNamed(options, name);
    return found.length === 1 ? [found[0].target] : [];
  });
}

/**
 * Escape closes the `@` list of the mention starting at `dismissedAt`; it
 * stays closed while that mention is typed, and opens again for any other.
 */
export function keptDismissal(dismissedAt: number | null, text: string, caret: number): number | null {
  return dismissedAt !== null && mentionAt(text, caret)?.start === dismissedAt ? dismissedAt : null;
}

/** The text of a slashed mention whose names are not all known: kept as typed, the last one completed. */
export function completedMention(typed: readonly string[], option: TargetOption): string {
  return `@${[...typed, option.label.slice(1)].join("/")}`;
}

/** `text` without the mention from `start` to `end`, and one space after it. */
export function withoutMention(text: string, start: number, end: number): { text: string; caret: number } {
  return { text: text.slice(0, start) + text.slice(end).replace(/^ /, ""), caret: start };
}

/**
 * Typed `@names` that match exactly one option become targets and leave the
 * text ("@tous lance les tests", "@tous, lancez…") with the punctuation and
 * the space that follow them; ambiguous or unknown ones stay as typed.
 * `@athena/zeus/héra` targets the three of them, when each is known. The
 * rest of the command keeps its spaces (indented code, tabs).
 */
export function extractMentions(text: string, options: readonly TargetOption[]): { targets: Target[]; text: string } {
  const targets: Target[] = [];
  const mention = /(^|\s)@([^\s@,;:.!?…]+)[,;:.!?…]*(?=\s|$) ?/g;
  const rest = text.replace(mention, (whole: string, before: string, word: string) => {
    const found = optionsNamed(options, word);
    if (found.length === 1) {
      targets.push(found[0].target);
      return before;
    }
    const names = word.split("/");
    const parts = names.length > 1 ? partTargets(names, options) : [];
    if (parts.length < 2 || parts.length !== names.length) return whole;
    targets.push(...parts);
    return before;
  });
  return { targets, text: rest.trim() };
}

/**
 * The terminals a command goes to, once each, in the order of the targets;
 * without targets, `fallback` (the selection, or an orchestrator's agents).
 * Only terminals of `scope.all` count.
 */
export function resolveTargets(
  targets: readonly Target[],
  scope: { all: readonly string[]; groups: readonly SceneFrame[] },
  fallback: readonly string[],
): string[] {
  const ids: string[] = [];
  if (targets.length === 0) ids.push(...fallback);
  for (const target of targets) {
    if (target.kind === "all") ids.push(...scope.all);
    else if (target.kind === "group") ids.push(...(scope.groups.find((g) => g.id === target.id)?.memberIds ?? []));
    else ids.push(target.id);
  }
  return [...new Set(ids)].filter((id) => scope.all.includes(id));
}

/** Without `@`: the selected terminals and the members of the selected groups (spec §12). */
export function selectionTargets(
  selectedIds: readonly string[],
  frames: readonly SceneFrame[],
  terminalIds: readonly string[],
): string[] {
  const ids: string[] = [];
  for (const id of selectedIds) {
    if (terminalIds.includes(id)) ids.push(id);
    const frame = frames.find((f) => f.id === id && f.group !== null);
    if (frame) ids.push(...frame.memberIds);
  }
  return [...new Set(ids)];
}
