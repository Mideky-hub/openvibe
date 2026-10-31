import { defineMessages, plural } from "@/i18n";
import type { DeployResult } from "./deploy";

/** Texts of the team presets (spec presets §3). */
export const presetsMessages = defineMessages(
  {
    section: "Équipes",
    save: "Enregistrer l'équipe comme preset…",
    saveKeywords: ["équipe", "preset", "enregistrer", "sauvegarder", "topologie"],
    deploy: (name: string, agents: number) => `Déployer l'équipe : ${name} (${plural("fr", agents, "agent", "agents")})`,
    deployKeywords: (name: string) => ["équipe", "preset", "déployer", "poser", "lancer", name],
    remove: (name: string) => `Supprimer le preset : ${name}`,
    removeKeywords: (name: string) => ["équipe", "preset", "supprimer", "retirer", name],
    dialog: {
      title: "Enregistrer l'équipe comme preset",
      description: "Les groupes, leurs agents et les orchestrateurs reliés sont gardés ; ni les consignes ni les missions.",
      nameLabel: "Nom du preset",
      placeholder: "Dev HQ",
      save: "Enregistrer",
      cancel: "Annuler",
      replaces: (name: string) => `Remplace le preset « ${name} »`,
    },
    toast: {
      saved: (name: string) => `Preset « ${name} » enregistré`,
      nothing: "Aucun groupe avec des agents à enregistrer",
      full: "Trop de presets (50 au plus) : supprime-en un d'abord",
      removed: (name: string) => `Preset « ${name} » supprimé`,
      undo: "Annuler",
      deployed: (name: string, r: DeployResult) =>
        `Équipe « ${name} » déployée : ${plural("fr", r.groups, "groupe", "groupes")}, ${plural("fr", r.agents, "agent", "agents")}, ${plural("fr", r.orchestrators, "orchestrateur", "orchestrateurs")}`,
      substituted: (count: number) =>
        `${plural("fr", count, "agent absent", "agents absents")} de cet ordinateur remplacé${count > 1 ? "s" : ""} par l'agent par défaut`,
      orchestratorsSkipped: (count: number) => `${plural("fr", count, "orchestrateur non posé", "orchestrateurs non posés")} (Claude Code est nécessaire)`,
      failed: (error: string) => `Opération sur les presets impossible : ${error}`,
    },
  },
  {
    section: "Teams",
    save: "Save the team as a preset…",
    saveKeywords: ["team", "preset", "save", "topology"],
    deploy: (name: string, agents: number) => `Deploy team: ${name} (${plural("en", agents, "agent", "agents")})`,
    deployKeywords: (name: string) => ["team", "preset", "deploy", "place", "launch", name],
    remove: (name: string) => `Delete preset: ${name}`,
    removeKeywords: (name: string) => ["team", "preset", "delete", "remove", name],
    dialog: {
      title: "Save the team as a preset",
      description: "The groups, their agents and the linked orchestrators are kept; no instructions and no missions.",
      nameLabel: "Preset name",
      placeholder: "Dev HQ",
      save: "Save",
      cancel: "Cancel",
      replaces: (name: string) => `Replaces the preset “${name}”`,
    },
    toast: {
      saved: (name: string) => `Preset “${name}” saved`,
      nothing: "No group with agents to save",
      full: "Too many presets (50 at most): delete one first",
      removed: (name: string) => `Preset “${name}” deleted`,
      undo: "Undo",
      deployed: (name: string, r: DeployResult) =>
        `Team “${name}” deployed: ${plural("en", r.groups, "group", "groups")}, ${plural("en", r.agents, "agent", "agents")}, ${plural("en", r.orchestrators, "orchestrator", "orchestrators")}`,
      substituted: (count: number) => `${plural("en", count, "agent", "agents")} not found on this computer replaced by the default agent`,
      orchestratorsSkipped: (count: number) => `${plural("en", count, "orchestrator", "orchestrators")} not placed (Claude Code is required)`,
      failed: (error: string) => `Could not change the presets: ${error}`,
    },
  },
);
