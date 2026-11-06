import { toast } from "sonner";
import { appMessages } from "@/app/messages";
import { messages } from "@/i18n";
import { getSetting, setSetting } from "@/ipc/db";
import { COMMANDS } from "./registry";
import { checkCombo, readBindings, shortcutBindingsStore, type ComboCheck, type Shortcut, type ShortcutBindings } from "./shortcuts";

const KEY = "ui.shortcuts";

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** The canvas's own keys (Ctrl+D, Ctrl+Maj+L…), which the palette shows: no shortcut takes them. */
export const canvasKeys = (): string[] => COMMANDS.flatMap((command) => (command.keys ? [command.keys] : []));

async function save(bindings: ShortcutBindings) {
  shortcutBindingsStore.setState({ bindings });
  await setSetting(KEY, bindings).catch((error: unknown) => toast.error(messages(appMessages).settingNotSaved(message(error))));
}

/** At boot. Unreadable bindings leave every shortcut at its own keys. */
export async function loadShortcuts() {
  try {
    shortcutBindingsStore.setState({ bindings: readBindings(await getSetting<unknown>(KEY), canvasKeys()) });
  } catch (error) {
    console.warn(`shortcut settings: ${message(error)}`);
  }
}

/** Gives `shortcut`'s function the keys `combo`, unless another has them or they are not to be taken: then nothing changes. */
export async function bindShortcut(shortcut: Shortcut, combo: string): Promise<ComboCheck> {
  const check = checkCombo(shortcut, combo, canvasKeys());
  if (!check.ok) return check;
  const others = Object.fromEntries(Object.entries(shortcutBindingsStore.getState().bindings).filter(([s]) => s !== shortcut)) as ShortcutBindings;
  await save(combo === shortcut ? others : { ...others, [shortcut]: combo });
  return check;
}

export async function resetShortcuts() {
  await save({});
}
