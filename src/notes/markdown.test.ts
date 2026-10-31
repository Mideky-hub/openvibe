import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown, safeUrl } from "./markdown";

describe("the blocks (spec notes §3)", () => {
  it("reads headings, paragraphs and rules", () => {
    expect(parseMarkdown("# Title\n\nFirst line\nsame paragraph\n\n---\n\n### Sub")).toEqual([
      { kind: "heading", level: 1, text: "Title" },
      { kind: "paragraph", text: "First line same paragraph" },
      { kind: "rule" },
      { kind: "heading", level: 3, text: "Sub" },
    ]);
  });

  it("reads lists, ordered or not, and tasks", () => {
    expect(parseMarkdown("- a\n* b\n\n1. c\n2. d\n\n- [ ] todo\n- [x] done")).toEqual([
      { kind: "list", ordered: false, items: [{ text: "a" }, { text: "b" }] },
      { kind: "list", ordered: true, items: [{ text: "c" }, { text: "d" }] },
      { kind: "list", ordered: false, items: [{ text: "todo", checked: false }, { text: "done", checked: true }] },
    ]);
  });

  it("keeps code as it is, and its language", () => {
    expect(parseMarkdown("```ts\nconst a = '**x**';\n\n# no\n```")).toEqual([{ kind: "code", language: "ts", text: "const a = '**x**';\n\n# no" }]);
  });

  it("closes a code block left open at the end", () => {
    expect(parseMarkdown("```\nx")).toEqual([{ kind: "code", language: "", text: "x" }]);
  });

  it("gathers a quote's lines", () => {
    expect(parseMarkdown("> a\n> b\n\nc")).toEqual([
      { kind: "quote", text: "a b" },
      { kind: "paragraph", text: "c" },
    ]);
  });

  it("takes CRLF notes", () => {
    expect(parseMarkdown("# a\r\n\r\nb\r\n")).toEqual([
      { kind: "heading", level: 1, text: "a" },
      { kind: "paragraph", text: "b" },
    ]);
  });

  it("leaves HTML as text", () => {
    expect(parseMarkdown("<script>alert(1)</script>")).toEqual([{ kind: "paragraph", text: "<script>alert(1)</script>" }]);
  });
});

describe("inside a line", () => {
  it("reads bold, italics, code and strikethrough", () => {
    expect(parseInline("a **b** *c* `d` ~~e~~")).toEqual([
      { kind: "text", text: "a " },
      { kind: "strong", text: "b" },
      { kind: "text", text: " " },
      { kind: "em", text: "c" },
      { kind: "text", text: " " },
      { kind: "code", text: "d" },
      { kind: "text", text: " " },
      { kind: "strike", text: "e" },
    ]);
  });

  it("reads wikilinks and their label", () => {
    expect(parseInline("see [[Auth]] and [[Deploy|there]]")).toEqual([
      { kind: "text", text: "see " },
      { kind: "wikilink", target: "Auth", label: "Auth" },
      { kind: "text", text: " and " },
      { kind: "wikilink", target: "Deploy", label: "there" },
    ]);
  });

  it("does not read a wikilink inside code", () => {
    expect(parseInline("`[[a]]`")).toEqual([{ kind: "code", text: "[[a]]" }]);
  });

  it("reads web links and bare addresses", () => {
    expect(parseInline("[site](https://a.dev/x) then https://b.dev")).toEqual([
      { kind: "link", url: "https://a.dev/x", label: "site" },
      { kind: "text", text: " then " },
      { kind: "link", url: "https://b.dev", label: "https://b.dev" },
    ]);
  });

  it("leaves a sentence's punctuation out of a bare address", () => {
    expect(parseInline("at https://a.dev/x, then https://b.dev.")).toEqual([
      { kind: "text", text: "at " },
      { kind: "link", url: "https://a.dev/x", label: "https://a.dev/x" },
      { kind: "text", text: ", then " },
      { kind: "link", url: "https://b.dev", label: "https://b.dev" },
      { kind: "text", text: "." },
    ]);
  });

  it("gives no link to what is not http or https", () => {
    expect(parseInline("[x](javascript:alert(1))")).toEqual([{ kind: "text", text: "[x](javascript:alert(1))" }]);
    expect(parseInline("[x](file:///C:/secret)")).toEqual([{ kind: "text", text: "[x](file:///C:/secret)" }]);
    expect(parseInline("[x](data:text/html,hi)")).toEqual([{ kind: "text", text: "[x](data:text/html,hi)" }]);
  });

  it("leaves a lone star alone", () => {
    expect(parseInline("2 * 3 * 4")).toEqual([{ kind: "text", text: "2 * 3 * 4" }]);
  });
});

describe("safe addresses", () => {
  it("takes http and https only", () => {
    expect(safeUrl("https://a.dev")).toBe("https://a.dev/");
    expect(safeUrl("HTTP://a.dev/x")).toBe("http://a.dev/x");
    expect(safeUrl("java\nscript:alert(1)")).toBeNull();
    expect(safeUrl("not a url")).toBeNull();
  });
});
