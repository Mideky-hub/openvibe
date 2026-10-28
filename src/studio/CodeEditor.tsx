import { useEffect, useRef } from "react";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, defaultHighlightStyle, foldGutter, indentOnInput, syntaxHighlighting } from "@codemirror/language";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { oneDarkHighlightStyle } from "@codemirror/theme-one-dark";
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import type { Theme } from "@/app/theme";
import { languageFor } from "./languages";

/** The app's tokens, so the editor follows the theme; the highlighting is chosen per theme. */
function themeFor(theme: Theme): Extension {
  return [
    EditorView.theme(
      {
        "&": { height: "100%", backgroundColor: "transparent", color: "var(--ov-text)", fontSize: "12.5px" },
        ".cm-scroller": { fontFamily: "var(--font-mono, 'JetBrains Mono Variable', monospace)", lineHeight: "1.55" },
        ".cm-content": { caretColor: "var(--ov-accent)" },
        ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--ov-accent)" },
        "&.cm-focused": { outline: "none" },
        "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground": {
          backgroundColor: "var(--ov-selected)",
        },
        ".cm-gutters": { backgroundColor: "transparent", color: "var(--ov-text-3)", border: "none" },
        ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "var(--ov-hover)" },
        ".cm-panels": { backgroundColor: "var(--ov-surface)", color: "var(--ov-text)" },
      },
      { dark: theme === "dark" },
    ),
    syntaxHighlighting(theme === "dark" ? oneDarkHighlightStyle : defaultHighlightStyle),
  ];
}

interface CodeEditorProps {
  path: string;
  /** Read when the editor is made for the file; then the editor holds it. */
  initial: string;
  theme: Theme;
  onChange: (content: string) => void;
  onSave: () => void;
}

/** A CodeMirror 6 editor for one file; its undo history lives as long as it does. */
export function CodeEditor({ path, initial, theme, onChange, onSave }: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const themes = useRef(new Compartment());
  // The latest callbacks, without remaking the editor.
  const handlers = useRef({ onChange, onSave });
  handlers.current = { onChange, onSave };

  useEffect(() => {
    if (!host.current) return;
    const created = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initial,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          foldGutter(),
          history(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          keymap.of([
            {
              key: "Mod-s",
              preventDefault: true,
              run: () => {
                handlers.current.onSave();
                return true;
              },
            },
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap,
            indentWithTab,
          ]),
          languageFor(path),
          themes.current.of(themeFor(theme)),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) handlers.current.onChange(update.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = created;
    created.focus();
    return () => {
      created.destroy();
      view.current = null;
    };
    // The editor is made once per file: `initial` and `theme` are read here only.
  }, [path]);

  useEffect(() => {
    view.current?.dispatch({ effects: themes.current.reconfigure(themeFor(theme)) });
  }, [theme]);

  return <div ref={host} data-editor={path} className="h-full min-h-0 overflow-hidden" />;
}
