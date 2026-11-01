import { afterEach, expect, it } from "vitest";
import { canvasMessages } from "@/canvas/messages";
import { fleetMessages } from "@/fleet/messages";
import { notesMessages } from "@/notes/messages";
import { presetsMessages } from "@/presets/messages";
import { shellMessages } from "@/shell/messages";
import { studioMessages } from "@/studio/messages";
import { langStore, messages } from "./index";

afterEach(() => langStore.setState({ lang: "fr" }));

/** The areas added after the language work (R5a): each speaks English and French, with the right plurals. */
const both = <T>(read: () => T): { fr: T; en: T } => {
  langStore.setState({ lang: "fr" });
  const fr = read();
  langStore.setState({ lang: "en" });
  const en = read();
  return { fr, en };
};

it("Code studio", () => {
  const save = both(() => messages(studioMessages).save);
  expect(save).toEqual({ fr: "Enregistrer (Ctrl+S)", en: "Save (Ctrl+S)" });
  expect(both(() => messages(studioMessages).unsaved.title("a.ts")).en).toBe("Save a.ts?");
});

it("Notes", () => {
  const search = both(() => [1, 4].map((n) => messages(notesMessages).searchPlaceholder(n)));
  expect(search.en).toEqual(["Search 1 note…", "Search 4 notes…"]);
  expect(search.fr).toEqual(["Rechercher dans 1 note…", "Rechercher dans 4 notes…"]);
  expect(both(() => messages(notesMessages).tabGraph)).toEqual({ fr: "Graphe", en: "Graph" });
});

it("Team presets", () => {
  const deploy = both(() => [1, 3].map((n) => messages(presetsMessages).deploy("Dev HQ", n)));
  expect(deploy.en).toEqual(["Deploy team: Dev HQ (1 agent)", "Deploy team: Dev HQ (3 agents)"]);
  expect(deploy.fr).toEqual(["Déployer l'équipe : Dev HQ (1 agent)", "Déployer l'équipe : Dev HQ (3 agents)"]);
  expect(both(() => messages(presetsMessages).save).en).toBe("Save the team as a preset…");
});

it("Agent install", () => {
  const install = both(() => messages(fleetMessages).install.installAgent("Codex"));
  expect(install).toEqual({ fr: "Installer Codex", en: "Install Codex" });
  expect(both(() => messages(fleetMessages).install.installed("Codex")).en).toBe("Codex is installed");
});

it("The notice of an agent that waits", () => {
  const notice = both(() => messages(shellMessages).waitingNotice.question("Isis"));
  expect(notice).toEqual({ fr: "Isis a une question", en: "Isis has a question" });
  expect(both(() => [1, 3].map((n) => messages(shellMessages).waitingNotice.others(n))).en).toEqual(["+ 1 more", "+ 3 more"]);
  expect(both(() => [1, 3].map((n) => messages(shellMessages).waitingNotice.others(n))).fr).toEqual(["+ 1 autre", "+ 3 autres"]);
});

it("Group folding and tab moves", () => {
  expect(both(() => messages(fleetMessages).groupMenu.fold)).toEqual({ fr: "Replier le groupe", en: "Fold the group" });
  expect(both(() => messages(fleetMessages).groupMenu.unfold).en).toBe("Unfold the group");
  expect(both(() => messages(canvasMessages).foldGroup).en).toBe("Fold the group");
  expect(both(() => messages(fleetMessages).foldWaiting).en).toContain("Wait for the group's agents");
  expect(both(() => messages(shellMessages).tabs.moveLeft)).toEqual({ fr: "Déplacer à gauche", en: "Move left" });
});

it("Tokens", () => {
  const files = both(() => [1, 3].map((n) => messages(shellMessages).usage.tokensFiles(n)));
  expect(files.en).toEqual(["1 file read", "3 files read"]);
  expect(files.fr).toEqual(["1 fichier lu", "3 fichiers lus"]);
});
