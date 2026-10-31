import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { closeCompletion } from "@codemirror/autocomplete";
import { indentWithTab } from "@codemirror/commands";
import { closeSearchPanel } from "@codemirror/search";
import { Compartment, EditorState, Transaction } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { useTheme } from "@/app/theme";
import { editorTheme } from "./editorTheme";
import type { Revision } from "./fileSession";
import { languageFor } from "./language";
import { smallestChange } from "./text";

export interface CodeEditorHandle {
  /** Closes what Échap closes in the editor, if anything is open. */
  escape: () => boolean;
}

interface Props {
  path: string;
  text: string;
  revision: Revision;
  onChange: (text: string) => void;
  ref?: Ref<CodeEditorHandle>;
}

/** CodeMirror, fed by the session: `revision` says when `text` comes from outside the editor. */
export function CodeEditor({ path, text, revision, onChange, ref }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const language = useRef(new Compartment());
  const theme = useRef(new Compartment());
  const dark = useTheme() === "dark";
  const notify = useRef(onChange);
  notify.current = onChange;

  useImperativeHandle(ref, () => ({
    escape: () => {
      const current = view.current;
      if (!current) return false;
      return closeCompletion(current) || closeSearchPanel(current);
    },
  }));

  useEffect(() => {
    const editor = new EditorView({ parent: host.current ?? undefined });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
  }, []);

  // A new document: its own history, its own language.
  useEffect(() => {
    const editor = view.current;
    if (!editor || revision.kind !== "open") return;
    const listener = EditorView.updateListener.of((update) => {
      if (update.docChanged && !update.transactions.some((tr) => tr.annotation(Transaction.remote))) notify.current(update.state.doc.toString());
    });
    editor.setState(
      EditorState.create({
        doc: text,
        extensions: [basicSetup, keymap.of([indentWithTab]), language.current.of([]), theme.current.of(editorTheme(dark)), listener],
      }),
    );
    let alive = true;
    void languageFor(path).then((extension) => {
      if (alive) editor.dispatch({ effects: language.current.reconfigure(extension) });
    });
    return () => {
      alive = false;
    };
    // `text` and `dark` are read at the opening; the effects below follow them.
  }, [revision.id, path]);

  // The same document, from the disk: the cursor stays, and undo does not bring the old text back as an edit.
  useEffect(() => {
    const editor = view.current;
    if (!editor || revision.kind !== "reload") return;
    const change = smallestChange(editor.state.doc.toString(), text);
    if (change) editor.dispatch({ changes: change, annotations: [Transaction.remote.of(true), Transaction.addToHistory.of(false)] });
  }, [revision.id]);

  useEffect(() => {
    view.current?.dispatch({ effects: theme.current.reconfigure(editorTheme(dark)) });
  }, [dark]);

  return <div ref={host} className="min-h-0 min-w-0 flex-1" />;
}
