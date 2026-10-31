//! OpenVibe's MCP server (spec orchestrateur §4.1): JSON-RPC over one HTTP
//! POST, answered at once. Rust holds the transport and the caller's identity;
//! `tools/list` and `tools/call` are answered by the interface.

use crate::sync::lock;
use crate::tr;
use std::collections::HashMap;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc;

use serde_json::{Value, json};

/// Larger bodies are refused.
pub const MAX_BODY: usize = 256 * 1024;
/// The newest version, answered when the client names none we speak.
pub const PROTOCOL_VERSION: &str = "2025-06-18";

/// What the server does with one JSON-RPC message.
#[derive(Debug, Clone, PartialEq)]
pub enum Action {
    /// Answered here.
    Reply(Value),
    /// A notification, or a response to nothing we asked: 202, no body.
    Accept,
    /// Answered by the interface, for the calling node.
    Forward {
        id: Value,
        method: String,
        params: Value,
    },
}

/// The versions this server speaks, newest first.
pub const SUPPORTED_VERSIONS: [&str; 3] = [PROTOCOL_VERSION, "2025-03-26", "2024-11-05"];

pub fn action(message: &Value) -> Action {
    if !message.is_object() {
        return Action::Reply(failure(
            &Value::Null,
            -32600,
            &tr!("requête invalide", "invalid request"),
        ));
    }
    let Some(id) = message.get("id").cloned() else {
        return Action::Accept;
    };
    let Some(method) = message["method"].as_str() else {
        return Action::Accept;
    };
    // `params` is an object when present; `null` or anything else is refused.
    let params = match message.get("params") {
        None => json!({}),
        Some(params) if params.is_object() => params.clone(),
        Some(_) => {
            return Action::Reply(failure(
                &id,
                -32602,
                &tr!("paramètres invalides", "invalid params"),
            ));
        }
    };
    match method {
        "initialize" => {
            // The requested version if we speak it, else our newest.
            let version = params["protocolVersion"]
                .as_str()
                .filter(|asked| SUPPORTED_VERSIONS.contains(asked))
                .unwrap_or(PROTOCOL_VERSION);
            Action::Reply(reply(
                &id,
                json!({
                    "protocolVersion": version,
                    "capabilities": { "tools": {} },
                    "serverInfo": { "name": "openvibe", "version": env!("CARGO_PKG_VERSION") },
                }),
            ))
        }
        "ping" => Action::Reply(reply(&id, json!({}))),
        "tools/list" | "tools/call" => Action::Forward {
            id,
            method: method.to_string(),
            params,
        },
        other => Action::Reply(failure(
            &id,
            -32601,
            &tr!("méthode inconnue : {other}", "unknown method: {other}"),
        )),
    }
}

/// One JSON-RPC message, or a batch of them, to its HTTP status and body.
/// `call` answers `tools/list` and `tools/call` for the calling node.
pub fn handle(
    body: &[u8],
    mut call: impl FnMut(&str, Value) -> Result<Value, String>,
) -> (u16, Option<Value>) {
    let Ok(message) = serde_json::from_slice::<Value>(body) else {
        return (
            200,
            Some(failure(
                &Value::Null,
                -32700,
                &tr!("JSON invalide", "parse error"),
            )),
        );
    };
    let mut answer = |message: &Value| match action(message) {
        Action::Accept => None,
        Action::Reply(json) => Some(json),
        Action::Forward { id, method, params } => Some(match call(&method, params) {
            Ok(result) => reply(&id, result),
            Err(message) => failure(&id, -32603, &message),
        }),
    };
    match &message {
        Value::Array(batch) if batch.is_empty() => (
            200,
            Some(failure(
                &Value::Null,
                -32600,
                &tr!("lot vide", "empty batch"),
            )),
        ),
        Value::Array(batch) => {
            let replies: Vec<Value> = batch.iter().filter_map(&mut answer).collect();
            if replies.is_empty() {
                (202, None)
            } else {
                (200, Some(Value::Array(replies)))
            }
        }
        single => match answer(single) {
            Some(json) => (200, Some(json)),
            None => (202, None),
        },
    }
}

pub fn reply(id: &Value, result: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "result": result })
}

pub fn failure(id: &Value, code: i64, message: &str) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } })
}

/// The token of an `Authorization: Bearer <token>` header.
pub fn bearer(header: Option<&str>) -> Option<&str> {
    header?
        .strip_prefix("Bearer ")
        .map(str::trim)
        .filter(|token| !token.is_empty())
}

/// One token per Claude launch, naming its node; a relaunch revokes the old one.
#[derive(Default)]
pub struct Tokens(Mutex<HashMap<String, String>>);

impl Tokens {
    pub fn issue(&self, node_id: &str) -> String {
        let token = uuid::Uuid::new_v4().to_string();
        let mut tokens = lock(&self.0);
        tokens.retain(|_, node| node != node_id);
        tokens.insert(token.clone(), node_id.to_string());
        token
    }

    pub fn node(&self, token: &str) -> Option<String> {
        lock(&self.0).get(token).cloned()
    }

    pub fn revoke(&self, node_id: &str) {
        lock(&self.0).retain(|_, node| node != node_id);
    }
}

/// The calls waiting for the interface's answer.
#[derive(Default)]
pub struct Pending {
    next: AtomicU64,
    waiting: Mutex<HashMap<u64, mpsc::Sender<Value>>>,
}

impl Pending {
    pub fn open(&self) -> (u64, mpsc::Receiver<Value>) {
        let id = self.next.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = mpsc::channel();
        lock(&self.waiting).insert(id, tx);
        (id, rx)
    }

    /// False when nothing waits any more (answered too late).
    pub fn answer(&self, id: u64, value: Value) -> bool {
        match lock(&self.waiting).remove(&id) {
            Some(tx) => tx.send(value).is_ok(),
            None => false,
        }
    }

    pub fn close(&self, id: u64) {
        lock(&self.waiting).remove(&id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(body: &str) -> (u16, Option<Value>) {
        handle(body.as_bytes(), |method, params| {
            Ok(json!({ "method": method, "params": params }))
        })
    }

    #[test]
    fn invalid_json_is_a_parse_error_not_a_bare_400() {
        let (status, body) = run("not json");
        assert_eq!(status, 200);
        let body = body.unwrap();
        assert_eq!(body["error"]["code"], -32700);
        assert_eq!(body["id"], Value::Null);
    }

    #[test]
    fn null_params_are_invalid_params() {
        let (_, body) = run(r#"{"jsonrpc":"2.0","id":7,"method":"tools/call","params":null}"#);
        let body = body.unwrap();
        assert_eq!(body["error"]["code"], -32602);
        assert_eq!(body["id"], 7);
        let (_, body) = run(r#"{"jsonrpc":"2.0","id":8,"method":"tools/list"}"#);
        assert_eq!(body.unwrap()["result"]["params"], json!({}));
    }

    #[test]
    fn a_batch_is_answered_message_by_message() {
        let (status, body) = run(
            r#"[{"jsonrpc":"2.0","id":1,"method":"ping"},
                {"jsonrpc":"2.0","method":"notifications/initialized"},
                {"jsonrpc":"2.0","id":2,"method":"tools/list"}]"#,
        );
        assert_eq!(status, 200);
        let body = body.unwrap();
        let replies = body.as_array().unwrap();
        assert_eq!(replies.len(), 2);
        assert_eq!(replies[0]["id"], 1);
        assert_eq!(replies[1]["result"]["method"], "tools/list");
        let (status, body) = run(r#"[{"jsonrpc":"2.0","method":"notifications/initialized"}]"#);
        assert_eq!((status, body), (202, None));
        let (_, body) = run("[]");
        assert_eq!(body.unwrap()["error"]["code"], -32600);
        let (_, body) = run("42");
        assert_eq!(body.unwrap()["error"]["code"], -32600);
    }

    #[test]
    fn answers_a_version_it_speaks_and_its_newest_otherwise() {
        let version = |asked: &str| {
            let message = json!({
                "jsonrpc": "2.0", "id": 1, "method": "initialize",
                "params": { "protocolVersion": asked },
            });
            let (_, body) = run(&message.to_string());
            body.unwrap()["result"]["protocolVersion"].clone()
        };
        assert_eq!(version("2024-11-05"), "2024-11-05");
        assert_eq!(version("1999-01-01"), PROTOCOL_VERSION);
    }
}
