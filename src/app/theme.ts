import { toast } from "sonner";
import { createStore, useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { messages } from "@/i18n";
import { getSetting, setSetting } from "@/ipc/db";
import { appMessages } from "./messages";

/** Spec identité §4.5. */
export type ThemeChoice = "system" | "light" | "dark";
export type Theme = "light" | "dark";

export const THEME_KEY = "ui.theme";
export const TRANSPARENCY_KEY = "ui.transparency";

/** What public/first-paint.js reads before the first paint (the settings live in SQLite, read later). */
function mirror() {
  const { choice, transparency } = themeStore.getState();
  try {
    localStorage.setItem("ov.theme", choice);
    localStorage.setItem("ov.transparency", transparency ? "on" : "off");
  } catch {
    // No storage: the next start paints in Windows' theme until the settings are read.
  }
}

/** Anything but light or dark (missing, corrupted) means System. */
export function readThemeChoice(raw: unknown): ThemeChoice {
  return raw === "light" || raw === "dark" ? raw : "system";
}

/** Transparency stays on unless it was explicitly turned off. */
export function readTransparency(raw: unknown): boolean {
  return raw !== "off";
}

export function resolveTheme(choice: ThemeChoice, systemDark: boolean): Theme {
  if (choice !== "system") return choice;
  return systemDark ? "dark" : "light";
}

interface ThemeState {
  choice: ThemeChoice;
  /** Windows' light or dark mode for apps, as the WebView reports it. */
  systemDark: boolean;
  transparency: boolean;
}

export const themeStore = createStore<ThemeState>()(() => ({ choice: "system", systemDark: true, transparency: true }));

export function currentTheme(): Theme {
  const { choice, systemDark } = themeStore.getState();
  return resolveTheme(choice, systemDark);
}

export function useTheme(): Theme {
  return useStore(themeStore, (s) => resolveTheme(s.choice, s.systemDark));
}

export function useThemeSettings(): { choice: ThemeChoice; transparency: boolean } {
  return useStore(themeStore, useShallow((s) => ({ choice: s.choice, transparency: s.transparency })));
}

/**
 * The theme on the root element: the tokens (`data-theme`), the WebView's own
 * scrollbars and form controls (`color-scheme`), the opaque fallback
 * (`data-transparency`). The window's Tauri theme is left alone: forcing it
 * would change what the WebView reports for `prefers-color-scheme`.
 */
export function applyTheme(root: HTMLElement = document.documentElement) {
  const { transparency } = themeStore.getState();
  const theme = currentTheme();
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  if (transparency) delete root.dataset.transparency;
  else root.dataset.transparency = "off";
}

/** Windows' color scheme, as `matchMedia("(prefers-color-scheme: dark)")` gives it. */
export interface SystemScheme {
  matches: boolean;
  addEventListener(type: "change", listener: (event: { matches: boolean }) => void): void;
}

/** Before the first render: follows Windows, live, until the saved choice is read. */
export function startTheme(scheme: SystemScheme) {
  themeStore.setState({ systemDark: scheme.matches });
  scheme.addEventListener("change", (event) => themeStore.setState({ systemDark: event.matches }));
  themeStore.subscribe(() => applyTheme());
  applyTheme();
}

/** At boot. Unreadable or unreachable settings keep the defaults, silently (spec identité §9). */
export async function loadThemeSettings() {
  try {
    const [choice, transparency] = await Promise.all([getSetting<unknown>(THEME_KEY), getSetting<unknown>(TRANSPARENCY_KEY)]);
    themeStore.setState({ choice: readThemeChoice(choice), transparency: readTransparency(transparency) });
    mirror();
  } catch (error) {
    console.warn(`theme settings: ${String(error)}`);
  }
}

async function save(key: string, value: string) {
  await setSetting(key, value).catch((error: unknown) => {
    toast.error(messages(appMessages).settingNotSaved(String(error)));
  });
}

/** Applies at once; the choice stays for the session even if it cannot be saved. */
export async function setThemeChoice(choice: ThemeChoice) {
  themeStore.setState({ choice });
  mirror();
  await save(THEME_KEY, choice);
}

export async function setTransparency(on: boolean) {
  themeStore.setState({ transparency: on });
  mirror();
  await save(TRANSPARENCY_KEY, on ? "on" : "off");
}
