// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ShapesMenu } from "./ShapesMenu";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const open = async (host: HTMLElement) =>
  act(async () => void host.querySelector("button")!.click());

it("takes the last shape as the tool when the button is used, rectangle at first", async () => {
  const onPick = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<ShapesMenu active={false} current="selection" onPick={onPick} />));
  await open(host);
  expect(onPick).toHaveBeenLastCalledWith("rectangle");
  const ellipse = [...document.querySelectorAll<HTMLButtonElement>("[data-shape]")].find((b) => b.dataset.shape === "ellipse")!;
  await act(async () => ellipse.click());
  expect(onPick).toHaveBeenLastCalledWith("ellipse");
  await act(async () => root.render(<ShapesMenu active={false} current="selection" onPick={onPick} />));
  await open(host);
  expect(onPick).toHaveBeenLastCalledWith("ellipse");
  await act(async () => root.unmount());
  document.body.replaceChildren();
});
