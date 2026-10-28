mod agents;
mod commands;
mod db;
mod error;
mod git;
mod i18n;
mod logging;
mod mission;
mod process;
mod pty;
mod review;
mod studio;
mod sync;

use std::time::Duration;

use tauri::{AppHandle, Manager, WebviewWindowBuilder};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

use db::Db;
use pty::PtyManager;

/// Spec §5.6: changed scrollbacks are written to SQLite every 10 s.
const SCROLLBACK_FLUSH_INTERVAL: Duration = Duration::from_secs(10);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    logging::install_panic_hook();
    let app = tauri::Builder::default()
        // First: the other plugins and the setup can already write to the log.
        .plugin(logging::plugin())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .manage(PtyManager::default())
        .setup(|app| {
            // Built here, not from the config, for the one thing the config cannot
            // say: the page reads the clipboard without WebView2's prompt, since
            // the radial menu's Coller has no Ctrl+V to carry it (spec menu radial §6.3).
            WebviewWindowBuilder::from_config(app.handle(), &app.config().app.windows[0])?
                .enable_clipboard_access()
                .build()?;
            log::info!(
                "OpenVibe {} on {} {}",
                app.package_info().version,
                std::env::consts::OS,
                std::env::consts::ARCH
            );
            let path = app.path().app_data_dir()?.join("openvibe.db");
            let db = match Db::open(&path) {
                Ok(db) => db,
                Err(err) => {
                    log::error!("base not opened: {err}");
                    // Spec §10: a blocking dialog with the file path, then stop.
                    let shown = path.display();
                    app.dialog()
                        .message(format!(
                            "Impossible d'ouvrir la base {shown} :\n{err}\n\nCannot open the database {shown}:\n{err}"
                        ))
                        .kind(MessageDialogKind::Error)
                        .title("OpenVibe")
                        .blocking_show();
                    return Err(err.into());
                }
            };
            app.manage(db);
            pty::env_path::refresh();
            spawn_scrollback_flusher(app.handle().clone());
            commands::agents::setup(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::ping,
            commands::app::open_log_dir,
            commands::app::open_data_dir,
            commands::app::diagnostics,
            i18n::set_language,
            commands::app::prepare_for_update,
            commands::pty::pty_spawn,
            commands::pty::pty_attach,
            commands::pty::pty_write,
            commands::pty::pty_send_text,
            commands::pty::pty_interrupt,
            commands::pty::pty_resize,
            commands::pty::pty_kill,
            commands::pty::pty_list,
            commands::pty::get_scrollback,
            commands::pty::refresh_path,
            commands::pty::list_agents,
            commands::pty::list_ollama_models,
            commands::pty::list_shells,
            commands::workspace::list_workspaces,
            commands::workspace::create_workspace,
            commands::workspace::rename_workspace,
            commands::workspace::delete_workspace,
            commands::workspace::load_workspace,
            commands::workspace::save_scene,
            commands::workspace::save_files,
            commands::workspace::save_node,
            commands::workspace::get_setting,
            commands::workspace::set_setting,
            commands::project::list_projects,
            commands::project::create_project,
            commands::project::rename_project,
            commands::project::relocate_project,
            commands::project::open_project,
            commands::project::delete_project,
            commands::workspace::set_workspace_pantheon,
            commands::git::git_status,
            commands::review::review_changes,
            commands::review::review_file_diff,
            commands::review::review_files,
            commands::review::review_read_file,
            commands::review::review_default_base,
            commands::studio::studio_tree,
            commands::studio::studio_read,
            commands::studio::studio_write,
            commands::mission::mission_prepare,
            commands::mission::mission_add_agent,
            commands::mission::mission_merge,
            commands::mission::mission_cleanup,
            commands::mission::mission_discard,
            commands::agents::agent_activity_snapshot,
            commands::agents::mcp_reply,
        ])
        .build(tauri::generate_context!())
        .expect("error while building the OpenVibe application");

    app.run(|handle, event| {
        // Agents must not outlive the window that shows them; their screens are
        // saved first so they can be shown again, stopped, on the next start.
        if let tauri::RunEvent::Exit = event {
            commands::pty::flush_scrollbacks(handle, true);
            handle.state::<PtyManager>().kill_all();
        }
    });
}

fn spawn_scrollback_flusher(app: AppHandle) {
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(SCROLLBACK_FLUSH_INTERVAL);
            commands::pty::flush_scrollbacks(&app, false);
        }
    });
}
