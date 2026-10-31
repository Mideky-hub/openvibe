// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { toast } from "sonner";
import { projectsStore } from "@/store/projects";
import { ProjectPicker } from "./ProjectPicker";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => mockIPC(() => undefined));
afterEach(() => {
  clearMocks();
  vi.restoreAllMocks();
});

it("names the open project in the title bar, lists recent projects with their path, closes it (spec identité §5.1)", async () => {
  projectsStore.setState({
    projects: [
      { id: "p1", name: "mk-webapp", path: "C:/code/mk-webapp", position: 0, lastOpenedAt: 1, workspaceCount: 1, missing: false, liveAgents: 0 },
    ],
    activeId: "p1",
  } as never);
  const close = vi.spyOn(projectsStore.getState(), "close").mockResolvedValue();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<ProjectPicker />));
  const trigger = host.querySelector("button")!;
  expect(trigger.textContent).toBe("mk-webapp");
  await act(async () => trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  const items = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
  expect(items.map((i) => i.textContent)).toEqual(["mk-webappC:/code/mk-webapp", "Tous les projets…", "Fermer le projet"]);
  expect(items[0].querySelector("[data-path]")!.textContent).toBe("C:/code/mk-webapp");
  await act(async () => items[2].click());
  expect(close).toHaveBeenCalled();
  await act(async () => root.unmount());
  host.remove();
});

it("does not reopen the project already open, and tells when opening another fails", async () => {
  projectsStore.setState({
    projects: [
      { id: "p1", name: "a", path: "C:/a", position: 0, lastOpenedAt: 2, workspaceCount: 1, missing: false, liveAgents: 0 },
      { id: "p2", name: "b", path: "C:/b", position: 1, lastOpenedAt: 1, workspaceCount: 1, missing: false, liveAgents: 0 },
    ],
    activeId: "p1",
  } as never);
  const open = vi.spyOn(projectsStore.getState(), "open").mockRejectedValue(new Error("nope"));
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<ProjectPicker />));
  await act(async () => host.querySelector("button")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  let items = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
  await act(async () => items[0].click());
  expect(open).not.toHaveBeenCalled();
  await act(async () => host.querySelector("button")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  items = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
  await act(async () => items[1].click());
  expect(open).toHaveBeenCalledWith("p2");
  expect(toast.error).toHaveBeenCalled();
  await act(async () => root.unmount());
  host.remove();
});
