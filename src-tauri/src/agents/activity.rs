//! Agent activity (spec habillage §10.2): working, waiting for the user or
//! idle, from the agents' hooks first, else from their terminal's output.

use std::collections::HashMap;
use std::str::Chars;
use std::time::{Duration, Instant};

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Activity {
    Idle,
    Working,
    Waiting,
}

/// Without hooks, output in the last 1.5 s means the agent works.
pub const QUIET_AFTER: Duration = Duration::from_millis(1500);
/// A hooked agent left working this long without output lost its `Stop` hook.
pub const HOOK_SAFETY_NET: Duration = Duration::from_secs(30);

/// Claude's hooks report every transition, so they replace the output
/// heuristic; Codex only reports the end of a turn.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HookSource {
    Claude,
    Codex,
    /// Gemini CLI's hooks (BeforeAgent, AfterAgent, Notification) report like Claude's.
    Gemini,
}

/// A terminal's new activity, and since when.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Change {
    pub node_id: String,
    pub activity: Activity,
    pub since: Instant,
    /// What it waits for, while it waits.
    pub message: Option<String>,
}

struct Node {
    activity: Activity,
    since: Instant,
    message: Option<String>,
    last_output: Option<Instant>,
    hooked: bool,
    /// When the user typed while a hooked agent worked or waited. No hook
    /// reports the answer to a permission prompt (a refusal fires neither
    /// `Stop` nor `PermissionDenied`), so the output decides until the next hook.
    answered: Option<Instant>,
    /// The last keystroke: the echo that follows it is not work.
    last_key: Option<Instant>,
}

/// Output this soon after a keystroke is the terminal echoing it back.
pub const ECHO_WINDOW: Duration = Duration::from_millis(200);

/// The activity of every running terminal.
#[derive(Default)]
pub struct Tracker {
    nodes: HashMap<String, Node>,
}

impl Tracker {
    /// A process just started: idle until it shows otherwise.
    pub fn start(&mut self, node_id: &str, now: Instant) -> Change {
        self.nodes.insert(
            node_id.to_string(),
            Node {
                activity: Activity::Idle,
                since: now,
                message: None,
                last_output: None,
                hooked: false,
                answered: None,
                last_key: None,
            },
        );
        change(node_id, Activity::Idle, now)
    }

    /// The terminal printed something. Returns a change only when the
    /// activity changes, not for every chunk read.
    pub fn output(&mut self, node_id: &str, now: Instant) -> Option<Change> {
        let node = self.nodes.get_mut(node_id)?;
        // The echo of a keystroke (and the redraw it causes) is not work: it
        // counts neither as activity nor as keeping a working terminal busy.
        // A hooked agent's output after an answer is real: only plain
        // terminals (Shell, Codex, Gemini...) are filtered.
        if !node.hooked
            && node
                .last_key
                .is_some_and(|key| now.saturating_duration_since(key) < ECHO_WINDOW)
        {
            return None;
        }
        node.last_output = Some(now);
        if node.hooked && node.answered.is_none() {
            return None;
        }
        set(node_id, node, Activity::Working, now)
    }

    /// The user typed in the terminal. An answer to a hooked agent hands it
    /// to its output until the next hook: it works, and 1.5 s of quiet makes
    /// it idle. Moving through a dialog answers nothing; at the prompt only
    /// Enter sends something (typing there just echoes).
    pub fn input(&mut self, node_id: &str, data: &[u8], now: Instant) -> Option<Change> {
        let node = self.nodes.get_mut(node_id)?;
        if !is_keystroke(data) {
            return None;
        }
        node.last_key = Some(now);
        if !node.hooked {
            return None;
        }
        let answers = match node.activity {
            Activity::Waiting => !is_navigation(data),
            Activity::Working => true,
            Activity::Idle => data.contains(&b'\r'),
        };
        if !answers {
            return None;
        }
        node.answered = Some(now);
        set(node_id, node, Activity::Working, now)
    }

    /// Claude ended its session; its shell lives on, and the output decides again.
    pub fn session_end(&mut self, node_id: &str, now: Instant) -> Option<Change> {
        let node = self.nodes.get_mut(node_id)?;
        node.hooked = false;
        node.answered = None;
        set(node_id, node, Activity::Idle, now)
    }

    pub fn hook(
        &mut self,
        node_id: &str,
        source: HookSource,
        activity: Activity,
        now: Instant,
        message: Option<String>,
    ) -> Option<Change> {
        let node = self.nodes.get_mut(node_id)?;
        if matches!(source, HookSource::Claude | HookSource::Gemini) {
            node.hooked = true;
        }
        node.answered = None;
        let message = message.filter(|_| activity == Activity::Waiting);
        let still_waiting = activity == Activity::Waiting && node.activity == Activity::Waiting;
        if still_waiting && node.message != message {
            // A new question, not a new wait: `since` keeps the agent's place.
            node.message = message;
            return Some(change_of(node_id, node));
        }
        node.message = message;
        set(node_id, node, activity, now)
    }

    /// Working terminals that went quiet become idle: after 1.5 s without
    /// hooks or since an answer, after 30 s with them (safety net for a lost `Stop`).
    pub fn tick(&mut self, now: Instant) -> Vec<Change> {
        let mut changes = Vec::new();
        for (node_id, node) in &mut self.nodes {
            if node.activity != Activity::Working {
                continue;
            }
            let last = [node.last_output, node.answered]
                .into_iter()
                .flatten()
                .fold(node.since, Instant::max);
            let limit = if node.hooked && node.answered.is_none() {
                HOOK_SAFETY_NET
            } else {
                QUIET_AFTER
            };
            if now.saturating_duration_since(last) >= limit {
                node.activity = Activity::Idle;
                node.since = now;
                node.answered = None;
                changes.push(change(node_id, Activity::Idle, now));
            }
        }
        changes
    }

    pub fn remove(&mut self, node_id: &str) {
        self.nodes.remove(node_id);
    }

    pub fn snapshot(&self) -> Vec<Change> {
        self.nodes
            .iter()
            .map(|(node_id, node)| change_of(node_id, node))
            .collect()
    }
}

fn change(node_id: &str, activity: Activity, since: Instant) -> Change {
    Change {
        node_id: node_id.to_string(),
        activity,
        since,
        message: None,
    }
}

fn change_of(node_id: &str, node: &Node) -> Change {
    Change {
        message: node.message.clone(),
        ..change(node_id, node.activity, node.since)
    }
}

fn set(node_id: &str, node: &mut Node, activity: Activity, now: Instant) -> Option<Change> {
    if activity != Activity::Waiting {
        node.message = None;
    }
    if node.activity == activity {
        return None;
    }
    node.activity = activity;
    node.since = now;
    Some(change_of(node_id, node))
}

/// The longest preview of a question, in characters (spec notification §7).
pub const MAX_MESSAGE_CHARS: usize = 140;

/// Skips what follows an ESC: a CSI, an OSC up to its end, or one character.
fn skip_escape(chars: &mut Chars) {
    match chars.next() {
        Some('[') => skip_csi(chars),
        Some(']') => {
            for c in chars.by_ref() {
                if c == '\u{7}' || c == '\\' {
                    break;
                }
            }
        }
        _ => {}
    }
}

fn skip_csi(chars: &mut Chars) {
    for c in chars.by_ref() {
        if ('@'..='~').contains(&c) {
            break;
        }
    }
}

/// Invisible, yet able to reorder or disguise the text around them.
fn is_hidden(c: char) -> bool {
    matches!(
        c,
        '\u{ad}'
            | '\u{61c}'
            | '\u{200b}'..='\u{200f}'
            | '\u{202a}'..='\u{202e}'
            | '\u{2060}'..='\u{2064}'
            | '\u{2066}'..='\u{2069}'
            | '\u{feff}'
    )
}

/// An agent's message as one line of plain text, capped; `None` when nothing
/// readable is left. Its origin is not documented and it may quote a tool's
/// name, so it is untrusted (spec notification §7).
pub fn clean_message(raw: &str) -> Option<String> {
    let mut text = String::with_capacity(raw.len());
    let mut chars = raw.chars();
    while let Some(c) = chars.next() {
        match c {
            '\u{1b}' => skip_escape(&mut chars),
            '\u{9b}' => skip_csi(&mut chars),
            '\n' | '\r' | '\t' => text.push(' '),
            c if c.is_control() || is_hidden(c) => {}
            c => text.push(c),
        }
    }
    let line = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if line.is_empty() {
        return None;
    }
    if line.chars().count() <= MAX_MESSAGE_CHARS {
        return Some(line);
    }
    let cut: String = line.chars().take(MAX_MESSAGE_CHARS - 1).collect();
    Some(format!("{}…", cut.trim_end()))
}

/// Claude's hook events (spec §10.2), from `hook_event_name` and `notification_type`.
pub fn claude_activity(event: &str, notification_type: Option<&str>) -> Option<Activity> {
    match event {
        "UserPromptSubmit" | "PostToolUse" => Some(Activity::Working),
        "Stop" | "StopFailure" => Some(Activity::Idle),
        "Notification" => match notification_type? {
            "permission_prompt"
            | "elicitation_dialog"
            | "elicitation_url_dialog"
            | "agent_needs_input" => Some(Activity::Waiting),
            "idle_prompt" => Some(Activity::Idle),
            _ => None,
        },
        _ => None,
    }
}

/// Gemini CLI's hook events, as its hooks reference lists them: `BeforeAgent`
/// (a prompt was submitted), `AfterAgent` (the turn ended) and a `Notification`
/// of type `ToolPermission` (it asks to run a tool).
pub fn gemini_activity(event: &str, notification_type: Option<&str>) -> Option<Activity> {
    match event {
        "BeforeAgent" => Some(Activity::Working),
        "AfterAgent" => Some(Activity::Idle),
        "Notification" => (notification_type? == "ToolPermission").then_some(Activity::Waiting),
        _ => None,
    }
}

/// `SessionEnd`, except `/clear`, which goes on in the same process.
pub fn claude_session_ended(event: &str, reason: Option<&str>) -> bool {
    event == "SessionEnd" && reason != Some("clear")
}

/// What xterm sends on its own (focus changes, mouse reports) is not the
/// user answering.
fn is_keystroke(data: &[u8]) -> bool {
    !(data == b"\x1b[I"
        || data == b"\x1b[O"
        || data.starts_with(b"\x1b[<")
        || data.starts_with(b"\x1b[M")
        || is_terminal_reply(data))
}

/// What xterm answers to the program's queries: device attributes
/// (`ESC [ ? … c`, `ESC [ > … c`), mode reports (`… $ y`), status reports
/// (`ESC [ 0 n`), the cursor position (`ESC [ row ; col R`) and the strings
/// of OSC (`ESC ]`) and DCS (`ESC P`) replies. A cursor position that looks
/// like a modified F3 (`ESC [ 1 ; 2 R`) is read as the reply.
fn is_terminal_reply(data: &[u8]) -> bool {
    let Some(rest) = data.strip_prefix(b"\x1b") else {
        return false;
    };
    match rest {
        [b']' | b'P', ..] => true,
        [b'[', b'?' | b'>' | b'=', ..] => true,
        [b'[', params @ ..] => {
            let digits = |bytes: &[u8]| !bytes.is_empty() && bytes.iter().all(u8::is_ascii_digit);
            match params {
                [body @ .., b'$', b'y'] => body.iter().all(|b| b.is_ascii_digit() || *b == b';'),
                [body @ .., b'n'] => digits(body),
                [body @ .., b'R'] => {
                    let mut parts = body.splitn(2, |b| *b == b';');
                    matches!((parts.next(), parts.next()), (Some(row), Some(col)) if digits(row) && digits(col))
                }
                _ => false,
            }
        }
        _ => false,
    }
}

/// Arrows, Tab, Shift+Tab, and the page, home and end keys move through a
/// dialog's choices.
fn is_navigation(data: &[u8]) -> bool {
    match data {
        b"\t" | b"\x1b[Z" => true,
        [0x1b, b'[' | b'O', key] => b"ABCDHF".contains(key),
        [0x1b, b'[', digits @ .., b'~'] => digits.iter().all(u8::is_ascii_digit),
        _ => false,
    }
}

/// The type of Codex's `notify` payload that ends a turn.
pub fn codex_activity(kind: &str) -> Option<Activity> {
    (kind == "agent-turn-complete").then_some(Activity::Idle)
}

#[cfg(test)]
mod tests {
    use std::time::{Duration, Instant};

    use super::*;

    fn ms(n: u64) -> Duration {
        Duration::from_millis(n)
    }

    fn started(t0: Instant) -> Tracker {
        let mut tracker = Tracker::default();
        tracker.start("a", t0);
        tracker
    }

    fn waiting(tracker: &mut Tracker, message: Option<&str>, at: Instant) -> Option<Change> {
        tracker.hook(
            "a",
            HookSource::Claude,
            Activity::Waiting,
            at,
            message.map(str::to_string),
        )
    }

    #[test]
    fn a_wait_carries_its_message_in_the_change_and_the_snapshot() {
        let t0 = Instant::now();
        let mut tracker = started(t0);
        let change = waiting(&mut tracker, Some("May I run tests?"), t0).unwrap();
        assert_eq!(change.message.as_deref(), Some("May I run tests?"));
        assert_eq!(
            tracker.snapshot()[0].message.as_deref(),
            Some("May I run tests?")
        );
    }

    #[test]
    fn the_message_goes_when_the_wait_ends() {
        let t0 = Instant::now();
        let mut tracker = started(t0);
        waiting(&mut tracker, Some("May I?"), t0);
        let change = tracker
            .hook("a", HookSource::Claude, Activity::Working, t0, None)
            .unwrap();
        assert_eq!(change.message, None);
        assert_eq!(tracker.snapshot()[0].message, None);

        waiting(&mut tracker, Some("May I?"), t0);
        let answered = tracker.input("a", b"y", t0 + ms(10)).unwrap();
        assert_eq!(answered.message, None);

        waiting(&mut tracker, Some("May I?"), t0);
        let ended = tracker.session_end("a", t0 + ms(20)).unwrap();
        assert_eq!(ended.message, None);
    }

    #[test]
    fn a_new_message_during_a_wait_replaces_the_old_one_and_keeps_its_place() {
        let t0 = Instant::now();
        let mut tracker = started(t0);
        let first = waiting(&mut tracker, Some("First?"), t0).unwrap();
        let second = waiting(&mut tracker, Some("Second?"), t0 + ms(500)).unwrap();
        assert_eq!(second.activity, Activity::Waiting);
        assert_eq!(second.message.as_deref(), Some("Second?"));
        assert_eq!(second.since, first.since);
    }

    #[test]
    fn a_wait_without_a_message_never_keeps_a_stale_one() {
        let t0 = Instant::now();
        let mut tracker = started(t0);
        waiting(&mut tracker, Some("Old?"), t0);
        let cleared = waiting(&mut tracker, None, t0 + ms(500)).unwrap();
        assert_eq!(cleared.message, None);
    }

    #[test]
    fn the_same_message_again_changes_nothing() {
        let t0 = Instant::now();
        let mut tracker = started(t0);
        waiting(&mut tracker, Some("Same?"), t0);
        assert_eq!(waiting(&mut tracker, Some("Same?"), t0 + ms(500)), None);
        assert_eq!(tracker.snapshot()[0].message.as_deref(), Some("Same?"));
    }

    #[test]
    fn only_a_wait_has_a_message() {
        let t0 = Instant::now();
        let mut tracker = started(t0);
        let change = tracker
            .hook(
                "a",
                HookSource::Claude,
                Activity::Working,
                t0,
                Some("Stray".to_string()),
            )
            .unwrap();
        assert_eq!(change.message, None);
    }

    #[test]
    fn cleans_a_message_down_to_one_line_of_plain_text() {
        assert_eq!(
            clean_message("  Claude needs\n\tyour  permission\r\n").as_deref(),
            Some("Claude needs your permission")
        );
    }

    #[test]
    fn strips_terminal_escapes_and_controls_from_a_message() {
        assert_eq!(
            clean_message("\u{1b}[31mred\u{1b}[0m text").as_deref(),
            Some("red text")
        );
        assert_eq!(
            clean_message("\u{9b}1;31mred").as_deref(),
            Some("red"),
            "the one-character form of the same sequence"
        );
        assert_eq!(
            clean_message("a\u{1b}]0;fake title\u{7}b").as_deref(),
            Some("ab")
        );
        assert_eq!(
            clean_message("a\u{1b}]8;;http://x\u{1b}\\b").as_deref(),
            Some("ab")
        );
        assert_eq!(
            clean_message("bell\u{7}\u{0}\u{8}").as_deref(),
            Some("bell")
        );
    }

    #[test]
    fn strips_what_can_disguise_a_message() {
        // Right-to-left override: « rm -rf » could read as something harmless.
        assert_eq!(
            clean_message("run \u{202e}fr- mr\u{202c} now").as_deref(),
            Some("run fr- mr now")
        );
        assert_eq!(
            clean_message("in\u{200b}vis\u{2060}ible\u{feff}\u{ad}").as_deref(),
            Some("invisible")
        );
        assert_eq!(clean_message("a\u{2067}b\u{2069}c").as_deref(), Some("abc"));
    }

    #[test]
    fn keeps_a_message_s_text_as_it_is_otherwise() {
        assert_eq!(
            clean_message("Autoriser <b>été</b> & \"Bash\" ? 日本語").as_deref(),
            Some("Autoriser <b>été</b> & \"Bash\" ? 日本語")
        );
    }

    #[test]
    fn caps_a_message_on_a_character_boundary() {
        let long = "é".repeat(MAX_MESSAGE_CHARS + 50);
        let capped = clean_message(&long).unwrap();
        assert_eq!(capped.chars().count(), MAX_MESSAGE_CHARS);
        assert!(capped.ends_with('…'));
        let exact = "x".repeat(MAX_MESSAGE_CHARS);
        assert_eq!(clean_message(&exact).as_deref(), Some(exact.as_str()));
    }

    #[test]
    fn nothing_readable_is_no_message() {
        for raw in [
            "",
            "   \n\t",
            "\u{1b}[31m\u{1b}[0m",
            "\u{200b}\u{202e}",
            "\u{1b}]0;unterminated",
        ] {
            assert_eq!(clean_message(raw), None, "{raw:?}");
        }
    }

    #[test]
    fn output_makes_an_agent_without_hooks_work_then_quiet_makes_it_idle() {
        let t0 = Instant::now();
        let mut tracker = started(t0);
        let change = tracker.output("a", t0 + ms(10)).unwrap();
        assert_eq!(change.activity, Activity::Working);
        assert_eq!(tracker.output("a", t0 + ms(500)), None);
        assert!(tracker.tick(t0 + ms(1900)).is_empty());
        let idle = tracker.tick(t0 + ms(2000));
        assert_eq!(idle.len(), 1);
        assert_eq!(
            (idle[0].node_id.as_str(), idle[0].activity),
            ("a", Activity::Idle)
        );
    }

    #[test]
    fn the_echo_of_a_keystroke_is_not_work() {
        let t0 = Instant::now();
        let mut tracker = started(t0);
        tracker.input("a", b"l", t0 + ms(10));
        // The shell echoes the key, then redraws: nothing lights up.
        assert_eq!(tracker.output("a", t0 + ms(20)), None);
        assert_eq!(tracker.output("a", t0 + ms(150)), None);
        assert!(tracker.tick(t0 + ms(3000)).is_empty());
        // Output that follows no keystroke still counts.
        let working = tracker.output("a", t0 + ms(400)).unwrap();
        assert_eq!(working.activity, Activity::Working);
    }

    #[test]
    fn claude_hooks_replace_the_output_heuristic() {
        let t0 = Instant::now();
        let mut tracker = started(t0);
        let working = tracker
            .hook("a", HookSource::Claude, Activity::Working, t0, None)
            .unwrap();
        assert_eq!(working.activity, Activity::Working);
        // Output no longer decides, and short silences keep it working.
        assert_eq!(tracker.output("a", t0 + ms(100)), None);
        assert!(tracker.tick(t0 + ms(5000)).is_empty());
        let waiting = tracker
            .hook(
                "a",
                HookSource::Claude,
                Activity::Waiting,
                t0 + ms(6000),
                None,
            )
            .unwrap();
        assert_eq!(waiting.activity, Activity::Waiting);
        assert!(tracker.tick(t0 + ms(60_000)).is_empty());
        let idle = tracker
            .hook(
                "a",
                HookSource::Claude,
                Activity::Idle,
                t0 + ms(61_000),
                None,
            )
            .unwrap();
        assert_eq!(idle.activity, Activity::Idle);
        assert_eq!(tracker.output("a", t0 + ms(61_100)), None);
    }

    #[test]
    fn a_lost_stop_hook_ends_in_idle_after_thirty_seconds_without_output() {
        let t0 = Instant::now();
        let mut tracker = started(t0);
        tracker.hook("a", HookSource::Claude, Activity::Working, t0, None);
        tracker.output("a", t0 + ms(20_000));
        assert!(tracker.tick(t0 + ms(49_000)).is_empty());
        let idle = tracker.tick(t0 + ms(50_000));
        assert_eq!(idle[0].activity, Activity::Idle);
    }

    #[test]
    fn an_answer_to_a_waiting_agent_makes_it_work_until_its_output_stops() {
        let t0 = Instant::now();
        let mut tracker = started(t0);
        tracker.hook("a", HookSource::Claude, Activity::Waiting, t0, None);
        let working = tracker.input("a", b"\x1b", t0 + ms(10_000)).unwrap();
        assert_eq!(working.activity, Activity::Working);
        assert_eq!(tracker.output("a", t0 + ms(10_100)), None);
        assert!(tracker.tick(t0 + ms(11_500)).is_empty());
        let idle = tracker.tick(t0 + ms(11_600));
        assert_eq!(idle[0].activity, Activity::Idle);
        // Back at its prompt: typing there does not make it work.
        assert_eq!(tracker.output("a", t0 + ms(12_000)), None);
        assert!(tracker.tick(t0 + ms(14_000)).is_empty());
    }

    #[test]
    fn an_answer_before_the_permission_notification_also_ends_on_quiet() {
        // `permission_prompt` comes after about 6 s: a quick refusal finds the agent working.
        let t0 = Instant::now();
        let mut tracker = started(t0);
        tracker.hook("a", HookSource::Claude, Activity::Working, t0, None);
        assert_eq!(tracker.input("a", b"\x1b", t0 + ms(3000)), None);
        assert!(tracker.tick(t0 + ms(4400)).is_empty());
        assert_eq!(tracker.tick(t0 + ms(4500))[0].activity, Activity::Idle);
    }

    #[test]
    fn the_next_hook_after_an_answer_restores_the_safety_net() {
        let t0 = Instant::now();
        let mut tracker = started(t0);
        tracker.hook("a", HookSource::Claude, Activity::Waiting, t0, None);
        tracker.input("a", b"1", t0 + ms(1000));
        tracker.hook(
            "a",
            HookSource::Claude,
            Activity::Working,
            t0 + ms(1200),
            None,
        );
        assert!(tracker.tick(t0 + ms(20_000)).is_empty());
    }

    #[test]
    fn keystrokes_at_the_prompt_or_without_hooks_change_nothing() {
        let t0 = Instant::now();
        let mut tracker = started(t0);
        assert_eq!(tracker.input("a", b"x", t0), None);
        tracker.hook("a", HookSource::Claude, Activity::Idle, t0 + ms(100), None);
        assert_eq!(tracker.input("a", b"x", t0 + ms(200)), None);
        assert!(tracker.tick(t0 + ms(5000)).is_empty());
        assert_eq!(tracker.input("zzz", b"\r", t0), None);
    }

    #[test]
    fn moving_through_a_dialog_keeps_the_agent_waiting() {
        let t0 = Instant::now();
        let mut tracker = started(t0);
        tracker.hook("a", HookSource::Claude, Activity::Waiting, t0, None);
        for key in [
            &b"\x1b[B"[..],
            b"\x1bOA",
            b"\t",
            b"\x1b[Z",
            b"\x1b[6~",
            b"\x1b[I",
        ] {
            assert_eq!(tracker.input("a", key, t0 + ms(100)), None, "{key:?}");
        }
        assert!(tracker.tick(t0 + ms(10_000)).is_empty());
        assert_eq!(tracker.snapshot()[0].activity, Activity::Waiting);
    }

    #[test]
    fn enter_after_a_quiet_answer_makes_the_agent_work_again() {
        // A form filled in slowly: the agent went idle between two keys.
        let t0 = Instant::now();
        let mut tracker = started(t0);
        tracker.hook("a", HookSource::Claude, Activity::Waiting, t0, None);
        tracker.input("a", b"y", t0 + ms(1000));
        assert_eq!(tracker.tick(t0 + ms(2500))[0].activity, Activity::Idle);
        assert_eq!(tracker.input("a", b"e", t0 + ms(3000)), None);
        let working = tracker.input("a", b"\r", t0 + ms(4000)).unwrap();
        assert_eq!(working.activity, Activity::Working);
        assert_eq!(tracker.output("a", t0 + ms(5000)), None);
        assert!(tracker.tick(t0 + ms(6400)).is_empty());
    }

    #[test]
    fn enter_at_the_prompt_hands_the_agent_to_its_output_until_the_next_hook() {
        // `/compact` and other commands without hooks: the output decides.
        let t0 = Instant::now();
        let mut tracker = started(t0);
        tracker.hook("a", HookSource::Claude, Activity::Idle, t0, None);
        let working = tracker.input("a", b"\r", t0 + ms(100)).unwrap();
        assert_eq!(working.activity, Activity::Working);
        tracker.output("a", t0 + ms(1000));
        assert!(tracker.tick(t0 + ms(2400)).is_empty());
        assert_eq!(tracker.tick(t0 + ms(2500))[0].activity, Activity::Idle);
    }

    #[test]
    fn the_end_of_a_claude_session_hands_its_shell_back_to_the_output() {
        let t0 = Instant::now();
        let mut tracker = started(t0);
        tracker.hook("a", HookSource::Claude, Activity::Working, t0, None);
        let idle = tracker.session_end("a", t0 + ms(100)).unwrap();
        assert_eq!(idle.activity, Activity::Idle);
        assert_eq!(
            tracker.output("a", t0 + ms(200)).unwrap().activity,
            Activity::Working
        );
        assert_eq!(tracker.session_end("zzz", t0), None);
    }

    #[test]
    fn a_session_ends_unless_it_is_cleared() {
        assert!(claude_session_ended(
            "SessionEnd",
            Some("prompt_input_exit")
        ));
        assert!(claude_session_ended("SessionEnd", None));
        assert!(!claude_session_ended("SessionEnd", Some("clear")));
        assert!(!claude_session_ended("Stop", None));
    }

    #[test]
    fn the_terminal_s_answers_to_queries_are_not_keystrokes() {
        for reply in [
            &b"\x1b[24;80R"[..],
            b"\x1b[?62;4c",
            b"\x1b[>0;276;0c",
            b"\x1b[?2004;2$y",
            b"\x1b[2026;1$y",
            b"\x1b[0n",
            b"\x1b]11;rgb:0000/0000/0000\x1b\\",
            b"\x1bP1$r0m\x1b\\",
        ] {
            assert!(!is_keystroke(reply), "{reply:?}");
        }
        for key in [
            &b"\x1b[A"[..],
            b"\x1b[1;5C",
            b"\x1b[15~",
            b"\x1bOP",
            b"\x1b",
            b"n",
            b"R",
        ] {
            assert!(is_keystroke(key), "{key:?}");
        }
    }

    #[test]
    fn terminal_reports_are_not_keystrokes() {
        for report in [&b"\x1b[I"[..], b"\x1b[O", b"\x1b[<0;10;5M", b"\x1b[M !!"] {
            assert!(!is_keystroke(report), "{report:?}");
        }
        for key in [&b"1"[..], b"\r", b"\x1b", b"\x1b[B", b"no"] {
            assert!(is_keystroke(key), "{key:?}");
        }
    }

    #[test]
    fn codex_turn_end_sets_idle_without_disabling_the_output_heuristic() {
        let t0 = Instant::now();
        let mut tracker = started(t0);
        tracker.output("a", t0);
        let idle = tracker
            .hook("a", HookSource::Codex, Activity::Idle, t0 + ms(100), None)
            .unwrap();
        assert_eq!(idle.activity, Activity::Idle);
        assert_eq!(
            tracker.output("a", t0 + ms(200)).unwrap().activity,
            Activity::Working
        );
    }

    #[test]
    fn removed_or_unknown_terminals_are_ignored() {
        let t0 = Instant::now();
        let mut tracker = started(t0);
        tracker.remove("a");
        assert_eq!(tracker.output("a", t0), None);
        assert_eq!(
            tracker.hook("zzz", HookSource::Claude, Activity::Working, t0, None),
            None
        );
        assert!(tracker.snapshot().is_empty());
    }

    #[test]
    fn snapshot_lists_the_current_activity_of_each_terminal() {
        let t0 = Instant::now();
        let mut tracker = started(t0);
        tracker.start("b", t0);
        tracker.output("b", t0 + ms(5));
        let mut snapshot = tracker.snapshot();
        snapshot.sort_by(|x, y| x.node_id.cmp(&y.node_id));
        let pairs: Vec<_> = snapshot
            .iter()
            .map(|c| (c.node_id.as_str(), c.activity))
            .collect();
        assert_eq!(pairs, vec![("a", Activity::Idle), ("b", Activity::Working)]);
    }

    #[test]
    fn maps_claude_hook_events() {
        assert_eq!(
            claude_activity("UserPromptSubmit", None),
            Some(Activity::Working)
        );
        assert_eq!(
            claude_activity("PostToolUse", None),
            Some(Activity::Working)
        );
        assert_eq!(claude_activity("Stop", None), Some(Activity::Idle));
        assert_eq!(claude_activity("StopFailure", None), Some(Activity::Idle));
        for kind in [
            "permission_prompt",
            "elicitation_dialog",
            "elicitation_url_dialog",
            "agent_needs_input",
        ] {
            assert_eq!(
                claude_activity("Notification", Some(kind)),
                Some(Activity::Waiting)
            );
        }
        assert_eq!(
            claude_activity("Notification", Some("idle_prompt")),
            Some(Activity::Idle)
        );
        assert_eq!(claude_activity("Notification", Some("auth_success")), None);
        assert_eq!(claude_activity("Notification", None), None);
        assert_eq!(claude_activity("SessionStart", None), None);
    }

    #[test]
    fn maps_the_codex_turn_end() {
        assert_eq!(codex_activity("agent-turn-complete"), Some(Activity::Idle));
        assert_eq!(codex_activity("something-else"), None);
    }

    #[test]
    fn serializes_activities_for_the_frontend() {
        assert_eq!(
            serde_json::to_value(Activity::Waiting).unwrap(),
            serde_json::json!("waiting")
        );
    }
}
