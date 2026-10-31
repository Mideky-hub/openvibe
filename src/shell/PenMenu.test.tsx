// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { canvasStore } from "@/canvas/canvasStore";
import { PenMenu } from "./PenMenu";

vi.mock("@excalidraw/excalidraw", () => ({}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => clearMocks());

it("opening the menu picks the pen without rewriting the colour and width shared with the shapes", async () => {
  mockIPC(() => undefined);
  const updateScene = vi.fn();
  const setActiveTool = vi.fn();
  canvasStore.setState({ api: { updateScene, setActiveTool, getAppState: () => ({ currentItemStrokeColor: "#123456", currentItemStrokeWidth: 4 }) } as unknown as ExcalidrawImperativeAPI });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<PenMenu active={false} />));
  await act(async () => host.querySelector<HTMLButtonElement>("button")!.click());
  expect(updateScene).not.toHaveBeenCalled();
  expect(setActiveTool).toHaveBeenCalledWith({ type: "freedraw" });
  await act(async () => root.unmount());
  host.remove();
});
