use std::collections::VecDeque;
use std::sync::atomic::{AtomicI64, Ordering};

/// Per-terminal cap on retained output (spec §5.6).
pub const SCROLLBACK_CAPACITY: usize = 512 * 1024;

/// SGR reset, prepended when replaying a truncated buffer so colors left open by
/// dropped output don't bleed into the restored screen.
const RESET_ATTRIBUTES: &[u8] = b"\x1b[0m";

/// A scrollback and when it was taken: of two saves of a terminal, the later
/// capture wins, whatever order they reach SQLite in (spec première version §3.2).
pub struct Capture {
    pub at: i64,
    pub data: Vec<u8>,
}

static LAST_CAPTURE: AtomicI64 = AtomicI64::new(0);

/// Capture times only grow, even within one millisecond.
pub fn capture_time() -> i64 {
    let now = crate::db::now_ms();
    let mut last = LAST_CAPTURE.load(Ordering::Relaxed);
    loop {
        let next = now.max(last + 1);
        match LAST_CAPTURE.compare_exchange_weak(last, next, Ordering::Relaxed, Ordering::Relaxed) {
            Ok(_) => return next,
            Err(seen) => last = seen,
        }
    }
}

/// Ring buffer of the most recent raw PTY output, replayed when a terminal is
/// re-attached or restored after a restart.
pub struct Scrollback {
    buf: VecDeque<u8>,
    capacity: usize,
    truncated: bool,
    dirty: bool,
}

impl Scrollback {
    pub fn new(capacity: usize) -> Self {
        Self {
            buf: VecDeque::new(),
            capacity,
            truncated: false,
            dirty: false,
        }
    }

    /// A buffer that starts with the output a previous run of the terminal left
    /// in the database: the relaunch's first save then keeps it, as the screen does.
    /// Not dirty until the new process prints something.
    pub fn with_history(capacity: usize, history: &[u8]) -> Self {
        let mut buffer = Self::new(capacity);
        buffer.push(history);
        buffer.dirty = false;
        buffer
    }

    pub fn push(&mut self, bytes: &[u8]) {
        if bytes.is_empty() {
            return;
        }
        self.dirty = true;
        if bytes.len() >= self.capacity {
            self.buf.clear();
            self.buf.extend(&bytes[bytes.len() - self.capacity..]);
            self.truncated = true;
            return;
        }
        let overflow = (self.buf.len() + bytes.len()).saturating_sub(self.capacity);
        if overflow > 0 {
            self.buf.drain(..overflow);
            self.truncated = true;
        }
        self.buf.extend(bytes);
    }

    /// Bytes that are safe to write into a fresh terminal. Once old output has been
    /// dropped the buffer may begin in the middle of an escape sequence, so we skip
    /// to the first newline (or, in a screen redrawn without newlines, to the first
    /// escape sequence) and reset attributes before the rest.
    pub fn snapshot(&self) -> Vec<u8> {
        let data: Vec<u8> = self.buf.iter().copied().collect();
        if !self.truncated {
            return data;
        }
        let start = match data.iter().position(|&b| b == b'\n') {
            Some(newline) => newline + 1,
            None => data.iter().position(|&b| b == 0x1b).unwrap_or(0),
        };
        let mut out = Vec::with_capacity(RESET_ATTRIBUTES.len() + data.len() - start);
        out.extend_from_slice(RESET_ATTRIBUTES);
        out.extend_from_slice(&data[start..]);
        out
    }

    /// True once per batch of new output; lets the periodic flusher skip idle terminals.
    pub fn take_dirty(&mut self) -> bool {
        std::mem::replace(&mut self.dirty, false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capture_times_always_grow() {
        let times: Vec<i64> = (0..1000).map(|_| capture_time()).collect();
        assert!(times.windows(2).all(|pair| pair[0] < pair[1]));
    }

    #[test]
    fn a_relaunch_starts_from_the_saved_history_and_is_not_dirty_for_it() {
        let mut sb = Scrollback::with_history(64, b"old\n");
        assert!(!sb.take_dirty());
        sb.push(b"new");
        assert!(sb.take_dirty());
        assert_eq!(sb.snapshot(), b"old\nnew");
    }

    #[test]
    fn keeps_everything_below_capacity() {
        let mut sb = Scrollback::new(16);
        sb.push(b"hello ");
        sb.push(b"world");
        assert_eq!(sb.snapshot(), b"hello world");
    }

    #[test]
    fn drops_oldest_bytes_and_replays_from_first_newline() {
        let mut sb = Scrollback::new(10);
        sb.push(b"\x1b[31mred\nline2\n");
        // 15 bytes into 10: the color escape is dropped, "red\nline2\n" is kept.
        assert_eq!(sb.snapshot(), b"\x1b[0mline2\n");
    }

    #[test]
    fn keeps_the_tail_of_a_chunk_larger_than_capacity() {
        let mut sb = Scrollback::new(4);
        sb.push(b"abcdef\ngh");
        assert_eq!(sb.snapshot(), b"\x1b[0mgh");
    }

    #[test]
    fn replays_whole_buffer_when_truncated_without_newline_or_escape() {
        let mut sb = Scrollback::new(4);
        sb.push(b"abcdefgh");
        assert_eq!(sb.snapshot(), b"\x1b[0mefgh");
    }

    #[test]
    fn skips_a_cut_escape_sequence_when_there_is_no_newline() {
        let mut sb = Scrollback::new(10);
        // The kept tail is "1mcd\x1b[0mef": "1m" is the end of a cut "\x1b[31m".
        sb.push(b"ab\x1b[31mcd\x1b[0mef");
        assert_eq!(sb.snapshot(), b"\x1b[0m\x1b[0mef");
    }

    #[test]
    fn empty_buffer_snapshot_is_empty() {
        let mut sb = Scrollback::new(4);
        sb.push(b"");
        assert!(sb.snapshot().is_empty());
    }

    #[test]
    fn dirty_flag_is_set_by_output_and_cleared_on_take() {
        let mut sb = Scrollback::new(8);
        assert!(!sb.take_dirty());
        sb.push(b"");
        assert!(!sb.take_dirty());
        sb.push(b"x");
        assert!(sb.take_dirty());
        assert!(!sb.take_dirty());
    }
}
