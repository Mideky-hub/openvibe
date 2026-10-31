import { useEffect, useRef, useState } from "react";
import { Boxes } from "lucide-react";
import { useTheme } from "@/app/theme";
import { ICON_CATEGORIES, loadCategory, matchIcons, type IconItem } from "@/canvas/icons/library";
import { insertIcon } from "@/canvas/icons/place";
import { iconThumbnail } from "@/canvas/icons/thumbnail";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useMessages } from "@/i18n";
import { cn } from "@/lib/utils";
import { ToolButton } from "./buttons";
import { shellMessages } from "./messages";

/** A search shows this many icons at most: drawing each one costs. */
const MAX_FOUND = 120;

const CREDITS = ICON_CATEGORIES.flatMap((category) => category.libraries.map((library) => `${library.name} — ${library.authors.join(", ")}`)).join("\n");

/** The ICÔNES menu of the rail (spec maj §4): system design, AWS, Azure and GCP icons, put on the canvas. */
export function IconsMenu() {
  const t = useMessages(shellMessages).icons;
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <ToolButton label={t.title} active={open}>
          <Boxes />
        </ToolButton>
      </PopoverTrigger>
      {/* The keyboard goes to the icon just put on the canvas, not back to this button (final review maj §4). */}
      <PopoverContent side="right" className="w-[400px]" onCloseAutoFocus={(e) => e.preventDefault()}>
        {/* Kept while it closes: the content must not empty during the animation. */}
        <IconsPanel
          onPick={(item) => {
            // Without a canvas nothing was put: the panel stays.
            if (insertIcon(item)) setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

export function IconsPanel({ onPick }: { onPick: (item: IconItem) => void }) {
  const t = useMessages(shellMessages).icons;
  const dark = useTheme() === "dark";
  const [category, setCategory] = useState(ICON_CATEGORIES[0].id);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Record<string, IconItem[]>>({});
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const searching = query.trim() !== "";

  useEffect(() => {
    let alive = true;
    const wanted = searching ? ICON_CATEGORIES : ICON_CATEGORIES.filter((c) => c.id === category);
    for (const c of wanted) {
      loadCategory(c).then(
        (list) => alive && setItems((loaded) => (loaded[c.id] ? loaded : { ...loaded, [c.id]: list })),
        () => alive && setFailed((known) => new Set(known).add(c.id)),
      );
    }
    return () => {
      alive = false;
    };
  }, [category, searching]);

  const wantedNow = searching ? ICON_CATEGORIES : ICON_CATEGORIES.filter((c) => c.id === category);
  const stillLoading = wantedNow.some((c) => !items[c.id] && !failed.has(c.id));
  const someFailed = wantedNow.some((c) => failed.has(c.id));
  const found = searching ? matchIcons(ICON_CATEGORIES.flatMap((c) => items[c.id] ?? []), query).slice(0, MAX_FOUND) : items[category];
  // A search waits for the big files still loading before it says « none »; a failure is told per category.
  const shown = found !== undefined && found.length === 0 && stillLoading ? undefined : found;
  return (
    <div className="flex flex-col gap-2">
      <p className="ov-label">{t.title}</p>
      <input
        type="search"
        aria-label={t.search}
        placeholder={t.searchPlaceholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="h-8 rounded-[8px] bg-ov-field px-2.5 text-[13px] text-ov-text outline-none placeholder:text-ov-text-3"
      />
      <div role="tablist" className="flex gap-1">
        {ICON_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={!searching && c.id === category}
            onClick={() => {
              setCategory(c.id);
              setQuery("");
            }}
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[11.5px] text-ov-text-2 hover:text-ov-text",
              !searching && c.id === category && "bg-ov-accent-soft text-ov-text",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="grid max-h-[420px] grid-cols-4 gap-1.5 overflow-y-auto pr-1">
        {someFailed && !stillLoading && !shown?.length ? (
          <p className="col-span-4 py-6 text-center text-xs text-ov-text-2">{t.notFound}</p>
        ) : shown === undefined ? (
          <p className="col-span-4 py-6 text-center text-xs text-ov-text-2">{t.loading}</p>
        ) : shown.length === 0 ? (
          <p className="col-span-4 py-6 text-center text-xs text-ov-text-2">{t.none}</p>
        ) : (
          shown.map((item) => <IconTile key={item.id} item={item} dark={dark} onPick={onPick} />)
        )}
      </div>
      <p className="text-[10.5px] text-ov-text-3" title={CREDITS}>
        {t.credits}
      </p>
    </div>
  );
}

/** One icon; drawn once it scrolls into view. */
function IconTile({ item, dark, onPick }: { item: IconItem; dark: boolean; onPick: (item: IconItem) => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    let alive = true;
    const draw = () =>
      void iconThumbnail(item, dark).then((svg) => {
        if (!alive || !svg || !box.current) return;
        const copy = svg.cloneNode(true) as SVGSVGElement;
        copy.setAttribute("width", "100%");
        copy.setAttribute("height", "100%");
        box.current.replaceChildren(copy);
      });
    if (typeof IntersectionObserver === "undefined") {
      draw();
      return () => {
        alive = false;
      };
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      draw();
    });
    observer.observe(element);
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [item, dark]);
  return (
    <button
      type="button"
      data-icon={item.id}
      aria-label={item.name}
      title={`${item.name} — ${item.library}`}
      onClick={() => onPick(item)}
      className="flex min-w-0 flex-col items-center gap-1 rounded-lg border border-transparent bg-ov-card p-1.5 text-[10.5px] text-ov-text-2 hover:border-ov-line hover:text-ov-text"
    >
      <div ref={box} className="grid h-12 w-full place-items-center" />
      <span className="w-full truncate text-center">{item.name}</span>
    </button>
  );
}
