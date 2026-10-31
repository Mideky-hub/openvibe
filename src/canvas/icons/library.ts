import catalog from "./catalog.json";

/**
 * The icons menu (spec maj §4): Excalidraw community libraries shipped with
 * the app — system design, AWS, Azure, GCP — read, searched, and copied
 * onto the canvas with ids of their own.
 */
export interface IconLibrary {
  source: string;
  name: string;
  authors: string[];
}

export interface IconCategory {
  id: string;
  label: string;
  libraries: IconLibrary[];
}

export const ICON_CATEGORIES: readonly IconCategory[] = catalog.categories;

/** An element as a library file holds it: Excalidraw restores the rest. */
export interface RawElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  groupIds?: string[];
  isDeleted?: boolean;
  text?: string;
  points?: number[][];
  containerId?: string | null;
  boundElements?: { id: string; type: string }[] | null;
  startBinding?: { elementId: string } | null;
  endBinding?: { elementId: string } | null;
  [key: string]: unknown;
}

export interface IconItem {
  /** `<source>#<index>`: unique among all libraries. */
  id: string;
  name: string;
  library: string;
  elements: readonly RawElement[];
}

/** Where the app serves a library: public/libraries, written by scripts/fetch-icon-libraries.mjs. */
export const libraryFile = (source: string) => `/libraries/${source.replace("/", "__")}.excalidrawlib`;

const MAX_NAME = 40;
const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

function nameOf(name: unknown, elements: readonly RawElement[], fallback: string): string {
  if (typeof name === "string" && name.trim()) return name.trim();
  const words = elements
    .filter((e) => e.type === "text" && typeof e.text === "string")
    .map((e) => e.text!)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return words ? words.slice(0, MAX_NAME) : fallback;
}

/** What a library may not bring onto the canvas: live pages, other frames, images. */
const FOREIGN = new Set(["embeddable", "iframe", "frame", "magicframe", "image"]);

/** An element without the links, custom data and lock a downloaded library might carry. */
function clean(element: RawElement): RawElement {
  const { customData: _customData, link: _link, ...rest } = element;
  return rest.locked ? { ...rest, locked: false } : rest;
}

/** The items of a library file: version 2 `libraryItems`, or version 1 `library` (bare element lists). */
export function readLibrary(raw: unknown, library: IconLibrary): IconItem[] {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const entries: { name?: unknown; elements: unknown }[] = Array.isArray(r.libraryItems)
    ? r.libraryItems.map((item: Record<string, unknown>) => ({ name: item?.name, elements: item?.elements }))
    : Array.isArray(r.library)
      ? r.library.map((elements: unknown) => ({ elements }))
      : [];
  return entries.flatMap((entry, i) => {
    if (!Array.isArray(entry.elements)) return [];
    const elements = (entry.elements as RawElement[])
      .filter((e) => typeof e === "object" && e !== null && !e.isDeleted && !FOREIGN.has(e.type))
      .map(clean);
    if (elements.length === 0) return [];
    return [{ id: `${library.source}#${i}`, name: nameOf(entry.name, elements, `${library.name} ${i + 1}`), library: library.name, elements }];
  });
}

/** The items whose name or library holds every word of the query, case and accents aside. */
export function matchIcons(items: readonly IconItem[], query: string): IconItem[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    const haystack = fold(`${item.name} ${item.library}`);
    return words.every((word) => haystack.includes(word));
  });
}

/** The corners (or points) of an element, turned by its angle around its center as Excalidraw's `getCommonBounds` does. */
function corners(e: RawElement): [number, number][] {
  const own: [number, number][] =
    Array.isArray(e.points) && e.points.length > 0
      ? e.points.map(([px, py]) => [e.x + px, e.y + py])
      : [[e.x, e.y], [e.x + e.width, e.y], [e.x, e.y + e.height], [e.x + e.width, e.y + e.height]];
  const angle = typeof e.angle === "number" ? e.angle : 0;
  if (!angle) return own;
  const cx = e.x + e.width / 2;
  const cy = e.y + e.height / 2;
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  return own.map(([x, y]) => [cx + (x - cx) * cos - (y - cy) * sin, cy + (x - cx) * sin + (y - cy) * cos]);
}

function bounds(elements: readonly RawElement[]) {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const e of elements) {
    for (const [x, y] of corners(e)) {
      xs.push(x);
      ys.push(y);
    }
  }
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

/**
 * A copy of an item's elements for the canvas: new ids (its groups, texts in
 * containers and arrow bindings kept between them), centered on `at`, held
 * as one group so the icon moves whole.
 */
export function instantiate(elements: readonly RawElement[], at: { x: number; y: number }, newId: () => string): RawElement[] {
  const ids = new Map(elements.map((e) => [e.id, newId()]));
  const groups = new Map<string, string>();
  for (const e of elements) for (const group of e.groupIds ?? []) if (!groups.has(group)) groups.set(group, newId());
  const shared = (elements[0]?.groupIds ?? []).filter((group) => elements.every((e) => e.groupIds?.includes(group)));
  const wrap = elements.length > 1 && shared.length === 0 ? newId() : null;
  const { minX, maxX, minY, maxY } = bounds(elements);
  const dx = at.x - (minX + maxX) / 2;
  const dy = at.y - (minY + maxY) / 2;
  const link = <T extends { elementId: string }>(binding: T | null | undefined): T | null =>
    binding && ids.has(binding.elementId) ? { ...binding, elementId: ids.get(binding.elementId)! } : null;
  return elements.map((e) => {
    const copy: RawElement = {
      ...e,
      id: ids.get(e.id)!,
      x: e.x + dx,
      y: e.y + dy,
      groupIds: [...(e.groupIds ?? []).map((group) => groups.get(group)!), ...(wrap ? [wrap] : [])],
      frameId: null,
      version: 1,
      // Each copy is drawn on its own: the same seed would give every copy the same hand-drawn lines.
      seed: Math.floor(Math.random() * 2 ** 31),
      versionNonce: Math.floor(Math.random() * 2 ** 31),
      updated: Date.now(),
    };
    if ("index" in e) copy.index = null;
    if (e.containerId !== undefined) copy.containerId = e.containerId ? (ids.get(e.containerId) ?? null) : null;
    if (e.boundElements !== undefined) {
      copy.boundElements = e.boundElements ? e.boundElements.filter((b) => ids.has(b.id)).map((b) => ({ ...b, id: ids.get(b.id)! })) : null;
    }
    if (e.startBinding !== undefined) copy.startBinding = link(e.startBinding);
    if (e.endBinding !== undefined) copy.endBinding = link(e.endBinding);
    return copy;
  });
}

const loaded = new Map<string, Promise<IconItem[]>>();

/** A category's items, its libraries fetched once from the app's assets. */
export function loadCategory(category: IconCategory): Promise<IconItem[]> {
  let items = loaded.get(category.id);
  if (!items) {
    items = Promise.all(
      category.libraries.map(async (library) => {
        const response = await fetch(libraryFile(library.source));
        return response.ok ? readLibrary(await response.json(), library) : [];
      }),
    ).then((lists) => lists.flat());
    // A failure is not kept: the next opening tries again.
    items.catch(() => loaded.delete(category.id));
    loaded.set(category.id, items);
  }
  return items;
}
