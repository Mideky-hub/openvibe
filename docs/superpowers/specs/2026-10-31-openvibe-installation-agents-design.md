# OpenVibe — installer un agent depuis l'interface

Date : 2026-10-31. Statut : implémenté sur la branche `openvibe/overnight-2026-10-31-odin`.

## 1. But

Un agent manquant s'installe depuis OpenVibe, sans ouvrir de terminal à la main et sans rien cacher : la commande officielle tourne dans un nœud terminal du canvas, sous les yeux de l'utilisateur. Les modèles Ollama s'installent de la même façon.

Windows seulement, comme le reste du produit (`CONTRIBUTING.md`).

## 2. Règles

1. **Rien en arrière-plan.** Toute installation est un terminal visible : on suit la sortie, on peut l'interrompre (Ctrl+C) et répondre à ce que l'installeur demande.
2. **La commande est lue avant d'être lancée.** Elle s'affiche en entier avant le clic qui la lance, avec le lien vers la page officielle.
3. **Une seule table, figée, dans le code** : `src/fleet/installCommands.ts`. Rien ne vient du réseau ; ajouter ou changer une commande est une revue de code.
4. **Une commande n'entre dans la table que vérifiée** sur la documentation de l'éditeur (§3).
5. **Les tests n'installent jamais rien** : les appels Tauri sont simulés.

## 3. La table

Vérifiée le 2026-10-31.

| Agent | Commande | Shell | Source |
| --- | --- | --- | --- |
| Claude Code | `irm https://claude.ai/install.ps1 \| iex` | PowerShell | code.claude.com/docs/en/setup |
| Codex | `powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 \| iex"` | PowerShell | README d'openai/codex |
| Gemini CLI | `npm install -g @google/gemini-cli` | cmd | README de google-gemini/gemini-cli |
| Qwen Code | `irm https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen-standalone.ps1 \| iex` | PowerShell | README de QwenLM/qwen-code |
| Cursor CLI | `irm 'https://cursor.com/install?win32=true' \| iex` | PowerShell | cursor.com/docs/cli/installation |
| OpenCode | `npm install -g opencode-ai` | cmd | opencode.ai/docs |
| Aider | `powershell -ExecutionPolicy ByPass -c "irm https://aider.chat/install.ps1 \| iex"` | PowerShell | aider.chat/docs/install.html |
| Ollama | `irm https://ollama.com/install.ps1 \| iex` | PowerShell | ollama.com/download/windows |

- **Pourquoi cmd pour npm** : dans PowerShell, `npm` résout vers `npm.ps1`, refusé par la stratégie d'exécution par défaut d'un Windows neuf. `npm.cmd` n'a pas ce problème, et la commande reste exactement celle de l'éditeur.
- **Cursor** : la documentation ne parle que d'`agent`, mais l'installeur Windows pose aussi `cursor-agent.cmd`, le programme qu'OpenVibe cherche (lu dans le script le 2026-10-31).
- **Gemini CLI et OpenCode** demandent Node.js. L'écran de confirmation cherche npm (après avoir relu le PATH) : s'il manque, il le dit, propose la page de Node.js et « Vérifier à nouveau », et le lancement reste grisé tant que npm n'est pas trouvé. Une recherche qui échoue ne bloque rien.
- **OpenCode** n'était pas dans la demande de départ ; il est au catalogue et sa commande est vérifiée, donc il y est.

## 4. Parcours

### 4.1 Menu « Lancer un agent »

La palette (`agent.launch.*`) propose « Installer X… » pour un agent absent et ouvre cette même confirmation dans le menu ; elle ne lance jamais rien directement.

Un agent absent reste grisé et gagne un bouton **Installer** à droite de sa ligne. Le bouton ouvre une vue de confirmation dans le menu (règle 2) : commande, shell, page officielle, prérequis, bouton **Lancer dans un terminal**. Le terminal se pose aussitôt, là où le clic droit a été fait, sinon au centre de la vue ; il ne passe pas par le placement au clic, pour que l'installation commence sans étape de plus, et il prend la vue et le clavier : l'installeur peut poser une question.

### 4.2 Accueil (« Aucun agent de code trouvé »)

L'accueil n'a pas de canvas et un terminal vit dans un workspace. Le bouton **Installer** ouvre donc d'abord un projet, puis lance le terminal dès que la scène est à l'écran :

- le dernier projet ouvert dont le dossier existe ;
- sinon la fenêtre « Ajouter un projet » ; annulée, rien ne se lance. La carte l'annonce avant le clic.

La carte de Claude Code montre déjà sa commande : un clic suffit. Les autres agents passent par la même confirmation que le menu, affichée dans la carte.

### 4.3 Après l'installation

La commande est tapée dans un shell qui reste ouvert : `pty-exit` n'arrive pas à la fin de l'installation, et ajouter `; exit` modifierait la commande officielle et fermerait la sortie à lire en cas d'échec. OpenVibe interroge donc la détection (`refresh_path` puis `list_agents`) toutes les 4 secondes, tant que le terminal tourne. L'agent trouvé, le menu l'active et un message le dit. La surveillance s'arrête aussi quand le terminal s'arrête (après une dernière vérification), ou au bout de 30 minutes. « Vérifier à nouveau » reste disponible.

## 5. Ollama

Si le serveur Ollama ne répond pas, le sélecteur le dit, propose « Réessayer » et n'offre aucun téléchargement : `ollama pull` échouerait dans le terminal.

Le sélecteur Ollama garde la liste des modèles installés et gagne :

- un champ **Télécharger un modèle** : `ollama pull <nom>` dans un terminal visible ;
- une courte liste de suggestions, dans la table, avec leur taille :

| Modèle | Taille | Pour |
| --- | --- | --- |
| `qwen2.5-coder:7b` | 4,7 Go | code |
| `gemma3:4b` | 3,4 Go | machine modeste |
| `llama3.2:3b` | 2,0 Go | discussion |
| `deepseek-r1:8b` | 5,2 Go | raisonnement |
| `devstral:24b` | 14 Go | agent de code |

Noms et tailles relevés sur ollama.com/library le 2026-10-31. Un modèle déjà installé n'est pas suggéré.

Le nom finit dans un shell : seuls lettres, chiffres et `._:/-` passent, comme pour `ollama run` (`shell.rs`), et il doit commencer par une lettre ou un chiffre, pour ne jamais être lu comme une option. Cliquer une suggestion lance le téléchargement sans confirmation : le nom et la taille sont déjà sous les yeux, et Ctrl+C l'arrête. Le modèle arrivé (`ollama list`, même surveillance qu'au §4.3), un message le dit ; le sélecteur relit la liste à chaque ouverture.

## 6. Hors périmètre

- Mettre à jour ou désinstaller un agent.
- Installer Node.js ou Git.
- Se connecter à un agent après l'installation : chaque CLI le demande à son premier lancement.

## 7. Une commande d'installation ne repart pas toute seule

Un terminal d'installation est un terminal « Personnalisé » marqué `oneShot`, comme celui d'un téléchargement de modèle. Seul un geste explicite relance sa commande : **Relancer**, sa carte, ou **Dupliquer**. « Reprendre toutes les conversations » ne le compte pas, et taper dans le terminal arrêté ne fait rien, contrairement aux autres terminaux. Changer d'agent dans ses options retire la marque.
