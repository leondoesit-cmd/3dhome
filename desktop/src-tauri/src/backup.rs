use std::{
    fs::{self, OpenOptions},
    io::{self, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
    time::{SystemTime, UNIX_EPOCH},
};

use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tauri::http::{Request, StatusCode};

const KEEP: usize = 20;
static TEMP_ID: AtomicU64 = AtomicU64::new(0);

pub struct Backups {
    dir: PathBuf,
    // A batch must not race another save or expose mismatched model/attachments.
    lock: Mutex<()>,
}

pub fn valid_key(key: &str) -> bool {
    let bytes = key.as_bytes();
    (1..=120).contains(&bytes.len())
        && bytes.iter().enumerate().all(|(i, b)| {
            b.is_ascii_alphanumeric() || matches!(b, b'_' | b'-') || (i > 0 && *b == b'.')
        })
}

impl Backups {
    pub fn new(dir: PathBuf) -> Self {
        Self {
            dir,
            lock: Mutex::new(()),
        }
    }

    pub fn handle(&self, request: &Request<Vec<u8>>) -> (StatusCode, Value) {
        let Ok(_guard) = self.lock.lock() else {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                json!({ "error": "backup store unavailable" }),
            );
        };
        match request.method().as_str() {
            "GET" => {
                let key = request
                    .uri()
                    .query()
                    .unwrap_or("")
                    .split('&')
                    .find_map(|pair| {
                        let (name, value) = pair.split_once('=').unwrap_or((pair, ""));
                        (form_decode(name).as_deref() == Some("key")).then(|| form_decode(value))
                    });
                let key = match key {
                    None => return (StatusCode::OK, json!({ "models": self.list() })),
                    Some(Some(key)) if valid_key(&key) => key,
                    _ => {
                        return (
                            StatusCode::BAD_REQUEST,
                            json!({ "error": "invalid model key" }),
                        )
                    }
                };
                let Some(dir) = self.key_dir(&key, false).ok() else {
                    return missing();
                };
                let Some(model) = read_json(&dir.join("latest.json")) else {
                    return missing();
                };
                let attachments = read_json(&dir.join("attachments.json"))
                    .filter(Value::is_array)
                    .unwrap_or_else(|| json!([]));
                (
                    StatusCode::OK,
                    json!({ "model": model, "attachments": attachments }),
                )
            }
            "POST" => {
                let payload: Value = match serde_json::from_slice(request.body()) {
                    Ok(payload) => payload,
                    Err(_) => return (StatusCode::BAD_REQUEST, json!({ "error": "invalid JSON" })),
                };
                let Some(models) = payload["models"]
                    .as_array()
                    .filter(|m| !m.is_empty() && m.len() <= 500)
                else {
                    return (
                        StatusCode::BAD_REQUEST,
                        json!({ "error": "models[] required" }),
                    );
                };
                let mut results = Vec::with_capacity(models.len());
                for record in models {
                    let key = record.get("key").and_then(Value::as_str);
                    let attachments = key
                        .and_then(|key| payload["attachments"].get(key))
                        .and_then(Value::as_array)
                        .map(Vec::as_slice)
                        .unwrap_or(&[]);
                    results.push(match self.write(record, attachments, now_ms(), KEEP) {
                        Ok(result) => result,
                        Err(error) => json!({ "key": key, "error": error.to_string() }),
                    });
                }
                (StatusCode::OK, json!({ "results": results }))
            }
            _ => (
                StatusCode::METHOD_NOT_ALLOWED,
                json!({ "error": "GET or POST only" }),
            ),
        }
    }

    fn key_dir(&self, key: &str, create: bool) -> io::Result<PathBuf> {
        if !valid_key(key) {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "invalid model key",
            ));
        }
        if create {
            fs::create_dir_all(&self.dir)?;
        }
        let root = fs::canonicalize(&self.dir)?;
        let dir = root.join(key);
        if create {
            match fs::create_dir(&dir) {
                Ok(()) => (),
                Err(error) if error.kind() == io::ErrorKind::AlreadyExists => (),
                Err(error) => return Err(error),
            }
        }
        let meta = fs::symlink_metadata(&dir)?;
        let real = fs::canonicalize(&dir)?;
        // Also reject junctions/aliases resolving outside the app-data root.
        if !meta.is_dir() || meta.file_type().is_symlink() || real.parent() != Some(root.as_path())
        {
            return Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "unsafe backup directory",
            ));
        }
        Ok(real)
    }

    fn list(&self) -> Vec<Value> {
        let Ok(entries) = fs::read_dir(&self.dir) else {
            return Vec::new();
        };
        let mut models = Vec::new();
        for entry in entries.flatten() {
            let Some(key) = entry.file_name().to_str().map(str::to_owned) else {
                continue;
            };
            let Ok(dir) = self.key_dir(&key, false) else {
                continue;
            };
            if let Some(meta) = read_json(&dir.join("meta.json")).filter(|meta| meta["key"] == key)
            {
                models.push(meta);
            }
        }
        models.sort_by(|a, b| number(&b["savedAt"]).total_cmp(&number(&a["savedAt"])));
        models
    }

    fn write(
        &self,
        record: &Value,
        attachments: &[Value],
        now: u64,
        keep: usize,
    ) -> io::Result<Value> {
        if !record.is_object() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "model record required",
            ));
        }
        let key = record["key"]
            .as_str()
            .filter(|key| valid_key(key))
            .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "invalid model key"))?;
        let text = serde_json::to_vec(record)?;
        let sha256 = format!("{:x}", Sha256::digest(&text));
        let dir = self.key_dir(key, true)?;
        let prior = read_json(&dir.join("meta.json"));
        let revision = number(&record["revision"]).trunc();
        let revision = if revision.is_finite() && revision != 0.0 {
            revision
        } else {
            0.0
        };
        if let Some(mut prior) = prior {
            if revision < number(&prior["revision"]) {
                return Ok(
                    json!({ "key": key, "written": false, "stale": true, "revision": prior["revision"] }),
                );
            }
            if prior["sha256"] == sha256 {
                if !attachments.is_empty() && number(&prior["attachments"]) == 0.0 {
                    write_atomic(
                        &dir.join("attachments.json"),
                        &serde_json::to_vec(attachments)?,
                    )?;
                    prior["attachments"] = json!(attachments.len());
                    write_atomic(&dir.join("meta.json"), &serde_json::to_vec(&prior)?)?;
                }
                return Ok(json!({ "key": key, "written": false }));
            }
        }
        let version = format!("{}-r{revision}.json", stamp(now));
        write_atomic(&dir.join(&version), &text)?;
        write_atomic(&dir.join("latest.json"), &text)?;
        if attachments.is_empty() {
            match fs::remove_file(dir.join("attachments.json")) {
                Ok(()) => (),
                Err(error) if error.kind() == io::ErrorKind::NotFound => (),
                Err(error) => return Err(error),
            }
        } else {
            write_atomic(
                &dir.join("attachments.json"),
                &serde_json::to_vec(attachments)?,
            )?;
        }
        let versions = version_files(&dir)?;
        let keep = keep.max(1);
        for old in versions.iter().take(versions.len().saturating_sub(keep)) {
            fs::remove_file(dir.join(old))?;
        }
        let name = record["name"].as_str().unwrap_or(key);
        // Avoid splitting a Unicode scalar at the JS client's UTF-16 name limit.
        let mut units = 0;
        let name: String = name
            .chars()
            .take_while(|c| {
                units += c.len_utf16();
                units <= 200
            })
            .collect();
        let revision = if revision >= i64::MIN as f64 && revision < i64::MAX as f64 {
            json!(revision as i64)
        } else {
            json!(revision)
        };
        let meta = json!({
            "key": key, "name": name, "revision": revision, "savedAt": now,
            "bytes": text.len(), "sha256": sha256, "versions": versions.len().min(keep),
            "attachments": attachments.len(),
        });
        write_atomic(&dir.join("meta.json"), &serde_json::to_vec(&meta)?)?;
        Ok(json!({ "key": key, "written": true, "version": version }))
    }
}

fn missing() -> (StatusCode, Value) {
    (
        StatusCode::NOT_FOUND,
        json!({ "error": "no backup for that key" }),
    )
}

fn form_decode(value: &str) -> Option<String> {
    crate::web::percent_decode(&value.replace('+', " "))
}

fn read_json(file: &Path) -> Option<Value> {
    let meta = fs::symlink_metadata(file).ok()?;
    if !meta.is_file() || meta.file_type().is_symlink() {
        return None;
    }
    serde_json::from_slice(&fs::read(file).ok()?).ok()
}

fn version_files(dir: &Path) -> io::Result<Vec<String>> {
    let mut versions = Vec::new();
    for entry in fs::read_dir(dir)? {
        let name = entry?.file_name().to_string_lossy().into_owned();
        if name.ends_with(".json")
            && !["latest.json", "meta.json", "attachments.json"].contains(&name.as_str())
        {
            versions.push(name);
        }
    }
    versions.sort();
    Ok(versions)
}

fn write_atomic(file: &Path, bytes: &[u8]) -> io::Result<()> {
    let id = TEMP_ID.fetch_add(1, Ordering::Relaxed);
    let tmp = file.with_extension(format!("json.{}.{id}.tmp", std::process::id()));
    let result = (|| {
        let mut out = OpenOptions::new().write(true).create_new(true).open(&tmp)?;
        out.write_all(bytes)?;
        out.sync_all()?;
        drop(out);
        fs::rename(&tmp, file)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result
}

fn number(value: &Value) -> f64 {
    match value {
        Value::Null => 0.0,
        Value::Bool(b) => u8::from(*b) as f64,
        Value::Number(n) => n.as_f64().unwrap_or(f64::NAN),
        Value::String(s) => {
            let s = s.trim();
            if s.is_empty() {
                return 0.0;
            }
            for (prefix, radix) in [("0x", 16), ("0o", 8), ("0b", 2)] {
                if s.to_ascii_lowercase().starts_with(prefix) {
                    return u64::from_str_radix(&s[2..], radix)
                        .map(|n| n as f64)
                        .unwrap_or(f64::NAN);
                }
            }
            s.parse().unwrap_or(f64::NAN)
        }
        Value::Array(items) if items.is_empty() => 0.0,
        Value::Array(items) if items.len() == 1 => match &items[0] {
            Value::Null => 0.0,
            Value::String(_) | Value::Number(_) | Value::Array(_) => number(&items[0]),
            _ => f64::NAN,
        },
        _ => f64::NAN,
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock before epoch")
        .as_millis() as u64
}

fn stamp(ms: u64) -> String {
    // Gregorian civil date from days since the Unix epoch (400-year eras).
    let days = (ms / 86_400_000) as i64 + 719_468;
    let era = days / 146_097;
    let doe = days - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = mp + if mp < 10 { 3 } else { -9 };
    let year = year + i64::from(month <= 2);
    let seconds = ms / 1000;
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}-{:02}-{:02}-{:03}Z",
        seconds / 3600 % 24,
        seconds / 60 % 60,
        seconds % 60,
        ms % 1000
    )
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    pub(crate) struct TestDir(pub PathBuf);

    impl TestDir {
        pub(crate) fn new() -> Self {
            let id = TEMP_ID.fetch_add(1, Ordering::Relaxed);
            let path = Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("target")
                .join("test-data")
                .join(format!("{}-{}-{id}", std::process::id(), now_ms()));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            fs::remove_dir_all(&self.0).unwrap();
        }
    }

    #[test]
    fn key_validation_matches_relay() {
        for key in [
            "a",
            "_",
            "-",
            "cm_mu32mylp",
            "A-1_b.c",
            "a..b",
            &"a".repeat(120),
        ] {
            assert!(valid_key(key), "{key}");
        }
        for key in [
            "",
            ".",
            "..",
            ".hidden",
            "../escape",
            "a/../../b",
            "a\\b",
            "/absolute",
            "C:\\x",
            "a\0b",
            "%2e%2e",
            "a b",
            "é",
            &"a".repeat(121),
        ] {
            assert!(!valid_key(key), "{key}");
        }
    }

    #[test]
    fn versions_prune_and_metadata_hashes_saved_bytes() {
        let temp = TestDir::new();
        let store = Backups::new(temp.0.join("backups"));
        for revision in 1..=23 {
            store
                .write(
                    &json!({ "key": "cm_test", "name": "Desk", "revision": revision }),
                    &[],
                    1_700_000_000_000 + revision,
                    KEEP,
                )
                .unwrap();
        }
        let dir = store.key_dir("cm_test", false).unwrap();
        let versions = version_files(&dir).unwrap();
        assert_eq!(versions.len(), 20);
        assert!(versions.first().unwrap().ends_with("-r4.json"));
        assert!(versions.last().unwrap().ends_with("-r23.json"));
        let meta = read_json(&dir.join("meta.json")).unwrap();
        let bytes = fs::read(dir.join("latest.json")).unwrap();
        assert_eq!(meta["sha256"], format!("{:x}", Sha256::digest(&bytes)));
        assert_eq!(meta["bytes"], bytes.len());
        assert_eq!(meta["revision"], 23);
        assert_eq!(meta["versions"], 20);
        assert_eq!(meta["savedAt"], 1_700_000_000_023_u64);
        assert!(!fs::read_dir(&dir).unwrap().any(|e| e
            .unwrap()
            .path()
            .extension()
            .is_some_and(|e| e == "tmp")));

        store
            .write(&json!({ "key": "a_old" }), &[], 1000, KEEP)
            .unwrap();
        store
            .write(&json!({ "key": "z_new" }), &[], 1_800_000_000_000, KEEP)
            .unwrap();
        let keys: Vec<_> = store
            .list()
            .iter()
            .map(|meta| meta["key"].as_str().unwrap().to_owned())
            .collect();
        assert_eq!(keys, ["z_new", "cm_test", "a_old"]);

        let other = Backups::new(temp.0.join("keep-two"));
        for revision in 1..=4 {
            other
                .write(
                    &json!({ "key": "k", "revision": revision }),
                    &[],
                    revision,
                    2,
                )
                .unwrap();
        }
        assert_eq!(
            version_files(&other.key_dir("k", false).unwrap())
                .unwrap()
                .len(),
            2
        );
    }

    #[test]
    fn duplicate_stale_and_attachment_rules_match_relay() {
        let temp = TestDir::new();
        let store = Backups::new(temp.0.join("backups"));
        let record = json!({ "key": "k", "name": "x".repeat(201), "revision": "2.9" });
        assert_eq!(
            store.write(&record, &[], 1000, KEEP).unwrap()["written"],
            true
        );
        let attachment = json!({ "reference": { "key": "brep" }, "payload": "exact" });
        assert_eq!(
            store
                .write(&record, &[attachment.clone()], 2000, KEEP)
                .unwrap()["written"],
            false
        );
        let dir = store.key_dir("k", false).unwrap();
        let meta = read_json(&dir.join("meta.json")).unwrap();
        assert_eq!(meta["attachments"], 1);
        assert_eq!(meta["savedAt"], 1000);
        assert_eq!(meta["revision"], 2);
        assert_eq!(meta["name"].as_str().unwrap().len(), 200);
        let stale = store
            .write(&json!({ "key": "k", "revision": 1 }), &[], 3000, KEEP)
            .unwrap();
        assert_eq!(
            stale,
            json!({ "key": "k", "written": false, "stale": true, "revision": 2 })
        );
        assert_eq!(
            read_json(&dir.join("attachments.json")),
            Some(json!([attachment]))
        );
        store
            .write(&json!({ "key": "k", "revision": 3 }), &[], 4000, KEEP)
            .unwrap();
        assert!(!dir.join("attachments.json").exists());
        assert_eq!(version_files(&dir).unwrap().len(), 2);
    }

    #[test]
    fn timestamps_match_iso_version_names() {
        assert_eq!(stamp(0), "1970-01-01T00-00-00-000Z");
        assert_eq!(stamp(951_827_696_789), "2000-02-29T12-34-56-789Z");
        assert_eq!(stamp(1_700_000_000_000), "2023-11-14T22-13-20-000Z");
    }

    #[test]
    fn traversal_never_creates_files_outside_store() {
        let temp = TestDir::new();
        let store = Backups::new(temp.0.join("backups"));
        for key in [
            "../escaped",
            "..\\escaped",
            "/escaped",
            "C:\\escaped",
            ".hidden",
        ] {
            assert!(store
                .write(&json!({ "key": key }), &[], 1000, KEEP)
                .is_err());
            assert!(store.key_dir(key, false).is_err());
        }
        assert!(!store.dir.exists());
        assert!(!temp.0.join("escaped").exists());
    }
}
