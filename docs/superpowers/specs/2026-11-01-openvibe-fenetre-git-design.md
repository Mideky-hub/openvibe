# OpenVibe — la fenêtre git

Date : 2026-11-01. Statut : implémenté sur la branche `openvibe/overnight-2026-10-31-odin`.

## 1. But

Un clic sur la puce de branche (`GitChip`) ouvre une fenêtre pour relire et enregistrer le travail du projet sans ouvrir de terminal : les fichiers modifiés, leur diff, le commit, l'historique, le push.

Elle suit le dossier du projet ouvert, et non un agent comme le panneau de revue.

## 2. Règles

1. **Abandonner ne touche à rien sans confirmation.** Le dialogue nomme le fichier et dit ce qui sera perdu. Rien n'est envoyé à Rust avant son bouton.
2. **Ce qui est confirmé est ce qui est abandonné.** La liste donne à chaque fichier une empreinte (taille, date de modification, objet de l'index). Rust la recalcule avant d'agir et refuse si elle a changé : un agent peut écrire dans ce dépôt pendant que le dialogue est ouvert. Compter les lignes ne suffirait pas : une réécriture peut les garder, et un gros fichier ou un binaire n'en a pas.
3. **Un push n'est jamais qu'un clic de l'utilisateur dans l'application, et il fait ce que dit le bouton.** Aucune commande de palette, aucun raccourci, aucun outil d'agent, aucun push automatique après un commit. Jamais de `--force`, même par la configuration du dépôt (§3.5).
4. **Un chemin n'est jamais un motif.** Toutes les commandes passent par `--literal-pathspecs` : abandonner `[a].txt` ne peut pas toucher `a.txt`.
5. **Les tests n'utilisent que des dépôts temporaires**, sans dépôt distant ou avec un dépôt nu local.

## 3. Fenêtre

Un tiroir de verre comme le panneau de revue, au même endroit ; ouvrir l'un ferme l'autre. La puce devient un bouton.

- **En-tête** : branche, en avance / en retard sur son amont, Actualiser, Pousser, Fermer.
- **Onglets** : Modifications (nombre) et Historique.

### 3.1 Modifications

À gauche, la liste, avec en tête une case qui coche ou décoche tout. Chaque ligne a sa case, la lettre d'état du panneau de revue, le chemin, `+n −m`, et un bouton Abandonner. Un clic sur la ligne montre le diff à droite, en lecture seule, avec le rendu du panneau de revue. Sous la liste, le message et le bouton **Valider (n)**.

Les cases sont propres à la fenêtre : tout est coché au départ, un nouveau fichier arrive coché, et une actualisation garde ce qui a été décoché.

### 3.2 Valider

Seuls les fichiers cochés entrent dans le commit, ni plus ni moins, même si d'autres sont déjà indexés : `git add` (ou `git rm --cached` pour un fichier disparu), puis `git commit` limité à ces chemins, donc le contenu du disque au moment du clic. Un renommage emporte ses deux chemins. Les chemins passent par l'entrée standard (`--pathspec-from-file`) : la ligne de commande de Windows est limitée à 32 000 caractères.

Les hooks du dépôt tournent normalement. Une erreur de git, identité manquante ou hook refusé, s'affiche telle quelle dans la fenêtre ; le message saisi reste.

Pendant une fusion, un rebase, un cherry-pick ou un revert, valider et abandonner sont refusés avant de toucher à quoi que ce soit : indexer un fichier en conflit le marquerait résolu, et git refuse de toute façon un commit partiel. Un renommage dont l'ancien chemin a été recréé est refusé aussi : `commit --only` emporterait ce nouveau fichier, que personne n'a choisi.

Si la liste est coupée à sa limite, la fenêtre le dit : ce qui n'est pas listé ne peut pas être validé.

### 3.3 Abandonner

| État | Effet |
| --- | --- |
| Modifié, supprimé, renommé | Revient à HEAD (`git restore --staged --worktree`) ; un renommage rend l'ancien fichier et retire le nouveau |
| Ajouté à l'index | Retiré de l'index et du disque (`git rm -f`) |
| Non suivi | Supprimé du disque (`git clean -f`), sans passer par la corbeille |

Le dialogue dit « irréversible » et, pour un fichier non suivi, qu'il sera supprimé. Un seul fichier à la fois.

Rust refuse ce que git remplacerait sans qu'on l'ait confirmé : un chemin devenu un dossier (donc aussi un sous-module), un fichier dont un dossier parent est devenu un fichier, ou l'ancien chemin d'un renommage recréé depuis.

### 3.4 Historique

Les 200 derniers commits de la branche : hash court, sujet, auteur, date. Un dépôt sans commit affiche une liste vide.

### 3.5 Pousser

Le bouton affiche sa cible : `Pousser 3 → origin/main`. Il est actif s'il y a quelque chose à pousser.

- Avec un amont : vers son dépôt distant et sa branche, lus dans `branch.<nom>.remote` et `branch.<nom>.merge`.
- Sans amont : avec `--set-upstream`, vers `origin`, ou l'unique dépôt distant s'il n'y en a qu'un. Avec plusieurs distants et aucun `origin`, le bouton reste grisé et dit pourquoi.
- HEAD détachée, aucun distant ou distant miroir : grisé, avec la raison.

La commande est toujours explicite : `git push <distant> refs/heads/<branche>:<destination>`, sans `+`, avec `--no-follow-tags` et `--no-recurse-submodules`. Un simple `git push` suivrait `remote.*.push` (qui peut contenir un `+`, donc forcer), `push.default=matching` ou `pushRemote`, et le bouton mentirait. Le bouton envoie la branche et la cible qu'il affiche ; Rust refuse si elles ont changé.

`GIT_TERMINAL_PROMPT=0` : git échoue au lieu d'attendre une saisie impossible. Le gestionnaire d'identifiants de Windows peut toujours ouvrir sa fenêtre, à la suite du clic. Une erreur (amont en avance, refus) s'affiche dans la fenêtre.

## 4. Architecture

- `src-tauri/src/repo.rs` : état, commit, abandon, historique, push ; les commandes sont dans `commands/repo.rs`. La liste et les diffs réutilisent `review::changes` et `review::file_diff`.
- `src/git/` : `GitWindow.tsx`, son magasin, ses textes.
- `src/review/DiffRow.tsx` : le rendu d'une ligne de diff, sorti de `ReviewPanel`.

## 5. Hors périmètre

- Pull, fetch, branches, stash, indexation partielle, amend.
- Abandonner plusieurs fichiers d'un coup.
- Détail d'un commit de l'historique.
- Actualisation automatique : la liste se relit à l'ouverture, après chaque action et sur Actualiser. Le commit prend le contenu du disque au moment du clic.
- Renommage qui ne change que la casse, et fichier remplacé par un dossier : le commit échoue proprement avec le message de git.
- Délai maximal pour un hook bloqué.
