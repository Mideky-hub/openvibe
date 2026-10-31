// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { langStore } from "@/i18n";
import type { TerminalPayload } from "@/nodes/types";
import { relaunchTerminal } from "./registry";
import { ResumeCard } from "./ResumeCard";

vi.mock("./registry", () => ({ relaunchTerminal: vi.fn() }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const payload: TerminalPayload = { title: "Installation · Codex", name: "Isis", agent: "custom", cwd: "C:/code", shell: "powershell", command: "irm x | iex" };

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.mocked(relaunchTerminal).mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  langStore.setState({ lang: "fr" });
});

const render = (terminal: TerminalPayload) =>
  act(async () => root.render(<ResumeCard nodeId="n" payload={terminal} status={{ state: "exited", code: 0 }} />));

it("promises that typing starts afresh on an ordinary terminal", async () => {
  await render(payload);
  expect(host.textContent).toContain("taper démarre à neuf");
});

it("does not promise it on a one-shot command, which only the click runs again (spec installation §7)", async () => {
  await render({ ...payload, oneShot: true });
  expect(host.textContent).not.toContain("taper");
  expect(host.textContent).toContain("Cliquer pour relancer la commande");
  await act(async () => host.querySelector("button")!.click());
  expect(relaunchTerminal).toHaveBeenCalledWith("n", { ...payload, oneShot: true }, "new");
});

it("speaks English", async () => {
  langStore.setState({ lang: "en" });
  await render({ ...payload, oneShot: true });
  expect(host.textContent).toContain("Click to run the command again");
});
