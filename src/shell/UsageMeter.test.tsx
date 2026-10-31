// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mockIPC } from "@tauri-apps/api/mocks";
import { nodesStore } from "@/store/nodes";
import { usageStore } from "@/usage/usageStore";
import { UsageMeter } from "./UsageMeter";

vi.mock("@excalidraw/excalidraw", () => ({}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const STATUS = {
  session_id: "s1",
  model: { id: "claude-haiku-5-5", display_name: "Haiku 5.5" },
  cost: { total_api_duration_ms: 95_000, total_cost_usd: 0.00738, total_duration_ms: 3_900_000, total_lines_added: 12, total_lines_removed: 3 },
  context_window: { total_input_tokens: 67_785, total_output_tokens: 4_200, used_percentage: 7 },
  rate_limits: { five_hour: { resets_at: 4102444800, used_percentage: 29 }, seven_day: { resets_at: 4102531200, used_percentage: 93 } },
  prompt_cache: { warm: true, hit_ratio: 0.48, expires_at: 4102444800, ttl: "1h" },
};

let host: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  mockIPC(() => undefined);
  usageStore.setState({ sessions: {}, limits: null });
  await nodesStore.getState().create("isis", {
    workspaceId: "w1",
    kind: "terminal",
    payload: { title: "Isis", name: "Isis", agent: "claude", cwd: "C:/code", shell: "default", command: "" },
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<UsageMeter />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  document.body.replaceChildren();
});

const meter = () => host.querySelector<HTMLButtonElement>("[data-usage]")!;

it("waits for a Claude session's first answer before showing the limits (spec maj §6)", () => {
  expect(meter().textContent).toBe("Usage");
  expect(meter().title).toContain("première réponse");
});

it("shows the session's and the week's use of the plan in the title bar, then the detail on a click", async () => {
  await act(async () => usageStore.getState().apply({ nodeId: "isis", status: STATUS }, 1_000));
  expect(meter().textContent).toContain("Session 29 %");
  expect(meter().textContent).toContain("Semaine 93 %");
  expect(meter().querySelector('[data-tone="over"]')).not.toBeNull();
  await act(async () => meter().click());
  const detail = document.querySelector("[data-usage-detail]")!.textContent!;
  for (const piece of ["Session (5 h)", "Semaine (tous modèles)", "Semaine (Fable)", "Coût total", "0,0074 $", "Durée API", "1 min", "Durée réelle", "1 h 05", "+12", "−3", "Haiku 5.5", "67,8 k", "CO₂", "Isis", "chaud", "48 %"]) {
    expect(detail).toContain(piece);
  }
});

it("opens the 30-day tokens from the detail, and comes back to it", async () => {
  mockIPC((cmd) => (cmd === "token_usage" ? { days: [], sessions: [], models: [], filesScanned: 0, truncated: false } : undefined));
  await act(async () => meter().click());
  const link = [...document.querySelectorAll<HTMLButtonElement>("[data-usage-detail] button")].find((b) => b.textContent?.includes("Tokens sur 30 jours"))!;
  await act(async () => link.click());
  expect(document.querySelector("[data-tokens]")).not.toBeNull();
  expect(document.querySelector("[data-usage-detail]")).toBeNull();
  await act(async () => document.querySelector<HTMLButtonElement>('[data-tokens] [aria-label="Usage"]')!.click());
  expect(document.querySelector("[data-usage-detail]")).not.toBeNull();
});
