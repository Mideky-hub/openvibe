# OpenVibe — Comptes

Date : 2026-11-01. Suite du BACKLOG « Comptes et quotas » (la ligne « Comptes ») et de la spec mise à jour §6 (usage).

## 1. But

Travailler avec plusieurs comptes Claude (perso, travail) sans quitter OpenVibe. Claude Code range sa session, ses réglages et ses conversations dans un dossier : `CLAUDE_CONFIG_DIR`, sinon `~/.claude`. Un **profil** d'OpenVibe n'est rien de plus qu'**un nom et un dossier**. OpenVibe ne lit, ne copie, ne journalise ni ne stocke jamais un identifiant, un jeton ou un fichier de connexion : il ne fait que **pointer** Claude vers le dossier du profil. La connexion elle-même se fait dans Claude.

## 2. Profils

- Un profil : un identifiant interne, un **nom** (1 à 40 caractères) et un **dossier** (chemin absolu). Noms et dossiers sont uniques.
- Le profil **Par défaut** existe toujours, sans dossier à lui : c'est l'environnement d'OpenVibe (`CLAUDE_CONFIG_DIR` ou `~/.claude`). On ne le modifie pas.
- Les profils sont enregistrés dans la base d'OpenVibe (réglage `accounts`), sous la forme `{ profiles: [{ id, name, configDir }], active }`. Rien d'autre.
- « Ajouter » demande un nom et un dossier ; le dossier est créé s'il n'existe pas (vide : la connexion le remplira). Les dossiers déjà présents, dont le `~/.claude` de l'utilisateur, ne sont jamais touchés par OpenVibe.
- « Retirer » oublie le profil ; son dossier reste sur le disque, intact.

## 3. Utiliser

- Un profil est **actif** (Par défaut au départ). « Utiliser » le rend actif : **les nouveaux agents Claude** démarrent avec lui.
- Un terminal Claude **garde le profil de son démarrage** (`accountId` dans son nœud) : « Reprendre » et « Dernière session » relancent avec le même dossier, sinon la conversation ne serait pas retrouvée. Changer de profil actif ne touche pas aux terminaux déjà posés.
- Si le profil d'un terminal a été retiré, il repart avec le profil par défaut (une conversation introuvable devient une nouvelle).

## 4. Lancement

Le frontend envoie `claude.configDir` avec la demande de démarrage. Rust le vérifie (chemin absolu, un dossier, sans `..` ni caractère de contrôle) puis :
- pose `CLAUDE_CONFIG_DIR` dans l'environnement **du terminal seulement** ;
- cherche la conversation à reprendre, et la ligne d'état de l'utilisateur, **dans ce dossier** (et non dans l'environnement d'OpenVibe : c'est ce que le BACKLOG « Usage » reprochait).
Un dossier invalide fait refuser le démarrage avec un message, jamais un repli silencieux sur un autre compte.

## 5. Connexion

« Se connecter » (sur la ligne d'un profil) pose un **terminal Claude visible** sur le canvas, démarré avec ce profil. Claude propose lui-même sa connexion ; l'utilisateur la fait dans ce terminal (ou par `/login`). OpenVibe n'intercepte rien et ne lit pas le résultat.

## 6. Interface

- La palette : « Comptes Claude… » ouvre une fenêtre : la liste des profils (nom, dossier, puce « actif »), les actions **Utiliser**, **Se connecter**, **Retirer**, et un formulaire **Ajouter un profil**.
- **Puce de compte** dans l'en-tête d'un terminal Claude : le nom du profil, dès qu'au moins un profil existe (Par défaut inclus s'il y a plusieurs choix). Infobulle : le dossier.
- Textes en français et en anglais.

## 7. Hors périmètre

Jauge d'usage par compte (le compteur de la barre du haut suit la session Claude qui répond), changement de profil d'un terminal déjà posé, Codex, import d'un compte existant, toute lecture des fichiers du dossier d'un profil.

## 8. À vérifier à la main

- Créer un profil, « Se connecter », se connecter dans le terminal : l'agent répond avec ce compte ; un terminal du profil Par défaut garde l'autre.
- « Reprendre » après un redémarrage retrouve la conversation du bon profil.
- Le dossier `~/.claude` n'a pas été modifié par la création d'un profil.
