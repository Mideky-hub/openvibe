pub mod env_path;
pub mod paste;
pub mod scrollback;
pub mod session;
pub mod shell;

use crate::tr;
use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

pub use portable_pty::PtySize;

use crate::error::{AppError, AppResult};
use crate::sync::lock;
use paste::{ENTER_DELAY, paste_payload};
use session::{OnOutput, OutputSink, Session, Started};
use shell::SpawnPlan;

/// Reported once a terminal's process has exited and its output is drained.
pub struct ExitInfo {
    /// The process that exited: a relaunched terminal has another one.
    pub pid: Option<u32>,
    pub code: Option<u32>,
    pub scrollback: scrollback::Capture,
}

/// Owns every running terminal, keyed by canvas node id.
#[derive(Default)]
pub struct PtyManager {
    sessions: Arc<Mutex<HashMap<String, Arc<Session>>>>,
    /// Processes whose exit is not fully handled yet (final save included).
    exiting: Arc<AtomicUsize>,
    /// Terminals being started: a second start of the same one is refused
    /// before it can touch the first one's token and files.
    starting: Arc<Mutex<HashSet<String>>>,
    /// What the database holds of a terminal about to be relaunched; taken by its `spawn`.
    histories: Arc<Mutex<HashMap<String, Vec<u8>>>>,
}

/// The right to start one terminal; released when dropped.
pub struct StartClaim {
    starting: Arc<Mutex<HashSet<String>>>,
    node_id: String,
}

impl Drop for StartClaim {
    fn drop(&mut self) {
        lock(&self.starting).remove(&self.node_id);
    }
}

pub fn pty_size(cols: u16, rows: u16) -> PtySize {
    PtySize {
        rows: rows.max(1),
        cols: cols.max(1),
        pixel_width: 0,
        pixel_height: 0,
    }
}

impl PtyManager {
    pub fn spawn(
        &self,
        node_id: &str,
        plan: SpawnPlan,
        size: PtySize,
        sink: Box<dyn OutputSink>,
        on_output: OnOutput,
        on_exit: impl FnOnce(ExitInfo) + Send + 'static,
    ) -> AppResult<Option<u32>> {
        let history = lock(&self.histories).remove(node_id).unwrap_or_default();
        let mut sessions = lock(&self.sessions);
        if sessions.contains_key(node_id) {
            return Err(AppError::InvalidInput(tr!(
                "le terminal {node_id} tourne déjà",
                "terminal {node_id} is already running"
            )));
        }
        let Started {
            session,
            mut child,
            reader,
        } = Session::start(plan, size, sink, on_output, &history)?;
        sessions.insert(node_id.to_string(), session.clone());
        drop(sessions);

        let pid = session.pid;
        let sessions = self.sessions.clone();
        let exiting = self.exiting.clone();
        exiting.fetch_add(1, Ordering::SeqCst);
        let node_id = node_id.to_string();
        std::thread::spawn(move || {
            let code = child.wait().ok().map(|status| status.exit_code());
            session.close();
            // Join so every byte reaches the sink before the exit is reported.
            let _ = reader.join();
            lock(&sessions).remove(&node_id);
            on_exit(ExitInfo {
                pid,
                code,
                scrollback: session.capture(),
            });
            exiting.fetch_sub(1, Ordering::SeqCst);
        });
        Ok(pid)
    }

    /// Sends the current scrollback to `sink`, then streams new output to it.
    /// Returns false when no session is running for `node_id`.
    pub fn attach(&self, node_id: &str, sink: Box<dyn OutputSink>) -> bool {
        match self.get(node_id) {
            Some(session) => {
                session.attach(sink);
                true
            }
            None => false,
        }
    }

    pub fn write(&self, node_id: &str, data: &[u8]) -> AppResult<()> {
        self.require(node_id)?.write(data)
    }

    /// Types `text` as a paste, then Enter after `ENTER_DELAY` (spec §15.3).
    /// Blocks for that delay: call it off the async runtime.
    pub fn send_text(&self, node_id: &str, text: &str) -> AppResult<()> {
        let session = self.require(node_id)?;
        send_text_with(text, session.pastes_bracketed(), |bytes| {
            session.write(bytes)
        })
    }

    /// Stops the agent's turn with its own key (spec §14); `None` for a plain
    /// shell, which has none.
    pub fn interrupt(&self, node_id: &str) -> AppResult<Option<&'static [u8]>> {
        self.require(node_id)?.interrupt()
    }

    #[cfg(test)]
    fn pastes_bracketed(&self, node_id: &str) -> bool {
        self.get(node_id)
            .is_some_and(|session| session.pastes_bracketed())
    }

    pub fn resize(&self, node_id: &str, size: PtySize) -> AppResult<()> {
        self.require(node_id)?.resize(size)
    }

    /// Idempotent: killing a terminal that already exited is not an error.
    pub fn kill(&self, node_id: &str) {
        if let Some(session) = self.get(node_id) {
            session.kill();
        }
    }

    /// Stops every terminal and waits until each exit was handled, its final
    /// output saved: an update's installer closes OpenVibe right after (spec
    /// première version §6.4). False if some were still exiting at `timeout`.
    pub fn stop_all(&self, timeout: Duration) -> bool {
        self.kill_all();
        let deadline = Instant::now() + timeout;
        while self.exiting.load(Ordering::SeqCst) > 0 {
            if Instant::now() >= deadline {
                return false;
            }
            std::thread::sleep(Duration::from_millis(25));
        }
        true
    }

    pub fn kill_all(&self) {
        for session in lock(&self.sessions).values() {
            session.kill();
        }
    }

    /// Claims the start of `node_id`: refused while it runs or another start
    /// is under way. Held until the start has succeeded or failed.
    pub fn claim_start(&self, node_id: &str) -> AppResult<StartClaim> {
        let mut starting = lock(&self.starting);
        if self.is_running(node_id) || !starting.insert(node_id.to_string()) {
            return Err(AppError::InvalidInput(tr!(
                "le terminal {node_id} tourne déjà",
                "terminal {node_id} is already running"
            )));
        }
        Ok(StartClaim {
            starting: self.starting.clone(),
            node_id: node_id.to_string(),
        })
    }

    /// The previous run's saved output, for the next `spawn` of `node_id` to start from.
    pub fn seed_history(&self, node_id: &str, history: Vec<u8>) {
        lock(&self.histories).insert(node_id.to_string(), history);
    }

    pub fn is_running(&self, node_id: &str) -> bool {
        lock(&self.sessions).contains_key(node_id)
    }

    pub fn list(&self) -> Vec<String> {
        lock(&self.sessions).keys().cloned().collect()
    }

    pub fn scrollback(&self, node_id: &str) -> Option<Vec<u8>> {
        self.get(node_id).map(|session| session.scrollback())
    }

    /// Scrollbacks that changed since the previous call (spec §5.6, every 10 s).
    pub fn dirty_scrollbacks(&self) -> Vec<(String, scrollback::Capture)> {
        self.snapshot_sessions()
            .into_iter()
            .filter_map(|(id, session)| session.take_dirty_capture().map(|capture| (id, capture)))
            .collect()
    }

    /// Every live scrollback, for the final flush when the app exits.
    pub fn all_scrollbacks(&self) -> Vec<(String, scrollback::Capture)> {
        self.snapshot_sessions()
            .into_iter()
            .map(|(id, session)| (id, session.capture()))
            .collect()
    }

    /// Copies the session list so no output lock is taken while holding the map lock.
    fn snapshot_sessions(&self) -> Vec<(String, Arc<Session>)> {
        let sessions = lock(&self.sessions);
        sessions
            .iter()
            .map(|(id, s)| (id.clone(), s.clone()))
            .collect()
    }

    fn get(&self, node_id: &str) -> Option<Arc<Session>> {
        lock(&self.sessions).get(node_id).cloned()
    }

    fn require(&self, node_id: &str) -> AppResult<Arc<Session>> {
        self.get(node_id).ok_or_else(|| {
            AppError::NotFound(tr!(
                "aucun terminal actif pour {node_id}",
                "no active terminal for {node_id}"
            ))
        })
    }
}

/// The two writes of `send_text`: the paste, then Enter after `ENTER_DELAY`.
fn send_text_with(
    text: &str,
    bracketed: bool,
    mut write: impl FnMut(&[u8]) -> AppResult<()>,
) -> AppResult<()> {
    write(&paste_payload(text, bracketed))?;
    std::thread::sleep(ENTER_DELAY);
    write(b"\r")
}

#[cfg(test)]
mod send_tests {
    use super::*;

    #[test]
    fn writes_the_paste_then_a_separate_enter() {
        let mut writes: Vec<Vec<u8>> = vec![];
        send_text_with("lance\nles tests", true, |bytes| {
            writes.push(bytes.to_vec());
            Ok(())
        })
        .unwrap();
        assert_eq!(
            writes,
            vec![
                b"\x1b[200~lance\rles tests\x1b[201~".to_vec(),
                b"\r".to_vec()
            ]
        );
        writes.clear();
        send_text_with("continue", false, |bytes| {
            writes.push(bytes.to_vec());
            Ok(())
        })
        .unwrap();
        assert_eq!(writes, vec![b"continue".to_vec(), b"\r".to_vec()]);
    }

    #[test]
    fn stops_before_enter_when_the_paste_fails() {
        let mut writes = 0;
        let result = send_text_with("x", false, |_| {
            writes += 1;
            Err(AppError::Io(std::io::Error::other("closed")))
        });
        assert!(result.is_err());
        assert_eq!(writes, 1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn size_is_clamped_to_one_cell_when_the_host_is_hidden() {
        // fit() reports 0x0 for a collapsed or not-yet-laid-out container.
        let size = pty_size(0, 0);
        assert_eq!((size.cols, size.rows), (1, 1));
    }

    #[test]
    fn a_second_start_of_the_same_terminal_is_refused_until_the_first_is_over() {
        let pty = PtyManager::default();
        let first = pty.claim_start("n1").unwrap();
        assert!(pty.claim_start("n1").is_err());
        assert!(pty.claim_start("n2").is_ok(), "another terminal is free");
        drop(first);
        assert!(pty.claim_start("n1").is_ok());
    }
}

#[cfg(all(test, windows))]
mod windows_tests {
    use std::sync::mpsc;
    use std::time::{Duration, Instant};

    use super::*;

    #[derive(Clone, Default)]
    struct VecSink(Arc<Mutex<Vec<u8>>>);

    impl OutputSink for VecSink {
        fn send(&self, bytes: &[u8]) -> bool {
            self.0.lock().unwrap().extend_from_slice(bytes);
            true
        }
    }

    impl VecSink {
        fn text(&self) -> String {
            String::from_utf8_lossy(&self.0.lock().unwrap()).into_owned()
        }
    }

    fn cmd_plan(args: &[&str], initial_input: Option<&str>) -> SpawnPlan {
        SpawnPlan {
            program: "cmd.exe".into(),
            args: args.iter().map(|a| a.to_string()).collect(),
            cwd: std::env::temp_dir(),
            env: vec![],
            env_remove: vec![],
            initial_input: initial_input.map(str::to_string),
            interrupt: None,
        }
    }

    fn wait_until(what: &str, mut cond: impl FnMut() -> bool) {
        let deadline = Instant::now() + Duration::from_secs(20);
        while !cond() {
            assert!(Instant::now() < deadline, "timed out waiting for {what}");
            std::thread::sleep(Duration::from_millis(50));
        }
    }

    /// ConPTY is created with PSEUDOCONSOLE_INHERIT_CURSOR, so it asks for the cursor
    /// position (`ESC[6n`) and blocks until it gets an answer. xterm.js answers in the
    /// app; tests have to play that role.
    fn spawn_answering(
        mgr: &PtyManager,
        id: &str,
        plan: SpawnPlan,
        sink: VecSink,
    ) -> mpsc::Receiver<ExitInfo> {
        let (tx, rx) = mpsc::channel();
        mgr.spawn(
            id,
            plan,
            pty_size(80, 24),
            Box::new(sink.clone()),
            Box::new(|| {}),
            move |info| {
                let _ = tx.send(info);
            },
        )
        .unwrap();
        wait_until("cursor position query", || sink.text().contains("\x1b[6n"));
        mgr.write(id, b"\x1b[1;1R").unwrap();
        rx
    }

    fn wait_exit(exited: &mpsc::Receiver<ExitInfo>) -> ExitInfo {
        exited
            .recv_timeout(Duration::from_secs(20))
            .expect("process should exit")
    }

    #[test]
    fn streams_output_and_reports_exit_code_with_the_final_scrollback() {
        let mgr = PtyManager::default();
        let sink = VecSink::default();
        let exited = spawn_answering(
            &mgr,
            "a",
            cmd_plan(&["/c", "echo openvibe-hello"], None),
            sink.clone(),
        );
        let info = wait_exit(&exited);
        assert_eq!(info.code, Some(0));
        assert!(info.pid.is_some(), "the exit names its process");
        assert!(
            sink.text().contains("openvibe-hello"),
            "output: {:?}",
            sink.text()
        );
        assert!(String::from_utf8_lossy(&info.scrollback.data).contains("openvibe-hello"));
        assert!(mgr.list().is_empty());
        assert!(mgr.scrollback("a").is_none());
    }

    #[test]
    fn a_relaunch_keeps_the_saved_output_in_its_scrollback() {
        let mgr = PtyManager::default();
        mgr.seed_history("h", b"previous run\r\n".to_vec());
        let sink = VecSink::default();
        let exited = spawn_answering(
            &mgr,
            "h",
            cmd_plan(&["/c", "echo second-run"], None),
            sink.clone(),
        );
        let info = wait_exit(&exited);
        let saved = String::from_utf8_lossy(&info.scrollback.data).into_owned();
        assert!(saved.contains("previous run"), "{saved:?}");
        assert!(saved.contains("second-run"), "{saved:?}");
    }

    #[test]
    fn types_initial_input_before_the_cursor_query_is_answered() {
        let mgr = PtyManager::default();
        let sink = VecSink::default();
        let exited = spawn_answering(
            &mgr,
            "b",
            cmd_plan(&[], Some("echo from-initial\r")),
            sink.clone(),
        );
        wait_until("initial input output", || {
            sink.text().contains("from-initial")
        });
        mgr.write("b", b"echo from-write\rexit\r").unwrap();
        wait_exit(&exited);
        assert!(
            sink.text().contains("from-write"),
            "output: {:?}",
            sink.text()
        );
    }

    #[test]
    fn runs_in_a_folder_with_spaces_and_accents() {
        let root = tempfile::tempdir().unwrap();
        let folder = root.path().join("Mes projets é");
        std::fs::create_dir(&folder).unwrap();
        let mut plan = cmd_plan(&["/c", "cd"], None);
        plan.cwd = folder.clone();
        let sink = VecSink::default();
        let exited = spawn_answering(&PtyManager::default(), "e", plan, sink.clone());
        assert_eq!(wait_exit(&exited).code, Some(0));
        assert!(
            sink.text().contains("Mes projets é"),
            "output: {:?}",
            sink.text()
        );
    }

    /// Keeps each chunk apart, to check what the first message on a sink is.
    #[derive(Clone, Default)]
    struct ChunkSink(Arc<Mutex<Vec<Vec<u8>>>>);

    impl OutputSink for ChunkSink {
        fn send(&self, bytes: &[u8]) -> bool {
            self.0.lock().unwrap().push(bytes.to_vec());
            true
        }
    }

    #[test]
    fn attach_sends_the_replay_as_the_first_message() {
        let mgr = PtyManager::default();
        let first = VecSink::default();
        let exited = spawn_answering(
            &mgr,
            "c",
            cmd_plan(&[], Some("echo before-attach\r")),
            first.clone(),
        );
        wait_until("first output", || first.text().contains("before-attach"));
        let second = ChunkSink::default();
        assert!(mgr.attach("c", Box::new(second.clone())));
        let replay = second.0.lock().unwrap()[0].clone();
        assert!(String::from_utf8_lossy(&replay).contains("before-attach"));
        mgr.kill("c");
        wait_exit(&exited);
        assert!(!mgr.attach("c", Box::new(VecSink::default())));
    }

    #[test]
    fn stop_all_returns_once_every_exit_was_handled() {
        let mgr = PtyManager::default();
        let (tx, rx) = mpsc::channel();
        for id in ["a", "b"] {
            let sink = VecSink::default();
            let tx = tx.clone();
            mgr.spawn(
                id,
                cmd_plan(&[], None),
                pty_size(80, 24),
                Box::new(sink.clone()),
                Box::new(|| {}),
                move |_| {
                    // A slow final save, as SQLite can be.
                    std::thread::sleep(Duration::from_millis(300));
                    let _ = tx.send(());
                },
            )
            .unwrap();
            wait_until("cursor position query", || sink.text().contains("\x1b[6n"));
            mgr.write(id, b"\x1b[1;1R").unwrap();
        }
        assert!(mgr.stop_all(Duration::from_secs(10)));
        assert!(mgr.list().is_empty());
        assert!(
            rx.try_recv().is_ok() && rx.try_recv().is_ok(),
            "both exits were handled"
        );
    }

    #[test]
    fn reports_each_changed_scrollback_once() {
        let mgr = PtyManager::default();
        let sink = VecSink::default();
        let exited = spawn_answering(
            &mgr,
            "f",
            cmd_plan(&[], Some("echo flushed\r")),
            sink.clone(),
        );
        wait_until("output", || sink.text().contains("flushed"));
        let dirty = mgr.dirty_scrollbacks();
        assert_eq!(dirty.len(), 1);
        assert_eq!(dirty[0].0, "f");
        assert!(String::from_utf8_lossy(&dirty[0].1.data).contains("flushed"));
        assert!(mgr.dirty_scrollbacks().is_empty());
        assert_eq!(mgr.all_scrollbacks().len(), 1);
        mgr.kill_all();
        wait_exit(&exited);
    }

    #[test]
    fn removes_inherited_variables_from_the_terminal() {
        // SAFETY: no other test reads or writes this variable.
        unsafe { std::env::set_var("OPENVIBE_TEST_MARKER", "leaked") };
        let mut plan = cmd_plan(&["/c", "echo [%OPENVIBE_TEST_MARKER%]"], None);
        plan.env_remove = vec!["OPENVIBE_TEST_MARKER".into()];
        let sink = VecSink::default();
        let exited = spawn_answering(&PtyManager::default(), "g", plan, sink.clone());
        wait_exit(&exited);
        assert!(
            sink.text().contains("[%OPENVIBE_TEST_MARKER%]"),
            "output: {:?}",
            sink.text()
        );
        assert!(!sink.text().contains("leaked"));
    }

    #[test]
    fn reports_each_chunk_of_output_to_the_activity_callback() {
        let mgr = PtyManager::default();
        let sink = VecSink::default();
        let chunks = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let counted = chunks.clone();
        let (tx, rx) = mpsc::channel();
        mgr.spawn(
            "h",
            cmd_plan(&["/c", "echo activity"], None),
            pty_size(80, 24),
            Box::new(sink.clone()),
            Box::new(move || {
                counted.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            }),
            move |info| {
                let _ = tx.send(info);
            },
        )
        .unwrap();
        wait_until("cursor position query", || sink.text().contains("\x1b[6n"));
        mgr.write("h", b"\x1b[1;1R").unwrap();
        wait_exit(&rx);
        assert!(chunks.load(std::sync::atomic::Ordering::SeqCst) > 0);
    }

    #[test]
    fn rejects_a_second_spawn_for_the_same_node_and_resizes() {
        let mgr = PtyManager::default();
        let exited = spawn_answering(&mgr, "d", cmd_plan(&[], None), VecSink::default());
        let again = mgr.spawn(
            "d",
            cmd_plan(&[], None),
            pty_size(80, 24),
            Box::new(VecSink::default()),
            Box::new(|| {}),
            |_| {},
        );
        assert_eq!(again.unwrap_err().kind(), "invalidInput");
        // pty_spawn asks first, before it touches the live session's token and files (H3 check).
        assert!(mgr.is_running("d"));
        assert!(!mgr.is_running("x"));
        mgr.resize("d", pty_size(120, 40)).unwrap();
        assert_eq!(mgr.list(), vec!["d".to_string()]);
        mgr.kill_all();
        wait_exit(&exited);
    }

    #[test]
    fn follows_the_paste_mode_the_program_asks_for() {
        let mgr = PtyManager::default();
        let sink = VecSink::default();
        let exited = spawn_answering(
            &mgr,
            "i",
            cmd_plan(&["/k", "echo \x1b[?2004hpaste-mode-on"], None),
            sink.clone(),
        );
        wait_until("mode switch", || sink.text().contains("paste-mode-on"));
        assert!(mgr.pastes_bracketed("i"));
        mgr.kill("i");
        wait_exit(&exited);
    }

    #[test]
    fn types_a_command_then_validates_it_with_enter() {
        let mgr = PtyManager::default();
        let sink = VecSink::default();
        let exited = spawn_answering(&mgr, "j", cmd_plan(&[], None), sink.clone());
        wait_until("prompt", || sink.text().contains('>'));
        mgr.send_text("j", "echo sent-by-openvibe").unwrap();
        // The typed line, then what the command printed.
        wait_until("command output", || {
            sink.text().matches("sent-by-openvibe").count() >= 2
        });
        mgr.write("j", b"exit\r").unwrap();
        wait_exit(&exited);
    }

    #[test]
    fn interrupts_with_the_agent_key_and_not_a_plain_shell() {
        let mgr = PtyManager::default();
        let mut plan = cmd_plan(&[], None);
        plan.interrupt = Some(b"\x03");
        let agent = spawn_answering(&mgr, "k", plan, VecSink::default());
        let shell = spawn_answering(&mgr, "l", cmd_plan(&[], None), VecSink::default());
        assert_eq!(mgr.interrupt("k").unwrap(), Some(&b"\x03"[..]));
        assert_eq!(mgr.interrupt("l").unwrap(), None);
        assert_eq!(mgr.interrupt("nope").unwrap_err().kind(), "notFound");
        assert_eq!(mgr.send_text("nope", "x").unwrap_err().kind(), "notFound");
        mgr.kill_all();
        wait_exit(&agent);
        wait_exit(&shell);
    }

    #[test]
    fn unknown_terminals_are_not_found_and_kill_is_idempotent() {
        let mgr = PtyManager::default();
        assert_eq!(mgr.write("nope", b"x").unwrap_err().kind(), "notFound");
        assert_eq!(
            mgr.resize("nope", pty_size(80, 24)).unwrap_err().kind(),
            "notFound"
        );
        mgr.kill("nope");
    }
}
