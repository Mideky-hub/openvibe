import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { cn } from "cn";
import { Calendar, CircleDot, KanbanSquare, MoreHorizontal, Plus, RefreshCw } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLang, useMessages } from "@/i18n";
import {
  addCard,
  addColumn,
  cardText,
  dueOf,
  dueState,
  removeCard,
  removeColumn,
  renameColumn,
  updateCard,
  type CardDraft,
  type DuePreset,
} from "@/kanban/board";
import { dropCardOutside, startCardDrag } from "@/kanban/dropOnTerminal";
import { createIssueForCard, detectRepo, linkBoard, moveCardWithGithub, parseProject, syncBoard } from "@/kanban/github";
import { useNativeKeyDown } from "@/lib/useNativeKeyDown";
import { nodesStore, useNodes } from "@/store/nodes";
import { KANBAN_PRIORITIES, type KanbanBoardLink, type KanbanCard, type KanbanColumn, type KanbanPayload, type KanbanPriority } from "@/nodes/types";
import { KANBAN_CARD_MIME } from "./drag";
import { kanbanNodeMessages } from "./messages";

export { KANBAN_CARD_MIME } from "./drag";

type Messages = (typeof kanbanNodeMessages)["fr"];

/** The colour of a card's left bar: none shows nothing, then warmer as it grows. */
const PRIORITY_BAR: Record<KanbanPriority, string> = {
  none: "transparent",
  low: "var(--ov-ok)",
  medium: "var(--ov-wait)",
  high: "var(--ov-danger)",
};

type Editing = { mode: "new"; columnId: string } | { mode: "edit"; cardId: string };

/** Where a dragged card would land. */
interface DropSpot {
  columnId: string;
  index: number;
}

/** The board as it is now, read when acting rather than when rendered. */
function currentBoard(nodeId: string): KanbanPayload | null {
  const record = nodesStore.getState().nodes[nodeId];
  return record?.kind === "kanban" ? record.payload : null;
}

function commit(nodeId: string, change: (board: KanbanPayload) => KanbanPayload) {
  const board = currentBoard(nodeId);
  if (!board) return;
  const next = change(board);
  if (next !== board) nodesStore.getState().update(nodeId, { columns: next.columns, cards: next.cards });
}

/** A Kanban board on the canvas (issue #29): columns of cards, dragged between them or onto a terminal. */
export function KanbanNode({ nodeId }: { nodeId: string }) {
  const t = useMessages(kanbanNodeMessages);
  const record = useNodes((s) => s.nodes[nodeId]);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const [spot, setSpot] = useState<DropSpot | null>(null);
  const [linking, setLinking] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  // The wheel scrolls the board, not the canvas (Excalidraw listens below React's root).
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const listener = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) event.stopPropagation();
    };
    element.addEventListener("wheel", listener);
    return () => element.removeEventListener("wheel", listener);
  }, [record?.kind]);

  if (record?.kind !== "kanban") return null;
  const board = record.payload;

  const sync = async () => {
    setSyncing(true);
    try {
      await syncBoard(nodeId);
    } finally {
      setSyncing(false);
    }
  };

  const newColumn = () => {
    commit(nodeId, (b) => addColumn(b, t.newColumn));
    const columns = currentBoard(nodeId)?.columns;
    if (columns?.length) setRenaming(columns[columns.length - 1].id);
  };

  const onCardDragStart = (e: DragEvent, card: KanbanCard) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = "copyMove";
    e.dataTransfer.setData(KANBAN_CARD_MIME, JSON.stringify({ nodeId, cardId: card.id }));
    e.dataTransfer.setData("text/plain", cardText(card));
    startCardDrag(nodeId, card.id);
    setDragged(card.id);
  };

  const onCardDragEnd = (e: DragEvent, cardId: string) => {
    setDragged(null);
    setSpot(null);
    if (e.dataTransfer.dropEffect === "none") dropCardOutside(nodeId, cardId, e.clientX, e.clientY);
  };

  /** The index among the column's cards, the dragged one left out, above which the pointer is. */
  const spotIn = (e: DragEvent<HTMLElement>, columnId: string): DropSpot => {
    const cards = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-card-id]")].filter((el) => el.dataset.cardId !== dragged);
    const index = cards.filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.top + rect.height / 2 < e.clientY;
    }).length;
    return { columnId, index };
  };

  const onColumnDragOver = (e: DragEvent<HTMLElement>, columnId: string) => {
    if (!dragged || !e.dataTransfer.types.includes(KANBAN_CARD_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const next = spotIn(e, columnId);
    if (next.columnId !== spot?.columnId || next.index !== spot.index) setSpot(next);
  };

  const onColumnDrop = (e: DragEvent<HTMLElement>, columnId: string) => {
    if (!dragged) return;
    e.preventDefault();
    const { index } = spotIn(e, columnId);
    const cardId = dragged;
    // A linked card's issue follows on GitHub; the card moves locally either way.
    void moveCardWithGithub(nodeId, cardId, columnId, index);
    setSpot(null);
  };

  const editedCard = editing?.mode === "edit" ? board.cards[editing.cardId] : undefined;
  const editedColumn = editing?.mode === "new" ? board.columns.find((c) => c.id === editing.columnId) : undefined;

  return (
    <div data-kanban={nodeId} className="flex h-full flex-col overflow-hidden rounded-xl border border-ov-line bg-card text-card-foreground">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-ov-line px-3">
        <KanbanSquare className="size-4 shrink-0 text-ov-accent" />
        <span className="truncate text-[13px] font-semibold text-ov-text">{t.title}</span>
        {board.github && (
          <span className="truncate font-mono text-[11px] text-muted-foreground" title={t.github.linkedTo(board.github.repo)}>
            {board.github.repo}
          </span>
        )}
        <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">{t.cardCount(Object.keys(board.cards).length)}</span>
        {board.github && (
          <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[12px]" disabled={syncing} onClick={() => void sync()}>
            <RefreshCw className={cn("size-3.5", syncing && "animate-spin")} />
            {syncing ? t.github.syncing : t.github.sync}
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t.github.boardMenu}
              className="grid size-7 shrink-0 place-items-center rounded text-muted-foreground hover:bg-ov-hover hover:text-ov-text"
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onSelect={() => setLinking(true)}>{board.github ? t.github.editLink : t.github.link}</DropdownMenuItem>
            {board.github && (
              <>
                <DropdownMenuItem onSelect={() => void sync()}>{t.github.sync}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => linkBoard(nodeId, null)}>
                  {t.github.unlink}
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={newColumn}>{t.addColumn}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      <div ref={scroller} className="flex min-h-0 flex-1 gap-3 overflow-x-auto overflow-y-hidden p-3">
        {board.columns.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
            <p>{t.empty}</p>
            <Button size="sm" onClick={newColumn}>
              <Plus />
              {t.addColumn}
            </Button>
          </div>
        ) : (
          <>
            {board.columns.map((column) => (
              <ColumnView
                key={column.id}
                t={t}
                column={column}
                cards={column.cardIds.map((id) => board.cards[id]).filter((c): c is KanbanCard => !!c)}
                renaming={renaming === column.id}
                onRenameStart={() => setRenaming(column.id)}
                onRenameDone={(title) => {
                  if (title !== null && title.trim()) commit(nodeId, (b) => renameColumn(b, column.id, title.trim()));
                  setRenaming(null);
                }}
                onRemove={() => commit(nodeId, (b) => removeColumn(b, column.id))}
                onNewCard={() => setEditing({ mode: "new", columnId: column.id })}
                onOpenCard={(cardId) => setEditing({ mode: "edit", cardId })}
                dragged={dragged}
                spot={spot?.columnId === column.id ? spot.index : null}
                onCardDragStart={onCardDragStart}
                onCardDragEnd={onCardDragEnd}
                onDragOver={(e) => onColumnDragOver(e, column.id)}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSpot((s) => (s?.columnId === column.id ? null : s));
                }}
                onDrop={(e) => onColumnDrop(e, column.id)}
              />
            ))}
            <button
              type="button"
              onClick={newColumn}
              className="flex h-9 w-56 shrink-0 items-center gap-1.5 rounded-lg border border-dashed border-ov-line px-3 text-[13px] text-muted-foreground hover:bg-ov-hover hover:text-ov-text"
            >
              <Plus className="size-4" />
              {t.addColumn}
            </button>
          </>
        )}
      </div>
      <CardDialog
        key={editing ? (editing.mode === "new" ? `new-${editing.columnId}` : editing.cardId) : "closed"}
        t={t}
        open={editing !== null && (editedCard !== undefined || editedColumn !== undefined)}
        title={editedCard ? t.editCard : t.addCardTo(editedColumn?.title ?? "")}
        initial={editedCard}
        onCreateIssue={editedCard && !editedCard.github && board.github ? () => createIssueForCard(nodeId, editedCard.id) : undefined}
        onClose={() => setEditing(null)}
        onSave={(draft) => {
          if (editing?.mode === "new") commit(nodeId, (b) => addCard(b, editing.columnId, draft));
          else if (editing?.mode === "edit") commit(nodeId, (b) => updateCard(b, editing.cardId, draft));
          setEditing(null);
        }}
        onDelete={
          editedCard
            ? () => {
                commit(nodeId, (b) => removeCard(b, editedCard.id));
                setEditing(null);
              }
            : undefined
        }
      />
      {linking && (
        <LinkDialog
          t={t}
          initial={board.github}
          onClose={() => setLinking(false)}
          onLink={(link) => {
            linkBoard(nodeId, link);
            setLinking(false);
            void sync();
          }}
        />
      )}
    </div>
  );
}

const REPO = /^[\w.-]+\/[\w.-]+$/;

/** « Lier à GitHub »: the repository, detected from the project's origin, and optionally a Project (v2). */
function LinkDialog({
  t,
  initial,
  onClose,
  onLink,
}: {
  t: Messages;
  initial?: KanbanBoardLink;
  onClose: () => void;
  onLink: (link: KanbanBoardLink) => void;
}) {
  const [repo, setRepo] = useState(initial?.repo ?? "");
  const [project, setProject] = useState(initial?.project ? `${initial.project.owner}/${initial.project.number}` : "");
  const [detecting, setDetecting] = useState(!initial);
  const [notDetected, setNotDetected] = useState(false);

  useEffect(() => {
    if (initial) return;
    let live = true;
    void detectRepo()
      .catch(() => null)
      .then((found) => {
        if (!live) return;
        setDetecting(false);
        if (found) setRepo((typed) => typed || found);
        else setNotDetected(true);
      });
    return () => {
      live = false;
    };
  }, [initial]);

  const repoValid = REPO.test(repo.trim());
  const parsedProject = project.trim() ? parseProject(project) : undefined;
  const projectValid = parsedProject !== null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!repoValid || !projectValid) return;
    const link: KanbanBoardLink = { repo: repo.trim() };
    if (parsedProject) link.project = parsedProject;
    onLink(link);
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{t.github.linkTitle}</DialogTitle>
          </DialogHeader>
          <p className="text-[12px] text-muted-foreground">{t.github.linkHint}</p>
          <div className="grid gap-1.5">
            <Label htmlFor="kanban-github-repo">{t.github.repo}</Label>
            <Input
              id="kanban-github-repo"
              autoFocus
              value={repo}
              placeholder={detecting ? t.github.detecting : t.github.repoPlaceholder}
              onChange={(e) => setRepo(e.target.value)}
            />
            {repo.trim() && !repoValid && <p className="text-[12px] text-ov-danger">{t.github.repoInvalid}</p>}
            {notDetected && !repo.trim() && <p className="text-[12px] text-muted-foreground">{t.github.notDetected}</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="kanban-github-project">{t.github.project}</Label>
            <Input
              id="kanban-github-project"
              value={project}
              placeholder={t.github.projectPlaceholder}
              onChange={(e) => setProject(e.target.value)}
            />
            {!projectValid && <p className="text-[12px] text-ov-danger">{t.github.projectInvalid}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t.cancel}
            </Button>
            <Button type="submit" disabled={!repoValid || !projectValid}>
              {t.github.confirm}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface ColumnViewProps {
  t: Messages;
  column: KanbanColumn;
  cards: KanbanCard[];
  renaming: boolean;
  onRenameStart: () => void;
  onRenameDone: (title: string | null) => void;
  onRemove: () => void;
  onNewCard: () => void;
  onOpenCard: (cardId: string) => void;
  dragged: string | null;
  spot: number | null;
  onCardDragStart: (e: DragEvent, card: KanbanCard) => void;
  onCardDragEnd: (e: DragEvent, cardId: string) => void;
  onDragOver: (e: DragEvent<HTMLElement>) => void;
  onDragLeave: (e: DragEvent<HTMLElement>) => void;
  onDrop: (e: DragEvent<HTMLElement>) => void;
}

function ColumnView(props: ColumnViewProps) {
  const { t, column, cards, dragged, spot } = props;
  const shown = cards.filter((c) => c.id !== dragged);
  const indicator = <div className="h-0.5 shrink-0 rounded-full bg-ov-accent" />;
  return (
    <section
      data-column-id={column.id}
      className="flex w-60 shrink-0 flex-col rounded-lg bg-ov-surface-2"
      onDragOver={props.onDragOver}
      onDragLeave={props.onDragLeave}
      onDrop={props.onDrop}
    >
      <div className="flex h-9 shrink-0 items-center gap-1.5 px-2.5">
        {props.renaming ? (
          <TitleInput initial={column.title} onDone={props.onRenameDone} />
        ) : (
          <h3 className="truncate text-[13px] font-semibold text-ov-text" title={t.doubleClickRename} onDoubleClick={props.onRenameStart}>
            {column.title}
          </h3>
        )}
        <span data-testid="column-count" className="rounded-full bg-ov-card px-1.5 font-mono text-[11px] text-muted-foreground">
          {cards.length}
        </span>
        <span className="ml-auto flex items-center">
          <button
            type="button"
            aria-label={t.newCard}
            title={t.newCard}
            onClick={props.onNewCard}
            className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-ov-hover hover:text-ov-text"
          >
            <Plus className="size-3.5" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t.columnMenu(column.title)}
                className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-ov-hover hover:text-ov-text"
              >
                <MoreHorizontal className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onSelect={props.onRenameStart}>{t.rename}</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={props.onRemove}>
                {t.removeColumn}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {cards.map((card) => {
          const index = shown.indexOf(card);
          return (
            <div key={card.id} className="contents">
              {spot !== null && index === spot && indicator}
              <CardView
                t={t}
                card={card}
                dragging={card.id === dragged}
                onOpen={() => props.onOpenCard(card.id)}
                onDragStart={(e) => props.onCardDragStart(e, card)}
                onDragEnd={(e) => props.onCardDragEnd(e, card.id)}
              />
            </div>
          );
        })}
        {spot !== null && spot >= shown.length && indicator}
        <button
          type="button"
          onClick={props.onNewCard}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-[12px] text-muted-foreground hover:bg-ov-hover hover:text-ov-text"
        >
          <Plus className="size-3.5" />
          {t.newCard}
        </button>
      </div>
    </section>
  );
}

function CardView({
  t,
  card,
  dragging,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  t: Messages;
  card: KanbanCard;
  dragging: boolean;
  onOpen: () => void;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: (e: DragEvent) => void;
}) {
  const lang = useLang();
  const overdue = card.due !== undefined && dueState(card.due) === "overdue";
  return (
    <div
      data-card-id={card.id}
      role="button"
      tabIndex={0}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className={cn(
        "relative shrink-0 cursor-grab overflow-hidden rounded-md border border-ov-line bg-ov-card py-2 pr-2.5 pl-3.5 text-left shadow-ov hover:border-ov-accent/50",
        dragging && "opacity-40",
      )}
    >
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: PRIORITY_BAR[card.priority] }} aria-label={t.priorities[card.priority]} />
      <p className="text-[13px] leading-snug font-medium break-words text-ov-text">{card.title}</p>
      {(card.due || card.github) && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {card.due && (
            <span
              title={overdue ? t.overdue : undefined}
              className={cn(
                "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]",
                overdue ? "bg-destructive/15 text-ov-danger" : "bg-ov-surface-2 text-muted-foreground",
              )}
            >
              <Calendar className="size-3" />
              {formatDue(card.due, lang)}
            </span>
          )}
          {card.github && (
            <button
              type="button"
              title={t.githubIssue(card.github.repo, card.github.number)}
              onClick={(e) => {
                e.stopPropagation();
                if (card.github?.url) void openUrl(card.github.url).catch(() => undefined);
              }}
              className={cn(
                "inline-flex items-center gap-1 rounded bg-ov-surface-2 px-1.5 py-0.5 font-mono text-[11px] hover:text-ov-text",
                card.github.state === "closed" ? "text-ov-accent" : "text-muted-foreground",
              )}
            >
              <CircleDot className="size-3" />#{card.github.number}
            </button>
          )}
        </div>
      )}
      {card.notes.trim() && <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-muted-foreground">{card.notes}</p>}
    </div>
  );
}

/** "28 oct." / "Oct 28": the date of a YYYY-MM-DD, without its year. */
function formatDue(due: string, lang: string): string {
  const [y, m, d] = due.split("-").map(Number);
  if (!y || !m || !d) return due;
  return new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" }).format(new Date(y, m - 1, d));
}

/** A column title being edited: Enter or a click elsewhere keeps it, Escape cancels. */
function TitleInput({ initial, onDone }: { initial: string; onDone: (title: string | null) => void }) {
  const [draft, setDraft] = useState(initial);
  const input = useRef<HTMLInputElement>(null);
  const cancelled = useRef(false);
  useNativeKeyDown(input, (e) => {
    if (e.key === "Enter") input.current?.blur();
    if (e.key === "Escape") {
      cancelled.current = true;
      onDone(null);
    }
  });
  useEffect(() => input.current?.select(), []);
  return (
    <input
      ref={input}
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (!cancelled.current) onDone(draft);
      }}
      className="min-w-0 flex-1 rounded bg-ov-card px-1 text-[13px] font-semibold text-ov-text outline-none"
    />
  );
}

const DUE_PRESETS: readonly DuePreset[] = ["today", "tomorrow", "nextWeek"];

function CardDialog({
  t,
  open,
  title,
  initial,
  onClose,
  onSave,
  onDelete,
  onCreateIssue,
}: {
  t: Messages;
  open: boolean;
  title: string;
  initial?: KanbanCard;
  /** For a saved card not linked yet, on a linked board. */
  onCreateIssue?: () => Promise<boolean>;
  onClose: () => void;
  onSave: (draft: CardDraft) => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(initial?.title ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [due, setDue] = useState<string | undefined>(initial?.due);
  const [priority, setPriority] = useState<KanbanPriority>(initial?.priority ?? "none");
  const [creating, setCreating] = useState(false);
  const presetLabel: Record<DuePreset, string> = { today: t.dueToday, tomorrow: t.dueTomorrow, nextWeek: t.dueNextWeek };
  const presets = DUE_PRESETS.map((preset) => ({ preset, date: dueOf(preset) }));
  const custom = due !== undefined && !presets.some((p) => p.date === due);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({ title: name.trim(), notes, due, priority });
  };

  const chip = (active: boolean) =>
    cn(
      "h-7 rounded-md border px-2 text-[12px] transition-colors",
      active ? "border-ov-accent bg-ov-accent-soft text-ov-text" : "border-ov-line text-muted-foreground hover:bg-ov-hover hover:text-ov-text",
    );

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="kanban-card-title">{t.cardTitle}</Label>
            <Input id="kanban-card-title" autoFocus value={name} placeholder={t.cardTitlePlaceholder} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="kanban-card-notes">{t.notes}</Label>
            <textarea
              id="kanban-card-notes"
              rows={4}
              value={notes}
              placeholder={t.notesPlaceholder}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>{t.due}</Label>
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" aria-pressed={due === undefined} className={chip(due === undefined)} onClick={() => setDue(undefined)}>
                {t.dueNone}
              </button>
              {presets.map(({ preset, date }) => (
                <button key={preset} type="button" aria-pressed={due === date} className={chip(due === date)} onClick={() => setDue(date)}>
                  {presetLabel[preset]}
                </button>
              ))}
              <input
                type="date"
                aria-label={t.dueDate}
                value={custom ? due : ""}
                onChange={(e) => setDue(e.target.value || undefined)}
                className={cn(chip(custom), "bg-transparent")}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>{t.priority}</Label>
            <div role="radiogroup" aria-label={t.priority} className="inline-flex w-fit rounded-lg border border-ov-line p-0.5">
              {KANBAN_PRIORITIES.map((p) => (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={priority === p}
                  onClick={() => setPriority(p)}
                  className={cn(
                    "flex h-6 items-center gap-1.5 rounded-md px-2.5 text-[12px]",
                    priority === p ? "bg-ov-card text-ov-text shadow-ov" : "text-muted-foreground hover:text-ov-text",
                  )}
                >
                  {p !== "none" && <span className="size-2 rounded-full" style={{ background: PRIORITY_BAR[p] }} />}
                  {t.priorities[p]}
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            {onDelete && (
              <Button type="button" variant="destructive" className="sm:mr-auto" onClick={onDelete}>
                {t.remove}
              </Button>
            )}
            {onCreateIssue && (
              <Button
                type="button"
                variant="outline"
                disabled={creating}
                onClick={async () => {
                  // The issue is made from what the dialog shows: typed changes are saved first.
                  if (name.trim()) onSave({ title: name.trim(), notes, due, priority });
                  setCreating(true);
                  await onCreateIssue();
                  setCreating(false);
                }}
              >
                {creating ? t.github.creatingIssue : t.github.createIssue}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose}>
              {t.cancel}
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              {t.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
