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

- Faciliter l'installation des agents (Claude Code, Gemini, Qwen Code, Cursor, Ollama, Aider etc... en un clic depuis l'interface, et permettre de configurer/installer des modèles locaux facilement sur Ollama)
- Permettre à un orchestrateur, quand il est lié à plusieurs groupes, de donner du travail au groupe qui lui semble le plus pertinent. Quand il a des groupes (frontend, backend, design etc...), Il distribue sans vraiment de distinction les tâches attribuées. L'idée est d'avoir des groupes spécialisée.
- Ajouter des foncitonnalitée de prise de notes et de gestion de mémoires types obsidian, attribuables à des groupes comme contexte optionnel, que toi au l'orchestrateur peut utiliser comme base potentielle de documentation supplémentaires. Avec une fonctionnalités d'affichage par graphique.
- Quand un agent à une question, permettre de répondre facilement à sa question avec une notification type "un agent a une question", quand tu cliques, ça t'emmènes directement pour y répondre.

## Fonctionnalités inspirées de Symvibe

### Widgets du canvas (remplacent les nœuds Note, Kanban et Git Watcher de la spec V1)

- **Calendrier** : grille mensuelle, aujourd'hui en orange, Nouveau / Aujourd'hui / navigation, fenêtre d'événement (date, journée entière, 6 couleurs, notes), glisser un événement d'un jour à l'autre. Vidéo : node-kanban.
- **Checklist d'objectifs** : état vide « Aucun objectif », « Ajouter un objectif ». Vidéo : node-kanban.
- **Post-it** : papier ligné ocre, coin corné, police manuscrite, panneau PAPIER (9 couleurs, ordre, dupliquer, supprimer) ; remplace le nœud Note. Vidéo : node-kanban.
- **Tuile web** : dessinée à la souris ; onglets, navigation, barre d'adresse ; lanceur « Ouvrir une page » avec détection des ports localhost actifs (:3000, :5173…) et accès rapide ; préréglages d'écran et de téléphone ; pas d'inspecteur par tuile sous WebView2. Vidéo : node-webtiles.
- **Icônes cloud** (spec V1 §7) : import des packs officiels AWS, Azure, GCP, recherche et insertion ; migration ultérieure pour les tables `icon_packs` et `icons`.

### Git

- **Fenêtre git** depuis la puce de branche : liste des changements avec cases, statut, +/−, annuler un fichier ; message de commit (avec génération par un agent) ; « Commit & Push N fichiers » avec états Lecture → Commit → Push → arbre propre ; historique (hash, auteur, date). Vidéo : node-git.

### Studios (modales ouvertes depuis le rail droit)

- **Markdown** : arbre `docs/`, vues Lecture / Source / Graphe de liens, « Ajouter au board », export PDF ; nœud avec « Ouvrir dans le studio ». Vidéo : studio-markdown.
- **Documents** : document rédigé par un agent CLI (modèle, effort Rapide / Équilibré / Approfondi, flux en direct, Stop), rendu « papier », export PDF. Vidéo : studio-documents.
- **Diagrammes** : l'agent dessine des éléments Excalidraw natifs (modèle, style Encre / Coloré, presets « Architecture », « Flux de données »…, prompt, formes de départ). Vidéo : studio-diagrams.

### Automatisation

- **Mémoire** : faits par dépôt ou globaux (Architecture, Structure, Commandes, Conventions, Pièges, Contexte), scan du dépôt par un agent jetable avec revue, éditeur, carte mémoire posée sur le board et poussée aux consoles reliées. Vidéo : node-memory.
- **Carte de mission** : arbre Orchestrateur → Équipe → consoles, filtres par état, recherche, inspecteur (aller à la console, pause, fermer, cadrer l'équipe). Vidéo : teams.
- **Presets d'équipes** : déployer une topologie complète (plusieurs groupes, orchestrateur, tuile web), ex. « Dev HQ ». Vidéo : voice.
- **Menu Outils** (mallette de la barre du haut) regroupant ces entrées.

### Comptes et quotas

- **Usage** : jauge de la session Claude, limites hebdomadaires, heure de réinitialisation dans la barre du haut, carte d'activité, statistiques. Vidéo : node-usage.
- **Tokens** : lecture des logs locaux de Claude et Codex, graphe sur 30 jours, détail par agent. Vidéo : node-usage.

### Voix et directeur IA

- Maintenir Espace pour parler (reconnaissance locale, Whisper ou équivalent : WebView2 n'en fournit pas hors ligne), forme d'onde, « J'écoute » / « Je réfléchis ».
- Directeur IA : interprète la demande et agit sur le canvas (créer des groupes, relier un orchestrateur, déployer un preset, fermer avec confirmation), fil de discussion dépliable avec lignes « Plan ». Vidéo : voice.

### Interface

- Thème clair.
- Halo lumineux et impulsion animée sur les liaisons, poignées de sélection rondes (couche décorative ou patch d'Excalidraw).
- Réglages complets (agent par défaut, seuil d'activité, raccourcis).
- Gemini CLI : états précis par ses hooks (BeforeAgent, AfterAgent, Notification).

## Points mineurs reportés du plan 2

- Un rattachement raté devrait revenir à l'écran sauvegardé (`restoreSession`) et retirer le nœud des sessions vivantes à `pty-exit` ; le recalage avant rattachement marque le terminal comme actif.

## Constats du plan A (relecture finale)

- Restes de « Terminal introuvable » : copie d'un terminal dont la source n'est plus en mémoire ; copie pendant son adoption ; une image « ARRÊTÉ » avant le montage d'un nouveau terminal.
- La couleur de sélection passe par le filtre sombre (≈ `#ea6b40` au lieu de `#f4602e`).
- Le bouton Formes ne garde pas la dernière forme comme outil.

## Constats du plan B1 (groupes, relecture finale)

- Seul le nom natif sert de poignée : saisir l'étiquette par ses compteurs ou son vide lance une sélection au lasso.
- Les terminaux arrêtés avant la mise à jour de la netteté rejouent une fois leur ancien écran dans une grille plus étroite (cellule de base de 8 px arrondie, contre 7 px avec FitAddon) : affichage brouillé jusqu'à la relance.
- Développement : modifier `Canvas.tsx` pendant que l'application tourne fait remonter `LoadedCanvas` avec sa scène d'origine (Fast Refresh), qui est alors enregistrée par-dessus la scène courante (nœuds purgés) ; l'observateur de Vite manque parfois des modifications rapprochées (toucher le fichier).

## Constats du plan B2 (états des agents, relecture finale)

- Non traités : un proxy HTTP qui intercepterait `127.0.0.1` (les hooks échouent, l'activité du terminal prend le relais) ; un dialogue d'autorisation répondu hors du terminal (IDE, à distance) laisse ATTEND jusqu'au hook suivant.

## Constats du plan B3 (commande et orchestrateur, relecture finale)

- Le test Windows de `pty_send_text` vérifie l'effet de la commande, pas les octets écrits.

## Constats du plan C1 (fenêtre et livraison, relecture finale)

- Deux « Fermer » dans la rangée du haut : la pastille « × Fermer » (ferme le projet) et le bouton de fenêtre (quitte l'application, arrête les agents) ont la même info-bulle. Renommer celle du bouton de fenêtre « Fermer OpenVibe » (comme spec fenêtre §7.3) ; change la spec §4.3.
- Les 8 px entre deux pastilles de la barre du haut ne cliquent ni ne déplacent la fenêtre : rendre les conteneurs `pointer-events-none` et leurs enfants `pointer-events-auto`.
- La bande de déplacement suppose que ProjectView et HomeScreen ne créent pas de contexte d'empilement (TopBar z-30 au-dessus de DragStrip z-20) : le documenter par un commentaire avant que J7/J8 n'y ajoutent `isolate`, transform ou opacity.
- Le test « sits on an opaque pill » de `WindowControls` ne vérifie que des noms de classes : fragile face à la refonte.

## Constats du plan D1 (fondations de l'identité, relecture finale)

- `index.html` garde `<html class="dark">` et la variante Tailwind `dark` vaut `&:is(.dark *)` : les `dark:` de shadcn (boutons outline/ghost, champs, listes) s'appliquent aussi en Ivoire. Retirer la classe et redéfinir la variante sur `[data-theme="dark"]` avant que R2 n'écrive des `dark:`.
- `text-white` sur l'accent à 8 endroits (accueil, menu Agent, saisie de consigne, offre de reprise, orchestrateur, puce git, `ui.tsx`, onglets) au lieu de `text-ov-on-accent` (blanc sur `#D97757` : 3,1:1).
- Le voile des dialogues shadcn (`backdrop-blur-xs`) ignore le réglage « Effets de transparence ».
- Commentaires périmés : « cream strokes » (`sceneDefaults.ts`), « The orange of the wires (spec habillage §13) » (`wires.ts`).
- `hover:brightness-125` des puces (`ChipButton`) sans effet sur le blanc d'Ivoire (les puces disparaissent en R2).
- `cssBlock` prend la première occurrence textuelle d'un sélecteur (dépend de l'ordre des blocs) ; le test du repli opaque vérifie la présence de la requête média, pas que le bloc opaque est dedans.
- `cssBlocks.ts` (aide de test) référence les types Node dans le programme de l'application : déplacer les aides de test sous une configuration TypeScript dédiée.
- `sceneDefaults.ts` (canvas) importe `PEN_COLORS` de `shell/tools` : la palette irait mieux dans `src/theme`.

## Constats du plan D2 (structure façon canvas libre, relecture finale)

- Réglés par R2, parmi les constats D1 : variante `dark` liée à `data-theme` (plus de `class="dark"`), voile des dialogues qui suit « Effets de transparence », puces disparues ; `text-white` sur l'accent ne reste que dans le menu Agent (commande personnalisée) et l'orchestrateur (R3).
- Restes d'ancien style dans des fichiers touchés par R2 : liste des mentions de la saisie de consigne opaque (`CommandInput`), boutons en pilule dans les options du menu Agent et dans « Composer un groupe », boutons de fenêtre de 38 px dans une barre de 37 px utiles, pastille d'attente absente du nom accessible du bouton Agents.
- Lignes d'agent du panneau (actions au survol Centrer, Pause/Reprendre, Fermer, spec identité §5.6) : avec R3, qui refait `AgentRow`.

## Constats du plan E1 (navigation au clavier, relecture finale)

- J8 : l'arrivée différée sur un autre workspace ne partira pas d'une touche ; le focus « à l'image suivante » peut y précéder le montage du terminal. Rendre le focus robuste (réessayer, ou focus au montage du terminal attendu).
- À vérifier à la main : WebView2 transmet-il Ctrl+Tab et Ctrl+Maj+Tab à la page (risque §12.1 de la spec fenêtre).

## Constats du plan F1 (palette et recherche, relecture finale)

- Clic hors de la palette : la fermeture se fait au `pointerdown` ; le `mousedown` qui suit peut encore déplacer le clavier dans WebView2. Empêcher le `mousedown` sur le fond et fermer au clic, puis vérifier dans la build.
- Les boucles de focus de deux arrivées peuvent se chevaucher (Ctrl+Tab maintenu) : un jeton de génération arrêterait l'ancienne.
- `focusGroup` cadre sur toute la vue : l'étiquette d'un grand groupe peut passer sous les onglets ; `canvasOffsets` le corrigerait.
- Affichage : après une flèche, l'ancien choix se voit une image à chaque frappe ; « Aucun résultat » côtoie « Chargement… » pendant la lecture des scènes.

## Constats du plan H1 (pont MCP et frise, relecture finale)

- Le compte des sous-agents se perd au rechargement de la page (pas d'instantané depuis Rust).
- Conversations commencées avant H1 et reprises : `--system-prompt-snapshot` (Claude Code 2.1.304) peut garder l'ancien prompt système, sans la consigne de rôle.

## Constats du plan H2 (mission de l'orchestrateur, relecture finale)

- Les orchestrateurs créés avant H2 gardent leur taille 320 × 420 : le terminal de Claude et le panneau y sont à l'étroit.
- La détection « Claude est prêt » lit l'écran : la boîte de saisie (`❯` sous un trait) et l'invite de confiance (« trust » + « folder »). Une autre mise en page de Claude retombe sur le délai de 60 s.

## Constats du plan H3 (temps d'une mission, relecture finale)

- L'horloge ne voit que les missions des espaces chargés depuis le démarrage.

## Constats de la mise à jour du 27 octobre (relectures)

### Commandes groupées
- Une commande `/…` ne va pas aux terminaux « Personnalisé », même quand ils lancent un agent (Claude avec des options) : à trancher.

### Remote Control
- Juste après un démarrage, Claude dessine encore son écran : OpenVibe le croit au travail ~1,5 s et répond « à la fin de son tour ». La demande est appliquée dès qu'il se calme.

### Routeur de modèles
- Supprimer un orchestrateur en pleine mission laisse ses agents reliés dans leur worktree, avec le modèle du routeur (la puce de l'en-tête permet de revenir au modèle par défaut).

### Icônes Excalidraw
- Rien ne filtre ce qu'une bibliothèque apporterait de plus lors d'un prochain téléchargement : retirer embeddable, iframe, frame, image et `customData`/`link` dans `readLibrary`. Les fichiers actuels sont propres. « Auto Scaling group » (AWS) contient des éléments verrouillés.
- Sans canvas, le clic ne pose rien mais ferme quand même le panneau ; le panneau se vide pendant l'animation de fermeture ; chaque copie d'une icône garde les mêmes graines de dessin.

### Revue des changements
- Une erreur de lecture reste affichée si le dossier de l'agent change (les clés des onglets n'incluent pas le dossier).

### Usage dans la barre du haut
- `CLAUDE_CONFIG_DIR` est lu dans l'environnement d'OpenVibe, pas dans celui du terminal ; la ligne d'état de l'utilisateur est lue au démarrage de chaque session seulement.
- `--resume` garde le même identifiant de session : le coût cumulé que Claude restaure peut compter des dépenses d'avant l'ouverture d'OpenVibe.

## Constats du jalon R2 (sécurité)

- Excalidraw déclare pour chaque police une adresse de secours sur esm.sh : la CSP la bloque (rien ne sort), mais la console de la webview affiche ~460 refus à chaque chargement. Retirer l'adresse de secours (patch d'Excalidraw) si ce bruit gêne.
- L'export PNG ou SVG par le dialogue d'enregistrement n'a pas été parcouru sous la CSP (dialogue natif) ; ses besoins (WebAssembly, workers `blob:`, polices locales) l'ont été un par un.
- cmd retire `%`, `!` et `^` des chemins : un compte Windows dont le nom en contient donne à Codex un `-K` faux (états perdus, sans trace au journal).

## Constats du jalon R3 (missions)

- Tant qu'un nœud n'est pas activé, le canvas d'Excalidraw recouvre ses boutons : le premier clic sur le × d'un orchestrateur ou d'un terminal le sélectionne, le second agit.

## Constats du jalon R4 (installeur et mises à jour)

- Le redémarrage d'OpenVibe après l'installation repose sur l'installeur NSIS en mode mise à jour : à vérifier sur la première mise à jour réelle (bêta 1 → bêta 2).
- Le build de release n'a pas encore tourné en CI : le lancer à la main (Actions → Release) une fois les secrets de signature posés, et vérifier qu'une version à suffixe (`1.0.0-beta.1`) passe dans l'installeur.
- `release.yml` ne lance que les tests de l'interface (la CI sur `main` couvre le reste du même commit) ; actions épinglées par version majeure, pas par SHA ; pas de règle de protection des tags `v*`.
- `SECURITY.md` : le tableau des versions suivies dit encore `main (0.1.x)` ; le CHANGELOG doit présenter OpenVibe (fonctions principales) avant la première bêta.

## Constats du jalon R5a (langues)

- Les entrées « Aller à » sont calculées à l'ouverture de la palette : un changement de langue palette ouverte ne les traduit qu'à la réouverture (les commandes de langue ferment la palette).
- Le dialogue « Composer un groupe » garde le nom proposé dans l'ancienne langue si la langue change pendant qu'il est ouvert.

## Constats du jalon R5c (ce qui est dit aux agents)

- Un gros diff affiche le repère `[diff tronqué]` tel que Rust l'écrit (`review.rs`), en français même dans une interface anglaise : `parseDiff` pourrait le reconnaître et montrer son texte traduit.
- Le tableau des niveaux du README (EN et FR) montre encore les identifiants français (`faible (low)`…), alors que l'orchestrateur reçoit et envoie `low`, `medium`, `high`, `extreme`.
- En français, l'agent envoie `done` à `step` et lit en retour « fait » ou « en cours » : les deux vocabulaires se côtoient (textes français gardés tels quels).
- Un orchestrateur relancé (`--resume`) reçoit ses consignes dans la langue courante, qui peut différer de celle de son historique.
- La fenêtre d'erreur de base de données montre le français puis l'anglais ; l'erreur elle-même y est en français dans les deux moitiés.

## Constats de la nuit du 31 octobre

### Boucles
- Une boucle peut taper dans les millisecondes qui précèdent l'ouverture d'un dialogue de Claude.
- Le déclencheur « sortie contenant un texte » ne lit que les 40 dernières lignes.
- Une boucle dont la seule cible a quitté continue de tourner.

### Presets d'équipe
- Un seul « annuler » par groupe lors d'un déploiement, pas un pour l'ensemble.

### Fenêtre git
- Un hook git ou un push sans délai d'attente peut bloquer la fenêtre indéfiniment.
- Pas de rafraîchissement automatique de la liste des changements.
- Le commit prend le contenu des fichiers au moment du clic, pas à celui où l'utilisateur a coché.
- `pushurl` n'est pas pris en compte pour nommer la cible du bouton.
- Un renommage qui ne change que la casse, et un fichier remplacé par un dossier, ne sont pas traités.
- Restes de pastilles en pilule dans `MissionPanel`, `ReviewPanel`, `IconsMenu`, `UpdateDialog` et `CommandInput`.
- Le repère « [diff tronqué] » est écrit en dur par Rust, en français.

### Studio de code et notes
- Course entre la vérification et le renommage d'un fichier (studio et notes).
- Code Studio : changer d'onglet refait l'éditeur, donc perd l'historique d'annulation et la position (comme en 1.1.0-beta.1).
- Code Studio : seul l'onglet affiché est comparé au disque ; les autres le sont en revenant dessus, et à l'écriture de toute façon.
- Code Studio : les onglets d'un projet retiré restent en mémoire jusqu'à la fermeture.
- Notes : renommer et supprimer une note ne sont pas proposés.
- Le glisser et la molette du graphe ne sont pas testés ; la remise à zéro du graphe n'a pas de test.

### Question d'un agent et notifications
- L'aperçu de la question est peut-être trop générique selon l'invite de l'agent.
- Un clic sur la notification Windows n'amène pas jusqu'à l'agent.
- Les builds copiés ne sont plus côte à côte (instance unique).

### Groupes
- Un groupe relié à deux orchestrateurs.
- Le texte de la spécialité est perdu sans Entrée.
- Flèche haut dans le champ de spécialité.
- Deux groupes de même nom.
- Un pull de plus de 30 minutes n'affiche aucun toast.

### Missions de nuit (suite du ticket #92)
- Tâche abandonnée après `next_task`.
- Une branche par agent.
- Les permissions propres de l'orchestrateur.
- Les barrières de push ne sont pas une frontière de sécurité.
- Une fin de mission pendant une relance.
- Le lien Remote Control change.
- `activeId` pendant un changement d'espace.
- Taille xterm d'un agent hors écran.
- Les erreurs de ticket s'affichent tard.
- Le rapport du matin ne s'exporte pas.
- Source Kanban.
- Les contrôles `gh` avant le premier démarrage.
- Délai de `sceneAccess`.
- Une issue étiquetée puis modifiée plus tard.
- Une permission conservée après la fermeture d'un orchestrateur.
- La fermeture d'un projet ne libère pas le PC.
- Une sauvegarde stockée qui échoue n'est que journalisée.

### Agents et comptes
- Le lancement de Gemini n'est pas câblé aux hooks.
- Tokens : Claude seulement, jours comptés en UTC.
- Une commande `/…` n'atteint pas les terminaux « Personnalisé » (question laissée ouverte).
- Fenêtre « occupé » de ~1,5 s après le démarrage de Claude.
- Orchestrateur supprimé en pleine mission : sort des agents reliés à décider.
- « Ne répond pas » reste inexpliqué.

### Tests et techniques
- Le test du scrollback dépend d'un journal global.
- Fenêtre de sortie du pty.
- `lastInput` compte les réponses du terminal.
- `releaseToCanvas` depuis la vue d'ensemble.
- Une arrivée en attente qui prend le clavier.
- Jeton de hook partagé.
