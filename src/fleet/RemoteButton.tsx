import { Smartphone } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { messages, useMessages } from "@/i18n";
import { cn } from "@/lib/utils";
import { fleetMessages } from "./messages";
import { remoteErrorText, setRemoteControl, useRemoteLink, type RemoteLink } from "./remoteControl";

/** What the phone icon says. */
export function remoteLabel(link: RemoteLink | undefined, wanted: boolean, running: boolean): string {
  const t = messages(fleetMessages).remote;
  if (link?.state === "on") return t.on;
  if (link?.state === "connecting") return t.connecting;
  if (link?.state === "pending") return t.pending;
  if (link?.state === "error") return t.error(link.error ? remoteErrorText(link.error) : t.failed);
  if (wanted) return running ? t.requested : t.nextStart;
  return t.label;
}

/** The actions of the menu: while the state is an error, Remote Control may still be on, so cutting stays offered next to retrying. */
export function remoteActions(link: RemoteLink | undefined, wanted: boolean): ("turnOn" | "turnOff" | "retry")[] {
  if (link?.state === "error") return ["turnOff", "retry"];
  return [wanted ? "turnOff" : "turnOn"];
}

function run(nodeId: string, on: boolean) {
  void setRemoteControl(nodeId, on).then((result) => {
    if (result && "error" in result) toast.error(messages(fleetMessages).remote.error(result.error));
  });
}

/** Remote Control of one Claude session, in its header (spec maj §2). */
export function RemoteButton({ nodeId, wanted, running }: { nodeId: string; wanted: boolean; running: boolean }) {
  const t = useMessages(fleetMessages).remote;
  const link = useRemoteLink(nodeId);
  const label = remoteLabel(link, wanted, running);
  const url = link?.url;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={label}
          aria-label={label}
          data-remote={link?.state ?? (wanted ? "wanted" : "off")}
          className={cn(
            "grid size-5 place-items-center rounded hover:bg-ov-card [&_svg]:size-3.5",
            link?.state === "on" ? "text-ov-accent" : link?.state === "error" ? "text-ov-danger" : wanted ? "text-ov-text" : "text-ov-text-2 hover:text-ov-text",
            (link?.state === "connecting" || link?.state === "pending") && "animate-pulse",
          )}
        >
          <Smartphone />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {remoteActions(link, wanted).map((action) => (
          // Retrying repeats what failed: a cut that failed is cut again.
          <DropdownMenuItem key={action} onSelect={() => run(nodeId, action === "turnOn" || (action === "retry" && wanted))}>
            {t[action]}
          </DropdownMenuItem>
        ))}
        {url && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void navigator.clipboard.writeText(url).then(() => toast(t.linkCopied))}>{t.copyLink}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void openUrl(url)}>{t.openInBrowser}</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
