//! Tokens consumed by Claude Code and Codex, read from the conversation logs
//! they keep on disk (spec Tokens). Read-only and bounded: only dates, session
//! ids, models and counters are kept, never the text of a conversation.

use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs::File;
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime};

use serde::{Deserialize, Serialize};

/// Days shown, today included.
pub const DAYS: u64 = 30;
const MAX_DEPTH: usize = 4;
const MAX_SESSIONS: usize = 200;

/// What bounds a scan: it must never hold the interface, or the disk, for long.
#[derive(Debug, Clone, Copy)]
pub struct Limits {
    pub files: usize,
    pub file_bytes: u64,
    pub total_bytes: u64,
    pub line_bytes: usize,
    pub time: Duration,
}

impl Default for Limits {
    fn default() -> Self {
        Limits {
            files: 2_000,
            file_bytes: 64 << 20,
            total_bytes: 1 << 30,
            line_bytes: 4 << 20,
            time: Duration::from_secs(20),
        }
    }
}

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Counts {
    pub input: u64,
    pub output: u64,
    pub cache_read: u64,
    pub cache_write: u64,
}

impl Counts {
    fn add(&mut self, other: Counts) {
        self.input += other.input;
        self.output += other.output;
        self.cache_read += other.cache_read;
        self.cache_write += other.cache_write;
    }

    pub fn total(&self) -> u64 {
        self.input + self.output + self.cache_read + self.cache_write
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DayTokens {
    /// `YYYY-MM-DD`, UTC.
    pub date: String,
    pub counts: Counts,
}

/// The agent whose logs a session comes from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Agent {
    Claude,
    Codex,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionTokens {
    pub session_id: String,
    pub agent: Agent,
    /// The model that wrote most of the session.
    pub model: Option<String>,
    pub counts: Counts,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ModelTokens {
    pub model: String,
    pub counts: Counts,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    /// The last `DAYS` days, oldest first, empty days included.
    pub days: Vec<DayTokens>,
    pub sessions: Vec<SessionTokens>,
    pub models: Vec<ModelTokens>,
    pub files_scanned: usize,
    /// A bound was reached: the figures are a floor.
    pub truncated: bool,
}

/// The only fields read from a line; everything else (the text above all) is skipped unread.
#[derive(Deserialize)]
struct Line {
    timestamp: Option<String>,
    #[serde(rename = "sessionId")]
    session_id: Option<String>,
    message: Option<Message>,
}

#[derive(Deserialize)]
struct Message {
    id: Option<String>,
    model: Option<String>,
    usage: Option<Usage>,
}

#[derive(Deserialize)]
struct Usage {
    input_tokens: Option<u64>,
    output_tokens: Option<u64>,
    cache_read_input_tokens: Option<u64>,
    cache_creation_input_tokens: Option<u64>,
}

/// A line of a Codex log (`sessions/YYYY/MM/DD/rollout-*.jsonl`): only the session's
/// id, the model of a turn and the token counts are read.
#[derive(Deserialize)]
struct CodexLine {
    timestamp: Option<String>,
    #[serde(rename = "type")]
    kind: Option<String>,
    payload: Option<CodexPayload>,
}

#[derive(Deserialize)]
struct CodexPayload {
    #[serde(rename = "type")]
    kind: Option<String>,
    id: Option<String>,
    model: Option<String>,
    info: Option<CodexInfo>,
}

#[derive(Deserialize)]
struct CodexInfo {
    total_token_usage: Option<CodexUsage>,
    last_token_usage: Option<CodexUsage>,
}

/// Codex counts the cached input within the input.
#[derive(Deserialize, Debug, Default, Clone, Copy, PartialEq, Eq)]
struct CodexUsage {
    #[serde(default)]
    input_tokens: u64,
    #[serde(default)]
    cached_input_tokens: u64,
    #[serde(default)]
    output_tokens: u64,
}

impl CodexUsage {
    fn since(self, before: CodexUsage) -> CodexUsage {
        CodexUsage {
            input_tokens: self.input_tokens.saturating_sub(before.input_tokens),
            cached_input_tokens: self
                .cached_input_tokens
                .saturating_sub(before.cached_input_tokens),
            output_tokens: self.output_tokens.saturating_sub(before.output_tokens),
        }
    }

    fn counts(self) -> Counts {
        Counts {
            input: self.input_tokens.saturating_sub(self.cached_input_tokens),
            output: self.output_tokens,
            cache_read: self.cached_input_tokens,
            cache_write: 0,
        }
    }
}

/// What a Codex log has said so far: its session, the model of the turn, the last total.
struct CodexFile {
    session: String,
    model: Option<String>,
    total: Option<CodexUsage>,
}

impl CodexFile {
    /// The tokens of one turn. Codex logs the same count again when only its rate
    /// limits change: counted once. Without the last turn, the totals' difference.
    fn turn(&mut self, info: CodexInfo) -> Option<CodexUsage> {
        let Some(total) = info.total_token_usage else {
            return info.last_token_usage;
        };
        let before = self.total.replace(total);
        if before == Some(total) {
            return None;
        }
        info.last_token_usage
            .or_else(|| Some(before.map_or(total, |before| total.since(before))))
    }
}

/// The sums of the window, by day, session and model.
struct Tally {
    oldest: String,
    newest: String,
    days: BTreeMap<String, Counts>,
    sessions: HashMap<(Agent, String), (Counts, HashMap<String, u64>)>,
    models: HashMap<String, Counts>,
}

impl Tally {
    fn covers(&self, date: &str) -> bool {
        date >= self.oldest.as_str() && date <= self.newest.as_str()
    }

    fn add(
        &mut self,
        date: &str,
        agent: Agent,
        session: String,
        model: Option<String>,
        counts: Counts,
    ) {
        if let Some(day) = self.days.get_mut(date) {
            day.add(counts);
        }
        if let Some(model) = &model {
            self.models.entry(model.clone()).or_default().add(counts);
        }
        let entry = self.sessions.entry((agent, session)).or_default();
        entry.0.add(counts);
        if let Some(model) = model {
            *entry.1.entry(model).or_default() += counts.output + 1;
        }
    }
}

fn contains(haystack: &[u8], needle: &[u8]) -> bool {
    haystack.windows(needle.len()).any(|w| w == needle)
}

/// Days since 1970-01-01 to `(year, month, day)` (proleptic Gregorian, Hinnant's algorithm).
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let month = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if month <= 2 { year + 1 } else { year }, month, day)
}

fn date_of(days: i64) -> String {
    let (y, m, d) = civil_from_days(days);
    format!("{y:04}-{m:02}-{d:02}")
}

/// The `.jsonl` files under `dir`, a few levels deep (sub-agents keep theirs in the session's folder).
fn collect(dir: &Path, depth: usize, out: &mut Vec<(SystemTime, PathBuf)>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.filter_map(Result::ok) {
        let path = entry.path();
        let Ok(kind) = entry.file_type() else {
            continue;
        };
        if kind.is_dir() {
            if depth < MAX_DEPTH {
                collect(&path, depth + 1, out);
            }
        } else if kind.is_file()
            && path.extension().is_some_and(|ext| ext == "jsonl")
            && let Ok(modified) = entry.metadata().and_then(|meta| meta.modified())
        {
            out.push((modified, path));
        }
    }
}

/// Reads a line of at most `line_bytes` into `buffer`: `Some(true)`; a longer one is
/// skipped to its end, `Some(false)`; `None` at the end of the file.
fn next_line(reader: &mut impl BufRead, buffer: &mut Vec<u8>, max: usize) -> Option<bool> {
    buffer.clear();
    let read = reader
        .by_ref()
        .take(max as u64 + 1)
        .read_until(b'\n', buffer)
        .ok()?;
    if read == 0 {
        return None;
    }
    if buffer.len() > max && buffer.last() != Some(&b'\n') {
        buffer.clear();
        let mut rest = Vec::new();
        loop {
            rest.clear();
            let more = reader
                .by_ref()
                .take(1 << 20)
                .read_until(b'\n', &mut rest)
                .ok()?;
            if more == 0 || rest.last() == Some(&b'\n') {
                break;
            }
        }
        return Some(false);
    }
    Some(true)
}

/// The tokens Claude Code logged under `root/projects` for the last `DAYS` days up to `now_secs` (epoch, UTC).
#[cfg(test)]
pub fn scan(root: &Path, now_secs: u64) -> Report {
    scan_with(root, now_secs, &Limits::default())
}

/// `scan` under the given bounds.
#[cfg(test)]
pub fn scan_with(root: &Path, now_secs: u64, limits: &Limits) -> Report {
    scan_all_with(Some(root), None, now_secs, limits)
}

/// The tokens of Claude Code (`claude/projects`) and of Codex (`codex/sessions`)
/// together; a folder that is missing or cannot be read counts for nothing.
pub fn scan_all(claude: Option<&Path>, codex: Option<&Path>, now_secs: u64) -> Report {
    scan_all_with(claude, codex, now_secs, &Limits::default())
}

/// `scan_all` under the given bounds, shared by both agents.
pub fn scan_all_with(
    claude: Option<&Path>,
    codex: Option<&Path>,
    now_secs: u64,
    limits: &Limits,
) -> Report {
    let started = Instant::now();
    let today = (now_secs / 86_400) as i64;
    let first = today - (DAYS as i64 - 1);
    let dates: Vec<String> = (first..=today).map(date_of).collect();
    let mut tally = Tally {
        oldest: dates[0].clone(),
        newest: dates[dates.len() - 1].clone(),
        days: dates
            .iter()
            .map(|d| (d.clone(), Counts::default()))
            .collect(),
        sessions: HashMap::new(),
        models: HashMap::new(),
    };
    let mut seen: HashSet<String> = HashSet::new();

    let mut files = Vec::new();
    for (root, logs, agent) in [
        (claude, "projects", Agent::Claude),
        (codex, "sessions", Agent::Codex),
    ] {
        let Some(root) = root else {
            continue;
        };
        let mut found = Vec::new();
        collect(&root.join(logs), 0, &mut found);
        files.extend(
            found
                .into_iter()
                .map(|(modified, path)| (modified, path, agent)),
        );
    }
    // A file untouched for longer than the window cannot hold a message of it.
    let cutoff = SystemTime::UNIX_EPOCH
        + std::time::Duration::from_secs(((first - 1).max(0) as u64) * 86_400);
    files.retain(|(modified, _, _)| *modified >= cutoff);
    files.sort_by_key(|file| std::cmp::Reverse(file.0));
    let mut truncated = files.len() > limits.files;
    files.truncate(limits.files);

    let mut scanned = 0;
    let mut total_bytes = 0u64;
    let mut buffer = Vec::new();
    'files: for (_, path, agent) in &files {
        let Ok(file) = File::open(path) else {
            continue;
        };
        scanned += 1;
        if file.metadata().map(|meta| meta.len()).unwrap_or(0) > limits.file_bytes {
            truncated = true;
        }
        // Until its first line says otherwise, a Codex session is named after its file.
        let mut codex = CodexFile {
            session: path
                .file_stem()
                .map(|stem| stem.to_string_lossy().into_owned())
                .unwrap_or_default(),
            model: None,
            total: None,
        };
        let mut reader = BufReader::new(file.take(limits.file_bytes));
        while let Some(usable) = next_line(&mut reader, &mut buffer, limits.line_bytes) {
            total_bytes += buffer.len() as u64;
            if total_bytes > limits.total_bytes || started.elapsed() >= limits.time {
                truncated = true;
                break 'files;
            }
            if !usable {
                truncated = true;
                continue;
            }
            match agent {
                Agent::Claude => claude_line(&buffer, &mut tally, &mut seen),
                Agent::Codex => codex_line(&buffer, &mut tally, &mut codex),
            }
        }
    }

    let mut sessions: Vec<SessionTokens> = tally
        .sessions
        .into_iter()
        .filter(|((_, id), _)| !id.is_empty())
        .map(|((agent, session_id), (counts, by_model))| SessionTokens {
            session_id,
            agent,
            model: by_model
                .into_iter()
                .max_by_key(|(_, weight)| *weight)
                .map(|(model, _)| model),
            counts,
        })
        .collect();
    sessions.sort_by(|a, b| {
        b.counts
            .total()
            .cmp(&a.counts.total())
            .then(a.session_id.cmp(&b.session_id))
    });
    sessions.truncate(MAX_SESSIONS);
    let mut models: Vec<ModelTokens> = tally
        .models
        .into_iter()
        .map(|(model, counts)| ModelTokens { model, counts })
        .collect();
    models.sort_by(|a, b| {
        b.counts
            .total()
            .cmp(&a.counts.total())
            .then(a.model.cmp(&b.model))
    });

    Report {
        days: tally
            .days
            .into_iter()
            .map(|(date, counts)| DayTokens { date, counts })
            .collect(),
        sessions,
        models,
        files_scanned: scanned,
        truncated,
    }
}

/// A line of a Claude Code log: the counters of an assistant's message.
fn claude_line(buffer: &[u8], tally: &mut Tally, seen: &mut HashSet<String>) {
    // Most lines are text: only those with counters are parsed.
    if !contains(buffer, b"\"usage\"") {
        return;
    }
    let Ok(line) = serde_json::from_slice::<Line>(buffer) else {
        return;
    };
    let (Some(timestamp), Some(message)) = (line.timestamp, line.message) else {
        return;
    };
    let Some(usage) = message.usage else {
        return;
    };
    let date = timestamp.get(..10).unwrap_or("");
    if !tally.covers(date) {
        return;
    }
    // A resumed conversation copies the messages of the first: count each once.
    if let Some(id) = &message.id
        && !seen.insert(id.clone())
    {
        return;
    }
    let counts = Counts {
        input: usage.input_tokens.unwrap_or(0),
        output: usage.output_tokens.unwrap_or(0),
        cache_read: usage.cache_read_input_tokens.unwrap_or(0),
        cache_write: usage.cache_creation_input_tokens.unwrap_or(0),
    };
    // `<synthetic>` is Claude Code's own placeholder, not a model.
    let model = message.model.filter(|m| !m.starts_with('<'));
    tally.add(
        date,
        Agent::Claude,
        line.session_id.unwrap_or_default(),
        model,
        counts,
    );
}

/// A line of a Codex log: its session, the model of a turn, or a turn's tokens.
fn codex_line(buffer: &[u8], tally: &mut Tally, file: &mut CodexFile) {
    if !contains(buffer, b"token_count")
        && !contains(buffer, b"turn_context")
        && !contains(buffer, b"session_meta")
    {
        return;
    }
    let Ok(line) = serde_json::from_slice::<CodexLine>(buffer) else {
        return;
    };
    let Some(payload) = line.payload else {
        return;
    };
    match line.kind.as_deref() {
        Some("session_meta") => {
            if let Some(id) = payload.id.filter(|id| !id.is_empty()) {
                file.session = id;
            }
        }
        Some("turn_context") => {
            if payload.model.is_some() {
                file.model = payload.model;
            }
        }
        Some("event_msg") if payload.kind.as_deref() == Some("token_count") => {
            let Some(turn) = payload.info.and_then(|info| file.turn(info)) else {
                return;
            };
            let date = line.timestamp.as_deref().and_then(|t| t.get(..10));
            if let Some(date) = date.filter(|date| tally.covers(date)) {
                tally.add(
                    date,
                    Agent::Codex,
                    file.session.clone(),
                    file.model.clone(),
                    turn.counts(),
                );
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 2026-10-31 12:00 UTC.
    const NOW: u64 = 1_793_448_000;

    fn assistant(
        id: &str,
        session: &str,
        date: &str,
        model: &str,
        input: u64,
        output: u64,
    ) -> String {
        format!(
            r#"{{"type":"assistant","timestamp":"{date}T10:00:00.000Z","sessionId":"{session}","cwd":"C:/secret/project","message":{{"id":"{id}","model":"{model}","role":"assistant","content":[{{"type":"text","text":"MOT DE PASSE: hunter2"}}],"usage":{{"input_tokens":{input},"output_tokens":{output},"cache_read_input_tokens":100,"cache_creation_input_tokens":10,"service_tier":"standard"}}}}}}"#
        )
    }

    fn write(root: &Path, relative: &str, lines: &[String]) {
        let path = root.join("projects").join(relative);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, lines.join("\n")).unwrap();
    }

    fn fixture() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        write(
            dir.path(),
            "C--code-api/s1.jsonl",
            &[
                r#"{"type":"user","timestamp":"2026-10-31T09:59:00.000Z","sessionId":"s1","message":{"role":"user","content":"bonjour"}}"#.to_string(),
                assistant("m1", "s1", "2026-10-31", "claude-opus-5-5", 5, 50),
                assistant("m2", "s1", "2026-10-30", "claude-opus-5-5", 3, 30),
                // Out of the window.
                assistant("old", "s1", "2026-09-01", "claude-opus-5-5", 999, 999),
                "not json at all".to_string(),
            ],
        );
        // A resumed conversation replays m1 in another file, then adds its own.
        write(
            dir.path(),
            "C--code-api/s2.jsonl",
            &[
                assistant("m1", "s1", "2026-10-31", "claude-opus-5-5", 5, 50),
                assistant("m3", "s2", "2026-10-31", "claude-haiku-5-5", 1, 10),
            ],
        );
        // A sub-agent keeps its log in the session's folder.
        write(
            dir.path(),
            "C--code-api/s2/subagents/agent-1.jsonl",
            &[assistant(
                "m4",
                "s2",
                "2026-10-29",
                "claude-haiku-5-5",
                2,
                20,
            )],
        );
        dir
    }

    #[test]
    fn dates_come_from_days_since_the_epoch() {
        assert_eq!(date_of(0), "1970-01-01");
        assert_eq!(date_of((NOW / 86_400) as i64), "2026-10-31");
        assert_eq!(date_of(11_016), "2000-02-29");
    }

    #[test]
    fn counts_each_day_of_the_window_and_counts_a_message_once() {
        let dir = fixture();
        let report = scan(dir.path(), NOW);
        assert_eq!(report.days.len(), 30);
        assert_eq!(report.days.first().unwrap().date, "2026-10-02");
        assert_eq!(report.days.last().unwrap().date, "2026-10-31");
        let day = |date: &str| report.days.iter().find(|d| d.date == date).unwrap().counts;
        // m1 (once) + m3.
        assert_eq!(
            day("2026-10-31"),
            Counts {
                input: 6,
                output: 60,
                cache_read: 200,
                cache_write: 20
            }
        );
        assert_eq!(day("2026-10-30").output, 30);
        assert_eq!(day("2026-10-29").output, 20);
        assert_eq!(day("2026-10-28"), Counts::default());
        assert_eq!(report.files_scanned, 3);
        assert!(!report.truncated);
    }

    #[test]
    fn groups_by_session_and_by_model_biggest_first() {
        let dir = fixture();
        let report = scan(dir.path(), NOW);
        let ids: Vec<&str> = report
            .sessions
            .iter()
            .map(|s| s.session_id.as_str())
            .collect();
        assert_eq!(ids, ["s1", "s2"]);
        assert_eq!(report.sessions[0].counts.output, 80);
        assert_eq!(report.sessions[0].model.as_deref(), Some("claude-opus-5-5"));
        assert_eq!(report.sessions[1].counts.output, 30);
        let models: Vec<&str> = report.models.iter().map(|m| m.model.as_str()).collect();
        assert_eq!(models, ["claude-opus-5-5", "claude-haiku-5-5"]);
    }

    #[test]
    fn never_keeps_conversation_text_or_paths() {
        let dir = fixture();
        let json = serde_json::to_string(&scan(dir.path(), NOW)).unwrap();
        assert!(!json.contains("hunter2"));
        assert!(!json.contains("secret"));
        assert!(!json.contains("bonjour"));
    }

    #[test]
    fn an_absent_folder_is_an_empty_report() {
        let dir = tempfile::tempdir().unwrap();
        let report = scan(&dir.path().join("nope"), NOW);
        assert_eq!(report.days.len(), 30);
        assert!(report.sessions.is_empty());
        assert_eq!(report.files_scanned, 0);
    }

    #[test]
    fn skips_an_oversized_line_and_says_the_figures_are_a_floor() {
        let dir = tempfile::tempdir().unwrap();
        let huge = format!(
            r#"{{"type":"user","message":{{"content":"{}"}}}}"#,
            "x".repeat(Limits::default().line_bytes + 10)
        );
        write(
            dir.path(),
            "p/s.jsonl",
            &[
                huge,
                assistant("m1", "s", "2026-10-31", "claude-opus-5-5", 1, 2),
            ],
        );
        let report = scan(dir.path(), NOW);
        assert!(report.truncated);
        assert_eq!(report.days.last().unwrap().counts.output, 2);
    }

    /// Today's output of a scan under small bounds, over files written by `fill`.
    fn bounded(limits: Limits, files: usize, lines: usize) -> Report {
        let dir = tempfile::tempdir().unwrap();
        for f in 0..files {
            let batch: Vec<String> = (0..lines)
                .map(|l| {
                    assistant(
                        &format!("m-{f}-{l}"),
                        "s",
                        "2026-10-31",
                        "claude-opus-5-5",
                        1,
                        1,
                    )
                })
                .collect();
            write(dir.path(), &format!("p/f{f}.jsonl"), &batch);
        }
        scan_with(dir.path(), NOW, &limits)
    }

    fn output_of_today(report: &Report) -> u64 {
        report.days.last().unwrap().counts.output
    }

    #[test]
    fn reads_no_more_files_than_the_bound() {
        let report = bounded(
            Limits {
                files: 2,
                ..Limits::default()
            },
            5,
            3,
        );
        assert_eq!(report.files_scanned, 2);
        assert!(report.truncated);
        assert_eq!(output_of_today(&report), 6);
    }

    #[test]
    fn reads_no_more_of_a_file_than_the_bound() {
        // A line is about 400 bytes: 1 200 bytes hold three of the ten.
        let report = bounded(
            Limits {
                file_bytes: 1_200,
                ..Limits::default()
            },
            1,
            10,
        );
        assert!(report.truncated);
        assert!(output_of_today(&report) < 10);
        assert!(output_of_today(&report) >= 1);
    }

    #[test]
    fn stops_at_the_total_bytes_bound() {
        let report = bounded(
            Limits {
                total_bytes: 2_000,
                ..Limits::default()
            },
            4,
            10,
        );
        assert!(report.truncated);
        assert!(output_of_today(&report) < 40);
    }

    #[test]
    fn stops_when_the_time_is_up() {
        let report = bounded(
            Limits {
                time: Duration::ZERO,
                ..Limits::default()
            },
            4,
            10,
        );
        assert!(report.truncated);
        assert_eq!(output_of_today(&report), 0);
    }

    #[test]
    fn a_large_generated_log_is_read_whole_within_the_default_bounds_and_quickly() {
        // About 30 MB over 20 files: far from the bounds, so nothing is lost.
        let started = Instant::now();
        let report = bounded(Limits::default(), 20, 4_000);
        assert!(!report.truncated);
        assert_eq!(report.files_scanned, 20);
        assert_eq!(output_of_today(&report), 20 * 4_000);
        assert!(
            started.elapsed() < Duration::from_secs(15),
            "took {:?}",
            started.elapsed()
        );
    }

    #[test]
    fn a_message_id_is_counted_once_across_files() {
        let dir = tempfile::tempdir().unwrap();
        for f in 0..3 {
            write(
                dir.path(),
                &format!("p/f{f}.jsonl"),
                &[assistant(
                    "same",
                    "s",
                    "2026-10-31",
                    "claude-opus-5-5",
                    1,
                    7,
                )],
            );
        }
        assert_eq!(output_of_today(&scan(dir.path(), NOW)), 7);
    }

    #[test]
    fn ignores_a_day_outside_the_window() {
        let dir = tempfile::tempdir().unwrap();
        write(
            dir.path(),
            "p/s.jsonl",
            &[
                assistant("a", "s", "2026-10-01", "claude-opus-5-5", 1, 5),
                assistant("b", "s", "2026-11-02", "claude-opus-5-5", 1, 5),
            ],
        );
        let report = scan(dir.path(), NOW);
        assert_eq!(report.days.iter().map(|d| d.counts.output).sum::<u64>(), 0);
    }

    /// A Codex `token_count` event: `(input, cached input, output)`, cumulative and last turn.
    fn codex_tokens(
        date: &str,
        total: Option<(u64, u64, u64)>,
        last: Option<(u64, u64, u64)>,
    ) -> String {
        let usage = |(input, cached, output): (u64, u64, u64)| {
            format!(
                r#"{{"input_tokens":{input},"cached_input_tokens":{cached},"output_tokens":{output},"reasoning_output_tokens":1,"total_tokens":{}}}"#,
                input + output
            )
        };
        let mut info = Vec::new();
        if let Some(total) = total {
            info.push(format!(r#""total_token_usage":{}"#, usage(total)));
        }
        if let Some(last) = last {
            info.push(format!(r#""last_token_usage":{}"#, usage(last)));
        }
        format!(
            r#"{{"timestamp":"{date}T10:00:00.000Z","type":"event_msg","payload":{{"type":"token_count","info":{{{},"model_context_window":272000}},"rate_limits":null}}}}"#,
            info.join(",")
        )
    }

    fn codex_log(root: &Path, relative: &str, session: &str, lines: &[String]) {
        let mut all = vec![
            format!(
                r#"{{"timestamp":"2026-10-31T09:00:00.000Z","type":"session_meta","payload":{{"id":"{session}","timestamp":"2026-10-31T09:00:00.000Z","cwd":"C:/secret/project","originator":"codex_cli_rs","cli_version":"0.50.0","instructions":"MOT DE PASSE: hunter2"}}}}"#
            ),
            r#"{"timestamp":"2026-10-31T09:00:01.000Z","type":"turn_context","payload":{"cwd":"C:/secret/project","approval_policy":"on-request","model":"gpt-5-codex","summary":"auto"}}"#.to_string(),
            r#"{"timestamp":"2026-10-31T09:00:02.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"bonjour token_count"}]}}"#.to_string(),
        ];
        all.extend_from_slice(lines);
        let path = root.join("sessions").join(relative);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, all.join("\n")).unwrap();
    }

    fn codex_fixture() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        codex_log(
            dir.path(),
            "2026/10/31/rollout-2026-10-31T09-00-00-c1.jsonl",
            "c1",
            &[
                // Codex logs an empty count before the first answer.
                r#"{"timestamp":"2026-10-31T09:00:03.000Z","type":"event_msg","payload":{"type":"token_count","info":null,"rate_limits":null}}"#.to_string(),
                codex_tokens("2026-10-31", Some((100, 40, 10)), Some((100, 40, 10))),
                // The same count again, when only the rate limits changed.
                codex_tokens("2026-10-31", Some((100, 40, 10)), Some((100, 40, 10))),
                codex_tokens("2026-10-31", Some((250, 100, 30)), Some((150, 60, 20))),
                // Without the last turn, the difference of the totals.
                codex_tokens("2026-10-31", Some((300, 120, 35)), None),
                // Out of the window.
                codex_tokens("2026-09-01", Some((9_999, 0, 9_999)), Some((9_999, 0, 9_999))),
                "{ not json".to_string(),
            ],
        );
        dir
    }

    #[test]
    fn reads_the_token_counts_codex_logs_counting_each_turn_once() {
        let dir = codex_fixture();
        let report = scan_all(None, Some(dir.path()), NOW);
        assert_eq!(report.days.len(), 30);
        // Codex counts the cached input within the input.
        assert_eq!(
            report.days.last().unwrap().counts,
            Counts {
                input: 60 + 90 + 30,
                output: 10 + 20 + 5,
                cache_read: 40 + 60 + 20,
                cache_write: 0
            }
        );
        assert_eq!(report.files_scanned, 1);
        assert_eq!(report.sessions.len(), 1);
        assert_eq!(report.sessions[0].session_id, "c1");
        assert_eq!(report.sessions[0].agent, Agent::Codex);
        assert_eq!(report.sessions[0].model.as_deref(), Some("gpt-5-codex"));
        assert_eq!(report.models[0].model, "gpt-5-codex");
    }

    #[test]
    fn adds_codex_to_claude_and_tells_their_sessions_apart() {
        let claude = fixture();
        let codex = codex_fixture();
        let report = scan_all(Some(claude.path()), Some(codex.path()), NOW);
        assert_eq!(report.files_scanned, 4);
        // m1 and m3 from Claude, 35 from Codex.
        assert_eq!(report.days.last().unwrap().counts.output, 60 + 35);
        let agents: Vec<(&str, Agent)> = report
            .sessions
            .iter()
            .map(|s| (s.session_id.as_str(), s.agent))
            .collect();
        assert_eq!(
            agents,
            [
                ("c1", Agent::Codex),
                ("s1", Agent::Claude),
                ("s2", Agent::Claude)
            ]
        );
        let json = serde_json::to_string(&report).unwrap();
        assert!(json.contains(r#""agent":"codex""#));
        assert!(!json.contains("hunter2"));
        assert!(!json.contains("secret"));
        assert!(!json.contains("bonjour"));
    }

    #[test]
    fn a_missing_or_unreadable_log_folder_is_an_empty_report() {
        let dir = tempfile::tempdir().unwrap();
        let report = scan_all(None, None, NOW);
        assert_eq!(report.days.len(), 30);
        assert_eq!(report.files_scanned, 0);
        let claude = fixture();
        let report = scan_all(Some(claude.path()), Some(&dir.path().join("nope")), NOW);
        assert_eq!(report.files_scanned, 3);
        // A log of another shape gives nothing rather than wrong figures.
        let odd = tempfile::tempdir().unwrap();
        let path = odd.path().join("sessions/2026/10/31/rollout-x.jsonl");
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(
            &path,
            b"\xff\xfe garbage token_count\n{\"type\":\"token_count\"}\n",
        )
        .unwrap();
        let report = scan_all(None, Some(odd.path()), NOW);
        assert_eq!(report.days.iter().map(|d| d.counts.total()).sum::<u64>(), 0);
        assert!(report.sessions.is_empty());
    }
}
