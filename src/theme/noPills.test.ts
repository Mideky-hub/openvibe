import { expect, it } from "vitest";
import { readSource } from "./cssBlocks";

// Spec identité §4.4: no pill shapes, except counter badges; a dot is not a pill.
it.each(["fleet/AgentMenu.tsx", "fleet/ComposeGroup.tsx", "fleet/InstallPrompt.tsx", "fleet/OllamaPicker.tsx", "git/GitWindow.tsx", "home/NoAgent.tsx"])(
  "%s has no pill shape",
  (file) => {
    const pills = readSource(file)
      .split("\n")
      .filter((line) => line.includes("rounded-full") && !/size-[\d.]+ (shrink-0 )?rounded-full/.test(line));
    expect(pills).toEqual([]);
  },
);

it("keeps the accent's own text color in the agent menu", () => {
  expect(readSource("fleet/AgentMenu.tsx")).not.toContain("text-white");
});

it("keeps the accent's own text color in the mission panel", () => {
  expect(readSource("mission/MissionPanel.tsx")).not.toMatch(/bg-ov-accent[^"]*text-white/);
});
