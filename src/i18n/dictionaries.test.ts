import { expect, it } from "vitest";
import type { Dictionary } from "./index";

/** Every `messages.ts` of the app: a dictionary is a `{ fr, en }` pair. */
const modules = import.meta.glob<Record<string, unknown>>("../**/messages.ts", { eager: true });

const dictionaries: { where: string; fr: unknown; en: unknown }[] = [];
for (const [path, exports] of Object.entries(modules)) {
  for (const [name, value] of Object.entries(exports)) {
    const dict = value as Partial<Dictionary<unknown>> | null;
    if (dict && typeof dict === "object" && "fr" in dict && "en" in dict) dictionaries.push({ where: `${path}#${name}`, fr: dict.fr, en: dict.en });
  }
}

/** Words that are the same in both languages on purpose. */
const SAME = /^(Interface en français|Interface in English|Claude Code, Codex, Gemini CLI…|Session \(5 h\)|OpenVibe|Remote Control|Claude Code|Claude|Codex|Gemini CLI|Code Studio|Git|Shell|Ollama|Aider|Cursor|Tokens?|Notes?|Description|Support|Local|Non|Offline|Total|Extra|Ok|OK|Plan|Code|Image|Source|Module|Format|Description|Version|Original|Standard|Mode|Photo|Index|Serveur|Terminal|Concepts|Backend|Frontend|[A-Za-z0-9 ./:×·…→←%+-]{0,3})$/;

type Path = string;
function walk(fr: unknown, en: unknown, path: Path, problems: string[]) {
  if (typeof fr === "function" || typeof en === "function") {
    if (typeof fr !== typeof en) {
      problems.push(`${path}: function in one language only`);
      return;
    }
    if ((fr as () => unknown).length !== (en as () => unknown).length) problems.push(`${path}: not the same parameters`);
    const attempts: unknown[][] = [[2], ["Aa"], [["Aa", "Bb"]], [2, 2], ["Aa", "Bb"], ["Aa", 2], [2, "Aa"], ["Aa", "Bb", "Cc"], [2, 3, 4], ["Aa", 2, 3], [["Aa"], ["Bb"]]];
    const run = (f: unknown, args: unknown[]) => {
      try {
        const out = (f as (...a: unknown[]) => unknown)(...args);
        return typeof out === "string" || typeof out === "object" ? out : undefined;
      } catch {
        return undefined;
      }
    };
    const worked = attempts.find((args) => run(fr, args) !== undefined && run(en, args) !== undefined);
    if (!worked) {
      problems.push(`${path}: cannot be called with sample arguments`);
      return;
    }
    const [a, b] = [run(fr, worked), run(en, worked)];
    if (typeof a === "string" && (a.trim() === "" || typeof b !== "string" || b.trim() === "")) problems.push(`${path}: empty text`);
    return;
  }
  if (typeof fr === "string" || typeof en === "string") {
    if (typeof fr !== "string" || typeof en !== "string") problems.push(`${path}: text in one language only`);
    else if (fr.trim() === "" && en.trim() !== "") problems.push(`${path}: empty in French`);
    else if (en.trim() === "" && fr.trim() !== "") problems.push(`${path}: empty in English`);
    else if (fr === en && !SAME.test(fr) && /\s/.test(fr.trim()) && /[a-zA-ZÀ-ÿ]{4,}/.test(fr)) problems.push(`${path}: the same text in both languages: "${fr}"`);
    return;
  }
  if (Array.isArray(fr) || Array.isArray(en)) {
    // Search keywords are each language's own words, as many as it needs.
    if (/[kK]eywords$/.test(path)) return;
    if (!Array.isArray(fr) || !Array.isArray(en) || fr.length !== en.length) problems.push(`${path}: lists of different lengths`);
    else fr.forEach((item, i) => walk(item, en[i], `${path}[${i}]`, problems));
    return;
  }
  if (fr && en && typeof fr === "object" && typeof en === "object") {
    const keys = new Set([...Object.keys(fr), ...Object.keys(en)]);
    for (const key of keys) {
      if (!(key in fr)) problems.push(`${path}.${key}: missing in French`);
      else if (!(key in en)) problems.push(`${path}.${key}: missing in English`);
      else walk((fr as Record<string, unknown>)[key], (en as Record<string, unknown>)[key], `${path}.${key}`, problems);
    }
  }
}

it("finds the dictionaries of the app", () => {
  expect(dictionaries.length).toBeGreaterThanOrEqual(15);
  const names = dictionaries.map((d) => d.where);
  for (const area of ["studio/messages.ts", "notes/messages.ts", "presets/messages.ts", "loops/messages.ts", "fleet/messages.ts", "shell/messages.ts", "usage/messages.ts"]) {
    expect(names.some((n) => n.includes(area)), area).toBe(true);
  }
});

it.each(dictionaries.map((d) => [d.where, d] as const))("has every text in French and in English, alike in shape: %s", (_where, d) => {
  const problems: string[] = [];
  walk(d.fr, d.en, "", problems);
  expect(problems).toEqual([]);
});
