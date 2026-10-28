import { defineMessages } from "@/i18n";
import type { KanbanPriority } from "@/nodes/types";

/** The texts of the Kanban node (issue #29). */
export const kanbanNodeMessages = defineMessages<{
  notFound: string;
  title: string;
  empty: string;
  addColumn: string;
  newColumn: string;
  columnMenu: (title: string) => string;
  rename: string;
  removeColumn: string;
  doubleClickRename: string;
  cardCount: (count: number) => string;
  newCard: string;
  addCardTo: (title: string) => string;
  editCard: string;
  cardTitle: string;
  cardTitlePlaceholder: string;
  notes: string;
  notesPlaceholder: string;
  due: string;
  dueNone: string;
  dueToday: string;
  dueTomorrow: string;
  dueNextWeek: string;
  dueDate: string;
  priority: string;
  priorities: Record<KanbanPriority, string>;
  save: string;
  cancel: string;
  remove: string;
  overdue: string;
  githubIssue: (repo: string, number: number) => string;
}>(
  {
    notFound: "Tableau introuvable",
    title: "Kanban",
    empty: "Aucune colonne pour l'instant.",
    addColumn: "Ajouter une colonne",
    newColumn: "Nouvelle colonne",
    columnMenu: (title) => `Menu de la colonne ${title}`,
    rename: "Renommer",
    removeColumn: "Supprimer la colonne",
    doubleClickRename: "Double-clic pour renommer",
    cardCount: (count) => `${count} carte${count > 1 ? "s" : ""}`,
    newCard: "Nouvelle carte",
    addCardTo: (title) => `Nouvelle carte dans ${title}`,
    editCard: "Modifier la carte",
    cardTitle: "Titre",
    cardTitlePlaceholder: "Que faut-il faire ?",
    notes: "Notes",
    notesPlaceholder: "Détails, liens, critères…",
    due: "Échéance",
    dueNone: "Aucune",
    dueToday: "Aujourd'hui",
    dueTomorrow: "Demain",
    dueNextWeek: "Semaine prochaine",
    dueDate: "Date",
    priority: "Priorité",
    priorities: { none: "Aucune", low: "Basse", medium: "Moyenne", high: "Haute" },
    save: "Valider",
    cancel: "Annuler",
    remove: "Supprimer",
    overdue: "En retard",
    githubIssue: (repo, number) => `Issue ${repo}#${number}`,
  },
  {
    notFound: "Board not found",
    title: "Kanban",
    empty: "No columns yet.",
    addColumn: "Add a column",
    newColumn: "New column",
    columnMenu: (title) => `${title} column menu`,
    rename: "Rename",
    removeColumn: "Delete the column",
    doubleClickRename: "Double-click to rename",
    cardCount: (count) => `${count} card${count === 1 ? "" : "s"}`,
    newCard: "New card",
    addCardTo: (title) => `New card in ${title}`,
    editCard: "Edit the card",
    cardTitle: "Title",
    cardTitlePlaceholder: "What needs doing?",
    notes: "Notes",
    notesPlaceholder: "Details, links, criteria…",
    due: "Due",
    dueNone: "None",
    dueToday: "Today",
    dueTomorrow: "Tomorrow",
    dueNextWeek: "Next week",
    dueDate: "Date",
    priority: "Priority",
    priorities: { none: "None", low: "Low", medium: "Medium", high: "High" },
    save: "Save",
    cancel: "Cancel",
    remove: "Delete",
    overdue: "Overdue",
    githubIssue: (repo, number) => `Issue ${repo}#${number}`,
  },
);
