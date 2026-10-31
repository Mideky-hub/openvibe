// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { Project } from "@/store/projects";
import { ProjectCard } from "./ProjectCard";

vi.mock("@tauri-apps/plugin-dialog", () => ({ ask: vi.fn(), open: vi.fn() }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const project = (missing: boolean): Project => ({ id: "p", name: "api", path: "C:/api", position: 0, lastOpenedAt: 0, workspaceCount: 1, missing, liveAgents: 0 });

async function menuOf(missing: boolean) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<ProjectCard project={project(missing)} />));
  await act(async () => host.querySelector("button")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  const items = [...document.querySelectorAll('[role="menuitem"]')].map((i) => i.textContent);
  await act(async () => root.unmount());
  document.body.replaceChildren();
  return items;
}

it("offers « Renommer » for a project that exists, not for a missing one", async () => {
  expect(await menuOf(false)).toContain("Renommer");
  expect(await menuOf(true)).not.toContain("Renommer");
});
