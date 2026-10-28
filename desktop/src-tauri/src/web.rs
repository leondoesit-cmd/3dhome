//! The `mf` scheme: the app's static files plus the machine-local `/api` routes.
//! File rules mirror `server/security.mjs` `safeStaticFile`: private names are
//! refused before and after canonicalization, then only the top-level entries
//! in `server/public_paths.json` (shared with the relay) are served.

use std::{
    borrow::Cow,
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex, Weak},
};

use tauri::http::{header, Request, Response, StatusCode};
use tauri::{AppHandle, Manager, Runtime};

use crate::backup::Backups;
use crate::materials::{CacheError, Materials};
use crate::workers::Prefetch;

const PUBLIC_PATHS: &str = include_str!("../../../server/public_paths.json");

pub type Reply = Response<Cow<'static, [u8]>>;

const BACKUP_BODY_CAP: usize = 96 * 1024 * 1024;
const API_BODY_CAP: usize = 1024 * 1024;

fn app_origin() -> &'static str {
    if cfg!(target_os = "windows") {
        "http://mf.localhost"
    } else {
        "mf://localhost"
    }
}

pub fn navigation_allowed(url: &tauri::Url) -> bool {
    url.username().is_empty()
        && url.password().is_none()
        && url.port().is_none()
        && matches!(
            (url.scheme(), url.host_str()),
            ("mf", Some("localhost")) | ("http", Some("mf.localhost"))
        )
}

fn app_authority(request: &Request<Vec<u8>>) -> bool {
    let uri = request.uri();
    let expected = if cfg!(target_os = "windows") {
        ("http", "mf.localhost")
    } else {
        ("mf", "localhost")
    };
    // Wry restores mf://localhost before dispatching WebView2 requests.
    ((uri.scheme_str() == Some("mf") && uri.authority().map(|a| a.as_str()) == Some("localhost"))
        || (uri.scheme_str() == Some(expected.0)
            && uri.authority().map(|a| a.as_str()) == Some(expected.1)))
        && request
            .headers()
            .get_all(header::HOST)
            .iter()
            .all(|v| v.as_bytes() == expected.1.as_bytes())
}

#[derive(Clone)]
pub struct Site {
    root: Arc<PathBuf>,
    files: Arc<HashSet<String>>,
    dirs: Arc<HashSet<String>>,
    backups: Arc<Backups>,
    pub(crate) materials: Arc<Materials>,
    pub(crate) prefetch: Arc<Mutex<Weak<Prefetch>>>,
}

/// Debug builds serve the checkout itself, so edits show on reload; release
/// builds serve the copy bundled under the resource directory.
pub fn app_root<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<PathBuf> {
    if cfg!(debug_assertions) {
        Ok(Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join(".."))
    } else {
        Ok(app.path().resource_dir()?.join("web"))
    }
}

/// Runs before the app's own scripts. `js/net.js` reads `relayUrl` for
/// multiplayer, because this origin serves files, not WebSockets.
pub fn desktop_script() -> String {
    let relay = std::env::var("MF_RELAY_URL")
        .ok()
        .or_else(|| option_env!("MF_RELAY_URL").map(String::from))
        .unwrap_or_default();
    format!(
        "window.__MF_DESKTOP__ = Object.freeze({{ relayUrl: {} }});",
        serde_json::Value::String(relay)
    )
}

impl Site {
    pub fn new(root: PathBuf, backup_dir: PathBuf) -> Self {
        let paths: serde_json::Value =
            serde_json::from_str(PUBLIC_PATHS).expect("server/public_paths.json is valid JSON");
        let names = |key: &str| -> HashSet<String> {
            paths[key]
                .as_array()
                .map(|list| {
                    list.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect()
                })
                .unwrap_or_default()
        };
        let root = fs::canonicalize(&root).unwrap_or(root);
        Site {
            root: Arc::new(root),
            files: Arc::new(names("files")),
            dirs: Arc::new(names("dirs")),
            materials: Arc::new(Materials::new(
                backup_dir
                    .parent()
                    .unwrap_or(&backup_dir)
                    .join("material-cache"),
            )),
            prefetch: Arc::new(Mutex::new(Weak::new())),
            backups: Arc::new(Backups::new(backup_dir)),
        }
    }

    pub fn handle(&self, request: Request<Vec<u8>>) -> Reply {
        if let Some(reply) = self.preflight(&request) {
            return reply;
        }
        let path = request.uri().path().to_string();
        if path == "/api" || path.starts_with("/api/") {
            return self.api(&request, &path);
        }
        let head = request.method() == "HEAD";
        if request.method() != "GET" && !head {
            return text(StatusCode::METHOD_NOT_ALLOWED, "GET only");
        }
        // WebView2 asks for /favicon.ico on its own; the app has none at the root.
        if path == "/favicon.ico" {
            return Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, "image/png")
                .body(Cow::Borrowed(&include_bytes!("../icons/32x32.png")[..]))
                .expect("icon response");
        }
        // Material spelling is exact even on case-insensitive filesystems.
        if percent_decode(&path).is_some_and(|p| {
            p.trim_start_matches('/')
                .to_ascii_lowercase()
                .starts_with("assets/materials/")
        }) && self.material_path(&path).is_none()
        {
            return text(StatusCode::NOT_FOUND, "not found");
        }
        let Some(file) = self.file(&path) else {
            if !head {
                if let Some(key) = self.material_path(&path) {
                    return match self.materials.get(&key) {
                        Ok(body) => Response::builder()
                            .status(StatusCode::OK)
                            .header(header::CONTENT_TYPE, mime(Path::new(&key)))
                            .header(header::CACHE_CONTROL, "no-cache")
                            .body(Cow::Owned(body.as_ref().clone()))
                            .expect("material response"),
                        Err(CacheError::Missing) => text(StatusCode::NOT_FOUND, "not found"),
                        Err(CacheError::Offline(error)) => json(
                            StatusCode::SERVICE_UNAVAILABLE,
                            serde_json::json!({ "error": error }),
                        ),
                        Err(CacheError::Failed(error)) => json(
                            StatusCode::BAD_GATEWAY,
                            serde_json::json!({ "error": error }),
                        ),
                    };
                }
            }
            return text(StatusCode::NOT_FOUND, "not found");
        };
        match fs::read(&file) {
            Ok(body) => Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, mime(&file))
                .header(header::CACHE_CONTROL, "no-cache")
                .body(Cow::Owned(if head { Vec::new() } else { body }))
                .expect("static response"),
            Err(_) => text(StatusCode::NOT_FOUND, "not found"),
        }
    }

    pub fn preflight(&self, request: &Request<Vec<u8>>) -> Option<Reply> {
        let path = request.uri().path();
        if path != "/api" && !path.starts_with("/api/") {
            return None;
        }
        let origins = request.headers().get_all(header::ORIGIN);
        let mut origins = origins.iter();
        let origin = origins.next();
        if !app_authority(request)
            || origins.next().is_some()
            || origin.is_some_and(|v| v.as_bytes() != app_origin().as_bytes())
            || (request.method() != "GET" && origin.is_none())
        {
            return Some(json(
                StatusCode::FORBIDDEN,
                serde_json::json!({ "error": "origin" }),
            ));
        }
        let cap = if path == "/api/model-backup" && request.method() == "POST" {
            BACKUP_BODY_CAP
        } else {
            API_BODY_CAP
        };
        if request.body().len() > cap {
            return Some(json(
                StatusCode::PAYLOAD_TOO_LARGE,
                serde_json::json!({ "error": "body too large" }),
            ));
        }
        None
    }

    fn api(&self, request: &Request<Vec<u8>>, path: &str) -> Reply {
        match path {
            "/api/ping" if request.method() == "GET" => {
                let mut api = vec!["model-backup"];
                if self.materials.enabled() {
                    api.push("material-cache");
                }
                json(
                    StatusCode::OK,
                    serde_json::json!({ "ok": true, "api": api, "desktop": true }),
                )
            }
            "/api/ping" => json(
                StatusCode::METHOD_NOT_ALLOWED,
                serde_json::json!({ "error": "GET only" }),
            ),
            "/api/model-backup" => {
                let (status, body) = self.backups.handle(request);
                json(status, body)
            }
            "/api/material-cache" if request.method() == "GET" => {
                let mut info = self.materials.info();
                info["pending"] = self
                    .prefetch
                    .lock()
                    .unwrap()
                    .upgrade()
                    .map_or(0, |prefetch| prefetch.pending())
                    .into();
                json(StatusCode::OK, info)
            }
            "/api/material-cache/prefetch" if request.method() == "POST" => {
                let payload: serde_json::Value = match serde_json::from_slice(request.body()) {
                    Ok(payload) => payload,
                    Err(_) => {
                        return json(
                            StatusCode::BAD_REQUEST,
                            serde_json::json!({ "error": "invalid JSON" }),
                        )
                    }
                };
                let Some(paths) = payload["paths"].as_array().filter(|p| p.len() <= 1000) else {
                    return json(
                        StatusCode::BAD_REQUEST,
                        serde_json::json!({ "error": "paths[] required (maximum 1000)" }),
                    );
                };
                if paths
                    .iter()
                    .any(|p| !p.as_str().is_some_and(|p| self.materials.contains(p)))
                {
                    return json(
                        StatusCode::BAD_REQUEST,
                        serde_json::json!({ "error": "unknown material path" }),
                    );
                }
                if !self.materials.enabled() {
                    return json(
                        StatusCode::SERVICE_UNAVAILABLE,
                        serde_json::json!({ "error": "material cache disabled" }),
                    );
                }
                let Some(prefetch) = self.prefetch.lock().unwrap().upgrade() else {
                    return json(
                        StatusCode::SERVICE_UNAVAILABLE,
                        serde_json::json!({ "error": "material workers unavailable" }),
                    );
                };
                let (queued, pending) = prefetch.add(paths.iter().filter_map(|p| p.as_str()));
                json(
                    StatusCode::ACCEPTED,
                    serde_json::json!({ "queued": queued, "pending": pending }),
                )
            }
            "/api/material-cache" | "/api/material-cache/prefetch" => json(
                StatusCode::METHOD_NOT_ALLOWED,
                serde_json::json!({ "error": "method" }),
            ),
            _ => json(
                StatusCode::NOT_IMPLEMENTED,
                serde_json::json!({ "error": "not available in the desktop app yet" }),
            ),
        }
    }

    /// Only an exact compiled key under an allowed directory can reach the cache.
    /// Check the nearest existing ancestor too: a missing file below a symlink
    /// must not turn a denied disk path into a network request.
    fn material_path(&self, raw: &str) -> Option<String> {
        let decoded = percent_decode(raw)?;
        let key = decoded.strip_prefix('/')?;
        if !self.dirs.contains("assets") || !self.materials.contains(key) {
            return None;
        }
        let parts: Vec<&str> = key.split('/').collect();
        if private(&parts) {
            return None;
        }
        let candidate = self.root.join(key);
        let mut ancestor = candidate.as_path();
        while !ancestor.try_exists().ok()? {
            ancestor = ancestor.parent()?;
        }
        let real = fs::canonicalize(ancestor).ok()?;
        let rel = real.strip_prefix(self.root.as_path()).ok()?;
        let real_parts: Vec<_> = rel
            .components()
            .map(|c| c.as_os_str().to_string_lossy().into_owned())
            .collect();
        if !real_parts.is_empty()
            && private(&real_parts.iter().map(String::as_str).collect::<Vec<_>>())
        {
            return None;
        }
        if real_parts
            .first()
            .is_some_and(|top| !self.dirs.contains(top))
        {
            return None;
        }
        Some(key.into())
    }

    pub(crate) fn material_request(&self, request: &Request<Vec<u8>>) -> bool {
        // Admission must not perform disk I/O on the webview thread.
        request.method() == "GET"
            && percent_decode(request.uri().path())
                .and_then(|p| p.strip_prefix('/').map(String::from))
                .is_some_and(|p| self.materials.contains(&p))
    }

    fn file(&self, request_path: &str) -> Option<PathBuf> {
        let mut decoded = percent_decode(request_path)?;
        if decoded == "/" {
            decoded = "/index.html".into();
        }
        if decoded.contains('\0') || decoded.contains('\\') {
            return None;
        }
        let parts: Vec<&str> = decoded.split('/').filter(|part| !part.is_empty()).collect();
        if parts.is_empty() || private(&parts) {
            return None;
        }
        let candidate = parts
            .iter()
            .fold(self.root.to_path_buf(), |path, part| path.join(part));
        // Case and 8.3 aliases collapse to the real name only here.
        let real = fs::canonicalize(candidate).ok()?;
        let rel = real.strip_prefix(self.root.as_path()).ok()?;
        let real_parts: Vec<String> = rel
            .components()
            .map(|c| c.as_os_str().to_string_lossy().into_owned())
            .collect();
        let real_parts: Vec<&str> = real_parts.iter().map(String::as_str).collect();
        if real_parts.is_empty() || private(&real_parts) {
            return None;
        }
        let top = real_parts[0];
        let listed = if real_parts.len() == 1 {
            self.files.contains(top)
        } else {
            self.dirs.contains(top)
        };
        (listed && real.is_file()).then_some(real)
    }
}

/// The server tree, every dot-entry and anything spelled like an 8.3 short
/// name (`GIT~1` is `.git`) stay private, in any letter case.
fn private(parts: &[&str]) -> bool {
    parts[0].eq_ignore_ascii_case("server")
        || parts.iter().any(|part| {
            part.starts_with('.')
                || part
                    .as_bytes()
                    .windows(2)
                    .any(|w| w[0] == b'~' && w[1].is_ascii_digit())
        })
}

pub(crate) fn percent_decode(raw: &str) -> Option<String> {
    let bytes = raw.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = std::str::from_utf8(bytes.get(i + 1..i + 3)?).ok()?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

pub(crate) fn json(status: StatusCode, value: serde_json::Value) -> Reply {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "application/json; charset=utf-8")
        .header(header::CACHE_CONTROL, "no-store")
        .body(Cow::Owned(value.to_string().into_bytes()))
        .expect("json response")
}

fn text(status: StatusCode, body: &'static str) -> Reply {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .body(Cow::Borrowed(body.as_bytes()))
        .expect("text response")
}

// Same table as server/relay.mjs MIME.
fn mime(path: &Path) -> &'static str {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_ascii_lowercase)
        .unwrap_or_default();
    match ext.as_str() {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" | "map" => "application/json",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "ttf" => "font/ttf",
        "wasm" => "application/wasm",
        "gz" => "application/gzip",
        "txt" => "text/plain; charset=utf-8",
        "md" => "text/markdown; charset=utf-8",
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::backup::tests::TestDir;
    use serde_json::{json, Value};

    fn site(temp: &TestDir) -> Site {
        Site::new(
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../.."),
            temp.0.join("backups"),
        )
    }

    fn request(method: &str, path: &str, body: Vec<u8>) -> Request<Vec<u8>> {
        Request::builder()
            .method(method)
            .uri(format!("mf://localhost{path}"))
            .header(header::ORIGIN, app_origin())
            .body(body)
            .unwrap()
    }

    fn value(reply: &Reply) -> Value {
        serde_json::from_slice(reply.body()).unwrap()
    }

    #[test]
    fn origin_and_authority_checks_cover_every_api_route() {
        let temp = TestDir::new();
        let site = site(&temp);
        for path in [
            "/api",
            "/api/ping",
            "/api/model-backup",
            "/api/material-cache",
            "/api/material-cache/prefetch",
            "/api/unknown",
        ] {
            for method in ["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS"] {
                for origin in [
                    "https://evil.test",
                    "null",
                    "",
                    "http://mf.localhost.evil.test",
                    "mf://evil",
                    "http://mf.localhost/",
                    "mf://localhost/",
                ] {
                    let mut req = request(method, path, Vec::new());
                    req.headers_mut()
                        .insert(header::ORIGIN, origin.parse().unwrap());
                    let reply = site.handle(req);
                    assert_eq!(
                        reply.status(),
                        StatusCode::FORBIDDEN,
                        "{method} {path} {origin}"
                    );
                    assert_eq!(value(&reply)["error"], "origin");
                }
                let mut req = request(method, path, Vec::new());
                req.headers_mut().remove(header::ORIGIN);
                assert_eq!(
                    site.handle(req).status() == StatusCode::FORBIDDEN,
                    method != "GET"
                );
                assert_ne!(
                    site.handle(request(method, path, Vec::new())).status(),
                    StatusCode::FORBIDDEN
                );
            }
        }
        for uri in [
            "mf://evil/api/ping",
            "mf://localhost:99/api/ping",
            "mf://user@localhost/api/ping",
            "/api/ping",
            "https://mf.localhost/api/ping",
        ] {
            let mut req = request("GET", "/api/ping", Vec::new());
            *req.uri_mut() = uri.parse().unwrap();
            assert_eq!(site.handle(req).status(), StatusCode::FORBIDDEN, "{uri}");
        }
        let mut req = request("POST", "/api/ping", Vec::new());
        req.headers_mut()
            .append(header::ORIGIN, app_origin().parse().unwrap());
        assert_eq!(site.handle(req).status(), StatusCode::FORBIDDEN);
        let mut req = request("GET", "/api/ping", Vec::new());
        req.headers_mut()
            .insert(header::HOST, "evil.test".parse().unwrap());
        assert_eq!(site.handle(req).status(), StatusCode::FORBIDDEN);

        let mut req = request("GET", "/api/ping", Vec::new());
        req.headers_mut().insert(
            header::HOST,
            if cfg!(target_os = "windows") {
                "mf.localhost"
            } else {
                "localhost"
            }
            .parse()
            .unwrap(),
        );
        assert_eq!(site.handle(req).status(), StatusCode::OK);
    }

    #[test]
    fn static_get_without_origin_still_serves_app() {
        let temp = TestDir::new();
        let mut req = request("GET", "/index.html", Vec::new());
        req.headers_mut().remove(header::ORIGIN);
        let reply = site(&temp).handle(req);
        assert_eq!(reply.status(), StatusCode::OK);
        assert_eq!(
            reply.headers()[header::CONTENT_TYPE],
            "text/html; charset=utf-8"
        );
        assert!(!reply.body().is_empty());
    }

    #[test]
    fn navigation_stays_on_app_origin_in_both_spellings() {
        for url in [
            "mf://localhost/index.html",
            "mf://localhost/?x=1#model",
            "http://mf.localhost/",
            "http://mf.localhost/js/main.js",
        ] {
            assert!(navigation_allowed(&url.parse().unwrap()), "{url}");
        }
        for url in [
            "https://example.com",
            "http://example.com",
            "https://mf.localhost",
            "mf://other/",
            "mf://localhost.evil/",
            "http://mf.localhost.evil/",
            "http://mf.localhost:8765/",
            "mf://localhost:80/",
            "mf://user@localhost/",
            "file:///C:/secret",
            "data:text/html,hello",
            "javascript:alert(1)",
            "about:blank",
            "blob:http://mf.localhost/id",
            "mailto:test@example.com",
        ] {
            assert!(!navigation_allowed(&url.parse().unwrap()), "{url}");
        }
    }

    #[test]
    fn body_caps_allow_boundary_and_reject_one_byte_over() {
        let temp = TestDir::new();
        let site = site(&temp);
        for (path, cap) in [
            ("/api/model-backup", BACKUP_BODY_CAP),
            ("/api/unknown", API_BODY_CAP),
        ] {
            let mut req = request("POST", path, vec![b' '; cap]);
            // Content-Length cannot override the actual received byte count.
            req.headers_mut()
                .insert(header::CONTENT_LENGTH, "0".parse().unwrap());
            assert!(site.preflight(&req).is_none());
            req.body_mut().push(b' ');
            let reply = site.handle(req);
            assert_eq!(reply.status(), StatusCode::PAYLOAD_TOO_LARGE);
            assert_eq!(value(&reply)["error"], "body too large");
        }
    }

    #[test]
    fn backup_round_trip_through_handler_and_validation() {
        let temp = TestDir::new();
        let site = site(&temp);
        let get = |path: &str| site.handle(request("GET", path, Vec::new()));
        let post = |payload: Value| {
            site.handle(request(
                "POST",
                "/api/model-backup",
                serde_json::to_vec(&payload).unwrap(),
            ))
        };
        assert_eq!(value(&get("/api/model-backup")), json!({ "models": [] }));
        let attachment = json!({ "reference": { "key": "cad", "hash": "123" }, "payload": "BREP" });
        for revision in [1, 2] {
            let reply = post(
                json!({ "models": [{ "key": "cm_desk", "name": "Desk", "revision": revision }], "attachments": { "cm_desk": [attachment.clone()] } }),
            );
            assert_eq!(reply.status(), StatusCode::OK);
            assert_eq!(value(&reply)["results"][0]["written"], true);
        }
        let latest = get("/api/model-backup?key=cm_desk");
        assert_eq!(latest.status(), StatusCode::OK);
        assert_eq!(
            value(&latest),
            json!({ "model": { "key": "cm_desk", "name": "Desk", "revision": 2 }, "attachments": [attachment] })
        );
        let reply = post(json!({ "models": [{ "key": "cm_new", "revision": 1 }] }));
        assert_eq!(reply.status(), StatusCode::OK);
        let models = value(&get("/api/model-backup"))["models"]
            .as_array()
            .unwrap()
            .clone();
        assert_eq!(models.len(), 2);
        assert!(models[0]["savedAt"].as_u64().unwrap() >= models[1]["savedAt"].as_u64().unwrap());
        assert_eq!(
            value(&get("/api/model-backup?key=cm%5Fdesk"))["model"]["key"],
            "cm_desk"
        );
        assert_eq!(
            get("/api/model-backup?key=missing").status(),
            StatusCode::NOT_FOUND
        );
        for key in [
            "",
            "..",
            "..%2Fescape",
            "%2e%2e%5cescape",
            "%252e%252e%252fescape",
            "%00",
            "%ff",
            "%",
        ] {
            assert_eq!(
                get(&format!("/api/model-backup?key={key}")).status(),
                StatusCode::BAD_REQUEST,
                "{key}"
            );
        }
        let reply = post(json!({ "models": [{ "key": "../escape" }, null, { "key": "ok" }] }));
        let results = value(&reply)["results"].as_array().unwrap().clone();
        assert_eq!(results[0]["error"], "invalid model key");
        assert_eq!(results[1]["key"], Value::Null);
        assert_eq!(results[1]["error"], "model record required");
        assert_eq!(results[2]["written"], true);
        for payload in [
            json!({}),
            json!({ "models": [] }),
            json!({ "models": vec![Value::Null; 501] }),
        ] {
            assert_eq!(post(payload).status(), StatusCode::BAD_REQUEST);
        }
        assert_eq!(
            post(json!({ "models": vec![json!({ "key": "ok" }); 500] })).status(),
            StatusCode::OK
        );
        assert_eq!(
            site.handle(request("POST", "/api/model-backup", b"invalid".to_vec()))
                .status(),
            StatusCode::BAD_REQUEST
        );
        assert_eq!(
            site.handle(request("DELETE", "/api/model-backup", Vec::new()))
                .status(),
            StatusCode::METHOD_NOT_ALLOWED
        );
        assert_eq!(
            site.handle(request("POST", "/api/_spike/echo", Vec::new()))
                .status(),
            StatusCode::NOT_IMPLEMENTED
        );
    }

    #[test]
    fn large_post_body_survives_handler_without_spike_route() {
        let temp = TestDir::new();
        let payload = "0123456789abcdef".repeat(20 * 1024 * 1024 / 16);
        let record = json!({ "key": "large", "revision": 1, "payload": payload });
        let bytes = serde_json::to_vec(&json!({ "models": [&record] })).unwrap();
        assert!(bytes.len() > 20 * 1024 * 1024);
        let site = site(&temp);
        let reply = site.handle(request("POST", "/api/model-backup", bytes));
        assert_eq!(reply.status(), StatusCode::OK);
        assert_eq!(value(&reply)["results"][0]["written"], true);
        let reply = site.handle(request("GET", "/api/model-backup?key=large", Vec::new()));
        assert_eq!(value(&reply)["model"], record);
    }

    #[test]
    fn material_handler_serves_verified_bytes_and_refuses_unsafe_or_unknown_paths() {
        use crate::materials::{
            tests::{cache, response, Server, KEY},
            QUOTA,
        };
        let temp = TestDir::new();
        let root = temp.0.join("web");
        fs::create_dir_all(&root).unwrap();
        let server = Server::new(|_, _| response(200, b"material"));
        let mut site = Site::new(root.clone(), temp.0.join("backups"));
        site.materials = Arc::new(cache(
            &temp.0.join("cache"),
            Some(&server.origin),
            &[(KEY, b"material")],
            QUOTA,
        ));
        for path in [
            "/assets/materials/unknown.webp",
            "/assets/materials/../test/color.webp",
            "/assets/materials/%2e%2e/test/color.webp",
            "/assets/materials/%252e%252e/test/color.webp",
            "/assets/materials/TEST~1/color.webp",
            "/assets/materials/TEST/color.webp",
            "/ASSETS/MATERIALS/test/color.webp",
            "/assets/materials/test/color.webp.",
            "/assets/materials/test/color.webp%20",
            "/assets/materials/test%5ccolor.webp",
            "/assets/materials/test/color.webp%00",
        ] {
            assert_eq!(
                site.handle(request("GET", path, Vec::new())).status(),
                StatusCode::NOT_FOUND,
                "{path}"
            );
        }
        assert_eq!(server.count(), 0);
        for _ in 0..2 {
            let reply = site.handle(request("GET", &format!("/{KEY}"), Vec::new()));
            assert_eq!(reply.status(), StatusCode::OK);
            assert_eq!(reply.headers()[header::CONTENT_TYPE], "image/webp");
            assert_eq!(reply.body().as_ref(), b"material");
        }
        assert_eq!(server.count(), 1);
        let info = value(&site.handle(request("GET", "/api/material-cache", Vec::new())));
        assert_eq!(info["enabled"], true);
        assert_eq!(info["files"], 1);
        assert_eq!(info["bytes"], 8);
        assert_eq!(info["origin"], server.origin);
        assert_eq!(info["quotaBytes"], QUOTA);
        assert!(
            value(&site.handle(request("GET", "/api/ping", Vec::new())))["api"]
                .as_array()
                .unwrap()
                .contains(&json!("material-cache"))
        );
        // A checkout's own files take precedence and do not contact the origin.
        fs::create_dir_all(root.join("assets/materials/test")).unwrap();
        fs::write(root.join(KEY), b"checkout").unwrap();
        assert_eq!(
            site.handle(request("GET", &format!("/{KEY}"), Vec::new()))
                .body()
                .as_ref(),
            b"checkout"
        );
        assert_eq!(server.count(), 1);
    }

    #[test]
    fn material_handler_errors_off_state_and_prefetch_validation() {
        use crate::materials::{
            tests::{cache, response, Server, KEY},
            QUOTA,
        };
        let temp = TestDir::new();
        let root = temp.0.join("web");
        fs::create_dir_all(&root).unwrap();
        let mut site = Site::new(root, temp.0.join("backups"));
        site.materials = Arc::new(cache(
            &temp.0.join("cache"),
            None,
            &[(KEY, b"material")],
            QUOTA,
        ));
        assert_eq!(
            site.handle(request("GET", &format!("/{KEY}"), Vec::new()))
                .status(),
            StatusCode::NOT_FOUND
        );
        assert_eq!(
            value(&site.handle(request("GET", "/api/material-cache", Vec::new())))["enabled"],
            false
        );
        assert!(
            !value(&site.handle(request("GET", "/api/ping", Vec::new())))["api"]
                .as_array()
                .unwrap()
                .contains(&json!("material-cache"))
        );
        for payload in [
            json!({}),
            json!({"paths": vec![KEY; 1001]}),
            json!({"paths": ["assets/materials/unknown.webp"]}),
            json!({"paths": [42]}),
        ] {
            assert_eq!(
                site.handle(request(
                    "POST",
                    "/api/material-cache/prefetch",
                    payload.to_string().into_bytes()
                ))
                .status(),
                StatusCode::BAD_REQUEST
            );
        }
        assert_eq!(
            site.handle(request(
                "POST",
                "/api/material-cache/prefetch",
                json!({"paths": [KEY]}).to_string().into_bytes()
            ))
            .status(),
            StatusCode::SERVICE_UNAVAILABLE
        );
        site.materials = Arc::new(cache(
            &temp.0.join("cache"),
            Some("https://example.test"),
            &[(KEY, b"material")],
            QUOTA,
        ));
        let info = value(&site.handle(request("GET", "/api/material-cache", Vec::new())));
        assert_eq!(info["enabled"], true);
        assert_eq!(info["origin"], "https://example.test");
        assert!(info.get("reason").is_none());
        let server = Server::new(|_, _| response(404, b""));
        site.materials = Arc::new(cache(
            &temp.0.join("cache"),
            Some(&server.origin),
            &[(KEY, b"material")],
            QUOTA,
        ));
        let reply = site.handle(request("GET", &format!("/{KEY}"), Vec::new()));
        assert_eq!(reply.status(), StatusCode::BAD_GATEWAY);
        assert!(value(&reply)["error"].as_str().unwrap().contains("404"));
        assert_eq!(server.count(), 1);
        assert_eq!(
            site.handle(request("POST", "/api/material-cache", Vec::new()))
                .status(),
            StatusCode::METHOD_NOT_ALLOWED
        );
        assert_eq!(
            site.handle(request("GET", "/api/material-cache/prefetch", Vec::new()))
                .status(),
            StatusCode::METHOD_NOT_ALLOWED
        );
    }
}
