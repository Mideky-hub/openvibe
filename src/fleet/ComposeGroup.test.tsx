// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { requestUi } from "@/commands/uiRequests";
import { langStore } from "@/i18n";
import { ComposeGroup } from "./ComposeGroup";
import { launchGroup } from "./groups";

vi.mock("@excalidraw/excalidraw", () => ({}));
vi.mock("./groups", () => ({ launchGroup: vi.fn(() => Promise.resolve(null)) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  mockIPC((cmd) => (cmd.startsWith("list_") ? [] : undefined));
  vi.mocked(launchGroup).mockClear();
  langStore.setState({ lang: "fr" });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<ComposeGroup answersRequests trigger={<button type="button">+</button>} />));
  await act(async () => requestUi({ kind: "composeGroup" }));
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  clearMocks();
  langStore.setState({ lang: "fr" });
});

const field = () => document.querySelector<HTMLInputElement>('input[aria-label="Nom du groupe"], input[aria-label="Group name"]')!;

it("launches the group on Enter in the name field (plan B1)", async () => {
  await act(async () => field().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
  expect(launchGroup).toHaveBeenCalledWith(expect.objectContaining({ role: "general" }));
});

it("does not launch on the Enter that ends an IME composition", async () => {
  await act(async () => field().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, isComposing: true })));
  expect(launchGroup).not.toHaveBeenCalled();
});

it("shows the role's name in the language of the moment until the user types one (R5a)", async () => {
  const before = field().value;
  await act(async () => langStore.setState({ lang: "en" }));
  expect(field().value).not.toBe(before);
  await act(async () => langStore.setState({ lang: "fr" }));
  expect(field().value).toBe(before);
});
