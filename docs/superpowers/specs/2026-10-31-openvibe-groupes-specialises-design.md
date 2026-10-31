# OpenVibe — Des groupes spécialisés pour les missions (spec)

- **Date** : 2026-10-31
- **Statut** : écrite pendant une nuit sans surveillance, décisions prises seul (§5), à relire par Mathieu.
- **Étend** : `2026-10-26-openvibe-orchestrateur-manager-design.md` (« spec orchestrateur » : §7.2 outils, §7.3 équipe, §7.7 fin) et la spec habillage §11 (groupes). Tout le reste est régi par elles.

## 1. Objectif

Un orchestrateur relié à plusieurs groupes (frontend, backend, design…) distribue aujourd'hui le travail sans savoir à quoi sert chacun. L'utilisateur donne une **spécialité** à un groupe ; l'orchestrateur la voit et confie chaque sous-tâche au groupe le plus pertinent. Un groupe sans spécialité se comporte comme aujourd'hui.

## 2. La spécialité d'un groupe

- Texte libre d'une ligne, 40 caractères au plus (espaces réduits), enregistré avec le groupe : `customData.openvibe.speciality` du cadre, optionnel. Annuler (Ctrl+Z) le retire ou le remet ; dégrouper ou fermer le groupe l'emporte avec lui.
- Menu du groupe → « Spécialité » : un champ libre qui prend le clavier à l'ouverture (Entrée valide, flèche bas passe aux suggestions, et le texte en cours garde le clavier quand la souris passe sur une suggestion), les rôles de groupe en suggestions (Frontend, Backend, Testeurs, Relecteurs, Design, Docs, Sécurité : déjà traduits) et « Aucune » quand une spécialité est posée.
- L'étiquette du groupe sur le canvas l'affiche après le nom, tronquée, le texte entier au survol.
- La spécialité est indépendante du rôle : le rôle donne la couleur, la spécialité ne parle qu'à l'orchestrateur. Le rôle d'un groupe n'en tient pas lieu : sans spécialité posée, rien ne change.

## 3. Ce que voit l'orchestrateur

Tout est additif (spec orchestrateur §4.3 et §7.2 inchangées).

| Outil | Ajout |
|---|---|
| `mission` | Chaque élément de `linked_agents` : `group` et `speciality` (`null` hors groupe, ou sans spécialité). Nouveau `linked_groups` : `{ name, speciality }` de chaque groupe relié, même sans agent libre. Espace non affiché : `linked_groups` porte le même texte que `linked_agents`. Le plan : `group` de chaque sous-tâche. |
| `team` | Chaque agent : `group` et `speciality`, pour choisir à qui réattribuer ; absents quand l'espace n'est pas affiché (`null` dirait « pas de groupe »). |
| `propose_plan` | Sous-tâche : `group` facultatif, le nom d'un groupe relié, **seulement avec `agent: "new"`**. Un groupe inconnu, ou `group` avec un agent nommé, est refusé (`isError`), le plan en attente intact. Sans `group`, l'agent nouveau va dans le groupe « Mission <nom> », comme aujourd'hui. |

Le panneau de la mission affiche le groupe choisi sur la ligne de la sous-tâche (`nouveau → Frontend`).

Consigne de l'orchestrateur (FR et EN) : avant de découper, regarder les spécialités ; confier chaque sous-tâche à un agent du groupe le plus pertinent ; s'il n'y a pas d'agent libre, `new` avec `group` ; une sous-tâche sans groupe pertinent et un groupe sans spécialité se distribuent comme d'habitude. La spécialité oriente, elle n'interdit rien.

## 4. Un agent nouveau dans un groupe choisi

- Au feu vert (spec orchestrateur §7.3) : l'agent est créé dans la première case libre du groupe, avec un prénom du panthéon de ce groupe, dans son worktree de mission ; le groupe grandit s'il est plein.
- Le groupe a été délié ou fermé entre le plan et le feu vert : le lancement échoue avant de toucher à git, ou après la création des worktrees (ils sont retirés), avec une erreur lisible, comme un agent relié perdu. L'orchestrateur repropose.
- La vue cadre les groupes qui reçoivent un agent : un agent hors écran ne démarre pas.
- À la fin (`finish`) : l'agent reste un agent nouveau, il est fermé comme les autres (spec orchestrateur §7.7), le groupe et ses agents d'origine restent. L'espace n'étant pas affiché, il est arrêté, comme les autres agents créés.
- `reassign` vers `new` : le remplaçant rejoint le groupe de la sous-tâche s'il existe encore, sinon le groupe de la mission.

## 5. Décisions

| Sujet | Décision | Pourquoi |
|---|---|---|
| Stockage | `customData.openvibe` du cadre | Comme `role` et `pantheon` : vient avec la scène, l'annulation et les copies. |
| Saisie | Sous-menu du menu de groupe | Demandé par le backlog ; marche aussi depuis le panneau des agents, où l'étiquette n'est pas à l'écran. |
| Suggestions | Les libellés des rôles | Déjà traduits, pas de deuxième liste. La valeur enregistrée est le texte, comme tout texte libre. |
| Référence au groupe dans le plan | Identifiant et nom | Survit à un renommage ; l'orchestrateur parle par nom. |
| Deux groupes reliés de même nom | Le premier relié | Cas rare, sans conséquence grave ; pas d'erreur de plus. |
| Groupe d'un agent relié directement | `group` montre son groupe, mais seuls les groupes reliés acceptent un `new` | Un groupe non relié n'appartient pas à l'orchestrateur. |
| Agent nommé + `group` | Refusé | Un agent relié ne change pas de groupe ; ignorer l'argument cacherait l'erreur. |

## 6. Hors périmètre

- Choisir une spécialité à la création du groupe (Composer un groupe), l'afficher dans le panneau des agents, une commande de palette.
- Toute contrainte dure : l'orchestrateur reste libre de son choix.

## 7. Tests

- Automatisés : lecture et écriture de la spécialité, sous-menu, outils (`mission`, `team`, `propose_plan`, traduction de `group`), lancement (groupe choisi, groupe perdu, panthéon), fin, réattribution, consignes FR et EN.
- À vérifier par Mathieu dans l'application : le sous-menu (saisie, focus, clavier), l'étiquette, une mission réelle qui place un agent `new` dans un groupe puis le ferme à la fin.
