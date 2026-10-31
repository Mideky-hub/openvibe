import { expect, it, vi } from "vitest";
import { sceneReady, whenSceneReady } from "./sceneReady";

it("runs what waited for this workspace's scene, once", () => {
  const run = vi.fn();
  whenSceneReady("w1", run);
  sceneReady("w1");
  sceneReady("w1");
  expect(run).toHaveBeenCalledTimes(1);
});

it("leaves it waiting while another workspace is on screen", () => {
  const run = vi.fn();
  whenSceneReady("w1", run);
  sceneReady("w2");
  expect(run).not.toHaveBeenCalled();
  sceneReady("w1");
  expect(run).toHaveBeenCalledTimes(1);
});
