import { defineMessages, plural } from "@/i18n";

/** Texts of the palette (the catalogs' own are in catalog/messages.ts). */
export const commandsMessages = defineMessages(
  {
    palette: {
      label: "Palette",
      placeholderGoTo: "Aller à un terminal, un workspace, un fichier (fichier:ligne)… (> pour les fonctions)",
      placeholderFunctions: "Rechercher une fonction…",
      loading: "Chargement…",
      empty: "Aucun résultat",
      footer: "↑↓ naviguer · Entrée ouvrir · Échap fermer",
      recent: "Récentes",
    },
    failed: (label: string, error: string) => `${label} impossible : ${error}`,
    goTo: {
      sections: { terminal: "Terminaux", group: "Groupes", orchestrator: "Orchestrateurs", workspace: "Workspaces", project: "Projets", file: "Fichiers" },
      keywords: { group: "groupe", orchestrator: "orchestrateur", workspace: "workspace", tab: "onglet" },
      members: (count: number) => plural("fr", count, "agent", "agents"),
      linked: (count: number) => `relié à ${count}`,
      live: (count: number) => plural("fr", count, "actif", "actifs"),
      shown: "affiché",
      openFailed: (error: string) => `Ouverture impossible : ${error}`,
      gone: (label: string) => `${label} n'existe plus`,
      unreadable: (name: string) => `Workspace ${name} illisible`,
      atLine: (line: number) => `ligne ${line}`,
    },
  },
  {
    palette: {
      label: "Palette",
      placeholderGoTo: "Go to a terminal, a workspace, a file (file:line)… (> for functions)",
      placeholderFunctions: "Search for a function…",
      loading: "Loading…",
      empty: "No results",
      footer: "↑↓ navigate · Enter open · Esc close",
      recent: "Recent",
    },
    failed: (label: string, error: string) => `${label} failed: ${error}`,
    goTo: {
      sections: { terminal: "Terminals", group: "Groups", orchestrator: "Orchestrators", workspace: "Workspaces", project: "Projects", file: "Files" },
      keywords: { group: "group", orchestrator: "orchestrator", workspace: "workspace", tab: "tab" },
      members: (count: number) => plural("en", count, "agent", "agents"),
      linked: (count: number) => `linked to ${count}`,
      live: (count: number) => plural("en", count, "active", "active"),
      shown: "shown",
      openFailed: (error: string) => `Could not open: ${error}`,
      gone: (label: string) => `${label} no longer exists`,
      unreadable: (name: string) => `Workspace ${name} is unreadable`,
      atLine: (line: number) => `line ${line}`,
    },
  },
);
