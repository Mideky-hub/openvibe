# Changelog

All notable changes to OpenVibe are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0-beta.1] - 2026-10-28

### Added
- **Code Studio**: each project gets one code workspace, an IDE tab beside its canvases (activity rail or command palette, **Code Studio**). The repository's tree sits in a floating bar you can show, hide, filter and refresh; files open in tabs in an editor with syntax highlighting, **Save (Ctrl+S)**, a warning before closing unsaved changes, and a **Preview** of Markdown files. **Insert** puts the open file on the last canvas shown. Reading and writing are limited to the project's folder (#49).
- In the code workspace, **Ctrl+P** finds files by name, and `file:line` or `file:line:column` (e.g. `App.tsx:42`) opens the file at that line; **Ctrl+G** (**Go to line…**) jumps to `42` or `42:7` in the open file.
- A **file node** on the canvas: a file of the project, shown read-only with a **Refresh** button.
- A **Kanban** widget (tool rail or command palette): columns you add, rename and delete, cards with a title, notes, a priority and a due date (today, tomorrow, next week or a date), overdue cards marked. Cards are dragged between columns, and a card dropped on a terminal is sent to that agent as an instruction. The node widens with its number of columns (#29).
- **Link to GitHub…** in the board's menu syncs a Kanban with a repository's issues, and optionally a Project v2, through the GitHub CLI (`gh`): issues become cards, moving a card closes, reopens or changes the issue's Status, and **Create the issue on GitHub** turns a card into an issue. It needs `gh auth login`, plus `gh auth refresh -s project` for Projects; OpenVibe stores no token (#29).
- **Plan with the orchestrator** in a column's menu sends the column's cards to a new or existing orchestrator. Linked orchestrators read the board with a new MCP tool, `board`, and `propose_plan` takes a `card` field per sub-task: the card moves to **In progress** when the mission starts and to the **Done** column (or the last one) when its agent reports done. The card shows the agent working on it, follows a reassignment, and warns when the agent is blocked or failed.

### Changed
- The database is upgraded twice on first start: migration 3 lets nodes be files, migration 4 gives workspaces a kind (canvas or code). OpenVibe keeps a copy of the database first (`openvibe.v<N>-backup.db`).
- Closing the code workspace is always allowed; the last canvas still cannot be closed.

### Fixed
- **Launch the mission** and the mission's total budget stay visible at the bottom of the mission panel, however long the plan.

## [1.0.0-beta.1] - 2026-10-27

The first public beta of OpenVibe: a local, open source canvas where AI coding agents work side by side in real terminals.

### Highlights
- Real terminals on an Excalidraw canvas for Claude Code, Codex, Gemini CLI, Qwen Code, Cursor CLI, opencode, Aider, Ollama or any command, each with its live state.
- Groups with roles and names from a pantheon, and one instruction box for everyone, a group or a single agent.
- An orchestrator that proposes a plan, gives each agent a sub-task on its own git branch and worktree, watches the time budgets and merges the results into a mission branch.
- Change review with line remarks sent back to the agent, Remote Control for Claude Code, and your Claude usage in the title bar.
- English and French, a guided first launch, a troubleshooting dialog, and updates that install themselves.

### Added
- The interface in English and French. It follows Windows' language (English unless Windows is in French); the settings menu and the command palette switch it at once.
- A guided first launch: while no project exists or no coding agent is installed, the home screen shows three steps. Without any agent, it gives Claude Code's official install command to copy and the other agents' official pages.
- **Check again** reads Windows' `PATH` from the registry: an agent installed while OpenVibe runs is found without restarting it, and new terminals see it too.
- A **Troubleshooting** dialog (command palette, settings menu, home screen): the agents found and where, Git, Git Bash, the local server, the logs and data folders, diagnostics to copy (no token, the home folder as `~`), the [troubleshooting guide](docs/troubleshooting.md) and a bug report with the version filled in.
- A log file (`%LOCALAPPDATA%\dev.openvibe.app\logs\openvibe.log`), opened from the command palette or the settings menu, to attach to a bug report. It never holds a token, a terminal's text or an instruction.
- Before upgrading its database, OpenVibe keeps a copy of it (`openvibe.v<N>-backup.db`).
- An orchestrator that cannot get OpenVibe's tools does not start, and its node says why.
- A strict content security policy for the interface.

### Changed
- OpenVibe's MCP tools have English names, arguments and values for every agent: `declare_steps`, `step`, `report`, `mission`, `propose_plan`, `team`, `read_output`, `write`, `extend`, `interrupt`, `reassign`, `merge`, `finish`, `remote_control`. A conversation that calls a former French name is told the new one; French values are still understood.
- What OpenVibe says to agents (role prompts, sub-tasks, budget warnings, tool answers, review remarks) follows the interface's language.
- An orchestrator may no longer run shell commands, and only gets OpenVibe's own MCP tools.
- Closing a working orchestrator asks for confirmation first.
- An orchestrator is refused when Claude Code is not installed, with a message that says so.

### Fixed
- Resuming a Claude session that never had a conversation starts a new one instead of dropping back to the shell.
- The periodic save could replace a terminal's final output with an older copy.
- A rendering error no longer blanks the whole window: it stays in its node, panel or dialog, and the window can reload without stopping the agents.
- A crash in one thread no longer closes OpenVibe and every agent with it.
- A database from a newer OpenVibe is no longer opened by an older one.
- The local server's token no longer appears on any command line.
- Terminals of an OpenVibe started from Claude Code no longer inherit that session's variables.
- A mission in a repository without a commit says so instead of showing git's error.
- A merge refused by a git hook no longer blocks the next merges.
- Mission times stop when the mission ends.
- A deleted orchestrator no longer raises budget alerts, and reports sent while it is stopped reach it when it starts again.
