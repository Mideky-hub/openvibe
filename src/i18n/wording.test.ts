import { afterEach, expect, it } from "vitest";
import { accountsMessages } from "@/accounts/messages";
import { appMessages } from "@/app/messages";
import { catalogMessages } from "@/commands/catalog/messages";
import { missionMessages } from "@/mission/messages";
import { nodesMessages } from "@/nodes/messages";
import { reviewMessages } from "@/review/messages";
import { shellMessages } from "@/shell/messages";
import { langStore, messages } from "./index";

afterEach(() => langStore.setState({ lang: "fr" }));

it("names one action with one word across the menus and the palette (final review R5a)", () => {
  langStore.setState({ lang: "en" });
  expect(messages(shellMessages).toolRail.launchAgent).toBe("Launch an agent");
  const labels = messages(catalogMessages).commands;
  expect(labels["group.orchestrate"].label).toBe("Link an orchestrator");
  expect(labels["orchestrator.link"].label).toBe("Link");
  expect(labels["project.close"].label).toBe("Close the project");
  expect(labels["workspace.delete"].label).toBe("Delete the workspace");
  expect(labels["group.close"].label).toBe("Close the group");
  expect(labels["group.rename"].label).toBe("Rename the group");
});

it("counts in proper English and French", () => {
  langStore.setState({ lang: "en" });
  expect(messages(missionMessages).linked(1)).toBe("1 Claude agent linked");
  expect(messages(missionMessages).linked(2)).toBe("2 Claude agents linked");
  expect(messages(reviewMessages).moreLines(1)).toBe("… 1 more line");
  expect(messages(reviewMessages).moreLines(3)).toBe("… 3 more lines");
  langStore.setState({ lang: "fr" });
  expect(messages(reviewMessages).moreLines(1)).toBe("… 1 ligne de plus");
  expect(messages(reviewMessages).moreLines(3)).toBe("… 3 lignes de plus");
});

it("tells in English that the local server is down, and names a new orchestrator in English", () => {
  langStore.setState({ lang: "en" });
  expect(messages(appMessages).hooksDown).toBe("Agent states are approximate: the local server is unavailable");
  expect(messages(nodesMessages).orchestrator.defaultName).toBe("Orchestrator");
  langStore.setState({ lang: "fr" });
  expect(messages(appMessages).hooksDown).toBe("États des agents approximatifs : serveur local indisponible");
  expect(messages(nodesMessages).orchestrator.defaultName).toBe("Orchestrateur");
});

it("says what OpenVibe really reads in a Claude profile's folder (review)", () => {
  const fr = accountsMessages.fr.description;
  const en = accountsMessages.en.description;
  expect(fr).not.toContain("ne lit rien");
  expect(en).not.toContain("reads nothing");
  for (const text of [fr, en]) expect(text).toContain("settings.json");
});
