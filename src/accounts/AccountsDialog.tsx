import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { launchLogin } from "@/fleet/quickActions";
import { useMessages } from "@/i18n";
import { accountsStore, addProfile, removeProfile, useAccounts, activateProfile } from "./store";
import { accountsMessages } from "./messages";

/** « Comptes Claude » (spec comptes §6): profiles are a name and a folder; the login happens in Claude. */
export function AccountsDialog() {
  const t = useMessages(accountsMessages);
  const { open, profiles, active } = useAccounts((s) => s);
  const [name, setName] = useState("");
  const [folder, setFolder] = useState("");

  const guarded = (run: () => Promise<unknown>) => () =>
    run().catch((error: unknown) => toast.error(t.failed(error instanceof Error ? error.message : String(error))));
  const add = guarded(async () => {
    await addProfile(name, folder);
    setName("");
    setFolder("");
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !next && accountsStore.setState({ open: false })}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>{t.description}</DialogDescription>
        </DialogHeader>
        <ul className="grid gap-1.5 text-[13px]">
          <Row name={t.defaultName} folder={t.defaultHint} active={active === null} activeLabel={t.active}>
            {active !== null && (
              <Button size="sm" variant="ghost" onClick={guarded(() => activateProfile(null))}>
                {t.use}
              </Button>
            )}
          </Row>
          {profiles.map((p) => (
            <Row key={p.id} name={p.name} folder={p.configDir} active={active === p.id} activeLabel={t.active}>
              {active !== p.id && (
                <Button size="sm" variant="ghost" onClick={guarded(() => activateProfile(p.id))}>
                  {t.use}
                </Button>
              )}
              <Button size="sm" variant="ghost" title={t.loginHint} onClick={guarded(() => launchLogin(p.id).then((placed) => !placed && toast(t.noProject)))}>
                {t.login}
              </Button>
              <Button size="sm" variant="ghost" title={t.removeHint} onClick={guarded(() => removeProfile(p.id))}>
                {t.remove}
              </Button>
            </Row>
          ))}
        </ul>
        <form
          className="grid gap-2 border-t border-ov-line pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <p className="ov-label">{t.addTitle}</p>
          <Input aria-label={t.nameLabel} placeholder={t.namePlaceholder} value={name} onChange={(e) => setName(e.target.value)} />
          <Input aria-label={t.folderLabel} placeholder={t.folderPlaceholder} value={folder} onChange={(e) => setFolder(e.target.value)} />
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={!name.trim() || !folder.trim()}>
              {t.add}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Row(props: { name: string; folder: string; active: boolean; activeLabel: string; children?: React.ReactNode }) {
  return (
    <li data-profile={props.name} className="flex items-center gap-2 rounded-md bg-ov-card px-2.5 py-1.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-ov-text">
          {props.name}
          {props.active && <span className="ml-2 rounded-full bg-ov-accent-soft px-1.5 py-0.5 text-[10px] text-ov-accent">{props.activeLabel}</span>}
        </p>
        <p className="truncate font-mono text-[11px] text-ov-text-2">{props.folder}</p>
      </div>
      {props.children}
    </li>
  );
}
