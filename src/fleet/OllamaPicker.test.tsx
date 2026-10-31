// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { langStore } from "@/i18n";
import { OllamaPicker } from "./OllamaPicker";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let models: string[] | Error;
let host: HTMLDivElement;
let root: Root;
const onPick = vi.fn();
const onPull = vi.fn();

beforeEach(() => {
  models = [];
  onPick.mockClear();
  onPull.mockClear();
  mockIPC((cmd) => {
    if (cmd !== "list_ollama_models") return;
    if (models instanceof Error) throw models;
    return models;
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  clearMocks();
  langStore.setState({ lang: "fr" });
});

const render = () => act(async () => root.render(<OllamaPicker aiderAvailable onBack={vi.fn()} onPick={onPick} onPull={onPull} />));
const button = (text: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(text));
const field = () => host.querySelector("input")!;
const type = (value: string) =>
  act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    set.call(field(), value);
    field().dispatchEvent(new Event("input", { bubbles: true }));
  });
const submit = () => act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));

it("keeps listing the installed models and picks one", async () => {
  models = ["llama3.2:3b"];
  await render();
  await act(async () => [...host.querySelectorAll<HTMLElement>("[data-model]")][0].click());
  expect(onPick).toHaveBeenCalledWith({ model: "llama3.2:3b", mode: "code" });
  expect(onPull).not.toHaveBeenCalled();
});

it("points to the download below when no model is installed", async () => {
  await render();
  expect(host.textContent).toContain("Aucun modèle installé");
});

it("suggests models with their size, without the installed ones", async () => {
  models = ["llama3.2:3b"];
  await render();
  const names = [...host.querySelectorAll<HTMLElement>("[data-suggestion]")].map((b) => b.dataset.suggestion);
  expect(names).toEqual(["qwen2.5-coder:7b", "gemma3:4b", "deepseek-r1:8b", "devstral:24b"]);
  expect(button("qwen2.5-coder:7b")!.textContent).toContain("4,7 Go");
  await act(async () => button("gemma3:4b")!.click());
  expect(onPull).toHaveBeenCalledWith("gemma3:4b");
  expect(onPick).not.toHaveBeenCalled();
});

it("pulls a model by name, trimmed", async () => {
  await render();
  await type("  mistral:7b ");
  await submit();
  expect(onPull).toHaveBeenCalledWith("mistral:7b");
});

it("refuses a name that is not a model", async () => {
  await render();
  await type("a; calc");
  await submit();
  expect(onPull).not.toHaveBeenCalled();
  expect(host.textContent).toContain("Ce nom n'est pas un modèle Ollama.");
});

it("does nothing on an empty name", async () => {
  await render();
  await submit();
  expect(onPull).not.toHaveBeenCalled();
  expect(host.textContent).not.toContain("Ce nom n'est pas");
});

it("still offers the download when Ollama does not answer", async () => {
  models = new Error("connection refused");
  await render();
  expect(host.textContent).toContain("Ollama ne répond pas");
  expect(host.querySelector("form")).not.toBeNull();
});

it("speaks English", async () => {
  langStore.setState({ lang: "en" });
  await render();
  expect(host.textContent).toContain("No model installed");
  expect(host.textContent).toContain("Download a model");
  expect(button("qwen2.5-coder:7b")!.textContent).toContain("4.7 GB");
});
