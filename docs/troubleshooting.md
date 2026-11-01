# Troubleshooting

[Version française](troubleshooting.fr.md)

Start with the **Troubleshooting** dialog: the settings menu (the gear), the command palette (`Ctrl+K`, then type "troubleshooting"), or the link at the bottom of the home screen. It shows OpenVibe's version, the agents it finds and where, Git, Git Bash and the local server, and gives you the diagnostics to copy into a bug report.

## Windows SmartScreen stops the installer

Betas are not code-signed yet. Choose **More info**, then **Run anyway**. The installer only installs for your user (in `%LOCALAPPDATA%\OpenVibe`) and needs no administrator rights. Updates downloaded by OpenVibe itself are signed, and an update whose signature does not match is refused.

## An agent is not found

OpenVibe launches the agent CLIs installed on your PC; it looks for them on Windows' `PATH`.

1. Check that the agent runs in a new PowerShell window: `claude --version` (or `codex`, `gemini`, …).
2. In OpenVibe, click **Check again** (on the home screen, or in the Troubleshooting dialog). It reads Windows' `PATH` again, so an agent installed while OpenVibe runs is found without restarting it.
3. Still not found: `where.exe claude` in PowerShell shows the folder it is in. That folder must be in your user or system `PATH` (Windows settings → "Edit environment variables for your account").

Claude Code is needed for the orchestrator, missions and the usage meter. Its official installer, in PowerShell: `irm https://claude.ai/install.ps1 | iex` (see [Claude Code's setup page](https://code.claude.com/docs/en/setup)).

### Installing an agent from OpenVibe

*Installer*, next to a missing agent, shows the official command and runs it in a visible terminal on the canvas of the open project (open a project first). Read the terminal if it fails: the installer's own message is there, and `Ctrl+C` stops it. Gemini CLI, OpenCode and Ollama's models need **npm**: if OpenVibe says it is missing, install [Node.js](https://nodejs.org/), which brings it, then click **Check again**. OpenVibe looks for the new agent for up to 30 minutes after the command starts, and says when it is installed.

## No Windows notification when an agent has a question

The notice at the bottom left of the window always shows while an agent waits. The Windows notification is only sent when OpenVibe's window is not in focus, only for the open project, and only if **Windows notifications** is on in the settings menu. If it is on and nothing appears, check Windows' notification settings for OpenVibe and that *Focus assist* (Do not disturb) is not hiding them.

## The usage meter stays empty

The meter in the top bar reads Claude Code's usage through a small script run by `bash`. It needs **Git Bash**, which comes with [Git for Windows](https://git-scm.com/download/win). The Troubleshooting dialog says whether Git Bash is found. After installing Git, restart OpenVibe.

## The Tokens view is empty, or says its reading was cut short

The view reads the `.jsonl` logs that Claude Code keeps under `~/.claude/projects` (or under the folder named by `CLAUDE_CONFIG_DIR`), for the last 30 days, in UTC days. It stays empty if Claude Code has not run on this PC, if its folder is somewhere else, or if its history was cleared. For a very large history OpenVibe stops at fixed limits (number of files, bytes read, time) and says the figures are a minimum. Only Claude Code is read; Codex is not supported yet. The view never shows conversation text.

## The code studio refuses to save

OpenVibe never overwrites what an agent wrote meanwhile. If the file changed on the disk since you opened it, the studio says so and offers to **reload** (your edits are lost) or to **overwrite** with your version. If the file was deleted, it offers to recreate it. A project outside a git repository lists its files from the folder itself, up to a limit.

## An agent has disappeared from a group

The group is probably **folded**: only its label shows, with its counters, while its agents keep running. Click the chevron on the label, or *Déplier le groupe* in its menu. Going to one of its agents from the Agents panel or `Ctrl+P` unfolds it too. A group cannot be folded while its agents are still starting; wait a moment and try again.

## A team preset deploys with a different agent

A preset remembers the agent of each cell. If one is not installed on this PC, OpenVibe puts the default agent in its place and says so. Install the agent (see above) and save the preset again, or deploy it as it is.

## Notes and git

Notes are plain Markdown files in the project's `.openvibe/notes/`. OpenVibe does not touch the project's `.gitignore`: add `.openvibe/` to it to keep your notes out of git, or commit them to share them.

## "OpenVibe tools unavailable" on an orchestrator

An orchestrator only starts with OpenVibe's own tools, served by a local server inside OpenVibe; without them it could change your branch, so it does not start. Click **Try again**. If it happens again, the Troubleshooting dialog shows whether the local server runs; restart OpenVibe, and if it goes on, attach the log to a bug report.

## A mission says the repository has no commit

A mission works on git branches, which need a first commit. In the project's folder: `git add -A`, then `git commit -m "First commit"`, and launch the mission again.

## A loop does not send

A loop never writes to an agent that waits for you (a permission dialog included), is stopped or is still starting; such a turn is skipped and does not count. An agent that was closed is ignored, and a loop with no live target switches itself off. Every loop is off again after OpenVibe restarts: switch it on from the loops window (*Gérer les boucles…* in the function palette). The pill at the bottom left, or *Boucles : tout arrêter*, stops them all.

## A Claude agent uses the wrong account

A terminal keeps the profile it started with; changing the active one in *Comptes Claude…* only affects the agents you launch afterwards. Close and relaunch the agent, or launch a new one. To sign in to a profile, use its *Se connecter* button: it opens a visible Claude terminal where you log in (or type `/login`). A profile whose folder is invalid makes the agent refuse to start, with a message, rather than fall back to another account. If you remove a profile, its folder stays on your disk and its old terminals restart with the default account.

## The git window will not commit, discard or push

- During a merge, a rebase, a cherry-pick or a revert, committing and discarding are refused: finish or abort the operation first.
- Discarding refuses a file that changed since the list was read (an agent may have written it meanwhile): refresh and look again.
- *Pousser* is greyed, with the reason, when HEAD is detached, there is no remote, or several remotes exist and none is called `origin`. It never forces. Git does not prompt in OpenVibe; Windows' credential manager may open its own window after your click. A refused push shows git's message in the window.
- A commit that git refuses (no identity, a hook) shows git's own message, and your commit message stays.

## OpenVibe will not open a second window

OpenVibe runs once, on purpose: two copies would fight over the database and the log. Launching it again brings the open window to the front and restores it if it was minimized. If you cannot find it, check the taskbar and other virtual desktops.

## Where the logs and data are

- Logs: `%LOCALAPPDATA%\dev.openvibe.app\logs\openvibe.log`. They never hold a token, a terminal's text or an instruction. **Open the logs folder** in the Troubleshooting dialog or the settings menu.
- Data (projects, canvases, terminals' history): `%APPDATA%\dev.openvibe.app\openvibe.db`. Before upgrading its database, OpenVibe keeps a copy next to it (`openvibe.v<N>-backup.db`). **Open the data folder** in the Troubleshooting dialog.

## Report a bug

In the Troubleshooting dialog, click **Copy the diagnostics**, then **Report a problem**: it opens a new GitHub issue with your version filled in. Paste the diagnostics and, if you can, attach `openvibe.log`. The diagnostics hold no token, no project path, and your home folder shows as `~`.

Security problems: please follow [SECURITY.md](../SECURITY.md) instead of opening a public issue.

## Start from scratch

1. Close OpenVibe.
2. Rename `%APPDATA%\dev.openvibe.app` (for example to `dev.openvibe.app.old`).
3. Start OpenVibe: it creates an empty database. Your project folders are not touched; add them again from the home screen.

To go back, close OpenVibe and give the folder its name again.

## Uninstall

Windows settings → Apps → Installed apps → OpenVibe → Uninstall. Your data stays in `%APPDATA%\dev.openvibe.app` unless you tick the uninstaller's box to delete the application data, or delete the folder yourself; your project folders are never touched.
