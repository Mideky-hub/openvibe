/// <reference types="node" />
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** `src/`, found from this file with Node's own path tools: a DOM test environment replaces the global `URL`. */
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Test helper: a source file of `src/`, as text. Vitest does not load
 * stylesheets, not even with `?raw`, so tests read them from disk.
 */
export function readSource(pathInSrc: string): string {
  return readFileSync(join(SRC, pathInSrc), "utf8");
}

/** Test helper: every `.ts`, `.tsx` and `.css` file of `src/` but the tests, by path, as text. */
export function sourceFiles(): Record<string, string> {
  const files = readdirSync(SRC, { recursive: true, encoding: "utf8" })
    .map((path) => path.replace(/\\/g, "/"))
    .filter((path) => /\.(ts|tsx|css)$/.test(path) && !/\.test\.tsx?$/.test(path));
  return Object.fromEntries(files.map((path) => [path, readFileSync(join(SRC, path), "utf8")]));
}

/**
 * Test helper: the custom properties declared by the CSS rule whose selector
 * list is exactly `selector`, e.g. `:root[data-theme="light"]`. A selector
 * found twice is an error unless `within` names the at-rule (`@media (...)`)
 * whose body is searched: a test must not depend on the order of the blocks.
 */
export function cssBlock(css: string, selector: string, within?: string): Record<string, string> {
  let scope = css;
  if (within) {
    const at = css.indexOf(`${within} {`);
    if (at < 0) throw new Error(`no at-rule "${within}"`);
    let depth = 0;
    let end = at;
    for (let i = css.indexOf("{", at); i < css.length; i++) {
      if (css[i] === "{") depth++;
      if (css[i] === "}" && --depth === 0) {
        end = i;
        break;
      }
    }
    scope = css.slice(css.indexOf("{", at) + 1, end);
  }
  // Comments blanked, same length: indexes still point into `scope`.
  const bare = scope.replace(/\/\*[\s\S]*?\*\//g, (comment) => " ".repeat(comment.length));
  // A rule starts after `{`, `}` or `;`: `:root[data-theme="light"] {` also ends a longer selector list.
  const starts = [...bare.matchAll(/(?<=^|[}{;])\s*([^{};]+?)\s*\{/g)].filter((m) => m[1] === selector);
  if (starts.length === 0) throw new Error(`no rule "${selector}"`);
  if (!within && starts.length > 1) throw new Error(`rule "${selector}" found more than once: name its at-rule`);
  const head = starts[0].index! + starts[0][0].indexOf(selector);
  const open = scope.indexOf("{", head);
  const body = scope.slice(open + 1, scope.indexOf("}", open));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}
