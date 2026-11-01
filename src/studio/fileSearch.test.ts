import { describe, expect, it } from "vitest";
import { parseFileQuery, parseLineTarget, rankFiles } from "./fileSearch";

describe("parseFileQuery", () => {
  it("reads a plain text as is, trimmed", () => {
    expect(parseFileQuery("  App.tsx  ")).toEqual({ text: "App.tsx" });
    expect(parseFileQuery("")).toEqual({ text: "" });
  });

  it("keeps the spaces between terms", () => {
    expect(parseFileQuery(" src app ")).toEqual({ text: "src app" });
  });

  it("reads a trailing line, then column", () => {
    expect(parseFileQuery("App.tsx:42")).toEqual({ text: "App.tsx", line: 42 });
    expect(parseFileQuery("App.tsx:42:5")).toEqual({ text: "App.tsx", line: 42, column: 5 });
    expect(parseFileQuery("src app:7")).toEqual({ text: "src app", line: 7 });
  });

  it("drops a lone trailing colon", () => {
    expect(parseFileQuery("App.tsx:")).toEqual({ text: "App.tsx" });
    expect(parseFileQuery("App.tsx:42:")).toEqual({ text: "App.tsx", line: 42 });
  });

  it("strips a line 0 without keeping it", () => {
    expect(parseFileQuery("App.tsx:0")).toEqual({ text: "App.tsx" });
    expect(parseFileQuery("App.tsx:3:0")).toEqual({ text: "App.tsx", line: 3 });
  });

  it("does not read a drive letter or a colon inside as a line", () => {
    expect(parseFileQuery("C:/src/App.tsx")).toEqual({ text: "C:/src/App.tsx" });
    expect(parseFileQuery("C:/src/App.tsx:12")).toEqual({ text: "C:/src/App.tsx", line: 12 });
    expect(parseFileQuery("a:12b")).toEqual({ text: "a:12b" });
  });
});

describe("parseLineTarget", () => {
  it("reads a line, with a column after `:` or `,`", () => {
    expect(parseLineTarget("42")).toEqual({ line: 42 });
    expect(parseLineTarget(" 42:7 ")).toEqual({ line: 42, column: 7 });
    expect(parseLineTarget("42,7")).toEqual({ line: 42, column: 7 });
  });

  it("is null when it is not a line", () => {
    for (const input of ["", "  ", "0", "-3", "abc", "4a", "1.5", ":7", "42:"]) {
      expect(parseLineTarget(input)).toBeNull();
    }
  });

  it("drops a column 0", () => {
    expect(parseLineTarget("42:0")).toEqual({ line: 42 });
  });
});

describe("rankFiles", () => {
  const paths = [
    "src/components/deep/nested/MyApp.tsx",
    "src/App.tsx",
    "src/app/index.ts",
    "README.md",
    "src/studio/Appendix.ts",
  ];

  it("ranks exact basename, then its start, then inside it, then inside the path", () => {
    expect(rankFiles(paths, "app.tsx")).toEqual(["src/App.tsx", "src/components/deep/nested/MyApp.tsx"]);
    expect(rankFiles(paths, "app")).toEqual([
      "src/App.tsx",
      "src/studio/Appendix.ts",
      "src/components/deep/nested/MyApp.tsx",
      "src/app/index.ts",
    ]);
  });

  it("finds letters spread in order", () => {
    expect(rankFiles(["src/studio/Kanban.tsx", "src/App.tsx"], "apts")).toEqual(["src/App.tsx"]);
  });

  it("drops what does not match", () => {
    expect(rankFiles(paths, "zzz")).toEqual([]);
  });

  it("matches the whole path when the text holds a slash", () => {
    expect(rankFiles(paths, "src/app")).toEqual([
      "src/App.tsx",
      "src/app/index.ts",
      "src/studio/Appendix.ts",
      "src/components/deep/nested/MyApp.tsx",
    ]);
    expect(rankFiles(paths, "s/nested")).toEqual(["src/components/deep/nested/MyApp.tsx"]);
  });

  it("folds case and accents", () => {
    expect(rankFiles(["docs/Été.md", "docs/hiver.md"], "ETE")).toEqual(["docs/Été.md"]);
  });

  it("needs every term, best sum first", () => {
    expect(rankFiles(paths, "src index")).toEqual(["src/app/index.ts"]);
    expect(rankFiles(paths, "app studio")).toEqual(["src/studio/Appendix.ts"]);
  });

  it("breaks ties by shorter path, then order", () => {
    expect(rankFiles(["lib/long/a.ts", "b/a.ts", "c/a.ts"], "a.ts")).toEqual(["b/a.ts", "c/a.ts", "lib/long/a.ts"]);
  });

  it("returns the first `limit` without text, at most `limit` with", () => {
    const many = Array.from({ length: 80 }, (_, i) => `f${i}.ts`);
    expect(rankFiles(many, "  ")).toEqual(many.slice(0, 50));
    expect(rankFiles(many, "", 3)).toEqual(["f0.ts", "f1.ts", "f2.ts"]);
    expect(rankFiles(many, "f", 5)).toHaveLength(5);
  });
});
