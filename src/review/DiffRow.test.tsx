// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { langStore } from "@/i18n";
import { DiffRow } from "./DiffRow";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => langStore.setState({ lang: "fr" }));

async function render(lang: "fr" | "en") {
  langStore.setState({ lang });
  const host = document.createElement("div");
  await act(async () => createRoot(host).render(<DiffRow line={{ kind: "cut", text: "[diff tronqué]" }} />));
  return host.textContent;
}

it("says a cut diff in the interface language", async () => {
  expect(await render("fr")).toBe("[diff tronqué]");
  expect(await render("en")).toBe("[diff truncated]");
});
