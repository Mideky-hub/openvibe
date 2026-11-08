import { defineMessages } from "@/i18n";

/** The texts of the goals checklist widget (issue #36). */
export const goalsMessages = defineMessages(
  {
    title: "Objectifs",
    empty: "Aucun objectif",
    add: "Ajouter un objectif",
    newGoal: "Nouvel objectif",
    newGoalPlaceholder: "Un objectif, puis Entrée",
    progress: (done: number, total: number) => `${done}/${total}`,
    progressLabel: (done: number, total: number) => `${done} objectif${done > 1 ? "s" : ""} atteint${done > 1 ? "s" : ""} sur ${total}`,
    tick: (text: string) => `Cocher « ${text} »`,
    untick: (text: string) => `Décocher « ${text} »`,
    doubleClickEdit: "Double-clic pour modifier",
    edit: "Modifier l'objectif",
    remove: "Retirer l'objectif",
    move: (text: string) => `Déplacer « ${text} » (glisser, ou flèches haut et bas)`,
    placeFailed: (error: string) => `Objectifs impossibles : ${error}`,
  },
  {
    title: "Goals",
    empty: "No goals",
    add: "Add a goal",
    newGoal: "New goal",
    newGoalPlaceholder: "A goal, then Enter",
    progress: (done: number, total: number) => `${done}/${total}`,
    progressLabel: (done: number, total: number) => `${done} of ${total} goal${total > 1 ? "s" : ""} reached`,
    tick: (text: string) => `Tick "${text}"`,
    untick: (text: string) => `Untick "${text}"`,
    doubleClickEdit: "Double-click to edit",
    edit: "Edit the goal",
    remove: "Remove the goal",
    move: (text: string) => `Move "${text}" (drag, or up and down arrows)`,
    placeFailed: (error: string) => `Could not create the goals list: ${error}`,
  },
);
