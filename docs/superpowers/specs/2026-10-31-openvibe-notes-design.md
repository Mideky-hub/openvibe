# OpenVibe — Notes : mémoire du projet, liens et graphe (spec)

Date : 2026-10-31. Idée du backlog : des notes à la manière d'Obsidian, attachables aux groupes comme contexte optionnel, avec une vue en graphe. Identité visuelle : spec identité. Réutilise le studio code (spec studio code).

## 1. Objectif

Garder ce que le projet doit retenir (décisions, architecture, conventions) dans des fichiers que l'utilisateur écrit et que les agents lisent, et dire à un groupe d'agents quelles notes le concernent.

### Critère de succès

- Une note est un simple fichier Markdown dans `.openvibe/notes/` : un agent peut la lire sans OpenVibe.
- Une modale ouverte depuis le rail et la palette montre la liste, la recherche, l'éditeur, la lecture rendue, les rétroliens et le graphe.
- Un groupe peut porter des notes ; ses agents les voient marquées comme attachées.
- Un outil MCP en lecture seule liste et lit les notes.

## 2. Périmètre

**Inclus** : créer (bouton, ou clic sur un lien vers une note absente), éditer, enregistrer avec la garde et la détection de conflit du studio, rechercher, lire, rétroliens, graphe, attache à un groupe, outil `notes`.

**Hors périmètre** (backlog) : renommer ou supprimer une note, sous-dossiers, complétion des `[[`, images, modèles, injection automatique des notes attachées dans la consigne d'une mission.

## 3. Décisions

| Sujet | Décision | Pourquoi |
|---|---|---|
| Stockage | `<projet>/.openvibe/notes/<nom>.md`, à plat | Décidé ; des noms à plat rendent `[[nom]]` sans ambiguïté |
| Git | OpenVibe ne touche pas au `.gitignore` | Partager ou non ses notes est le choix du projet |
| Nom de note | Pas de `/ \ : * ? " < > | [ ] # ^`, ni point au début, ni nom réservé de Windows, ni point ou espace à la fin ; 120 caractères au plus | Il doit être un nom de fichier valide et un `[[lien]]` valide |
| Liens | `[[nom]]` et `[[nom|texte]]`, casse ignorée | Comme Obsidian |
| Confinement | Racine = dossier des notes, passée au `resolve` du studio ; ce dossier est lui-même résolu dans le projet (une jonction `.openvibe` sortante est refusée) ; seuls des noms arrivent, jamais de chemin | Le code du studio, sans seconde logique |
| Liste | Lecture de tout le dossier à l'ouverture, au rafraîchissement et après enregistrement, bornée à 1000 notes et 32 Mo ; ce qui est écarté est compté et dit | La recherche, les rétroliens et le graphe travaillent sur le texte, côté front, en pur |
| Note ouverte | La `fileSession` du studio : version, conflit, sondage 2 s, garde, fermeture de la fenêtre | Une seule logique de non-écrasement |
| Lecture rendue | Petit analyseur Markdown vers des éléments React, sans `innerHTML` ni dépendance | Une note peut venir d'un agent : aucun HTML n'est interprété |
| Liens externes | `http(s)` seulement, ouverts par `openUrl` | Pas de `javascript:` |
| Graphe | SVG, disposition par forces calculée en pur, déterministe ; zoom à la molette, déplacement du fond, glisser un nœud, clic pour ouvrir, clavier | Pas de dépendance ; testable |
| Attache | `customData.openvibe.notes` du cadre du groupe : des **noms** | Vit avec le groupe (annulation, clonage, export de scène) |
| Entrée du menu | Une seule ligne dans `GroupMenu`, le reste dans `src/notes/` | Thor travaille dans `GroupMenu` et `groups.ts` |
| Outil MCP | Un outil `notes`, disponible aux agents et aux orchestrateurs : sans argument il liste, avec `name` il lit ; aucun outil existant n'est modifié | Additif et en lecture seule |
| Projet de l'appelant | Déduit en base du nœud appelant (nœud → workspace → projet) | Un agent d'un projet qui n'est pas à l'écran garde le bon dossier |
| Notes attachées pour l'outil | Lues dans la scène **enregistrée** du workspace ; l'orchestrateur voit celles des groupes des agents qui lui sont reliés | Marche hors écran ; l'enregistrement de la scène est différé, une attache toute récente peut mettre un instant à apparaître |
| Taille de réponse | 100 000 caractères au plus par note, coupure annoncée | Protège le contexte de l'agent |
| Consigne des agents | Une ligne en plus dans les deux rôles, FR et EN | Sinon l'outil n'est pas utilisé |

## 4. Rust (`src-tauri/src/notes.rs`, `commands/notes.rs`)

- `notes_all(projectId) -> { notes: [{ name, text, version }], skipped }` : dossier absent = liste vide, et rien n'est créé.
- `notes_read(projectId, name)`, `notes_version(projectId, name)`, `notes_write(projectId, name, text, expected)` : mêmes réponses que le studio. Seul `notes_write` crée le dossier.
- `notes_agent_list(nodeIds) -> [{ name, attached }]` : le projet vient du premier nœud.
- `notes_agent_read(nodeId, name) -> string`.

## 5. Front (`src/notes/`)

- `names.ts` : validation. `links.ts` : extraction des `[[liens]]`, résolution, rétroliens, arêtes. `search.ts` : recherche. `markdown.ts` : analyse. `graph.ts` : disposition.
- `NotesDialog.tsx`, `NoteList.tsx`, `NoteReader.tsx`, `NoteGraph.tsx`, `Backlinks.tsx` : l'interface ; `notesStore.ts` : ouverture ; `Notes.tsx` : l'hôte, chargé à la demande.
- `groupNotes.ts`, `GroupNotesDialog.tsx`, `GroupNotesItem.tsx` : l'attache. `agentTool.ts` : l'outil MCP.
- Réutilisés du studio : `CodeEditor`, `fileSession`, `UnsavedDialog`, le bandeau de disque et les effets communs (sondage, Ctrl+S, fermeture), sortis de `StudioDialog`.

## 6. Interface

En-tête comme le studio : icône, « Notes », nom de la note, point d'accent si modifiée, onglets Édition / Lecture / Graphe, Enregistrer, Rafraîchir, Fermer. À gauche, 260 px : recherche, bouton de création, liste. À droite : la vue, puis les rétroliens de la note ouverte. Un lien vers une note absente est atténué ; le suivre propose de la créer. Le graphe utilise les jetons `--ov-*` : nœuds `--ov-text-3`, note ouverte `--ov-accent`, arêtes `--ov-line`, survol sur `--ov-accent-soft`.

## 7. Tests

- Rust : noms refusés, confinement (jonction `.openvibe` ou `notes` sortante, note-jonction), dossier absent non créé, bornes, conflit, projet déduit du nœud, notes attachées lues dans la scène.
- Front : noms, liens, rétroliens, recherche, Markdown (aucun HTML, `javascript:` refusé), disposition déterministe, dialogue FR et EN, attache, outil MCP FR et EN, listes d'outils.

## 8. Risques

- `.openvibe/notes/` apparaît comme fichiers non suivis dans `git status` tant que le projet n'a pas choisi : c'est voulu.
- Le contenu d'une note est donné tel quel aux agents : une note écrite par un agent peut en influencer un autre, comme tout fichier du dépôt.
- Le graphe calcule sa disposition en O(n²) par tour : borné à 1000 notes, à contrôler à la main sur un gros carnet.
- Contrôle manuel indispensable : l'app n'est pas lancée pendant la mission de nuit.
