use tauri::State;

use crate::accounts::{self, Accounts, Profile};
use crate::db::Db;
use crate::error::AppResult;

#[tauri::command]
pub async fn accounts_list(db: State<'_, Db>) -> AppResult<Accounts> {
    db.with(|conn| accounts::load(conn))
}

#[tauri::command]
pub async fn account_add(
    db: State<'_, Db>,
    name: String,
    config_dir: String,
) -> AppResult<Profile> {
    db.with(|conn| accounts::add(conn, &name, &config_dir))
}

#[tauri::command]
pub async fn account_remove(db: State<'_, Db>, id: String) -> AppResult<()> {
    db.with(|conn| accounts::remove(conn, &id))
}

/// `None`: back to the default profile.
#[tauri::command]
pub async fn account_use(db: State<'_, Db>, id: Option<String>) -> AppResult<()> {
    db.with(|conn| accounts::set_active(conn, id.as_deref()))
}
