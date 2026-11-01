use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;

use portable_pty::{Child, ChildKiller, CommandBuilder, MasterPty, PtySize, native_pty_system};

use super::paste::PasteMode;
use super::scrollback::{Capture, SCROLLBACK_CAPACITY, Scrollback, capture_time};
use super::shell::SpawnPlan;
use crate::error::{AppError, AppResult};
use crate::sync::lock;

/// Receives raw PTY output. Implemented by the Tauri channel in production and by
/// an in-memory buffer in tests.
pub trait OutputSink: Send {
    /// Returns false once the receiver is gone, so the reader stops forwarding to it.
    fn send(&self, bytes: &[u8]) -> bool;
}

/// Called after each chunk of output is read: the agent's activity.
pub type OnOutput = Box<dyn Fn() + Send>;

/// Scrollback and sink share one lock so that re-attaching (snapshot + sink swap)
/// can never miss or duplicate a chunk the reader is forwarding at the same time.
struct Output {
    scrollback: Scrollback,
    sink: Option<Box<dyn OutputSink>>,
}

pub struct Session {
    writer: Mutex<Box<dyn Write + Send>>,
    master: Mutex<Option<Box<dyn MasterPty + Send>>>,
    killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
    output: Mutex<Output>,
    paste: Mutex<PasteMode>,
    interrupt: Option<&'static [u8]>,
    pub pid: Option<u32>,
}

pub struct Started {
    pub session: Arc<Session>,
    pub child: Box<dyn Child + Send + Sync>,
    pub reader: JoinHandle<()>,
}

pub fn pty_err(err: impl std::fmt::Display) -> AppError {
    AppError::Pty(err.to_string())
}

impl Session {
    pub fn start(
        plan: SpawnPlan,
        size: PtySize,
        sink: Box<dyn OutputSink>,
        on_output: OnOutput,
        history: &[u8],
    ) -> AppResult<Started> {
        let pair = native_pty_system().openpty(size).map_err(pty_err)?;
        let mut cmd = CommandBuilder::new(&plan.program);
        cmd.args(&plan.args);
        cmd.cwd(&plan.cwd);
        for (key, value) in &plan.env {
            cmd.env(key, value);
        }
        for key in &plan.env_remove {
            cmd.env_remove(key);
        }
        let child = pair.slave.spawn_command(cmd).map_err(pty_err)?;
        // The child owns its end now; keeping ours open would delay EOF on exit.
        drop(pair.slave);

        let reader = pair.master.try_clone_reader().map_err(pty_err)?;
        let mut writer = pair.master.take_writer().map_err(pty_err)?;
        if let Some(input) = &plan.initial_input {
            writer.write_all(input.as_bytes())?;
        }

        let session = Arc::new(Session {
            writer: Mutex::new(writer),
            master: Mutex::new(Some(pair.master)),
            killer: Mutex::new(child.clone_killer()),
            output: Mutex::new(Output {
                scrollback: Scrollback::with_history(SCROLLBACK_CAPACITY, history),
                sink: Some(sink),
            }),
            paste: Mutex::new(PasteMode::default()),
            interrupt: plan.interrupt,
            pid: child.process_id(),
        });
        let reader = spawn_reader(reader, session.clone(), on_output);
        Ok(Started {
            session,
            child,
            reader,
        })
    }

    pub fn write(&self, data: &[u8]) -> AppResult<()> {
        let mut writer = lock(&self.writer);
        writer.write_all(data)?;
        writer.flush()?;
        Ok(())
    }

    /// The program asked for bracketed paste (`ESC[?2004h`) and did not take it back.
    pub fn pastes_bracketed(&self) -> bool {
        lock(&self.paste).is_on()
    }

    /// Writes the agent's interrupt key; `None` for a plain shell.
    pub fn interrupt(&self) -> AppResult<Option<&'static [u8]>> {
        if let Some(key) = self.interrupt {
            self.write(key)?;
        }
        Ok(self.interrupt)
    }

    pub fn resize(&self, size: PtySize) -> AppResult<()> {
        if let Some(master) = lock(&self.master).as_ref() {
            master.resize(size).map_err(pty_err)?;
        }
        Ok(())
    }

    /// Best effort: the process may already be gone.
    pub fn kill(&self) {
        let _ = lock(&self.killer).kill();
    }

    /// Closing the pseudo console is what lets the reader reach EOF on Windows.
    pub fn close(&self) {
        lock(&self.master).take();
    }

    /// The replay is always sent, even when empty, so the first message on a new
    /// sink is the replay: the frontend relies on that to ignore the answers xterm
    /// gives to terminal queries replayed from the past.
    pub fn attach(&self, sink: Box<dyn OutputSink>) {
        let mut output = lock(&self.output);
        sink.send(&output.scrollback.snapshot());
        output.sink = Some(sink);
    }

    pub fn scrollback(&self) -> Vec<u8> {
        lock(&self.output).scrollback.snapshot()
    }

    /// The scrollback and its capture time, both under the output lock.
    pub fn capture(&self) -> Capture {
        let output = lock(&self.output);
        Capture {
            at: capture_time(),
            data: output.scrollback.snapshot(),
        }
    }

    /// The capture if the scrollback changed since the last call, for the periodic flusher.
    pub fn take_dirty_capture(&self) -> Option<Capture> {
        let mut output = lock(&self.output);
        output.scrollback.take_dirty().then(|| Capture {
            at: capture_time(),
            data: output.scrollback.snapshot(),
        })
    }
}

fn spawn_reader(
    mut reader: Box<dyn Read + Send>,
    session: Arc<Session>,
    on_output: OnOutput,
) -> JoinHandle<()> {
    std::thread::spawn(move || {
        let mut buf = [0u8; 16 * 1024];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let chunk = &buf[..n];
                    // Before the front sees it: a visible chunk's mode is known.
                    lock(&session.paste).feed(chunk);
                    {
                        let mut output = lock(&session.output);
                        output.scrollback.push(chunk);
                        if output.sink.as_ref().is_some_and(|sink| !sink.send(chunk)) {
                            output.sink = None;
                        }
                    }
                    on_output();
                }
            }
        }
    })
}
