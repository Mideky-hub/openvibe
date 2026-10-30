<p align="center">
  <picture>
    <source media="(prefers-color-scheme: light)" srcset="docs/assets/brand/banner-light.png">
    <img alt="OpenVibe : un canvas infini de vrais terminaux pour vos agents de code" src="docs/assets/brand/banner-dark.png" width="100%">
  </picture>
</p>

<p align="center">
  <a href="LICENSE"><img alt="Licence : MIT" src="https://img.shields.io/badge/licence-MIT-D97757?style=flat-square"></a>
  <img alt="Plateforme : Windows 10/11" src="https://img.shields.io/badge/plateforme-Windows%2010%2F11-29261B?style=flat-square">
  <img alt="Construit avec Tauri 2" src="https://img.shields.io/badge/Tauri-2-8FA876?style=flat-square">
  <img alt="Statut : préversion" src="https://img.shields.io/badge/statut-pr%C3%A9version-D4A27F?style=flat-square">
</p>

<p align="center">
  <a href="README.md">English</a> · <b>Français</b>
</p>

OpenVibe est une application de bureau qui place vos agents de code sur un canvas infini. Chaque agent tourne dans un **vrai terminal** (Claude Code, Codex, Gemini CLI et d'autres). Vous les réunissez en équipes, vous briefez toute une équipe en une ligne, vous relisez leurs changements, et vous confiez une grosse tâche à un **orchestrateur** qui la découpe, la distribue et surveille le temps.

Tout tourne sur votre machine. OpenVibe n'ajoute aucun service en ligne ni aucune télémétrie, et ne contourne jamais les demandes d'autorisation des agents. Sa seule requête à lui est la recherche de mises à jour, que vous pouvez couper.

Si vous connaissez Symvibe : OpenVibe couvre le même terrain (piloter une flotte d'agents en ligne de commande depuis un canvas infini), en projet indépendant et open source, avec son propre design et ses propres fonctions.

> [!NOTE]
> OpenVibe est une préversion, développée et testée sous **Windows 10/11**. Son interface parle **français et anglais** : elle suit Windows, et le menu des réglages en change.

<picture>
  <source media="(prefers-color-scheme: light)" srcset="docs/assets/screenshots/board-light.png">
  <img alt="Une équipe de trois agents Claude Code sur le canvas, sous un schéma d'architecture fait avec les bibliothèques d'icônes" src="docs/assets/screenshots/board-dark.png">
</picture>

## Sommaire

- [Fonctions](#fonctions)
- [Visite guidée](#visite-guidée)
- [L'orchestrateur](#lorchestrateur)
- [Agents pris en charge](#agents-pris-en-charge)
- [Clavier](#clavier)
- [Installation](#installation)
- [Fonctionnement](#fonctionnement)
- [Contribuer](#contribuer)
- [Licence et remerciements](#licence-et-remerciements)

## Fonctions

- **De vrais terminaux sur un canvas.** Chaque agent est un vrai PTY (ConPTY sous Windows) affiché par xterm.js. Vous pouvez déplacer la vue, zoomer, dessiner autour des agents et annoter leur travail. Le canvas est [Excalidraw](https://github.com/excalidraw/excalidraw) : formes, flèches, texte et images fonctionnent.
- **Des équipes.** Lancez quatre agents d'un coup, ou composez un groupe avec un rôle (Frontend, Backend, Testeurs, Relecteurs…). Chaque groupe tire les prénoms de ses agents d'un panthéon : Athéna, Hermès, Apollon…
- **Des états en direct.** OpenVibe montre si chaque agent démarre, est prêt, travaille, attend votre réponse, est arrêté ou a terminé, sur le canvas comme dans le panneau Agents. Pour Claude Code, l'état vient de ses hooks ; pour les autres agents, de leur sortie.
- **Une seule barre de consigne pour tous.** Ciblez `@tous`, un groupe, un agent ou plusieurs à la fois (`@athena/hermes`). Une ligne qui commence par `/` part comme commande vers la CLI des agents, et OpenVibe propose les commandes de Claude Code. L'historique garde vos 50 dernières consignes par projet.
- **Un orchestrateur qui manage.** Donnez-lui un objectif. Il propose un plan, confie à chaque agent une sous-tâche sur sa propre branche git et son propre worktree, surveille le budget de temps et fusionne les résultats dans une branche de mission. Le détail est [plus bas](#lorchestrateur).
- **La revue des changements.** Voyez ce qu'un agent a changé, non commité ou depuis sa base, parcourez le dépôt en lecture seule, et cliquez une ligne pour laisser une remarque. Toutes les remarques repartent à l'agent en un seul message.
- **Remote Control.** Activez le Remote Control de Claude Code pour un agent, un groupe ou toute l'équipe, et suivez-les depuis votre téléphone.
- **L'usage d'un coup d'œil.** La barre de titre affiche les limites de session et de semaine de votre abonnement Claude. Un clic donne le coût, les durées, les tokens par modèle, l'état du cache de prompt et une estimation du CO₂.
- **Des bibliothèques d'icônes.** Environ 600 icônes de la communauté Excalidraw (conception système, AWS, Azure, GCP), embarquées dans l'application, pour dessiner l'architecture à côté des agents qui la construisent.
- **Projets et workspaces.** Un projet par dossier, plusieurs onglets de workspace par projet. OpenVibe enregistre tout en local et, au redémarrage, propose de reprendre vos conversations Claude.
- **Le clavier d'abord.** Utilisez les palettes, passez d'un terminal à l'autre, ou faites un appui droit n'importe où pour le menu radial. Les thèmes clair et sombre suivent Windows.

## Visite guidée

**Lancer une équipe.** Appui droit sur le canvas, *Lancer 4 agents* : un groupe de quatre sessions Claude Code démarre dans son propre cadre.

![Clic droit sur le canvas, « Lancer 4 agents », et un groupe de quatre sessions Claude Code démarre](docs/assets/demo/launch.gif)

**Briefer toute l'équipe.** Tapez `@frontend` puis la question. Les trois agents du groupe travaillent en même temps, puis repassent à *prêt*.

![La barre de consigne cible @frontend ; trois agents répondent en même temps](docs/assets/demo/broadcast.gif)

**Envoyer une commande à chaque agent.** Après les cibles, `/` liste les commandes de Claude Code ; `/context` s'exécute alors dans chaque session du groupe.

![Taper / après @frontend propose les commandes de Claude Code ; /context s'exécute dans les trois agents](docs/assets/demo/commands.gif)

**Relire un changement et le renvoyer.** Allez à un agent avec `Ctrl+P`, ouvrez *Revue des changements* depuis `Ctrl+Maj+P`, puis cliquez une ligne pour laisser une remarque. *Envoyer à Hermès* envoie toutes les remarques en un seul message.

![La palette « Aller à », la palette des fonctions, le panneau de revue et une remarque sur une ligne du diff](docs/assets/demo/review.gif)

**Esquisser l'architecture.** Le bouton *Icônes* ouvre les bibliothèques embarquées. Ce schéma relie une API Gateway, une Lambda et une table DynamoDB.

![Les bibliothèques d'icônes : API Gateway, Lambda et DynamoDB posées et reliées par des flèches](docs/assets/demo/icons.gif)

**Suivre son usage.** Le compteur de la barre de titre ouvre le détail : limites de l'abonnement et leur remise à zéro, coût et durées des sessions d'OpenVibe, tokens par modèle, et cache de prompt de chaque session.

<img alt="Le détail de l'usage : limites de session et de semaine, coût, durées, tokens par modèle et cache de prompt" src="docs/assets/screenshots/usage.png" width="428">

## L'orchestrateur

L'orchestrateur est une session Claude Code qui joue le rôle de manager d'équipe. Reliez-en un à un groupe depuis le menu du groupe (*Relier un orchestrateur*) et décrivez l'objectif dans son terminal. Ensuite :

![Une vraie mission : l'objectif tapé à l'orchestrateur, son plan avec le routeur de modèles, le feu vert, deux agents au travail dans leurs worktrees, puis la fusion](docs/assets/demo/mission.gif)

*Une vraie mission, accélérée là où le badge l'indique. Le routeur met les deux sous-tâches sur Haiku, chaque agent travaille et commite sur sa propre branche, et l'orchestrateur fusionne les deux dans la branche de mission.*

1. **Il propose un plan.** Il découpe l'objectif en sous-tâches, chacune avec un responsable, un budget de temps et, au besoin, un niveau de difficulté. Le plan s'affiche dans le panneau de mission, sous l'orchestrateur.
2. **Vous lancez la mission.** OpenVibe crée la branche de mission `openvibe/<mission>`, ainsi qu'une branche et un worktree par agent, à côté de votre dépôt. Puis il confie à chaque agent sa sous-tâche.
3. **Les agents rendent compte.** Chaque agent Claude déclare ses étapes, qui s'affichent en frise sous son terminal, et rend compte quand il a fini. Un agent peut confier une partie de son travail à ses propres sous-agents.
4. **L'orchestrateur surveille le temps.** Il est prévenu quand une sous-tâche atteint son budget. Au double du budget, vous recevez une notification et la barre passe au rouge. Personne n'est arrêté automatiquement : l'orchestrateur peut prolonger, interrompre ou réattribuer.
5. **Il fusionne.** Les branches terminées sont fusionnées dans la branche de mission ; en cas de conflit, la fusion est annulée et signalée. OpenVibe **ne pousse jamais** et **ne fusionne jamais dans votre propre branche**.

Avec le **routeur de modèles**, le niveau de chaque sous-tâche choisit le modèle de son agent :

| Niveau | Modèle |
|---|---|
| `low` (faible) | Claude Haiku 5.5 |
| `medium` (moyen) | Claude Sonnet 5.5 |
| `high` (élevé) | Claude Opus 5.5 |
| `extreme` (extrême) | Claude Fable 5.1 |

L'orchestrateur échange avec OpenVibe par un serveur MCP local, avec des outils comme `propose_plan`, `team`, `read_output`, `extend`, `reassign`, `merge` et `remote_control`. Il peut lire le dépôt, mais `Edit`, `Write` et `NotebookEdit` lui sont refusés : ce sont les agents qui écrivent le code.

## Agents pris en charge

OpenVibe lance les agents déjà installés sur votre machine : un agent est disponible quand sa commande est dans votre `PATH`.

| Agent | Commande | Détection de l'état |
|---|---|---|
| Claude Code | `claude` | Hooks (précis : travaille, attend votre réponse, a fini) |
| Codex | `codex` | Sortie, plus son hook `notify` à la fin de chaque tour |
| Gemini CLI | `gemini` | Sortie |
| Qwen Code | `qwen` | Sortie |
| Cursor | `cursor-agent` | Sortie |
| OpenCode | `opencode` | Sortie |
| Aider | `aider` | Sortie |
| Ollama | `ollama run <modèle>` (ou Aider sur un modèle Ollama) | Sortie |
| Shell | PowerShell, cmd, pwsh ou Git Bash | Sortie |
| Personnalisé | la commande de votre choix | Sortie |

Le Remote Control, les missions, le routeur de modèles, la frise d'étapes et le compteur d'usage reposent sur Claude Code ; le canvas, les groupes, les mentions et la revue fonctionnent avec tous les agents.

## Clavier

| Raccourci | Action |
|---|---|
| `Ctrl+P` | Aller à un terminal, un groupe, un orchestrateur, un workspace ou un projet |
| `Ctrl+Maj+P` | Palette des fonctions (toutes les commandes de l'application) |
| `Ctrl+Tab` / `Ctrl+Maj+Tab` | Terminal suivant / précédent, dans l'ordre de lecture |
| `Maj+Échap` | Rendre le clavier au canvas |
| `Ctrl+Maj+A` | Vue d'ensemble |
| Appui droit | Menu radial : cliquez un bouton, ou maintenez, glissez et relâchez |
| `@` · `/` · `↑` | Dans la barre de consigne : cibler · commande · historique |
| `Maj+Entrée` | Nouvelle ligne, dans la barre de consigne comme dans les terminaux |

Les touches d'Excalidraw (`V`, `H`, `R`, `O`, `A`, `T`, `P`, `E`, `Ctrl+Z`…) fonctionnent dès que le canvas a le clavier. Dans un terminal, `Ctrl+C` copie quand du texte est sélectionné, et interrompt sinon.

## Installation

Téléchargez `OpenVibe_<version>_x64-setup.exe` depuis la [dernière version publiée](https://github.com/Mideky-hub/openvibe/releases/latest) et lancez-le (Windows 10/11). Il s'installe pour votre seul compte, sans droits d'administrateur.

Il vous faut aussi au moins une CLI d'agent, par exemple [Claude Code](https://docs.claude.com/en/docs/claude-code/overview), et [Git](https://git-scm.com/) : Git Bash fournit le `bash` dont le compteur d'usage a besoin.

> [!IMPORTANT]
> Les bêtas ne sont pas encore signées. Si Windows SmartScreen bloque l'installeur, choisissez **Informations complémentaires**, puis **Exécuter quand même**.

Au premier lancement, l'accueil vous guide : installer un agent, ajouter un projet, lancer un agent. Un souci ? Consultez le [guide de dépannage](docs/troubleshooting.fr.md), ou ouvrez **Dépannage** depuis le menu des réglages.

**Mises à jour.** OpenVibe cherche une nouvelle version sur GitHub 10 secondes après son démarrage, puis toutes les 6 heures, et propose de l'installer. Avant que l'installeur le relance, OpenVibe enregistre votre canvas et l'historique des terminaux ; les conversations Claude se reprennent ensuite. Les mises à jour sont signées : une signature qui ne correspond pas est refusée. Cette recherche est la seule requête qu'OpenVibe fait de lui-même. Pour la couper, ouvrez le menu des réglages (la roue dentée) et décochez **Rechercher les mises à jour automatiquement**.

### Compiler depuis les sources

**Prérequis** (Windows 10/11) :

- [Les prérequis Windows de Tauri 2](https://v2.tauri.app/start/prerequisites/) : les Microsoft C++ Build Tools et WebView2. WebView2 est déjà présent sous Windows 11.
- [Rust](https://rustup.rs/) 1.85 ou plus récent (la crate utilise l'édition 2024).
- [Node.js](https://nodejs.org/) 22 LTS et [pnpm](https://pnpm.io/) 10.
- [Git](https://git-scm.com/). Git Bash fournit aussi le `bash` dont le compteur d'usage a besoin.
- Au moins une CLI d'agent, par exemple [Claude Code](https://docs.claude.com/en/docs/claude-code/overview).

**Compiler et lancer :**

```powershell
git clone https://github.com/Mideky-hub/openvibe.git
cd openvibe
pnpm install
pnpm tauri dev                  # lancer en développement
pnpm tauri build                # construire l'installateur
```

L'installateur est écrit dans `src-tauri/target/release/bundle/nsis/`. Il s'installe pour l'utilisateur courant, sans droits d'administrateur.

> [!TIP]
> Pour essayer OpenVibe sans toucher à vos projets enregistrés, donnez à la version de développement son propre dossier de données :
> `pnpm tauri dev --config '{"identifier":"dev.openvibe.probe"}'`

## Fonctionnement

- **Application :** [Tauri 2](https://v2.tauri.app/). Le côté Rust gère les PTY ([portable-pty](https://crates.io/crates/portable-pty)), git, la base SQLite et un petit serveur HTTP.
- **Interface :** React 19, TypeScript, Zustand et Tailwind CSS 4, avec [Excalidraw](https://github.com/excalidraw/excalidraw) pour le canvas et [xterm.js](https://xtermjs.org/) pour les terminaux.
- **États et outils des agents :** le serveur HTTP n'écoute que sur `127.0.0.1`, sur un port aléatoire.
  - Chaque session Claude Code reçoit un fichier `--settings` supplémentaire. Il déclare des hooks qui signalent l'état de la session, une ligne d'état qui transmet l'usage, et un serveur MCP pour les outils de mission.
  - Chaque requête doit porter un jeton tiré au démarrage de l'application, ou un jeton propre à la session.
  - OpenVibe lit votre `~/.claude/settings.json` sans jamais le modifier, et votre propre ligne d'état reste affichée dans les terminaux.
- **Stockage :** projets, canvas, historique des terminaux et réglages sont dans une base SQLite locale, sous `%APPDATA%\dev.openvibe.app\`.

Le modèle de sécurité est détaillé dans [SECURITY.md](SECURITY.md).

## Contribuer

Rapports de bug, idées et pull requests sont bienvenus, en français ou en anglais. Commencez par [CONTRIBUTING.md](CONTRIBUTING.md) ; les idées déjà prévues sont dans [BACKLOG.md](BACKLOG.md). Merci de respecter le [code de conduite](CODE_OF_CONDUCT.md).

## Licence et remerciements

OpenVibe est publié sous [licence MIT](LICENSE).

Il s'appuie sur [Tauri](https://tauri.app/), [Excalidraw](https://github.com/excalidraw/excalidraw), [xterm.js](https://xtermjs.org/), [portable-pty](https://github.com/wezterm/wezterm/tree/main/pty) et [cmdk](https://cmdk.paco.me/). Les bibliothèques d'icônes embarquées viennent de la communauté Excalidraw, sous licence MIT ; leurs auteurs sont cités dans [`public/libraries/CREDITS.md`](public/libraries/CREDITS.md).

OpenVibe est un projet indépendant. Il n'est affilié ni à Symvibe, ni à Anthropic, ni à OpenAI, ni à Google, ni aux éditeurs des autres agents qu'il lance ; leurs noms appartiennent à leurs propriétaires.
