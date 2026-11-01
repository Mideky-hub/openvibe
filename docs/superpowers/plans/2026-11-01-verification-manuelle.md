# Vérification manuelle avant la prochaine version

Date : 2026-11-01. Ce que les tests automatiques ne peuvent pas voir : une vraie fenêtre WebView2, un vrai Claude, un vrai compte, un vrai dépôt. Les cases sont classées par importance : si le temps manque, s'arrêter après la partie 1.

Règles : lancer le build de développement avec `--config` (ses propres données, voir CONTRIBUTING), sauvegarder `~/.claude/settings.json` avant de commencer, n'essayer les pushs que sur un dépôt jetable avec un remote jetable.

## 1. Les dix vérifications qui comptent

1. **Les vrais modes de permission.** Lancer une mission avec chaque mode de permission, sur un dépôt jetable. Vérifier qu'un agent en mode restreint s'arrête sur une action refusée, qu'un agent permissif ne sort pas du dossier de son worktree, et qu'une copie d'un agent de mission ne garde pas ses permissions.
2. **Une vraie invite de Claude et l'avis de question.** Faire poser une question à un vrai Claude (un outil à autoriser). L'avis montre l'aperçu de la question, reste tant que l'agent attend, disparaît quand il reprend. Hors de la fenêtre : la notification Windows apparaît une fois ; le réglage la coupe.
3. **CodeMirror sous la CSP dans WebView2.** Ouvrir le studio de code sur un fichier : coloration, recherche, saisie, annuler. Console de la webview sans erreur de CSP (`unsafe-eval`, `blob:`, polices).
4. **Lancer 4 agents à 1440×900.** « Lancer 4 » : la vue s'ajuste à un zoom lisible (pas 40 %), les quatre terminaux démarrent, aucun n'est caché sous une barre.
5. **Un studio « sale » pendant une mise à jour.** Modifier un fichier dans le studio sans l'enregistrer, déclencher l'installation d'une mise à jour : elle refuse tant que les changements ne sont pas enregistrés ou abandonnés, et ne perd rien.
6. **Une vraie mise à jour avec l'instance unique.** Bêta précédente vers cette version par l'installeur : OpenVibe redémarre seul, une seconde instance lancée pendant ce temps rend la main à la première, aucune donnée perdue.
7. **Les boucles sur un shell.** Une boucle sur un terminal Shell : déclenchement par planning, par inactivité, par texte dans la sortie ; arrêt par nombre et par durée ; « Tout arrêter » ; rien n'est tapé dans un shell dont Claude a quitté.
8. **Les comptes avec une vraie connexion.** Créer un profil, « Se connecter » dans son terminal : l'agent répond avec ce compte, un terminal du profil Par défaut garde l'autre. « Reprendre » après redémarrage retrouve la conversation du bon profil. `~/.claude` n'a pas été modifié par la création du profil.
9. **Pousser et abandonner sur un dépôt jetable.** Fenêtre git : cocher deux fichiers sur trois, valider, vérifier que seuls ces deux sont dans le commit ; abandonner un fichier (la confirmation dit ce qui est perdu) ; « Pousser N → origin/branche » n'envoie que les commits annoncés, ne force jamais, et dit pourquoi si le remote refuse.
10. **Une nuit de 30 minutes.** Mission de nuit courte sur un dépôt jetable avec une source de tickets : contrôles de départ, PC maintenu éveillé, file de tâches distribuée, avis de fin de nuit, rapport du matin cohérent avec ce qui s'est passé, PC libéré à la fin et après un rechargement de la fenêtre.

## 2. Par fonction

### Studio de code
- Un agent modifie un fichier ouvert dans le studio : le studio le dit, et n'écrase rien en silence.
- Hors dépôt Git : les secrets (`.env`…) ne sont pas dans la liste.
- Un gros fichier et un fichier binaire sont refusés avec un message.

### Notes
- Créer, modifier, lier deux notes : une seule ligne entre deux notes qui se citent.
- Ouvrir depuis le rail, la palette et le menu d'un groupe.
- Sur un gros carnet (plus de 300 notes), le graphe reste fluide (disposition en O(n²), bornée à 1000).
- Les fichiers sont bien dans `.openvibe/notes/` du projet et un agent est informé des notes.

### Installer des agents et des modèles Ollama
- Depuis l'accueil et la palette : la commande officielle tourne dans un terminal visible, rien ne s'installe sans confirmation, copier un terminal d'installation ne relance pas l'installation.
- Gemini CLI et OpenCode sans npm : le message le dit et le lancement reste grisé. « Vérifier à nouveau » après l'installation de Node.js.
- Un modèle Ollama se télécharge et apparaît ensuite dans les choix.

### Avis de question et notifications
- Un agent Gemini CLI qui attend (hooks BeforeAgent, AfterAgent, Notification).
- Un agent Codex : pas de notification fausse.
- Clic sur la notification Windows (attendu : ne ramène pas encore à l'agent, voir le backlog).

### Groupes spécialisés
- Le sous-menu de spécialité : saisie, focus, clavier ; l'étiquette ; une mission réelle qui place un agent `new` dans un groupe puis le ferme à la fin.
- L'orchestrateur reçoit bien le groupe et la spécialité de chaque agent.

### Replier un groupe
- Replier pendant que les agents travaillent, puis déplier : rien n'est relancé, les écrans sont intacts.
- Redémarrer avec un groupe replié : il l'est toujours, ses agents reprennent comme d'habitude.
- Ctrl+Z après avoir replié ou déplié.
- Aller à un agent d'un groupe replié le déplie.

### Onglets de projet
- Glisser un onglet, Alt+flèches, menu de l'onglet ; l'ordre survit au redémarrage.

### Presets d'équipe
- Enregistrer, déployer deux fois (prénoms neufs à chaque fois), supprimer puis annuler.
- Déployer sans canvas monté : refusé avec son propre message.

### Boucles (suite)
- Une liste illisible n'est jamais écrasée.
- Un plafond de dépense stoppe bien la boucle.

### Comptes (suite)
- Un profil dont le dossier est illisible : son terminal ne démarre pas.
- La puce de compte dans l'en-tête du terminal.

### Tokens
- Sur un vrai `~/.claude` volumineux : le chargement reste acceptable, l'écran ne gèle pas.
- Les totaux d'un jour concordent, à quelques pour cent près, avec `/cost` ou `/usage` de Claude Code.
- La vue dit qu'elle ne couvre que le compte par défaut quand c'est le cas.

### Fenêtre git (suite)
- Dépôt avec plus de 5 000 changements : la liste dit qu'elle est coupée.
- Un hook git qui échoue : le message de git est montré.
- Une branche sans remote : le bouton le dit au lieu de pousser.

### Mission de nuit (suite)
- Comportements de Claude Code à vérifier dans une vraie session : l'invite de confiance, la détection « Claude est prêt », le mode de permission appliqué.
- Mission dont l'espace n'est pas affiché : elle continue, et « terminer » ferme les groupes.
- Le budget global compte le temps réel pour toutes les missions, et la file ne donne plus de tâche une fois dépensé.

### Remote Control
- Avec un brouillon à moitié tapé dans l'invite de Claude : une erreur, rien n'est tapé après.

### Revue des changements
- Un toast après « Envoyer » ne couvre pas le bouton.

### Modes zen et lecture
- Le bouton de sortie discret apparaît et ramène à l'affichage normal ; Alt+Z et Alt+R aussi.

### Instance unique et fenêtre
- Lancer un second OpenVibe : la fenêtre du premier revient au premier plan.
- Build de développement avec `--config` à côté d'une version installée : les deux vivent côte à côte.
