import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

/** Colors are the identity's tokens, read by `var()`: the code follows Argile and Ivoire by itself (spec identité §4.2). */
const look = {
  "&": { height: "100%", color: "var(--ov-text)", backgroundColor: "transparent", fontSize: "12.5px" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "19px" },
  ".cm-content": { caretColor: "var(--ov-accent)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--ov-accent)" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "var(--ov-accent-soft)",
  },
  ".cm-activeLine": { backgroundColor: "var(--ov-hover)" },
  ".cm-activeLineGutter": { backgroundColor: "var(--ov-hover)", color: "var(--ov-text-2)" },
  ".cm-gutters": { backgroundColor: "transparent", color: "var(--ov-text-3)", borderRight: "1px solid var(--ov-line)" },
  ".cm-foldPlaceholder": { backgroundColor: "var(--ov-field)", border: "none", color: "var(--ov-text-2)" },
  ".cm-selectionMatch": { backgroundColor: "var(--ov-hover)" },
  ".cm-searchMatch": { backgroundColor: "var(--ov-accent-soft)", outline: "1px solid var(--ov-line)" },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "var(--ov-accent-soft)", outline: "1px solid var(--ov-accent)" },
  "&.cm-focused .cm-matchingBracket": { backgroundColor: "var(--ov-accent-soft)", outline: "none" },
  "&.cm-focused .cm-nonmatchingBracket": { color: "var(--ov-danger)", backgroundColor: "transparent" },
  ".cm-panels": { backgroundColor: "var(--ov-surface)", color: "var(--ov-text)" },
  ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--ov-line)" },
  ".cm-panels.cm-panels-bottom": { borderTop: "1px solid var(--ov-line)" },
  ".cm-textfield": { backgroundColor: "var(--ov-field)", border: "1px solid var(--ov-line)", borderRadius: "6px" },
  ".cm-button": { backgroundImage: "none", backgroundColor: "var(--ov-field)", border: "1px solid var(--ov-line)", borderRadius: "6px" },
  ".cm-tooltip": { backgroundColor: "var(--ov-surface)", border: "1px solid var(--ov-line)", borderRadius: "9px" },
  ".cm-tooltip-autocomplete ul li[aria-selected]": { backgroundColor: "var(--ov-accent-soft)", color: "var(--ov-text)" },
};

const syntax = HighlightStyle.define([
  { tag: [tags.keyword, tags.modifier, tags.controlKeyword, tags.operatorKeyword, tags.moduleKeyword], color: "var(--ov-accent)" },
  { tag: [tags.string, tags.special(tags.string), tags.regexp, tags.character], color: "var(--ov-ok)" },
  { tag: [tags.number, tags.bool, tags.null, tags.atom, tags.literal], color: "var(--ov-wait)" },
  { tag: [tags.typeName, tags.className, tags.namespace, tags.macroName], color: "var(--ov-wait)" },
  { tag: [tags.comment, tags.meta], color: "var(--ov-text-3)", fontStyle: "italic" },
  { tag: [tags.punctuation, tags.operator, tags.bracket], color: "var(--ov-text-2)" },
  { tag: [tags.definition(tags.function(tags.variableName)), tags.function(tags.variableName), tags.function(tags.propertyName)], color: "var(--ov-text)", fontWeight: "600" },
  { tag: [tags.tagName, tags.heading], color: "var(--ov-accent)", fontWeight: "600" },
  { tag: [tags.attributeName, tags.propertyName, tags.labelName], color: "var(--ov-text-2)" },
  { tag: [tags.link, tags.url], color: "var(--ov-ok)", textDecoration: "underline" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.invalid, color: "var(--ov-danger)" },
]);

/** `dark` picks CodeMirror's own defaults for what the tokens do not cover. */
export const editorTheme = (dark: boolean): Extension => [EditorView.theme(look, { dark }), syntaxHighlighting(syntax)];
