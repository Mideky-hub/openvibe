// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { requestUi } from "@/commands/uiRequests";
import { GroupMenu } from "@/fleet/GroupMenu";
import { closeGroupNotes, notesStore } from "./notesStore";

vi.mock("@excalidraw/excalidraw", () => ({}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => void mockIPC(() => undefined));
afterEach(() => {
  clearMocks();
  closeGroupNotes();
});

it("chooses a group's notes from its menu (spec notes §3)", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<GroupMenu groupId="g1" answersRequests />));
  await act(async () => requestUi({ kind: "groupMenu", id: "g1" }));
  const item = [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((el) => el.textContent === "Notes du groupe…");
  await act(async () => item!.click());
  expect(notesStore.getState().attaching).toBe("g1");
  await act(async () => root.unmount());
  host.remove();
});
