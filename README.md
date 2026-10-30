<p align="center">
  <picture>
    <source media="(prefers-color-scheme: light)" srcset="docs/assets/brand/banner-light.png">
    <img alt="OpenVibe: an infinite canvas of real terminals for your AI coding agents" src="docs/assets/brand/banner-dark.png" width="100%">
  </picture>
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-D97757?style=flat-square"></a>
  <img alt="Platform: Windows 10/11" src="https://img.shields.io/badge/platform-Windows%2010%2F11-29261B?style=flat-square">
  <img alt="Built with Tauri 2" src="https://img.shields.io/badge/Tauri-2-8FA876?style=flat-square">
  <img alt="Status: early preview" src="https://img.shields.io/badge/status-early%20preview-D4A27F?style=flat-square">
</p>

<p align="center">
  <b>English</b> · <a href="README.fr.md">Français</a>
</p>

OpenVibe is a desktop app that puts your AI coding agents on an infinite canvas. Each agent runs in a **real terminal** (Claude Code, Codex, Gemini CLI and more). You group agents into teams, brief a whole team in one line, review their changes, and hand a large task to an **orchestrator** that splits it, staffs it and keeps time.

Everything runs on your machine. OpenVibe adds no cloud service and no telemetry, and it never skips an agent's permission prompts. Its only request of its own is a check for updates, which you can turn off.

If you know Symvibe, OpenVibe covers the same ground (driving a fleet of CLI agents from an infinite canvas) as an independent, open-source project with its own design and features.

> [!NOTE]
> OpenVibe is an early preview, built and tested on **Windows 10/11**. Its interface speaks **English and French**: it follows Windows, and the settings menu switches it.

<picture>
  <source media="(prefers-color-scheme: light)" srcset="docs/assets/screenshots/board-light.png">
  <img alt="A team of three Claude Code agents on the canvas, under an architecture sketch made from the icon libraries" src="docs/assets/screenshots/board-dark.png">
</picture>

## Contents

- [Features](#features)
- [A tour](#a-tour)
- [The orchestrator](#the-orchestrator)
- [Supported agents](#supported-agents)
- [Keyboard](#keyboard)
- [Install](#install)
- [How it works](#how-it-works)
- [Contributing](#contributing)
- [License and credits](#license-and-credits)

## Features

- **Real terminals on a canvas.** Every agent is a real PTY (ConPTY on Windows) drawn with xterm.js. You can pan, zoom, draw around the agents and annotate their work. The canvas is [Excalidraw](https://github.com/excalidraw/excalidraw), so shapes, arrows, text and images all work.
- **Teams.** Launch four agents at once, or compose a group with a role (Frontend, Backend, Testers, Reviewers…). Each group takes its names from a pantheon: Athéna, Hermès, Apollon…
- **Live states.** OpenVibe shows whether each agent is starting, ready, running, waiting for you, stopped or done, both on the canvas and in the Agents panel. For Claude Code the state comes from its hooks; for other agents, from their output.
- **One instruction box for everyone.** Address `@tous` (everyone), a group, an agent, or several at once (`@athena/hermes`). A line starting with `/` goes to the agents' CLI as a command, and OpenVibe suggests Claude Code's commands. The history keeps your last 50 instructions per project.
- **An orchestrator that manages.** Give it a goal. It proposes a plan, gives each agent a sub-task on its own git branch and worktree, watches the time budget and merges the results into a mission branch. Details are [below](#the-orchestrator).
- **Change review.** See what an agent changed, either uncommitted or since its base, browse the repository read-only, and click a line to leave a remark. All remarks go back to the agent in one message.
- **Remote Control.** Turn on Claude Code's Remote Control for one agent, a group or the whole team, and follow them from your phone.
- **Usage at a glance.** The title bar shows your Claude subscription's session and weekly limits. Click it for cost, durations, tokens per model, prompt cache state and an estimate of CO₂.
- **Icon libraries.** About 600 icons from the Excalidraw community (system design, AWS, Azure, GCP), bundled with the app, for sketching architecture next to the agents that build it.
- **Projects and workspaces.** One project per folder, several workspace tabs per project. OpenVibe saves everything locally and, after a restart, offers to resume your Claude conversations.
- **Keyboard first.** Use the palettes, jump between terminals, or right-press anywhere for the radial menu. Light and dark themes follow Windows.

## A tour

**Launch a team.** Right-press the canvas and choose *Lancer 4 agents*: a group of four Claude Code sessions starts in its own frame.

![Right-click on the canvas, "Lancer 4 agents", and a group of four Claude Code sessions starts](docs/assets/demo/launch.gif)

**Brief the whole team.** Type `@frontend` and the question. The three agents of the group work at the same time, then come back *ready*.

![The instruction box targets @frontend; three agents answer at once](docs/assets/demo/broadcast.gif)

**Send a command to every agent.** After the targets, `/` lists Claude Code's commands; `/context` then runs in each session of the group.

![Typing / after @frontend suggests Claude Code commands; /context runs in all three agents](docs/assets/demo/commands.gif)

**Review a change and send it back.** Jump to an agent with `Ctrl+P`, open *Revue des changements* from `Ctrl+Shift+P`, then click a line to leave a remark. *Envoyer à Hermès* sends every remark in one message.

![The go-to palette, the function palette, the review panel and a remark on a diff line](docs/assets/demo/review.gif)

**Sketch the architecture.** The *Icônes* button opens the bundled libraries. This sketch links an API Gateway, a Lambda and a DynamoDB table.

![The icon libraries: API Gateway, Lambda and DynamoDB placed and linked with arrows](docs/assets/demo/icons.gif)

**Check your usage.** The meter in the title bar opens the detail: subscription limits and when they reset, cost and durations of OpenVibe's sessions, tokens per model, and each session's prompt cache.

<img alt="The usage detail: session and weekly limits, cost, durations, tokens per model and prompt cache" src="docs/assets/screenshots/usage.png" width="428">

## The orchestrator

The orchestrator is a Claude Code session that acts as a team manager. Link one to a group from the group menu (*Relier un orchestrateur*) and describe the goal in its terminal. Then:

![A real mission: the goal typed to the orchestrator, its plan with the model router, the go-ahead, two agents at work in their worktrees, then the merge](docs/assets/demo/mission.gif)

*A real mission, sped up where the badge says so. The router puts both sub-tasks on Haiku, each agent works and commits on its own branch, and the orchestrator merges both into the mission branch.*

1. **It proposes a plan.** It splits the goal into sub-tasks, each with an owner, a time budget and, optionally, a difficulty level. The plan appears in the mission panel under the orchestrator.
2. **You launch the mission.** OpenVibe creates the mission branch `openvibe/<mission>`, plus a branch and a worktree for each agent next to your repository. It then gives every agent its sub-task.
3. **The agents report.** Each Claude agent declares its steps, which appear as a timeline under its terminal, and reports back when done. Agents can hand parts of their work to their own sub-agents.
4. **The orchestrator keeps time.** It is told when a sub-task reaches its budget. At twice the budget you get a notification and a red bar. Nobody is stopped automatically: the orchestrator can extend, interrupt or reassign.
5. **It merges.** Finished branches are merged into the mission branch; a conflict aborts that merge and is reported. OpenVibe **never pushes** and **never merges into your own branch**.

With the **model router**, each sub-task's level picks the model its agent runs on:

| Level | Model |
|---|---|
| `low` | Claude Haiku 5.5 |
| `medium` | Claude Sonnet 5.5 |
| `high` | Claude Opus 5.5 |
| `extreme` | Claude Fable 5.1 |

The orchestrator talks to OpenVibe through a local MCP server, with tools such as `propose_plan`, `team`, `read_output`, `extend`, `reassign`, `merge` and `remote_control`. It can read the repository, but it is denied `Edit`, `Write` and `NotebookEdit`: the agents write the code.

## Supported agents

OpenVibe launches the agents you already have installed: an agent counts as available when its command is on your `PATH`.

| Agent | Command | State detection |
|---|---|---|
| Claude Code | `claude` | Hooks (precise: running, waiting for you, done) |
| Codex | `codex` | Output, plus its `notify` hook at the end of each turn |
| Gemini CLI | `gemini` | Output |
| Qwen Code | `qwen` | Output |
| Cursor | `cursor-agent` | Output |
| OpenCode | `opencode` | Output |
| Aider | `aider` | Output |
| Ollama | `ollama run <model>` (or Aider on an Ollama model) | Output |
| Shell | PowerShell, cmd, pwsh or Git Bash | Output |
| Custom | any command you type | Output |

Remote Control, missions, the model router, the step timeline and the usage meter rely on Claude Code; the canvas, groups, mentions and review work with every agent.

## Keyboard

| Shortcut | Action |
|---|---|
| `Ctrl+P` | Go to a terminal, group, orchestrator, workspace or project |
| `Ctrl+Shift+P` | Function palette (every command of the app) |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Next / previous terminal, in reading order |
| `Shift+Esc` | Give the keyboard back to the canvas |
| `Ctrl+Shift+A` | Overview |
| Right-press | Radial menu: click an item, or hold, drag and release |
| `@` · `/` · `↑` | In the instruction box: target · command · history |
| `Shift+Enter` | New line, in the instruction box and in terminals |

Excalidraw's own keys (`V`, `H`, `R`, `O`, `A`, `T`, `P`, `E`, `Ctrl+Z`…) work whenever the canvas has the keyboard. In a terminal, `Ctrl+C` copies when text is selected and interrupts otherwise.

## Install

Download `OpenVibe_<version>_x64-setup.exe` from the [latest release](https://github.com/Mideky-hub/openvibe/releases/latest) and run it (Windows 10/11). It installs for your user only and needs no administrator rights.

You also need at least one agent CLI, for example [Claude Code](https://docs.claude.com/en/docs/claude-code/overview), and [Git](https://git-scm.com/): Git Bash provides the `bash` that the usage meter needs.

> [!IMPORTANT]
> Betas are not code-signed yet. If Windows SmartScreen stops the installer, choose **More info**, then **Run anyway**.

On first launch, the home screen walks you through installing an agent, adding a project and launching an agent. Something wrong? See the [troubleshooting guide](docs/troubleshooting.md), or open **Troubleshooting** from the settings menu.

**Updates.** OpenVibe looks for a new release on GitHub 10 seconds after it starts, then every 6 hours, and offers to install it. Before the installer restarts it, OpenVibe saves your canvas and the terminals' history; Claude conversations can be resumed afterwards. Updates are signed: one whose signature does not match is refused. This check is the only request OpenVibe makes on its own. To turn it off, open the settings menu (the gear) and untick **Rechercher les mises à jour automatiquement**.

### Build from source

**Prerequisites** (Windows 10/11):

- [Tauri 2's Windows prerequisites](https://v2.tauri.app/start/prerequisites/): the Microsoft C++ Build Tools and WebView2. WebView2 is already present on Windows 11.
- [Rust](https://rustup.rs/) 1.85 or newer (the crate uses edition 2024).
- [Node.js](https://nodejs.org/) 22 LTS and [pnpm](https://pnpm.io/) 10.
- [Git](https://git-scm.com/). Git Bash also provides the `bash` that the usage meter needs.
- At least one agent CLI, for example [Claude Code](https://docs.claude.com/en/docs/claude-code/overview).

**Build and run:**

```powershell
git clone https://github.com/Mideky-hub/openvibe.git
cd openvibe
pnpm install
pnpm tauri dev                  # run in development
pnpm tauri build                # build the installer
```

The installer is written to `src-tauri/target/release/bundle/nsis/`. It installs per user and needs no administrator rights.

> [!TIP]
> To try OpenVibe without touching your saved projects, give the development build its own data folder:
> `pnpm tauri dev --config '{"identifier":"dev.openvibe.probe"}'`

## How it works

- **Desktop shell:** [Tauri 2](https://v2.tauri.app/). The Rust side owns the PTYs ([portable-pty](https://crates.io/crates/portable-pty)), git, the SQLite database and a small HTTP server.
- **Interface:** React 19, TypeScript, Zustand and Tailwind CSS 4, with [Excalidraw](https://github.com/excalidraw/excalidraw) for the canvas and [xterm.js](https://xtermjs.org/) for the terminals.
- **Agent states and tools:** the HTTP server listens on `127.0.0.1` only, on a random port.
  - Each Claude Code session gets an extra `--settings` file. It declares hooks that report the session's state, a status line that reports usage, and an MCP server for the mission tools.
  - Every request needs a token drawn when the app starts, or a token for the session itself.
  - OpenVibe reads your own `~/.claude/settings.json` but never modifies it, and your own status line keeps showing in the terminals.
- **Storage:** projects, canvases, terminal scrollback and settings live in a local SQLite database under `%APPDATA%\dev.openvibe.app\`.

See [SECURITY.md](SECURITY.md) for the security model in more detail.

## Contributing

Bug reports, ideas and pull requests are welcome, in English or in French. Start with [CONTRIBUTING.md](CONTRIBUTING.md); the ideas already in line are in [BACKLOG.md](BACKLOG.md). Please follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## License and credits

OpenVibe is released under the [MIT License](LICENSE).

It builds on [Tauri](https://tauri.app/), [Excalidraw](https://github.com/excalidraw/excalidraw), [xterm.js](https://xtermjs.org/), [portable-pty](https://github.com/wezterm/wezterm/tree/main/pty) and [cmdk](https://cmdk.paco.me/). The bundled icon libraries come from the Excalidraw community, under the MIT License; their authors are listed in [`public/libraries/CREDITS.md`](public/libraries/CREDITS.md).

OpenVibe is an independent project. It is not affiliated with Symvibe, Anthropic, OpenAI, Google or the makers of the other agents it launches; their names belong to their owners.
