// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import App from "./App";

vi.mock("@/app/boot", () => ({ boot: () => Promise.reject(new Error("local server refused")) }));
// The canvas and the palette pull Excalidraw, which does not load under Vitest.
vi.mock("@/shell/ProjectView", () => ({ ProjectView: () => null }));
vi.mock("@/home/HomeScreen", () => ({ HomeScreen: () => null }));
vi.mock("@/commands/Palette", () => ({ Palette: () => null }));
vi.mock("@/shell/ShortcutsDialog", () => ({ ShortcutsDialog: () => null }));
vi.mock("@/accounts/AccountsDialog", () => ({ AccountsDialog: () => null }));
vi.mock("@/loops/LoopsDialog", () => ({ LoopsDialog: () => null }));
vi.mock("@/loops/LoopsIndicator", () => ({ LoopsIndicator: () => null }));
vi.mock("@/presets/SavePresetDialog", () => ({ SavePresetDialog: () => null }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("says the start failed instead of loading forever", async () => {
  mockWindows("main");
  mockIPC(() => undefined);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<App />));
  expect(host.textContent).toContain("démarrage interrompu (local server refused)");
  expect(host.textContent).not.toContain("Chargement…");
  await act(async () => root.unmount());
});
