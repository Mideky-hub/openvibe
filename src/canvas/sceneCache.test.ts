// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { forgetScene, loadScene } from "./sceneCache";

afterEach(() => {
  forgetScene("w1");
  clearMocks();
});

it("reads a scene once while the first read is still pending (plan F1)", async () => {
  const reads = vi.fn();
  mockIPC((cmd) => {
    if (cmd === "load_workspace") {
      reads();
      return { nodes: [], files: [], elementsJson: null, appStateJson: null };
    }
  });
  const [a, b] = await Promise.all([loadScene("w1"), loadScene("w1")]);
  expect(a).toBe(b);
  expect(reads).toHaveBeenCalledTimes(1);
});
