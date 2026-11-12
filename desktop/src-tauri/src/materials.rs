//! Fixed-manifest, content-addressed material cache. No web-controlled origins.
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    fs::{self, OpenOptions},
    io::{self, Read, Write},
    net::{Ipv4Addr, SocketAddr, TcpStream},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Condvar, Mutex, OnceLock,
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

pub const QUOTA: u64 = 1024 * 1024 * 1024;
const MANIFEST: &str = include_str!("../../material-manifest.json");
const TOTAL_TIMEOUT: Duration = Duration::from_secs(60);
const INDEX_INTERVAL: Duration = Duration::from_secs(5);
static TEMP_ID: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum FetchError {
    NotFound,
    Retryable { message: String, offline: bool },
    Fatal(String),
}
pub type FetchBody = Vec<u8>;
pub trait Fetch: Send + Sync {
    fn get(&self, url: &str, max_bytes: u64, deadline: Instant) -> Result<FetchBody, FetchError>;
}
fn fatal(message: impl ToString) -> FetchError {
    FetchError::Fatal(message.to_string())
}
fn network(error: io::Error) -> FetchError {
    FetchError::Retryable {
        message: error.to_string(),
        offline: true,
    }
}
fn remaining(deadline: Instant) -> Result<Duration, FetchError> {
    deadline
        .checked_duration_since(Instant::now())
        .filter(|d| !d.is_zero())
        .ok_or_else(|| FetchError::Retryable {
            message: "download timeout".into(),
            offline: true,
        })
}

/// Deliberately restricted to a literal IPv4 loopback or localhost + explicit port.
/// localhost is connected directly to 127.0.0.1: no DNS or proxy configuration.
pub struct LoopbackHttp;
fn loopback_url(url: &str) -> Option<(&str, u16, &str)> {
    let rest = url.strip_prefix("http://")?;
    let (authority, path) = rest.split_once('/').unwrap_or((rest, ""));
    let (host, port) = authority.split_once(':')?;
    if !matches!(host, "localhost" | "127.0.0.1")
        || port.is_empty()
        || !port.bytes().all(|b| b.is_ascii_digit())
        || url.bytes().any(|b| b <= 32 || b == 127)
        || path.contains(['#', '?', '\\'])
    {
        return None;
    }
    let port = port.parse().ok()?;
    (port != 0).then_some((authority, port, path))
}
impl Fetch for LoopbackHttp {
    fn get(&self, url: &str, max_bytes: u64, deadline: Instant) -> Result<Vec<u8>, FetchError> {
        let (authority, port, path) =
            loopback_url(url).ok_or_else(|| fatal("loopback HTTP only"))?;
        let address = SocketAddr::from((Ipv4Addr::LOCALHOST, port));
        let mut stream =
            TcpStream::connect_timeout(&address, remaining(deadline)?.min(Duration::from_secs(10)))
                .map_err(network)?;
        stream
            .set_write_timeout(Some(remaining(deadline)?))
            .map_err(network)?;
        write!(stream, "GET /{path} HTTP/1.1\r\nHost: {authority}\r\nConnection: close\r\nAccept-Encoding: identity\r\n\r\n").map_err(network)?;
        // Read headers without buffering body bytes. Limits also bound a malicious
        // server's allocation; every read uses the remaining *total* deadline.
        let mut headers = Vec::new();
        while !headers.ends_with(b"\r\n\r\n") {
            if headers.len() >= 32 * 1024 {
                return Err(fatal("HTTP headers too large"));
            }
            stream
                .set_read_timeout(Some(remaining(deadline)?))
                .map_err(network)?;
            let mut byte = [0];
            if stream.read(&mut byte).map_err(network)? == 0 {
                return Err(fatal("truncated HTTP headers"));
            }
            headers.push(byte[0]);
        }
        let headers = std::str::from_utf8(&headers).map_err(|_| fatal("invalid HTTP headers"))?;
        let mut lines = headers.split("\r\n");
        let status_line = lines.next().unwrap_or_default();
        if status_line.len() > 8192 {
            return Err(fatal("HTTP status-line limit"));
        }
        let mut status = status_line.splitn(3, ' ');
        if !matches!(status.next(), Some("HTTP/1.1" | "HTTP/1.0")) {
            return Err(fatal("invalid HTTP version"));
        }
        let code = status
            .next()
            .filter(|s| s.len() == 3)
            .and_then(|s| s.parse::<u16>().ok())
            .ok_or_else(|| fatal("invalid HTTP status"))?;
        let mut length = None;
        for (count, line) in lines.filter(|l| !l.is_empty()).enumerate() {
            if count >= 100 || line.len() > 8192 {
                return Err(fatal("HTTP header limit"));
            }
            let (name, value) = line
                .split_once(':')
                .ok_or_else(|| fatal("invalid HTTP header"))?;
            if name.is_empty()
                || !name
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"!#$%&'*+-.^_`|~".contains(&b))
                || value.bytes().any(|b| b < 32 && b != b'\t' || b == 127)
            {
                return Err(fatal("invalid HTTP header"));
            }
            if name.eq_ignore_ascii_case("content-length") {
                if length.is_some() {
                    return Err(fatal("duplicate Content-Length"));
                }
                let value = value.trim();
                if value.is_empty() || !value.bytes().all(|b| b.is_ascii_digit()) {
                    return Err(fatal("invalid Content-Length"));
                }
                length = Some(
                    value
                        .parse::<u64>()
                        .map_err(|_| fatal("invalid Content-Length"))?,
                );
            }
            if name.eq_ignore_ascii_case("transfer-encoding") {
                return Err(fatal("Transfer-Encoding unsupported"));
            }
            if name.eq_ignore_ascii_case("content-encoding")
                && !value.trim().eq_ignore_ascii_case("identity")
            {
                return Err(fatal("Content-Encoding unsupported"));
            }
        }
        match code {
            404 => return Err(FetchError::NotFound),
            500..=599 => {
                return Err(FetchError::Retryable {
                    message: format!("HTTP {code}"),
                    offline: false,
                })
            }
            200 => {}
            _ => return Err(fatal(format!("HTTP {code}; redirects refused"))),
        }
        if length.is_some_and(|n| n > max_bytes) {
            return Err(fatal("body exceeds manifest size"));
        }
        let mut body = Vec::new();
        let mut chunk = [0; 16 * 1024];
        loop {
            stream
                .set_read_timeout(Some(remaining(deadline)?))
                .map_err(network)?;
            // Read at most the cap + one sentinel byte, even if no length exists.
            let limit = (max_bytes
                .saturating_sub(body.len() as u64)
                .saturating_add(1))
            .min(chunk.len() as u64) as usize;
            let n = stream.read(&mut chunk[..limit]).map_err(network)?;
            if n == 0 {
                break;
            }
            if body.len() as u64 + n as u64 > max_bytes {
                return Err(fatal("body exceeds manifest size"));
            }
            body.extend_from_slice(&chunk[..n]);
        }
        if length.is_some_and(|n| n != body.len() as u64) {
            return Err(fatal("truncated HTTP body"));
        }
        Ok(body)
    }
}

/// Called only on the std material/prefetch workers, never on the webview thread
/// or inside a Tokio runtime. All cache instances share one lazy blocking client.
pub struct HttpsFetch;
static HTTPS_CLIENT: OnceLock<Result<reqwest::blocking::Client, FetchError>> = OnceLock::new();
impl HttpsFetch {
    fn client() -> Result<&'static reqwest::blocking::Client, FetchError> {
        HTTPS_CLIENT
            .get_or_init(|| {
                // ring is the only compiled provider. reqwest 0.13.5 uses this
                // default with rustls-platform-verifier and the OS trust store.
                // A prior rustls user may already have installed the same default.
                let _ = rustls::crypto::ring::default_provider().install_default();
                reqwest::blocking::Client::builder()
                    .tls_backend_rustls()
                    .https_only(true)
                    .redirect(reqwest::redirect::Policy::none())
                    .retry(reqwest::retry::never())
                    .no_proxy()
                    .no_gzip()
                    .no_brotli()
                    .no_deflate()
                    .no_zstd()
                    .connect_timeout(Duration::from_secs(10))
                    .user_agent(concat!("ModelForge-Desktop/", env!("CARGO_PKG_VERSION")))
                    .build()
                    .map_err(|error| fatal(format!("TLS client: {error}")))
            })
            .as_ref()
            .map_err(Clone::clone)
    }
}
fn https_error(error: reqwest::Error) -> FetchError {
    if error.is_timeout() || error.is_connect() || error.is_dns() {
        FetchError::Retryable {
            message: format!("{error:?}"),
            offline: true,
        }
    } else {
        fatal(error)
    }
}
fn https_read_error(error: io::Error) -> FetchError {
    // reqwest's Read implementation wraps its errors in io::Error, including
    // body timeouts. Preserve their classification instead of losing the cause.
    if error
        .get_ref()
        .is_some_and(|cause| cause.is::<reqwest::Error>())
    {
        return https_error(*error.into_inner().unwrap().downcast().unwrap());
    }
    if error.kind() == io::ErrorKind::TimedOut {
        network(error)
    } else {
        fatal(error)
    }
}
fn https_body(
    response: reqwest::blocking::Response,
    max_bytes: u64,
    deadline: Instant,
) -> Result<Vec<u8>, FetchError> {
    for value in response
        .headers()
        .get_all(reqwest::header::CONTENT_ENCODING)
    {
        if !value
            .to_str()
            .is_ok_and(|value| value.trim().eq_ignore_ascii_case("identity"))
        {
            return Err(fatal("Content-Encoding unsupported"));
        }
    }
    match response.status().as_u16() {
        404 => return Err(FetchError::NotFound),
        code @ 500..=599 => {
            return Err(FetchError::Retryable {
                message: format!("HTTP {code}"),
                offline: false,
            })
        }
        200 => {}
        code => return Err(fatal(format!("HTTP {code}; redirects refused"))),
    }
    let length = response.content_length();
    read_https_body(response, length, max_bytes, deadline)
}
fn read_https_body(
    mut reader: impl Read,
    length: Option<u64>,
    max_bytes: u64,
    deadline: Instant,
) -> Result<Vec<u8>, FetchError> {
    if length.is_some_and(|n| n > max_bytes) {
        return Err(fatal("body exceeds manifest size"));
    }
    let mut body = Vec::new();
    let mut chunk = [0; 16 * 1024];
    loop {
        remaining(deadline)?;
        let limit = max_bytes
            .saturating_sub(body.len() as u64)
            .saturating_add(1)
            .min(chunk.len() as u64) as usize;
        let n = reader.read(&mut chunk[..limit]).map_err(https_read_error)?;
        if n == 0 {
            break;
        }
        if body.len() as u64 + n as u64 > max_bytes {
            return Err(fatal("body exceeds manifest size"));
        }
        body.extend_from_slice(&chunk[..n]);
    }
    if length.is_some_and(|n| n != body.len() as u64) {
        return Err(fatal("truncated HTTP body"));
    }
    Ok(body)
}
impl Fetch for HttpsFetch {
    fn get(&self, url: &str, max_bytes: u64, deadline: Instant) -> Result<Vec<u8>, FetchError> {
        remaining(deadline)?;
        let response = Self::client()?
            .get(url)
            .timeout(remaining(deadline)?)
            .header(reqwest::header::ACCEPT_ENCODING, "identity")
            .send()
            .map_err(https_error)?;
        https_body(response, max_bytes, deadline)
    }
}

#[derive(Clone, Debug)]
pub struct Entry {
    pub bytes: u64,
    pub sha256: String,
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum CacheError {
    Missing,
    Offline(String),
    Failed(String),
}
type BodyResult = Result<Arc<Vec<u8>>, CacheError>;
#[derive(Default)]
struct Flight {
    result: Mutex<Option<BodyResult>>,
    ready: Condvar,
}
#[derive(Default)]
struct State {
    verified: HashSet<String>,
    flights: HashMap<String, Arc<Flight>>,
    access: HashMap<String, u64>,
    clock: u64,
    index_loaded: bool,
    last_index_write: Option<Instant>,
}
pub struct Materials {
    dir: PathBuf,
    origin: Option<String>,
    reason: Option<&'static str>,
    entries: HashMap<String, Entry>,
    fetch: Arc<dyn Fetch>,
    quota: u64,
    state: Mutex<State>,
    #[cfg(test)]
    index_writes: AtomicU64,
    #[cfg(test)]
    hash_hook: Option<Arc<dyn Fn() + Send + Sync>>,
}

fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
pub fn valid_path(path: &str) -> bool {
    path.starts_with("assets/materials/")
        && path.split('/').all(|p| {
            !p.is_empty()
                && !p.starts_with('.')
                && !p.contains(['\\', ':', '%'])
                && !p.bytes().any(|b| b < 32 || b == 127)
                && !p.ends_with([' ', '.'])
                && !p
                    .as_bytes()
                    .windows(2)
                    .any(|w| w[0] == b'~' && w[1].is_ascii_digit())
        })
}
fn encoded(path: &str) -> String {
    let mut out = String::new();
    for b in path.bytes() {
        if b.is_ascii_alphanumeric() || b"-._~/".contains(&b) {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}
impl Materials {
    pub fn new(dir: PathBuf) -> Self {
        Self::configured(dir, option_env!("MF_MATERIAL_ORIGIN"), MANIFEST, QUOTA)
    }
    fn configured(dir: PathBuf, origin: Option<&str>, manifest: &str, quota: u64) -> Self {
        let doc: Value = serde_json::from_str(manifest).expect("material manifest JSON");
        assert_eq!(doc["version"], 1, "material manifest version");
        let entries = doc["files"]
            .as_object()
            .expect("material manifest files")
            .iter()
            .map(|(path, value)| {
                let sha256 = value["sha256"].as_str().expect("manifest hash").to_string();
                assert!(
                    valid_path(path)
                        && sha256.len() == 64
                        && sha256
                            .bytes()
                            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)),
                    "invalid material entry"
                );
                (
                    path.clone(),
                    Entry {
                        bytes: value["bytes"].as_u64().expect("manifest bytes"),
                        sha256,
                    },
                )
            })
            .collect();
        let mut reason = Some("origin not configured");
        let mut fetch: Arc<dyn Fetch> = Arc::new(HttpsFetch);
        let origin = origin.map(|s| s.trim_end_matches('/').to_string());
        if let Some(value) = &origin {
            let url = tauri::Url::parse(value).ok();
            if url.as_ref().is_some_and(|u| {
                u.scheme() == "https"
                    && u.host_str().is_some()
                    && u.username().is_empty()
                    && u.password().is_none()
                    && u.query().is_none()
                    && u.fragment().is_none()
            }) {
                reason = None;
            } else if cfg!(any(test, debug_assertions)) && loopback_url(value).is_some() {
                reason = None;
                fetch = Arc::new(LoopbackHttp);
            } else {
                reason = Some("invalid material origin");
            }
        }
        Self {
            dir,
            origin,
            reason,
            entries,
            fetch,
            quota,
            state: Mutex::new(State::default()),
            #[cfg(test)]
            index_writes: AtomicU64::new(0),
            #[cfg(test)]
            hash_hook: None,
        }
    }
    pub fn enabled(&self) -> bool {
        self.reason.is_none()
    }
    pub fn contains(&self, path: &str) -> bool {
        valid_path(path) && self.entries.contains_key(path)
    }
    fn name(&self, path: &str) -> String {
        let ext = Path::new(path)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("bin");
        format!("{}.{}", self.entries[path].sha256, ext)
    }
    // Cache reads and mutations hold state. Hashing uses owned bytes outside
    // the lock; eviction cannot interrupt a read or invalidate a response body.
    fn check_dir(&self) -> Result<bool, CacheError> {
        match fs::symlink_metadata(&self.dir) {
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
            Err(error) => Err(store_error(error)),
            Ok(meta) if meta.file_type().is_symlink() || !meta.is_dir() => {
                Err(CacheError::Failed("invalid cache directory".into()))
            }
            Ok(_) => Ok(true),
        }
    }
    fn disk_files(&self) -> Result<Vec<(String, u64)>, CacheError> {
        if !self.check_dir()? {
            return Ok(Vec::new());
        }
        let mut files = Vec::new();
        for entry in fs::read_dir(&self.dir).map_err(store_error)? {
            let entry = entry.map_err(store_error)?;
            let name = entry.file_name().to_string_lossy().into_owned();
            if cache_name(&name) && entry.file_type().map_err(store_error)?.is_file() {
                files.push((name, entry.metadata().map_err(store_error)?.len()));
            }
        }
        Ok(files)
    }
    fn touch(&self, state: &mut State, name: &str) {
        if !state.index_loaded {
            state.index_loaded = true;
            if let Ok(bytes) = fs::read(self.dir.join("index.json")) {
                state.access = serde_json::from_slice(&bytes).unwrap_or_default();
                state.clock = state.access.values().copied().max().unwrap_or(0);
            }
        }
        state.clock = state.clock.saturating_add(1);
        state.access.insert(name.to_string(), state.clock);
    }
    fn persist_index(&self, state: &mut State, force: bool) {
        if !state.index_loaded || !self.check_dir().is_ok_and(|exists| exists) {
            return;
        }
        if !force
            && state
                .last_index_write
                .is_some_and(|last| last.elapsed() < INDEX_INTERVAL)
        {
            return;
        }
        // Throttle failed attempts too: persistence is best-effort on activity.
        state.last_index_write = Some(Instant::now());
        #[cfg(test)]
        self.index_writes.fetch_add(1, Ordering::Relaxed);
        // The index is advisory; data integrity never depends on it. Keep a
        // truncated index recoverable after a crash and avoid rename-overwrite
        // differences between Windows and Unix.
        let _ = fs::write(
            self.dir.join("index.json"),
            serde_json::to_vec(&state.access).unwrap(),
        );
    }
    pub fn info(&self) -> Value {
        let _state = self.state.lock().unwrap();
        let files = self.disk_files().unwrap_or_default();
        let mut result = json!({ "enabled": self.enabled(), "origin": self.origin, "files": files.len(), "bytes": files.iter().map(|(_, n)| *n).sum::<u64>(), "quotaBytes": self.quota });
        if let Some(reason) = self.reason {
            result["reason"] = reason.into();
        }
        result
    }
    pub fn get(&self, path: &str) -> BodyResult {
        if !self.contains(path) || self.origin.is_none() {
            return Err(CacheError::Missing);
        }
        if let Some(reason) = self.reason {
            return Err(CacheError::Failed(reason.into()));
        }
        let name = self.name(path);
        let (flight, owner) = {
            let mut state = self.state.lock().unwrap();
            if let Some(flight) = state.flights.get(&name) {
                (Arc::clone(flight), false)
            } else {
                let flight = Arc::new(Flight::default());
                state.flights.insert(name.clone(), Arc::clone(&flight));
                (flight, true)
            }
        };
        if !owner {
            let mut result = flight.result.lock().unwrap();
            while result.is_none() {
                result = flight.ready.wait(result).unwrap();
            }
            return result.as_ref().unwrap().clone();
        }
        let result = self.load(path, &name);
        let mut state = self.state.lock().unwrap();
        *flight.result.lock().unwrap() = Some(result.clone());
        state.flights.remove(&name);
        flight.ready.notify_all();
        result
    }
    fn discard(&self, state: &mut State, name: &str) -> Result<(), CacheError> {
        fs::remove_file(self.dir.join(name)).map_err(store_error)?;
        state.verified.remove(name);
        // Load the advisory index before removing an entry from it.
        self.touch(state, name);
        state.access.remove(name);
        self.persist_index(state, true);
        Ok(())
    }
    fn load(&self, path: &str, name: &str) -> BodyResult {
        let entry = &self.entries[path];
        loop {
            let snapshot = {
                let mut state = self.state.lock().unwrap();
                self.check_dir()?; // refuse cache-directory indirection before reads
                let cached = self.dir.join(name);
                if fs::symlink_metadata(&cached).is_ok_and(|m| m.file_type().is_symlink()) {
                    self.discard(&mut state, name)?;
                }
                let metadata = fs::metadata(&cached).ok();
                if metadata
                    .as_ref()
                    .is_some_and(|m| m.is_file() && m.len() != entry.bytes)
                {
                    self.discard(&mut state, name)?;
                }
                if let Ok((body, stamp)) = fs::File::open(&cached).and_then(|file| {
                    let metadata = file.metadata()?;
                    let stamp = (metadata.len(), metadata.modified().ok());
                    let mut bytes = Vec::new();
                    file.take(entry.bytes.saturating_add(1))
                        .read_to_end(&mut bytes)?;
                    Ok((bytes, stamp))
                }) {
                    if body.len() as u64 != entry.bytes {
                        self.discard(&mut state, name)?;
                        None
                    } else if state.verified.contains(name) {
                        self.touch(&mut state, name);
                        self.persist_index(&mut state, false);
                        return Ok(Arc::new(body));
                    } else {
                        Some((body, stamp))
                    }
                } else {
                    None
                }
            };
            let Some((body, stamp)) = snapshot else {
                return self.download(path, name);
            };
            #[cfg(test)]
            if let Some(hook) = &self.hash_hook {
                hook();
            }
            let valid = digest(&body) == entry.sha256;
            let mut state = self.state.lock().unwrap();
            self.check_dir()?;
            let unchanged = fs::symlink_metadata(self.dir.join(name))
                .is_ok_and(|m| m.is_file() && (m.len(), m.modified().ok()) == stamp);
            if valid {
                // The owned bytes remain valid after eviction. Only bless the
                // on-disk object if it is still the one that was read.
                if unchanged {
                    state.verified.insert(name.to_string());
                    self.touch(&mut state, name);
                    self.persist_index(&mut state, false);
                }
                return Ok(Arc::new(body));
            }
            if unchanged {
                self.discard(&mut state, name)?;
            }
            // A changed object must be read again before deleting or blessing it.
        }
    }
    fn download(&self, path: &str, name: &str) -> BodyResult {
        let entry = &self.entries[path];
        if entry.bytes > self.quota {
            return Err(CacheError::Failed("material exceeds cache quota".into()));
        }
        let url = self.url(path);
        let deadline = Instant::now() + TOTAL_TIMEOUT;
        let mut body = None;
        for attempt in 0..3 {
            match self.fetch.get(&url, entry.bytes, deadline) {
                Ok(bytes) => {
                    body = Some(bytes);
                    break;
                }
                Err(FetchError::NotFound) => {
                    return Err(CacheError::Failed("material origin returned 404".into()))
                }
                Err(FetchError::Fatal(message)) => return Err(CacheError::Failed(message)),
                Err(FetchError::Retryable { message, offline }) => {
                    let error = if offline {
                        CacheError::Offline(message)
                    } else {
                        CacheError::Failed(message)
                    };
                    if attempt == 2 {
                        return Err(error);
                    }
                    let delay = Duration::from_millis(100 << attempt);
                    if remaining(deadline).is_err() || Instant::now() + delay >= deadline {
                        return Err(error);
                    }
                    std::thread::sleep(delay);
                }
            }
        }
        let body = body.unwrap();
        if body.len() as u64 != entry.bytes || digest(&body) != entry.sha256 {
            return Err(CacheError::Failed("material size/SHA-256 mismatch".into()));
        }
        let mut state = self.state.lock().unwrap();
        let result = (|| {
            fs::create_dir_all(&self.dir).map_err(store_error)?;
            let mut files = self.disk_files()?;
            // Load the persistent order before choosing an eviction victim.
            self.touch(&mut state, name);
            files.sort_by_key(|(name, _)| state.access.get(name).copied().unwrap_or(0));
            let mut total: u64 = files.iter().map(|(_, bytes)| *bytes).sum();
            for (victim, bytes) in files {
                if total.saturating_add(entry.bytes) <= self.quota {
                    break;
                }
                fs::remove_file(self.dir.join(&victim)).map_err(store_error)?;
                state.verified.remove(&victim);
                state.access.remove(&victim);
                total = total.saturating_sub(bytes);
            }
            // Exclusive temp creation + sync + rename: a failed fetch never leaves a
            // readable partial object. At most four verified bodies wait to commit
            // (three page workers and one prefetch worker).
            let timestamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos();
            let temp = self.dir.join(format!(
                ".{}.{}.{timestamp}.{}.tmp",
                name,
                std::process::id(),
                TEMP_ID.fetch_add(1, Ordering::Relaxed)
            ));
            let mut created = false;
            let result = (|| -> io::Result<()> {
                let mut file = OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(&temp)?;
                created = true;
                file.write_all(&body)?;
                file.sync_all()?;
                drop(file);
                fs::rename(&temp, self.dir.join(name))
            })();
            if result.is_err() && created {
                let _ = fs::remove_file(&temp);
            }
            result.map_err(store_error)?;
            state.verified.insert(name.into());
            self.touch(&mut state, name);
            Ok(Arc::new(body))
        })();
        // Persist downloads and evictions, including evictions before a failed
        // commit. Ordinary hits only flush at the advisory five-second interval.
        self.persist_index(&mut state, true);
        result
    }
    fn url(&self, path: &str) -> String {
        format!("{}/{}", self.origin.as_ref().unwrap(), encoded(path))
    }
}
fn cache_name(name: &str) -> bool {
    let Some((hash, ext)) = name.split_once('.') else {
        return false;
    };
    hash.len() == 64
        && hash.bytes().all(|b| b.is_ascii_hexdigit())
        && !ext.is_empty()
        && ext.bytes().all(|b| b.is_ascii_alphanumeric())
}
fn store_error(error: io::Error) -> CacheError {
    CacheError::Failed(format!("material cache: {error}"))
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::backup::tests::TestDir;
    use std::{
        net::TcpListener,
        sync::{
            atomic::{AtomicBool, AtomicUsize, Ordering},
            Barrier,
        },
        thread::{self, JoinHandle},
    };

    pub(crate) const KEY: &str = "assets/materials/test/color.webp";
    pub(crate) struct Server {
        pub origin: String,
        pub calls: Arc<AtomicUsize>,
        stop: Arc<AtomicBool>,
        thread: Option<JoinHandle<()>>,
    }
    impl Server {
        pub(crate) fn new(
            handler: impl Fn(usize, &str) -> Vec<u8> + Send + Sync + 'static,
        ) -> Self {
            Self::tracked(handler, |_, _| {})
        }
        pub(crate) fn tracked(
            handler: impl Fn(usize, &str) -> Vec<u8> + Send + Sync + 'static,
            connection: impl Fn(&str, bool) + Send + Sync + 'static,
        ) -> Self {
            let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
            let origin = format!("http://{}", listener.local_addr().unwrap());
            listener.set_nonblocking(true).unwrap();
            let stop = Arc::new(AtomicBool::new(false));
            let calls = Arc::new(AtomicUsize::new(0));
            let (stop_thread, calls_thread, handler) =
                (stop.clone(), calls.clone(), Arc::new(handler));
            let connection = Arc::new(connection);
            let thread = thread::spawn(move || {
                let mut connections = Vec::new();
                while !stop_thread.load(Ordering::Relaxed) {
                    match listener.accept() {
                        Ok((mut socket, _)) => {
                            let handler = handler.clone();
                            let calls = calls_thread.clone();
                            let connection = connection.clone();
                            connections.push(thread::spawn(move || {
                                socket
                                    .set_read_timeout(Some(Duration::from_secs(3)))
                                    .unwrap();
                                socket
                                    .set_write_timeout(Some(Duration::from_secs(3)))
                                    .unwrap();
                                let mut req = Vec::new();
                                while !req.ends_with(b"\r\n\r\n") && req.len() < 32768 {
                                    let mut byte = [0];
                                    if socket.read(&mut byte).unwrap_or(0) == 0 {
                                        return;
                                    }
                                    req.push(byte[0]);
                                }
                                let count = calls.fetch_add(1, Ordering::SeqCst);
                                let request = String::from_utf8(req).unwrap();
                                connection(&request, true);
                                let response = handler(count, &request);
                                let _ = socket.write_all(&response);
                                connection(&request, false);
                                let _ = socket.shutdown(std::net::Shutdown::Both);
                            }));
                        }
                        Err(e) if e.kind() == io::ErrorKind::WouldBlock => {
                            thread::sleep(Duration::from_millis(2))
                        }
                        Err(e) => panic!("{e}"),
                    }
                }
                for connection in connections {
                    connection.join().unwrap();
                }
            });
            Self {
                origin,
                calls,
                stop,
                thread: Some(thread),
            }
        }
        pub(crate) fn count(&self) -> usize {
            self.calls.load(Ordering::SeqCst)
        }
    }
    impl Drop for Server {
        fn drop(&mut self) {
            self.stop.store(true, Ordering::Relaxed);
            self.thread.take().unwrap().join().unwrap();
        }
    }
    pub(crate) fn response(code: u16, bytes: &[u8]) -> Vec<u8> {
        let mut out = format!(
            "HTTP/1.1 {code} Test\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            bytes.len()
        )
        .into_bytes();
        out.extend_from_slice(bytes);
        out
    }
    pub(crate) fn manifest(files: &[(&str, &[u8])]) -> String {
        let files: serde_json::Map<String, Value> = files
            .iter()
            .map(|(path, bytes)| {
                (
                    path.to_string(),
                    json!({ "bytes": bytes.len(), "sha256": digest(bytes) }),
                )
            })
            .collect();
        json!({ "version": 1, "files": files }).to_string()
    }
    pub(crate) fn cache(
        dir: &Path,
        origin: Option<&str>,
        files: &[(&str, &[u8])],
        quota: u64,
    ) -> Materials {
        Materials::configured(dir.to_path_buf(), origin, &manifest(files), quota)
    }
    fn no_objects(cache: &Materials) {
        assert!(cache.disk_files().unwrap().is_empty());
        if cache.dir.exists() {
            assert!(!fs::read_dir(&cache.dir).unwrap().any(|e| e
                .unwrap()
                .file_name()
                .to_string_lossy()
                .ends_with(".tmp")));
        }
    }
    #[test]
    fn first_fetch_verifies_then_cache_hit_and_process_restart_make_no_request() {
        let dir = TestDir::new();
        let server = Server::new(|_, req| {
            assert!(req.starts_with("GET /assets/materials/test/color.webp HTTP/1.1\r\n"));
            assert!(req.contains("Connection: close\r\n"));
            response(200, b"material")
        });
        let files = [(KEY, b"material".as_slice())];
        let cache = cache(&dir.0, Some(&server.origin), &files, QUOTA);
        for _ in 0..2 {
            assert_eq!(cache.get(KEY).unwrap().as_slice(), b"material");
        }
        assert_eq!(cache.info()["files"], 1);
        assert_eq!(cache.info()["bytes"], 8);
        assert_eq!(fs::read(dir.0.join(cache.name(KEY))).unwrap(), b"material");
        let restarted = Materials::configured(
            dir.0.clone(),
            Some(&server.origin),
            &manifest(&files),
            QUOTA,
        );
        assert_eq!(restarted.get(KEY).unwrap().as_slice(), b"material");
        assert_eq!(server.count(), 1);
    }
    #[test]
    fn download_percent_encodes_each_path_segment() {
        let dir = TestDir::new();
        let path = "assets/materials/wood space/café.webp";
        let server = Server::new(|_, req| {
            assert!(
                req.starts_with("GET /assets/materials/wood%20space/caf%C3%A9.webp HTTP/1.1\r\n")
            );
            response(200, b"material")
        });
        let cache = cache(&dir.0, Some(&server.origin), &[(path, b"material")], QUOTA);
        assert_eq!(cache.get(path).unwrap().as_slice(), b"material");
        assert_eq!(server.count(), 1);
    }
    #[test]
    fn bad_hash_truncated_oversize_and_redirect_never_commit_or_retry() {
        for wire in [
            response(200, b"wrong!!!"),
            b"HTTP/1.1 200 OK\r\nContent-Length: 8\r\n\r\nshort".to_vec(),
            response(200, b"material-extra"),
            b"HTTP/1.1 200 OK\r\n\r\nmaterial-extra".to_vec(),
            b"HTTP/1.1 302 Found\r\nLocation: https://evil.test/\r\nContent-Length: 0\r\n\r\n"
                .to_vec(),
        ] {
            let dir = TestDir::new();
            let server = Server::new(move |_, _| wire.clone());
            let cache = cache(&dir.0, Some(&server.origin), &[(KEY, b"material")], QUOTA);
            assert!(matches!(cache.get(KEY), Err(CacheError::Failed(_))));
            assert_eq!(server.count(), 1);
            no_objects(&cache);
        }
    }
    #[test]
    fn not_found_is_not_retried_server_errors_are_retried_twice() {
        let dir = TestDir::new();
        let server = Server::new(|_, _| response(404, b""));
        let cache = cache(&dir.0, Some(&server.origin), &[(KEY, b"material")], QUOTA);
        assert!(matches!(cache.get(KEY), Err(CacheError::Failed(_))));
        assert_eq!(server.count(), 1);
        no_objects(&cache);
        let server = Server::new(|n, _| {
            if n < 2 {
                response(503, b"")
            } else {
                response(200, b"material")
            }
        });
        let cache = Materials::configured(
            dir.0.clone(),
            Some(&server.origin),
            &manifest(&[(KEY, b"material")]),
            QUOTA,
        );
        assert_eq!(cache.get(KEY).unwrap().as_slice(), b"material");
        assert_eq!(server.count(), 3);
        let failed_dir = TestDir::new();
        let server = Server::new(|_, _| response(500, b""));
        let cache = Materials::configured(
            failed_dir.0.clone(),
            Some(&server.origin),
            &manifest(&[(KEY, b"material")]),
            QUOTA,
        );
        assert!(matches!(cache.get(KEY), Err(CacheError::Failed(_))));
        assert_eq!(server.count(), 3);
        no_objects(&cache);
    }
    #[test]
    fn absent_origin_and_unknown_or_unsafe_keys_never_use_network() {
        let dir = TestDir::new();
        let server = Server::new(|_, _| panic!("unexpected network"));
        let off = cache(&dir.0, None, &[(KEY, b"material")], QUOTA);
        assert!(!off.enabled());
        assert_eq!(off.get(KEY), Err(CacheError::Missing));
        let cache = cache(&dir.0, Some(&server.origin), &[(KEY, b"material")], QUOTA);
        for key in [
            "assets/materials/unknown.webp",
            "assets/materials/../test/color.webp",
            "assets/materials/%2e%2e/test/color.webp",
            "ASSETS/materials/test/color.webp",
            "assets/materials/TEST/color.webp",
            "assets/materials/TEST~1/color.webp",
            "assets/materials/test/color.webp.",
            "assets/materials/test/color.webp ",
        ] {
            assert_eq!(cache.get(key), Err(CacheError::Missing), "{key}");
        }
        assert_eq!(server.count(), 0);
    }
    #[test]
    fn https_origin_enables_cache_and_manifest_url_is_encoded() {
        let dir = TestDir::new();
        let path = "assets/materials/wood space/café #?.webp";
        let https = Materials::configured(
            dir.0.clone(),
            Some("https://example.test"),
            &manifest(&[(path, b"material")]),
            QUOTA,
        );
        assert!(https.enabled());
        assert_eq!(https.info()["enabled"], true);
        assert_eq!(https.info()["origin"], "https://example.test");
        assert!(https.info().get("reason").is_none());
        let url = reqwest::Url::parse(&https.url(path)).unwrap();
        assert_eq!(url.scheme(), "https");
        assert_eq!(
            url.as_str(),
            "https://example.test/assets/materials/wood%20space/caf%C3%A9%20%23%3F.webp"
        );
        let http = cache(
            &dir.0,
            Some("http://example.test:8765"),
            &[(KEY, b"material")],
            QUOTA,
        );
        assert!(!http.enabled());
        assert_eq!(http.info()["reason"], "invalid material origin");
        assert!(matches!(http.get(KEY), Err(CacheError::Failed(_))));
    }
    #[test]
    fn https_response_status_encoding_and_size_policy() {
        let response = |status, encoding: Option<&str>, length: Option<u64>| {
            let mut builder = tauri::http::Response::builder().status(status);
            if let Some(encoding) = encoding {
                builder = builder.header("content-encoding", encoding);
            }
            if let Some(length) = length {
                builder = builder.header("content-length", length);
            }
            reqwest::blocking::Response::from(builder.body(b"material".to_vec()).unwrap())
        };
        let read = |response, cap| https_body(response, cap, Instant::now() + TOTAL_TIMEOUT);
        assert_eq!(read(response(200, None, Some(8)), 8).unwrap(), b"material");
        assert_eq!(
            read(response(200, Some("identity"), None), 8).unwrap(),
            b"material"
        );
        assert_eq!(
            read(response(404, None, None), 8),
            Err(FetchError::NotFound)
        );
        for status in [500, 503, 599] {
            assert!(matches!(
                read(response(status, None, None), 8),
                Err(FetchError::Retryable { offline: false, .. })
            ));
        }
        for status in [201, 204, 301, 302, 307, 308, 400, 401, 429] {
            assert!(matches!(
                read(response(status, None, None), 8),
                Err(FetchError::Fatal(_))
            ));
        }
        for encoding in ["gzip", "br", "identity, gzip", ""] {
            assert!(matches!(
                read(response(200, Some(encoding), None), 8),
                Err(FetchError::Fatal(_))
            ));
        }
        for length in [Some(8), None] {
            assert_eq!(
                read(response(200, None, length), 7),
                Err(fatal("body exceeds manifest size"))
            );
        }
    }
    #[test]
    fn https_streaming_cap_reads_only_one_sentinel_and_preflights_length() {
        let bytes = [b'x'; 100];
        for (length, consumed) in [(None, 11), (Some(100), 0)] {
            let mut reader = io::Cursor::new(bytes);
            assert_eq!(
                read_https_body(&mut reader, length, 10, Instant::now() + TOTAL_TIMEOUT),
                Err(fatal("body exceeds manifest size"))
            );
            assert_eq!(reader.position(), consumed);
        }
        for size in [0, 1, 16 * 1024, 16 * 1024 + 1] {
            let bytes = vec![b'x'; size];
            assert_eq!(
                read_https_body(
                    io::Cursor::new(&bytes),
                    None,
                    size as u64,
                    Instant::now() + TOTAL_TIMEOUT
                )
                .unwrap(),
                bytes
            );
        }
        assert!(matches!(
            https_read_error(io::Error::new(io::ErrorKind::TimedOut, "body timeout")),
            FetchError::Retryable { offline: true, .. }
        ));
    }
    #[test]
    fn https_plain_tcp_failures_do_not_panic_or_leave_partial_cache_files() {
        assert!(std::ptr::eq(
            HttpsFetch::client().unwrap(),
            HttpsFetch::client().unwrap()
        ));
        for garbage in [false, true] {
            let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
            let origin = format!("https://{}", listener.local_addr().unwrap());
            listener.set_nonblocking(true).unwrap();
            let stop = Arc::new(AtomicBool::new(false));
            let stopped = stop.clone();
            let server = thread::spawn(move || {
                while !stopped.load(Ordering::Relaxed) {
                    match listener.accept() {
                        Ok((mut socket, _)) => {
                            if garbage {
                                let _ = socket.write_all(b"this is not a TLS server\r\n");
                            }
                            let _ = socket.shutdown(std::net::Shutdown::Both);
                        }
                        Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                            thread::sleep(Duration::from_millis(2));
                        }
                        Err(error) => panic!("{error}"),
                    }
                }
            });
            let direct = HttpsFetch.get(
                &format!("{origin}/{KEY}"),
                8,
                Instant::now() + TOTAL_TIMEOUT,
            );
            let dir = TestDir::new();
            let cache = cache(&dir.0, Some(&origin), &[(KEY, b"material")], QUOTA);
            let cached = cache.get(KEY);
            stop.store(true, Ordering::Relaxed);
            server.join().unwrap();
            assert!(matches!(
                direct,
                Err(FetchError::Retryable { .. } | FetchError::Fatal(_))
            ));
            assert!(matches!(
                cached,
                Err(CacheError::Offline(_) | CacheError::Failed(_))
            ));
            no_objects(&cache);
        }
        assert!(matches!(
            HttpsFetch.get("http://127.0.0.1:1/", 8, Instant::now() + TOTAL_TIMEOUT),
            Err(FetchError::Fatal(_))
        ));
        assert!(matches!(
            HttpsFetch.get("https://example.test/", 8, Instant::now()),
            Err(FetchError::Retryable { offline: true, .. })
        ));
    }
    #[test]
    #[ignore = "requires internet and OS-trusted TLS at example.com"]
    fn https_online_example_html_and_cap() {
        let body = HttpsFetch
            .get(
                "https://example.com/",
                1_000_000,
                Instant::now() + TOTAL_TIMEOUT,
            )
            .unwrap();
        assert!(String::from_utf8_lossy(&body)
            .to_ascii_lowercase()
            .contains("<html"));
        assert_eq!(
            HttpsFetch.get("https://example.com/", 10, Instant::now() + TOTAL_TIMEOUT),
            Err(fatal("body exceeds manifest size"))
        );
    }
    #[test]
    fn concurrent_requests_share_exactly_one_download() {
        let dir = TestDir::new();
        let server = Server::new(|_, _| {
            thread::sleep(Duration::from_millis(150));
            response(200, b"material")
        });
        let cache = Arc::new(cache(
            &dir.0,
            Some(&server.origin),
            &[(KEY, b"material")],
            QUOTA,
        ));
        let barrier = Arc::new(Barrier::new(16));
        let jobs: Vec<_> = (0..16)
            .map(|_| {
                let (cache, barrier) = (cache.clone(), barrier.clone());
                thread::spawn(move || {
                    barrier.wait();
                    cache.get(KEY).unwrap()
                })
            })
            .collect();
        for job in jobs {
            assert_eq!(job.join().unwrap().as_slice(), b"material");
        }
        assert_eq!(server.count(), 1);
    }
    #[test]
    fn fifty_cache_hits_update_memory_but_write_the_index_at_most_once() {
        let dir = TestDir::new();
        let server = Server::new(|_, _| response(200, b"material"));
        let cache = cache(&dir.0, Some(&server.origin), &[(KEY, b"material")], QUOTA);
        cache.get(KEY).unwrap();
        // An expired debounce interval permits one hit to persist, then the
        // remaining hits must only update the in-memory order.
        let before_clock = {
            let mut state = cache.state.lock().unwrap();
            state.last_index_write = Some(Instant::now() - INDEX_INTERVAL);
            state.clock
        };
        let before_writes = cache.index_writes.load(Ordering::Relaxed);
        for _ in 0..50 {
            assert_eq!(cache.get(KEY).unwrap().as_slice(), b"material");
        }
        assert_eq!(
            cache.index_writes.load(Ordering::Relaxed) - before_writes,
            1
        );
        let state = cache.state.lock().unwrap();
        assert_eq!(state.clock, before_clock + 50);
        assert_eq!(state.access[&cache.name(KEY)], state.clock);
        assert_eq!(server.count(), 1);
    }
    #[test]
    fn persisted_files_are_first_verified_concurrently_outside_the_state_lock() {
        let dir = TestDir::new();
        let a = "assets/materials/test/a.webp";
        let b = "assets/materials/test/b.webp";
        let bytes_a = vec![b'a'; 2 * 1024 * 1024];
        let bytes_b = vec![b'b'; 2 * 1024 * 1024];
        let server = Server::new(|_, _| response(404, b""));
        let mut cache = cache(
            &dir.0,
            Some(&server.origin),
            &[(a, &bytes_a), (b, &bytes_b)],
            QUOTA,
        );
        fs::write(dir.0.join(cache.name(a)), &bytes_a).unwrap();
        fs::write(dir.0.join(cache.name(b)), &bytes_b).unwrap();
        let rendezvous = Arc::new((Mutex::new(0), Condvar::new()));
        cache.hash_hook = Some(Arc::new(move || {
            let (lock, ready) = &*rendezvous;
            let mut entered = lock.lock().unwrap();
            *entered += 1;
            ready.notify_all();
            let (entered, _) = ready
                .wait_timeout_while(entered, Duration::from_secs(3), |entered| *entered < 2)
                .unwrap();
            assert_eq!(*entered, 2, "both hash operations must overlap");
        }));
        let cache = Arc::new(cache);
        let jobs: Vec<_> = [a, b]
            .into_iter()
            .map(|path| {
                let cache = cache.clone();
                thread::spawn(move || cache.get(path).unwrap())
            })
            .collect();
        for (job, expected) in jobs.into_iter().zip([bytes_a, bytes_b]) {
            assert_eq!(job.join().unwrap().as_slice(), expected);
        }
        assert_eq!(cache.state.lock().unwrap().verified.len(), 2);
        assert_eq!(server.count(), 0);
    }
    #[test]
    fn corrupt_snapshot_does_not_delete_a_replacement_written_while_hashing() {
        let dir = TestDir::new();
        let server = Server::new(|_, _| response(404, b""));
        let mut cache = cache(&dir.0, Some(&server.origin), &[(KEY, b"material")], QUOTA);
        let object = dir.0.join(cache.name(KEY));
        fs::write(&object, b"corrupt!").unwrap();
        let old_time = fs::metadata(&object).unwrap().modified().unwrap();
        let hashes = Arc::new(AtomicUsize::new(0));
        let hook_hashes = hashes.clone();
        cache.hash_hook = Some(Arc::new(move || {
            if hook_hashes.fetch_add(1, Ordering::Relaxed) == 0 {
                fs::write(&object, b"material").unwrap();
                fs::File::options()
                    .write(true)
                    .open(&object)
                    .unwrap()
                    .set_times(fs::FileTimes::new().set_modified(old_time + Duration::from_secs(1)))
                    .unwrap();
            }
        }));
        assert_eq!(cache.get(KEY).unwrap().as_slice(), b"material");
        assert_eq!(hashes.load(Ordering::Relaxed), 2);
        assert_eq!(server.count(), 0);
        assert_eq!(fs::read(dir.0.join(cache.name(KEY))).unwrap(), b"material");
    }
    #[test]
    fn quota_evicts_least_recently_used_and_retains_owned_served_bytes() {
        let dir = TestDir::new();
        let a = "assets/materials/test/a.webp";
        let b = "assets/materials/test/b.webp";
        let c = "assets/materials/test/c.webp";
        let files = [
            (a, b"aaaa".as_slice()),
            (b, b"bbbb".as_slice()),
            (c, b"cccc".as_slice()),
        ];
        let server = Server::new(move |_, req| {
            response(
                200,
                if req.contains("/a.webp") {
                    b"aaaa"
                } else if req.contains("/b.webp") {
                    b"bbbb"
                } else {
                    b"cccc"
                },
            )
        });
        let cache = cache(&dir.0, Some(&server.origin), &files, 8);
        let served = cache.get(a).unwrap();
        cache.get(b).unwrap();
        cache.get(a).unwrap();
        // Advance the advisory persistence interval before the final hit. A
        // restart can lose up to five seconds of hit-only LRU updates.
        cache.state.lock().unwrap().last_index_write = Some(Instant::now() - INDEX_INTERVAL);
        cache.get(a).unwrap();
        // Restart: LRU must survive process state, without depending on clock resolution.
        let cache =
            Materials::configured(dir.0.clone(), Some(&server.origin), &manifest(&files), 8);
        cache.get(c).unwrap();
        assert!(dir.0.join(cache.name(a)).exists());
        assert!(!dir.0.join(cache.name(b)).exists());
        assert_eq!(cache.info()["bytes"], 8);
        cache.get(b).unwrap();
        assert!(!dir.0.join(cache.name(a)).exists());
        assert_eq!(served.as_slice(), b"aaaa");
        assert_eq!(cache.info()["bytes"], 8);
        assert_eq!(server.count(), 4);
        let tiny = TestDir::new();
        let cache =
            Materials::configured(tiny.0.clone(), Some(&server.origin), &manifest(&files), 3);
        assert!(matches!(cache.get(a), Err(CacheError::Failed(_))));
        assert_eq!(server.count(), 4);
    }
    #[test]
    fn corrupted_cache_is_deleted_and_redownloaded_on_first_process_use() {
        let dir = TestDir::new();
        let server = Server::new(|_, _| response(200, b"material"));
        let files = [(KEY, b"material".as_slice())];
        let cache = cache(&dir.0, Some(&server.origin), &files, QUOTA);
        cache.get(KEY).unwrap();
        fs::write(dir.0.join(cache.name(KEY)), b"corrupt!").unwrap();
        let cache = Materials::configured(
            dir.0.clone(),
            Some(&server.origin),
            &manifest(&files),
            QUOTA,
        );
        assert_eq!(cache.get(KEY).unwrap().as_slice(), b"material");
        assert_eq!(server.count(), 2);
        fs::write(dir.0.join(cache.name(KEY)), b"short").unwrap();
        let cache = Materials::configured(
            dir.0.clone(),
            Some(&server.origin),
            &manifest(&files),
            QUOTA,
        );
        cache.get(KEY).unwrap();
        assert_eq!(server.count(), 3);
    }
    #[test]
    fn loopback_client_limits_headers_deadline_and_authority_and_supports_eof() {
        for url in [
            "https://localhost:80/x",
            "http://example.test:80/x",
            "http://127.0.0.2:80/x",
            "http://localhost.evil:80/x",
            "http://user@localhost:80/x",
            "http://localhost/x",
            "http://localhost:0/x",
            "http://localhost:80/x\r\nInjected: y",
        ] {
            assert!(
                matches!(
                    LoopbackHttp.get(url, 8, Instant::now() + TOTAL_TIMEOUT),
                    Err(FetchError::Fatal(_))
                ),
                "{url}"
            );
        }
        for wire in [
            b"HTTP/1.1 200 OK\r\n\r\nmaterial".to_vec(),
            response(200, b"material"),
        ] {
            let server = Server::new(move |_, _| wire.clone());
            assert_eq!(
                LoopbackHttp
                    .get(
                        &format!("{}/file", server.origin.replace("127.0.0.1", "localhost")),
                        8,
                        Instant::now() + TOTAL_TIMEOUT
                    )
                    .unwrap(),
                b"material"
            );
        }
        for wire in [
            b"HTTP/1.1 200 OK\r\nContent-Length: 8\r\nContent-Length: 8\r\n\r\nmaterial".to_vec(),
            b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n".to_vec(),
            b"HTTP/1.1 200 OK\r\nContent-Encoding: gzip\r\n\r\nmaterial".to_vec(),
            b"HTTP/1.1 200 OK\r\nInvalid Header\r\n\r\n".to_vec(),
            format!("HTTP/1.1 200 OK\r\nX-Huge: {}\r\n\r\n", "x".repeat(33000)).into_bytes(),
            b"HTTP/1.1 200 OK\r\nContent-Length: -1\r\n\r\n".to_vec(),
        ] {
            let server = Server::new(move |_, _| wire.clone());
            assert!(matches!(
                LoopbackHttp.get(
                    &format!("{}/file", server.origin),
                    8,
                    Instant::now() + TOTAL_TIMEOUT
                ),
                Err(FetchError::Fatal(_))
            ));
        }
        let server = Server::new(|_, _| {
            thread::sleep(Duration::from_millis(150));
            response(200, b"material")
        });
        let start = Instant::now();
        assert!(matches!(
            LoopbackHttp.get(
                &format!("{}/file", server.origin),
                8,
                start + Duration::from_millis(40)
            ),
            Err(FetchError::Retryable { offline: true, .. })
        ));
        assert!(start.elapsed() < Duration::from_secs(1));
    }
    #[test]
    fn connection_failures_are_offline_and_leave_no_object() {
        let dir = TestDir::new();
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let origin = format!("http://{}", listener.local_addr().unwrap());
        drop(listener);
        let cache = cache(&dir.0, Some(&origin), &[(KEY, b"material")], QUOTA);
        assert!(matches!(cache.get(KEY), Err(CacheError::Offline(_))));
        no_objects(&cache);
    }
    #[test]
    #[ignore = "requires real Git LFS material objects"]
    fn real_lfs_three_files_round_trip_byte_identically() {
        let dir = TestDir::new();
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        let manifest: Value = serde_json::from_str(MANIFEST).unwrap();
        let paths: Vec<String> = manifest["files"]
            .as_object()
            .unwrap()
            .keys()
            .take(3)
            .cloned()
            .collect();
        let server_root = root.clone();
        let server = Server::new(move |_, request| {
            let raw = request
                .split_whitespace()
                .nth(1)
                .unwrap()
                .trim_start_matches('/');
            assert!(valid_path(raw));
            response(200, &fs::read(server_root.join(raw)).unwrap())
        });
        let cache = Materials::configured(dir.0.clone(), Some(&server.origin), MANIFEST, QUOTA);
        for path in paths {
            let actual = fs::read(root.join(&path)).unwrap();
            assert!(!actual.starts_with(b"version https://git-lfs"));
            assert_eq!(cache.get(&path).unwrap().as_slice(), actual);
            assert_eq!(cache.get(&path).unwrap().as_slice(), actual);
        }
        assert_eq!(server.count(), 3);
    }
}
