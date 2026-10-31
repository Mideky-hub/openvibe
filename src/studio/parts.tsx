import type { ComponentProps, ReactNode } from "react";
import { DialogContent } from "@/components/ui/dialog";
import { useMessages } from "@/i18n";
import type { FileSession, SessionState } from "./fileSession";
import { studioMessages } from "./messages";

/** The dialog's own classes center a small box; a studio fills the window, 16 px from its edges. */
export const FULL_WINDOW: ComponentProps<typeof DialogContent>["style"] = {
  display: "flex",
  flexDirection: "column",
  gap: 0,
  padding: 0,
  top: 16,
  left: 16,
  right: 16,
  bottom: 16,
  width: "auto",
  maxWidth: "none",
  translate: "none",
  overflow: "hidden",
};

export const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function Message({ children }: { children: ReactNode }) {
  return <p className="grid flex-1 place-items-center p-6 text-center text-xs text-ov-text-2">{children}</p>;
}

/** The disk no longer holds what the buffer knows: only the user decides (spec studio code §3). */
export function DiskBanner({ session, disk }: { session: FileSession; disk: NonNullable<SessionState["disk"]> }) {
  const t = useMessages(studioMessages);
  const { reload, overwrite, dropFile } = session.getState();
  const gone = disk.version === null;
  const action = "shrink-0 rounded-[6px] px-2 py-0.5 text-[12px] font-medium text-ov-text hover:bg-ov-hover";
  return (
    <div
      role="alert"
      className="flex shrink-0 items-center gap-2 border-b border-ov-line px-3 py-1.5 text-[12px] text-ov-text"
      style={{ backgroundColor: "color-mix(in srgb, var(--ov-wait) 16%, transparent)" }}
    >
      <span className="min-w-0 flex-1">{gone ? t.deletedOnDisk : t.changedOnDisk}</span>
      {gone ? (
        <>
          <button type="button" className={action} onClick={dropFile}>
            {t.drop}
          </button>
          <button type="button" className={action} onClick={() => void overwrite()}>
            {t.recreate}
          </button>
        </>
      ) : (
        <>
          <button type="button" className={action} onClick={() => void reload()}>
            {t.reload}
          </button>
          <button type="button" className={action} onClick={() => void overwrite()}>
            {t.overwrite}
          </button>
        </>
      )}
    </div>
  );
}
