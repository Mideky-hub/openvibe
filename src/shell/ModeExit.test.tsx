// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { canvasStore, EMPTY_VIEW } from "@/canvas/canvasStore";
import { ModeExit } from "./ModeExit";

vi.mock("@excalidraw/excalidraw", () => ({}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("offers a way out of the zen and reading modes, and nothing otherwise", async () => {
  const updateScene = vi.fn();
  canvasStore.setState({ api: { updateScene } as unknown as ExcalidrawImperativeAPI, view: EMPTY_VIEW });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<ModeExit />));
  expect(host.querySelector("button")).toBeNull();
  await act(async () => canvasStore.setState({ view: { ...EMPTY_VIEW, mode: "reading" } }));
  const button = host.querySelector("button")!;
  expect(button.textContent).toContain("Quitter le mode lecture");
  await act(async () => button.click());
  expect(updateScene).toHaveBeenCalledWith({ appState: { zenModeEnabled: false, viewModeEnabled: false } });
  await act(async () => canvasStore.setState({ view: { ...EMPTY_VIEW, mode: "zen" } }));
  expect(host.querySelector("button")!.textContent).toContain("Quitter le mode zen");
  await act(async () => root.unmount());
  host.remove();
});
