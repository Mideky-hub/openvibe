// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { TITLE_BAR_HEIGHT } from "./layout";
import { TitleBar } from "./TitleBar";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  mockWindows("main");
  mockIPC((cmd) => (cmd === "plugin:window|is_maximized" ? false : undefined), { shouldMockEvents: true });
});
afterEach(() => clearMocks());

it("moves the window from its empty space only, with the logo, its content and the window buttons", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<TitleBar leading={<button type="button">mk-webapp</button>} trailing={<span>3</span>} />));
  const bar = host.firstElementChild as HTMLElement;
  expect(bar.style.height).toBe(`${TITLE_BAR_HEIGHT}px`);
  // "deep" on the bar: the logo, the app's name and every gap drag the window, the buttons inside still block it.
  expect(bar.getAttribute("data-tauri-drag-region")).toBe("deep");
  expect(bar.querySelectorAll("[data-tauri-drag-region]")).toHaveLength(0);
  expect(bar.querySelector("svg path")!.getAttribute("stroke")).toBe("#D97757");
  for (const label of ["Réduire", "Agrandir", "Fermer OpenVibe"]) expect(host.querySelector(`[aria-label="${label}"]`)).not.toBeNull();
  await act(async () => root.unmount());
  host.remove();
});

it("centers its middle element between equal sides, which never cover it, and the middle does not drag", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<TitleBar leading={<span>OpenVibe</span>} center={<button type="button">Rechercher</button>} />));
  const bar = host.firstElementChild as HTMLElement;
  // The sides take at least their content's width, the middle what remains:
  // the usage meter no longer runs over the search field (README review).
  expect(bar.style.gridTemplateColumns).toBe("minmax(max-content, 1fr) minmax(0, auto) minmax(max-content, 1fr)");
  const center = [...host.querySelectorAll("button")].find((b) => b.textContent === "Rechercher")!;
  expect(center.parentElement!.parentElement).toBe(bar);
  expect(center.parentElement!.className).toContain("min-w-0");
  expect(center.closest("[data-tauri-drag-region]")).toBe(bar);
  await act(async () => root.unmount());
  host.remove();
});
