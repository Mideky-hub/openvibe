import { defineMessages, plural } from "@/i18n";
import type { LoopError, LoopTemplate, LoopTrigger } from "./model";
import type { StopReason } from "./engine";

/** Texts of the loops (spec boucles). */
export const loopsMessages = defineMessages(
  {
    section: "Boucles",
    manage: "Gérer les boucles…",
    manageKeywords: ["boucle", "boucles", "récurrent", "répéter", "automatique", "loop"],
    stopAll: (running: number) => `Boucles : tout arrêter (${running})`,
    stopAllKeywords: ["boucle", "arrêter", "stop", "tout", "urgence"],
    indicator: {
      label: (loops: number, runs: number) => `${plural("fr", loops, "boucle", "boucles")} · ${plural("fr", runs, "tour", "tours")}`,
      stopAll: "Tout arrêter",
      open: "Ouvrir les boucles",
    },
    dialog: {
      title: "Boucles",
      description: "Une consigne qui repart toute seule. Chaque tour consomme de l'usage réel : toute boucle a une fin, et reste éteinte après un redémarrage.",
      empty: "Aucune boucle. Crée-en une, à partir d'un modèle si tu veux.",
      new: "Nouvelle boucle",
      templates: "Modèles",
      template: { progress: "Point d'avancement", relaunch: "Relance", tests: "Surveillance des tests" } as Record<LoopTemplate["id"], string>,
      templateInstruction: {
        progress: "Fais un point d'avancement en quelques lignes : ce qui est fait, ce qui reste, ce qui bloque.",
        relaunch: "Continue : reprends où tu t'es arrêté, ou dis ce qui te bloque.",
        tests: "Des tests échouent : lis la sortie, corrige la cause et relance-les.",
      } as Record<LoopTemplate["id"], string>,
      name: "Nom",
      instruction: "Consigne envoyée",
      targets: "Agents",
      noTargets: "Aucun agent sur le canvas",
      trigger: "Déclencheur",
      triggers: { interval: "Toutes les N minutes", idle: "Un agent devient inactif", output: "La sortie contient un texte" },
      minutes: "Minutes",
      text: "Texte à repérer",
      stop: "Fin de la boucle (au moins une)",
      maxRuns: "Nombre de tours",
      maxMinutes: "Durée en minutes",
      save: "Enregistrer",
      cancel: "Annuler",
      close: "Fermer",
      edit: "Modifier",
      remove: "Supprimer",
      turnOn: "Activer",
      turnOff: "Arrêter",
      off: "éteinte",
      round: (runs: number, max: number | undefined) => (max === undefined ? `tour ${runs}` : `tour ${runs} / ${max}`),
      untilEnd: (minutes: number) => `fin dans ${minutes} min`,
      stopped: { runs: "terminée : tours atteints", duration: "terminée : durée atteinte", manual: "arrêtée", noTargets: "arrêtée : plus d'agent" } as Record<StopReason, string>,
      cost: (loop: { trigger: LoopTrigger; maxRuns?: number; maxMinutes?: number }) => {
        const parts: string[] = [];
        if (loop.maxRuns !== undefined) parts.push(plural("fr", loop.maxRuns, "tour", "tours"));
        if (loop.maxMinutes !== undefined) parts.push(`${loop.maxMinutes} min`);
        return `jusqu'à ${parts.join(" ou ")}`;
      },
      triggerSummary: (trigger: LoopTrigger) =>
        trigger.kind === "interval" ? `toutes les ${trigger.minutes} min` : trigger.kind === "idle" ? "quand un agent devient inactif" : `quand « ${trigger.text} » apparaît`,
      errors: {
        name: "Donne un nom à la boucle",
        instruction: "Écris la consigne à envoyer",
        targets: "Choisis au moins un agent",
        interval: "L'intervalle va de 1 à 1440 minutes",
        text: "Le texte va de 1 à 200 caractères",
        runs: "Le nombre de tours va de 1 à 1000",
        minutes: "La durée va de 1 à 1440 minutes",
        stop: "Fixe une fin : un nombre de tours ou une durée",
      } as Record<LoopError, string>,
      full: "Trop de boucles (30 au plus) : supprime-en une d'abord",
      failed: (error: string) => `Boucles : opération impossible : ${error}`,
    },
  },
  {
    section: "Loops",
    manage: "Manage loops…",
    manageKeywords: ["loop", "loops", "recurring", "repeat", "automatic"],
    stopAll: (running: number) => `Loops: stop all (${running})`,
    stopAllKeywords: ["loop", "stop", "all", "emergency"],
    indicator: {
      label: (loops: number, runs: number) => `${plural("en", loops, "loop", "loops")} · ${plural("en", runs, "run", "runs")}`,
      stopAll: "Stop all",
      open: "Open loops",
    },
    dialog: {
      title: "Loops",
      description: "An instruction that sends itself again. Each run spends real usage: every loop has an end, and stays off after a restart.",
      empty: "No loop yet. Create one, from a template if you like.",
      new: "New loop",
      templates: "Templates",
      template: { progress: "Progress check", relaunch: "Relaunch", tests: "Test watch" } as Record<LoopTemplate["id"], string>,
      templateInstruction: {
        progress: "Give a short progress check: what is done, what is left, what is blocking.",
        relaunch: "Continue: pick up where you stopped, or say what is blocking you.",
        tests: "Tests are failing: read the output, fix the cause and run them again.",
      } as Record<LoopTemplate["id"], string>,
      name: "Name",
      instruction: "Instruction sent",
      targets: "Agents",
      noTargets: "No agent on the canvas",
      trigger: "Trigger",
      triggers: { interval: "Every N minutes", idle: "An agent becomes idle", output: "Output contains a text" },
      minutes: "Minutes",
      text: "Text to spot",
      stop: "End of the loop (at least one)",
      maxRuns: "Number of runs",
      maxMinutes: "Duration in minutes",
      save: "Save",
      cancel: "Cancel",
      close: "Close",
      edit: "Edit",
      remove: "Delete",
      turnOn: "Turn on",
      turnOff: "Stop",
      off: "off",
      round: (runs: number, max: number | undefined) => (max === undefined ? `run ${runs}` : `run ${runs} / ${max}`),
      untilEnd: (minutes: number) => `ends in ${minutes} min`,
      stopped: { runs: "done: runs reached", duration: "done: duration reached", manual: "stopped", noTargets: "stopped: no agent left" } as Record<StopReason, string>,
      cost: (loop: { trigger: LoopTrigger; maxRuns?: number; maxMinutes?: number }) => {
        const parts: string[] = [];
        if (loop.maxRuns !== undefined) parts.push(plural("en", loop.maxRuns, "run", "runs"));
        if (loop.maxMinutes !== undefined) parts.push(`${loop.maxMinutes} min`);
        return `up to ${parts.join(" or ")}`;
      },
      triggerSummary: (trigger: LoopTrigger) =>
        trigger.kind === "interval" ? `every ${trigger.minutes} min` : trigger.kind === "idle" ? "when an agent becomes idle" : `when “${trigger.text}” appears`,
      errors: {
        name: "Give the loop a name",
        instruction: "Write the instruction to send",
        targets: "Choose at least one agent",
        interval: "The interval is 1 to 1440 minutes",
        text: "The text is 1 to 200 characters",
        runs: "The number of runs is 1 to 1000",
        minutes: "The duration is 1 to 1440 minutes",
        stop: "Set an end: a number of runs or a duration",
      } as Record<LoopError, string>,
      full: "Too many loops (30 at most): delete one first",
      failed: (error: string) => `Loops: operation failed: ${error}`,
    },
  },
);
