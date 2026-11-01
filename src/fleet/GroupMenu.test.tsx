// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { mockIPC } from "@tauri-apps/api/mocks";
import { canvasStore } from "@/canvas/canvasStore";
import { GroupMenu } from "./GroupMenu";
import { setGroupFolded } from "./groups";

vi.mock("@excalidraw/excalidraw", () => ({}));
vi.mock("./groups", async (importOriginal) => ({ ...(await importOriginal<typeof import("./groups")>()), setGroupFolded: vi.fn() }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const frame = (folded: boolean) => ({ id: "g", name: "G", x: 0, y: 0, width: 1, height: 1, group: { role: "general", pantheon: "greek", ...(folded ? { folded } : {}) }, memberIds: [] });

it("offers to fold an unfolded group and to unfold a folded one", async () => {
  mockIPC(() => []);
  canvasStore.setState({ frames: [frame(false)] as never });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<GroupMenu groupId="g" />));
  await act(async () => host.querySelector("button")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  const item = (text: string) => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((i) => i.textContent === text);
  await act(async () => item("Replier le groupe")!.click());
  expect(setGroupFolded).toHaveBeenLastCalledWith("g", true);
  await act(async () => canvasStore.setState({ frames: [frame(true)] as never }));
  await act(async () => host.querySelector("button")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  await act(async () => item("Déplier le groupe")!.click());
  expect(setGroupFolded).toHaveBeenLastCalledWith("g", false);
  await act(async () => root.unmount());
  document.body.replaceChildren();
});
