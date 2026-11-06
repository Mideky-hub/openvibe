import { useState, type KeyboardEvent } from "react";
import { RotateCcw } from "lucide-react";
import { useStore } from "zustand";
import { labelOf, type CommandContext } from "@/commands/command";
import { COMMANDS } from "@/commands/registry";
import { bindShortcut, resetShortcuts } from "@/commands/shortcutSettings";
import { comboFor, comboOf, SHORTCUTS, useShortcutBindings, type ComboCheck, type Shortcut } from "@/commands/shortcuts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useMessages } from "@/i18n";
import { keyLabel } from "@/i18n/format";
import { cn } from "@/lib/utils";
import { shellMessages } from "./messages";
import { shortcutsDialogStore } from "./shortcutsDialogState";

/** The functions' names do not depend on the moment for the shortcuts. */
const NOWHERE: CommandContext = { project: false, workspaceId: null, terminalCount: 0, terminalId: null };

function nameOf(shortcut: Shortcut): string {
  const command = COMMANDS.find((c) => c.shortcut === shortcut);
  return command ? labelOf(command, NOWHERE) : shortcut;
}

const MODIFIERS = new Set(["Control", "Shift", "Alt", "AltGraph", "Meta"]);

/**
 * The application's shortcuts and their keys: a click on the keys of one
 * waits for new ones. Keys another function has are refused, and the dialog
 * says which; nothing changes then.
 */
export function ShortcutsDialog() {
  const t = useMessages(shellMessages).shortcuts;
  const open = useStore(shortcutsDialogStore, (s) => s.open);
  const bindings = useShortcutBindings();
  const [capturing, setCapturing] = useState<Shortcut | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stop = () => {
    setCapturing(null);
    setError(null);
  };

  const refusal = (check: Exclude<ComboCheck, { ok: true }>, combo: string) => {
    const keys = keyLabel(combo);
    if (check.reason === "conflict") return t.conflict(keys, nameOf(check.with));
    return check.reason === "reserved" ? t.reserved(keys) : t.needsModifier;
  };

  const onKeyDown = async (shortcut: Shortcut, event: KeyboardEvent<HTMLButtonElement>) => {
    if (capturing !== shortcut) return;
    event.preventDefault();
    event.stopPropagation();
    if (MODIFIERS.has(event.key)) return;
    if (event.key === "Escape" && !event.ctrlKey && !event.shiftKey) return stop();
    const combo = comboOf(event.nativeEvent);
    if (!combo) return setError(t.unknownKey);
    const check = await bindShortcut(shortcut, combo);
    if (check.ok) stop();
    else setError(refusal(check, combo));
  };

  const close = () => {
    stop();
    shortcutsDialogStore.setState({ open: false });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="sm:max-w-md" onEscapeKeyDown={(event) => capturing && event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>{t.description}</DialogDescription>
        </DialogHeader>
        <ul className="grid gap-1 text-[13px]">
          {SHORTCUTS.map((shortcut) => {
            const name = nameOf(shortcut);
            const keys = keyLabel(comboFor(shortcut, bindings));
            const waiting = capturing === shortcut;
            return (
              <li key={shortcut} data-shortcut={shortcut} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-ov-text">{name}</span>
                {bindings[shortcut] !== undefined && (
                  <Button variant="ghost" size="icon-xs" title={t.reset} aria-label={t.reset} onClick={() => void bindShortcut(shortcut, shortcut)}>
                    <RotateCcw />
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  data-keys
                  aria-label={t.change(name, keys)}
                  aria-pressed={waiting}
                  className={cn("min-w-28 justify-center font-mono text-[11px]", waiting && "border-ov-accent text-ov-text-2")}
                  onClick={() => {
                    setCapturing(shortcut);
                    setError(null);
                  }}
                  onKeyDown={(event) => void onKeyDown(shortcut, event)}
                  onBlur={() => waiting && stop()}
                >
                  {waiting ? t.press : keys}
                </Button>
              </li>
            );
          })}
        </ul>
        {error && (
          <p role="alert" className="text-sm text-ov-danger">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => void resetShortcuts().then(stop)}>
            {t.resetAll}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
