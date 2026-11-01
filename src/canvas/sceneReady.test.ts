import { afterEach, expect, it, vi } from "vitest";
import { sceneGone, sceneReady, whenSceneReady } from "./sceneReady";

afterEach(() => {
  sceneGone("w1");
  sceneGone("w2");
});

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

it("runs at once when the scene got there first: a cached scene can beat the wait", () => {
  const run = vi.fn();
  sceneReady("w1");
  whenSceneReady("w1", run);
  expect(run).toHaveBeenCalledTimes(1);
});

it("waits again once the scene has left the screen", () => {
  const run = vi.fn();
  sceneReady("w1");
  sceneGone("w1");
  whenSceneReady("w1", run);
  expect(run).not.toHaveBeenCalled();
  sceneReady("w1");
  expect(run).toHaveBeenCalledTimes(1);
});
