export interface TreeFile {
  kind: "file";
  name: string;
  path: string;
}

export interface TreeFolder {
  kind: "folder";
  name: string;
  path: string;
  children: TreeNode[];
}

export type TreeNode = TreeFile | TreeFolder;

const naturalOrder = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

function sorted(nodes: TreeNode[]): TreeNode[] {
  nodes.sort((a, b) => (a.kind === b.kind ? naturalOrder.compare(a.name, b.name) : a.kind === "folder" ? -1 : 1));
  for (const node of nodes) if (node.kind === "folder") sorted(node.children);
  return nodes;
}

/** The project's files as a tree, from paths separated by `/`. */
export function buildTree(paths: readonly string[]): TreeNode[] {
  const root: TreeNode[] = [];
  const folders = new Map<string, TreeFolder>();
  for (const path of paths) {
    const parts = path.split("/");
    let level = root;
    parts.slice(0, -1).forEach((name, depth) => {
      const folderPath = parts.slice(0, depth + 1).join("/");
      let folder = folders.get(folderPath);
      if (!folder) {
        folder = { kind: "folder", name, path: folderPath, children: [] };
        folders.set(folderPath, folder);
        level.push(folder);
      }
      level = folder.children;
    });
    level.push({ kind: "file", name: parts[parts.length - 1], path });
  }
  return sorted(root);
}

/** The folders above a path, to unfold down to it. */
export function ancestors(path: string): string[] {
  const parts = path.split("/");
  return parts.slice(0, -1).map((_, depth) => parts.slice(0, depth + 1).join("/"));
}

/** The paths containing `query`, in the list's order, `limit` at most. */
export function filterPaths(paths: readonly string[], query: string, limit: number): string[] {
  const wanted = query.trim().toLowerCase();
  const found: string[] = [];
  for (const path of paths) {
    if (found.length === limit) break;
    if (path.toLowerCase().includes(wanted)) found.push(path);
  }
  return found;
}
