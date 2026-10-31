import { commandFor, runCommand, type Command, type CommandContext } from "./command";
import { closePalette, paletteStore } from "./paletteState";
import { COMMANDS, commandContext } from "./registry";
import { heldShortcutOf, isModalOpen, shortcutOf } from "./shortcuts";

/**
 * The application's single keydown listener (spec fenêtre §6.2): on the
 * window, in the capture phase, ahead of xterm, the fields, Excalidraw and
 * WebView2. A recognized shortcut whose command is available is consumed: it
 * reaches neither the terminal, nor its agent, nor Excalidraw.
 */
export function installShortcuts(
  target: Window,
  commands: readonly Command[] = COMMANDS,
  context: () => CommandContext = commandContext,
): () => void {
  const listener = (event: KeyboardEvent) => {
    const shortcut = shortcutOf(event);
    if (isModalOpen(target.document)) return;
    if (!shortcut) {
      // A held Ctrl+P must not reach the palette's list (cmdk reads the repeats).
      const held = heldShortcutOf(event);
      if (held && commandFor(commands, held, context())) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      return;
    }
    const ctx = context();
    const command = commandFor(commands, shortcut, ctx);
    if (!command) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    // A command that moves the keyboard closes the palette first: an open
    // palette never shows while the keys go to a terminal (Échap included).
    if (paletteStore.getState().open && !command.id.startsWith("palette.")) closePalette();
    runCommand(command, ctx);
  };
  target.addEventListener("keydown", listener, { capture: true });
  return () => target.removeEventListener("keydown", listener, { capture: true });
}
