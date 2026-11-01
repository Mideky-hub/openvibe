import { defineMessages } from "@/i18n";

/** App-level texts: toasts of the about, logs, updates and settings modules, and the start-up errors. */
export const appMessages = defineMessages(
  {
    loading: "Chargement…",
    hooksDown: "États des agents approximatifs : serveur local indisponible",
    aboutDescription: "Canvas d'agents local et open source.",
    logsFailed: "Impossible d'ouvrir le dossier des journaux",
    dataFailed: "Impossible d'ouvrir le dossier des données",
    settingNotSaved: (error: string) => `Réglage non enregistré : ${error}`,
    upToDate: "OpenVibe est à jour.",
    updateCheckFailed: "Impossible de vérifier les mises à jour",
    updateWaitsForSave: "Mise à jour en attente : enregistre d'abord tes modifications, puis relance-la.",
    updateWaitsForSave: "Mise à jour en attente : enregistre d'abord tes modifications, puis relance-la.",
    startInterrupted: (message: string) => `démarrage interrompu (${message})`,
    projectsLoadFailed: (error: string) => `Impossible de charger les projets : ${error}`,
  },
  {
    loading: "Loading…",
    hooksDown: "Agent states are approximate: the local server is unavailable",
    aboutDescription: "A local, open source canvas for agents.",
    logsFailed: "Could not open the logs folder",
    dataFailed: "Could not open the data folder",
    settingNotSaved: (error: string) => `Setting not saved: ${error}`,
    upToDate: "OpenVibe is up to date.",
    updateCheckFailed: "Could not check for updates",
    updateWaitsForSave: "Update on hold: save your changes first, then start it again.",
    updateWaitsForSave: "Update on hold: save your changes first, then start it again.",
    startInterrupted: (message: string) => `start interrupted (${message})`,
    projectsLoadFailed: (error: string) => `Could not load the projects: ${error}`,
  },
);
