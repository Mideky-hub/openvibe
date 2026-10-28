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
  github: {
    boardMenu: string;
    link: string;
    editLink: string;
    unlink: string;
    sync: string;
    syncing: string;
    linkTitle: string;
    linkHint: string;
    repo: string;
    repoPlaceholder: string;
    detecting: string;
    notDetected: string;
    repoInvalid: string;
    project: string;
    projectPlaceholder: string;
    projectInvalid: string;
    confirm: string;
    createIssue: string;
    creatingIssue: string;
    linkedTo: (repo: string) => string;
  };
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
    github: {
      boardMenu: "Menu du tableau",
      link: "Lier à GitHub…",
      editLink: "Modifier la liaison GitHub…",
      unlink: "Délier de GitHub",
      sync: "Synchroniser",
      syncing: "Synchronisation…",
      linkTitle: "Lier à GitHub",
      linkHint: "Les issues du dépôt deviennent des cartes ; déplacer une carte ferme, rouvre ou change le Status sur GitHub (via gh).",
      repo: "Dépôt",
      repoPlaceholder: "propriétaire/nom",
      detecting: "Détection du dépôt…",
      notDetected: "Aucun dépôt GitHub trouvé dans le remote origin du projet : saisis-le.",
      repoInvalid: "Format attendu : propriétaire/nom",
      project: "Project v2 (facultatif)",
      projectPlaceholder: "propriétaire/numéro ou URL du Project",
      projectInvalid: "Format attendu : propriétaire/numéro ou https://github.com/orgs/…/projects/N",
      confirm: "Lier et synchroniser",
      createIssue: "Créer l'issue sur GitHub",
      creatingIssue: "Création…",
      linkedTo: (repo) => `Lié à ${repo}`,
    },
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
    github: {
      boardMenu: "Board menu",
      link: "Link to GitHub…",
      editLink: "Edit the GitHub link…",
      unlink: "Unlink from GitHub",
      sync: "Sync",
      syncing: "Syncing…",
      linkTitle: "Link to GitHub",
      linkHint: "The repository's issues become cards; moving a card closes, reopens or changes the Status on GitHub (through gh).",
      repo: "Repository",
      repoPlaceholder: "owner/name",
      detecting: "Detecting the repository…",
      notDetected: "No GitHub repository in the project's origin remote: type it in.",
      repoInvalid: "Expected: owner/name",
      project: "Project v2 (optional)",
      projectPlaceholder: "owner/number or Project URL",
      projectInvalid: "Expected: owner/number or https://github.com/orgs/…/projects/N",
      confirm: "Link and sync",
      createIssue: "Create the issue on GitHub",
      creatingIssue: "Creating…",
      linkedTo: (repo) => `Linked to ${repo}`,
    },
  },
);
