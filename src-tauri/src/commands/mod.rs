pub mod agents;
pub mod app;
pub mod git;
pub mod github;
pub mod mission;
pub mod project;
pub mod pty;
pub mod review;
#[cfg(all(test, windows))]
mod test_support;
pub mod workspace;

#[tauri::command]
pub fn ping() -> String {
    "pong".into()
}
