//! Keeps the PC awake during an overnight mission (spec mission de nuit §5.4).
//! The execution state belongs to the thread that set it and ends with it: a
//! thread of its own holds it, and OpenVibe's exit releases it in any case.

use std::sync::Mutex;
use std::sync::mpsc::{Sender, channel};
use std::thread::JoinHandle;

const ES_CONTINUOUS: u32 = 0x8000_0000;
const ES_SYSTEM_REQUIRED: u32 = 0x0000_0001;

#[cfg(windows)]
fn set_execution_state(flags: u32) {
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn SetThreadExecutionState(flags: u32) -> u32;
    }
    // SAFETY: takes a flag word and touches nothing else.
    if unsafe { SetThreadExecutionState(flags) } == 0 {
        log::warn!("the PC could not be kept awake");
    }
}

#[cfg(not(windows))]
fn set_execution_state(_flags: u32) {}

type Apply = fn(u32);

/// On while a mission needs it: asking twice holds one thread.
pub struct KeepAwake {
    apply: Apply,
    held: Mutex<Option<(Sender<()>, JoinHandle<()>)>>,
}

impl Default for KeepAwake {
    fn default() -> Self {
        Self::with(set_execution_state)
    }
}

impl KeepAwake {
    fn with(apply: Apply) -> Self {
        Self {
            apply,
            held: Mutex::new(None),
        }
    }

    pub fn set(&self, on: bool) {
        let mut held = self.held.lock().unwrap_or_else(|e| e.into_inner());
        if on && held.is_none() {
            let (release, released) = channel::<()>();
            let apply = self.apply;
            let thread = std::thread::spawn(move || {
                apply(ES_CONTINUOUS | ES_SYSTEM_REQUIRED);
                let _ = released.recv();
                apply(ES_CONTINUOUS);
            });
            *held = Some((release, thread));
        } else if !on && let Some((release, thread)) = held.take() {
            let _ = release.send(());
            let _ = thread.join();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    static CALLS: Mutex<Vec<u32>> = Mutex::new(Vec::new());

    fn record(flags: u32) {
        CALLS.lock().unwrap().push(flags);
    }

    #[test]
    fn holds_once_and_releases_on_its_own_thread() {
        let awake = KeepAwake::with(record);
        awake.set(false);
        awake.set(true);
        awake.set(true);
        assert!(awake.held.lock().unwrap().is_some());
        awake.set(false);
        awake.set(false);
        assert_eq!(
            *CALLS.lock().unwrap(),
            [ES_CONTINUOUS | ES_SYSTEM_REQUIRED, ES_CONTINUOUS]
        );
        assert!(awake.held.lock().unwrap().is_none());
    }
}
