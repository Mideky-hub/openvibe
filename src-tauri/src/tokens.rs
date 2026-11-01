//! Tokens consumed by Claude Code, read from the conversation logs it keeps on
//! disk (spec Tokens). Read-only and bounded: only dates, session ids, models
//! and counters are kept, never the text of a conversation.

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

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionTokens {
    pub session_id: String,
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
pub fn scan(root: &Path, now_secs: u64) -> Report {
    scan_with(root, now_secs, &Limits::default())
}

/// `scan` under the given bounds.
pub fn scan_with(root: &Path, now_secs: u64, limits: &Limits) -> Report {
    let started = Instant::now();
    let today = (now_secs / 86_400) as i64;
    let first = today - (DAYS as i64 - 1);
    let dates: Vec<String> = (first..=today).map(date_of).collect();
    let oldest = dates[0].clone();
    let newest = dates[dates.len() - 1].clone();
    let mut days: BTreeMap<String, Counts> = dates
        .iter()
        .map(|d| (d.clone(), Counts::default()))
        .collect();
    let mut sessions: HashMap<String, (Counts, HashMap<String, u64>)> = HashMap::new();
    let mut models: HashMap<String, Counts> = HashMap::new();
    let mut seen: HashSet<String> = HashSet::new();

    let mut files = Vec::new();
    collect(&root.join("projects"), 0, &mut files);
    // A file untouched for longer than the window cannot hold a message of it.
    let cutoff = SystemTime::UNIX_EPOCH
        + std::time::Duration::from_secs(((first - 1).max(0) as u64) * 86_400);
    files.retain(|(modified, _)| *modified >= cutoff);
    files.sort_by_key(|file| std::cmp::Reverse(file.0));
    let mut truncated = files.len() > limits.files;
    files.truncate(limits.files);

    let mut scanned = 0;
    let mut total_bytes = 0u64;
    let mut buffer = Vec::new();
    'files: for (_, path) in &files {
        let Ok(file) = File::open(path) else {
            continue;
        };
        scanned += 1;
        if file.metadata().map(|meta| meta.len()).unwrap_or(0) > limits.file_bytes {
            truncated = true;
        }
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
            // Most lines are text: only those with counters are parsed.
            if !buffer.windows(7).any(|w| w == b"\"usage\"") {
                continue;
            }
            let Ok(line) = serde_json::from_slice::<Line>(&buffer) else {
                continue;
            };
            let (Some(timestamp), Some(message)) = (line.timestamp, line.message) else {
                continue;
            };
            let Some(usage) = message.usage else {
                continue;
            };
            let date = timestamp.get(..10).unwrap_or("");
            if date < oldest.as_str() || date > newest.as_str() {
                continue;
            }
            // A resumed conversation copies the messages of the first: count each once.
            if let Some(id) = &message.id
                && !seen.insert(id.clone())
            {
                continue;
            }
            let counts = Counts {
                input: usage.input_tokens.unwrap_or(0),
                output: usage.output_tokens.unwrap_or(0),
                cache_read: usage.cache_read_input_tokens.unwrap_or(0),
                cache_write: usage.cache_creation_input_tokens.unwrap_or(0),
            };
            if let Some(day) = days.get_mut(date) {
                day.add(counts);
            }
            // `<synthetic>` is Claude Code's own placeholder, not a model.
            let model = message.model.filter(|m| !m.starts_with('<'));
            if let Some(model) = &model {
                models.entry(model.clone()).or_default().add(counts);
            }
            let entry = sessions
                .entry(line.session_id.unwrap_or_default())
                .or_default();
            entry.0.add(counts);
            if let Some(model) = model {
                *entry.1.entry(model).or_default() += counts.output + 1;
            }
        }
    }

    let mut sessions: Vec<SessionTokens> = sessions
        .into_iter()
        .filter(|(id, _)| !id.is_empty())
        .map(|(session_id, (counts, by_model))| SessionTokens {
            session_id,
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
    let mut models: Vec<ModelTokens> = models
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
        days: days
            .into_iter()
            .map(|(date, counts)| DayTokens { date, counts })
            .collect(),
        sessions,
        models,
        files_scanned: scanned,
        truncated,
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
}
