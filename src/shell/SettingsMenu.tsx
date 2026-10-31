import type { ReactElement } from "react";
import { ArrowDownCircle, Download, FileText, ImageDown, Info, LifeBuoy, Upload } from "lucide-react";
import { showAbout } from "@/app/about";
import { openLogDir } from "@/app/logs";
import { setNativeNotifications, useNativeNotifications } from "@/app/nativeNotifications";
import { checkForUpdate, setAutoUpdates, useUpdates } from "@/app/updates";
import { readThemeChoice, setThemeChoice, setTransparency, useThemeSettings } from "@/app/theme";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { langStore, readLanguageChoice, useMessages } from "@/i18n";
import { setLanguage } from "@/i18n/settings";
import { useStore } from "zustand";
import { shellMessages } from "./messages";
import { showTroubleshooting } from "./troubleshoot";
import { exportCurrentPng, exportCurrentScene, importIntoScene } from "./sceneActions";

/** Gear menu: what Excalidraw's hidden main menu used to offer (spec habillage §5.2), opened from `trigger`. */
export function SettingsMenu({
  trigger,
  side = "bottom",
  align = "end",
}: {
  trigger: ReactElement;
  side?: "bottom" | "left";
  align?: "start" | "end";
}) {
  const t = useMessages(shellMessages).settings;
  const { choice, transparency } = useThemeSettings();
  const languageChoice = useStore(langStore, (s) => s.choice);
  const autoUpdates = useUpdates((s) => s.auto);
  const nativeNotifications = useNativeNotifications();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent side={side} align={align} className="w-56">
        <DropdownMenuLabel className="ov-label">{t.theme}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={choice} onValueChange={(value) => void setThemeChoice(readThemeChoice(value))}>
          <DropdownMenuRadioItem value="system">{t.system}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="light">{t.light}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">{t.dark}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuCheckboxItem checked={transparency} onCheckedChange={(on) => void setTransparency(on === true)}>
          {t.transparency}
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="ov-label">{t.language}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={languageChoice} onValueChange={(value) => void setLanguage(readLanguageChoice(value))}>
          <DropdownMenuRadioItem value="system">{t.languageSystem}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="fr">Français</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={exportCurrentScene}>
          <Download /> {t.exportScene}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={importIntoScene}>
          <Upload /> {t.importScene}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={exportCurrentPng}>
          <ImageDown /> {t.exportPng}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked={nativeNotifications} onCheckedChange={(on) => void setNativeNotifications(on === true)}>
          {t.nativeNotifications}
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked={autoUpdates} onCheckedChange={(on) => void setAutoUpdates(on === true)}>
          {t.autoUpdates}
        </DropdownMenuCheckboxItem>
        <DropdownMenuItem onSelect={() => void checkForUpdate({ manual: true })}>
          <ArrowDownCircle /> {t.checkUpdates}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => void showAbout()}
        >
          <Info /> {t.about}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void openLogDir()}>
          <FileText /> {t.openLogs}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void showTroubleshooting()}>
          <LifeBuoy /> {t.troubleshoot}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
