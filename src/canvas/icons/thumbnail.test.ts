import { beforeEach, expect, it, vi } from "vitest";
import { exportToSvg } from "@excalidraw/excalidraw";
import { iconThumbnail, MAX_DRAWN } from "./thumbnail";
import type { IconItem } from "./library";

vi.mock("@excalidraw/excalidraw", () => ({ exportToSvg: vi.fn(), restoreElements: (elements: unknown) => elements }));

const item = (id: string): IconItem => ({ id, name: id, library: "L", elements: [] });

beforeEach(() => vi.mocked(exportToSvg).mockReset());

it("draws an icon once per theme, and tries again after a failed drawing (backlog 27 oct)", async () => {
  vi.mocked(exportToSvg).mockRejectedValueOnce(new Error("boom")).mockResolvedValue({} as SVGSVGElement);
  expect(await iconThumbnail(item("a"), false)).toBeNull();
  await Promise.resolve();
  expect(await iconThumbnail(item("a"), false)).not.toBeNull();
  await iconThumbnail(item("a"), false);
  expect(exportToSvg).toHaveBeenCalledTimes(2);
});

it("keeps a bounded number of drawings", async () => {
  vi.mocked(exportToSvg).mockResolvedValue({} as SVGSVGElement);
  for (let i = 0; i < MAX_DRAWN + 20; i++) await iconThumbnail(item(`b${i}`), true);
  vi.mocked(exportToSvg).mockClear();
  await iconThumbnail(item("b0"), true);
  expect(exportToSvg).toHaveBeenCalledTimes(1);
});
