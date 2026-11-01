import { useState } from "react";
import { useMessages } from "@/i18n";
import { closeWindow } from "@/shell/windowState";
import { studioMessages } from "./messages";
import { dropAllTabs, saveUnsavedTabs, studioStore, unsavedTabs, useStudio } from "./studioStore";
import { baseName } from "./tree";
import { UnsavedDialog } from "./UnsavedDialog";

/** The window wants to close over unsaved tabs, whichever view is on screen: save them, leave them, or stay. */
export function QuitPrompt() {
  const quitting = useStudio((s) => s.quitting);
  const t = useMessages(studioMessages);
  const [saving, setSaving] = useState(false);
  if (!quitting) return null;
  const unsaved = unsavedTabs();

  const answer = async (choice: "save" | "discard" | "cancel") => {
    if (choice === "save") {
      setSaving(true);
      const saved = await saveUnsavedTabs();
      setSaving(false);
      studioStore.setState({ quitting: false });
      if (!saved) return;
    } else {
      studioStore.setState({ quitting: false });
      if (choice === "cancel") return;
      dropAllTabs();
    }
    closeWindow();
  };

  const file = unsaved.length === 1 ? baseName(unsaved[0].path) : t.unsavedFiles(unsaved.length);
  return <UnsavedDialog file={file} saving={saving} onAnswer={(choice) => void answer(choice)} />;
}
