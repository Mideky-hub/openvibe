import { defineMessages } from "@/i18n";

/** The texts of the canvas (spec première version §7.1). */
export const canvasMessages = defineMessages(
  {
    saveFailed: (error: string) => `Sauvegarde impossible : ${error}`,
    loadFailed: (error: string) => `Impossible de charger ce workspace : ${error}`,
    loading: "Chargement…",
    groupName: (n: number) => `Groupe ${n}`,
    groupNameLabel: "Nom du groupe",
    foldGroup: "Replier le groupe",
    unfoldGroup: "Déplier le groupe",
  },
  {
    saveFailed: (error: string) => `Could not save: ${error}`,
    loadFailed: (error: string) => `Could not load this workspace: ${error}`,
    loading: "Loading…",
    groupName: (n: number) => `Group ${n}`,
    groupNameLabel: "Group name",
    foldGroup: "Fold the group",
    unfoldGroup: "Unfold the group",
  },
);

/** Excalidraw's own language codes for ours. */
export const EXCALIDRAW_LANG = { fr: "fr-FR", en: "en" } as const;
