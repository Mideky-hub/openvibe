# OpenVibe — Habillage Symvibe et flotte d'agents (spec)

- **Date** : 2026-10-24
- **Statut** : validée en brainstorming par Mathieu, en attente de relecture écrite
- **Étend** : `docs/superpowers/specs/2026-10-23-openvibe-v1-design.md` (« spec V1 »). Tout ce que cette spec ne modifie pas reste régi par la spec V1.
- **Référence visuelle** : 18 vidéos de démo de Symvibe (`Téléchargements\{board,node-*,studio-*,teams,tour,voice}.*.mp4`), analysées image par image. Les valeurs de couleur viennent de prélèvements sur vidéo compressée (±10 %).

## 1. Objectif

OpenVibe doit ressembler à Symvibe et s'utiliser comme lui pour piloter une flotte d'agents CLI sur le canvas, en usage personnel quotidien sous Windows 11.

### Critère de succès

1. Dans un dépôt, Mathieu lance un groupe de 4 à 8 agents Claude ou Codex en quelques clics.
2. Il voit d'un coup d'œil qui travaille, qui attend sa réponse et qui est inactif.
3. Il leur envoie une consigne commune depuis la barre de commande ou un orchestrateur.
4. Posée à côté des captures de Symvibe, l'application s'y confond : thème, barres flottantes, en-têtes des terminaux, groupes, sélection.

## 2. Périmètre

### Inclus

- Identité visuelle (thème sombre, jetons, polices) appliquée à toute l'application, Excalidraw compris.
- Coquille : écran d'accueil, barre du haut, rail gauche et ses menus, panneau de propriétés, rail droit (panneau Flotte), puces et barre de commande, puce git, zoom.
- Projets (dossier de dépôt) contenant des workspaces en onglets.
- Nœud terminal restylé, catalogue d'agents (Ollama compris), prénoms mythologiques, reprise des conversations.
- États des agents (travaille, attend ta réponse, inactif) et chronomètre.
- Groupes, composition de groupe, barre de commande avec `@`, orchestrateur, pause et reprise.

### Hors périmètre

Tout le reste de Symvibe est consigné dans `BACKLOG.md` (racine du dépôt) : widgets (kanban, calendrier, checklist, post-it, tuile web), fenêtre git commit et push, studios, boucles, mémoire, carte de mission, presets d'équipes, quotas et comptes, voix et directeur IA, thème clair, ainsi que les points mineurs reportés du plan 2.

Les nœuds Note, Kanban et Git Watcher de la spec V1 (§6.6 à §6.8) et les icônes cloud (§7) ne sont plus planifiés tels quels : ils passent au backlog et seront repris dans le style de cette spec.

## 3. Décisions

| Sujet | Décision |
|---|---|
| Moteur | Excalidraw reste le moteur de scène (spec V1 §15, option A). Notre interface est posée par-dessus et le pilote par son API ; Excalidraw n'est pas patché. |
| Projets | Un projet = un dossier de dépôt. Écran d'accueil listant les projets ; workspaces en onglets dans un projet ; les agents démarrent dans le dossier du projet (modifiable par terminal). |
| Barre de commande | Diffusion directe, sans IA : le texte est tapé dans les terminaux ciblés puis validé. |
| Pause | Pause envoie l'interruption de l'agent (Échap pour Claude) ; Reprendre envoie « continue ». |
| Langue | Interface entièrement en français. |
| Thème | Sombre uniquement pour l'instant. |
| Puce git | Lecture seule : branche et nombre de fichiers modifiés. |
| Prénoms | Noms de divinités ; chaque groupe tire ses prénoms d'une mythologie différente. |
| Restauration | Les terminaux restent restaurés arrêtés (spec V1 §5.5) ; un toast propose de reprendre toutes les conversations. |

## 4. Identité visuelle

### 4.1 Jetons

Définis comme variables CSS sur `:root` (thème sombre unique) ; les variables de shadcn (`--background`, `--card`, `--primary`…) sont redéfinies à partir d'eux.

| Jeton | Valeur | Usage |
|---|---|---|
| `--ov-canvas` | `#12110E` | fond du canvas et de l'accueil |
| `--ov-dot` | `#2A2A22` | points de la grille |
| `--ov-surface` | `#14140F` | rails, barres, panneaux, nœuds |
| `--ov-surface-2` | `#18150F` | popovers, menus, modales |
| `--ov-card` | `#1A1914` | cartes, lignes de liste, champs |
| `--ov-command` | `#252724` | barre de commande |
| `--ov-line` | `#2A2A22` | filets de 1 px |
| `--ov-hover` | `#301E12` | survol de ligne |
| `--ov-selected` | `#2A1C11` | ligne ou tuile sélectionnée |
| `--ov-text` | `#EDEAE2` | texte principal |
| `--ov-text-2` | `#8A8A80` | texte secondaire, libellés |
| `--ov-accent` | `#F4602E` | boutons principaux, outil actif, sélection, focus |
| `--ov-accent-soft` | `#3A1D14` | fond teinté des éléments actifs |
| `--ov-danger` | `#EF4444` | fermer, supprimer |
| `--ov-terminal` | `#161712` | corps des terminaux (fond xterm) |
| `--ov-terminal-head` | `#0B0B09` | en-tête des terminaux |

**États** : travaille `#E8553A`, attend ta réponse `#D9B35A`, inactif `#8A8A80`, terminé `#6A8E51`, erreur `#EF4444`, actif (compteur) `#4CAF6A`.

**Rôles de groupe** : Frontend `#C18E57`, Backend `#AA88D2`, Testeurs `#86A174`, Relecteurs `#90B1D4`, Design `#CE7B8F`, Docs `#77B7C0`, Sécurité `#D88479`, Général `#8A8A80`.

**Teintes d'agent** (bordure du nœud, tuiles du catalogue) : voir §8.

### 4.2 Typographie, formes, icônes

- Interface : Geist (déjà installée), 11 à 15 px ; titres en semi-gras.
- Données : Geist Mono (`@fontsource-variable/geist-mono`, à ajouter) pour les nombres, heures, chemins, branche, pastilles d'état et compteurs.
- Libellés de section : majuscules, interlettrage 0,06 em, 11 px, `--ov-text-2`.
- Terminaux : police inchangée (`'Cascadia Code', Consolas, monospace`), seul le fond passe à `--ov-terminal`.
- Textes du canvas : la police par défaut des nouveaux textes devient Comic Shanns (police « code » d'Excalidraw), comme les titres de section de Symvibe.
- Rayons : 16 px fenêtres et modales, 12 px nœuds et popovers, 8 à 10 px cartes et champs, pilule pour les boutons et puces.
- Icônes : Lucide, trait 1,5 px. Logos d'agents : petits SVG embarqués (§8).
- Ombres : douces et larges sur les éléments flottants (`0 8px 32px rgba(0,0,0,.45)`).

### 4.3 Couleurs dans le canvas Excalidraw

En thème sombre, Excalidraw applique au canvas le filtre `invert(93%) hue-rotate(180deg)`. La palette de notre menu Stylo stocke donc la couleur qui, après ce filtre, s'affiche avec la valeur voulue. Une fonction pure `toSceneColor(displayHex)` calcule cette couleur et sa réciproque `toDisplayColor(sceneHex)` sert à afficher la pastille sélectionnée. Le filtre ne peut pas tout afficher : les couleurs très saturées (rouge vif, cyan) ressortent plus ternes. Les pastilles du menu montrent donc la couleur réellement obtenue (`toDisplayColor(toSceneColor(c))`), jamais une couleur promise. Les deux fonctions sont testées sur des valeurs de référence calculées (par exemple, le trait par défaut d'Excalidraw `#1e1e1e` s'affiche `#d3d3d3`, et `#5E9A55` se stocke `#448a3a`) et en aller-retour exact sur les couleurs atteignables.

Palette affichée (traits et texte) : crème `#EDE8DF`, orange `#F2612E`, vert `#5E9A55`, or `#C9A34E`, rouge `#EF4444`, cyan `#5CC8F0`, lavande `#A47CF0`, ardoise `#4B5675`, plus une couleur personnalisée. Fonds : transparent, orange, vert, bleu, sable, rouge, violet, personnalisé. Trait par défaut des nouvelles formes : crème.

## 5. Coquille

Tous les éléments de la coquille sont des pastilles flottantes au-dessus du canvas, sans bandeau ni barre latérale. La barre latérale des workspaces (`src/sidebar/WorkspaceSidebar.tsx`) est supprimée.

### 5.1 Écran d'accueil

- Plein écran sur `--ov-canvas` avec la grille de points.
- En-tête : « OpenVibe », bouton « Ajouter un projet » (sélecteur de dossier natif).
- Cartes de projet (grille responsive) : nom (dossier par défaut, renommable), chemin en Geist Mono, nombre de workspaces, nombre d'agents actifs (point vert), dernière ouverture relative (« il y a 2 h »). Menu `⋯` : Renommer, Changer de dossier, Retirer de la liste (confirmation ; ne touche pas au dossier, supprime les workspaces du projet et arrête leurs agents).
- Clic sur une carte : ouvre le projet sur son dernier workspace actif.
- Dossier introuvable : la carte l'indique (« Dossier introuvable ») et ne propose que Changer de dossier ou Retirer.
- Au lancement de l'application, le dernier projet ouvert est rouvert directement ; l'accueil n'apparaît que s'il n'y en a aucun ou si son dossier a disparu.

### 5.2 Barre du haut

À 16 px du bord haut, alignée à gauche et à droite, pastilles de 32 px de haut.

- **Gauche** :
  - `← Accueil` ;
  - sélecteur de projet `▭ <nom> ⌄` (liste des projets récents, « Tous les projets… » ramène à l'accueil) ;
  - onglets de workspace : nom + badge du nombre d'agents vivants ; l'onglet actif a un contour orange et un fond `--ov-accent-soft`, son badge est orange ; double-clic pour renommer ; menu contextuel (clic droit ou `⋯` au survol) : Renommer, Supprimer (confirmation listant les agents qui seront arrêtés ; le dernier workspace d'un projet ne se supprime pas) ;
  - `+` nouveau workspace ;
  - `× Fermer` : ferme le projet et ramène à l'accueil (les agents continuent de tourner).
- **Droite** :
  - `● N actifs` : processus d'agents vivants dans tout le projet (point `#4CAF6A`) ;
  - bouton Réglages (engrenage) : menu avec Exporter la scène (`.excalidraw`), Importer une scène, Exporter en image, À propos.

### 5.3 Rail gauche

Pilule verticale de 44 px de large, centrée verticalement, à 16 px du bord gauche, fond `--ov-surface`, bord `--ov-line`. Outil actif : disque orange plein, icône blanche. Séparateurs fins entre les blocs.

| Outil | Icône | Action |
|---|---|---|
| Sélection | curseur | outil `selection` d'Excalidraw (raccourci V) |
| Agent | astérisque orange | ouvre le menu « Lancer un agent » (§10.1) |
| Formes | deux carrés | menu FORMES : Rectangle, Ellipse, Losange, Ligne, Flèche, Cadre ; garde la dernière forme comme outil du bouton |
| Texte | `Aa` | outil `text` |
| Stylo | plume | outil `freedraw` + menu COULEUR (8 + personnalisée) et ÉPAISSEUR (5) |
| Gomme | gomme | outil `eraser` |
| Image | image | outil `image` (sélecteur de fichier) |
| Ajuster | flèches diagonales | `scrollToContent` sur toute la scène, avec animation |

Les menus s'ouvrent à droite du rail (popover `--ov-surface-2`, rayon 12, libellés de section en majuscules). Les raccourcis clavier d'Excalidraw (R, O, D, L, A, T, P, E, F…) restent actifs et mettent le rail à jour.

### 5.4 Panneau de propriétés

Le panneau d'origine d'Excalidraw (`.App-menu__left`) est conservé pour son fonctionnement — il gère seul les changements de police et de taille de texte, qui imposent de remesurer les éléments — et entièrement restylé et repositionné par CSS :

- accolé à droite du rail gauche, centré verticalement, fond `--ov-surface-2`, bord `--ov-line`, rayon 12, ombre douce ;
- titres de section en majuscules interlettrées 11 px `--ov-text-2` ;
- boutons d'option en tuiles sombres (`--ov-card`), option active à bord orange sur `--ov-accent-soft` ; curseur d'opacité orange ;
- il apparaît, comme dans Excalidraw, quand un outil de dessin est actif ou que des éléments dessinés sont sélectionnés.

Sa palette de couleurs reste celle d'Excalidraw (Excalidraw 0.18.1 ne permet pas de la remplacer) ; la palette Symvibe (§4.3) s'applique au menu Stylo.

### 5.5 Rail droit et panneau Flotte

Pilule verticale symétrique du rail gauche. Dans cette spec elle ne porte qu'une entrée : **Flotte** (icône « réseau »). Les autres entrées viendront avec leurs sous-projets.

Le panneau Flotte s'ouvre à gauche du rail (largeur 300 px, hauteur jusqu'à 70 % de la fenêtre, défilable) :

- filtres en pastilles : Tous, En cours, Attend, Actifs, Prêts, Arrêtés, avec leurs compteurs. « Actifs » range les processus vivants dont l'activité est inconnue (la pastille dit ACTIF, §7.2, avant le premier événement d'activité) : le compteur suit la pastille ; amendement du 2026-11-01 (l'ancienne liste les rangeait dans « Inactifs ») ;
- par groupe : point de couleur, nom en majuscules, compteurs ; puis « Hors groupe » ;
- par agent : logo, prénom, nom de l'agent en gris, pastille d'état, durée dans l'état en Geist Mono (« 12 min ») ;
- clic sur un agent : centre la vue dessus à 100 % et l'active (comme l'activation actuelle, spec V1 §6.3) ;
- survol d'un agent : boutons Pause, Reprendre, Fermer.

### 5.6 Bas de l'écran

- **Puces** (au-dessus de la barre de commande, centrées) : `Nouvelle console`, `Lancer 4`, `Groupe`, `Tout mettre en pause`, `Tout reprendre`. Pastilles sombres à bordure en dégradé (sarcelle → jaune → orange → rose → violet, réparti sur la rangée), texte blanc semi-gras 13 px.
  - Nouvelle console : pose un agent par défaut (§8) au centre de la vue.
  - Lancer 4 : crée un groupe Général de 4 agents par défaut (§11.3), sans popover.
  - Groupe : ouvre « Composer un groupe » (§11.2), ancré au-dessus de la puce.
  - Tout mettre en pause / Tout reprendre : §14.
- **Barre de commande** (§12) : 560 px de large, fond `--ov-command`, rayon 16 ; orbe orange animée (dégradé radial en rotation lente, CSS pur) à gauche ; champ « Écris une consigne · @ pour cibler… » ; bouton Envoyer rond (gris si désactivé, orange sinon).
- **Bas gauche** : puce git `⑂ main 7` (branche en Geist Mono, badge orange du nombre de fichiers modifiés, masqué à 0). Masquée si le dossier n'est pas un dépôt ou si `git` est absent. Info-bulle : chemin du dépôt.
- **Bas droite** : zoom `− 56 % +` (clic sur le pourcentage : 100 %).

### 5.7 Canvas

- Fond : `viewBackgroundColor: "transparent"` ; une couche CSS sous le canvas dessine `--ov-canvas` et la grille de points (points de 1,5 px, pas de 32 px à 100 %, mis à l'échelle et décalés selon `scrollX`, `scrollY` et `zoom`, reçus par `onScrollChange`). La grille d'Excalidraw (`gridModeEnabled`) reste désactivée.
- Sélection : `--color-selection` d'Excalidraw = `--ov-accent` (bordure et poignées de sélection orange).
- Interface d'origine d'Excalidraw masquée : barre d'outils, menu principal, aide, pied de page (zoom, annuler), bibliothèque, statistiques, écran d'accueil (le panneau de propriétés est conservé et restylé, §5.4). Par `UIOptions` quand c'est possible, sinon par CSS ciblant les classes d'Excalidraw 0.18.1 (version figée ; une montée de version impose de revérifier cette liste).
- Conservés : menu contextuel du clic droit (restylé par CSS), raccourcis clavier, annuler et rétablir (Ctrl+Z, Ctrl+Y), dialogues d'Excalidraw restylés.
- Cadres : `frameRendering = { enabled: true, name: true, outline: false, clip: true }`. Le nom natif reste en place pour la sélection et le glisser, mais devient transparent ; notre étiquette (§11.4) est dessinée exactement par-dessus. Les groupes se renomment dans leur étiquette (§11.4), les cadres simples avec l'éditeur d'Excalidraw.

### 5.8 Dialogues, popovers, toasts

- Modales : carte `--ov-surface-2`, rayon 16, voile `rgba(0,0,0,.6)`, en-tête avec tuile d'icône orange (`--ov-accent-soft`), titre 15 px semi-gras, sous-titre gris, bouton × rond.
- Confirmations destructives : bouton principal rouge (« Fermer l'agent », « Supprimer »), « Annuler » en texte.
- Toasts (sonner) : `--ov-surface-2`, rayon 12, en bas à droite au-dessus du zoom.
- Le dialogue de lancement actuel (`LaunchDialog.tsx`) disparaît : le lancement passe par le menu Agent (§10.1). Les options avancées (dossier, shell, commande personnalisée) sont dans un sous-panneau « Options » de ce menu.

## 6. Projets

### 6.1 Modèle

- Un projet a : un identifiant, un nom (dernier segment du chemin par défaut), un chemin absolu, une position, une date de dernière ouverture.
- Chaque workspace appartient à un projet. Un projet a au moins un workspace (créé avec lui : « Workspace 1 »).
- Le dossier du projet est le dossier par défaut des nouveaux agents, de la puce git et des presets futurs. Un terminal peut toujours être lancé ailleurs (Options du menu Agent).
- Le projet actif et le workspace actif de chaque projet sont mémorisés dans `settings` (`ui.activeProjectId`, `ui.activeWorkspaceId.<projectId>`).

### 6.2 Migration des données existantes

Dans la migration 002 (§15.1), pour chaque workspace existant :

1. chemin = `cwd` du premier nœud terminal du workspace (ordre de `updated_at`), sinon le dossier personnel de l'utilisateur ;
2. un projet est créé par chemin distinct ; les workspaces qui partagent un chemin partagent le projet.

Le calcul du chemin se fait en Rust (lecture de `payload_json`) avant la création de la contrainte `NOT NULL`, dans la même transaction.

## 7. Nœud terminal

### 7.1 En-tête

Hauteur 28 px, fond `--ov-terminal-head`, séparé du corps par un filet.

- Gauche : logo de l'agent (14 px) avec `⌄` (menu : changer d'agent pour le prochain lancement, Options) ; point d'identité de 6 px à la couleur du groupe (gris hors groupe) ; prénom en semi-gras 12 px (double-clic pour renommer ; le titre complet reste en info-bulle).
- Droite : pastille d'état (§7.2) ; Relancer ↻ (pour Claude : Reprendre la session, Nouvelle session, Plus récente du dossier) ; Dupliquer ⧉ ; Fermer ×. Les boutons sont des icônes de 14 px, gris, blanc au survol.

### 7.2 Pastille d'état

Pastille en Geist Mono majuscules 10 px, point de 5 px + libellé :

| État | Libellé | Style |
|---|---|---|
| inactif (processus vivant, à l'invite) | PRÊT | fond `#322F28`, texte gris clair |
| travaille | EN COURS | contour et texte orange `#E8553A` (indigo `#707DE3` pour les agents de teinte indigo) |
| attend ta réponse | ATTEND | contour et texte ambre `#D9B35A`, point clignotant |
| arrêté (restauré, jamais relancé) | ARRÊTÉ | gris foncé |
| en attente de son lancement échelonné (§11.3) | DÉMARRAGE | gris foncé, sans encart de reprise ni démarrage à la frappe |
| terminé | TERMINÉ · code | vert `#6A8E51` si code 0, rouge sinon |
| erreur de lancement | ERREUR | rouge |

Avant le jalon J3 (états des agents), un processus vivant affiche ACTIF (fond `#322F28`, point vert `#4CAF6A`) : PRÊT, EN COURS et ATTEND n'apparaissent qu'avec la détection d'activité.

### 7.3 Corps et bordure

- Corps `--ov-terminal`, marge intérieure de 4 px (sur un conteneur, pas sur l'hôte xterm).
- Bordure 1 px à la teinte de l'agent, rayon 12 (l'en-tête et le corps sont rognés dans ce rayon). Nœud sélectionné : bordure de 1,5 px en `--ov-accent` et légère lueur (`0 0 0 3px` de l'accent à 15 %). Nœud qui attend : lueur ambre.
- Pour un terminal arrêté, le bandeau actuel est remplacé par un encart flottant en haut du corps : icône horloge orange, « Reprendre la dernière conversation ? », « Cliquer pour reprendre · taper démarre à neuf », ×. Agents sans session (tout sauf Claude) : « Relancer · taper démarre à neuf ».
  - Clic : relance en mode reprise (Claude) ou nouveau lancement (autres).
  - Frappe au clavier dans le terminal arrêté : nouveau lancement (Claude : nouvelle session). La touche frappée n'est pas transmise : elle arriverait au shell avant que l'agent ne démarre.
  - × : masque l'encart ; le terminal reste arrêté.

### 7.4 Reprise globale au lancement

Au chargement d'un workspace contenant au moins un terminal arrêté, un toast persistant en haut à droite propose : « Reprendre toutes les conversations ? — N consoles peuvent reprendre leur dernière discussion », boutons Oui (orange) et Non, ×. Oui relance chaque terminal arrêté (Claude en reprise), à 300 ms d'intervalle ; le compteur du toast diminue quand des terminaux sont relancés un par un. Non ou × : le toast ne revient plus pour ce workspace jusqu'au prochain démarrage de l'application.

### 7.5 Fermer et dupliquer

- Fermer un terminal dont le processus vit : dialogue « Fermer Isis ? — Isis est en cours. La fermer met fin à sa session. » (ou « …est prête. » si inactive), Annuler / Fermer l'agent (rouge). Terminal arrêté : fermeture directe (annulable par Ctrl+Z comme aujourd'hui).
- Un agent en cours ne quitte jamais le canvas sans cette confirmation, quelle qu'en soit la cause : Ctrl+Z ou « Annuler » qui défait son lancement, Rétablir, Suppr, la gomme, l'import d'une scène. Il est remis en place tel qu'il était, hors de l'historique (avec son groupe si celui-ci partait ou rétrécissait avec lui), puis le dialogue s'ouvre : « Fermer Isis ? », « Fermer 2 agents ? » s'ils sont plusieurs, « Fermer le groupe Backend ? » quand tout le groupe partait. Refuser le garde ; l'étape d'annulation est consommée. (Amendement après J8b.)
- Dupliquer : crée un nouveau terminal à droite du nœud (même agent, dossier, shell, groupe ; nouveau prénom ; Claude : nouvelle session) et le lance. Dans un groupe, la copie prend la première case libre de la grille du groupe (§11.3).
- La duplication et le copier-coller par Excalidraw d'un élément terminal créent désormais un vrai nouveau terminal (nouvel identifiant, nouvelle charge utile) au lieu d'un nœud vide (correction du mineur du plan 2).

## 8. Catalogue d'agents

Le catalogue remplace les préréglages (`Preset`). Il est défini une fois en Rust (commande, détection) et décrit au front par `list_agents` ; libellés, logos et teintes vivent dans le front.

| id | Libellé | Éditeur | Commande | Détection (PATH) | Interruption | Teinte | Source d'état |
|---|---|---|---|---|---|---|---|
| `claude` | Claude | Anthropic | `claude` (+ session, + `--settings`) | `claude` | Échap | orange `#E8603A` | hooks + activité |
| `codex` | Codex | OpenAI | `codex` (+ `-c notify=…`) | `codex` | Échap | indigo `#707DE3` | fin de tour + activité |
| `gemini` | Gemini | Google | `gemini` | `gemini` | Échap | bleu `#5C86E0` | activité |
| `qwen` | Qwen Code | Alibaba | `qwen` | `qwen` | Échap | violet `#A57BE0` | activité |
| `cursor` | Cursor | cursor-agent | `cursor-agent` | `cursor-agent` | Échap | gris clair `#D4D4CC` | activité |
| `opencode` | OpenCode | sst | `opencode` | `opencode` | Échap | sarcelle `#77B7C0` | activité |
| `aider` | Aider | aider | `aider` | `aider` | Ctrl+C | vert `#86A174` | activité |
| `ollama` | Ollama | local | voir ci-dessous | `ollama` | Ctrl+C | crème `#EDE8DF` | activité |
| `shell` | Shell | par défaut | aucune | toujours | — | gris `#8A8A80` | activité |
| `custom` | Personnalisé | — | commande saisie | toujours | Ctrl+C | gris `#8A8A80` | activité |

- Un agent absent du PATH est grisé dans les menus avec l'info-bulle « `<commande>` introuvable dans le PATH ».
- Agent par défaut (Nouvelle console, Lancer 4, emplacements de Composer un groupe) : le premier disponible parmi Claude, Codex, Shell.
- Pause et reprise (§14) ne concernent pas `shell`.
- Les noms de commande `qwen`, `cursor-agent` et `opencode` sont à confirmer au jalon J2 sur la machine de Mathieu ; un nom erroné ne fait que griser l'agent.

### 8.1 Ollama

- Choisir Ollama dans le menu ouvre un sous-panneau : liste des modèles installés (`ollama list`, lu par Rust ; message « Aucun modèle — lance `ollama pull <modèle>` » si vide) et deux modes :
  - **Discussion** : `ollama run <modèle>` ;
  - **Agent de code** : `aider --model ollama_chat/<modèle>` (grisé si Aider est absent). C'est le mode qui agit sur le dépôt.
- Le modèle et le mode sont stockés dans la charge utile du terminal.

### 8.2 Hooks et réglages passés aux agents

- Claude : OpenVibe écrit `<app_data>/hooks/<nodeId>.json` et lance `claude --settings "<chemin>" …`. Le fichier est réécrit à chaque lancement (port et jeton changent à chaque démarrage de l'application), supprimé à la fin du processus, et le dossier est vidé au démarrage de l'application (un fichier restant pointerait vers un serveur mort). Contenu : §10.3. Les réglages de l'utilisateur (`~/.claude/settings.json`) ne sont pas modifiés.
- Codex : `codex -c "notify=['curl.exe','-s','-X','POST','<url>','-d']"` (chaînes littérales TOML entre apostrophes : PowerShell 5.1 perd les guillemets doubles imbriqués passés à un programme natif) ; Codex ajoute la charge JSON en dernier argument, qui devient le corps de la requête. Non vérifié (Codex absent de la machine de développement) ; en cas d'échec, Codex reste sur l'état déduit de l'activité.
- Environnement : les terminaux héritent de l'environnement d'OpenVibe, sauf les marqueurs de session de Claude Code (`CLAUDECODE`, `CLAUDE_CODE_CHILD_SESSION`, `CLAUDE_CODE_SESSION_ID`, `CLAUDE_CODE_ENTRYPOINT`, `CLAUDE_CODE_BRIDGE_SESSION_ID`, `CLAUDE_CODE_MESSAGING_SOCKET`, `CLAUDE_CODE_MESSAGING_TOKEN`, `CLAUDE_CODE_SKIP_PROMPT_HISTORY`) : un OpenVibe lancé depuis une session Claude Code ne doit pas faire de ses agents des sessions enfants (exclues de `--resume`).

## 9. Prénoms mythologiques

### 9.1 Panthéons

Ordre d'attribution et noms (16 par panthéon, dans cet ordre) :

1. **Égyptien** : Isis, Osiris, Horus, Anubis, Thot, Rê, Bastet, Sekhmet, Ptah, Hathor, Nout, Seth, Maât, Amon, Khnoum, Sobek
2. **Grec** : Athéna, Apollon, Artémis, Hermès, Héra, Zeus, Poséidon, Déméter, Héphaïstos, Arès, Aphrodite, Dionysos, Hestia, Perséphone, Hadès, Éos
3. **Nordique** : Odin, Thor, Freyja, Loki, Frigg, Baldr, Týr, Heimdall, Idunn, Njörd, Freyr, Skadi, Bragi, Sif, Vidar, Hel
4. **Japonais** : Amaterasu, Susanoo, Tsukuyomi, Inari, Raijin, Fūjin, Hachiman, Benzaiten, Izanagi, Izanami, Ebisu, Kannon, Daikoku, Ryūjin, Sarutahiko, Ōkuninushi
5. **Celte** : Lugh, Brigid, Dagda, Morrigan, Cernunnos, Epona, Ogma, Nuada, Belenos, Danu, Taranis, Rhiannon, Arawn, Manannán, Aengus, Boann
6. **Hindou** : Shiva, Vishnu, Brahma, Lakshmi, Ganesh, Saraswati, Parvati, Durga, Indra, Agni, Hanuman, Kali, Surya, Varuna, Krishna, Rama
7. **Aztèque** : Quetzalcoatl, Tezcatlipoca, Huitzilopochtli, Tlaloc, Xochiquetzal, Chalchiuhtlicue, Mictlantecuhtli, Coatlicue, Xipe, Mixcoatl, Tonatiuh, Ehecatl, Centeotl, Xolotl, Metztli, Coyolxauhqui
8. **Mésopotamien** : Inanna, Enki, Enlil, Marduk, Ishtar, Shamash, Nanna, Ninurta, Ereshkigal, Tiamat, Anu, Nabu, Nergal, Ninhursag, Dumuzi, Ashur
9. **Slave** : Perun, Veles, Mokosh, Svarog, Dazhbog, Stribog, Lada, Jarilo, Morana, Zorya, Triglav, Svetovid, Kupala, Rod, Dodola, Simargl
10. **Chinois** : Guanyin, Nüwa, Fuxi, Pangu, Houyi, Nezha, Erlang, Mazu, Shennong, Zhurong, Gonggong, Leigong, Caishen, Xiwangmu, Yandi, Huangdi
11. **Romain** : Jupiter, Junon, Minerve, Mars, Vénus, Mercure, Neptune, Vulcain, Diane, Cérès, Janus, Vesta, Bacchus, Pluton, Aurore, Faunus
12. **Yoruba** : Obatala, Oshun, Shango, Yemoja, Ogun, Eshu, Orunmila, Oya, Olokun, Osanyin, Oshosi, Babalu, Aganju, Obba, Yewa, Ibeji

### 9.2 Attribution

- Chaque groupe porte un panthéon (dans le `customData` de son cadre). À sa création, il reçoit le premier panthéon de la liste non utilisé dans le workspace (groupes existants et panthéon « hors groupe » compris).
- Les agents hors groupe utilisent le panthéon « hors groupe » du workspace (colonne `workspaces.pantheon`), attribué de la même façon au premier agent hors groupe.
- Le prénom d'un nouvel agent est le premier nom de son panthéon non porté par un autre terminal du workspace. Si les 16 sont pris : nom suivi de « 2 », puis « 3 »… Après le 12ᵉ panthéon, l'attribution reprend au premier.
- Le prénom est attribué une fois, à la création, et stocké dans la charge utile. Déplacer un agent dans un autre groupe ne le renomme pas. Renommer à la main reste possible ; un prénom saisi n'a pas à être unique, mais le ciblage `@` (§12) signale l'ambiguïté.
- Les terminaux existants (créés avant cette spec) reçoivent un prénom au premier chargement, selon ces règles.

## 10. Lancement et états des agents

### 10.1 Menu « Lancer un agent »

- Ouvert par l'outil Agent du rail ou le `⌄` d'un en-tête. Titre « LANCER UN AGENT ». Une ligne par agent du catalogue : logo dans une pastille teintée, libellé, éditeur en gris ; coche sur l'agent par défaut ; lignes grisées pour les agents absents.
- Pied : « puis clique sur le canvas pour le poser » ; lien « Options » (dossier — par défaut celui du projet —, shell, commande personnalisée, titre).
- Après le choix, un rectangle orange en pointillé (taille du nœud terminal, 720 × 440, mis à l'échelle du zoom) suit le curseur ; un clic pose le terminal (centré sur le clic) et le lance ; Échap annule. Si le clic tombe dans un cadre de groupe, le terminal rejoint ce groupe et se range dans sa grille (§11.3) ; pendant le placement, le rectangle en pointillé s'aligne sur la case que le terminal prendra.
- Entrée supplémentaire en bas du menu : « Orchestrateur » (§13), posé de la même façon.

### 10.2 Modèle d'états

Chaque terminal a un état de processus (déjà existant : `running`, `stopped`, `exited`, `error`) et, quand il tourne, une activité : `idle`, `working` ou `waiting`, avec l'instant du dernier changement (`since`). La pastille (§7.2) combine les deux.

Sources d'activité, par ordre de priorité :

1. **Hooks Claude** (§10.3) : `UserPromptSubmit` et `PostToolUse` → `working` ; `Stop` et `StopFailure` → `idle` ; `Notification` de type `permission_prompt`, `elicitation_dialog`, `elicitation_url_dialog` ou `agent_needs_input` → `waiting` ; `Notification` `idle_prompt` → `idle` ; `SessionEnd` (sauf raison `clear`, qui continue dans le même processus) → `idle`, et le terminal revient à l'activité du terminal : l'agent est tapé dans un shell, qui lui survit après `/exit`.
2. **Fin de tour Codex** (`notify`, type `agent-turn-complete`) → `idle`.
3. **Activité du terminal** (tous les agents) : de la sortie reçue dans les 1,5 dernières secondes → `working` ; sinon `idle`. Pour un terminal qui a déjà reçu au moins un événement de hook, l'activité du terminal n'est plus utilisée (les hooks font foi), sauf pour quitter `working` si aucune sortie n'est arrivée depuis 30 s alors que le hook `Stop` n'est jamais venu (filet de sécurité).
4. **Réponse de l'utilisateur** : une réponse dans un terminal à hooks rend la main à l'activité du terminal jusqu'au hook suivant — l'agent passe à `working`, puis 1,5 s sans sortie → `idle`. Est une réponse : toute frappe quand l'agent est `working` ; quand il est `waiting`, toute frappe sauf les touches qui parcourent les choix (flèches, Tab, Maj+Tab, pages, début, fin) ; quand il est `idle`, Entrée seulement (la saisie d'une consigne n'est qu'un écho ; Entrée couvre aussi un formulaire rempli lentement et les commandes sans hooks comme `/compact`). Les rapports que le terminal envoie seul (focus, souris) ne comptent pas. Raison (constat du 2026-10-24, Claude Code 2.1.304) : aucun hook ne signale la réponse à une demande d'autorisation. Un refus ne déclenche ni `Stop` ni `PermissionDenied` (réservé au mode auto), et la pastille restait ATTEND sans fin ; une acceptation n'est suivie de `PostToolUse` qu'à la fin de l'outil. De plus, `permission_prompt` ne part qu'après environ 6 s d'attente : un refus rapide trouve l'agent `working`.

Le calcul est fait en Rust (`agents::activity`), qui émet `agent-activity` à chaque changement ; le front ne fait qu'afficher.

### 10.3 Serveur local des hooks

- Au démarrage, Rust ouvre un serveur HTTP (`tiny_http`) sur `127.0.0.1`, port choisi par le système, et tire un jeton aléatoire (UUID v4). Le serveur ne répond qu'aux requêtes `POST` dont le paramètre `t` égale le jeton (sinon 403) ; corps limité à 64 Kio ; réponse `204` sans corps.
- Routes : `/hook/claude/<nodeId>?t=<jeton>` (corps : l'entrée JSON du hook, on lit `hook_event_name` et `notification_type`) et `/hook/codex/<nodeId>?t=<jeton>` (corps : la charge `notify`, on lit `type`).
- Fichier de réglages Claude (§8.2), avec `URL` = l'URL de la route claude du nœud :

```json
{
  "hooks": {
    "UserPromptSubmit": [{ "hooks": [{ "type": "http", "url": "URL", "timeout": 2 }] }],
    "PostToolUse": [{ "hooks": [{ "type": "http", "url": "URL", "timeout": 2 }] }],
    "Stop": [{ "hooks": [{ "type": "http", "url": "URL", "timeout": 2 }] }],
    "StopFailure": [{ "hooks": [{ "type": "http", "url": "URL", "timeout": 2 }] }],
    "SessionEnd": [{ "hooks": [{ "type": "http", "url": "URL", "timeout": 2 }] }],
    "Notification": [{
      "matcher": "permission_prompt|elicitation_dialog|elicitation_url_dialog|agent_needs_input|idle_prompt",
      "hooks": [{ "type": "http", "url": "URL", "timeout": 2 }]
    }]
  }
}
```

- Aucun hook pouvant bloquer une décision (`PreToolUse`, `PermissionRequest`) n'est utilisé : une réponse vide de notre serveur ne doit jamais influencer Claude.
- Si le serveur ne démarre pas : un toast unique « États des agents approximatifs : serveur local indisponible », et tous les agents passent par l'activité du terminal ; Claude est alors lancé sans `--settings`.
- Vérifié sur Claude Code 2.1.304 (2026-10-24) : les hooks `http` de `--settings` se déclenchent (`UserPromptSubmit` puis `Stop` pour un tour) et s'ajoutent à ceux du projet et de l'utilisateur, qui se déclenchent aussi ; le corps porte `hook_event_name` (et `notification_type` pour `Notification`) ; une réponse 204 ne produit rien dans la sortie de Claude. Une réponse en erreur ou un serveur injoignable donnent une ligne « hook error » dans Claude : le délai de 2 s borne l'attente.

### 10.4 Chronomètre

L'instant `since` sert à afficher la durée dans l'état (panneau Flotte, info-bulle de la pastille) : « 45 s », « 12 min », « 1 h 05 ». Rafraîchi toutes les 15 s.

## 11. Groupes

### 11.1 Représentation

- Un groupe est un élément `frame` d'Excalidraw dont le `customData` vaut `{ "openvibe": { "kind": "group", "role": "<id de rôle>", "pantheon": "<id de panthéon>" } }`. Son `name` est le nom du groupe (« Backend »). Les membres sont les nœuds terminaux dont le `frameId` est ce cadre.
- Les cadres créés à la main (outil Cadre) sans `customData` restent de simples cadres de dessin : étiquette sobre (nom en gris), pas de compteurs ni de menu de groupe.
- Glisser un terminal dans ou hors d'un cadre de groupe change son appartenance (comportement natif d'Excalidraw) ; son prénom ne change pas.
- Le groupe est dérivé de la scène à chaque changement (`groupsFromScene(elements)`, fonction pure) ; aucun état en double.

### 11.2 Composer un groupe

Popover « Composer un groupe » (360 px), ancré au-dessus de la puce Groupe :

- champ nom avec point de couleur, prérempli par le libellé du rôle et sélectionné ;
- rôles en pastilles à point coloré : Frontend, Backend, Testeurs, Relecteurs, Design, Docs, Sécurité, Général (actif : pastille pleine) ; changer de rôle remplace le nom s'il n'a pas été modifié ;
- grille de 4 colonnes d'emplacements (72 px de haut, largeur de la colonne, rayon 10 ; quatre emplacements de 90 px ne tiennent pas dans 360 px) : logo de l'agent dans un carré teinté et libellé ; clic sur un emplacement : menu des agents disponibles ;
- rangée « Tout remplir avec » : logos des agents disponibles ;
- pied : pas `− N +` (1 à 12, 4 par défaut) et bouton « Lancer N » à la couleur du rôle (texte sombre).
- Lancer : crée le cadre et les terminaux (§11.3), ferme le popover.

### 11.3 Placement et lancement

- Grille de `min(N, 4)` colonnes, terminaux de 720 × 440, espacement 24, marge intérieure du cadre 32 (48 en haut pour l'étiquette).
- Le cadre est centré sur le centre de la vue s'il n'y recouvre rien ; sinon il descend sous ce qu'il recouvrirait (96 d'écart), pour ne jamais se poser sur un autre groupe. La vue s'ajuste pour le montrer entier (`scrollToContent`, animation 300 ms, zoom plafonné à 100 %).
- Les terminaux sont créés en une seule mise à jour de scène (une seule entrée d'annulation), puis lancés à 300 ms d'intervalle.
- « Lancer 4 » : rôle Général, nom « Groupe N » (plus petit N libre), 4 agents par défaut.
- **Alignement dans le groupe** (demande de Mathieu, 2026-10-24) : tout terminal ouvert dans un groupe — clic de placement dans le cadre, « Nouvelle console » quand le centre de la vue tombe dans le cadre, « Ajouter un agent », « Dupliquer » ou copie (Ctrl+D, copier-coller) d'un membre — prend la première case libre de la grille du groupe, ligne par ligne. La grille part du coin du cadre, avec les marges ci-dessus ; une case est prise quand un élément du cadre en couvre plus d'un dixième, si bien qu'un terminal déplacé à la main garde sa case. Cadre plein : il s'agrandit d'une colonne (jusqu'à 4), sinon d'une ligne.
- Glisser à la main un terminal dans un cadre ne le range pas : il reste où on le lâche.

### 11.4 Étiquette et menu

- Posée sur le bord haut du cadre, à 16 px du coin, comme un onglet : point de 6 px à la couleur du rôle, nom en majuscules semi-gras 11 px interlettré, puis en Geist Mono gris `12 · 3 en cours` (membres, membres en activité `working` ; « inactif » si aucun ; `· 1 attend` ajouté en ambre si besoin), puis `⌄`.
- Contour du cadre : 1 px à la couleur du rôle à 60 %, rayon 12, fond teinté du rôle à 4 %. Dessinés par la couche d'habillage (§16), sous les nœuds.
- Menu `⌄` : Renommer, Ajouter un agent (menu des agents, posé dans la première case libre de la grille), Relier un orchestrateur (crée un orchestrateur à gauche du groupe, relié), Tout mettre en pause, Tout reprendre, Dégrouper (supprime le cadre, garde les terminaux), Fermer le groupe (confirmation listant les agents vivants ; supprime cadre et terminaux).
- Jusqu'à J3, « en cours » compte les membres dont le processus tourne (pastille ACTIF) ; J3 le remplace par l'activité `working`.
- Relier un orchestrateur, Tout mettre en pause et Tout reprendre arrivent avec J5 ; d'ici là, le menu ne les montre pas.
- Les cadres simples reçoivent un contour gris sobre de la même couche (l'outline native est désactivée, §5.7).
- Renommer un groupe (menu, double-clic ou Entrée sur son nom) ouvre un champ dans l'étiquette : Entrée ou un clic ailleurs valide, Échap annule ; le renommage est une étape d'annulation. L'éditeur natif d'Excalidraw change le nom hors de son historique, après quoi annuler Dégrouper ou Fermer le groupe ne ramène plus le cadre : il est refermé dès qu'il s'ouvre sur un groupe.
- Le nom natif de tous les cadres prend la police de l'étiquette (Geist 11 px semi-gras, majuscules, 28 px de marge pour le point) et sa position (16 px du coin, posé sur le bord), pour que la zone qu'on saisit coïncide avec notre étiquette ; il est transparent pour les groupes.

## 12. Barre de commande

- Ciblage :
  - `@` ouvre une liste filtrée au fil de la frappe : `@tous` (tous les agents du workspace), puis les groupes (`@backend`, nom du groupe sans espaces ni accents, en minuscules), puis les agents (`@isis`). Comparaison insensible à la casse et aux accents. Tab ou Entrée insère la cible ; plusieurs cibles sont possibles.
  - Les cibles sont affichées en puces au début du champ (fond teinté, ×).
  - Sans cible `@`, la consigne part vers la sélection courante : terminaux sélectionnés, et membres des cadres de groupe sélectionnés.
  - Sans cible ni sélection : bouton Envoyer grisé, indice « Sélectionne des agents ou tape @ ».
  - Prénom ambigu (deux agents portant le même) : les deux apparaissent dans la liste avec leur groupe.
  - Un `@nom` tapé sans passer par la liste (« @tous lance les tests ») devient une cible à l'envoi s'il désigne exactement une cible ; un prénom ambigu ou inconnu reste dans le texte. Une adresse `a@b.fr` n'est pas une cible (le `@` doit commencer un mot).
- Envoi (Entrée ; Maj+Entrée = nouvelle ligne) : pour chaque terminal ciblé dont le processus vit, `pty_send_text` (§15.3). Les terminaux arrêtés sont ignorés : toast « 2 agents arrêtés ignorés : Thot, Anubis ». Un agent en ATTEND est ignoré lui aussi, car l'Entrée qui suit le texte validerait le choix en surbrillance de sa boîte de dialogue (souvent « Oui ») : toast « 1 agent en attente ignoré : Horus — réponds-lui dans son terminal ». Limite : `permission_prompt` n'arrive qu'environ 6 s après l'ouverture de la boîte ; une boîte plus récente n'est pas encore connue.
- Après l'envoi, le champ se vide et les cibles `@` restent (pour enchaîner) ; ↑ et ↓ parcourent les 50 dernières consignes (mémorisées par projet dans `settings`).
- Indice ponctuel au-dessus des puces, à la première ouverture : « Essaie « @tous lance les tests » » (×, ne revient plus).

## 13. Orchestrateur

- Nouveau type de nœud `orchestrator` (élément intégré `openvibe://orchestrator/<id>`, 320 × 420).
- En-tête : orbe, « Orchestrateur » (renommable par double-clic), anneau de progression `◌ 3/8` (agents en activité / agents reliés), menu `⌄` (Tout mettre en pause, Tout reprendre) et × (supprime l'orchestrateur et ses liaisons en une étape d'annulation).
- Ligne de résumé : « 8 agents · 2 groupes », bouton `+ Relier` (orange).
- Liste défilante : par groupe relié (point, nom, compteur), ses agents ; puis les agents reliés directement. Chaque ligne : logo, prénom, agent, pastille d'état. Au survol : Centrer, Pause, Fermer.
- Pied : champ « Commander N agents · @ pour cibler… », Envoyer. Même comportement que la barre de commande, cibles par défaut = tous ses agents reliés ; `@` restreint parmi eux.
- Liaisons :
  - Une liaison est une flèche Excalidraw liée (`startBinding` sur l'orchestrateur, `endBinding` sur un cadre de groupe ou un terminal), avec `customData = { "openvibe": { "kind": "wire" } }`, trait orange, flèche courbe, sans tête.
  - « Relier » passe en mode liaison : curseur en croix, chaque clic sur un groupe ou un terminal crée la flèche (un clic sur un terminal membre d'un groupe relie le groupe) ; Échap ou un clic dans le vide termine. Une flèche dessinée à la main entre l'orchestrateur et un groupe ou un terminal compte aussi comme liaison (elle reçoit le `customData` au premier calcul).
  - Les destinataires sont dérivés des flèches (`orchestratorTargets(elements, orchestratorId)`, fonction pure) : supprimer la flèche coupe la liaison.
- Charge utile : `{ "name": "Orchestrateur" }`. L'historique des consignes de l'orchestrateur est partagé avec celui de la barre de commande.

## 14. Pause, reprise, fermeture en masse

- Pause d'un agent : envoie sa séquence d'interruption (§8) ; pas d'effet sur `shell`.
- Reprendre : `pty_send_text(nodeId, "\ncontinue")`, soit « continue » sur sa propre ligne du même message. Claude Code remet dans sa saisie une consigne interrompue avant sa réponse (constat du 2026-10-24) : sans le saut de ligne, « continue » s'y collait (« …sans fichiercontinue ») ; avec, la consigne est reprise telle quelle, et une saisie vide donne « continue ».
- Tout mettre en pause / Tout reprendre (puces) : tous les agents vivants du workspace actif dont l'activité est `working` (pause) ou `idle` après une pause par OpenVibe (reprise : seuls les agents mis en pause par OpenVibe depuis moins de 24 h reçoivent « continue », pour ne pas relancer un agent qui avait fini). Toast récapitulatif « 5 agents mis en pause ».
- Menus de groupe et orchestrateur : mêmes actions restreintes à leurs agents.
- Fermer le groupe : §11.4.
- Survol d'un agent (panneau Flotte, orchestrateur) : Pause est proposée quand il est EN COURS, Reprendre quand il est PRÊT (demande explicite : sans limite de 24 h).
- Les mises en pause faites par OpenVibe sont retenues en mémoire : un rechargement de la fenêtre les oublie. Une pause est aussi oubliée dès que l'agent travaille ou attend de nouveau (relancé à la main, consigne envoyée) ou que son processus s'arrête : « Tout reprendre » ne relance que des agents restés arrêtés par OpenVibe.
- L'interruption et l'Entrée qui suit une consigne comptent comme une réponse de l'utilisateur pour l'activité (§10.2, règle 4) : un agent interrompu repasse PRÊT dès que sa sortie se tait.

## 15. Données et IPC

### 15.1 Migration 002

```sql
CREATE TABLE projects (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  path           TEXT NOT NULL UNIQUE,
  position       INTEGER NOT NULL,
  created_at     INTEGER NOT NULL,
  last_opened_at INTEGER NOT NULL
);

-- workspaces : ajout du projet et du panthéon des agents hors groupe
-- (reconstruction de la table pour la contrainte NOT NULL et la clé étrangère)
CREATE TABLE workspaces_new (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  position   INTEGER NOT NULL,
  pantheon   TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- nodes : la contrainte CHECK accepte le nouveau type
CREATE TABLE nodes_new (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('terminal', 'orchestrator', 'note', 'kanban', 'git')),
  payload_json TEXT NOT NULL,
  updated_at   INTEGER NOT NULL
);
```

La migration est exécutée par Rust dans une transaction : création de `projects`, calcul des projets (§6.2), copie vers les tables `_new` (avec `foreign_keys` désactivé le temps de la reconstruction), remplacement des tables, recréation de l'index `nodes_workspace`, `PRAGMA foreign_key_check` vide exigé avant validation. Les tables d'icônes de la spec V1 passent à une migration ultérieure.

### 15.2 Charges utiles

```ts
interface TerminalPayload {
  title: string;            // titre complet (info-bulle), renommable
  name: string;             // prénom mythologique affiché dans l'en-tête
  agent: AgentId;           // remplace `preset`
  cwd: string;
  shell: ShellKind;
  command: string;          // agent "custom" seulement
  claudeSessionId?: string;
  ollama?: { model: string; mode: "chat" | "code" };
}

interface OrchestratorPayload {
  name: string;
}
```

Les charges utiles existantes sont lues avec rétrocompatibilité : `preset` devient `agent` (`claude`, `aider`, `codex`, `shell`, `custom` gardent le même id) et `name` est attribué au premier chargement (§9.2).

`customData` des éléments Excalidraw : groupe (§11.1) et liaison (§13), toujours sous la clé `openvibe`.

### 15.3 Commandes et événements

| Domaine | Commande | Rôle |
|---|---|---|
| Projets | `list_projects() -> Project[]` | accueil, sélecteur (avec nombre de workspaces et indicateur « dossier introuvable ») |
| | `create_project(path) -> Project` | ajoute un projet et son premier workspace ; refuse un chemin déjà présent |
| | `rename_project(id, name)`, `relocate_project(id, path)`, `delete_project(id)` | gestion ; `delete_project` arrête les agents de ses workspaces |
| | `open_project(id)` | met à jour `last_opened_at` |
| Workspaces | `list_workspaces(projectId)`, `create_workspace(projectId, name)` | remplacent les versions sans projet |
| | `set_workspace_pantheon(id, pantheon)` | panthéon hors groupe |
| Agents | `list_agents() -> AgentInfo[]` | remplace `list_presets` : `{ id, available }` |
| | `list_ollama_models() -> string[]` | modèles Ollama |
| PTY | `pty_send_text(nodeId, text)` | le texte, sauts de ligne en `\r`, encadré par `ESC[200~` et `ESC[201~` quand le programme a activé le collage encadré (`ESC[?2004h`, suivi dans sa sortie : ConPTY le transmet), tel quel sinon ; les marqueurs de collage présents dans le texte sont retirés ; puis `\r` 30 ms plus tard ; erreur si le processus n'existe pas |
| | `pty_interrupt(nodeId) -> bool` | séquence d'interruption de l'agent du nœud ; `false` pour un Shell, qui n'en a pas |
| Git | `git_status(path) -> { branch, changed } \| null` | `git status --porcelain=v1 -b` ; `null` hors dépôt ou sans git |
| États | `agent_activity_snapshot() -> { hooksAvailable, activities: { nodeId, activity, since }[] }` | état courant au chargement du front, et disponibilité du serveur des hooks |

`pty_spawn` reçoit désormais l'agent (`agent`, `ollama`) au lieu du préréglage ; Rust construit la commande (§8) et, pour Claude, écrit le fichier de hooks.

Événements :

- `agent-activity` : `{ nodeId, activity: "idle" | "working" | "waiting", since }` ;
- `pty-exit` : inchangé ;
- la disponibilité du serveur des hooks est lue dans `agent_activity_snapshot` (un événement émis au démarrage de Rust arriverait avant que la webview n'écoute).

## 16. Architecture front

- `src/theme/` : jetons (`tokens.css`), surcharges d'Excalidraw (`excalidraw.css`), couleurs de scène (`sceneColors.ts`).
- `src/shell/` : `AppShell.tsx` (agencement), `TopBar.tsx`, `ProjectPicker.tsx`, `WorkspaceTabs.tsx`, `LeftRail.tsx`, `ShapesMenu.tsx`, `PenMenu.tsx`, `RightRail.tsx`, `FleetPanel.tsx`, `BottomBar.tsx`, `ActionChips.tsx`, `CommandBar.tsx`, `GitChip.tsx`, `ZoomControl.tsx`.
- `src/home/HomeScreen.tsx` : accueil.
- `src/canvas/overlay/` : couche d'habillage synchronisée avec la vue (`useViewport` via `onScrollChange`) : `DotGrid.tsx`, `GroupFrames.tsx` (contours et étiquettes), `PlacementGhost.tsx` (rectangle pointillé).
- `src/fleet/` : `catalog.ts` (libellés, logos, teintes), `names.ts` (panthéons et attribution), `groups.ts` (`groupsFromScene`, placement en grille), `targets.ts` (analyse des `@`, résolution des cibles), `wires.ts` (`orchestratorTargets`), `ComposeGroup.tsx`, `AgentMenu.tsx`.
- `src/nodes/orchestrator/OrchestratorNode.tsx`.
- Stores : `projects`, `workspaces` (par projet), `agentActivity`, `ui` (outil actif, panneaux ouverts).
- Rust : `src-tauri/src/projects.rs` (+ commandes), `agents/{catalog.rs, activity.rs, hooks_server.rs, claude_settings.rs, ollama.rs}`, `git.rs`, `db/migrations/002_projects.sql` + étape Rust de migration.

Les fonctions de calcul (couleurs de scène, prénoms, groupes, placement, cibles, liaisons, activité, analyse git, construction des commandes) sont pures et testées unitairement ; les composants restent minces.

## 17. Gestion des erreurs

- Serveur des hooks indisponible : §10.3.
- Hook rejeté par une politique gérée de Claude Code : aucun événement ne vient, l'activité du terminal prend le relais (pas de message).
- `git` absent ou dossier hors dépôt : puce masquée ; erreur de lecture : puce masquée et message dans les logs de la console.
- Dossier de projet introuvable : §5.1 ; un agent lancé dans un dossier disparu passe en ERREUR avec « dossier introuvable » (comportement actuel).
- Agent absent du PATH : grisé (§8) ; s'il disparaît entre l'affichage et le lancement, le terminal passe en ERREUR avec le message de Rust.
- `ollama list` en échec : sous-panneau « Ollama ne répond pas » avec le message d'erreur.
- Envoi vers un terminal dont le processus vient de mourir : ignoré et compté dans le toast des agents ignorés.
- Migration 002 en échec : la transaction est annulée, la base reste en v1, et la boîte de dialogue bloquante de la spec V1 s'affiche avec le message.

## 18. Jalons

| Plan | Jalon | Contenu | Visible |
|---|---|---|---|
| A | J1 — Thème et coquille | jetons et polices, couleurs de scène, interface d'Excalidraw masquée, grille de points, sélection orange, rail gauche et menus Formes et Stylo, panneau de propriétés restylé, barre du haut avec projets et onglets, accueil, migration 002 (projets), puce git, zoom, réglages | le nouveau look complet autour du canvas |
| A | J2 — Terminal et catalogue | en-tête et pastilles, bordures teintées, encart et toast de reprise, fermeture confirmée, duplication réelle, catalogue d'agents et menu Agent avec placement, Ollama, prénoms mythologiques, puce « Nouvelle console » | les terminaux à la Symvibe |
| B2 | J3 — États des agents | serveur local des hooks, réglages Claude, `notify` Codex, activité du terminal, événement `agent-activity`, pastilles vivantes, compteurs, rail droit et panneau Flotte | EN COURS / ATTEND / PRÊT en direct |
| B1 | J4 — Groupes | cadres de groupe, étiquettes et contours, Composer un groupe, Lancer 4, placement en grille et alignement, menu de groupe | les équipes |
| B3 | J5 — Commande et orchestrateur | barre de commande et `@`, `pty_send_text`, historique, orchestrateur et liaisons, pause et reprise | piloter la flotte |

Les éléments de la coquille apparaissent avec le jalon qui les rend fonctionnels : la puce « Nouvelle console » en J2 ; les puces « Lancer 4 » et « Groupe » en J4 ; le rail droit et le panneau Flotte en J3, dont viennent ses filtres et ses durées (le jalon J4 est livré avant J3, à la demande de Mathieu) ; la barre de commande et les puces de pause et de reprise en J5. Aucun bouton inactif n'est affiché entre-temps.

Chaque jalon se termine par une vérification manuelle de Mathieu (§19) et au moins un commit.

## 19. Tests

### Automatisés

- Rust :
  - migration 002 : base v1 avec workspaces avec et sans terminaux → projets attendus, `foreign_key_check` vide, nœuds conservés ; échec en cours de migration → base intacte ;
  - projets : création (refus d'un chemin en double), suppression qui arrête les agents ;
  - catalogue : disponibilité selon le PATH, construction des commandes de chaque agent pour chaque shell (citations comprises), Ollama dans les deux modes ;
  - réglages Claude : JSON généré (URL, jeton, événements, aucun hook bloquant) ;
  - serveur des hooks : jeton requis (403), corps trop gros refusé, événement → activité ;
  - activité : transitions par hooks, par fin de tour Codex, par sortie du terminal, filet de 30 s ;
  - `pty_send_text` : séquence exacte écrite dans un PTY réel (Windows), refus pour un nœud inconnu ;
  - `git_status` : analyse de la sortie porcelaine (branche, détachée, sans commit, compte).
- Front :
  - `toSceneColor` / `toDisplayColor` aller-retour sur toute la palette ;
  - prénoms : ordre des panthéons, noms pris, suffixes, retour au premier panthéon, migration des anciens terminaux ;
  - `groupsFromScene` : membres, cadres simples ignorés, compteurs ;
  - placement en grille : tailles de cadre pour 1, 4, 5 et 12 agents ;
  - cibles : analyse des `@`, accents et casse, ambiguïtés, repli sur la sélection, aucune cible ;
  - `orchestratorTargets` : flèche vers un groupe, vers un terminal, flèche supprimée, flèche dessinée à la main ;
  - lecture rétrocompatible des anciennes charges utiles.

### Vérifications manuelles (Mathieu)

- J1 : capture d'OpenVibe à côté de `scratchpad\frames\tour\t005.6.jpg` (coquille), aucune trace de l'interface d'origine d'Excalidraw ; dessin de formes, flèches, texte et stylo avec les nouveaux menus ; annuler et rétablir ; accueil, ajout d'un projet, migration de la base actuelle (le workspace existant apparaît dans le projet `mk-webapp`).
- J2 : en-tête d'un terminal Claude à côté de `tour\t004.8.jpg` ; reprise d'une conversation par l'encart et par le toast global ; fermeture confirmée ; duplication ; Ollama en mode agent de code sur un petit dépôt.
- J3 : un Claude passe EN COURS pendant un tour, ATTEND sur une demande d'autorisation, PRÊT à la fin ; aucune ligne de hook visible dans Claude ; Codex repasse PRÊT à la fin de son tour.
- J4 : composer un groupe de 8 (6 Claude, 2 Codex) rôle Backend, prénoms égyptiens puis grecs pour le groupe suivant ; déplacer le cadre ; glisser un terminal hors du groupe.
- J5 : `@tous` puis `@backend` puis sélection ; consigne sur plusieurs lignes reçue en un seul message par Claude ; orchestrateur relié à un groupe et à un terminal isolé ; pause et reprise de tout le workspace.

## 20. Risques

| Risque | Parade |
|---|---|
| Les surcharges CSS d'Excalidraw cassent à une montée de version | version figée (0.18.1) ; liste des sélecteurs regroupée dans `excalidraw.css` et revérifiée à chaque montée |
| Les hooks `http` de `--settings` ne s'ajoutent pas à ceux de l'utilisateur, ou s'affichent dans Claude | vérification au début de J3 ; repli sur un hook `command` avec `curl.exe`, ou sur l'activité du terminal |
| L'heuristique d'activité se trompe (agent silencieux qui réfléchit) | hooks pour Claude ; pour les autres, seuil réglable (`agents.activityIdleMs`) |
| La reconstruction des tables en migration perd des données | transaction unique, `foreign_key_check`, test sur une copie de la base réelle avant J1 |
| Beaucoup de terminaux lancés d'un coup saturent la machine | lancement échelonné (300 ms), plafond de 12 par groupe |
| Bracketed paste non géré par un agent | Claude, Codex, Aider et PowerShell le gèrent ; les autres sont vérifiés en J5, repli sur l'envoi ligne à ligne par agent si besoin |

## 21. Conventions

Inchangées (spec V1 §16) : code et commentaires en anglais, spec et documentation en français, pnpm, Conventional Commits, au moins un commit par jalon.
