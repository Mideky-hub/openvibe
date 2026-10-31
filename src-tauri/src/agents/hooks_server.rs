//! The local HTTP endpoint the agents' hooks post to (spec habillage §10.3).
//! Bound to 127.0.0.1 on a port the system picks; every request must carry the
//! token drawn at startup.

use std::io::Read;
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::{Arc, Mutex};

use serde_json::Value;
use tiny_http::{Header, Method, Request, Response, Server};

use super::activity::{
    Activity, HookSource, claude_activity, claude_session_ended, codex_activity,
};
use super::mcp;

/// Larger bodies are refused (spec §10.3).
pub const MAX_BODY: usize = 64 * 1024;

/// A hook event that changes a terminal's activity.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HookHit {
    pub node_id: String,
    pub source: HookSource,
    pub activity: Activity,
    /// Claude left (`SessionEnd`): its shell's output decides again.
    pub session_ended: bool,
}

/// What the server reports, and the questions it forwards.
pub trait HookSink: Send + Sync + 'static {
    /// A hook event that changes a terminal's activity.
    fn hit(&self, hit: HookHit);
    /// A Claude session started (`true`) or ended (`false`) a subagent.
    fn subagent(&self, node_id: &str, started: bool);
    /// The node an MCP token was given to.
    fn mcp_node(&self, token: &str) -> Option<String>;
    /// `tools/list` or `tools/call` for a node, answered by the interface.
    fn mcp_call(&self, node_id: &str, method: &str, params: Value) -> Result<Value, String>;
    /// What a Claude session's status line was given: its usage (spec maj §6).
    fn status(&self, _node_id: &str, _status: Value) {}
}

/// The header that carries the token for callers given it through a curl
/// config file, so it never shows on a command line (spec première version §4.3).
pub const TOKEN_HEADER: &str = "X-OpenVibe-Token";

pub struct HookServer {
    pub port: u16,
    pub token: String,
}

impl HookServer {
    /// The URL a terminal's hooks post to, with the token: for Claude's
    /// settings file, never for a command line.
    pub fn url(&self, source: HookSource, node_id: &str) -> String {
        format!("{}?t={}", self.bare_url(source, node_id), self.token)
    }

    /// The same URL without the token, which then travels in `TOKEN_HEADER`.
    pub fn bare_url(&self, source: HookSource, node_id: &str) -> String {
        let kind = match source {
            HookSource::Claude => "claude",
            HookSource::Codex => "codex",
        };
        format!("http://127.0.0.1:{}/hook/{kind}/{node_id}", self.port)
    }

    /// The URL a Claude session's status line posts its JSON to (spec maj §6), with the token.
    #[cfg(test)]
    pub fn status_url(&self, node_id: &str) -> String {
        format!("{}?t={}", self.bare_status_url(node_id), self.token)
    }

    /// The status line's URL without the token, which then travels in `TOKEN_HEADER`.
    pub fn bare_status_url(&self, node_id: &str) -> String {
        format!("http://127.0.0.1:{}/status/{node_id}", self.port)
    }

    /// The URL of OpenVibe's MCP server (spec orchestrateur §4.1).
    pub fn mcp_url(&self) -> String {
        format!("http://127.0.0.1:{}/mcp", self.port)
    }
}

/// Past this announced length a request is abandoned, not answered: tiny_http
/// allocates what is left of a body when it drops a request, and an absurd
/// `Content-Length` would abort the whole application, token or not.
const MAX_ANNOUNCED_BODY: usize = 64 * 1024 * 1024;

/// Starts the server; every request is answered on its own thread: a tools call
/// waits for the interface, and a client that announces a body and sends none
/// holds its own thread, not the others. tiny_http reads what is left of that
/// body even for a refused caller.
pub fn start(sink: impl HookSink) -> std::io::Result<HookServer> {
    let server =
        Server::http("127.0.0.1:0").map_err(|err| std::io::Error::other(err.to_string()))?;
    let port = server
        .server_addr()
        .to_ip()
        .map(|addr| addr.port())
        .ok_or_else(|| std::io::Error::other("no TCP port for the hook server"))?;
    let token = uuid::Uuid::new_v4().to_string();
    let expected: Arc<str> = token.as_str().into();
    let sink = Arc::new(sink);
    std::thread::spawn(move || {
        for request in server.incoming_requests() {
            if request
                .body_length()
                .is_some_and(|length| length > MAX_ANNOUNCED_BODY)
            {
                log::warn!("request abandoned: its announced body is absurd");
                std::mem::forget(request);
                continue;
            }
            let sink = Arc::clone(&sink);
            if request.url().split('?').next() == Some("/mcp") {
                dispatch(request, move |request| answer_mcp(request, &*sink));
            } else {
                let expected = Arc::clone(&expected);
                dispatch(request, move |request| {
                    answer_hook(request, &expected, &*sink)
                });
            }
        }
    });
    Ok(HookServer { port, token })
}

/// A hook or a status line. A panic in the sink is answered 500 rather than
/// lost (backlog R1).
fn answer_hook(mut request: Request, token: &str, sink: &dyn HookSink) {
    let status = catch_unwind(AssertUnwindSafe(|| {
        if request.url().starts_with("/status/") {
            status_line_of(&mut request, token, sink)
        } else {
            status_of(&mut request, token, sink)
        }
    }))
    .unwrap_or(500);
    let _ = request.respond(Response::empty(status));
}

/// One thread per request. When the system refuses the thread, the caller is
/// told so (503) instead of the process panicking.
fn dispatch(request: Request, answer: impl FnOnce(Request) + Send + 'static) {
    dispatch_with(request, answer, |job| {
        std::thread::Builder::new()
            .name("local-request".into())
            .spawn(job)
            .map(drop)
    });
}

/// `spawn` starts the job; on failure the request is answered 503.
fn dispatch_with(
    request: Request,
    answer: impl FnOnce(Request) + Send + 'static,
    spawn: impl FnOnce(Box<dyn FnOnce() + Send>) -> std::io::Result<()>,
) {
    let slot = Arc::new(Mutex::new(Some(request)));
    let job_slot = Arc::clone(&slot);
    let job = Box::new(move || {
        if let Some(request) = crate::sync::lock(&job_slot).take() {
            answer(request);
        }
    });
    if let Err(err) = spawn(job) {
        log::error!("request not served, no thread: {err}");
        if let Some(request) = crate::sync::lock(&slot).take() {
            let _ = request.respond(Response::empty(503));
        }
    }
}

/// Node ids name files too: only the characters of our UUIDs pass.
pub fn valid_node_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// The token, from `TOKEN_HEADER` or from `?t=`.
fn authorized(query: &str, token: &str, header: Option<&str>) -> bool {
    header == Some(token)
        || query
            .split('&')
            .any(|pair| pair.strip_prefix("t=") == Some(token))
}

/// The value of `TOKEN_HEADER`, if the request has one.
fn token_header(request: &Request) -> Option<String> {
    request
        .headers()
        .iter()
        .find(|header| header.field.equiv(TOKEN_HEADER))
        .map(|header| header.value.as_str().to_string())
}

/// `/hook/<claude|codex>/<nodeId>`, the token in `?t=` or in `TOKEN_HEADER`.
/// The token is checked first (403), so nothing about the routes is told to a
/// caller without it; then 404.
pub fn parse_route(
    url: &str,
    token: &str,
    header: Option<&str>,
) -> Result<(HookSource, String), u16> {
    let (path, query) = url.split_once('?').unwrap_or((url, ""));
    if !authorized(query, token, header) {
        return Err(403);
    }
    let parts: Vec<&str> = path.trim_start_matches('/').split('/').collect();
    match parts.as_slice() {
        ["hook", "claude", node_id] if valid_node_id(node_id) => {
            Ok((HookSource::Claude, node_id.to_string()))
        }
        ["hook", "codex", node_id] if valid_node_id(node_id) => {
            Ok((HookSource::Codex, node_id.to_string()))
        }
        _ => Err(404),
    }
}

/// `/status/<nodeId>`, the token checked first as for hooks.
pub fn parse_status_route(url: &str, token: &str, header: Option<&str>) -> Result<String, u16> {
    let (path, query) = url.split_once('?').unwrap_or((url, ""));
    if !authorized(query, token, header) {
        return Err(403);
    }
    match path
        .trim_start_matches('/')
        .split('/')
        .collect::<Vec<_>>()
        .as_slice()
    {
        ["status", node_id] if valid_node_id(node_id) => Ok(node_id.to_string()),
        _ => Err(404),
    }
}

/// A body of at most `MAX_BODY` bytes, as JSON.
fn json_body(request: &mut Request) -> Result<Value, u16> {
    let mut body = Vec::new();
    if request
        .as_reader()
        .take(MAX_BODY as u64 + 1)
        .read_to_end(&mut body)
        .is_err()
    {
        return Err(400);
    }
    if body.len() > MAX_BODY {
        return Err(413);
    }
    serde_json::from_slice(&body).map_err(|_| 400)
}

fn status_line_of(request: &mut Request, token: &str, sink: &dyn HookSink) -> u16 {
    let header = token_header(request);
    let node_id = match parse_status_route(request.url(), token, header.as_deref()) {
        Ok(node_id) => node_id,
        Err(status) => return status,
    };
    if *request.method() != Method::Post {
        return 405;
    }
    match json_body(request) {
        Ok(json) => {
            sink.status(&node_id, json);
            204
        }
        Err(status) => status,
    }
}

fn status_of(request: &mut Request, token: &str, sink: &dyn HookSink) -> u16 {
    let header = token_header(request);
    let (source, node_id) = match parse_route(request.url(), token, header.as_deref()) {
        Ok(route) => route,
        Err(status) => return status,
    };
    if *request.method() != Method::Post {
        return 405;
    }
    let mut body = Vec::new();
    if request
        .as_reader()
        .take(MAX_BODY as u64 + 1)
        .read_to_end(&mut body)
        .is_err()
    {
        return 400;
    }
    if body.len() > MAX_BODY {
        return 413;
    }
    let Ok(json) = serde_json::from_slice::<serde_json::Value>(&body) else {
        return 400;
    };
    let (activity, session_ended) = match source {
        HookSource::Claude => {
            let event = json["hook_event_name"].as_str().unwrap_or_default();
            if matches!(event, "SubagentStart" | "SubagentStop") {
                sink.subagent(&node_id, event == "SubagentStart");
                return 204;
            }
            if claude_session_ended(event, json["reason"].as_str()) {
                (Some(Activity::Idle), true)
            } else {
                (
                    claude_activity(event, json["notification_type"].as_str()),
                    false,
                )
            }
        }
        HookSource::Codex => (
            codex_activity(json["type"].as_str().unwrap_or_default()),
            false,
        ),
    };
    if let Some(activity) = activity {
        sink.hit(HookHit {
            node_id,
            source,
            activity,
            session_ended,
        });
    }
    204
}

fn answer_mcp(mut request: Request, sink: &dyn HookSink) {
    let (status, body) =
        catch_unwind(AssertUnwindSafe(|| mcp_response(&mut request, sink))).unwrap_or((500, None));
    let mut response = Response::from_data(
        body.map(|json| json.to_string().into_bytes())
            .unwrap_or_default(),
    )
    .with_status_code(status);
    if status == 200 {
        response = response.with_header(
            Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap(),
        );
    }
    let _ = request.respond(response);
}

/// The token names the calling node (401 first, like the hooks' 403).
fn mcp_response(request: &mut Request, sink: &dyn HookSink) -> (u16, Option<Value>) {
    let header = request
        .headers()
        .iter()
        .find(|header| header.field.equiv("Authorization"))
        .map(|header| header.value.as_str().to_string());
    let Some(node_id) = mcp::bearer(header.as_deref()).and_then(|token| sink.mcp_node(token))
    else {
        return (401, None);
    };
    if *request.method() != Method::Post {
        return (405, None);
    }
    let mut body = Vec::new();
    if request
        .as_reader()
        .take(mcp::MAX_BODY as u64 + 1)
        .read_to_end(&mut body)
        .is_err()
    {
        return (400, None);
    }
    if body.len() > mcp::MAX_BODY {
        return (413, None);
    }
    mcp::handle(&body, |method, params| {
        sink.mcp_call(&node_id, method, params)
    })
}

#[cfg(test)]
mod tests {
    use std::io::{Read, Write};
    use std::net::TcpStream;
    use std::sync::{Arc, Mutex, mpsc};
    use std::time::Duration;

    use super::*;

    const TOKEN: &str = "0b9c4b5e-6f1a-4c39-9d2e-8f6c2d1a7e10";

    #[test]
    fn routes_a_hook_to_its_terminal() {
        assert_eq!(
            parse_route(&format!("/hook/claude/node-1?t={TOKEN}"), TOKEN, None),
            Ok((HookSource::Claude, "node-1".to_string()))
        );
        assert_eq!(
            parse_route(&format!("/hook/codex/abc_2?x=1&t={TOKEN}"), TOKEN, None),
            Ok((HookSource::Codex, "abc_2".to_string()))
        );
    }

    #[test]
    fn takes_the_token_from_its_header_too() {
        assert_eq!(
            parse_route("/hook/codex/n1", TOKEN, Some(TOKEN)),
            Ok((HookSource::Codex, "n1".to_string()))
        );
        assert_eq!(parse_route("/hook/codex/n1", TOKEN, Some("bad")), Err(403));
        assert_eq!(parse_route("/hook/codex/n1", TOKEN, None), Err(403));
        assert_eq!(
            parse_status_route("/status/n1", TOKEN, Some(TOKEN)),
            Ok("n1".to_string())
        );
        assert_eq!(
            parse_status_route("/status/n1", TOKEN, Some("bad")),
            Err(403)
        );
    }

    #[test]
    fn routes_a_status_line_to_its_terminal() {
        assert_eq!(
            parse_status_route(&format!("/status/n1?t={TOKEN}"), TOKEN, None),
            Ok("n1".into())
        );
        assert_eq!(
            parse_status_route("/status/n1?t=nope", TOKEN, None),
            Err(403)
        );
        assert_eq!(
            parse_status_route(&format!("/status/..?t={TOKEN}"), TOKEN, None),
            Err(404)
        );
        assert_eq!(
            parse_status_route(&format!("/status/a/b?t={TOKEN}"), TOKEN, None),
            Err(404)
        );
    }

    #[test]
    fn refuses_a_missing_or_wrong_token_before_anything_else() {
        assert_eq!(parse_route("/hook/claude/node-1", TOKEN, None), Err(403));
        assert_eq!(
            parse_route("/hook/claude/node-1?t=nope", TOKEN, None),
            Err(403)
        );
        assert_eq!(parse_route("/nothing?t=nope", TOKEN, None), Err(403));
    }

    #[test]
    fn refuses_unknown_routes_and_doubtful_node_ids() {
        for path in [
            "/hook/gemini/n",
            "/hook/claude",
            "/hook/claude/a/b",
            "/hook/claude/..",
            "/hook/claude/%2e%2e",
            "/other/claude/n",
        ] {
            assert_eq!(
                parse_route(&format!("{path}?t={TOKEN}"), TOKEN, None),
                Err(404),
                "{path}"
            );
        }
        assert!(!valid_node_id("../x"));
        assert!(!valid_node_id(""));
        assert!(valid_node_id("0b9c4b5e-6f1a-4c39-9d2e-8f6c2d1a7e10"));
    }

    struct TestSink {
        hits: Mutex<mpsc::Sender<HookHit>>,
        subagents: Mutex<Vec<(String, bool)>>,
        statuses: Mutex<Vec<(String, serde_json::Value)>>,
    }

    impl TestSink {
        fn new(hits: mpsc::Sender<HookHit>) -> Self {
            Self {
                hits: Mutex::new(hits),
                subagents: Mutex::new(Vec::new()),
                statuses: Mutex::new(Vec::new()),
            }
        }
    }

    impl HookSink for Arc<TestSink> {
        fn hit(&self, hit: HookHit) {
            let _ = self.hits.lock().unwrap().send(hit);
        }
        fn subagent(&self, node_id: &str, started: bool) {
            self.subagents
                .lock()
                .unwrap()
                .push((node_id.to_string(), started));
        }
        fn mcp_node(&self, token: &str) -> Option<String> {
            token.strip_prefix("tok-").map(str::to_string)
        }
        fn status(&self, node_id: &str, status: serde_json::Value) {
            assert_ne!(node_id, "boom", "a sink that panics");
            self.statuses
                .lock()
                .unwrap()
                .push((node_id.to_string(), status));
        }
        fn mcp_call(
            &self,
            node_id: &str,
            method: &str,
            params: serde_json::Value,
        ) -> Result<serde_json::Value, String> {
            assert_ne!(node_id, "boom", "a sink that panics");
            if node_id == "slow" {
                return Err("OpenVibe ne répond pas".into());
            }
            Ok(serde_json::json!({ "node": node_id, "method": method, "params": params }))
        }
    }

    /// One raw HTTP/1.1 request; returns the status code.
    fn send(port: u16, method: &str, path: &str, body: &[u8]) -> u16 {
        send_headed(port, method, path, "", body)
    }

    /// `extra`: header lines, each ending with CRLF.
    fn send_headed(port: u16, method: &str, path: &str, extra: &str, body: &[u8]) -> u16 {
        let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
        stream
            .set_read_timeout(Some(Duration::from_secs(5)))
            .unwrap();
        let head = format!(
            "{method} {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\n{extra}Content-Length: {}\r\nConnection: close\r\n\r\n",
            body.len()
        );
        stream.write_all(head.as_bytes()).unwrap();
        let _ = stream.write_all(body);
        let mut response = String::new();
        let _ = stream.read_to_string(&mut response);
        response
            .split_whitespace()
            .nth(1)
            .unwrap_or("0")
            .parse()
            .unwrap()
    }

    #[test]
    fn answers_hooks_and_reports_their_activity() {
        let (tx, rx) = mpsc::channel();
        let server = start(Arc::new(TestSink::new(tx))).unwrap();
        let claude = server.url(HookSource::Claude, "n1");
        let path = claude.trim_start_matches(&format!("http://127.0.0.1:{}", server.port));

        assert_eq!(
            send(
                server.port,
                "POST",
                path,
                br#"{"hook_event_name":"UserPromptSubmit"}"#
            ),
            204
        );
        assert_eq!(
            rx.recv_timeout(Duration::from_secs(5)).unwrap(),
            HookHit {
                node_id: "n1".into(),
                source: HookSource::Claude,
                activity: Activity::Working,
                session_ended: false,
            }
        );
        let waiting =
            br#"{"hook_event_name":"Notification","notification_type":"permission_prompt"}"#;
        assert_eq!(send(server.port, "POST", path, waiting), 204);
        assert_eq!(
            rx.recv_timeout(Duration::from_secs(5)).unwrap().activity,
            Activity::Waiting
        );
        let ended = br#"{"hook_event_name":"SessionEnd","reason":"prompt_input_exit"}"#;
        assert_eq!(send(server.port, "POST", path, ended), 204);
        assert!(
            rx.recv_timeout(Duration::from_secs(5))
                .unwrap()
                .session_ended
        );
        // `/clear` goes on in the same process: no hit, the next one is Codex's.
        let cleared = br#"{"hook_event_name":"SessionEnd","reason":"clear"}"#;
        assert_eq!(send(server.port, "POST", path, cleared), 204);

        let codex = server.url(HookSource::Codex, "n2");
        let codex_path = codex.trim_start_matches(&format!("http://127.0.0.1:{}", server.port));
        assert_eq!(
            send(
                server.port,
                "POST",
                codex_path,
                br#"{"type":"agent-turn-complete"}"#
            ),
            204
        );
        assert_eq!(
            rx.recv_timeout(Duration::from_secs(5)).unwrap(),
            HookHit {
                node_id: "n2".into(),
                source: HookSource::Codex,
                activity: Activity::Idle,
                session_ended: false,
            }
        );
    }

    #[test]
    fn passes_a_status_line_s_json_to_its_terminal() {
        let (tx, _rx) = mpsc::channel();
        let sink = Arc::new(TestSink::new(tx));
        let server = start(Arc::clone(&sink)).unwrap();
        let url = server.status_url("n1");
        let path = url
            .trim_start_matches(&format!("http://127.0.0.1:{}", server.port))
            .to_string();
        let body = br#"{"session_id":"s1","rate_limits":{}}"#;
        assert_eq!(send(server.port, "POST", &path, body), 204);
        assert_eq!(send(server.port, "GET", &path, b""), 405);
        assert_eq!(send(server.port, "POST", &path, b"{"), 400);
        assert_eq!(send(server.port, "POST", "/status/n1?t=wrong", b"{}"), 403);
        assert_eq!(
            *sink.statuses.lock().unwrap(),
            vec![(
                "n1".to_string(),
                serde_json::json!({ "session_id": "s1", "rate_limits": {} })
            )]
        );
    }

    #[test]
    fn a_status_line_posting_its_token_in_a_header_is_heard() {
        let (tx, _rx) = mpsc::channel();
        let sink = Arc::new(TestSink::new(tx));
        let server = start(Arc::clone(&sink)).unwrap();
        let bare = server.bare_status_url("n1");
        assert_eq!(bare, format!("http://127.0.0.1:{}/status/n1", server.port));
        assert_eq!(
            server.bare_url(HookSource::Codex, "n1"),
            format!("http://127.0.0.1:{}/hook/codex/n1", server.port)
        );
        let header = format!("{TOKEN_HEADER}: {}\r\n", server.token);
        assert_eq!(
            send_headed(server.port, "POST", "/status/n1", &header, b"{}"),
            204
        );
        let wrong = format!("{TOKEN_HEADER}: nope\r\n");
        assert_eq!(
            send_headed(server.port, "POST", "/status/n1", &wrong, b"{}"),
            403
        );
    }

    #[test]
    fn rejects_bad_requests_without_reporting_anything() {
        let (tx, rx) = mpsc::channel();
        let server = start(Arc::new(TestSink::new(tx))).unwrap();
        let path = format!("/hook/claude/n1?t={}", server.token);
        assert_eq!(
            send(server.port, "POST", "/hook/claude/n1?t=wrong", b"{}"),
            403
        );
        assert_eq!(send(server.port, "GET", &path, b""), 405);
        assert_eq!(
            send(
                server.port,
                "POST",
                &format!("/hook/claude/..?t={}", server.token),
                b"{}"
            ),
            404
        );
        assert_eq!(send(server.port, "POST", &path, b"not json"), 400);
        let huge = vec![b' '; MAX_BODY + 1];
        assert_eq!(send(server.port, "POST", &path, &huge), 413);
        // An event OpenVibe does not track is accepted and ignored.
        assert_eq!(
            send(
                server.port,
                "POST",
                &path,
                br#"{"hook_event_name":"SessionStart"}"#
            ),
            204
        );
        assert!(rx.recv_timeout(Duration::from_millis(300)).is_err());
    }

    /// One raw HTTP/1.1 request with extra headers; returns the status and the body.
    fn exchange(
        port: u16,
        method: &str,
        path: &str,
        headers: &[(&str, &str)],
        body: &[u8],
    ) -> (u16, String) {
        let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
        stream
            .set_read_timeout(Some(Duration::from_secs(5)))
            .unwrap();
        let extra: String = headers
            .iter()
            .map(|(k, v)| format!("{k}: {v}\r\n"))
            .collect();
        let head = format!(
            "{method} {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\n{extra}Content-Length: {}\r\nConnection: close\r\n\r\n",
            body.len()
        );
        stream.write_all(head.as_bytes()).unwrap();
        let _ = stream.write_all(body);
        let mut response = String::new();
        let _ = stream.read_to_string(&mut response);
        let status = response
            .split_whitespace()
            .nth(1)
            .unwrap_or("0")
            .parse()
            .unwrap();
        let body = response
            .split_once("\r\n\r\n")
            .map(|(_, b)| b.to_string())
            .unwrap_or_default();
        (status, body)
    }

    #[test]
    fn serves_mcp_to_the_node_a_token_was_given_to() {
        let (tx, _rx) = mpsc::channel();
        let server = start(Arc::new(TestSink::new(tx))).unwrap();
        assert_eq!(
            server.mcp_url(),
            format!("http://127.0.0.1:{}/mcp", server.port)
        );
        let auth = [("Authorization", "Bearer tok-n1")];
        let (status, body) = exchange(
            server.port,
            "POST",
            "/mcp",
            &auth,
            br#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"#,
        );
        assert_eq!(status, 200);
        let json: serde_json::Value = serde_json::from_str(&body).unwrap();
        assert_eq!(json["result"]["serverInfo"]["name"], "openvibe");
        let (status, body) = exchange(
            server.port,
            "POST",
            "/mcp",
            &auth,
            br#"{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"etape"}}"#,
        );
        assert_eq!(status, 200);
        let json: serde_json::Value = serde_json::from_str(&body).unwrap();
        assert_eq!(
            json["result"],
            serde_json::json!({ "node": "n1", "method": "tools/call", "params": { "name": "etape" } })
        );
        let (status, _) = exchange(
            server.port,
            "POST",
            "/mcp",
            &auth,
            br#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#,
        );
        assert_eq!(status, 202);
        let slow = [("Authorization", "Bearer tok-slow")];
        let (_, body) = exchange(
            server.port,
            "POST",
            "/mcp",
            &slow,
            br#"{"jsonrpc":"2.0","id":3,"method":"tools/list"}"#,
        );
        let json: serde_json::Value = serde_json::from_str(&body).unwrap();
        assert_eq!(json["error"]["message"], "OpenVibe ne répond pas");
    }

    #[test]
    fn refuses_mcp_without_a_known_token_and_counts_subagents() {
        let (tx, _rx) = mpsc::channel();
        let sink = Arc::new(TestSink::new(tx));
        let server = start(Arc::clone(&sink)).unwrap();
        assert_eq!(exchange(server.port, "POST", "/mcp", &[], b"{}").0, 401);
        assert_eq!(
            exchange(
                server.port,
                "POST",
                "/mcp",
                &[("Authorization", "Bearer nope")],
                b"{}"
            )
            .0,
            401
        );
        assert_eq!(
            exchange(
                server.port,
                "GET",
                "/mcp",
                &[("Authorization", "Bearer tok-n1")],
                b""
            )
            .0,
            405
        );
        assert_eq!(
            exchange(
                server.port,
                "POST",
                "/mcp",
                &[("Authorization", "Bearer tok-n1")],
                b"not json"
            )
            .0,
            200
        );
        let path = format!("/hook/claude/n1?t={}", server.token);
        assert_eq!(
            send(
                server.port,
                "POST",
                &path,
                br#"{"hook_event_name":"SubagentStart","agent_type":"Explore"}"#
            ),
            204
        );
        assert_eq!(
            send(
                server.port,
                "POST",
                &path,
                br#"{"hook_event_name":"SubagentStop","agent_type":"Explore"}"#
            ),
            204
        );
        assert_eq!(
            *sink.subagents.lock().unwrap(),
            vec![("n1".to_string(), true), ("n1".to_string(), false)]
        );
    }

    #[test]
    fn a_panic_while_answering_gives_a_500_and_the_server_goes_on() {
        let (tx, _rx) = mpsc::channel();
        let sink = Arc::new(TestSink::new(tx));
        let server = start(Arc::clone(&sink)).unwrap();
        let header = format!("{TOKEN_HEADER}: {}\r\n", server.token);
        assert_eq!(
            send_headed(server.port, "POST", "/status/boom", &header, b"{}"),
            500
        );
        let mcp = [("Authorization", "Bearer tok-boom")];
        let call = br#"{"jsonrpc":"2.0","id":1,"method":"tools/list"}"#;
        assert_eq!(exchange(server.port, "POST", "/mcp", &mcp, call).0, 500);
        // Still serving.
        assert_eq!(
            send_headed(server.port, "POST", "/status/n1", &header, b"{}"),
            204
        );
        let ok = [("Authorization", "Bearer tok-n1")];
        assert_eq!(exchange(server.port, "POST", "/mcp", &ok, call).0, 200);
    }

    #[test]
    fn a_request_without_a_thread_is_answered_503() {
        // A listener of our own, its spawner always failing.
        let probe = Server::http("127.0.0.1:0").unwrap();
        let port = probe.server_addr().to_ip().unwrap().port();
        let mut client = TcpStream::connect(("127.0.0.1", port)).unwrap();
        client
            .set_read_timeout(Some(Duration::from_secs(5)))
            .unwrap();
        client
            .write_all(
                b"POST /mcp HTTP/1.1\r\nHost: x\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
            )
            .unwrap();
        let request = probe.recv().unwrap();
        dispatch_with(
            request,
            |_| panic!("must not run"),
            |_| Err(std::io::Error::other("no thread")),
        );
        let mut response = String::new();
        let _ = client.read_to_string(&mut response);
        assert!(response.starts_with("HTTP/1.1 503"), "{response}");
    }

    #[test]
    fn a_client_stalling_on_its_body_does_not_hold_the_others_up() {
        let (tx, _rx) = mpsc::channel();
        let server = start(Arc::new(TestSink::new(tx))).unwrap();
        // Past 1024 bytes: tiny_http reads smaller bodies itself, before the server sees them.
        let path = format!("/status/n1?t={}", server.token);
        let stalled = announce(server.port, &path, 100_000);

        let (done, finished) = mpsc::channel();
        let port = server.port;
        std::thread::spawn(move || {
            let mcp = [("Authorization", "Bearer tok-n1")];
            let call = br#"{"jsonrpc":"2.0","id":1,"method":"ping"}"#;
            let _ = done.send(exchange(port, "POST", "/mcp", &mcp, call).0);
        });
        assert_eq!(
            finished.recv_timeout(Duration::from_secs(3)),
            Ok(200),
            "a stalled hook client blocks the server loop"
        );
        let header = format!("{TOKEN_HEADER}: {}\r\n", server.token);
        assert_eq!(
            send_headed(server.port, "POST", "/status/n1", &header, b"{}"),
            204
        );
        drop(stalled);
    }

    /// Announces a body, sends none of it, and keeps the connection open.
    fn announce(port: u16, path: &str, length: u64) -> TcpStream {
        let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
        let head = format!("POST {path} HTTP/1.1\r\nHost: x\r\nContent-Length: {length}\r\n\r\n");
        stream.write_all(head.as_bytes()).unwrap();
        std::thread::sleep(Duration::from_millis(200));
        stream
    }

    /// Whether the server still serves, hooks and MCP, within a few seconds.
    fn still_serving(port: u16, token: &str) -> bool {
        let (done, finished) = mpsc::channel();
        let token = token.to_string();
        std::thread::spawn(move || {
            let mcp = [("Authorization", "Bearer tok-n1")];
            let call = br#"{"jsonrpc":"2.0","id":1,"method":"ping"}"#;
            let header = format!("{TOKEN_HEADER}: {token}\r\n");
            let _ = done.send((
                exchange(port, "POST", "/mcp", &mcp, call).0,
                send_headed(port, "POST", "/status/n1", &header, b"{}"),
            ));
        });
        finished.recv_timeout(Duration::from_secs(3)) == Ok((200, 204))
    }

    #[test]
    fn a_caller_without_the_token_cannot_stall_the_server() {
        let (tx, _rx) = mpsc::channel();
        let server = start(Arc::new(TestSink::new(tx))).unwrap();
        let stalled = announce(server.port, "/status/n1", 100_000);
        assert!(
            still_serving(server.port, &server.token),
            "a client without the token blocks the server loop"
        );
        drop(stalled);
    }

    /// tiny_http allocates what is left of an announced body when it drops the
    /// request: an absurd length aborts the whole application, agents included.
    #[test]
    fn an_absurd_announced_length_does_not_bring_the_application_down() {
        let (tx, _rx) = mpsc::channel();
        let server = start(Arc::new(TestSink::new(tx))).unwrap();
        let mut stalled = Vec::new();
        for path in ["/status/n1", "/hook/claude/n1", "/mcp"] {
            stalled.push(announce(server.port, path, 9_000_000_000_000_000));
        }
        assert!(still_serving(server.port, &server.token));
        drop(stalled);
    }

    #[test]
    fn many_agents_calling_at_once_are_all_answered() {
        let (tx, _rx) = mpsc::channel();
        let server = start(Arc::new(TestSink::new(tx))).unwrap();
        let port = server.port;
        let token = server.token.clone();
        let workers: Vec<_> = (0..48)
            .map(|i| {
                let token = token.clone();
                std::thread::spawn(move || {
                    let node = format!("tok-n{}", i % 8);
                    let auth = [("Authorization", node.as_str())];
                    let auth = [(auth[0].0, format!("Bearer {}", auth[0].1))];
                    let call = br#"{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"etape"}}"#;
                    let mcp = exchange(port, "POST", "/mcp", &[(auth[0].0, auth[0].1.as_str())], call).0;
                    let header = format!("{TOKEN_HEADER}: {token}\r\n");
                    let hook = send_headed(port, "POST", "/status/n1", &header, b"{}");
                    (mcp, hook)
                })
            })
            .collect();
        for worker in workers {
            assert_eq!(worker.join().unwrap(), (200, 204));
        }
    }
}
