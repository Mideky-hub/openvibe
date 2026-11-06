# Changelog

All notable changes to OpenVibe are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- The palette no longer fails with an error when a terminal closes between opening it and pressing Enter, and a command's pending request to open a menu or editor is dropped when you switch tab, project or the home screen, instead of firing at a later mount (#44).
- **Renaming a group** from the palette now waits for the view to reach it before opening the name field, so the labels no longer drift when the group was off screen (#7).
- A token left in `curl.cfg` by a previous run is deleted at startup, and a Codex terminal launched under `cmd` from a profile path holding `%`, `!` or `^` is covered by tests (it starts without the hook, with a warning in the log, rather than with a wrong path).
- A node's × now closes it at the first click, instead of selecting it first (#47).
- **Icon libraries:** what a library drops (embeddable content, frames, images) is now logged, and Excalidraw no longer tries its `esm.sh` font fallback, which flooded the console with ~460 blocked requests on each load (#13).
- OpenVibe's MCP server is stricter with what agents send: a malformed request gets a proper JSON-RPC error instead of a silent answer, a flood of calls is turned away (503) instead of holding a thread each, and a terminal relaunched as its previous process exits keeps its access to OpenVibe's tools.
- Pinching on a laptop trackpad now zooms the canvas, also when the fingers are over a terminal, a board or an orchestrator (#89).
- A shortcut pressed with a menu open no longer ends placement or link mode, and a click outside the palette closes it without moving the keyboard to what lies underneath.
- A copied terminal no longer reads *Terminal not found* while it is being set up, and the agents of a new group no longer show *Stopped* before they start.
- Going to an agent of another workspace gives its terminal the keyboard even when it mounts late, and a "go to" still waiting for its workspace no longer fires later if you moved to another tab, the home screen or another project in the meantime (#38).
- **Mission clock:** an overrun warning that was still waiting for a busy orchestrator is no longer lost if OpenVibe closes, and restarting OpenVibe after a long pause no longer fires a burst of "global budget used up" toasts: each one waits for its orchestrator to be restarted.
- A request that makes OpenVibe's local server fail is now written to the log with its address (never its token), so the failure can be traced; the server keeps answering the next ones (#6).
- **Missions:** an agent wired to two orchestrators can no longer join a second mission while the first one is launching or before its sub-task is typed; the orchestrator is told the agent works for another running mission instead of "not linked" (#64).
- **Agent activity:** resizing a terminal without hooks (Shell, Codex, Gemini…) no longer lights WORKING while it redraws, and a badge no longer stays stale when two changes arrive out of order or the clock is set back (#14).

## [1.2.0-beta.1] - 2026-11-01

### Added
- **Notes:** per-project Markdown notes (plain files in the project's `.openvibe/notes/`), a graph of the links between them, notes per group, and a note list agents are told about. Open them from the rail, the palette or a group's menu.
- **Install agents from the interface:** from the home screen or the palette, in a visible terminal, with a prerequisites check first, and Ollama models pulled the same way. Nothing is ever installed without being asked.
- **Question notice:** when an agent waits on a question, OpenVibe previews the question, and raises a Windows notification if you are not looking. A setting turns the notification off. Gemini CLI's hooks are heard too.
- **Specialised groups:** give a group a speciality from its menu; the orchestrator is told each agent's group and speciality and matches sub-tasks to them.
- **Folding groups:** fold a group into its label from the chevron or the palette; going to an agent inside it unfolds it.
- **Tab reordering:** drag project tabs, or use Alt+arrows or the tab menu; the order is saved per project.
- **Team presets:** save a team of groups and orchestrators and deploy it again from the palette, with undo for a deletion.
- **Loops:** a window to run a prompt again on a trigger, with stop conditions, spending guards, a running indicator and *Stop all*.
- **Claude accounts:** several Claude profiles, a login terminal per profile, *Use*, and an account chip on the terminals that use one.
- **Tokens:** a 30-day view of your tokens per day and per agent, read from Claude's local logs (read-only; Claude only, days counted in UTC).
- **A git window**, opened from the branch chip: changed files, diffs, a tick per file to commit exactly those, history, and a *Pousser* button that names its target. Discarding asks first and says what is lost.
- **Overnight run:** checks before a night, a morning report, and a PC kept awake while the mission works.
- **Mission task queue:** follow-ups are queued for the agents instead of being typed into their terminals.
- **Per-mission permissions:** choose what the agents of a mission may do.
- **A discreet exit button** in the zen and reading modes.

### Changed
- **Code Studio:** saving never goes over a file that changed on disk: an agent's change is reloaded by itself when you have none, and otherwise a banner lets you reload or overwrite, and a file deleted meanwhile can be dropped or recreated. Files are written atomically and keep their line endings, the tree leaves out secrets and `.git`, and quitting or updating asks first about unsaved tabs.
- The global time budget is now counted in real time for every mission, and the queue gives no new task once it is spent.
- Missions keep working when their project is not the one on screen.
- Only one OpenVibe runs at a time: a second launch brings the first window back.

### Fixed
- A program on your PC can no longer freeze or crash OpenVibe's local server with a slow, malformed or panicking request; every call is answered once.
- Text sent by agents can no longer smuggle escape sequences or invisible characters into what OpenVibe shows or types, and an agent is told that a task may come from a stranger's text.
- The git window does exactly what you confirmed: a commit, a discard or a push no longer includes anything else, and a push sends only the commits the button counted.
- The `gh` commands that reach the remote are denied to agents like `git push`; the README says plainly that this stops accidents and is not a security boundary.
- A mission's agents no longer keep their permissions when copied, and an agent already in a running mission is not offered to another.
- A list that could not be read (loops, presets, command history) is never overwritten with an empty one; a refused save is reported instead of lost.
- A relaunched terminal keeps its saved output, and an empty capture never replaces it; two starts of the same terminal can no longer race.
- Updates: a check no longer closes the update being installed, and an install never goes over unsaved studio changes.
- Remote Control never types `/remote-control` after a half-written draft; a Loop never types into a shell whose Claude has quit.
- Kanban: a card's text stays data wherever it reaches an orchestrator or an agent. A card from GitHub is never sent to a plain shell, and dropping a card on an agent waiting for an answer no longer confirms its dialog.
- Kanban and missions: a queued task can carry its card, which then moves with it, and an issue follows its card when you are in another project.
- Orchestrator and mission: events wait while you type in the orchestrator, `reassign` and `extend` refuse agents that cannot take them, overrun lines are told again if the app closed before they were heard, and changing a project's folder moves its orchestrators too.
- Groups: a group copied whole gets a pantheon of its own, a folded group never hides a selectable agent, and a new group is fitted at a readable zoom instead of 40 %.
- Review: the toasts no longer cover *Send*, a nested repository is skipped, and a git warning on an empty diff is no error.
- Many small interface fixes: the command palette and `@` commands (names, Escape, double spaces), the saved theme painted before the first render, translated messages, and the keyboard going back to the canvas after menus.

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
