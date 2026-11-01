import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useMessages } from "@/i18n";
import { studioMessages } from "./messages";

interface Props {
  /** The file with unsaved changes; null when nothing waits for an answer. */
  file: string | null;
  saving: boolean;
  onAnswer: (answer: "save" | "discard" | "cancel") => void;
}

/** Before a change of file, closing the studio or the window (spec studio code §6). */
export function UnsavedDialog({ file, saving, onAnswer }: Props) {
  const t = useMessages(studioMessages).unsaved;
  return (
    <Dialog open={file !== null} onOpenChange={(open) => !open && onAnswer("cancel")}>
      <DialogContent data-unsaved showCloseButton={false} className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t.title(file?.slice(file.lastIndexOf("/") + 1) ?? "")}</DialogTitle>
          <DialogDescription>{t.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onAnswer("cancel")}>
            {t.cancel}
          </Button>
          <Button variant="ghost" onClick={() => onAnswer("discard")}>
            {t.discard}
          </Button>
          <Button data-save disabled={saving} onClick={() => onAnswer("save")}>
            {t.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
