import { defineMessages } from "@/i18n";

/** Texts of the Kanban outside its node: a new board's columns, the drop on a terminal (issue #29). */
export const kanbanMessages = defineMessages(
  {
    defaultColumns: ["À faire", "En cours", "Fait"] as readonly string[],
    sent: (name: string) => `Carte envoyée à ${name}`,
    notRunning: (name: string) => `${name} ne tourne pas : carte non envoyée`,
    sendFailed: (error: string) => `Envoi impossible : ${error}`,
    placeFailed: (error: string) => `Kanban impossible : ${error}`,
    agent: "l'agent",
    github: {
      failed: (detail: string) => `GitHub : ${detail}`,
      synced: (repo: string) => `Synchronisé avec ${repo}`,
      created: (number: number) => `Issue #${number} créée`,
    },
  },
  {
    defaultColumns: ["To do", "In progress", "Done"],
    sent: (name: string) => `Card sent to ${name}`,
    notRunning: (name: string) => `${name} is not running: card not sent`,
    sendFailed: (error: string) => `Could not send: ${error}`,
    placeFailed: (error: string) => `Could not create the Kanban: ${error}`,
    agent: "the agent",
    github: {
      failed: (detail: string) => `GitHub: ${detail}`,
      synced: (repo: string) => `Synced with ${repo}`,
      created: (number: number) => `Issue #${number} created`,
    },
  },
);
