// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { MISSING_GRACE_MS } from "./MissingNode";
import { TerminalNode } from "./TerminalNode";

vi.mock("@excalidraw/excalidraw", () => ({}));
vi.mock("./useTerminalHost", () => ({ useTerminalHost: () => undefined }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.useRealTimers());

it("does not flash « Terminal introuvable » while a copy's record is on its way", async () => {
  vi.useFakeTimers();
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => root.render(<TerminalNode nodeId="copie" />));
  expect(host.textContent).toBe("");
  await act(async () => void vi.advanceTimersByTime(MISSING_GRACE_MS + 1));
  expect(host.textContent).toBe("Terminal introuvable");
  await act(async () => root.unmount());
});
