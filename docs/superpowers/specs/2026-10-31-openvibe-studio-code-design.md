# OpenVibe — Studio Code : édition manuelle des fichiers du projet (spec)

Date : 2026-10-31. Idée du backlog : « Studios (modales ouvertes depuis le rail droit) », partie **Code**, réduite à l'édition à la main. Identité visuelle : spec identité.

## 1. Objectif

Corriger un fichier à la main sans quitter OpenVibe, alors que des agents travaillent dans le même dossier. La règle qui commande tout le reste : **ni le studio ni un agent ne perd un travail en silence**.

### Critère de succès

- Le studio s'ouvre depuis le rail droit et depuis Ctrl+Maj+P, dans une modale ; il montre les fichiers du projet (suivis et non suivis, sans les ignorés).
- Le fichier s'ouvre coloré, dans les deux thèmes ; Ctrl+S l'enregistre.
- Fermer ou changer de fichier avec des modifications demande quoi faire.
- Si un agent a écrit le fichier entre-temps, l'écriture est refusée et le choix revient à l'utilisateur.

## 2. Périmètre

**Inclus** : arbre, filtre, ouverture, édition, Ctrl+S, recherche de CodeMirror (Ctrl+F), garde sur les modifications non enregistrées, détection d'un fichier changé sur le disque.

**Hors périmètre** (reste au backlog) : plusieurs fichiers ouverts à la fois, créer / renommer / supprimer un fichier, comparaison côte à côte en cas de conflit, « Insérer » (nœud fichier sur le canvas), indentation détectée, terminal ou LSP intégré, disposition d'IDE ancrée.

## 3. Décisions

| Sujet | Décision | Pourquoi |
|---|---|---|
| Racine | Celle du **projet**, lue en base par `projectId` ; le front ne donne jamais de chemin de racine | Une commande ne peut pas être pointée sur un autre dossier |
| Liste | `git ls-files -co --exclude-standard -z` lancé dans la racine du projet ; hors dépôt, parcours borné du dossier | Un projet n'est pas forcément un dépôt git |
| Fichiers listés | Seuls ceux qui existent encore (un fichier suivi supprimé n'est pas proposé) ; 50 000 au plus | `ls-files -c` les cite encore |
| Version d'un fichier | Taille + empreinte du contenu, en texte | Un `touch` ou une écriture à l'identique ne déclenchent pas de faux conflit |
| Écriture | Comparer-puis-écrire : `studio_write` reçoit la version attendue (`null` : le fichier ne doit pas exister) et répond `saved` ou `conflict` | Aucun « forcer » : écraser, c'est réécrire contre la version **vue** sur le disque ; un troisième changement reste un conflit |
| Écriture sur le disque | Fichier temporaire voisin puis renommage, sur le chemin réel | Une panne ou un agent qui lit ne voit jamais un fichier à moitié écrit |
| Encodage | UTF-8 seulement. Non UTF-8 ou octet nul : refusé comme binaire | Relire en perdant des octets corromprait le fichier à l'enregistrement |
| Fins de ligne | La fin de ligne dominante est retenue à l'ouverture et rétablie à l'enregistrement. Un fichier aux fins mélangées est normalisé quand on l'enregistre | CodeMirror travaille en `\n` ; sans cela, tout fichier CRLF ressortirait entièrement modifié |
| Sur le disque, tampon propre | Rechargement automatique, curseur conservé | Rien à perdre |
| Sur le disque, tampon modifié | Bandeau : « Recharger » ou « Écraser avec ma version » ; aucune action automatique | Le choix est à l'utilisateur |
| Fichier supprimé | Bandeau : « Recréer » (tampon conservé) ou « Fermer le fichier » | Même règle |
| Sondage | `studio_version` toutes les 2 s tant qu'un fichier est ouvert | Les agents écrivent par tous les moyens ; un observateur système serait une dépendance de plus pour peu de gain |
| Modale | `Dialog` Radix, plein cadre à 16 px des bords, verre dense, rayon 16 px | Spec identité §4.4, §5.10 ; `isModalOpen` coupe déjà les raccourcis globaux |
| Fermeture de la fenêtre | Avec des modifications, `onCloseRequested` est annulé et la garde s'affiche ; la fenêtre se ferme après Enregistrer ou Ne pas enregistrer | `saveBeforeClose` est le seul passage, y compris Alt+F4 |
| Chargement | `React.lazy` pour la modale ; langages à la demande par `@codemirror/language-data` | CodeMirror ne pèse pas sur le démarrage ; une seule dépendance couvre tous les langages |
| Couleurs | Uniquement des jetons `--ov-*` existants, lus par `var()` dans le thème CodeMirror | Les deux thèmes suivent sans code, et aucun jeton nouveau |
| Raccourci | Aucun nouveau raccourci global | Rail et palette suffisent |

## 4. Rust (`src-tauri/src/studio.rs`, `commands/studio.rs`)

- `studio_files(projectId) -> string[]`.
- `studio_read(projectId, file) -> { text, version, eol? }` ; refuse au-delà de 2 Mo (lecture bornée), binaire, non UTF-8.
- `studio_version(projectId, file) -> string | null` : `null` si le fichier n'existe plus ; un fichier devenu trop gros garde une version (sa taille), sans être lu.
- `studio_write(projectId, file, text, expected) -> { status: "saved", version } | { status: "conflict", disk }` ; refuse plus de 2 Mo et l'octet nul.

**Confinement** (`resolve`) : chemin relatif non vide, composants normaux uniquement (ni `..`, ni `.`, ni racine, ni préfixe de lecteur), sans `:` (flux NTFS, lecteur) ; racine et cible passées par `canonicalize`, la cible doit commencer par la racine, ce qui traite liens symboliques et jonctions, y compris les parents ; une cible absente n'est acceptée que si son **parent** canonique est dans la racine et si aucun lien cassé n'occupe la place ; `.git` refusé à toute profondeur, casse ignorée ; noms de périphériques Windows (`NUL`, `COM1`…) et noms finissant par un point ou une espace refusés (`.git.` désignerait `.git`). Un fichier en lecture seule est refusé avec son propre message.

## 5. Front (`src/studio/`)

- `tree.ts` : arbre trié (dossiers d'abord) et filtre, purs.
- `text.ts` : fins de ligne, plus petit remplacement (garde le curseur au rechargement).
- `language.ts` : extension de langage d'un chemin.
- `editorTheme.ts`, `CodeEditor.tsx` : CodeMirror.
- `fileSession.ts` : le cycle ouvert / modifié / enregistré / conflit, pur et testé sans CodeMirror.
- `StudioDialog.tsx`, `StudioTree.tsx`, `UnsavedDialog.tsx` : l'interface ; `studioStore.ts` : ouverture et état « modifié ».

## 6. Interface

En-tête : icône, « Studio Code », chemin du fichier, point d'accent si modifié, Enregistrer, Fermer. À gauche, 260 px : filtre puis arbre. À droite : bandeau éventuel, puis éditeur. Échap ferme (avec la garde), sauf depuis un panneau de CodeMirror.

Garde : « Enregistrer les modifications de <fichier> ? » → Enregistrer, Ne pas enregistrer, Annuler. Si l'enregistrement tombe sur un conflit, l'action en attente est abandonnée et le bandeau s'affiche.

## 7. Tests

- Rust : confinement (`..`, absolu, lecteur, flux, `.git`, lien et jonction sortants), 2 Mo en lecture et écriture, binaire, non UTF-8, conflit, fichier supprimé, BOM et CRLF conservés, liste suivis + non suivis sans ignorés, hors dépôt.
- Front : arbre, filtre, fins de ligne, session (conflit, garde, sondage, course entre sondage et enregistrement), dialogue en français et en anglais, bouton du rail, commande de palette, CSP.

## 8. Risques

- Le renommage temporaire + final change l'horodatage de création et peut échouer si un autre programme tient le fichier ouvert sous Windows : l'erreur est affichée, le tampon reste intact.
- Entre la comparaison des versions et le renommage, une fenêtre très brève demeure : une écriture d'agent tombant exactement là serait écrasée. Windows n'offre pas de renommage conditionnel.
- Contrôle manuel indispensable : l'app n'a pas été lancée pendant la mission de nuit.
