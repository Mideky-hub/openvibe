import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { useMessages } from "@/i18n";
import { TITLE_BAR_HEIGHT } from "@/shell/layout";
import { runCommand } from "./command";
import { functionSections, recentSection } from "./functions";
import { goToSections } from "./goTo";
import { GoToRow } from "./GoToRow";
import { goTo } from "./goToRun";
import { commandsMessages } from "./messages";
import { closePalette, modeOf, setPaletteQuery, stripPrefix, usePalette } from "./paletteState";
import { agentsStore, useAgents } from "@/fleet/agentsStore";
import { rememberFunction, useRecentFunctions } from "./recent";
import { COMMANDS } from "./registry";
import { useGoToData } from "./useGoToData";

// Section titles like `.ov-label` (a component class takes no variant in Tailwind 4).
const HEADING =
  "[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.06em] [&_[cmdk-group-heading]]:text-ov-text-2";
const ITEM =
  "flex h-8 cursor-default items-center gap-2 rounded-[8px] px-2.5 text-[12.5px] text-ov-text-2 data-[selected=true]:bg-ov-accent-soft";

/** The palette (spec fenêtre §7.1), under the title bar, centered; rendered only while open. */
export function Palette() {
  const open = usePalette((s) => s.open);
  const openings = usePalette((s) => s.openings);
  return open ? <PaletteBody key={openings} /> : null;
}

function PaletteBody() {
  const t = useMessages(commandsMessages).palette;
  const query = usePalette((s) => s.query);
  const context = usePalette((s) => s.context);
  const mode = modeOf(query);
  const search = stripPrefix(query);
  const goToData = useGoToData();
  // « Lancer … » greys the agents not found: look again when the functions open, and follow the answer.
  useAgents((s) => s.agents);
  useEffect(() => {
    if (mode === "functions") void agentsStore.getState().load().catch(() => undefined);
  }, [mode]);
  const recent = useRecentFunctions();
  const goToList = mode === "goTo" ? goToSections(goToData.items, search) : [];
  const functionList = mode === "functions" && context ? functionSections(COMMANDS, context, search, recent) : [];
  const keys =
    mode === "goTo"
      ? goToList.flatMap((s) => s.items.map((i) => i.key))
      : functionList.flatMap((s) => s.items.filter((l) => l.disabled === null).map((l) => l.command.id));
  const [chosen, setChosen] = useState("");
  // The first line is chosen when it opens and after each keystroke (spec fenêtre §7.1).
  useEffect(() => setChosen(""), [query]);
  const value = keys.includes(chosen) ? chosen : (keys[0] ?? "");

  return (
    <div data-palette-backdrop className="fixed inset-0 z-50" onPointerDown={(e) => e.target === e.currentTarget && closePalette()}>
      <div
        className="ov-glass-strong absolute left-1/2 -translate-x-1/2 overflow-hidden rounded-[14px]"
        style={{ top: TITLE_BAR_HEIGHT + 6, width: "min(560px, calc(100vw - 32px))", boxShadow: "var(--ov-glass-hi), var(--ov-glass-edge), var(--ov-shadow)" }}
      >
        <Command
          label={t.label}
          shouldFilter={false}
          loop
          value={value}
          onValueChange={setChosen}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              // Placement and link modes end on Escape at the window: not this one.
              e.stopPropagation();
              closePalette();
            }
            // The keyboard never leaves an open palette.
            if (e.key === "Tab") e.preventDefault();
          }}
        >
          <Command.Input
            autoFocus
            value={query}
            onValueChange={setPaletteQuery}
            placeholder={mode === "goTo" ? t.placeholderGoTo : t.placeholderFunctions}
            className="h-11 w-full border-b border-ov-line bg-transparent px-3.5 text-[13.5px] text-ov-text outline-none placeholder:text-ov-text-3"
          />
          <Command.List className={`max-h-[420px] overflow-y-auto p-1.5 ${HEADING}`}>
            {mode === "goTo" &&
              goToList.map((section) => (
                <Command.Group key={section.kind} heading={section.label}>
                  {section.items.map((item) => (
                    <Command.Item
                      key={item.key}
                      value={item.key}
                      className={ITEM}
                      onSelect={() => {
                        closePalette();
                        goTo(item);
                      }}
                    >
                      <GoToRow item={item} />
                    </Command.Item>
                  ))}
                </Command.Group>
              ))}
            {mode === "functions" &&
              context &&
              functionList.map((section) => (
                <Command.Group key={section.label} heading={section.label}>
                  {section.items.map((line) => (
                    <Command.Item
                      key={line.command.id}
                      value={line.command.id}
                      disabled={line.disabled !== null}
                      className={`${ITEM} data-[disabled=true]:opacity-50`}
                      onSelect={() => {
                        rememberFunction(line.command.id);
                        closePalette();
                        runCommand(line.command, context);
                      }}
                    >
                      <span className="truncate text-ov-text">{line.label}</span>
                      {/* A recent line tells where it comes from: « Renommer » of which terminal. */}
                      {section.label === recentSection() && <span className="shrink-0 text-[11.5px] text-ov-text-3">{line.section}</span>}
                      {line.disabled !== null ? (
                        <span className="ml-auto shrink-0 text-[11px] text-ov-text-3">{line.disabled}</span>
                      ) : (
                        line.hint && <span className="ml-auto shrink-0 font-mono text-[11px] text-ov-text-3">{line.hint}</span>
                      )}
                    </Command.Item>
                  ))}
                </Command.Group>
              ))}
            {mode === "goTo" && goToData.loading && <div className="px-2.5 py-1.5 text-[11.5px] text-ov-text-3">{t.loading}</div>}
            {!(mode === "goTo" && goToData.loading) && (
              <Command.Empty className="px-2.5 py-3 text-[12.5px] text-ov-text-3">{t.empty}</Command.Empty>
            )}
          </Command.List>
          <footer className="border-t border-ov-line px-3.5 py-1.5 text-[11px] text-ov-text-2">{t.footer}</footer>
        </Command>
      </div>
    </div>
  );
}
