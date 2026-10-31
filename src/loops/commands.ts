import type { Command } from "@/commands/command";
import { requestUi } from "@/commands/uiRequests";
import { messages } from "@/i18n";
import { loopsStore } from "./live";
import { loopsMessages } from "./messages";

const text = () => messages(loopsMessages);
const section = () => text().section;

/** A command whose text is read when the palette lists or searches it: it follows the language. */
function worded(base: Omit<Command, "label" | "keywords">, label: () => string, keywords: () => readonly string[]): Command {
  return Object.defineProperties({ ...base } as Command, {
    label: { get: label, enumerable: true },
    keywords: { get: keywords, enumerable: true },
  });
}

/**
 * The palette's lines for the loops (spec boucles §4): the window, and the
 * emergency brake, which is listed wherever a loop runs, home included.
 */
export function loopCommands(): Command[] {
  return [
    worded(
      { id: "loops.manage", section, available: (ctx) => ctx.project, run: () => requestUi({ kind: "loops" }) },
      () => text().manage,
      () => text().manageKeywords,
    ),
    worded(
      { id: "loops.stopAll", section, available: () => loopsStore.getState().runningCount() > 0, run: () => loopsStore.getState().stopAll() },
      () => text().stopAll(loopsStore.getState().runningCount()),
      () => text().stopAllKeywords,
    ),
  ];
}
