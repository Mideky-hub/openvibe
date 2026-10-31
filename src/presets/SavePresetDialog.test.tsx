// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { toast } from "sonner";
import { canvasStore } from "@/canvas/canvasStore";
import { requestUi } from "@/commands/uiRequests";
import { langStore } from "@/i18n";
import { nodesStore } from "@/store/nodes";
import { SavePresetDialog } from "./SavePresetDialog";
import { presetsStore } from "./store";
import type { TeamPreset } from "./model";

vi.mock("@excalidraw/excalidraw", () => ({}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), warning: vi.fn() }) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
const saved: { key: string; value: unknown }[] = [];

beforeEach(async () => {
  saved.length = 0;
  langStore.setState({ lang: "fr" });
  vi.clearAllMocks();
  mockIPC((cmd, args) => {
    if (cmd === "set_setting") saved.push(args as { key: string; value: unknown });
    return null;
  });
  await nodesStore.getState().create("isis", {
    workspaceId: "w1",
    kind: "terminal",
    payload: { title: "Isis", name: "Isis", agent: "claude", cwd: "C:/code", shell: "default", command: "" },
  });
  presetsStore.setState({ presets: [], loaded: true });
  canvasStore.setState({
    api: { getSceneElements: () => [] } as never,
    frames: [{ id: "g", name: "Backend", x: 0, y: 0, width: 10, height: 10, group: { role: "backend", pantheon: "egyptian" }, memberIds: ["isis"] }],
    links: {},
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<SavePresetDialog />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  clearMocks();
});

const field = () => document.querySelector<HTMLInputElement>('input[aria-label="Nom du preset"]')!;
const type = async (value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field(), value);
    field().dispatchEvent(new Event("input", { bubbles: true }));
  });
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === label)!;

it("stays closed until the palette asks, then opens on a name field", async () => {
  expect(field()).toBeNull();
  await act(async () => requestUi({ kind: "savePreset" }));
  expect(field()).not.toBeNull();
});

it("saves the team on screen under the name typed, on the button and on Enter", async () => {
  await act(async () => requestUi({ kind: "savePreset" }));
  await type("  Dev HQ ");
  await act(async () => button("Enregistrer").click());
  await vi.waitFor(() => expect(presetsStore.getState().presets).toHaveLength(1));
  const [preset] = presetsStore.getState().presets as TeamPreset[];
  expect(preset).toMatchObject({ name: "Dev HQ", groups: [{ name: "Backend", role: "backend", agents: ["claude"] }] });
  expect(saved[0].key).toBe("presets.teams");
  expect(toast).toHaveBeenCalledWith("Preset « Dev HQ » enregistré");
  expect(field()).toBeNull();
});

it("does not save an empty name, does not close on the Enter that ends an IME composition, and says when a name is taken", async () => {
  presetsStore.setState({ presets: [{ id: "1", name: "Dev HQ", savedAt: 1, groups: [{ name: "G", role: "docs", agents: ["claude"], x: 0, y: 0 }], orchestrators: [] }] });
  await act(async () => requestUi({ kind: "savePreset" }));
  expect(button("Enregistrer").disabled).toBe(true);
  await type("dev hq");
  expect(document.body.textContent).toContain("Remplace le preset « Dev HQ »");
  await act(async () => {
    field().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, isComposing: true }));
  });
  expect(saved).toHaveLength(0);
  await act(async () => {
    field().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  });
  await vi.waitFor(() => expect(saved).toHaveLength(1));
  expect(presetsStore.getState().presets).toHaveLength(1);
});

it("says there is nothing to save when no group holds an agent any more", async () => {
  canvasStore.setState({ frames: [] });
  await act(async () => requestUi({ kind: "savePreset" }));
  await type("X");
  await act(async () => button("Enregistrer").click());
  expect(toast.error).toHaveBeenCalledWith("Aucun groupe avec des agents à enregistrer");
  expect(saved).toHaveLength(0);
});
