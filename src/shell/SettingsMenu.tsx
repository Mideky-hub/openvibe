import type { ReactElement } from "react";
import { ArrowDownCircle, Bot, Download, FileText, ImageDown, Info, Keyboard, LifeBuoy, Timer, Upload } from "lucide-react";
import { showAbout } from "@/app/about";
import { ACTIVITY_THRESHOLDS, readDefaultAgent, setActivityThreshold, setDefaultAgent, useActivityThreshold } from "@/app/agentSettings";
import { useAgents } from "@/fleet/agentsStore";
import { AGENTS, AGENTS_WITHOUT_OPTIONS } from "@/fleet/catalog";
import { useDefaultAgentChoice } from "@/fleet/defaultAgentChoice";
import { formatDecimal } from "@/i18n/format";
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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { langStore, readLanguageChoice, useMessages } from "@/i18n";
import { setLanguage } from "@/i18n/settings";
import { useStore } from "zustand";
import { shellMessages } from "./messages";
import { showShortcuts } from "./shortcutsDialogState";
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
  const defaultAgentChoice = useDefaultAgentChoice();
  const threshold = useActivityThreshold();
  const agents = useAgents((s) => s.agents);
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
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Bot /> {t.defaultAgent}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-60">
            <DropdownMenuRadioGroup value={defaultAgentChoice} onValueChange={(value) => void setDefaultAgent(readDefaultAgent(value))}>
              <DropdownMenuRadioItem value="auto">{t.defaultAgentAuto}</DropdownMenuRadioItem>
              {AGENTS_WITHOUT_OPTIONS.map((id) => {
                // Shell is always there; another agent is chosen only once found on this computer.
                const found = id === "shell" || agents.some((agent) => agent.id === id && agent.available);
                return (
                  <DropdownMenuRadioItem key={id} value={id} disabled={!found} title={found ? undefined : t.notFound}>
                    {AGENTS[id].label}
                  </DropdownMenuRadioItem>
                );
              })}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Timer /> {t.activityThreshold}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-60">
            <DropdownMenuLabel className="text-xs font-normal text-ov-text-2">{t.activityThresholdHint}</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={String(threshold)} onValueChange={(value) => void setActivityThreshold(Number(value))}>
              {ACTIVITY_THRESHOLDS.map((ms) => (
                <DropdownMenuRadioItem key={ms} value={String(ms)}>
                  {t.seconds(formatDecimal(ms / 1000, ms % 1000 === 0 ? 0 : 1))}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem onSelect={showShortcuts}>
          <Keyboard /> {t.shortcuts}
        </DropdownMenuItem>
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
