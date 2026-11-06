# OpenVibe — Tokens

Date : 2026-11-01. Suite de la spec mise à jour §6 (usage) et de la spec identité §5.1 (compteur d'usage de la barre du haut).

## 1. But

Le compteur d'usage dit où en est l'abonnement. « Tokens » dit **ce qui a été consommé** : un graphe sur 30 jours et la part de chaque agent, à partir des journaux que Claude Code garde déjà sur le disque. Rien ne sort de la machine.

## 2. Ce qui est lu

- **Claude Code** : les fichiers `*.jsonl` de `<dossier de Claude>/projects/*/` (`$CLAUDE_CONFIG_DIR`, sinon `~/.claude`), modifiés dans les 30 derniers jours. Dans chaque ligne d'un message de l'assistant, OpenVibe ne lit que : la date (`timestamp`), l'identifiant de session (`sessionId`), le modèle (`message.model`), l'identifiant du message (`message.id`, pour ne compter qu'une fois un message écrit plusieurs fois) et les quatre compteurs de `message.usage` (`input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`).
- **Jamais** le texte d'une conversation, ni les outils, ni les chemins : le reste de la ligne est sauté sans être gardé. Les lignes sans compteur ne sont même pas analysées.
- **Codex** : non pris en charge dans cette version. Le format de ses journaux n'a pas pu être vérifié sur un exemple réel ; mieux vaut ne rien montrer que de mauvais chiffres. L'écran le dit.

## 3. Lecture bornée

Lecture seule, par un petit module Rust (`tokens`), sur un fil à part. Bornes : 2 000 fichiers au plus (les plus récents d'abord), 64 Mo par fichier, 1 Go lus au total, lignes de plus de 4 Mo sautées. Au-delà, le résultat est marqué **tronqué** et l'écran l'annonce. Aucune écriture, aucun réseau.

## 4. Ce qui est montré

Dans le détail de l'usage (clic sur le compteur de la barre du haut), un lien « Tokens » ouvre :

- **30 jours** : un histogramme, un jour par colonne (jours UTC, les dates des journaux étant en UTC), hauteur = tokens traités (entrée + sortie + cache), la sortie à part en accent. Survol : la date et les quatre compteurs.
- **Par agent** : les sessions des 30 jours, regroupées par agent d'OpenVibe quand la session est celle d'un de ses terminaux (le prénom), sinon « Autres sessions Claude » ; pour chacune le modèle principal et les compteurs, du plus gros au plus petit (dix lignes, puis « … »).
- **Par modèle** : la répartition des 30 jours.
- Un pied de page : nombre de fichiers lus, « tronqué » le cas échéant, et la mention « lu sur ce PC, rien n'est envoyé ».

### 4.1 Activité (issue #74)

Dans le détail de l'usage lui-même, avant le lien « Tokens », une section « Activité · 30 jours » tirée de la même lecture (une lecture récente de moins d'une minute sert aux deux écrans) :

- **Carte d'activité** : une colonne par semaine, une ligne par jour (lundi en premier), chaque jour teinté de l'accent en quatre paliers selon le jour le plus chargé ; jour sans activité sur `--ov-line`. Survol : la date et les tokens.
- **Statistiques** : jours actifs sur la fenêtre, série en cours (jusqu'à aujourd'hui, ou hier tant qu'aujourd'hui est vide), plus longue série, jour le plus chargé, moyenne par jour actif, nombre de sessions et moyenne par session. Au-delà des 200 sessions que liste Rust, le nombre devient « 200 et plus » et la moyenne disparaît (ce seraient les plus grosses seules).
- Les journaux étant sur le disque, rien n'est perdu à un redémarrage d'OpenVibe ; rien n'est écrit de plus.

## 5. Hors périmètre

Le coût en dollars (les tarifs changent ; le compteur d'usage donne déjà le coût des sessions de cette exécution), Codex, un historique au-delà de 30 jours, un export.

## 6. À vérifier à la main

- Sur un vrai dossier `~/.claude` volumineux : le temps de chargement reste acceptable et l'écran ne gèle pas.
- Les totaux d'un jour concordent, à quelques pour cent près, avec ce que Claude Code affiche par `/cost` ou `/usage`.
