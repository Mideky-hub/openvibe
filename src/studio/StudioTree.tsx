import { useEffect, useMemo, useState } from "react";
import { ChevronRight, File, Folder } from "lucide-react";
import { useMessages } from "@/i18n";
import { cn } from "@/lib/utils";
import { studioMessages } from "./messages";
import { ancestors, buildTree, filterPaths, type TreeNode } from "./tree";

/** A filter lists this many paths at most; a longer list says to refine it. */
const MAX_FOUND = 400;
const INDENT = 12;

interface Props {
  files: readonly string[];
  selected: string | null;
  onOpen: (file: string) => void;
}

/** The project's files; filtered, a flat list of paths. */
export function StudioTree({ files, selected, onOpen }: Props) {
  const t = useMessages(studioMessages);
  const [filter, setFilter] = useState("");
  const [unfolded, setUnfolded] = useState<ReadonlySet<string>>(new Set());
  const tree = useMemo(() => buildTree(files), [files]);
  const filtering = filter.trim() !== "";
  const found = useMemo(() => (filtering ? filterPaths(files, filter, MAX_FOUND + 1) : []), [files, filter, filtering]);

  useEffect(() => {
    if (selected) setUnfolded((set) => new Set([...set, ...ancestors(selected)]));
  }, [selected]);

  const toggle = (path: string) =>
    setUnfolded((set) => {
      const next = new Set(set);
      if (!next.delete(path)) next.add(path);
      return next;
    });

  return (
    <div className="flex w-[260px] shrink-0 flex-col border-r border-ov-line">
      <input
        aria-label={t.filterLabel}
        placeholder={t.filterPlaceholder(files.length)}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="m-2 h-7 shrink-0 rounded-[6px] bg-ov-field px-2 text-[12px] text-ov-text outline-none placeholder:text-ov-text-3"
      />
      <div className="min-h-0 flex-1 overflow-y-auto pb-1">
        {filtering ? (
          <>
            {found.slice(0, MAX_FOUND).map((file) => (
              <button
                key={file}
                type="button"
                title={file}
                aria-current={file === selected}
                onClick={() => onOpen(file)}
                className={cn("block w-full truncate px-3 py-0.5 text-left text-[12px] text-ov-text-2 hover:bg-ov-hover", file === selected && "bg-ov-hover text-ov-text")}
                style={{ direction: "rtl", textAlign: "left" }}
              >
                {file}
              </button>
            ))}
            {found.length === 0 && <p className="px-3 py-2 text-xs text-ov-text-2">{t.noMatch}</p>}
            {found.length > MAX_FOUND && <p className="px-3 py-2 text-xs text-ov-text-3">{t.moreFiles}</p>}
          </>
        ) : (
          <Level nodes={tree} depth={0} unfolded={unfolded} selected={selected} onToggle={toggle} onOpen={onOpen} />
        )}
      </div>
    </div>
  );
}

interface LevelProps {
  nodes: readonly TreeNode[];
  depth: number;
  unfolded: ReadonlySet<string>;
  selected: string | null;
  onToggle: (folder: string) => void;
  onOpen: (file: string) => void;
}

/** Only unfolded folders are drawn: a repository of 50 000 files stays light. */
function Level({ nodes, depth, unfolded, selected, onToggle, onOpen }: LevelProps) {
  const pad = { paddingLeft: 8 + depth * INDENT };
  return nodes.map((node) => {
    const open = unfolded.has(node.path);
    if (node.kind === "folder") {
      return (
        <div key={node.path}>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => onToggle(node.path)}
            className="flex w-full items-center gap-1 py-0.5 pr-2 text-left text-[12px] text-ov-text-2 hover:bg-ov-hover [&_svg]:size-3.5 [&_svg]:shrink-0"
            style={pad}
          >
            <ChevronRight aria-hidden className={cn("transition-transform", open && "rotate-90")} />
            <Folder aria-hidden className="text-ov-text-3" />
            <span className="min-w-0 truncate">{node.name}</span>
          </button>
          {open && <Level nodes={node.children} depth={depth + 1} unfolded={unfolded} selected={selected} onToggle={onToggle} onOpen={onOpen} />}
        </div>
      );
    }
    return (
      <button
        key={node.path}
        type="button"
        title={node.path}
        aria-current={node.path === selected}
        onClick={() => onOpen(node.path)}
        className={cn(
          "flex w-full items-center gap-1 py-0.5 pr-2 text-left text-[12px] text-ov-text-2 hover:bg-ov-hover [&_svg]:size-3.5 [&_svg]:shrink-0",
          node.path === selected && "bg-ov-accent-soft text-ov-text hover:bg-ov-accent-soft",
        )}
        style={{ paddingLeft: pad.paddingLeft + 18 }}
      >
        <File aria-hidden className="text-ov-text-3" />
        <span className="min-w-0 truncate">{node.name}</span>
      </button>
    );
  });
}
