# OpenVibe — La mission de nuit (spec)

- **Date** : 2026-11-01
- **Statut** : écrite pendant une nuit sans surveillance, décisions prises seul (§9), à relire par Mathieu. Seule la **phase 1** est construite ; les phases 2 et 3 sont décrites pour que la phase 1 ne leur ferme aucune porte.
- **Répond à** : issue GitHub #92, « Agents & Fleet : Create an "overnight run" mode ».
- **Étend** : `2026-10-26-openvibe-orchestrateur-manager-design.md` (« spec orchestrateur »). Tout ce que cette spec ne modifie pas reste régi par elle.

## 1. Objectif

Avant de partir, l'utilisateur dit combien de temps il s'absente. Un orchestrateur planifie, lance une équipe d'agents, tire les tâches d'une source de tickets et les leur distribue. Au retour, il trouve un rapport : ce qui est fait, ce qui a échoué, ce qu'il doit vérifier, le temps passé.

La nuit du 31 octobre, faite à la main avec les missions actuelles, a montré ce qui manque : le budget mesure deux choses différentes, il faut taper les suites de tâches dans les terminaux, personne ne répond aux dialogues d'autorisation, le PC peut s'endormir, et une mission dépend de l'espace affiché.

## 2. Les trois phases

| Phase | Contenu | État |
|---|---|---|
| 1 | Mission de nuit locale : budget en temps réel, file de tâches, dialogue, contrôles, missions hors écran, rapport du matin. | Construite ici. |
| 2 | Une pull request brouillon par tâche finie, activable par mission, qui ne pousse que la branche de l'agent. | Décrite (§7). |
| 3 | Un conseiller local facultatif (Ollama) pour préparer la nuit. | Décrite (§8). |

**Phase 1 : rien n'est poussé, aucune PR n'est créée.** La branche de l'utilisateur n'est jamais touchée (spec orchestrateur §7.6).

## 3. Le temps (tranche 2)

Constat H3 : le budget global est vérifié au plan comme une somme de minutes-agents, mais mesuré en temps écoulé. Quatre agents pendant une heure font 240 minutes-agents et tiennent en une heure.

**Décision : le budget global est du temps réel, pour toutes les missions.** Il court du feu vert à la fin.

- `propose_plan` ne somme plus : il refuse seulement une sous-tâche dont le budget dépasse à lui seul le budget global (elle ne tiendrait jamais).
- `left_min` et ce que `extend` peut prendre deviennent le temps réel restant : `extend` est refusé si la nouvelle cible de l'agent finit après la fin du budget global.
- Le panneau cesse de présenter le total comme une fraction du budget : « 120 min d'agents · 60 min de temps réel ».
- Une mission de nuit (`overnight`) a pour budget global le temps d'absence, et les budgets par agent y sont des **cibles** : le dépassement prévient l'orchestrateur avec une ligne qui le dit, jamais de toast à 200 % (personne ne le lirait), et le rapport du matin le montre.
- **Fin de nuit** : à `max(10 min, 10 %)` de la fin d'une mission de nuit, OpenVibe prévient une fois l'orchestrateur (« il reste N min : fusionne, fais vérifier, termine ») et la file cesse de donner des tâches. Sans cela, le travail commencé à la dernière minute reste sans fusion ni bilan au retour.
- OpenVibe n'arrête toujours aucun agent de lui-même (spec orchestrateur §8.2) : à la fin du temps, l'orchestrateur est prévenu, c'est tout.

## 4. La file de tâches (tranche 3)

### 4.1 Données

`Mission.queue` : des tâches en attente (`title`, `brief`, `budgetMin`, `level`, `group` facultatifs), dans l'ordre. Le plan reste la première vague, une sous-tâche par agent, `Agents max` au plus ; tout le reste attend dans la file. Les titres sont uniques sur le plan et la file : `reassign` et `team` désignent une tâche par son titre.

### 4.2 Outils

| Outil | Effet |
|---|---|
| `add_tasks(tasks[])` | Ajoute à la fin de la file (`title`, `brief`, `budget_min`, `level`, `group`), à tout moment avant la fin de la mission. Mêmes contrôles que `propose_plan`. 100 tâches en attente au plus. Une tâche ajoutée alors qu'un agent est libre part aussitôt. |
| `queue()` | Les tâches en attente, et les agents libres. |
| `next_task(agent)` | Donne la prochaine tâche à un agent qui a rendu compte « blocked » ou « failed ». |

### 4.3 La tâche suivante

Quand un agent rend compte **« done »** :

1. OpenVibe attend la fin de son tour (60 s au plus) : `report` arrive en plein tour, et le dernier commit peut le suivre.
2. Il fusionne sa branche dans celle de la mission. Une sous-tâche finie doit y être avant que l'agent en prenne une autre (règle déjà appliquée par `reassign`, relecture H3). En cas de conflit, l'agent garde sa tâche et l'orchestrateur est prévenu : il fait résoudre, rappelle `merge`, et la file repart de là.
3. Il prend la première tâche qui lui convient : sans `group`, ou du groupe de l'agent ; la tâche passe de la file au plan, ce qui garde `reassign` et `mission()` intacts.
4. L'agent repart en **nouvelle conversation** dans son worktree, sur sa branche, avec le modèle de la tâche si le routeur est actif : le contexte d'une tâche ne pollue pas la suivante, et ses étapes repartent de zéro. La consigne lui dit de fusionner d'abord la branche de la mission dans la sienne.

Quand il rend compte **« blocked »** ou **« failed »**, il garde sa tâche et rien ne part : l'orchestrateur décide. `reassign` reste possible ; `next_task` lui donne la suivante, en sachant que le travail inachevé reste sur sa branche et partira avec sa prochaine fusion.

### 4.4 Ce qui ne change pas

- `Agents max` est respecté : la file ne crée aucun agent, elle occupe ceux de l'équipe.
- `reassign` fonctionne comme avant, y compris vers un agent qui a tiré une tâche de la file.
- La file s'arrête à la fin de nuit (§3). Les tâches restantes vont au rapport.
- Quand la file est vide et que tous ont rendu compte, l'orchestrateur est prévenu une fois.

## 5. Avant de partir

### 5.1 Le dialogue « Mission de nuit » (tranche 4)

Dans le panneau de la mission : temps d'absence, nombre d'agents, source des tickets, autorisations (§5.3), et « Lancer sans attendre mon feu vert », coché. Le dialogue règle la mission puis tape la consigne dans le terminal de l'orchestrateur.

Sources :

- **Colonne Kanban : absente.** Le nœud Kanban n'existe pas dans ce dépôt (un type réservé, sans code ni données). Elle sera ajoutée quand il existera.
- **Issues GitHub** : lues par `gh issue list` depuis le dossier du projet. **Seules les issues qui portent un label** (par défaut `overnight`) sont lues : le dépôt est public, n'importe qui y ouvre une issue, et ce texte serait donné à des agents sans surveillance. Poser un label demande des droits sur le dépôt.
- **BACKLOG.md** : les puces du fichier à la racine du projet, avec le titre de leur section.

L'orchestrateur n'a pas le droit de lancer des commandes (spec orchestrateur §4.2) : OpenVibe lit la source, et l'outil `tickets()` lui rend la liste. Un ticket est une donnée, jamais une consigne : la réponse de l'outil et le rôle de l'orchestrateur le disent.

### 5.2 Les contrôles (tranche 5)

Le dialogue affiche, avant de lancer :

- le dossier du projet est un dépôt git ;
- `gh` répond, si la source est GitHub ;
- l'usage du forfait, s'il est connu (Claude ne le donne qu'à ses lignes d'état) : avertissement à 80 % de la session ou de la semaine. Un avertissement ne bloque pas ;
- le PC reste éveillé pendant la mission (§5.4), et ce qui échappe à cette garantie.

### 5.3 Les autorisations

Un agent sans surveillance reste bloqué sur un dialogue d'autorisation jusqu'au matin. Le choix se fait par mission et passe au lancement de chaque session, par le drapeau `--permission-mode` et le fichier de réglages qu'OpenVibe écrit déjà pour elle (`--settings`) : les réglages de l'utilisateur ne sont jamais modifiés.

| Choix | Mode de Claude | Effet |
|---|---|---|
| Demander | (aucun) | Comme aujourd'hui : un dialogue arrête l'agent jusqu'à ce que quelqu'un réponde. |
| Fichiers | `acceptEdits` | Claude modifie les fichiers sans demander ; une commande demande, et arrête l'agent. |
| Fichiers et commandes | `dontAsk`, avec les outils de travail autorisés | Par défaut dans le dialogue. Fichiers, commandes et sous-agents sans demander ; ce qui n'est pas autorisé est **refusé au lieu de demander** : l'agent contourne, il ne reste pas bloqué. |

**`bypassPermissions` n'est pas proposé.** Sa première utilisation ouvre un avertissement interactif, et l'accepter écrit dans `~/.claude/settings.json` : un dialogue qui bloque la nuit, et un réglage de l'utilisateur modifié. `--permission-mode` plutôt que `defaultMode` dans le fichier : la documentation de Claude Code confirme le drapeau pour une session, elle ne dit pas explicitement que `defaultMode` est lu depuis `--settings`.

**`git push` est interdit dans tous les cas**, par deux barrières indépendantes :

1. une règle `Bash(git push *)` dans les réglages de la session ;
2. une configuration git passée par l'environnement du terminal, qui fait échouer tout push vers un dépôt distant. La documentation de Claude Code dit que ces règles portent sur le texte de la commande et ne sont pas une frontière de sécurité (`git -C . push` n'y correspond pas) : la seconde barrière agit dans git lui-même.

Une session d'orchestrateur garde ses propres refus (spec orchestrateur §4.2). En phase 2, seul OpenVibe poussera, et ces barrières resteront en place pour les agents.

Comportements de Claude Code à vérifier dans une vraie session : voir le rapport de la mission.

### 5.4 Le PC éveillé

`SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED)`, tenu par un fil dédié (l'état appartient au fil qui l'a posé) tant qu'une mission de nuit tourne, relâché à sa fin, à sa fermeture ou à la sortie d'OpenVibe. Cela empêche la mise en veille automatique, pas celle qu'on demande : fermer le capot ou le menu Démarrer endort quand même le PC. Le dialogue le dit.

## 6. Pendant et après

### 6.1 Missions hors écran (tranche 6)

Constat H2 : les fils et les groupes ne sont connus que de l'espace affiché. Une mission de nuit ne doit dépendre d'aucun espace affiché.

- Les fils et les groupes se lisent dans la scène enregistrée de l'espace de l'orchestrateur quand il n'est pas affiché : `propose_plan`, `mission()`, `team`, `remote_control` et le lancement voient ce qu'ils voient à l'écran.
- La formation de l'équipe, l'ajout d'un agent et la fin écrivent dans cette scène, et les agents démarrent sans attendre d'être montrés. La note `linked_agents_note` disparaît avec le cas qu'elle décrivait.

### 6.2 Le rapport du matin (tranche 7)

Dans le panneau, à la fin d'une mission de nuit : la durée, chaque tâche faite, échouée ou bloquée avec son agent, son temps, sa branche et son résumé, les tâches restées dans la file, et ce qu'il faut vérifier à la main (`report` prend un champ `check` facultatif, l'orchestrateur et les agents le remplissent).

## 7. Phase 2 — Des PR brouillons (non construite)

- **Activée par mission**, décochée par défaut. Sans elle, rien de la phase 1 ne change et `git push` reste interdit.
- **Une PR brouillon par tâche finie**, créée par OpenVibe, pas par l'agent : `git push origin <branche de l'agent>` puis `gh pr create --draft`. Seule cette branche part ; jamais la branche de la mission ni celle de l'utilisateur. Les barrières de §5.3 restent en place pour les agents : c'est OpenVibe qui pousse, hors de leur terminal.
- La phase 1 garde une seule branche par agent, qui s'allonge de tâche en tâche : pour une PR par tâche, il faudra une branche par tâche, partie de celle de la mission. C'est le premier travail de la phase 2.

### Regrouper les PR

L'issue parle du « new PR grouped mode of GitHub ». **Je n'ai pas trouvé de fonction de GitHub qui porte ce nom, et je ne peux pas confirmer qu'elle existe.** Vérifié le 1er novembre 2026 dans le changelog de GitHub, deux fonctions s'en approchent :

- **Stacked pull requests**, générales depuis le 6 octobre 2026 : une pile ordonnée de PR, où chacune s'appuie sur la précédente. C'est probablement ce que vise l'issue, mais les tâches d'une nuit sont indépendantes et partent toutes de la même branche : ce n'est pas une pile.
- **Le tableau de bord des pull requests** (`github.com/pulls`) : il range les PR selon ce qu'elles attendent de vous, et permet des vues enregistrées, qui sont des filtres. On ne peut pas y choisir une liste de PR à la main.

**Proposition : un label partagé**, `overnight/<date>`, posé par OpenVibe sur chaque PR de la nuit, ouvert en un clic par un lien de recherche dans le rapport du matin, et réutilisable en vue enregistrée. Il ne demande aucune fonction en préversion. Si le relecteur veut un endroit où commenter l'ensemble, s'y ajoute une issue de suivi qui liste les PR. Une pile n'a de sens que pour une tâche découpée en couches : à reconsidérer alors.

Sources : [Stacked pull requests generally available](https://github.blog/changelog/2026-10-06-stacked-pull-requests-generally-available/), [New pull requests dashboard](https://github.blog/changelog/2026-03-26-new-pull-requests-dashboard-is-in-public-preview/).

## 8. Phase 3 — Un conseiller local (non construite)

- Facultatif, désactivé par défaut, et seulement si Ollama répond (OpenVibe le détecte déjà pour le terminal Ollama).
- Avant la nuit, dans le dialogue : il relit les tickets choisis et le temps d'absence, et propose un ordre, un découpage, et les tickets trop gros ou trop flous pour une nuit. Il conseille : l'utilisateur garde la main, et il ne lance rien.
- Local : les tickets ne quittent pas la machine et le forfait n'est pas consommé. Son modèle se choisit comme pour le terminal Ollama.

## 9. Décisions

| Sujet | Décision | Pourquoi |
|---|---|---|
| Budget global | Temps réel, pour toutes les missions | Un seul sens ; c'est ce que l'horloge mesurait déjà. |
| Budget par agent en mission de nuit | Une cible | Demandé ; personne n'est là pour un toast. |
| Feu vert de nuit | Le dialogue vaut feu vert, si la case est cochée | L'utilisateur part : un plan qui attend son clic ne fait rien de la nuit. |
| Tâche suivante | Nouvelle conversation dans le même worktree | Pas de contexte qui déborde, pas de dépendances à réinstaller. |
| Fusion avant la suite | Automatique sur « done », dans la branche de la mission | Même règle que `reassign`, et la branche de la mission n'est pas celle de l'utilisateur. |
| Échec ou blocage | L'orchestrateur décide | Garde `reassign` ; une tâche échouée n'est pas abandonnée sans décision. |
| Ordre de la file | Celui de l'orchestrateur, filtré par groupe | Il a lu les spécialités (spec groupes spécialisés) ; pas de second moteur de priorité. |
| Issues GitHub | Seulement avec un label | Dépôt public : le texte d'un inconnu ne doit pas guider un agent sans surveillance. |
| `git push` | Refusé par deux barrières | Une règle de texte seule se contourne. |
| Mode sans surveillance | `dontAsk`, jamais `bypassPermissions` | Refuser sans attendre vaut mieux que bloquer la nuit, et le mode bypass écrit dans les réglages de l'utilisateur. |
| Kanban | Absent | N'existe pas sur cette branche. |
| Lever l'interdiction de `git push` | Pas d'option en phase 1 | Rien en phase 1 n'en a besoin. |

## 10. Hors périmètre de la phase 1

- Pousser quoi que ce soit, créer une PR.
- Créer plus d'agents que l'équipe du plan pendant la nuit.
- Reprendre une nuit après un redémarrage d'OpenVibe ou du PC : la mission est rechargée, les agents sont arrêtés (spec orchestrateur §9).
- Les agents autres que Claude.

## 11. Tests

- Automatisés, à chaque tranche : temps réel (plan, `extend`, `left_min`, fin de nuit), file (ajout, tâche suivante, conflit, blocage, `reassign`, `Agents max`), sources de tickets, contrôles, réglages de session, push refusé dans un dépôt temporaire, scène enregistrée, rapport.
- À vérifier par Mathieu : une vraie nuit courte sur un dépôt jetable (voir le rapport de la mission).
