# OpenVibe — Presets d'équipes : enregistrer une topologie, la déployer d'un geste (spec)

Date : 2026-11-01. Idée du backlog (Automatisation) : déployer d'un coup plusieurs groupes et leur orchestrateur. Identité propre à OpenVibe : un preset est la **forme** d'une équipe (groupes, rôles, agents, liaisons), jamais son contenu (consignes, missions, historiques).

## 1. Objectif

Après avoir monté une équipe sur le canvas (par exemple deux groupes « Backend » et « Tests » reliés à un orchestrateur), l'enregistrer sous un nom, puis la reposer dans n'importe quel projet par une ligne de la palette.

### Critère de succès

- « Enregistrer l'équipe comme preset… » demande un nom et garde la topologie du workspace affiché.
- « Déployer l'équipe : <nom> » pose les groupes, les orchestrateurs et leurs liaisons, et démarre les agents, en un geste.
- La liste des presets survit au redémarrage, vaut pour tous les projets, et un fichier abîmé ne casse rien.

## 2. Périmètre

**Inclus** : capture des groupes (nom, rôle, spécialité, agent de chaque case, place relative), des orchestrateurs reliés à au moins un groupe (nom, groupes reliés), enregistrement, déploiement, suppression, lignes de palette.

**Hors périmètre** : terminaux hors groupe, liaisons directes à un terminal, mission et plan d'un orchestrateur, dossiers de travail, modèles choisis, historiques, tuile web (le widget n'existe pas encore), renommer ou réordonner un preset, partage par fichier.

## 3. Décisions

| Sujet | Décision | Pourquoi |
|---|---|---|
| Contenu | Seulement la forme : rôle, spécialité, agent par case, liaisons | Rien de sensible ni de propre au projet n'est gardé |
| Stockage | Réglage `presets.teams` (JSON, version 1), global à l'application | Une équipe « Dev HQ » sert à tous les projets ; mécanisme déjà là (`get_setting`) |
| Lecture | Chaque preset est validé un par un ; un preset invalide est écarté, les autres restent ; au plus 50 presets, 12 agents par groupe | Un réglage abîmé ne doit rien bloquer |
| Nom | Rogné, 1 à 60 caractères, unique sans tenir compte de la casse ; enregistrer sous un nom existant le remplace | Évite deux lignes identiques dans la palette |
| Place | Positions relatives au coin de la boîte englobante ; la boîte est centrée sur la vue, poussée vers le bas si elle couvre du contenu | Même règle que « Composer un groupe » (`clearSpot`) |
| Agents | Chaque case reprend son agent ; un agent absent de l'ordinateur est remplacé par l'agent par défaut, et le dit | Le preset doit marcher sur une autre machine |
| Noms et panthéons | Neufs à chaque déploiement, comme pour un groupe composé à la main | Jamais deux groupes aux mêmes prénoms |
| Rôles des agents (issue #66) | Le groupe est créé avec son rôle et sa spécialité ; au lancement, un agent Claude d'un groupe reçoit une ligne de plus dans ses consignes (`--append-system-prompt-file`) : nom, rôle et spécialité du groupe, ramenés à une ligne de 300 caractères au plus. Rien pour un groupe Général sans spécialité (celui d'une mission), ni pour les autres agents, qui n'ont pas de fichier de consignes | Un agent déployé sait à quoi sert son groupe dès sa première réponse ; un nom tapé à la main ne peut pas se faire passer pour d'autres consignes |
| Orchestrateur | Posé à gauche du premier groupe relié (`orchestrateGroup`), relié aux autres, renommé comme enregistré ; sans Claude Code, rien n'est posé et le dit | Réutilise la règle « sans Claude, pas d'orchestrateur » |
| Démarrage | Choisir « Déployer » est le choix de démarrer les agents (usage réel) ; la ligne de palette annonce le nombre d'agents. Les tests, eux, ne lancent jamais d'agent réel : le déploiement reçoit ses fonctions de pose | Honnête sur le coût, sûr à tester |
| Annulation | Un groupe par étape d'annulation (chaque pose est annulable) | Évite de réécrire la pose des groupes |
| Palette | Section « Équipes » : « Enregistrer l'équipe comme preset… », puis par preset « Déployer l'équipe : <nom> (N agents) » et « Supprimer le preset : <nom> » ; sans équipe sur le canvas, « Enregistrer » est absent | Les lignes dynamiques s'ajoutent à la liste du registre à l'ouverture |
| Textes | FR et EN dans `src/presets/messages.ts` | Règle du projet |

## 4. Parties

- `src/presets/model.ts` : types, `capturePreset`, `readPresets` (validation), `presetAgentCount`, `withPreset`.
- `src/presets/store.ts` : liste en mémoire, chargement et enregistrement par `get_setting` / `set_setting`.
- `src/presets/deploy.ts` : `deployPreset(preset, deps)`, les fonctions de pose passées en paramètre.
- `src/presets/commands.ts` : les lignes de palette.
- `src/presets/SavePresetDialog.tsx` : la fenêtre du nom, ouverte par une demande d'interface `savePreset`.

## 5. Tests

Capture (groupes seuls, orchestrateurs sans groupe écartés, positions relatives), validation de lecture (un preset invalide écarté, plafonds), nom unique, déploiement avec de fausses fonctions de pose (ordre, agents remplacés, orchestrateur relié, Claude absent), lignes de palette (libellés, nombre d'agents, absence sans équipe), fenêtre du nom.
