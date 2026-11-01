# OpenVibe — Boucles : une consigne qui repart toute seule, avec des garde-fous (spec)

Date : 2026-11-01. Idée du backlog (Automatisation) : des consignes récurrentes. Identité propre à OpenVibe : une boucle **coûte de l'usage réel** à chaque tour ; tout dans la conception sert donc à la rendre bornée, visible et arrêtable d'un clic.

## 1. Objectif

Envoyer une consigne choisie à des agents choisis, de façon répétée, selon un déclencheur, jusqu'à une condition d'arrêt.

### Critère de succès

- Une boucle ne se crée pas sans condition d'arrêt (nombre de tours ou durée).
- Le nombre de tours est visible en permanence tant qu'une boucle tourne, avec un bouton « Tout arrêter » à un clic.
- Une boucle n'envoie jamais à un agent qui attend une réponse (dialogue d'autorisation ouvert compris), arrêté ou en démarrage.
- Après un redémarrage d'OpenVibe, toutes les boucles sont éteintes.

## 2. Périmètre

**Inclus** : trois déclencheurs (intervalle, agent devenu inactif, sortie contenant un texte), deux conditions d'arrêt (nombre de tours, durée), trois modèles (Point d'avancement, Relance, Surveillance des tests), fenêtre de gestion, pastille d'état, lignes de palette.

**Hors périmètre** : agent juge comme condition d'arrêt, arrêt « objectif atteint par commande », cibles par groupe, modèles supplémentaires (Commit régulier, Revue, Standup, Sauvetage de build), exécution OpenVibe fermé, historique des tours.

## 3. Décisions

| Sujet | Décision | Pourquoi |
|---|---|---|
| Déclencheur « intervalle » | Toutes les N minutes, N de 1 à 1440 ; envoie à toutes les cibles ; premier tour après N minutes, pas à l'instant | Pas de salve à l'activation |
| Déclencheur « inactif » | Quand une cible passe de « travaille » ou « attend » à « inactif » ; envoie à cette cible seule | C'est l'agent qui vient de finir qui reçoit la suite |
| Déclencheur « sortie » | Le texte (sans casse, 1 à 200 caractères) apparaît à l'écran d'une cible alors qu'il n'y était pas au contrôle précédent (toutes les 2 s) ; envoie à cette cible seule | Un texte qui reste affiché ne relance pas en boucle |
| Pause entre deux tours | Au moins 30 s pour « inactif » et « sortie », par boucle | Une consigne qui fait elle-même apparaître le texte ne s'emballe pas |
| Arrêt | **Obligatoire** : nombre de tours (1 à 1000) et/ou durée (1 à 1440 minutes depuis l'activation) ; le premier atteint éteint la boucle | Aucune boucle sans fin, aucun coût sans borne |
| Envoi | `sendToAgents` : n'écrit jamais dans un agent qui attend, arrêté ou en démarrage ; un tour qui n'atteint personne ne compte pas | Réutilise la garde déjà éprouvée de la barre de consigne |
| Cibles | Des agents (terminaux) ; un agent fermé est ignoré, une boucle sans cible vivante s'éteint | Simple ; les groupes viendront |
| Redémarrage | Les boucles sont enregistrées éteintes et ne se rallument que par un clic ; compteurs remis à zéro | Jamais de dépense au démarrage |
| Visible | Pastille en bas à gauche tant qu'une boucle tourne : « N boucles · tours » et « Tout arrêter » ; la fenêtre montre « tour 3 / 10 » et le temps restant | Le coût doit se voir |
| Un clic | « Tout arrêter » éteint toutes les boucles, aussi depuis la palette | Frein d'urgence |
| Modèles | Point d'avancement (intervalle 30 min, 8 tours), Relance (inactif, 5 tours), Surveillance des tests (sortie « FAIL », 5 tours) ; un modèle remplit le formulaire, rien ne démarre | Un point de départ, jamais un démarrage |
| Stockage | Réglage `loops.list` (JSON, version 1) ; chaque boucle validée une à une à la lecture ; au plus 30 boucles | Un fichier abîmé ne bloque rien |
| Textes | FR et EN dans `src/loops/messages.ts` | Règle du projet |

## 4. Parties

- `model.ts` : types, modèles, validation d'un brouillon, lecture du réglage.
- `engine.ts` : le moteur (déclencheurs, arrêts, pauses), indépendant de l'application : ses entrées (heure, envoi, activité, écran) lui sont passées.
- `store.ts` : liste, état des tours, enregistrement, branchement du moteur sur l'application.
- `LoopsDialog.tsx`, `LoopsIndicator.tsx`, `commands.ts`.

## 5. Tests

Avec de fausses entrées uniquement : aucun agent réel n'est piloté. Validation (arrêt obligatoire, bornes), chaque déclencheur, les pauses, l'arrêt par tours et par durée, la garde « en attente », les cibles disparues, « tout arrêter », boucles éteintes au chargement.
