import type { TreeEntry } from "@/ipc/studio";

/** A folder or a file of the tree, its children sorted: folders first, then by name. */
export interface TreeNode {
  name: string;
  path: string;
  kind: "file" | "dir";
  children: TreeNode[];
}

/** A line of the tree on screen. */
export interface TreeRow {
  node: TreeNode;
  depth: number;
  expanded: boolean;
}

const byKindThenName = (a: TreeNode, b: TreeNode) =>
  a.kind === b.kind ? a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }) : a.kind === "dir" ? -1 : 1;

/** The flat list of the backend as a tree; a folder only implied by a file's path is added too. */
export function buildTree(entries: readonly TreeEntry[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", kind: "dir", children: [] };
  const dirs = new Map<string, TreeNode>([["", root]]);
  const dirFor = (path: string): TreeNode => {
    const found = dirs.get(path);
    if (found) return found;
    const cut = path.lastIndexOf("/");
    const node: TreeNode = { name: path.slice(cut + 1), path, kind: "dir", children: [] };
    dirFor(cut < 0 ? "" : path.slice(0, cut)).children.push(node);
    dirs.set(path, node);
    return node;
  };
  for (const entry of entries) {
    const path = entry.path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    if (!path) continue;
    if (entry.kind === "dir") {
      dirFor(path);
      continue;
    }
    const cut = path.lastIndexOf("/");
    dirFor(cut < 0 ? "" : path.slice(0, cut)).children.push({ name: path.slice(cut + 1), path, kind: "file", children: [] });
  }
  const sort = (nodes: TreeNode[]) => {
    nodes.sort(byKindThenName);
    for (const node of nodes) sort(node.children);
  };
  sort(root.children);
  return root.children;
}

/** Keeps the files whose path contains the query (case ignored), with the folders that lead to them. */
export function filterTree(nodes: readonly TreeNode[], query: string): TreeNode[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...nodes];
  const kept: TreeNode[] = [];
  for (const node of nodes) {
    if (node.kind === "file") {
      if (node.path.toLowerCase().includes(needle)) kept.push(node);
      continue;
    }
    const children = filterTree(node.children, needle);
    if (children.length > 0) kept.push({ ...node, children });
  }
  return kept;
}

/** The lines on screen: a folder's children under it when it is open; while filtering, every folder is. */
export function visibleRows(nodes: readonly TreeNode[], expanded: ReadonlySet<string>, query = ""): TreeRow[] {
  const filtering = query.trim() !== "";
  const rows: TreeRow[] = [];
  const walk = (list: readonly TreeNode[], depth: number) => {
    for (const node of list) {
      const open = node.kind === "dir" && (filtering || expanded.has(node.path));
      rows.push({ node, depth, expanded: open });
      if (open) walk(node.children, depth + 1);
    }
  };
  walk(filterTree(nodes, query), 0);
  return rows;
}

/** Opens a folder, or closes it. */
export function toggle(expanded: ReadonlySet<string>, path: string): Set<string> {
  const next = new Set(expanded);
  if (next.has(path)) next.delete(path);
  else next.add(path);
  return next;
}

/** The folders that hold a file, so that opening it shows it in the tree. */
export function ancestors(path: string): string[] {
  const parts = path.split("/");
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join("/"));
}

/** The file's name, after its last `/`. */
export const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);
