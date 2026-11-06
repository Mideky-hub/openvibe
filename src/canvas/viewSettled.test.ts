import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_VIEW, canvasStore } from "./canvasStore";
import { whenViewSettled } from "./viewSettled";

beforeEach(() => {
  vi.useFakeTimers();
  canvasStore.getState().setView(EMPTY_VIEW);
});
afterEach(() => vi.useRealTimers());

describe("whenViewSettled (plan F1)", () => {
  it("waits for the scroll to stop moving, not for its first frame", async () => {
    const done = vi.fn();
    void whenViewSettled(100, 1000).then(done);
    for (const scrollX of [10, 20, 30]) {
      await vi.advanceTimersByTimeAsync(60);
      canvasStore.getState().setView({ ...EMPTY_VIEW, scrollX });
    }
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(done).toHaveBeenCalledOnce();
  });

  it("resolves after the quiet time when the view does not move at all", async () => {
    const done = vi.fn();
    void whenViewSettled(100, 1000).then(done);
    await vi.advanceTimersByTimeAsync(100);
    expect(done).toHaveBeenCalledOnce();
  });

  it("gives up waiting at the limit, so a view that keeps moving never blocks the caller", async () => {
    const done = vi.fn();
    void whenViewSettled(100, 300).then(done);
    for (let i = 1; i <= 10; i++) {
      await vi.advanceTimersByTimeAsync(50);
      canvasStore.getState().setView({ ...EMPTY_VIEW, scrollX: i });
    }
    expect(done).toHaveBeenCalledOnce();
  });
});
