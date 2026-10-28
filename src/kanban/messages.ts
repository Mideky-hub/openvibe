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
    inProgress: "En cours",
    plan: {
      request: (column: string, count: number, cards: string) =>
        `Planifie la colonne « ${column} » du Kanban (${count} carte${count > 1 ? "s" : ""}) : ${cards}. ` +
        "Lis le board avec l'outil board, regroupe ces cartes en un plan de mise en place et appelle propose_plan en donnant à chaque sous-tâche le champ card (l'id de sa carte).",
      priorities: { low: "priorité basse", medium: "priorité moyenne", high: "priorité haute" },
      due: (date: string) => `échéance ${date}`,
      issue: (number: number, repo: string) => `issue #${number} (${repo})`,
      empty: (column: string) => `La colonne « ${column} » n'a pas de carte à planifier`,
      sent: (name: string) => `Demande de plan envoyée à ${name}`,
    },
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
    inProgress: "In progress",
    plan: {
      request: (column: string, count: number, cards: string) =>
        `Plan the Kanban column "${column}" (${count} card${count > 1 ? "s" : ""}): ${cards}. ` +
        "Read the board with the board tool, group these cards into an implementation plan and call propose_plan, giving each sub-task the card field (its card's id).",
      priorities: { low: "low priority", medium: "medium priority", high: "high priority" },
      due: (date: string) => `due ${date}`,
      issue: (number: number, repo: string) => `issue #${number} (${repo})`,
      empty: (column: string) => `The column "${column}" has no card to plan`,
      sent: (name: string) => `Plan request sent to ${name}`,
    },
    github: {
      failed: (detail: string) => `GitHub: ${detail}`,
      synced: (repo: string) => `Synced with ${repo}`,
      created: (number: number) => `Issue #${number} created`,
    },
  },
);
