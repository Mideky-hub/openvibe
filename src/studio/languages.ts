import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { LanguageDescription } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { extensionOf } from "./markdown";

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

/** The name CodeMirror knows the file by, whatever its folders are called (a `Dockerfile` has no extension). */
const nameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

/** Any other language CodeMirror knows, loaded on demand; null when the file has its highlighting already, or is plain text. */
export async function otherLanguageFor(path: string): Promise<Extension | null> {
  const known = languageFor(path);
  if (!Array.isArray(known) || known.length > 0) return null;
  const { languages } = await import("@codemirror/language-data");
  return (await LanguageDescription.matchFilename(languages, nameOf(path))?.load().catch(() => null)) ?? null;
}
