use std::{
    collections::{HashSet, VecDeque},
    sync::{
        atomic::{AtomicUsize, Ordering},
        mpsc, Arc, Condvar, Mutex,
    },
};

use tauri::{http::Request, UriSchemeResponder};

use crate::materials::Materials;
use crate::web::{self, Site};

type Respond = Box<dyn FnOnce(web::Reply) + Send>;
pub(crate) struct Job {
    request: Request<Vec<u8>>,
    respond: Respond,
    _permit: BodyPermit,
    _page: Option<PagePermit>,
}

#[derive(Default)]
struct Backlog {
    paths: VecDeque<String>,
    // Includes the active prefetch, so repeated calls cannot add it twice.
    keys: HashSet<String>,
    pages: usize,
    stopped: bool,
}

pub(crate) struct Prefetch {
    shared: Arc<(Mutex<Backlog>, Condvar)>,
}

impl Prefetch {
    fn new(materials: Arc<Materials>) -> std::io::Result<Self> {
        let shared = Arc::new((Mutex::new(Backlog::default()), Condvar::new()));
        let worker = shared.clone();
        std::thread::Builder::new()
            .name("mf-prefetch".into())
            .spawn(move || loop {
                let (lock, ready) = &*worker;
                let path = {
                    let mut backlog = lock.lock().unwrap();
                    while !backlog.stopped && (backlog.paths.is_empty() || backlog.pages != 0) {
                        backlog = ready.wait(backlog).unwrap();
                    }
                    if backlog.stopped {
                        break;
                    }
                    backlog.paths.pop_front().unwrap()
                };
                // This worker never consumes a page queue slot. Materials::get
                // shares its flight with a page requesting this same object.
                let _ = materials.get(&path);
                lock.lock().unwrap().keys.remove(&path);
            })?;
        Ok(Self { shared })
    }

    pub(crate) fn add<'a>(&self, paths: impl Iterator<Item = &'a str>) -> (usize, usize) {
        let (lock, ready) = &*self.shared;
        let mut backlog = lock.lock().unwrap();
        let mut queued = 0;
        for path in paths {
            if backlog.keys.insert(path.to_string()) {
                backlog.paths.push_back(path.to_string());
                queued += 1;
            }
        }
        ready.notify_one();
        (queued, backlog.keys.len())
    }

    pub(crate) fn pending(&self) -> usize {
        self.shared.0.lock().unwrap().keys.len()
    }

    fn page(self: &Arc<Self>) -> PagePermit {
        self.shared.0.lock().unwrap().pages += 1;
        PagePermit(self.clone())
    }
}

impl Drop for Prefetch {
    fn drop(&mut self) {
        let (lock, ready) = &*self.shared;
        lock.lock().unwrap().stopped = true;
        ready.notify_one();
    }
}

struct PagePermit(Arc<Prefetch>);
impl Drop for PagePermit {
    fn drop(&mut self) {
        let (lock, ready) = &*self.0.shared;
        lock.lock().unwrap().pages -= 1;
        ready.notify_one();
    }
}

const BODY_BUDGET: usize = 192 * 1024 * 1024;

struct BodyPermit {
    pending: Arc<AtomicUsize>,
    bytes: usize,
}

impl BodyPermit {
    fn reserve(pending: &Arc<AtomicUsize>, bytes: usize) -> Option<Self> {
        pending
            .try_update(Ordering::Relaxed, Ordering::Relaxed, |used| {
                used.checked_add(bytes)
                    .filter(|total| *total <= BODY_BUDGET)
            })
            .ok()?;
        Some(Self {
            pending: Arc::clone(pending),
            bytes,
        })
    }
}

impl Drop for BodyPermit {
    fn drop(&mut self) {
        self.pending.fetch_sub(self.bytes, Ordering::Relaxed);
    }
}

pub struct Pool {
    site: Site,
    sender: mpsc::SyncSender<Job>,
    material_sender: mpsc::SyncSender<Job>,
    prefetch: Arc<Prefetch>,
    pending: Arc<AtomicUsize>,
}

impl Pool {
    pub fn new(site: Site) -> std::io::Result<Self> {
        // Leave room for the static module graph without queueing unlimited bodies.
        let (sender, receiver) = mpsc::sync_channel::<Job>(192);
        let (material_sender, material_receiver) = mpsc::sync_channel::<Job>(64);
        let prefetch = Arc::new(Prefetch::new(site.materials.clone())?);
        *site.prefetch.lock().unwrap() = Arc::downgrade(&prefetch);
        let material_receiver = Arc::new(Mutex::new(material_receiver));
        for i in 0..3 {
            let receiver = Arc::clone(&material_receiver);
            let site = site.clone();
            std::thread::Builder::new()
                .name(format!("mf-material-{i}"))
                .spawn(move || loop {
                    let job = receiver.lock().expect("material queue poisoned").recv();
                    match job {
                        Ok(job) => (job.respond)(site.handle(job.request)),
                        Err(_) => break,
                    }
                })?;
        }
        let receiver = Arc::new(Mutex::new(receiver));
        for i in 0..5 {
            let receiver = Arc::clone(&receiver);
            let site = site.clone();
            std::thread::Builder::new()
                .name(format!("mf-web-{i}"))
                .spawn(move || loop {
                    let job = receiver.lock().expect("request queue poisoned").recv();
                    let Ok(job) = job else {
                        break;
                    };
                    (job.respond)(site.handle(job.request));
                })?;
        }
        Ok(Self {
            site,
            sender,
            material_sender,
            prefetch,
            pending: Arc::new(AtomicUsize::new(0)),
        })
    }

    pub fn submit(&self, request: Request<Vec<u8>>, responder: UriSchemeResponder) {
        self.enqueue(request, Box::new(move |reply| responder.respond(reply)));
    }

    fn enqueue(&self, request: Request<Vec<u8>>, respond: Respond) {
        // Reject before queueing, so invalid bodies do not occupy worker slots.
        if let Some(reply) = self.site.preflight(&request) {
            respond(reply);
            return;
        }
        let Some(permit) = BodyPermit::reserve(&self.pending, request.body().len()) else {
            respond(busy());
            return;
        };
        let material = self.site.material_request(&request);
        let job = Job {
            request,
            respond,
            _permit: permit,
            _page: material.then(|| self.prefetch.page()),
        };
        if material {
            if let Err(error) = self.material_sender.try_send(job) {
                let (mpsc::TrySendError::Full(job) | mpsc::TrySendError::Disconnected(job)) = error;
                (job.respond)(busy());
            }
        } else if let Err(error) = self.sender.try_send(job) {
            let (mpsc::TrySendError::Full(job) | mpsc::TrySendError::Disconnected(job)) = error;
            (job.respond)(busy());
        }
    }
}

fn busy() -> web::Reply {
    web::json(
        tauri::http::StatusCode::SERVICE_UNAVAILABLE,
        serde_json::json!({ "error": "desktop request queue full" }),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn body_budget_releases_capacity_and_leaves_room_for_assets() {
        let pending = Arc::new(AtomicUsize::new(0));
        let first = BodyPermit::reserve(&pending, BODY_BUDGET / 2).unwrap();
        let second = BodyPermit::reserve(&pending, BODY_BUDGET / 2).unwrap();
        assert!(BodyPermit::reserve(&pending, 1).is_none());
        assert!(BodyPermit::reserve(&pending, 0).is_some());
        drop(first);
        assert!(BodyPermit::reserve(&pending, BODY_BUDGET / 2).is_some());
        drop(second);
        assert_eq!(pending.load(Ordering::Relaxed), 0);
        assert!(BodyPermit::reserve(&pending, usize::MAX).is_none());
    }

    #[test]
    fn prefetch_backlog_prioritizes_pages_deduplicates_and_caches_every_path() {
        use crate::{
            backup::tests::TestDir,
            materials::{
                tests::{cache, response, Server},
                QUOTA,
            },
        };
        use serde_json::{json, Value};
        use std::{
            fs,
            time::{Duration, Instant},
        };

        let dir = TestDir::new();
        let root = dir.0.join("web");
        fs::create_dir_all(&root).unwrap();
        let keys: Vec<String> = (0u64..520)
            .map(|n| format!("assets/materials/test/{n}.webp"))
            .collect();
        let bytes: Vec<[u8; 8]> = (0u64..520).map(u64::to_le_bytes).collect();
        let files: Vec<_> = keys
            .iter()
            .zip(&bytes)
            .map(|(k, b)| (k.as_str(), b.as_slice()))
            .collect();
        // Hold prefetch 0 and page 500 independently. Other pages must still
        // finish, and the next prefetch must wait for page 500 to finish too.
        let gate = Arc::new((Mutex::new([false; 2]), Condvar::new()));
        let server_gate = gate.clone();
        let active = Arc::new(AtomicUsize::new(0));
        let peak = Arc::new(AtomicUsize::new(0));
        let calls = Arc::new((0..520).map(|_| AtomicUsize::new(0)).collect::<Vec<_>>());
        let server_calls = calls.clone();
        let page_finished = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let server_finished = page_finished.clone();
        let tracked_finished = page_finished.clone();
        let tracked_peak = peak.clone();
        let number = |req: &str| -> usize {
            req.split_whitespace()
                .nth(1)
                .unwrap()
                .rsplit('/')
                .next()
                .unwrap()
                .strip_suffix(".webp")
                .unwrap()
                .parse()
                .unwrap()
        };
        let server = Server::tracked(
            move |_, req| {
                let n = number(req);
                server_calls[n].fetch_add(1, Ordering::SeqCst);
                if n == 0 || n == 500 {
                    let (lock, ready) = &*server_gate;
                    let index = usize::from(n == 500);
                    let (open, _) = ready
                        .wait_timeout_while(lock.lock().unwrap(), Duration::from_secs(15), |open| {
                            !open[index]
                        })
                        .unwrap();
                    assert!(open[index], "test must release stalled connection");
                } else if n < 500 || n == 519 {
                    assert!(
                        server_finished.load(Ordering::SeqCst),
                        "prefetch must yield to queued/running page requests"
                    );
                    std::thread::sleep(Duration::from_millis(2));
                }
                response(200, &(n as u64).to_le_bytes())
            },
            move |req, opened| {
                let n = number(req);
                if n < 500 || n == 519 {
                    if opened {
                        let count = active.fetch_add(1, Ordering::SeqCst) + 1;
                        tracked_peak.fetch_max(count, Ordering::SeqCst);
                    } else {
                        active.fetch_sub(1, Ordering::SeqCst);
                    }
                }
                if n == 500 && !opened {
                    tracked_finished.store(true, Ordering::SeqCst);
                }
            },
        );
        let mut site = Site::new(root, dir.0.join("backups"));
        site.materials = Arc::new(cache(
            &dir.0.join("cache"),
            Some(&server.origin),
            &files,
            QUOTA,
        ));
        let pool = Pool::new(site.clone()).unwrap();
        let request = |method: &str, path: &str, body: Value| {
            Request::builder()
                .method(method)
                .uri(format!("mf://localhost{path}"))
                .header(
                    "Origin",
                    if cfg!(target_os = "windows") {
                        "http://mf.localhost"
                    } else {
                        "mf://localhost"
                    },
                )
                .body(if body.is_null() {
                    Vec::new()
                } else {
                    body.to_string().into_bytes()
                })
                .unwrap()
        };
        let enqueue = |req| {
            let (tx, rx) = mpsc::channel();
            pool.enqueue(
                req,
                Box::new(move |reply| {
                    let _ = tx.send(reply);
                }),
            );
            rx
        };
        let call = |req| {
            enqueue(req)
                .recv_timeout(Duration::from_secs(3))
                .expect("general workers remain available")
        };
        let value = |reply: &web::Reply| serde_json::from_slice::<Value>(reply.body()).unwrap();
        let reply = call(request(
            "POST",
            "/api/material-cache/prefetch",
            json!({ "paths": &keys[..500] }),
        ));
        assert_eq!(reply.status(), 202);
        assert_eq!(value(&reply), json!({ "queued": 500, "pending": 500 }));
        let deadline = Instant::now() + Duration::from_secs(3);
        while calls[0].load(Ordering::SeqCst) == 0 && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(5));
        }
        assert_eq!(calls[0].load(Ordering::SeqCst), 1);

        // Twenty page GETs fit even with 500 outstanding prefetch paths. The
        // first joins the already active prefetch instead of downloading twice.
        let page0 = enqueue(request("GET", &format!("/{}", keys[0]), Value::Null));
        let page500 = enqueue(request("GET", &format!("/{}", keys[500]), Value::Null));
        let pages: Vec<_> = (501..519)
            .map(|n| {
                (
                    n,
                    enqueue(request("GET", &format!("/{}", keys[n]), Value::Null)),
                )
            })
            .collect();
        for (n, rx) in pages {
            let reply = rx.recv_timeout(Duration::from_secs(3)).unwrap();
            assert_eq!(reply.status(), 200, "page {n} must never be busy");
            assert_eq!(reply.body().as_ref(), &(n as u64).to_le_bytes());
        }
        assert!(page0.try_recv().is_err());
        assert!(page500.try_recv().is_err());
        let reply = call(request(
            "POST",
            "/api/material-cache/prefetch",
            json!({ "paths": [&keys[0], &keys[1], &keys[519], &keys[519]] }),
        ));
        assert_eq!(value(&reply), json!({ "queued": 1, "pending": 501 }));
        assert_eq!(
            value(&call(request("GET", "/api/material-cache", Value::Null)))["pending"],
            501
        );
        // Backups retain their own workers while both material lanes stall.
        assert_eq!(
            call(request(
                "POST",
                "/api/model-backup",
                json!({ "models": [{ "key": "during_download", "revision": 1 }] })
            ))
            .status(),
            200
        );
        assert_eq!(
            value(&call(request(
                "GET",
                "/api/model-backup?key=during_download",
                Value::Null
            )))["model"]["revision"],
            1
        );
        let (lock, ready) = &*gate;
        lock.lock().unwrap()[0] = true;
        ready.notify_all();
        let reply = page0.recv_timeout(Duration::from_secs(3)).unwrap();
        assert_eq!(reply.status(), 200);
        assert_eq!(reply.body().as_ref(), &0u64.to_le_bytes());
        // Page 500 is still running: no second prefetch may begin.
        std::thread::sleep(Duration::from_millis(100));
        assert_eq!(server.count(), 20);
        lock.lock().unwrap()[1] = true;
        ready.notify_all();
        let reply = page500.recv_timeout(Duration::from_secs(3)).unwrap();
        assert_eq!(reply.status(), 200);
        assert_eq!(reply.body().as_ref(), &500u64.to_le_bytes());
        let deadline = Instant::now() + Duration::from_secs(30);
        while pool.prefetch.pending() != 0 && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(10));
        }
        assert_eq!(pool.prefetch.pending(), 0);
        assert_eq!(site.materials.info()["files"], 520);
        assert_eq!(
            peak.load(Ordering::SeqCst),
            1,
            "one prefetch connection at a time"
        );
        assert_eq!(server.count(), 520);
        assert!(calls.iter().all(|count| count.load(Ordering::SeqCst) == 1));
        assert_eq!(
            value(&call(request("GET", "/api/material-cache", Value::Null)))["pending"],
            0
        );
    }
}
