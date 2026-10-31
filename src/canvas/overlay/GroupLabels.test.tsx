// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { canvasStore, EMPTY_VIEW } from "../canvasStore";
import { GroupBackdrops } from "./GroupBackdrops";
import { GroupLabels } from "./GroupLabels";

vi.mock("@excalidraw/excalidraw", () => ({ CaptureUpdateAction: { IMMEDIATELY: "i" }, newElementWith: (e: object, patch: object) => ({ ...e, ...patch }) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const frame = (folded: boolean) => ({
  id: "g",
  name: "API",
  x: 0,
  y: 100,
  width: 800,
  height: 500,
  group: { role: "general", pantheon: "greek", ...(folded ? { folded } : {}) },
  memberIds: ["a", "b"],
});

it("folds on the label's chevron, keeps the counters, and unfolds with a click (spec replier un groupe §2)", async () => {
  mockIPC(() => undefined);
  let scene: Record<string, unknown>[] = [{ id: "g", type: "frame", customData: { openvibe: { kind: "group", role: "general", pantheon: "greek" } } }];
  const updateScene = vi.fn(({ elements }: { elements?: typeof scene }) => {
    if (elements) scene = elements;
  });
  canvasStore.setState({
    view: { ...EMPTY_VIEW, width: 1000, height: 800 },
    frames: [frame(false)] as never,
    api: { getSceneElementsIncludingDeleted: () => scene, updateScene } as unknown as ExcalidrawImperativeAPI,
  });
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <>
        <GroupBackdrops />
        <GroupLabels />
      </>,
    ),
  );
  expect(host.querySelectorAll("[data-backdrop]").length).toBe(1);
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Replier le groupe"]')!.click());
  expect((scene[0].customData as { openvibe: { folded?: boolean } }).openvibe.folded).toBe(true);
  // Folded: the frame is redrawn from the scene; the label stays, with its counters and the way back.
  await act(async () => canvasStore.setState({ frames: [frame(true)] as never }));
  expect(host.textContent).toContain("API");
  expect(host.textContent).toContain("2 · inactif");
  expect(host.querySelector('[aria-label="Déplier le groupe"]')).not.toBeNull();
  expect(host.querySelectorAll("[data-backdrop]").length).toBe(0);
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Déplier le groupe"]')!.click());
  expect((scene[0].customData as { openvibe: { folded?: boolean } }).openvibe.folded).toBeUndefined();
  await act(async () => root.unmount());
});
