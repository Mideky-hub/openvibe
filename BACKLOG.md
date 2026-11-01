# Backlog OpenVibe

Ce qui est reporté. La spec en cours est `docs/superpowers/specs/2026-10-24-openvibe-habillage-et-flotte-design.md` (habillage Symvibe et flotte d'agents). Les références « vidéo » renvoient aux démos de Symvibe analysées le 2026-10-24.

## Idée générale de prochaine mise à jour

- Mettre dans la barre du haut les % d'usages (Current Session, Current week (all models), Current week (Fable))
    1. Quand tu cliques dessus, tu as le détail (Total cost, Total duration (API), Total duration (Wall), code changes, usage by model, prompt cache, warm, CO² consumption etc...)
- Pouvoir via la consigne aux agents, executer une commande pour plusieurs agents en même temps type @athena/zeus/héra /effort ultracode etça executera "/effort ultracode" dans les fenêtres des agents athena zeus et héra.
- Pouvoir visualiser les diffs réalisés, par les agents et faciliter le code review de la sortie des agents. (un peu IDE embarqué avec visualisation de fichiers du workspace)
- Pouvoir importer/embarqué nativement les icones de system design, aws azure et GCP d'excalidraw dans l'application.
- Avoir une option Routeur dans l'orchestrateur, qui attribue pour chaque agent un modèle faible pour les tâches faibles Haiku 5.5, moyen Sonnet 5.5, elevé Opus, extrême Fable 5.1
- Permettre d'activer le remote-control sur plusieurs terminaux, à l'unité ou au travers de l'orchestrateur pour gérer et avoir accès aux workflows à distance.

- Ajouter une fonctionnalités IDE pour modifier manuellement le code.
- Faciliter l'installation des agents (Claude Code, Gemini, Qwen Code, Cursor, Ollama, Aider etc... en un clic depuis l'interface, et permettre de configurer/installer des modèles locaux facilement sur Ollama)
- Permettre à un orchestrateur, quand il est lié à plusieurs groupes, de donner du travail au groupe qui lui semble le plus pertinent. Quand il a des groupes (frontend, backend, design etc...), Il distribue sans vraiment de distinction les tâches attribuées. L'idée est d'avoir des groupes spécialisée.
- Ajouter des foncitonnalitée de prise de notes et de gestion de mémoires types obsidian, attribuables à des groupes comme contexte optionnel, que toi au l'orchestrateur peut utiliser comme base potentielle de documentation supplémentaires. Avec une fonctionnalités d'affichage par graphique.
- Quand un agent à une question, permettre de répondre facilement à sa question avec une notification type "un agent a une question", quand tu cliques, ça t'emmènes directement pour y répondre.

## Fonctionnalités inspirées de Symvibe

### Widgets du canvas (remplacent les nœuds Note, Kanban et Git Watcher de la spec V1)

- **Kanban « Board »** : colonnes éditables avec compteur et menu, état vide, ajout de colonne ; fenêtre « Nouvelle carte » (titre, notes, échéance Aujourd'hui / Demain / Semaine prochaine ou date, priorité Aucune / Basse / Moyenne / Haute) ; cartes avec barre de priorité et puces ; glisser entre colonnes ; glisser une carte vers un terminal (spec V1 §6.9). Vidéo : node-kanban.
- **Calendrier** : grille mensuelle, aujourd'hui en orange, Nouveau / Aujourd'hui / navigation, fenêtre d'événement (date, journée entière, 6 couleurs, notes), glisser un événement d'un jour à l'autre. Vidéo : node-kanban.
- **Checklist d'objectifs** : état vide « Aucun objectif », « Ajouter un objectif ». Vidéo : node-kanban.
- **Post-it** : papier ligné ocre, coin corné, police manuscrite, panneau PAPIER (9 couleurs, ordre, dupliquer, supprimer) ; remplace le nœud Note. Vidéo : node-kanban.
- **Tuile web** : dessinée à la souris ; onglets, navigation, barre d'adresse ; lanceur « Ouvrir une page » avec détection des ports localhost actifs (:3000, :5173…) et accès rapide ; préréglages d'écran et de téléphone ; pas d'inspecteur par tuile sous WebView2. Vidéo : node-webtiles.
- **Icônes cloud** (spec V1 §7) : import des packs officiels AWS, Azure, GCP, recherche et insertion ; migration ultérieure pour les tables `icon_packs` et `icons`.

### Git

- **Fenêtre git** depuis la puce de branche : liste des changements avec cases, statut, +/−, annuler un fichier ; message de commit (avec génération par un agent) ; « Commit & Push N fichiers » avec états Lecture → Commit → Push → arbre propre ; historique (hash, auteur, date). Vidéo : node-git.
- Diff d'un fichier au clic (reprend le Git Watcher de la spec V1 §6.8).

### Studios (modales ouvertes depuis le rail droit)

- **Code** : arbre du dépôt, éditeur coloré (CodeMirror), Enregistrer, « Insérer » qui pose un nœud fichier sur le canvas. Vidéo : studio-code.
- **Markdown** : arbre `docs/`, vues Lecture / Source / Graphe de liens, « Ajouter au board », export PDF ; nœud avec « Ouvrir dans le studio ». Vidéo : studio-markdown.
- **Documents** : document rédigé par un agent CLI (modèle, effort Rapide / Équilibré / Approfondi, flux en direct, Stop), rendu « papier », export PDF. Vidéo : studio-documents.
- **Diagrammes** : l'agent dessine des éléments Excalidraw natifs (modèle, style Encre / Coloré, presets « Architecture », « Flux de données »…, prompt, formes de départ). Vidéo : studio-diagrams.

### Automatisation

- **Boucles** : consignes récurrentes (planning, agent devenu inactif, sortie contenant un texte), cibles, conditions d'arrêt (nombre, durée, objectif atteint par commande ou agent juge), arrière-plan, modèles (Point d'avancement, Relance, Sauvetage de build, Surveillance des tests, Commit régulier, Revue, Standup). Vidéo : node-loops.
- **Mémoire** : faits par dépôt ou globaux (Architecture, Structure, Commandes, Conventions, Pièges, Contexte), scan du dépôt par un agent jetable avec revue, éditeur, carte mémoire posée sur le board et poussée aux consoles reliées. Vidéo : node-memory.
- **Carte de mission** : arbre Orchestrateur → Équipe → consoles, filtres par état, recherche, inspecteur (aller à la console, pause, fermer, cadrer l'équipe). Vidéo : teams.
- **Presets d'équipes** : déployer une topologie complète (plusieurs groupes, orchestrateur, tuile web), ex. « Dev HQ ». Vidéo : voice.
- **Menu Outils** (mallette de la barre du haut) regroupant ces entrées.

### Comptes et quotas

- **Usage** : jauge de la session Claude, limites hebdomadaires, heure de réinitialisation dans la barre du haut, carte d'activité, statistiques. Vidéo : node-usage.
- **Tokens** : lecture des logs locaux de Claude et Codex, graphe sur 30 jours, détail par agent. Vidéo : node-usage.
- **Comptes** : profils Claude (CLAUDE_CONFIG_DIR par profil), « Utiliser », connexion dans un terminal, puce de compte dans l'en-tête des terminaux. Vidéo : node-accounts.

### Voix et directeur IA

- Maintenir Espace pour parler (reconnaissance locale, Whisper ou équivalent : WebView2 n'en fournit pas hors ligne), forme d'onde, « J'écoute » / « Je réfléchis ».
- Directeur IA : interprète la demande et agit sur le canvas (créer des groupes, relier un orchestrateur, déployer un preset, fermer avec confirmation), fil de discussion dépliable avec lignes « Plan ». Vidéo : voice.

### Interface

- Thème clair.
- Halo lumineux et impulsion animée sur les liaisons, poignées de sélection rondes (couche décorative ou patch d'Excalidraw).
- Replier un groupe sur son étiquette.
- Réglages complets (agent par défaut, seuil d'activité, raccourcis), réordonner les onglets par glisser (`reorder_workspaces`).
- Gemini CLI : états précis par ses hooks (BeforeAgent, AfterAgent, Notification).

## Points mineurs reportés du plan 2

- Un rattachement raté devrait revenir à l'écran sauvegardé (`restoreSession`) et retirer le nœud des sessions vivantes à `pty-exit` ; le recalage avant rattachement marque le terminal comme actif.
- Les échecs de sauvegarde différée sont des rejets non gérés (aucun toast).
- Un `pty-exit` tardif d'un ancien processus peut marquer un terminal relancé comme terminé (ajouter le pid à l'événement).
- Noms de workspace en double autorisés.

## Constats du plan A (relecture finale)

- `restoreSession` ne pose pas la garde `replaying` : une relance pendant la restauration d'un long écran peut envoyer au nouveau processus les réponses de xterm aux anciennes requêtes.
- `list_projects` teste l'existence des dossiers en tenant le verrou de la base (un lecteur réseau hors ligne bloquerait toutes les commandes).
- Restes de « Terminal introuvable » : copie d'un terminal dont la source n'est plus en mémoire ; copie pendant son adoption ; une image « ARRÊTÉ » avant le montage d'un nouveau terminal.
- La couleur de sélection passe par le filtre sombre (≈ `#ea6b40` au lieu de `#f4602e`).
- Les modes zen et lecture (Alt+Z, Alt+R) n'ont plus de bouton de sortie visible.
- Carte d'un projet introuvable : « Renommer » reste proposé ; la confirmation de suppression d'un workspace donne un nombre d'agents, pas leur liste ; le bouton Formes ne garde pas la dernière forme comme outil.
- Le sélecteur de projet rouvre le projet déjà actif, sans gestion d'erreur.
- « Nouvelle console » lance un Shell si on clique avant que la liste des agents soit chargée.
- Ouvrir le menu Stylo réécrit la couleur et l'épaisseur courantes partagées avec les formes.
- Les prénoms des terminaux fermés (encore en mémoire pour Ctrl+Z) ne sont réutilisés qu'au redémarrage.

## Constats du plan B1 (groupes, relecture finale)

- Après une action dans nos menus ou puces (Dégrouper, Fermer le groupe, Lancer 4…), les raccourcis d'Excalidraw (Ctrl+Z en tête) ne répondent qu'après un clic sur le canvas : Excalidraw n'écoute le clavier que dans son conteneur (`handleKeyboardGlobally` désactivé). Piste : rendre le focus au conteneur d'Excalidraw après nos actions (le mode global ferait agir Suppr tapé dans nos menus sur la sélection).
- Ctrl+D ou copier-coller d'un groupe entier garde son panthéon : deux groupes partagent alors les mêmes prénoms ; la première copie adoptée dans un cadre dupliqué prend un prénom hors groupe.
- Un agent ajouté hors de la vue (Ajouter un agent ou Dupliquer vers une nouvelle ligne ou colonne) ne s'affiche ni ne démarre avant qu'on fasse défiler jusqu'à lui (Excalidraw ne monte un nœud qu'une fois visible) : faire défiler la vue vers lui.
- Seul le nom natif sert de poignée : saisir l'étiquette par ses compteurs ou son vide lance une sélection au lasso.
- Les identifiants de cadres ne passent pas par `CSS.escape` dans les règles de transparence injectées.
- Les terminaux arrêtés avant la mise à jour de la netteté rejouent une fois leur ancien écran dans une grille plus étroite (cellule de base de 8 px arrondie, contre 7 px avec FitAddon) : affichage brouillé jusqu'à la relance.
- Entrée dans le champ nom de « Composer un groupe » ne lance pas le groupe.
- Développement : modifier `Canvas.tsx` pendant que l'application tourne fait remonter `LoadedCanvas` avec sa scène d'origine (Fast Refresh), qui est alors enregistrée par-dessus la scène courante (nœuds purgés) ; l'observateur de Vite manque parfois des modifications rapprochées (toucher le fichier).

## Constats du plan B2 (états des agents, relecture finale)

- Une relance refusée pour un nœud qui tourne déjà (« tourne déjà ») efface quand même son suivi d'activité et son fichier de réglages : `pty_spawn` appelle `started`, puis `ended` sur l'erreur, avant le contrôle. Piste : sortir tôt quand le nœud tourne.
- L'instantané chargé au démarrage peut écraser un événement plus récent, et deux fils peuvent émettre dans le désordre (émission après relâche du verrou) : une pastille périmée jusqu'à la transition suivante. Piste : garder l'entrée la plus récente dans `load`, ou numéroter les changements.
- `is_keystroke` n'écarte que le focus et la souris : les réponses du terminal (position du curseur, attributs, OSC, DECRQM) comptent comme des frappes.
- Terminaux sans hooks (Shell, Codex, Gemini…) : l'écho de la frappe et les redessins au redimensionnement comptent comme du travail ; taper dans un Shell allume EN COURS 1,5 s. Piste : ignorer la sortie qui suit une frappe de moins de 200 ms.
- Le dialogue de fermeture dit toujours « tourne encore » ; la spec (§7.5) veut « est en cours » ou « est prête » selon l'activité.
- Le clic sur une ligne du panneau Flotte centre et donne le clavier mais n'active pas l'élément (spec §5.5 « l'active ») : le menu de l'en-tête demande un clic de plus.
- Les compteurs de groupe ne vérifient pas que le processus tourne ; `fleetStateOf` range « en marche sans activité connue » dans Inactifs alors que la pastille dit ACTIF.
- Non traités : un proxy HTTP qui intercepterait `127.0.0.1` (les hooks échouent, l'activité du terminal prend le relais) ; un dialogue d'autorisation répondu hors du terminal (IDE, à distance) laisse ATTEND jusqu'au hook suivant.

## Constats du plan B3 (commande et orchestrateur, relecture finale)

- Les liaisons restent en flèches orange orphelines après Dégrouper, Fermer le groupe, la fermeture d'un terminal relié ou la suppression de l'orchestrateur par Suppr (seul × les retire). Piste : supprimer les flèches dont un bout a disparu, dans la même mise à jour.
- Le marquage des flèches tracées à la main peut être programmé plusieurs fois avant de s'appliquer (versions et sauvegardes en trop) : un drapeau « en attente ».
- La molette au-dessus du champ de l'orchestrateur fait défiler le canvas ; le mode « Relier » avale la molette, et son bouton « Terminer » n'est pas cliquable (le calque prend le clic).
- « Relier un orchestrateur » une seconde fois sur le même groupe pose le nouvel orchestrateur sur le premier : réutiliser `clearSpot`.
- « Reprendre » sur une ligne : rejet non géré si le processus vient de mourir ; aucun message.
- Historique : une consigne envoyée avant la fin du chargement écrase l'historique enregistré (fenêtre de quelques millisecondes).
- Envoyer grisé avec « Écris une consigne » quand les puces ne désignent aucun agent (groupe vide).
- Les agents en démarrage échelonné sont annoncés « arrêtés ignorés ».
- Le test Windows de `pty_send_text` vérifie l'effet de la commande, pas les octets écrits.
- Pas de garde de composition IME dans le champ de commande.

## Constats du plan C1 (fenêtre et livraison, relecture finale)

- Deux « Fermer » dans la rangée du haut : la pastille « × Fermer » (ferme le projet) et le bouton de fenêtre (quitte l'application, arrête les agents) ont la même info-bulle. Renommer celle du bouton de fenêtre « Fermer OpenVibe » (comme spec fenêtre §7.3) ; change la spec §4.3.
- Les 8 px entre deux pastilles de la barre du haut ne cliquent ni ne déplacent la fenêtre : rendre les conteneurs `pointer-events-none` et leurs enfants `pointer-events-auto`.
- La bande de déplacement suppose que ProjectView et HomeScreen ne créent pas de contexte d'empilement (TopBar z-30 au-dessus de DragStrip z-20) : le documenter par un commentaire avant que J7/J8 n'y ajoutent `isolate`, transform ou opacity.
- Le test « sits on an opaque pill » de `WindowControls` ne vérifie que des noms de classes : fragile face à la refonte.

## Constats du plan D1 (fondations de l'identité, relecture finale)

- `index.html` garde `<html class="dark">` et la variante Tailwind `dark` vaut `&:is(.dark *)` : les `dark:` de shadcn (boutons outline/ghost, champs, listes) s'appliquent aussi en Ivoire. Retirer la classe et redéfinir la variante sur `[data-theme="dark"]` avant que R2 n'écrive des `dark:`.
- `text-white` sur l'accent à 8 endroits (accueil, menu Agent, saisie de consigne, offre de reprise, orchestrateur, puce git, `ui.tsx`, onglets) au lieu de `text-ov-on-accent` (blanc sur `#D97757` : 3,1:1).
- Le voile des dialogues shadcn (`backdrop-blur-xs`) ignore le réglage « Effets de transparence ».
- Premier affichage : le choix enregistré n'est lu qu'au boot (une image dans le thème de Windows quand le thème est forcé) et, avant le JS, `<html>` n'a pas de `data-theme` (jetons sombres même si Windows est clair).
- Commentaires périmés : « cream strokes » (`sceneDefaults.ts`), « The orange of the wires (spec habillage §13) » (`wires.ts`).
- `hover:brightness-125` des puces (`ChipButton`) sans effet sur le blanc d'Ivoire (les puces disparaissent en R2).
- `cssBlock` prend la première occurrence textuelle d'un sélecteur (dépend de l'ordre des blocs) ; le test du repli opaque vérifie la présence de la requête média, pas que le bloc opaque est dedans.
- `cssBlocks.ts` (aide de test) référence les types Node dans le programme de l'application : déplacer les aides de test sous une configuration TypeScript dédiée.
- `sceneDefaults.ts` (canvas) importe `PEN_COLORS` de `shell/tools` : la palette irait mieux dans `src/theme`.

## Constats du plan D2 (structure façon canvas libre, relecture finale)

- Réglés par R2, parmi les constats D1 : variante `dark` liée à `data-theme` (plus de `class="dark"`), voile des dialogues qui suit « Effets de transparence », puces disparues ; `text-white` sur l'accent ne reste que dans le menu Agent (commande personnalisée) et l'orchestrateur (R3).
- Le logo et le libellé « OpenVibe » de la barre de titre ne déplacent pas la fenêtre (attribut nu) : `data-tauri-drag-region="deep"` sur la barre, les boutons bloquant toujours.
- En build release, le `<style>` injecté par sonner passe après la feuille de l'application : l'ombre de verre des toasts (même spécificité) est remplacée par celle de sonner. Monter la spécificité ou passer l'ombre par `toastOptions.style`, puis vérifier dans l'installateur.
- Un nom de branche long dans la puce git passe sous la barre de consigne en dessous d'environ 1 210 px de large : tronquer (`max-w-[150px] truncate`, nom complet en info-bulle).
- Les calques de pose et de liaison (`fixed inset-0 z-40`) couvrent la barre de titre pendant la pose ou la liaison : « Fermer OpenVibe » et le déplacement n'y répondent pas (antérieur à R2) ; les faire commencer sous `TOP_ROW_HEIGHT`.
- L'offre « Reprendre toutes les conversations ? » peut couvrir le bas du panneau Agents à pleine hauteur (petit écran) jusqu'à la réponse.
- « Ajuster la vue » (`viewportZoomFactor: 0.9`) laisse les bords de la scène sous les barres de 72 px et la bande du bas : à reprendre avec la zone utile de J7.
- Restes d'ancien style dans des fichiers touchés par R2 : liste des mentions de la saisie de consigne opaque (`CommandInput`), boutons en pilule dans les options du menu Agent et dans « Composer un groupe », boutons de fenêtre de 38 px dans une barre de 37 px utiles, pastille d'attente absente du nom accessible du bouton Agents.
- Le filtre du panneau reste celui posé par un compteur quand le panneau est rouvert depuis le rail (l'état vide l'annonce désormais : « Aucun agent dans ce filtre »).
- Lignes d'agent du panneau (actions au survol Centrer, Pause/Reprendre, Fermer, spec identité §5.6) : avec R3, qui refait `AgentRow`.

## Constats du plan E1 (navigation au clavier, relecture finale)

- Un menu déroulant ouvert (Radix, modal par défaut) n'est pas traité comme un dialogue : Ctrl+Tab déplace la vue et fait clignoter le terminal, mais le menu reprend le clavier. Fermer les menus ouverts avant d'exécuter la commande.
- Maj+Échap est consommé avant les écouteurs d'Échap du mode pose et du mode liaison (`PlacementGhost`, `LinkMode`) : il ne les quitte plus (Échap seul, oui). `canvas.release` pourrait aussi vider `placing` et `linking`. Dans un champ de renommage, Maj+Échap valide (perte du focus) au lieu d'annuler.
- La vue d'ensemble (et « Ajuster la vue ») ignore les barres de verre : passer `canvasOffsets: { top: TOP_ROW_HEIGHT, bottom: BOTTOM_BAR_HEIGHT }` à `scrollToContent`.
- Ctrl+Tab maintenu : une répétition arrivée avant l'image suivante repart de l'ancien terminal et vise deux fois le même (progression ralentie, jamais fausse). Retenir la cible en attente dans `arrive`.
- J8 : l'arrivée différée sur un autre workspace ne partira pas d'une touche ; le focus « à l'image suivante » peut y précéder le montage du terminal. Rendre le focus robuste (réessayer, ou focus au montage du terminal attendu).
- À vérifier à la main : WebView2 transmet-il Ctrl+Tab et Ctrl+Maj+Tab à la page (risque §12.1 de la spec fenêtre).

## Constats du plan F1 (palette et recherche, relecture finale)

- Clic hors de la palette : la fermeture se fait au `pointerdown` ; le `mousedown` qui suit peut encore déplacer le clavier dans WebView2. Empêcher le `mousedown` sur le fond et fermer au clic, puis vérifier dans la build.
- Échap dans la palette termine aussi le mode pose et le mode liaison (leurs écouteurs `window` le reçoivent) : arrêter la propagation dans la branche Échap.
- Ctrl+P maintenu : les répétitions passent jusqu'à `cmdk` (élément précédent, avec retour à la fin) ; consommer les répétitions des raccourcis reconnus sans les exécuter.
- Une arrivée différée peut rester en attente si l'utilisateur change d'onglet ou de projet avant le chargement de la scène visée : elle se déclencherait plus tard. Le premier canvas monté devrait l'utiliser ou l'abandonner.
- Les boucles de focus de deux arrivées peuvent se chevaucher (Ctrl+Tab maintenu) : un jeton de génération arrêterait l'ancienne.
- `focusGroup` cadre sur toute la vue : l'étiquette d'un grand groupe peut passer sous les onglets ; `canvasOffsets` le corrigerait.
- Recherche : pas de bonus pour la correspondance exacte (« tho » à égalité entre Thot et Thor) ; l'apostrophe ne sépare pas les mots (« d'ensemble ») ; « œ » et « æ » non dépliés.
- Affichage : après une flèche, l'ancien choix se voit une image à chaque frappe ; « Aucun résultat » côtoie « Chargement… » pendant la lecture des scènes.
- Ouvrir la palette pendant que le canvas lit une scène lance une deuxième lecture SQLite ; mettre en cache la promesse en cours dans `sceneCache`.

## Constats du plan F2 (catalogue des fonctions, relecture finale)

- « Renommer le groupe » : `focusGroup` cadre sur 90 % de toute la fenêtre, donc pour un grand groupe (13 agents et plus en grille, ou fenêtre basse) le champ du nom passe sous les barres du haut et l'on tape à l'aveugle. Et le `requestAnimationFrame` démarre l'édition à la première image du défilement : si l'étiquette est alors hors champ à droite ou en bas, `focus()` fait défiler le calque `overflow-hidden` des étiquettes (`GroupLabels.tsx`), qui se décalent de leurs cadres. Cadrer dans la zone utile (haut `TOP_ROW_HEIGHT` + 24), attendre la fin du défilement, `focus({ preventScroll: true })`.
- La palette ne recherche pas les agents à l'ouverture (le menu Agent le fait) : un agent installé en cours de route reste grisé jusqu'à l'ouverture du ＋. Avant la première détection, la ligne Shell affiche « introuvable dans le PATH » sans nom (son `binary` est vide). Appeler `agentsStore.load()` à l'ouverture du mode fonctions et lire les agents par `useAgents`.
- Quelques toasts d'échec diffèrent de ceux des boutons (« Dupliquer impossible » contre « Duplication impossible », « Nouveau workspace impossible » contre « Création impossible », « Supprimer le workspace impossible » contre « Suppression impossible », « Relier un orchestrateur impossible » contre « Orchestrateur impossible ») ; la spec demande les mêmes.
- Une demande d'interface (`uiRequests`) sans réponse n'expire jamais : aucun chemin actuel ne la laisse en attente, mais une commande future ou une erreur de rendu la ferait partir au montage suivant (le composeur s'ouvrant au prochain affichage du panneau). L'abandonner après une image, ou au changement de workspace ou de projet.
- Tests : `registry.test` ne vérifie plus la liste exacte par contexte (accueil : Aller à, Projets, Fenêtre, Aide seulement ; Workspaces, Dessin et Scène absents). Ajouter un test de liste exacte par contexte sur `COMMANDS` (spec §11).
- `current.ts` : les conversions forcées (`groupId`, le payload de Relancer) lèvent une `TypeError` si le groupe ou le terminal a disparu entre l'affichage et Entrée (toast « Cannot read properties of null »). Rendre la main sans rien faire.

## Constats du plan G1 (menu radial, relecture finale)

- « Coller » de la palette, sans point, colle au centre de la vue : si un nœud actif s'y trouve (le terminal où l'on travaille, que `arrive` centre), Excalidraw ne colle pas et rien ne le dit (spec menu radial §7). Vérifier `elementFromPoint` dans `pasteOnCanvasAt` et afficher un toast.
- « Verrouiller » / « Déverrouiller » se trompe sur une sélection mêlée : Excalidraw verrouille seulement si tout est déverrouillé, et déverrouille tout sinon. Une sélection mêlée affiche « Verrouiller » mais Ctrl+Maj+L déverrouille. `selectionLocked` = `some(e => e.locked)`.
- Sans Claude ni Codex installés, l'agent par défaut est le Shell : ↑ et ↗ de l'anneau du fond affichent tous deux « Lancer Shell » (icônes différentes).
- L'anneau qui s'ouvre laisse ouverts les autres menus : le menu d'Excalidraw ouvert par « Plus… », le ＋ ouvert par « Autre agent… ». L'appui droit est arrêté en capture et leurs écouteurs « clic dehors » ne le voient pas. Fermer `contextMenu` d'Excalidraw (et les popovers) à l'ouverture.
- Les lignes et flèches tracées vers la gauche ou vers le haut ont leur cadre à `x + minX…` : « dans la sélection » et le centre de rotation de `target.ts` (`boundsOf`, `unturned`) sont faux pour elles.
- `readClipboardText` dit « Presse-papiers vide » quand le presse-papiers ne contient qu'une image : le texte est inexact (le comportement est juste).
- `lib.rs` prend la fenêtre de la configuration par son index (`windows[0]`) : la chercher par son label `main`.

## Constats du plan H1 (pont MCP et frise, relecture finale)

- Titres d'étapes en double (`["Tests","Tests"]`, `["Plan","plan"]`) acceptés : clés React en double et la seconde étape ne se marque jamais. Refuser les doublons (sans casse), clés par indice.
- Le « ×N » des sous-agents est dans le titre tronqué : il disparaît avec beaucoup d'étapes ou à faible zoom. Le sortir du titre.
- Une étape « en cours » pulse encore sous un terminal arrêté (interruption, plantage, redémarrage). Ne pulser que si le terminal tourne.
- Un second `pty_spawn` refusé (« tourne déjà ») révoque le jeton de la session vivante : `ended` ne devrait révoquer que le jeton de ce lancement, ou refuser avant `hooks_for`.
- MCP : un lot JSON-RPC reçoit 202 sans corps, un JSON invalide 400 vide (au lieu de `-32700`), `params: null` passe par l'exception (au lieu de `-32602`), la version demandée est renvoyée telle quelle.
- Le compte des sous-agents se perd au rechargement de la page (pas d'instantané depuis Rust).
- Conversations commencées avant H1 et reprises : `--system-prompt-snapshot` (Claude Code 2.1.304) peut garder l'ancien prompt système, sans la consigne de rôle.
- Tests : un hook servi pendant qu'un appel MCP attend ; `ended()` puis 401 côté Rust ; chemins avec espaces ou apostrophes pour cmd et Git Bash.
- `std::thread::spawn` par requête `/mcp` : passer par `thread::Builder` et répondre 503 si le fil ne se crée pas.

## Constats du plan H2 (mission de l'orchestrateur, relecture finale)

- Un évènement tapé pendant que l'utilisateur écrit dans le terminal de l'orchestrateur part avec son texte à moitié tapé : attendre quelques secondes après une frappe.
- `rebaseTerminalFolders` (projet déplacé) ne rebase ni la session de l'orchestrateur ni les chemins de sa mission.
- Les orchestrateurs créés avant H2 gardent leur taille 320 × 420 : le terminal de Claude et le panneau y sont à l'étroit.
- Le nettoyage étiquette tout échec de `worktree remove` « changements non commités » (un dossier verrouillé par un processus aussi).
- Un agent relié à deux orchestrateurs peut être enrôlé dans deux missions : `linkedClaudeAgents` n'écarte pas les membres d'une mission en cours.
- Les missions ne connaissent les fils et les groupes que de l'espace affiché : hors de l'écran, `proposer_plan` refuse les agents reliés et `terminer` arrête les agents créés au lieu de fermer leur groupe. Lire la scène enregistrée de l'espace de l'orchestrateur.
- La détection « Claude est prêt » lit l'écran : la boîte de saisie (`❯` sous un trait) et l'invite de confiance (« trust » + « folder »). Une autre mise en page de Claude retombe sur le délai de 60 s.

## Constats du plan H3 (temps d'une mission, relecture finale)

- `reattribuer` vers un agent arrêté (par exemple après un redémarrage d'OpenVibe) répond « passe à … », puis l'orchestrateur reçoit « n'a pas démarré » 60 s plus tard : refuser d'emblée un agent arrêté.
- `prolonger` accepte un agent dont la sous-tâche est passée à un autre, ou qui a déjà rendu compte : refuser ces cas.
- Un palier de dépassement est enregistré « signalé » alors que sa ligne attend encore dans la file en mémoire : si OpenVibe se ferme avant que l'orchestrateur soit libre, la ligne est perdue et le palier n'est plus signalé.
- La consigne de reprise écrit toujours « d' » (« Reprise du travail d'Seth ») : reprendre `of` d'`orchestratorTools.ts`.
- `reattribuer` « nouveau » ne tient pas compte d'« Agents max » : l'agent précédent est mis en pause et prié d'arrêter, mais sa session reste ouverte.
- Le temps court aussi quand OpenVibe est fermé (temps réel, spec §8.1) : un redémarrage après une longue pause donne une rafale de toasts pour des agents arrêtés.
- Le budget global est vérifié au plan comme une somme de budgets (minutes-agents en parallèle) mais mesuré en temps écoulé depuis le feu vert : à trancher dans la spec.
- L'horloge ne voit que les missions des espaces chargés depuis le démarrage.
- Le panneau n'affiche pas les sous-tâches déjà finies par un agent qui en a repris une autre (`done`, lu par `equipe`).

## Constats de la mise à jour du 27 octobre (relectures)

### Commandes groupées
- Un nom qui contient `/` (groupe « Front/Back ») se complète mal : `@front/ba` + Tab ajoute aussi l'agent Front. Essayer d'abord le nom entier, puis seulement le découpage.
- `@nobody/ze` + Tab ne garde que Zeus : le nom inconnu disparaît, alors qu'à l'envoi la mention entière resterait du texte.
- Échap sur la liste `@` garde aussi fermée la liste `/` qui commence au même endroit (et l'inverse) : retenir le genre de liste fermée.
- Compléter une commande au milieu du texte laisse un double espace (`/ef lance` → `/effort  lance`).
- La ligne surlignée n'est pas remise à zéro quand le curseur bouge : si la liste rétrécit, Entrée prend la dernière ligne.
- `@thot/ /clear`, liste fermée : aucune cible, la commande part à la sélection comme une consigne.
- Une commande `/…` ne va pas aux terminaux « Personnalisé », même quand ils lancent un agent (Claude avec des options) : à trancher.

### Remote Control
- Après 60 s sans lien lu au démarrage, le téléphone passe à « actif » sans confirmation : afficher plutôt une erreur.
- Après un « Couper » en échec, le menu ne propose plus que « Activer » alors que Remote Control est peut-être encore actif : proposer « Couper » et « Réessayer » tant que l'état est en erreur.
- Le lien d'un nœud supprimé n'est jamais effacé du store (le statut d'un nœud supprimé ne change plus).
- Le toast d'un groupe dit « activé » pour une session arrêtée, quand l'outil dit « au prochain démarrage ».
- `/remote-control` est ajouté au brouillon à moitié tapé dans l'invite de Claude, et le tout part ensemble (comme une consigne).
- Une ligne `[OpenVibe]` de l'orchestrateur ou un `ecrire` peut arriver pendant que le menu Remote Control est ouvert : retenir la file d'écriture pendant toute l'opération.
- `remote_control` : un prénom en double (agent relié et membre de la mission) prend le premier ; « tous » oublie sans le dire les agents reliés quand l'espace de l'orchestrateur n'est pas affiché.
- Juste après un démarrage, Claude dessine encore son écran : OpenVibe le croit au travail ~1,5 s et répond « à la fin de son tour ». La demande est appliquée dès qu'il se calme.

### Routeur de modèles
- « Nettoyer la mission » garde le budget et le nombre d'agents mais pas le routeur : la mission suivante part sans, case décochée.
- Côté Rust, un nom de modèle qui commence par un tiret (`--model '--…'`) est accepté : exiger un premier caractère alphanumérique et une longueur maximale (les valeurs viennent de la table du routeur, c'est une précaution).
- `mission()` donne le modèle prévu par le niveau de la sous-tâche, même quand `reattribuer` l'a confiée à un agent qui garde le sien (`equipe` donne le bon).
- Supprimer un orchestrateur en pleine mission laisse ses agents reliés dans leur worktree, avec le modèle du routeur (la puce de l'en-tête permet de revenir au modèle par défaut).
- Tests absents : `withModel` de `launchGroup`, le modèle d'un agent « nouveau » de `reattribuer`, les guillemets de `--model` sous cmd et Git Bash.

### Icônes Excalidraw
- Messages du panneau : « Icônes introuvables » reste affiché pour toute catégorie après un seul échec, et une recherche dit « Aucune icône » pendant que le gros fichier AWS se charge encore. Tenir un état de chargement par catégorie.
- Le cache des vignettes garde jusqu'à 1 252 SVG (626 icônes × 2 thèmes) et retient un échec de dessin jusqu'au redémarrage.
- Le centrage ignore la rotation : 56 icônes ont des formes tournées et tombent à quelques pixels du centre (Excalidraw utilise `getCommonBounds`).
- Rien ne filtre ce qu'une bibliothèque apporterait de plus lors d'un prochain téléchargement : retirer embeddable, iframe, frame, image et `customData`/`link` dans `readLibrary`. Les fichiers actuels sont propres. « Auto Scaling group » (AWS) contient des éléments verrouillés.
- Sans canvas, le clic ne pose rien mais ferme quand même le panneau ; le panneau se vide pendant l'animation de fermeture ; chaque copie d'une icône garde les mêmes graines de dessin.
- Une icône posée sur un groupe d'agents ne rejoint pas son cadre (Excalidraw l'y ajouterait).

### Revue des changements
- Le code 1 de `git diff --no-index` masque ses erreurs : un dépôt imbriqué non suivi (`nested/`) s'affiche « +0 −0 » et son diff dit « mode ou renommage seul ». Traiter un stderr sans stdout comme une erreur, et sauter les chemins finissant par `/`.
- Les remarques ne retiennent que le numéro de ligne : après « Rafraîchir » ou de nouvelles modifications de l'agent, elles se placent sur une autre ligne. Garder aussi le texte de la ligne, et dire dans le message si la ligne supprimée est comptée depuis HEAD ou depuis la base.
- « Rafraîchir » revient au premier fichier ; rafraîchir ou cliquer une autre ligne perd le texte d'une remarque en cours de saisie.
- Le panneau couvre le rail d'activité et le panneau Agents (ouvrir une revue depuis une ligne du panneau Agents le cache), et un toast peut couvrir « Envoyer ».
- Une erreur de lecture reste affichée si le dossier de l'agent change (les clés des onglets n'incluent pas le dossier).
- Une liste de plus de 5 000 changements est coupée sans le dire.

### Usage dans la barre du haut
- Le `curl` du script passe avant ta ligne d'état : ~100-150 ms de plus à chaque rafraîchissement, jusqu'à ~1 s si le serveur local ne répond pas. Le lancer en arrière-plan.
- `input=$(cat)` retire les sauts de ligne finaux du JSON : une ligne d'état qui lit avec `read -r` sous `set -e` pourrait s'arrêter.
- `CLAUDE_CONFIG_DIR` est lu dans l'environnement d'OpenVibe, pas dans celui du terminal ; la ligne d'état de l'utilisateur est lue au démarrage de chaque session seulement.
- Une remise à zéro hebdomadaire au même jour de la semaine suivante s'affiche « mar. 09:00 », comme aujourd'hui : ajouter la date au-delà de 6 jours. Une limite propre à un modèle, seule, ne s'affiche pas dans la barre.
- `--resume` garde le même identifiant de session : le coût cumulé que Claude restaure peut compter des dépenses d'avant l'ouverture d'OpenVibe.
- Tests absents : la réponse 413 de `/status`, l'exécution réelle du script.

### Vus en filmant le README (27 octobre)
- Détail de l'usage : la section « Cache de prompt » garde les sessions des agents fermés. Après trois relances d'un groupe Athéna/Hermès/Apollon, chaque prénom y figure trois fois. N'y montrer que les sessions vivantes, ou griser et dater les autres.
- Après « Lancer 4 agents », la vue s'ajuste à 40 % : les terminaux sont illisibles tant qu'on ne zoome pas. Plafonner l'ajustement plus haut, quitte à ne montrer que le début du groupe.

## Constats du jalon R1 (ne rien perdre)

- Une relance remplace dans la base l'historique de la session précédente : la mémoire tampon Rust repart vide, et sa première sauvegarde écrase l'ancienne (xterm garde les deux à l'écran jusqu'au redémarrage).
- Le texte des cibles du journal côté page est long (`webview::write@http://localhost:1420/src/app/log.ts:12:54`) : n'y garder que `webview`.
- `text()` de `src/app/log.ts` peut lever dans le `console.error` détourné (objet sans prototype, `toString` qui lève) : l'entourer d'un `try`.
- Une panique dans le traitement d'une requête arrête la boucle du serveur local : hooks et outils MCP ne répondent plus jusqu'au redémarrage. Entourer chaque requête de `catch_unwind` et répondre 500.
- Une sauvegarde d'historique refusée (capture plus ancienne, horloge reculée) ne laisse aucune trace : la journaliser.
- React journalise ses erreurs avec `console.error("%o…")` : la ligne du journal commence par un `%o` littéral.

## Constats du jalon R2 (sécurité)

- Excalidraw déclare pour chaque police une adresse de secours sur esm.sh : la CSP la bloque (rien ne sort), mais la console de la webview affiche ~460 refus à chaque chargement. Retirer l'adresse de secours (patch d'Excalidraw) si ce bruit gêne.
- L'export PNG ou SVG par le dialogue d'enregistrement n'a pas été parcouru sous la CSP (dialogue natif) ; ses besoins (WebAssembly, workers `blob:`, polices locales) l'ont été un par un.
- cmd retire `%`, `!` et `^` des chemins : un compte Windows dont le nom en contient donne à Codex un `-K` faux (états perdus, sans trace au journal).
- `claude_settings::clear` ne supprime que les `.json` : un `curl.cfg` d'une exécution précédente (jeton mort) reste si le serveur ne démarre pas.

## Constats du jalon R3 (missions)

- Tant qu'un nœud n'est pas activé, le canvas d'Excalidraw recouvre ses boutons : le premier clic sur le × d'un orchestrateur ou d'un terminal le sélectionne, le second agit.
- Fermer un orchestrateur en mission laisse ses worktrees et branches ; le dialogue ne le dit pas, et le panneau ne peut plus les nettoyer une fois la ligne purgée.

## Constats du jalon R4 (installeur et mises à jour)

- Le dialogue de mise à jour montre les notes en Markdown brut (`### Fixed`) : les mettre en forme.
- Le redémarrage d'OpenVibe après l'installation repose sur l'installeur NSIS en mode mise à jour : à vérifier sur la première mise à jour réelle (bêta 1 → bêta 2).
- Le build de release n'a pas encore tourné en CI : le lancer à la main (Actions → Release) une fois les secrets de signature posés, et vérifier qu'une version à suffixe (`1.0.0-beta.1`) passe dans l'installeur.
- La vérification automatique (toutes les 6 h) ferme le dialogue de mise à jour s'il est ouvert ; aucun délai d'attente sur la requête (une connexion bloquée laisse « Rechercher les mises à jour » sans réponse) ; l'`Update` précédent n'est pas fermé (une ressource de plus à chaque vérification).
- `installUpdate` appelle `flushAll` et non `saveBeforeClose` : un titre en cours d'édition au moment d'installer est perdu.
- `release.yml` ne lance que les tests de l'interface (la CI sur `main` couvre le reste du même commit) ; actions épinglées par version majeure, pas par SHA ; pas de règle de protection des tags `v*`.
- `SECURITY.md` : le tableau des versions suivies dit encore `main (0.1.x)` ; le CHANGELOG doit présenter OpenVibe (fonctions principales) avant la première bêta.

## Constats du jalon R5a (langues)

- Une erreur de consentement Remote Control est enregistrée en texte (`remoteStore`) : elle garde la langue du moment où elle est survenue.
- Les entrées « Aller à » sont calculées à l'ouverture de la palette : un changement de langue palette ouverte ne les traduit qu'à la réouverture (les commandes de langue ferment la palette).
- Le dialogue « Composer un groupe » garde le nom proposé dans l'ancienne langue si la langue change pendant qu'il est ouvert.

## Constats du jalon R5c (ce qui est dit aux agents)

- Un gros diff affiche le repère `[diff tronqué]` tel que Rust l'écrit (`review.rs`), en français même dans une interface anglaise : `parseDiff` pourrait le reconnaître et montrer son texte traduit.
- Le tableau des niveaux du README (EN et FR) montre encore les identifiants français (`faible (low)`…), alors que l'orchestrateur reçoit et envoie `low`, `medium`, `high`, `extreme`.
- `mission` rend `linked_agents` en liste, ou en phrase quand l'espace de l'orchestrateur n'est pas affiché : `null` avec une note serait plus simple à lire pour un agent.
- En français, l'agent envoie `done` à `step` et lit en retour « fait » ou « en cours » : les deux vocabulaires se côtoient (textes français gardés tels quels).
- `step` répond `echec` sans accent en français (l'identifiant interne transparaît).
- Un orchestrateur relancé (`--resume`) reçoit ses consignes dans la langue courante, qui peut différer de celle de son historique.
- La fenêtre d'erreur de base de données montre le français puis l'anglais ; l'erreur elle-même y est en français dans les deux moitiés.

## Constats du jalon R5d (accueil et dépannage)

- Copier-coller (ou Ctrl+D) un orchestrateur ne vérifie pas que Claude Code est installé : la copie est créée puis échoue au lancement avec l'erreur brute au lieu du message « Claude Code n'est pas installé ».
- Si `list_agents` échoue sur l'accueil, l'encart « Bien démarrer » n'apparaît jamais et rien ne dit pourquoi : un toast serait utile.
- L'état « fait » d'une étape de « Bien démarrer » n'est annoncé qu'en couleur et en barré : `aria-label` est posé sur un `<span>` sans rôle, ignoré par les lecteurs d'écran.
- Un refus du presse-papiers (copie de la commande d'installation ou du diagnostic) ne donne aucun message.
- Le bouton de fermeture des dialogues shadcn a un libellé caché « Close » en anglais, même en français.
- Une valeur du PATH entre guillemets (`"C:\Program Files\x"`) n'est pas débarrassée de ses guillemets à la fusion.
