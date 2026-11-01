import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Code2, Eye, File, Folder, FolderTree, PanelTopOpen, RotateCw, Save, X } from "lucide-react";
import { useStore } from "zustand";
import { useTheme } from "@/app/theme";
import { useMessages } from "@/i18n";
import { studioTree, type TreeEntry } from "@/ipc/studio";
import { cn } from "@/lib/utils";
import { AccentButton, IconButton, ToolButton } from "@/shell/buttons";
import { TOP_ROW_HEIGHT } from "@/shell/layout";
import { useProjects } from "@/store/projects";
import { CodeEditor } from "./CodeEditor";
import { insertFileNode } from "./insert";
import { isDirty as sessionIsDirty } from "./fileSession";
import { isMarkdown, renderMarkdown } from "./markdown";
import { studioMessages } from "./messages";
import { DiskBanner, errorText } from "./parts";
import { useDiskWatch, useSaveKey } from "./sessionEffects";
import { closeStudio, closeTab, editFile, isDirty, openFile, openStudio, saveFile, useStudio, type StudioTab } from "./studioStore";
import { ancestors, baseName, buildTree, toggle, visibleRows } from "./tree";

/** The tree shows this many lines at most; the filter finds the others. */
const MAX_ROWS = 2000;

/**
 * The code workspace (issue #49): a workspace tab whose page is an IDE instead
 * of a canvas. The files of the active project, browsed and edited; its open
 * files stay when another tab is shown.
 */
export function CodeWorkspace() {
  const project = useProjects((s) => s.projects.find((p) => p.id === s.activeId)?.id ?? null);
  useEffect(() => {
    if (!project) return;
    openStudio(project);
    return closeStudio;
  }, [project]);
  const open = useStudio((s) => s.project);
  return open && open === project ? <StudioContent project={open} /> : null;
}

function StudioContent({ project }: { project: string }) {
  const t = useMessages(studioMessages);
  const name = useProjects((s) => s.projects.find((p) => p.id === project)?.name) ?? "";
  const tabs = useStudio((s) => s.tabs);
  const active = useStudio((s) => s.active);
  const tab = tabs.find((x) => x.path === active) ?? null;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [treeOpen, setTreeOpen] = useState(true);

  const open = (path: string) => {
    setExpanded((current) => new Set([...current, ...ancestors(path)]));
    void openFile(path);
  };

  // A dialog over the workspace has its own Ctrl+S (the notes), or none.
  useSaveKey(() => {
    if (active && !document.querySelector('[role="dialog"]')) void saveFile(active);
  });
  useDiskWatch(tab?.session ?? null);

  // The rail on the right (activities) keeps its column.
  return (
    <div
      data-code-workspace
      aria-label={t.title(name)}
      className="absolute inset-0 flex gap-2.5 pb-3 pl-3 pr-[66px] text-ov-text"
      style={{ paddingTop: TOP_ROW_HEIGHT + 12 }}
    >
      <nav className="ov-glass z-30 flex shrink-0 flex-col items-center gap-0.5 self-center rounded-[14px] p-[5px]">
        <ToolButton label={treeOpen ? t.hideFiles : t.showFiles} active={treeOpen} onClick={() => setTreeOpen(!treeOpen)}>
          <FolderTree />
        </ToolButton>
      </nav>
      {treeOpen && <FileTree project={project} active={active} expanded={expanded} setExpanded={setExpanded} onOpen={open} />}
      <section className="ov-glass-strong flex min-w-0 flex-1 flex-col overflow-hidden rounded-[14px]">
        <Tabs tabs={tabs} active={active} />
        {tab ? <FilePane key={tab.path} tab={tab} /> : <Message>{t.pickFile}</Message>}
      </section>
    </div>
  );
}

interface FileTreeProps {
  project: string;
  active: string | null;
  expanded: Set<string>;
  setExpanded: (next: Set<string>) => void;
  onOpen: (path: string) => void;
}

function FileTree({ project, active, expanded, setExpanded, onOpen }: FileTreeProps) {
  const t = useMessages(studioMessages);
  const [entries, setEntries] = useState<TreeEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let alive = true;
    setEntries(null);
    setError(null);
    studioTree(project).then(
      (found) => alive && setEntries(found),
      (failure: unknown) => alive && setError(errorText(failure)),
    );
    return () => {
      alive = false;
    };
  }, [project, refresh]);

  const tree = useMemo(() => buildTree(entries ?? []), [entries]);
  const rows = useMemo(() => visibleRows(tree, expanded, query), [tree, expanded, query]);

  return (
    <aside data-files className="ov-glass flex w-[280px] shrink-0 flex-col overflow-hidden rounded-[14px]">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-ov-line px-2">
        <input
          aria-label={t.filterLabel}
          placeholder={t.filterPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-7 min-w-0 flex-1 rounded-[7px] bg-ov-field px-2 text-[12px] text-ov-text outline-none placeholder:text-ov-text-3 focus:ring-1 focus:ring-ov-accent"
        />
        <IconButton label={t.refresh} onClick={() => setRefresh((n) => n + 1)}>
          <RotateCw />
        </IconButton>
      </div>
      <div role="tree" aria-label={t.filterLabel} className="min-h-0 flex-1 overflow-auto py-1">
        {error !== null ? (
          <Message>{t.treeFailed(error)}</Message>
        ) : entries === null ? (
          <Message>{t.readingTree}</Message>
        ) : rows.length === 0 ? (
          <Message>{query.trim() ? t.noMatch : t.empty}</Message>
        ) : (
          rows.slice(0, MAX_ROWS).map(({ node, depth, expanded: isOpen }) => (
            <button
              key={node.path}
              type="button"
              role="treeitem"
              aria-expanded={node.kind === "dir" ? isOpen : undefined}
              aria-selected={node.path === active}
              data-path={node.path}
              title={node.path}
              onClick={() => (node.kind === "dir" ? setExpanded(toggle(expanded, node.path)) : onOpen(node.path))}
              className={cn(
                "flex h-[26px] w-full items-center gap-1 pr-2 text-left text-[12.5px] text-ov-text-2 hover:bg-ov-hover hover:text-ov-text [&_svg]:size-3.5 [&_svg]:shrink-0",
                node.path === active && "bg-ov-accent-soft text-ov-text",
              )}
              style={{ paddingLeft: 8 + depth * 12 }}
            >
              {node.kind === "dir" ? (
                <>
                  {isOpen ? <ChevronDown /> : <ChevronRight />}
                  <Folder className="text-ov-accent" />
                </>
              ) : (
                <>
                  <span className="w-3.5 shrink-0" />
                  <File className="text-ov-text-3" />
                </>
              )}
              <span className="truncate">{node.name}</span>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}

function Tabs({ tabs, active }: { tabs: StudioTab[]; active: string | null }) {
  const t = useMessages(studioMessages);
  const [confirming, setConfirming] = useState<string | null>(null);
  const pending = tabs.find((x) => x.path === confirming);

  const close = (tab: StudioTab) => {
    if (isDirty(tab)) setConfirming(tab.path);
    else closeTab(tab.path);
  };

  return (
    <>
      <div role="tablist" className="flex h-10 shrink-0 items-end gap-0.5 overflow-x-auto border-b border-ov-line px-2">
        {tabs.map((tab) => (
          <TabItem key={tab.path} tab={tab} active={tab.path === active} onClose={() => close(tab)} />
        ))}
      </div>
      {pending && (
        <div role="alert" className="flex shrink-0 flex-wrap items-center gap-2 border-b border-ov-line bg-ov-surface-2 px-3 py-2 text-[12.5px]">
          <span className="mr-auto">{t.discardTitle(baseName(pending.path))}</span>
          <button type="button" className="rounded-[8px] px-2.5 py-1 text-ov-text-2 hover:bg-ov-hover" onClick={() => setConfirming(null)}>
            {t.cancel}
          </button>
          <button
            type="button"
            className="rounded-[8px] px-2.5 py-1 text-ov-danger hover:bg-ov-hover"
            onClick={() => {
              setConfirming(null);
              closeTab(pending.path);
            }}
          >
            {t.discard}
          </button>
          <AccentButton
            className="h-7"
            onClick={async () => {
              setConfirming(null);
              if (await saveFile(pending.path)) closeTab(pending.path);
            }}
          >
            {t.saveAndClose}
          </AccentButton>
        </div>
      )}
    </>
  );
}

function TabItem({ tab, active, onClose }: { tab: StudioTab; active: boolean; onClose: () => void }) {
  const t = useMessages(studioMessages);
  const name = baseName(tab.path);
  const dirty = useStore(tab.session, sessionIsDirty);
  return (
    <div
      role="tab"
      aria-selected={active}
      data-tab={tab.path}
      title={tab.path}
      className={cn(
        "group flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-t-[8px] pl-3 pr-1 text-[12.5px] text-ov-text-2 hover:bg-ov-hover",
        active && "bg-ov-tab-on text-ov-text",
      )}
      onClick={() => void openFile(tab.path)}
      onAuxClick={(e) => e.button === 1 && onClose()}
    >
      <span className="max-w-48 truncate">{name}</span>
      {dirty && <span data-dirty aria-label={t.modified} title={t.modified} className="size-2 rounded-full bg-ov-accent" />}
      <IconButton
        label={t.closeTab(name)}
        className="size-5"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <X />
      </IconButton>
    </div>
  );
}

function FilePane({ tab }: { tab: StudioTab }) {
  const t = useMessages(studioMessages);
  const theme = useTheme();
  const { draft, disk, error, file, loading, refused, revision, saving } = useStore(tab.session);
  const markdown = isMarkdown(tab.path);
  const [preview, setPreview] = useState(false);
  const dirty = useStore(tab.session, sessionIsDirty);
  const previewing = markdown && preview;

  if (loading || !file) return <Message>{t.readingFile}</Message>;
  if (refused) return <Message>{t.readFailed(refused)}</Message>;
  return (
    <>
      {disk && <DiskBanner session={tab.session} disk={disk} onDrop={() => closeTab(tab.path)} />}
      {error && (
        <p role="status" className="shrink-0 border-b border-ov-line px-3 py-1.5 text-[12px] text-ov-danger">
          {t.failed(error)}
        </p>
      )}
      <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-ov-line px-3">
        <span className="min-w-0 truncate font-mono text-[11px] text-ov-text-3">{tab.path}</span>
        {dirty && <span className="shrink-0 text-[11px] text-ov-accent">{t.modified}</span>}
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {markdown && (
            <ToolbarButton label={previewing ? t.edit : t.preview} active={previewing} onClick={() => setPreview(!preview)}>
              {previewing ? <Code2 /> : <Eye />}
            </ToolbarButton>
          )}
          <ToolbarButton label={t.insert} title={t.insertTitle} onClick={() => void insertFileNode(tab.path)}>
            <PanelTopOpen />
          </ToolbarButton>
          <AccentButton className="h-7" disabled={!dirty || saving} title={t.save} onClick={() => void saveFile(tab.path)}>
            <Save />
            {saving ? t.saving : t.save.replace(/ \(.*\)$/, "")}
          </AccentButton>
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {previewing ? (
          <div data-preview className="h-full overflow-auto px-6 py-4 text-[13.5px] leading-relaxed">
            {renderMarkdown(draft)}
          </div>
        ) : (
          <CodeEditor
            path={tab.path}
            text={draft}
            revision={revision}
            theme={theme}
            onChange={(content) => editFile(tab.path, content)}
            onSave={() => void saveFile(tab.path)}
          />
        )}
      </div>
    </>
  );
}

function ToolbarButton({
  label,
  title,
  active = false,
  onClick,
  children,
}: {
  label: string;
  title?: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title ?? label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-7 items-center gap-1.5 rounded-[8px] px-2.5 text-[12.5px] text-ov-text-2 hover:bg-ov-hover hover:text-ov-text [&_svg]:size-3.5",
        active && "bg-ov-accent-soft text-ov-accent",
      )}
    >
      {children}
      {label}
    </button>
  );
}

function Message({ children }: { children: ReactNode }) {
  return <p className="px-4 py-6 text-center text-[12.5px] text-ov-text-3">{children}</p>;
}
