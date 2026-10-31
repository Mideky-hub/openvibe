import { describe, expect, it } from "vitest";
import { ancestors, buildTree, filterPaths, type TreeNode } from "./tree";

const shape = (nodes: readonly TreeNode[]): unknown[] =>
  nodes.map((node) => (node.kind === "folder" ? { [node.name]: shape(node.children) } : node.name));

describe("the file tree (spec studio code §5)", () => {
  it("nests the paths, folders first, each level in natural order", () => {
    const tree = buildTree(["src/b.ts", "README.md", "src/a/z.ts", "src/10.ts", "src/2.ts", ".gitignore", "docs/x.md"]);
    expect(shape(tree)).toEqual([
      { docs: ["x.md"] },
      { src: [{ a: ["z.ts"] }, "2.ts", "10.ts", "b.ts"] },
      ".gitignore",
      "README.md",
    ]);
  });

  it("gives each node its full path", () => {
    const [folder] = buildTree(["a/b/c.txt"]);
    expect(folder).toMatchObject({ kind: "folder", path: "a" });
    if (folder.kind !== "folder") throw new Error("a folder was expected");
    const [inner] = folder.children;
    expect(inner).toMatchObject({ kind: "folder", path: "a/b" });
    if (inner.kind !== "folder") throw new Error("a folder was expected");
    expect(inner.children[0]).toEqual({ kind: "file", name: "c.txt", path: "a/b/c.txt" });
  });

  it("lists the folders above a path, nearest last", () => {
    expect(ancestors("a/b/c.txt")).toEqual(["a", "a/b"]);
    expect(ancestors("c.txt")).toEqual([]);
  });
});

describe("the filter", () => {
  const paths = ["src/App.tsx", "src/app/boot.ts", "README.md"];

  it("ignores case and matches anywhere in the path", () => {
    expect(filterPaths(paths, "APP", 10)).toEqual(["src/App.tsx", "src/app/boot.ts"]);
    expect(filterPaths(paths, "  read ", 10)).toEqual(["README.md"]);
  });

  it("stops at the limit", () => {
    expect(filterPaths(paths, "s", 1)).toEqual(["src/App.tsx"]);
  });
});
