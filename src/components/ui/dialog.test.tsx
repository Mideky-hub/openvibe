// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { langStore } from "@/i18n";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./dialog";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => langStore.setState({ lang: "fr" }));

it("labels the close button in the interface's language", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>t</DialogTitle>
          <DialogDescription>d</DialogDescription>
        </DialogContent>
      </Dialog>,
    ),
  );
  expect(document.querySelector("[data-slot='dialog-close'] .sr-only")?.textContent).toBe("Fermer");
  await act(async () => langStore.setState({ lang: "en" }));
  expect(document.querySelector("[data-slot='dialog-close'] .sr-only")?.textContent).toBe("Close");
  await act(async () => root.unmount());
});
