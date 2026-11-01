pub mod accounts;
pub mod agents;
pub mod app;
pub mod git;
pub mod github;
pub mod mission;
pub mod notes;
pub mod project;
pub mod pty;
pub mod repo;
pub mod review;
pub mod studio;
#[cfg(all(test, windows))]
mod test_support;
pub mod tokens;
pub mod workspace;

#[tauri::command]
pub fn ping() -> String {
    "pong".into()
}
