// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { ReleaseNotes } from "./ReleaseNotes";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("shows release notes formatted, not as raw Markdown", () => {
  const host = document.createElement("div");
  act(() => createRoot(host).render(<ReleaseNotes notes={"### Fixed\n- One **bold** thing.\n- Two."} />));
  expect(host.querySelector("h4")?.textContent).toBe("Fixed");
  expect(host.querySelectorAll("li")).toHaveLength(2);
  expect(host.textContent).not.toContain("###");
});
