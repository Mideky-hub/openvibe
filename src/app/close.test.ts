// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import { onFlushAll } from "@/lib/flush";
import { guardQuit } from "@/studio/studioStore";
import { saveBeforeClose } from "./close";

it("commits the field being edited before writing pending saves", async () => {
  // A title input saves on blur; WebView2 does not blur it when the window closes.
  const input = document.createElement("input");
  document.body.appendChild(input);
  input.focus();
  let saved = false;
  input.addEventListener("blur", () => {
    onFlushAll(() => {
      saved = true;
    });
  });
  await saveBeforeClose();
  expect(document.activeElement).not.toBe(input);
  expect(saved).toBe(true);
  input.remove();
});

it("keeps the window open while the code studio has unsaved changes (spec studio code §3)", async () => {
  const preventDefault = vi.fn();
  const release = guardQuit(() => true);
  await saveBeforeClose({ preventDefault });
  expect(preventDefault).toHaveBeenCalledOnce();
  release();
  await saveBeforeClose({ preventDefault });
  expect(preventDefault).toHaveBeenCalledOnce();
});
