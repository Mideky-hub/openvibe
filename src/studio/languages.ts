import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import type { Extension } from "@codemirror/state";

/** The file's extension, lower case, without the dot; "" when it has none. */
export function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export const isMarkdown = (path: string) => ["md", "markdown", "mdx"].includes(extensionOf(path));

/** The highlighting for the file's extension; none for an unknown one. */
export function languageFor(path: string): Extension {
  switch (extensionOf(path)) {
    case "js":
    case "mjs":
    case "cjs":
      return javascript();
    case "jsx":
      return javascript({ jsx: true });
    case "ts":
    case "mts":
    case "cts":
      return javascript({ typescript: true });
    case "tsx":
      return javascript({ typescript: true, jsx: true });
    case "json":
    case "jsonc":
      return json();
    case "css":
      return css();
    case "html":
    case "htm":
    case "svg":
      return html();
    case "md":
    case "markdown":
    case "mdx":
      return markdown();
    case "rs":
      return rust();
    case "py":
      return python();
    default:
      return [];
  }
}
