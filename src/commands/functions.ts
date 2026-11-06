import { messages } from "@/i18n";
import { keyLabel } from "@/i18n/format";
import { labelOf, sectionOf, type Command, type CommandContext } from "./command";
import { commandsMessages } from "./messages";
import { rank, rankSections, startsWords } from "./search";
import { comboFor } from "./shortcuts";

/** A line of the functions mode, as listed at this moment. */
export interface FunctionLine {
  command: Command;
  label: string;
  section: string;
  /** Its shortcut, or the key Excalidraw gives it. */
  hint: string | null;
  /** Why it cannot run, when it is listed greyed. */
  disabled: string | null;
}

/** The heading of the recent functions, in the interface's language. */
export const recentSection = () => messages(commandsMessages).palette.recent;

/**
 * The functions mode (spec fenêtre §7.3): the commands available at that
 * moment, by section in the registry's order, each ranked by the search, the
 * section of the best match first while searching. The palette's own command
 * is not listed in it. The `recent` functions head the list in « Récentes »,
 * most recent first, and stay there while searching when the words typed start
 * their words (retours J8b); they are not repeated below.
 */
export function functionSections(
  commands: readonly Command[],
  ctx: CommandContext,
  query: string,
  recent: readonly string[] = [],
): { label: string; items: FunctionLine[] }[] {
  const lines = commands
    .filter((c) => c.id !== "palette.functions" && c.available(ctx))
    .map(
      (command): FunctionLine => ({
        command,
        label: labelOf(command, ctx),
        section: sectionOf(command, ctx),
        hint: command.shortcut ? keyLabel(comboFor(command.shortcut)) : command.keys ? keyLabel(command.keys) : null,
        disabled: command.disabled?.(ctx) ?? null,
      }),
    );
  const textOf = (l: FunctionLine) => ({ label: l.label, keywords: l.command.keywords });
  const searching = query.trim() !== "";
  const recentLines = recent
    .map((id) => lines.find((l) => l.command.id === id))
    .filter((l): l is FunctionLine => l !== undefined && (!searching || startsWords(query, textOf(l))));
  const others = lines.filter((l) => !recentLines.includes(l));
  const labels: string[] = [];
  for (const line of others) if (!labels.includes(line.section)) labels.push(line.section);
  const sections = labels
    .map((label) => ({ label, items: rank(others.filter((l) => l.section === label), query, textOf) }))
    .filter((section) => section.items.length > 0);
  const ranked = rankSections(sections, query, textOf);
  return recentLines.length > 0 ? [{ label: recentSection(), items: recentLines }, ...ranked] : ranked;
}
