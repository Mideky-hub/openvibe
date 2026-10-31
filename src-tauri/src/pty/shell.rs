use crate::tr;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ShellKind {
    Default,
    PowerShell,
    Pwsh,
    Cmd,
    GitBash,
}

/// The agents of the launch menu (spec habillage §8).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Agent {
    Claude,
    Codex,
    Gemini,
    Qwen,
    Cursor,
    Opencode,
    Aider,
    Ollama,
    Shell,
    Custom,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OllamaMode {
    /// `ollama run <model>`: a conversation, no access to the repository.
    Chat,
    /// Aider driven by the local model: edits the repository.
    Code,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OllamaLaunch {
    pub model: String,
    pub mode: OllamaMode,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ClaudeMode {
    New,
    Resume,
    Continue,
}

/// What a Claude session is for (spec orchestrateur §4.2): an agent, or the
/// orchestrator that manages a team without coding.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    #[default]
    Agent,
    Orchestrator,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeLaunch {
    pub mode: ClaudeMode,
    pub session_id: String,
    pub title: String,
    /// Interfaces of before the orchestrator send none: an agent.
    #[serde(default)]
    pub role: Role,
    /// Remote Control from the start, under this name (`--remote-control`).
    #[serde(default)]
    pub remote_control: Option<String>,
    /// The model the orchestrator's router chose (`--model`).
    #[serde(default)]
    pub model: Option<String>,
    /// The profile's folder, for this terminal's `CLAUDE_CONFIG_DIR` (spec comptes §4).
    #[serde(default)]
    pub config_dir: Option<String>,
}

/// What the frontend asks for when it starts a terminal (spec §9).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnSpec {
    pub cwd: String,
    pub shell: ShellKind,
    /// Saved terminals of plan 2 send `preset`; the ids are the same.
    #[serde(alias = "preset")]
    pub agent: Agent,
    #[serde(default)]
    pub command: String,
    pub claude: Option<ClaudeLaunch>,
    #[serde(default)]
    pub ollama: Option<OllamaLaunch>,
}

/// Quoting rules differ per shell, so each resolved shell carries its syntax.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ShellSyntax {
    PowerShell,
    Cmd,
    Posix,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ShellProgram {
    pub program: PathBuf,
    pub args: Vec<String>,
    pub syntax: ShellSyntax,
}

/// Everything needed to start a process in a PTY, independent of Tauri.
#[derive(Debug, Clone)]
pub struct SpawnPlan {
    pub program: PathBuf,
    pub args: Vec<String>,
    pub cwd: PathBuf,
    pub env: Vec<(String, String)>,
    /// Inherited variables the process must not see.
    pub env_remove: Vec<String>,
    /// Typed into the shell right after it starts, e.g. `claude --resume <id>\r`.
    pub initial_input: Option<String>,
    /// What `pty_interrupt` writes: the agent's interrupt key (spec §8).
    pub interrupt: Option<&'static [u8]>,
}

/// What OpenVibe passes to agents so they report their state (spec §8.2).
#[derive(Debug, Clone, Default)]
pub struct AgentHooks {
    /// Claude: `claude --settings <file>`.
    pub claude_settings: Option<PathBuf>,
    /// Codex: the URL its `notify` posts to, without the token.
    pub codex_notify: Option<String>,
    /// The curl config that carries the local server's token (spec première version §4.3).
    pub curl_config: Option<PathBuf>,
    /// Claude: `--mcp-config <file>`, OpenVibe's tools (spec orchestrateur §4.2).
    pub mcp_config: Option<PathBuf>,
    /// Claude: `--append-system-prompt-file <file>`, its role.
    pub system_prompt: Option<PathBuf>,
}

/// What keeps an orchestrator a manager (spec première version §4.1): its
/// settings (`deny`), OpenVibe's tools and its role. Without one of them it
/// would start as a plain Claude in the user's folder, so it does not start.
pub fn orchestrator_tools(hooks: &AgentHooks, server_running: bool) -> Result<(), String> {
    if !server_running {
        return Err(tr!(
            "le serveur local d'OpenVibe n'a pas démarré",
            "OpenVibe's local server did not start"
        ));
    }
    let complete = hooks.claude_settings.is_some()
        && hooks.mcp_config.is_some()
        && hooks.system_prompt.is_some();
    if complete {
        Ok(())
    } else {
        Err(tr!(
            "ses réglages n'ont pas pu être écrits (voir le journal)",
            "its settings could not be written (see the log)"
        ))
    }
}

/// Claude Code marks the processes its tools start; an OpenVibe launched from
/// a Claude Code session must not pass them on, or its agents become child
/// sessions, left out of `--resume` (spec §8.2).
pub const INHERITED_MARKERS: [&str; 8] = [
    "CLAUDECODE",
    "CLAUDE_CODE_CHILD_SESSION",
    "CLAUDE_CODE_SESSION_ID",
    "CLAUDE_CODE_ENTRYPOINT",
    "CLAUDE_CODE_BRIDGE_SESSION_ID",
    "CLAUDE_CODE_MESSAGING_SOCKET",
    "CLAUDE_CODE_MESSAGING_TOKEN",
    "CLAUDE_CODE_SKIP_PROMPT_HISTORY",
];

/// What a Claude Code session also sets for the processes it starts (spec
/// première version §4.4). Outside Claude Code they can be the user's own
/// settings (`GIT_EDITOR`…), so they are left alone there.
pub const CLAUDE_SESSION_EXTRAS: [&str; 8] = [
    "CLAUDE_CODE_SSE_PORT",
    "CLAUDE_CODE_SESSION_ATTENDED",
    "CLAUDE_CODE_EXECPATH",
    "CLAUDE_PID",
    "CLAUDE_EFFORT",
    "AI_AGENT",
    "GIT_EDITOR",
    "NoDefaultCurrentDirectoryInExePath",
];

/// The variables a terminal does not inherit; `inside_claude`: OpenVibe itself
/// was started from a Claude Code session.
pub fn removed_env(inside_claude: bool) -> Vec<String> {
    let extras: &[&str] = if inside_claude {
        &CLAUDE_SESSION_EXTRAS
    } else {
        &[]
    };
    INHERITED_MARKERS
        .iter()
        .chain(extras)
        .map(|key| key.to_string())
        .collect()
}

/// Finds an executable on PATH. Injected so tests don't depend on the machine.
pub type Locate<'a> = &'a dyn Fn(&str) -> Option<PathBuf>;

/// Looks `name` up on a given PATH, the refreshed one of `env_path`.
pub fn locate_in(name: &str, path: &std::ffi::OsStr) -> Option<PathBuf> {
    let cwd = std::env::current_dir().unwrap_or_else(|_| std::env::temp_dir());
    which::which_in(name, Some(path), cwd).ok()
}

pub fn which_locate(name: &str) -> Option<PathBuf> {
    match super::env_path::current() {
        Some(path) => locate_in(name, &path),
        None => which::which(name).ok(),
    }
}

pub fn resolve_shell(kind: ShellKind, locate: Locate) -> AppResult<ShellProgram> {
    let program = |name: &str, fallback: &str, args: &[&str], syntax| ShellProgram {
        program: locate(name).unwrap_or_else(|| PathBuf::from(fallback)),
        args: args.iter().map(|a| a.to_string()).collect(),
        syntax,
    };
    match kind {
        ShellKind::Default if cfg!(windows) => resolve_shell(ShellKind::PowerShell, locate),
        ShellKind::Default => Ok(ShellProgram {
            program: std::env::var("SHELL")
                .unwrap_or_else(|_| "/bin/bash".into())
                .into(),
            args: vec!["-l".into()],
            syntax: ShellSyntax::Posix,
        }),
        ShellKind::PowerShell => Ok(program(
            "powershell",
            "powershell.exe",
            &["-NoLogo"],
            ShellSyntax::PowerShell,
        )),
        ShellKind::Cmd => Ok(program("cmd", "cmd.exe", &[], ShellSyntax::Cmd)),
        ShellKind::Pwsh => locate("pwsh")
            .map(|p| ShellProgram {
                program: p,
                args: vec!["-NoLogo".into()],
                syntax: ShellSyntax::PowerShell,
            })
            .ok_or_else(|| {
                AppError::NotFound(tr!(
                    "pwsh introuvable dans le PATH",
                    "pwsh not found in the PATH"
                ))
            }),
        ShellKind::GitBash => locate("git")
            .and_then(|git| find_git_bash(&git))
            .map(|p| ShellProgram {
                program: p,
                args: vec!["--login".into(), "-i".into()],
                syntax: ShellSyntax::Posix,
            })
            .ok_or_else(|| AppError::NotFound(tr!("Git Bash introuvable", "Git Bash not found"))),
    }
}

/// Git for Windows ships `bin\bash.exe` at its root, while `git.exe` lives in `cmd\`
/// or `mingw64\bin\`. Walking up from git avoids picking WSL's `bash.exe` from PATH.
pub fn find_git_bash(git: &Path) -> Option<PathBuf> {
    git.ancestors()
        .skip(1)
        .take(4)
        .map(|dir| dir.join("bin").join("bash.exe"))
        .find(|candidate| candidate.is_file())
}

/// Quotes one argument for the given shell's interactive syntax.
pub fn quote(syntax: ShellSyntax, value: &str) -> String {
    match syntax {
        // PowerShell also treats typographic single quotes as quote characters.
        ShellSyntax::PowerShell => {
            let mut out = String::from("'");
            for c in value.chars() {
                if matches!(c, '\'' | '\u{2018}' | '\u{2019}' | '\u{201A}' | '\u{201B}') {
                    out.push(c);
                }
                out.push(c);
            }
            out.push('\'');
            out
        }
        ShellSyntax::Posix => format!("'{}'", value.replace('\'', r"'\''")),
        // cmd has no reliable escape for `%` and `!` inside quotes, so we drop the
        // characters cmd would interpret rather than risk variable expansion.
        ShellSyntax::Cmd => {
            let safe: String = value
                .chars()
                .filter(|c| !matches!(c, '"' | '%' | '!' | '^'))
                .collect();
            format!("\"{safe}\"")
        }
    }
}

/// The program an agent runs; `list_agents` looks for it on the PATH.
pub fn binary(agent: Agent) -> &'static str {
    match agent {
        Agent::Claude => "claude",
        Agent::Codex => "codex",
        Agent::Gemini => "gemini",
        Agent::Qwen => "qwen",
        Agent::Cursor => "cursor-agent",
        Agent::Opencode => "opencode",
        Agent::Aider => "aider",
        Agent::Ollama => "ollama",
        Agent::Shell | Agent::Custom => "",
    }
}

/// What stops an agent's current turn (spec §8): Escape, or Ctrl+C for the
/// agents that take it; nothing for a plain shell.
pub fn interrupt_sequence(agent: Agent) -> Option<&'static [u8]> {
    match agent {
        Agent::Claude
        | Agent::Codex
        | Agent::Gemini
        | Agent::Qwen
        | Agent::Cursor
        | Agent::Opencode => Some(b"\x1b"),
        Agent::Aider | Agent::Ollama | Agent::Custom => Some(b"\x03"),
        Agent::Shell => None,
    }
}

/// The command typed into the shell for an agent, or `None` for a plain shell.
pub fn agent_command(
    spec: &SpawnSpec,
    syntax: ShellSyntax,
    hooks: &AgentHooks,
) -> AppResult<Option<String>> {
    Ok(match spec.agent {
        Agent::Shell => None,
        Agent::Custom => {
            let command = spec.command.trim();
            if command.is_empty() {
                return Err(AppError::InvalidInput(tr!(
                    "la commande personnalisée est vide",
                    "the custom command is empty"
                )));
            }
            Some(command.to_string())
        }
        Agent::Claude => Some(claude_command(spec.claude.as_ref(), syntax, hooks)?),
        Agent::Codex => Some(codex_command(
            syntax,
            hooks.codex_notify.as_deref(),
            hooks.curl_config.as_deref(),
        )),
        Agent::Ollama => Some(ollama_command(spec.ollama.as_ref(), syntax)?),
        other => Some(binary(other).into()),
    })
}

/// Model names are typed into a shell: only the characters Ollama uses in them
/// ("qwen2.5-coder:7b", "hf.co/user/model:tag") are accepted.
fn ollama_command(launch: Option<&OllamaLaunch>, syntax: ShellSyntax) -> AppResult<String> {
    let launch = launch.ok_or_else(|| {
        AppError::InvalidInput(tr!("options Ollama manquantes", "Ollama options missing"))
    })?;
    let model = launch.model.trim();
    let valid = !model.is_empty()
        && model
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "._:/-".contains(c));
    if !valid {
        return Err(AppError::InvalidInput(tr!(
            "modèle Ollama invalide : {model}",
            "invalid Ollama model: {model}"
        )));
    }
    Ok(match launch.mode {
        OllamaMode::Chat => format!("ollama run {}", quote(syntax, model)),
        OllamaMode::Code => format!(
            "aider --model {}",
            quote(syntax, &format!("ollama_chat/{model}"))
        ),
    })
}

/// The longest model name or alias accepted for `--model`.
const MAX_MODEL_LEN: usize = 64;

fn claude_command(
    launch: Option<&ClaudeLaunch>,
    syntax: ShellSyntax,
    hooks: &AgentHooks,
) -> AppResult<String> {
    let launch = launch.ok_or_else(|| {
        AppError::InvalidInput(tr!("options Claude manquantes", "Claude options missing"))
    })?;
    let mut claude = "claude".to_string();
    let flags = [
        ("--settings", &hooks.claude_settings),
        ("--mcp-config", &hooks.mcp_config),
        ("--append-system-prompt-file", &hooks.system_prompt),
    ];
    for (flag, path) in flags {
        if let Some(path) = path {
            claude.push_str(&format!(
                " {flag} {}",
                quote(syntax, &path.to_string_lossy())
            ));
            // The orchestrator gets OpenVibe's tools only: the user's MCP
            // servers could write files out of reach of its `deny` list.
            if flag == "--mcp-config" && launch.role == Role::Orchestrator {
                claude.push_str(" --strict-mcp-config");
            }
        }
    }
    if let Some(model) = launch.model.as_deref() {
        // Typed into a shell: a model's name, or an alias like `sonnet[1m]`, nothing else.
        // The first character is alphanumeric so the name can never read as a flag.
        let valid = model.len() <= MAX_MODEL_LEN
            && model.starts_with(|c: char| c.is_ascii_alphanumeric())
            && model
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '.' | '_' | '[' | ']'));
        if !valid {
            return Err(AppError::InvalidInput(tr!(
                "modèle invalide : {model}",
                "invalid model: {model}"
            )));
        }
        claude.push_str(&format!(" --model {}", quote(syntax, model)));
    }
    let remote = remote_flag(launch, syntax);
    if launch.mode == ClaudeMode::Continue {
        return Ok(format!("{claude} --continue{remote}"));
    }
    // Parsing guarantees the id is a bare UUID, so it never needs quoting.
    let session = uuid::Uuid::parse_str(&launch.session_id).map_err(|_| {
        let id = &launch.session_id;
        AppError::InvalidInput(tr!(
            "identifiant de session invalide : {id}",
            "invalid session id: {id}"
        ))
    })?;
    let title = clean_title(&launch.title);
    Ok(match launch.mode {
        ClaudeMode::Resume => format!("{claude} --resume {session}{remote}"),
        _ if title.is_empty() => format!("{claude} --session-id {session}{remote}"),
        // Git Bash rewrites arguments that look like paths ("/fix" → "C:/Program Files/Git/fix").
        _ if syntax == ShellSyntax::Posix => {
            format!(
                "MSYS_NO_PATHCONV=1 {claude} --session-id {session} -n {}{remote}",
                quote(syntax, &title)
            )
        }
        _ => format!(
            "{claude} --session-id {session} -n {}{remote}",
            quote(syntax, &title)
        ),
    })
}

/// `--remote-control [name]` comes last: its name is optional, and the flag
/// must not take the next argument of the command for one.
fn remote_flag(launch: &ClaudeLaunch, syntax: ShellSyntax) -> String {
    match launch.remote_control.as_deref().map(clean_title) {
        None => String::new(),
        Some(name) if name.is_empty() => " --remote-control".into(),
        Some(name) => format!(" --remote-control {}", quote(syntax, &name)),
    }
}

/// `notify` is given as TOML literal strings: PowerShell 5.1 drops the
/// double quotes nested in an argument passed to a native program. The token
/// comes from the curl config, never from the command line.
fn codex_command(syntax: ShellSyntax, notify_url: Option<&str>, config: Option<&Path>) -> String {
    let (Some(url), Some(config)) = (notify_url, config) else {
        return "codex".into();
    };
    // cmd drops `%`, `!`, `^` and `"` from what it is given (see `quote`): the
    // path would be another one and curl would send no token. Without the
    // hook, the terminal's output decides its activity.
    if syntax == ShellSyntax::Cmd && config.to_string_lossy().contains(['%', '!', '^', '"']) {
        log::warn!(
            "codex notify not set: {} holds a character cmd cannot pass",
            config.display()
        );
        return "codex".into();
    }
    let curl = if cfg!(windows) { "curl.exe" } else { "curl" };
    let config = toml_literal(&config.to_string_lossy());
    let notify = format!("notify=['{curl}','-s','-K',{config},'-X','POST','{url}','-d']");
    format!("codex -c {}", quote(syntax, &notify))
}

/// A TOML literal string; a path with an apostrophe (`O'Brien`) takes the
/// multi-line form, which may hold one.
fn toml_literal(text: &str) -> String {
    if text.contains('\'') {
        format!("'''{text}'''")
    } else {
        format!("'{text}'")
    }
}

/// Titles are typed into an interactive shell: control characters would submit or
/// cancel the line, PowerShell 5.1 drops embedded `"` before calling a native
/// program, and a trailing `\` escapes the closing quote in cmd and PowerShell.
fn clean_title(title: &str) -> String {
    let kept: String = title
        .chars()
        .filter(|c| !c.is_control() && *c != '"')
        .collect();
    kept.trim().trim_end_matches('\\').trim_end().to_string()
}

/// The registry's PATH for a new terminal, once refreshed.
fn refreshed_path() -> Option<(String, String)> {
    super::env_path::current().map(|path| ("PATH".into(), path.to_string_lossy().into_owned()))
}

pub fn build_plan(
    node_id: &str,
    spec: &SpawnSpec,
    locate: Locate,
    hooks: &AgentHooks,
) -> AppResult<SpawnPlan> {
    let cwd = PathBuf::from(&spec.cwd);
    if !cwd.is_dir() {
        let cwd = &spec.cwd;
        return Err(AppError::NotFound(tr!(
            "dossier introuvable : {cwd}",
            "folder not found: {cwd}"
        )));
    }
    let shell = resolve_shell(spec.shell, locate)?;
    let initial_input =
        agent_command(spec, shell.syntax, hooks)?.map(|command| format!("{command}\r"));
    // A profile's folder reaches this terminal only; an invalid one is refused,
    // never replaced by another account's (spec comptes §4).
    let profile_dir = match spec.claude.as_ref().and_then(|c| c.config_dir.as_deref()) {
        Some(dir) => Some((
            "CLAUDE_CONFIG_DIR".to_string(),
            crate::accounts::checked_dir(dir)?
                .to_string_lossy()
                .into_owned(),
        )),
        None => None,
    };
    Ok(SpawnPlan {
        program: shell.program,
        args: shell.args,
        cwd,
        env: vec![
            ("TERM".into(), "xterm-256color".into()),
            ("COLORTERM".into(), "truecolor".into()),
            ("OPENVIBE".into(), "1".into()),
            ("OPENVIBE_NODE_ID".into(), node_id.into()),
        ]
        .into_iter()
        .chain(refreshed_path())
        .chain(profile_dir)
        .collect(),
        env_remove: removed_env(std::env::var_os("CLAUDECODE").is_some()),
        initial_input,
        interrupt: interrupt_sequence(spec.agent),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const SESSION: &str = "0b9c4b5e-6f1a-4c39-9d2e-8f6c2d1a7e10";

    fn nothing_on_path(_: &str) -> Option<PathBuf> {
        None
    }

    fn spec(agent: Agent, claude: Option<ClaudeLaunch>) -> SpawnSpec {
        SpawnSpec {
            cwd: std::env::temp_dir().to_string_lossy().into_owned(),
            shell: ShellKind::Cmd,
            agent,
            command: String::new(),
            claude,
            ollama: None,
        }
    }

    fn claude(mode: ClaudeMode, title: &str) -> Option<ClaudeLaunch> {
        Some(ClaudeLaunch {
            mode,
            session_id: SESSION.into(),
            title: title.into(),
            role: Role::Agent,
            remote_control: None,
            model: None,
            config_dir: None,
        })
    }

    #[test]
    fn quotes_for_powershell_doubling_all_single_quote_variants() {
        assert_eq!(quote(ShellSyntax::PowerShell, "it's"), "'it''s'");
        assert_eq!(
            quote(ShellSyntax::PowerShell, "l\u{2019}api"),
            "'l\u{2019}\u{2019}api'"
        );
        assert_eq!(quote(ShellSyntax::PowerShell, "$env:PATH"), "'$env:PATH'");
    }

    #[test]
    fn quotes_for_posix_shells() {
        assert_eq!(quote(ShellSyntax::Posix, "it's"), r"'it'\''s'");
    }

    #[test]
    fn quotes_for_cmd_by_dropping_expansion_characters() {
        assert_eq!(quote(ShellSyntax::Cmd, "50% \"done\"!"), "\"50 done\"");
    }

    #[test]
    fn new_claude_session_passes_id_and_title() {
        let cmd = agent_command(
            &spec(Agent::Claude, claude(ClaudeMode::New, "Mon agent")),
            ShellSyntax::PowerShell,
            &AgentHooks::default(),
        )
        .unwrap();
        assert_eq!(
            cmd.as_deref(),
            Some("claude --session-id 0b9c4b5e-6f1a-4c39-9d2e-8f6c2d1a7e10 -n 'Mon agent'")
        );
    }

    #[test]
    fn new_claude_session_without_title_omits_name() {
        let cmd = agent_command(
            &spec(Agent::Claude, claude(ClaudeMode::New, "  ")),
            ShellSyntax::Posix,
            &AgentHooks::default(),
        )
        .unwrap();
        assert_eq!(
            cmd.as_deref(),
            Some("claude --session-id 0b9c4b5e-6f1a-4c39-9d2e-8f6c2d1a7e10")
        );
    }

    #[test]
    fn strips_control_characters_from_the_title() {
        // A carriage return would submit the line early and run the rest as a command.
        let cmd = agent_command(
            &spec(Agent::Claude, claude(ClaudeMode::New, "Fix\r del *\x03")),
            ShellSyntax::Cmd,
            &AgentHooks::default(),
        )
        .unwrap();
        assert_eq!(
            cmd.as_deref(),
            Some("claude --session-id 0b9c4b5e-6f1a-4c39-9d2e-8f6c2d1a7e10 -n \"Fix del *\"")
        );
    }

    #[test]
    fn drops_double_quotes_and_trailing_backslashes_from_the_title() {
        let cmd = agent_command(
            &spec(
                Agent::Claude,
                claude(ClaudeMode::New, "Fix \"login\" page\\"),
            ),
            ShellSyntax::PowerShell,
            &AgentHooks::default(),
        )
        .unwrap();
        assert_eq!(
            cmd.as_deref(),
            Some("claude --session-id 0b9c4b5e-6f1a-4c39-9d2e-8f6c2d1a7e10 -n 'Fix login page'")
        );
    }

    #[test]
    fn disables_msys_path_conversion_for_posix_titles() {
        // Git Bash would otherwise turn "/fix login" into "C:/Program Files/Git/fix login".
        let cmd = agent_command(
            &spec(Agent::Claude, claude(ClaudeMode::New, "/fix login")),
            ShellSyntax::Posix,
            &AgentHooks::default(),
        )
        .unwrap();
        assert_eq!(
            cmd.as_deref(),
            Some(
                "MSYS_NO_PATHCONV=1 claude --session-id 0b9c4b5e-6f1a-4c39-9d2e-8f6c2d1a7e10 -n '/fix login'"
            )
        );
    }

    #[test]
    fn a_title_of_only_control_characters_omits_the_name() {
        let cmd = agent_command(
            &spec(Agent::Claude, claude(ClaudeMode::New, "\r\n\t")),
            ShellSyntax::PowerShell,
            &AgentHooks::default(),
        )
        .unwrap();
        assert_eq!(
            cmd.as_deref(),
            Some("claude --session-id 0b9c4b5e-6f1a-4c39-9d2e-8f6c2d1a7e10")
        );
    }

    #[test]
    fn resume_and_continue_modes() {
        let resume = agent_command(
            &spec(Agent::Claude, claude(ClaudeMode::Resume, "x")),
            ShellSyntax::Cmd,
            &AgentHooks::default(),
        )
        .unwrap();
        assert_eq!(
            resume.as_deref(),
            Some("claude --resume 0b9c4b5e-6f1a-4c39-9d2e-8f6c2d1a7e10")
        );
        let cont = agent_command(
            &spec(Agent::Claude, claude(ClaudeMode::Continue, "x")),
            ShellSyntax::Cmd,
            &AgentHooks::default(),
        )
        .unwrap();
        assert_eq!(cont.as_deref(), Some("claude --continue"));
    }

    #[test]
    fn rejects_a_session_id_that_is_not_a_uuid() {
        let launch = Some(ClaudeLaunch {
            mode: ClaudeMode::Resume,
            session_id: "x; rm -rf /".into(),
            title: String::new(),
            role: Role::Agent,
            remote_control: None,
            model: None,
            config_dir: None,
        });
        let err = agent_command(
            &spec(Agent::Claude, launch),
            ShellSyntax::Posix,
            &AgentHooks::default(),
        )
        .unwrap_err();
        assert_eq!(err.kind(), "invalidInput");
        let english = crate::i18n::in_english(|| {
            agent_command(
                &spec(Agent::Claude, launch_with("x; rm -rf /")),
                ShellSyntax::Posix,
                &AgentHooks::default(),
            )
            .unwrap_err()
        });
        assert_eq!(english.to_string(), "invalid session id: x; rm -rf /");
    }

    fn launch_with(session_id: &str) -> Option<ClaudeLaunch> {
        Some(ClaudeLaunch {
            mode: ClaudeMode::Resume,
            session_id: session_id.into(),
            title: String::new(),
            role: Role::Agent,
            remote_control: None,
            model: None,
            config_dir: None,
        })
    }

    #[test]
    fn custom_preset_requires_a_command() {
        let mut s = spec(Agent::Custom, None);
        assert_eq!(
            agent_command(&s, ShellSyntax::Cmd, &AgentHooks::default())
                .unwrap_err()
                .kind(),
            "invalidInput"
        );
        s.command = "  npm run dev ".into();
        assert_eq!(
            agent_command(&s, ShellSyntax::Cmd, &AgentHooks::default())
                .unwrap()
                .as_deref(),
            Some("npm run dev")
        );
    }

    #[test]
    fn shell_preset_types_nothing() {
        assert_eq!(
            agent_command(
                &spec(Agent::Shell, None),
                ShellSyntax::Cmd,
                &AgentHooks::default()
            )
            .unwrap(),
            None
        );
    }

    #[test]
    fn plan_types_command_with_carriage_return_and_sets_env() {
        let plan = build_plan(
            "node-1",
            &spec(Agent::Aider, None),
            &nothing_on_path,
            &AgentHooks::default(),
        )
        .unwrap();
        assert_eq!(plan.program, PathBuf::from("cmd.exe"));
        assert_eq!(plan.initial_input.as_deref(), Some("aider\r"));
        assert!(
            plan.env
                .contains(&("OPENVIBE_NODE_ID".into(), "node-1".into()))
        );
        assert!(plan.env.contains(&("TERM".into(), "xterm-256color".into())));
    }

    #[test]
    fn interrupt_keys_follow_the_catalog() {
        assert_eq!(interrupt_sequence(Agent::Claude), Some(&b"\x1b"[..]));
        assert_eq!(interrupt_sequence(Agent::Opencode), Some(&b"\x1b"[..]));
        assert_eq!(interrupt_sequence(Agent::Aider), Some(&b"\x03"[..]));
        assert_eq!(interrupt_sequence(Agent::Custom), Some(&b"\x03"[..]));
        assert_eq!(interrupt_sequence(Agent::Shell), None);
        let plan = build_plan(
            "node-1",
            &spec(Agent::Codex, None),
            &nothing_on_path,
            &AgentHooks::default(),
        )
        .unwrap();
        assert_eq!(plan.interrupt, Some(&b"\x1b"[..]));
    }

    #[test]
    fn gives_claude_openvibe_s_tools_and_its_role() {
        let hooks = AgentHooks {
            claude_settings: Some(PathBuf::from(r"C:\data\hooks\n1.json")),
            mcp_config: Some(PathBuf::from(r"C:\data\mcp\n1.json")),
            system_prompt: Some(PathBuf::from(r"C:\data\mcp\n1.md")),
            ..Default::default()
        };
        assert_eq!(
            agent_command(
                &spec(Agent::Claude, claude(ClaudeMode::Resume, "")),
                ShellSyntax::PowerShell,
                &hooks
            )
            .unwrap(),
            Some(format!(
                r"claude --settings 'C:\data\hooks\n1.json' --mcp-config 'C:\data\mcp\n1.json' --append-system-prompt-file 'C:\data\mcp\n1.md' --resume {SESSION}"
            ))
        );
    }

    fn tooled() -> AgentHooks {
        AgentHooks {
            claude_settings: Some(PathBuf::from(r"C:\data\hooks\n1.json")),
            mcp_config: Some(PathBuf::from(r"C:\data\mcp\n1.json")),
            system_prompt: Some(PathBuf::from(r"C:\data\mcp\n1.md")),
            ..Default::default()
        }
    }

    #[test]
    fn an_orchestrator_needs_all_its_tools() {
        assert_eq!(orchestrator_tools(&tooled(), true), Ok(()));
        assert_eq!(
            orchestrator_tools(&AgentHooks::default(), false),
            Err("le serveur local d'OpenVibe n'a pas démarré".to_string())
        );
        for partial in [
            AgentHooks {
                claude_settings: None,
                ..tooled()
            },
            AgentHooks {
                mcp_config: None,
                ..tooled()
            },
            AgentHooks {
                system_prompt: None,
                ..tooled()
            },
        ] {
            assert_eq!(
                orchestrator_tools(&partial, true),
                Err("ses réglages n'ont pas pu être écrits (voir le journal)".to_string())
            );
        }
    }

    #[test]
    fn an_orchestrator_gets_only_openvibes_tools() {
        let mut launch = claude(ClaudeMode::New, "");
        launch.as_mut().unwrap().role = Role::Orchestrator;
        let manager = agent_command(&spec(Agent::Claude, launch), ShellSyntax::Cmd, &tooled())
            .unwrap()
            .unwrap();
        assert!(
            manager.contains(r#"--mcp-config "C:\data\mcp\n1.json" --strict-mcp-config"#),
            "{manager}"
        );
        let agent = agent_command(
            &spec(Agent::Claude, claude(ClaudeMode::New, "")),
            ShellSyntax::Cmd,
            &tooled(),
        )
        .unwrap()
        .unwrap();
        assert!(!agent.contains("--strict-mcp-config"), "{agent}");
    }

    fn hooked(settings: &str) -> AgentHooks {
        AgentHooks {
            claude_settings: Some(PathBuf::from(settings)),
            ..Default::default()
        }
    }

    #[test]
    fn claude_reports_its_state_through_its_settings_file() {
        let cmd = agent_command(
            &spec(Agent::Claude, claude(ClaudeMode::New, "Mon agent")),
            ShellSyntax::PowerShell,
            &hooked(r"C:\data\hooks\n1.json"),
        )
        .unwrap();
        assert_eq!(
            cmd.as_deref(),
            Some(
                r"claude --settings 'C:\data\hooks\n1.json' --session-id 0b9c4b5e-6f1a-4c39-9d2e-8f6c2d1a7e10 -n 'Mon agent'"
            )
        );
        let resume = agent_command(
            &spec(Agent::Claude, claude(ClaudeMode::Resume, "x")),
            ShellSyntax::Cmd,
            &hooked(r"C:\data\hooks\n1.json"),
        )
        .unwrap();
        assert_eq!(
            resume.as_deref(),
            Some(
                r#"claude --settings "C:\data\hooks\n1.json" --resume 0b9c4b5e-6f1a-4c39-9d2e-8f6c2d1a7e10"#
            )
        );
        let cont = agent_command(
            &spec(Agent::Claude, claude(ClaudeMode::Continue, "x")),
            ShellSyntax::Posix,
            &hooked("C:/hooks/n1.json"),
        )
        .unwrap();
        assert_eq!(
            cont.as_deref(),
            Some("claude --settings 'C:/hooks/n1.json' --continue")
        );
    }

    #[test]
    fn a_curl_config_under_a_name_with_an_apostrophe_stays_one_toml_string() {
        let hooks = AgentHooks {
            codex_notify: Some("http://127.0.0.1:1/hook/codex/n1".into()),
            curl_config: Some(PathBuf::from(r"C:\Users\O'Brien\curl.cfg")),
            ..Default::default()
        };
        let cmd = agent_command(&spec(Agent::Codex, None), ShellSyntax::Cmd, &hooks)
            .unwrap()
            .unwrap();
        assert!(
            cmd.contains(r"'-K','''C:\Users\O'Brien\curl.cfg''','-X'"),
            "{cmd}"
        );
    }

    #[test]
    fn codex_gets_no_hook_rather_than_a_wrong_config_path_under_cmd() {
        let hooks = AgentHooks {
            codex_notify: Some("http://127.0.0.1:1/hook/codex/n1".into()),
            curl_config: Some(PathBuf::from(r"C:\Users\100%Jean\curl.cfg")),
            ..Default::default()
        };
        let under = |syntax| {
            agent_command(&spec(Agent::Codex, None), syntax, &hooks)
                .unwrap()
                .unwrap()
        };
        assert_eq!(under(ShellSyntax::Cmd), "codex");
        // PowerShell and POSIX shells keep the path as it is.
        assert!(under(ShellSyntax::PowerShell).contains(r"100%Jean"));
    }

    #[test]
    fn codex_notifies_the_end_of_its_turns() {
        let curl = if cfg!(windows) { "curl.exe" } else { "curl" };
        let hooks = AgentHooks {
            codex_notify: Some("http://127.0.0.1:4242/hook/codex/n1".into()),
            curl_config: Some(PathBuf::from(r"C:\Users\Jean Dupont\hooks\curl.cfg")),
            ..Default::default()
        };
        let cmd = agent_command(&spec(Agent::Codex, None), ShellSyntax::Cmd, &hooks).unwrap();
        assert_eq!(
            cmd.unwrap(),
            format!(
                r#"codex -c "notify=['{curl}','-s','-K','C:\Users\Jean Dupont\hooks\curl.cfg','-X','POST','http://127.0.0.1:4242/hook/codex/n1','-d']""#
            )
        );
        let plain = agent_command(
            &spec(Agent::Codex, None),
            ShellSyntax::Cmd,
            &AgentHooks::default(),
        )
        .unwrap();
        assert_eq!(plain.as_deref(), Some("codex"));
    }

    #[test]
    fn a_profile_s_folder_becomes_this_terminal_s_claude_config_dir_only() {
        let folder = tempfile::tempdir().unwrap();
        let launch = |dir: Option<String>| {
            let mut launch = claude(ClaudeMode::New, "");
            launch.as_mut().unwrap().config_dir = dir;
            spec(Agent::Claude, launch)
        };
        let plan = |s: &SpawnSpec| build_plan("n", s, &nothing_on_path, &AgentHooks::default());
        let with = plan(&launch(Some(folder.path().to_string_lossy().into_owned()))).unwrap();
        assert!(
            with.env
                .iter()
                .any(|(k, v)| k == "CLAUDE_CONFIG_DIR" && v == &folder.path().to_string_lossy())
        );
        let without = plan(&launch(None)).unwrap();
        assert!(without.env.iter().all(|(k, _)| k != "CLAUDE_CONFIG_DIR"));
        // An invalid folder refuses the start rather than falling back to another account.
        assert!(plan(&launch(Some("relative/dir".into()))).is_err());
        assert!(plan(&launch(Some("C:/a/../b".into()))).is_err());
    }

    #[test]
    fn terminals_do_not_inherit_claude_code_session_markers() {
        let plan = build_plan(
            "node-1",
            &spec(Agent::Shell, None),
            &nothing_on_path,
            &AgentHooks::default(),
        )
        .unwrap();
        for marker in INHERITED_MARKERS {
            assert!(plan.env_remove.iter().any(|key| key == marker), "{marker}");
        }
    }

    #[test]
    fn inside_claude_code_its_session_variables_stay_behind() {
        let outside = removed_env(false);
        assert_eq!(outside.len(), INHERITED_MARKERS.len());
        assert!(!outside.contains(&"GIT_EDITOR".to_string()));
        let inside = removed_env(true);
        for key in INHERITED_MARKERS.iter().chain(CLAUDE_SESSION_EXTRAS.iter()) {
            assert!(inside.contains(&key.to_string()), "{key}");
        }
        for key in [
            "CLAUDE_CODE_SSE_PORT",
            "CLAUDE_CODE_SESSION_ATTENDED",
            "CLAUDE_CODE_EXECPATH",
            "CLAUDE_PID",
            "CLAUDE_EFFORT",
            "AI_AGENT",
            "GIT_EDITOR",
            "NoDefaultCurrentDirectoryInExePath",
        ] {
            assert!(inside.contains(&key.to_string()), "{key}");
        }
    }

    #[test]
    fn plan_rejects_missing_working_directory() {
        let mut s = spec(Agent::Shell, None);
        s.cwd = "Z:/definitely/not/here".into();
        assert_eq!(
            build_plan("n", &s, &nothing_on_path, &AgentHooks::default())
                .unwrap_err()
                .kind(),
            "notFound"
        );
        let english = crate::i18n::in_english(|| {
            build_plan("n", &s, &nothing_on_path, &AgentHooks::default()).unwrap_err()
        });
        assert_eq!(
            english.to_string(),
            "folder not found: Z:/definitely/not/here"
        );
    }

    #[test]
    fn pwsh_must_be_on_path() {
        assert_eq!(
            resolve_shell(ShellKind::Pwsh, &nothing_on_path)
                .unwrap_err()
                .kind(),
            "notFound"
        );
        let found = resolve_shell(ShellKind::Pwsh, &|_| {
            Some(PathBuf::from("C:/pwsh/pwsh.exe"))
        })
        .unwrap();
        assert_eq!(found.syntax, ShellSyntax::PowerShell);
        assert_eq!(found.args, vec!["-NoLogo".to_string()]);
    }

    #[test]
    fn finds_git_bash_from_either_git_location() {
        let root = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(root.path().join("bin")).unwrap();
        std::fs::write(root.path().join("bin").join("bash.exe"), b"").unwrap();
        let expected = Some(root.path().join("bin").join("bash.exe"));
        assert_eq!(
            find_git_bash(&root.path().join("cmd").join("git.exe")),
            expected
        );
        assert_eq!(
            find_git_bash(&root.path().join("mingw64").join("bin").join("git.exe")),
            expected
        );
        assert_eq!(find_git_bash(Path::new("C:/nowhere/git.exe")), None);
    }

    #[test]
    fn deserializes_spawn_spec_from_frontend_json() {
        let json = serde_json::json!({
            "cwd": "C:/code", "shell": "gitbash", "preset": "claude", "command": "",
            "claude": { "mode": "resume", "sessionId": SESSION, "title": "t" }
        });
        let s: SpawnSpec = serde_json::from_value(json).unwrap();
        assert_eq!(s.shell, ShellKind::GitBash);
        assert_eq!(s.claude.unwrap().mode, ClaudeMode::Resume);
    }

    #[test]
    fn starts_remote_control_last_under_the_agent_s_name() {
        let with_remote = |mode, title: &str, name: &str| {
            let mut launch = claude(mode, title);
            launch.as_mut().unwrap().remote_control = Some(name.into());
            agent_command(
                &spec(Agent::Claude, launch),
                ShellSyntax::PowerShell,
                &AgentHooks::default(),
            )
            .unwrap()
            .unwrap()
        };
        assert_eq!(
            with_remote(ClaudeMode::New, "Mon agent", "Isis"),
            format!("claude --session-id {SESSION} -n 'Mon agent' --remote-control 'Isis'")
        );
        assert_eq!(
            with_remote(ClaudeMode::Resume, "", "Isis"),
            format!("claude --resume {SESSION} --remote-control 'Isis'")
        );
        // Without a name, the flag ends the line: it takes no argument of the command for one.
        assert_eq!(
            with_remote(ClaudeMode::Continue, "", " \"\n"),
            "claude --continue --remote-control"
        );
    }

    #[test]
    fn starts_claude_on_the_model_the_router_chose() {
        let with_model = |mode, model: &str| {
            let mut launch = claude(mode, "");
            launch.as_mut().unwrap().model = Some(model.into());
            agent_command(
                &spec(Agent::Claude, launch),
                ShellSyntax::PowerShell,
                &AgentHooks::default(),
            )
        };
        assert_eq!(
            with_model(ClaudeMode::New, "claude-haiku-5-5")
                .unwrap()
                .unwrap(),
            format!("claude --model 'claude-haiku-5-5' --session-id {SESSION}")
        );
        assert_eq!(
            with_model(ClaudeMode::Continue, "sonnet[1m]")
                .unwrap()
                .unwrap(),
            "claude --model 'sonnet[1m]' --continue"
        );
        // Typed into a shell: anything but a model's name is refused.
        assert_eq!(
            with_model(ClaudeMode::New, "opus; rm -rf /")
                .unwrap_err()
                .kind(),
            "invalidInput"
        );
        // Nor a name that would read as a flag, nor an endless one.
        for bad in ["--dangerous", "-x", ".hidden", &"a".repeat(65)] {
            assert_eq!(
                with_model(ClaudeMode::New, bad).unwrap_err().kind(),
                "invalidInput",
                "{bad}"
            );
        }
    }

    #[test]
    fn reads_remote_control_of_a_claude_session_off_by_default() {
        let launch =
            |claude: serde_json::Value| -> ClaudeLaunch { serde_json::from_value(claude).unwrap() };
        assert_eq!(
            launch(serde_json::json!({ "mode": "new", "sessionId": SESSION, "title": "t", "remoteControl": "Isis" }))
                .remote_control
                .as_deref(),
            Some("Isis")
        );
        assert_eq!(
            launch(serde_json::json!({ "mode": "new", "sessionId": SESSION, "title": "t" }))
                .remote_control,
            None
        );
    }

    #[test]
    fn reads_the_role_of_a_claude_session_an_agent_by_default() {
        let spec = |claude: serde_json::Value| -> SpawnSpec {
            serde_json::from_value(serde_json::json!({
                "cwd": "C:/code", "shell": "cmd", "agent": "claude", "command": "", "claude": claude
            }))
            .unwrap()
        };
        let orchestrator = spec(
            serde_json::json!({ "mode": "new", "sessionId": SESSION, "title": "t", "role": "orchestrator" }),
        );
        assert_eq!(orchestrator.claude.unwrap().role, Role::Orchestrator);
        let older = spec(serde_json::json!({ "mode": "new", "sessionId": SESSION, "title": "t" }));
        assert_eq!(older.claude.unwrap().role, Role::Agent);
    }

    #[test]
    fn each_agent_types_its_own_command() {
        let agents = [
            (Agent::Codex, "codex"),
            (Agent::Gemini, "gemini"),
            (Agent::Qwen, "qwen"),
            (Agent::Cursor, "cursor-agent"),
            (Agent::Opencode, "opencode"),
            (Agent::Aider, "aider"),
        ];
        for (agent, command) in agents {
            assert_eq!(
                agent_command(
                    &spec(agent, None),
                    ShellSyntax::PowerShell,
                    &AgentHooks::default()
                )
                .unwrap()
                .as_deref(),
                Some(command)
            );
        }
    }

    #[test]
    fn ollama_runs_a_model_in_chat_or_through_aider() {
        let mut s = spec(Agent::Ollama, None);
        s.ollama = Some(OllamaLaunch {
            model: "qwen2.5-coder:7b".into(),
            mode: OllamaMode::Chat,
        });
        assert_eq!(
            agent_command(&s, ShellSyntax::PowerShell, &AgentHooks::default())
                .unwrap()
                .as_deref(),
            Some("ollama run 'qwen2.5-coder:7b'")
        );
        s.ollama = Some(OllamaLaunch {
            model: "qwen2.5-coder:7b".into(),
            mode: OllamaMode::Code,
        });
        assert_eq!(
            agent_command(&s, ShellSyntax::Cmd, &AgentHooks::default())
                .unwrap()
                .as_deref(),
            Some("aider --model \"ollama_chat/qwen2.5-coder:7b\"")
        );
    }

    #[test]
    fn rejects_a_missing_or_unsafe_ollama_model() {
        let mut s = spec(Agent::Ollama, None);
        assert_eq!(
            agent_command(&s, ShellSyntax::Cmd, &AgentHooks::default())
                .unwrap_err()
                .kind(),
            "invalidInput"
        );
        s.ollama = Some(OllamaLaunch {
            model: "llama3 & del *".into(),
            mode: OllamaMode::Chat,
        });
        assert_eq!(
            agent_command(&s, ShellSyntax::Cmd, &AgentHooks::default())
                .unwrap_err()
                .kind(),
            "invalidInput"
        );
    }

    #[test]
    fn deserializes_the_agent_and_its_ollama_options() {
        let json = serde_json::json!({
            "cwd": "C:/code", "shell": "cmd", "agent": "ollama", "command": "",
            "ollama": { "model": "llama3", "mode": "code" }
        });
        let s: SpawnSpec = serde_json::from_value(json).unwrap();
        assert_eq!(s.agent, Agent::Ollama);
        assert_eq!(s.ollama.unwrap().mode, OllamaMode::Code);
    }

    #[test]
    fn locates_a_binary_in_a_given_path() {
        let dir = tempfile::tempdir().unwrap();
        let name = if cfg!(windows) {
            "fake-agent.exe"
        } else {
            "fake-agent"
        };
        let file = dir.path().join(name);
        std::fs::write(&file, "").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
        let path = std::env::join_paths([std::path::Path::new("nowhere"), dir.path()]).unwrap();
        assert_eq!(locate_in("fake-agent", &path), Some(file));
        assert_eq!(locate_in("other-agent", &path), None);
    }
}
