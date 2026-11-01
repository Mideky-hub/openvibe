// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { renderMarkdown, safeHref } from "./markdown";

/** Renders Markdown to an HTML string for assertions. */
const html = (src: string) => renderToStaticMarkup(<>{renderMarkdown(src)}</>);

describe("renderMarkdown", () => {
  it("renders headings of every level", () => {
    const out = html("# One\n### Three\n###### Six");
    expect(out).toContain(">One</h1>");
    expect(out).toContain(">Three</h3>");
    expect(out).toContain(">Six</h6>");
  });

  it("renders paragraphs separated by blank lines", () => {
    const out = html("first line\nsame para\n\nsecond");
    expect(out).toContain("<p>first line same para</p>");
    expect(out).toContain("<p>second</p>");
  });

  it("renders unordered and ordered lists", () => {
    const out = html("- a\n* b\n+ c\n\n1. one\n2. two");
    expect(out).toMatch(/<ul[^>]*><li>a<\/li><li>b<\/li><li>c<\/li><\/ul>/);
    expect(out).toMatch(/<ol[^>]*><li>one<\/li><li>two<\/li><\/ol>/);
  });

  it("renders fenced code blocks verbatim", () => {
    const out = html("```ts\nconst a = **b**;\n<b>x</b>\n```");
    expect(out).toContain("<pre");
    expect(out).toContain('data-lang="ts"');
    expect(out).toContain("const a = **b**;\n&lt;b&gt;x&lt;/b&gt;");
    expect(out).not.toContain("<strong>");
  });

  it("renders inline formatting", () => {
    const out = html("**bold** *it* _it2_ `code` [site](https://x.dev)");
    expect(out).toContain("<strong>bold</strong>");
    expect(out).toContain("<em>it</em>");
    expect(out).toContain("<em>it2</em>");
    expect(out).toMatch(/<code[^>]*>code<\/code>/);
    expect(out).toContain('href="https://x.dev"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noreferrer noopener"');
  });

  it("renders blockquotes, rules and tables", () => {
    const out = html("> quoted\n\n---\n\n| a | b |\n|---|---|\n| 1 | 2 |");
    expect(out).toMatch(/<blockquote[^>]*>.*quoted.*<\/blockquote>/);
    expect(out).toContain("<hr");
    expect(out).toMatch(/<th[^>]*>a<\/th>/);
    expect(out).toMatch(/<td[^>]*>2<\/td>/);
  });

  it("escapes raw script tags", () => {
    const out = html("<script>alert(1)</script>");
    expect(out).not.toContain("<script");
    expect(out).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("escapes raw img tags", () => {
    const out = html("<img src=x onerror=alert(1)>");
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("drops javascript: links", () => {
    const out = html("[x](javascript:alert(1)) [y]( JavaScript:alert(1)) [z](data:text/html,hi)");
    expect(out).not.toContain("href");
    expect(out).toContain("x");
  });

  it("renders images as text only", () => {
    const out = html("![logo](https://x.dev/a.png)");
    expect(out).not.toContain("<img");
    expect(out).toContain("[logo]");
  });
});

describe("safeHref", () => {
  it("allows http, https, mailto and relative links", () => {
    expect(safeHref("https://a.b")).toBe("https://a.b");
    expect(safeHref("mailto:a@b.c")).toBe("mailto:a@b.c");
    expect(safeHref("#anchor")).toBe("#anchor");
    expect(safeHref("docs/readme.md")).toBe("docs/readme.md");
  });

  it("rejects dangerous schemes", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref(" JAVA\tSCRIPT:alert(1)")).toBeNull();
    expect(safeHref("vbscript:x")).toBeNull();
    expect(safeHref("data:text/html,x")).toBeNull();
  });
});
