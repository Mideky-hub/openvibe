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

- **Place** : en bas à gauche, au-dessus de la puce git (58 px du bas, 12 px de la gauche). Le haut du canvas reste aux barres (spec identité : pas de bandeau sous les onglets), et le bas à droite aux toasts.
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
- **Ordre** : l'agent qui suit le nœud courant dans la liste du §3, en bouclant ; le premier si le nœud courant n'attend pas.
- **Raccourci** : aucun. Le brief demande une commande ; un raccourci de plus empiéterait sur les touches envoyées aux terminaux.

## 7. Aperçu de la question : non

Le brief ne veut un aperçu que s'il se lit de façon fiable dans le terminal. Ce n'est pas le cas :

- les dialogues de Claude sont dessinés par une interface en mode texte, sans marqueur stable : lire le tampon xterm, c'est deviner où commence la question parmi les cadres, les choix et la sortie précédente ;
- ce dessin change avec les versions de Claude, et cette mission n'a pas le droit de lancer un vrai agent pour le vérifier ;
- un aperçu faux est pire que pas d'aperçu : il pousse à répondre à côté.

Piste hors périmètre : le champ `message` du hook `Notification` serait plus sûr que le terminal, mais il demande de changer l'événement d'activité côté Rust et de vérifier son contenu sur un vrai agent.

## 8. Notification Windows

Optionnelle, et seulement avec le plugin officiel `tauri-plugin-notification`. La décision et sa raison figurent dans le compte rendu de la mission.

## 9. Tests

- Liste des agents en attente : filtres du §3, ordre, nom d'un terminal sans prénom, agent suivant.
- Notification : apparition, disparition, pile et « + N autres », nom du workspace, clic ; français et anglais.
- Arrivée : même workspace, autre workspace, nœud disparu, en français et en anglais.
- Commande : disponibilité, ordre, place dans la section.

À vérifier à la main : voir le compte rendu de la mission.
