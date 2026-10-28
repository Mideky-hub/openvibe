import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { FileText } from "lucide-react";
import { useMessages } from "@/i18n";
import { TITLE_BAR_HEIGHT } from "@/shell/layout";
import { useProjects } from "@/store/projects";
import { useFileIndex } from "@/studio/fileIndex";
import { parseFileQuery, rankFiles } from "@/studio/fileSearch";
import { openInCodeStudio } from "@/studio/navigate";
import { studioStore } from "@/studio/studioStore";
import { runCommand } from "./command";
import { functionSections, recentSection } from "./functions";
import { goToSections } from "./goTo";
import { GoToRow } from "./GoToRow";
import { goTo } from "./goToRun";
import { commandsMessages } from "./messages";
import { closePalette, modeOf, setPaletteQuery, stripPrefix, usePalette } from "./paletteState";
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
  const recent = useRecentFunctions();
  const goToList = mode === "goTo" ? goToSections(goToData.items, search) : [];
  const projectPath = useProjects((s) => (s.view === "project" ? (s.projects.find((p) => p.id === s.activeId)?.path ?? null) : null));
  const fileIndex = useFileIndex(mode === "goTo" ? projectPath : null);
  const fileQuery = parseFileQuery(search);
  // Files only while searching: the project's whole tree would bury the nodes.
  const files = mode === "goTo" && fileQuery.text ? rankFiles(fileIndex.files, fileQuery.text, FILE_LIMIT) : [];
  // `App.tsx:42`, a dot or a slash: a file is sought, its section comes first.
  const filesFirst = fileQuery.line !== undefined || /[./]/.test(fileQuery.text);
  const functionList = mode === "functions" && context ? functionSections(COMMANDS, context, search, recent) : [];
  const keys =
    mode === "goTo"
      ? (filesFirst ? [...files.map(fileKey), ...goToList.flatMap((s) => s.items.map((i) => i.key))] : [...goToList.flatMap((s) => s.items.map((i) => i.key)), ...files.map(fileKey)])
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
            {filesFirst && <FileSection files={files} line={fileQuery.line} column={fileQuery.column} />}
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
            {!filesFirst && <FileSection files={files} line={fileQuery.line} column={fileQuery.column} />}
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
            {mode === "goTo" && (goToData.loading || (fileIndex.loading && fileQuery.text !== "")) && <div className="px-2.5 py-1.5 text-[11.5px] text-ov-text-3">{t.loading}</div>}
            <Command.Empty className="px-2.5 py-3 text-[12.5px] text-ov-text-3">{t.empty}</Command.Empty>
          </Command.List>
          <footer className="border-t border-ov-line px-3.5 py-1.5 text-[11px] text-ov-text-2">{t.footer}</footer>
        </Command>
      </div>
    </div>
  );
}

const FILE_LIMIT = 30;
const fileKey = (path: string) => `file:${path}`;

/** The project's files matching the search (Ctrl+P `fichier:ligne`): one opens in the Code Studio, at its line. */
function FileSection({ files, line, column }: { files: readonly string[]; line?: number; column?: number }) {
  const t = useMessages(commandsMessages).goTo;
  if (files.length === 0) return null;
  return (
    <Command.Group heading={t.sections.file}>
      {files.map((path) => {
        const cut = path.lastIndexOf("/");
        return (
          <Command.Item
            key={path}
            value={fileKey(path)}
            className={ITEM}
            onSelect={() => {
              closePalette();
              // The navigation takes a line only: a column is asked for once the file is shown.
              const withColumn = line !== undefined && column !== undefined;
              void openInCodeStudio(path, withColumn ? undefined : line).then(() => {
                if (withColumn) studioStore.setState({ pendingLine: { path, line, column } });
              });
            }}
          >
            <FileText className="size-3.5 shrink-0 text-ov-text-3" />
            <span className="truncate font-medium text-ov-text">{path.slice(cut + 1)}</span>
            {cut > 0 && <span className="truncate text-ov-text-3">{path.slice(0, cut)}</span>}
            {line !== undefined && <span className="ml-auto shrink-0 font-mono text-[11px] text-ov-text-3">{t.atLine(line)}</span>}
          </Command.Item>
        );
      })}
    </Command.Group>
  );
}
