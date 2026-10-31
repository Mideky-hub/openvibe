import { LanguageDescription } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import type { Extension } from "@codemirror/state";

const describe = (path: string) => LanguageDescription.matchFilename(languages, path.slice(path.lastIndexOf("/") + 1));

export const languageNameFor = (path: string) => describe(path)?.name ?? null;

/** The file's language, loaded on demand; plain text when there is none or it does not load. */
export async function languageFor(path: string): Promise<Extension> {
  return (await describe(path)?.load().catch(() => null)) ?? [];
}
