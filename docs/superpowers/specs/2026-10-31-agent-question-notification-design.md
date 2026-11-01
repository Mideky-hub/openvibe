# Notification « agent a une question » — design

Mission nocturne du 31 octobre 2026, décidée sans interlocuteur : chaque choix ci-dessous est un choix par défaut, à reprendre si l'usage le contredit.

## 1. Problème

Un agent qui attend une permission ou une réponse n'affiche que sa pastille ATTEND et un compteur ambre limité au workspace à l'écran. Hors de vue, il attend en silence : son travail s'arrête sans que personne le sache.

## 2. Ce qu'on ajoute

- Une notification persistante, cliquable : « <nom> a une question ».
- Elle apparaît quand un agent se met à attendre et disparaît quand il cesse d'attendre. Elle ne se ferme pas à la main et ne s'efface pas seule : tant que l'agent est bloqué, l'information reste vraie.
- Un clic amène à l'agent avec le clavier, y compris depuis un autre workspace du projet.
- Une commande de palette va à l'agent en attente suivant.

## 3. Qui attend

Un agent attend quand trois conditions sont réunies :

1. son activité est `waiting` (hooks Claude, `src-tauri/src/agents/activity.rs`) ;
2. son processus tourne (statut `running`), comme pour les compteurs existants ;
3. son nœud appartient à un workspace du projet ouvert.

Les orchestrateurs comptent : leur session Claude pose elle aussi des questions.

La liste suit l'ordre d'attente, le plus ancien d'abord : qui attend depuis le plus longtemps passe devant, et les lignes ne sautent pas quand un nouvel agent arrive.

Limites assumées :

- **Autres projets** : pas de notification. Le brief s'arrête au projet ouvert, et on ne saurait pas nommer ces agents, dont les nœuds peuvent ne pas être chargés.
- **Après un rechargement de l'interface** : un agent d'un workspace pas encore rouvert n'a ni nœud chargé ni statut connu. Il n'apparaît qu'à la réouverture de ce workspace, comme pour les badges des onglets.

## 4. Présentation

- **Place** : en bas à gauche, à 58 px du bas et 70 px de la gauche : au-dessus de la puce git, et à droite du rail d'outils, qu'elle ne recouvre donc jamais, même dans une fenêtre basse. Le haut du canvas reste aux barres (spec identité : pas de bandeau sous les onglets), et le bas à droite aux toasts.
- **Ne pas cacher la question** : si la notification recouvrirait un nœud à l'arrivée, la vue le recentre. Une question s'affiche en bas du terminal, là où la notification risque de tomber. Dans une très petite fenêtre, un léger recouvrement reste possible.
- **Style** (spec identité §4) : verre dense, rayon 14 px, pastille `--ov-wait`, texte `--ov-text`.
- **Pile** : une ligne par agent, trois au plus. Au-delà, une dernière ligne « + N autres » amène au premier agent caché : elle reste utile sans ajouter d'état.
- **Autre workspace** : la ligne affiche à droite le nom du workspace.
- **Agent déjà au clavier** : sa ligne reste affichée. La règle reste simple (la notification suit l'état de l'agent) et on évite de la faire clignoter à chaque changement de focus.

## 5. Arriver sur l'agent

Le clic et la commande reprennent le chemin d'« Aller à » (spec fenêtre §7.2) :

- même workspace : `arrive()`, qui déplace la vue si besoin, active le nœud et donne le clavier ;
- autre workspace : `requestArrival()` puis sélection du workspace ; le canvas termine l'arrivée une fois sa scène à l'écran ;
- nœud disparu : le toast « <nom> n'existe plus ». Ce toast était écrit en français en dur sur le chemin inter-workspaces ; il passe par `messages.ts`.

## 6. Commande de palette

- **Identifiant** : `agent.nextWaiting`, section Navigation, juste après « Terminal précédent ».
- **Libellé** : « Aller à l'agent en attente suivant » / « Go to the next waiting agent ».
- **Disponibilité** : seulement si un agent attend.
- **Ordre** : l'agent qui suit le nœud courant dans la liste du §3, en bouclant ; le premier si le nœud courant n'attend pas. Le clavier d'un orchestrateur n'étant pas dans le contexte des commandes, un orchestrateur qu'on vient d'atteindre compte comme nœud courant.
- **Raccourci** : aucun. Le brief demande une commande ; un raccourci de plus empiéterait sur les touches envoyées aux terminaux.

## 7. Aperçu de la question

L'aperçu vient du champ `message` du hook `Notification`, jamais de l'écran :

- les dialogues de Claude sont dessinés par une interface en mode texte, sans marqueur stable : lire le tampon xterm, c'est deviner où commence la question ;
- un aperçu faux est pire que pas d'aperçu : il pousse à répondre à côté.

Règles :

- **Repli** : pas de `message`, ou rien de lisible après nettoyage : pas d'aperçu, la ligne reste « <nom> a une question ». La documentation de Claude Code ne garantit pas le champ pour chaque type de notification.
- **Texte non fiable** : son origine n'est pas documentée, il peut reprendre des noms d'outils ou de serveurs MCP. Rust le nettoie à la réception : séquences d'échappement retirées avec leur contenu, caractères de contrôle retirés, caractères de direction et invisibles retirés (ils peuvent déguiser un texte ou laisser une ligne vide), espaces regroupés. Le nettoyage est itératif : un corps de hook rempli de séquences imbriquées ne peut pas épuiser la pile. L'interface l'affiche en texte brut, jamais en HTML ni en Markdown.
- **Longueur** : 140 caractères au plus, coupés avec « … ». L'affichage tronque sur une ligne ; l'infobulle montre le texte plafonné.
- **Durée de vie** : l'aperçu ne vit que le temps de l'attente. Un nouveau hook d'attente le remplace, ou l'efface s'il n'a pas de message, sans changer l'ordre d'attente. Une date à plus de 50 ms de la date gardée désigne une autre attente, pour que les événements arrivés dans le désordre restent écartés.
- **Dans la fenêtre seulement** : la notification Windows garde « <nom> a une question ». Elle peut s'afficher sur l'écran verrouillé, où un chemin ou un nom de commande n'a rien à faire.

Le texte d'exemple de la documentation est générique (« Claude needs your permission ») et en anglais quelle que soit la langue de l'interface : l'aperçu peut donc dire peu de chose.

## 8. Notification Windows

Ajoutée avec le plugin officiel `tauri-plugin-notification` : un agent bloqué se voit mal quand la fenêtre est derrière une autre.

- **Quand** : un agent se met à attendre et la fenêtre n'a pas le focus. Une seule notification par attente ; un rechargement de l'interface ne répète pas les attentes déjà connues.
- **Texte** : titre « OpenVibe », corps « <nom> a une question », dans la langue de l'interface.
- **Clic** : la fenêtre revient au premier plan et, si l'agent attend encore et qu'un projet est ouvert, on arrive sur lui comme au §5. Sinon, seule la fenêtre revient.
- **Permission** : rien à demander, le plugin l'accorde toujours sur ordinateur.
- **Échec** : journalisé. La notification dans la fenêtre (§4) reste la référence.
- **Limite** : Windows ne signale le clic à OpenVibe que tant que la notification est à l'écran, pas une fois passée dans le centre de notifications. Ce clic-là peut relancer l'application : le §10 ramène alors la fenêtre en cours, sans amener à l'agent.
- **Réglage** : voir le §11.

## 9. Tests

Voir aussi les §10 et §11.

- Liste des agents en attente : filtres du §3, ordre, nom d'un terminal sans prénom, agent suivant.
- Notification : apparition, disparition, pile et « + N autres », nom du workspace, clic ; français et anglais.
- Arrivée : même workspace, autre workspace, nœud disparu, en français et en anglais.
- Commande : disponibilité, ordre, place dans la section.

À vérifier à la main : voir le compte rendu de la mission.

## 10. Instance unique

Deux instances sur une même base, c'est un risque de perte de données pour les testeurs.

- **Plugin** : `tauri-plugin-single-instance` officiel, à version exacte, enregistré avant tout le reste : la seconde instance se ferme avant de toucher au journal ou à la base.
- **Seconde lancée** : elle ramène la fenêtre en cours (restaurée si réduite, au premier plan). Pendant la fermeture de la première instance, il n'y a plus de fenêtre à ramener : les deux se ferment, et il faut relancer.
- **Par identifiant** : le verrou porte sur l'identifiant de l'application. Le profil de développement (`dev.openvibe.probe`) tourne donc à côté d'une version installée, mais deux exécutables de même identifiant ne tournent jamais ensemble, quelle que soit leur version : ils partagent la même base. La fonction `semver` du plugin reste donc coupée.
- **Clic dans le centre de notifications** : Windows relance l'application sans argument, la bibliothèque des notifications n'en posant aucun. La fenêtre en cours revient, mais on ne sait pas de quelle notification vient la relance. OpenVibe ne devine pas : une relance manuelle est identique, et elle déplacerait le canvas sans raison. La notification du §4 attend dans la fenêtre.

## 11. Réglage

« Notifications Windows » dans le menu Réglages, activé par défaut, enregistré comme les autres réglages. Il coupe seulement la notification Windows : la notification dans la fenêtre (§4) reste, car elle dit l'état de l'agent. Un réglage illisible laisse la notification activée.
