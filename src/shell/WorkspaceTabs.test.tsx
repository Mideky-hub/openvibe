// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { nodesStore } from "@/store/nodes";
import { terminalStatusStore } from "@/store/terminalStatus";
import { requestUi } from "@/commands/uiRequests";
import { workspacesStore } from "@/store/workspaces";
import { TABS_HEIGHT } from "./layout";
import { WorkspaceTabs } from "./WorkspaceTabs";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let calls: string[];
let host: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  calls = [];
  // The confirmation is answered "no": nothing is deleted.
  mockIPC((cmd) => {
    calls.push(cmd);
    return cmd.startsWith("plugin:dialog|") ? false : undefined;
  });
  workspacesStore.setState({
    workspaces: [
      { id: "w1", projectId: "p1", name: "Workspace 1", position: 0, pantheon: null },
      { id: "w2", projectId: "p1", name: "Backend", position: 1, pantheon: null },
    ],
    activeId: "w2",
  } as never);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<WorkspaceTabs />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  clearMocks();
});

const row = () => host.firstElementChild as HTMLElement;
const tabs = () => [...row().querySelectorAll<HTMLElement>("[data-tab]")];

it("shows the workspaces as browser tabs, then +, then empty space that moves the window (spec identité §5.2)", () => {
  expect(row().style.height).toBe(`${TABS_HEIGHT}px`);
  expect(tabs().map((t) => t.dataset.tab)).toEqual(["w1", "w2"]);
  expect(tabs()[1].dataset.active).toBe("true");
  expect(tabs()[1].className).toContain("bg-ov-tab-on");
  expect(row().querySelector('[aria-label="Nouveau workspace"]')).not.toBeNull();
  // The scrolling row itself never drags: a press on it would move the window instead of scrolling.
  expect(row().hasAttribute("data-tauri-drag-region")).toBe(false);
  const spacer = row().lastElementChild as HTMLElement;
  expect(spacer.getAttribute("data-tauri-drag-region")).toBe("");
  expect(spacer.querySelector("button")).toBeNull();
});

it("scrolls the tabs sideways with the wheel, without a scrollbar eating their height", async () => {
  expect(row().className).toContain("[scrollbar-width:none]");
  expect(row().className).toContain("overflow-y-hidden");
  await act(async () => row().dispatchEvent(new WheelEvent("wheel", { deltaY: 120, bubbles: true })));
  expect(row().scrollLeft).toBe(120);
});

it("selects a tab from anywhere on it, its badge included", async () => {
  // An agent running in Workspace 1 gives its tab a badge.
  await act(async () => {
    await nodesStore.getState().create("t1", {
      workspaceId: "w1",
      kind: "terminal",
      payload: { title: "Ada", name: "Ada", agent: "claude", cwd: "C:/code", shell: "default", command: "" },
    });
    terminalStatusStore.getState().set("t1", { state: "running" });
  });
  const badge = tabs()[0].querySelector<HTMLElement>("[data-badge]")!;
  expect(badge.textContent).toBe("1");
  await act(async () => badge.click());
  expect(workspacesStore.getState().activeId).toBe("w1");
  // The select button spans the whole tab, padding included.
  expect(badge.closest("button")!.className).toContain("self-stretch");
});

it("deletes a workspace from its × after the existing confirmation, never the last one", async () => {
  const close = tabs()[0].querySelector<HTMLButtonElement>('[aria-label="Supprimer le workspace"]')!;
  expect(close.className).toContain("group-hover:opacity-100");
  await act(async () => close.click());
  expect(calls.some((cmd) => cmd.startsWith("plugin:dialog|"))).toBe(true);
  expect(workspacesStore.getState().workspaces).toHaveLength(2);
  await act(async () => workspacesStore.setState({ workspaces: workspacesStore.getState().workspaces.slice(0, 1) }));
  expect(host.querySelector('[aria-label="Supprimer le workspace"]')).toBeNull();
});

it("opens a tab's name editor on request (« Renommer le workspace »)", async () => {
  await act(async () => requestUi({ kind: "renameWorkspace", id: "w2" }));
  const field = row().querySelector("input")!;
  expect(field.value).toBe("Backend");
  expect(document.activeElement).toBe(field);
});

it("moves a tab with Alt+arrows from the keyboard, or by dragging it onto another", async () => {
  workspacesStore.setState({ projectId: "p1" });
  const first = tabs()[0].querySelector("button")!;
  await act(async () => void first.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", altKey: true, bubbles: true })));
  expect(tabs().map((t) => t.dataset.tab)).toEqual(["w2", "w1"]);
  // Dragging w2 (now first) onto the tab at the right puts it there.
  await act(async () => {
    tabs()[0].dispatchEvent(new Event("dragstart", { bubbles: true }));
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    tabs()[1].dispatchEvent(new Event("dragover", { bubbles: true, cancelable: true }));
    tabs()[1].dispatchEvent(drop);
  });
  expect(tabs().map((t) => t.dataset.tab)).toEqual(["w1", "w2"]);
});
