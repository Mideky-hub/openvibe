use serde::ser::{Serialize, SerializeStruct, Serializer};

/// Error returned by every Tauri command. Serialized as `{ kind, message }` so the
/// frontend can branch on `kind` without parsing human-readable text.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    InvalidInput(String),
    #[error("{0}")]
    NotFound(String),
    #[error("{0}")]
    Pty(String),
    /// An orchestrator without OpenVibe's tools and guards does not start (spec première version §4.1).
    #[error("{0}")]
    ToolsUnavailable(String),
    /// The `gh` CLI is missing, not logged in, or failed (Kanban GitHub sync).
    #[error("{0}")]
    Github(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Db(#[from] rusqlite::Error),
}

pub type AppResult<T> = Result<T, AppError>;

impl AppError {
    pub fn kind(&self) -> &'static str {
        match self {
            AppError::InvalidInput(_) => "invalidInput",
            AppError::NotFound(_) => "notFound",
            AppError::Pty(_) => "pty",
            AppError::ToolsUnavailable(_) => "toolsUnavailable",
            AppError::Github(_) => "github",
            AppError::Io(_) => "io",
            AppError::Db(_) => "db",
        }
    }
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut state = serializer.serialize_struct("AppError", 2)?;
        state.serialize_field("kind", self.kind())?;
        state.serialize_field("message", &self.to_string())?;
        state.end()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_orchestrator_without_its_tools_has_its_own_kind() {
        let json = serde_json::to_value(AppError::ToolsUnavailable("x".into())).unwrap();
        assert_eq!(
            json,
            serde_json::json!({ "kind": "toolsUnavailable", "message": "x" })
        );
    }

    #[test]
    fn serializes_as_kind_and_message() {
        let json = serde_json::to_value(AppError::NotFound("no such folder".into())).unwrap();
        assert_eq!(
            json,
            serde_json::json!({ "kind": "notFound", "message": "no such folder" })
        );
    }
}
