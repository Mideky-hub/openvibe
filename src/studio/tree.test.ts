import { describe, expect, it } from "vitest";
import type { TreeEntry } from "@/ipc/studio";
import { ancestors, baseName, buildTree, filterTree, toggle, visibleRows } from "./tree";
import { extensionOf, isMarkdown } from "./languages";

const ENTRIES = [
  { path: "src/b.ts", kind: "file" as const },
  { path: "README.md", kind: "file" as const },
  { path: "src", kind: "dir" as const },
  { path: "src/lib/util.ts", kind: "file" as const },
  { path: "src/a.ts", kind: "file" as const },
  { path: "docs", kind: "dir" as const },
];

const names = (rows: ReturnType<typeof visibleRows>) => rows.map((r) => `${"  ".repeat(r.depth)}${r.node.name}`);

describe("buildTree", () => {
  it("nests the paths, folders first then by name, and adds the folders a path implies", () => {
    const tree = buildTree(ENTRIES);
    expect(tree.map((n) => n.name)).toEqual(["docs", "src", "README.md"]);
    const src = tree[1];
    expect(src.children.map((n) => `${n.kind}:${n.path}`)).toEqual(["dir:src/lib", "file:src/a.ts", "file:src/b.ts"]);
    expect(src.children[0].children.map((n) => n.path)).toEqual(["src/lib/util.ts"]);
  });

  it("gives the same tree with or without the folder entries, in any order, each folder once", () => {
    const files = ENTRIES.filter((e) => e.kind === "file");
    const dirs = [
      { path: "src/lib", kind: "dir" as const },
      { path: "src", kind: "dir" as const },
    ];
    const sorted = [...files, ...dirs].sort((a, b) => a.path.localeCompare(b.path));
    const shape = (entries: TreeEntry[]) => JSON.stringify(buildTree(entries));
    expect(shape([...dirs, ...files])).toBe(shape(files));
    expect(shape([...files, ...dirs])).toBe(shape(files));
    expect(shape(sorted)).toBe(shape(files));
    expect(buildTree([{ path: "empty", kind: "dir" }])).toEqual([{ name: "empty", path: "empty", kind: "dir", children: [] }]);
  });

  it("takes Windows separators and stray slashes", () => {
    const tree = buildTree([{ path: "src\\x.ts", kind: "file" }, { path: "/src/", kind: "dir" }]);
    expect(tree).toHaveLength(1);
    expect(tree[0].children[0].path).toBe("src/x.ts");
  });
});

describe("visibleRows", () => {
  const tree = buildTree(ENTRIES);

  it("shows a folder's children only when it is open", () => {
    expect(names(visibleRows(tree, new Set()))).toEqual(["docs", "src", "README.md"]);
    expect(names(visibleRows(tree, new Set(["src"])))).toEqual(["docs", "src", "  lib", "  a.ts", "  b.ts", "README.md"]);
  });

  it("while filtering, keeps the matches with their folders, all open", () => {
    expect(names(visibleRows(tree, new Set(), "UTIL"))).toEqual(["src", "  lib", "    util.ts"]);
    expect(visibleRows(tree, new Set(), "nothing")).toEqual([]);
    expect(filterTree(tree, "  ")).toHaveLength(3);
  });

  it("toggles a folder and finds a file's folders", () => {
    const open = toggle(new Set(), "src");
    expect([...open]).toEqual(["src"]);
    expect([...toggle(open, "src")]).toEqual([]);
    expect(ancestors("src/lib/util.ts")).toEqual(["src", "src/lib"]);
    expect(baseName("src/lib/util.ts")).toBe("util.ts");
  });
});

describe("languages", () => {
  it("reads the extension", () => {
    expect(extensionOf("src/App.TSX")).toBe("tsx");
    expect(extensionOf(".gitignore")).toBe("");
    expect(isMarkdown("docs/README.md")).toBe(true);
    expect(isMarkdown("src/a.ts")).toBe(false);
  });
});
