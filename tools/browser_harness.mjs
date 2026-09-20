/* A real-layout test harness, in ~200 lines and no new dependencies.
 *
 * The string-matching tests in tests/*.test.mjs can tell you a CSS rule EXISTS.
 * They cannot tell you the grid it belongs to resolved five 97px tracks inside
 * a 375px sheet and clipped Hole wizard off the end — that needs a layout
 * engine. jsdom has none, so it would not have caught that bug either.
 *
 * So: serve the app over node:http, drive headless Chrome over CDP using the
 * `ws` client the relay already depends on, and read getBoundingClientRect()
 * from the real thing. Every test that needs this skips itself when Chrome is
 * not installed, so `npm test` stays green on a machine or CI box without one.
 */
import { createServer } from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/* ---- keeping Chrome from outliving the run ------------------------------
 *
 * closeHarnessResources() SIGKILLs the browser and waits for it, and every
 * normal path calls it. The leak is the paths that never get there: a killed
 * `npm run ci`, Ctrl-C, a crash. node dies, no cleanup runs, and headless
 * Chrome keeps going — reparented to launchd. They accumulate silently: a
 * machine was found carrying five of them aged 8 to 23 hours, quietly
 * competing with every later run for CPU and making timing-sensitive tests
 * flaky for reasons no diff could explain.
 *
 * Two halves. Signal handlers cover an interrupted run, and a sweep at startup
 * heals whatever earlier runs already left behind — the sweep is what makes
 * this self-correcting, because a SIGKILL'd parent never gets to run anything.
 */
const HARNESS_PROFILE_TAG = "mf-harness-";
const liveChildren = new Set();

/* An orphan is identifiable, not guessed at: when its node parent dies the
   browser is reparented to pid 1, while a browser belonging to a RUNNING
   harness still has that live parent. Under --test-concurrency=3 several
   harnesses run at once, so "kill every harness Chrome" would be wrong; "kill
   the ones whose owner is gone" is safe for all of them. */
export function sweepOrphanedHarnessChromes() {
  let out = "";
  try {
    out = execFileSync("ps", ["-eo", "pid=,ppid=,command="], { encoding: "utf8", maxBuffer: 8 << 20 });
  } catch { return 0; }
  let killed = 0;
  for (const line of out.split("\n")) {
    if (!line.includes("--user-data-dir=") || !line.includes(HARNESS_PROFILE_TAG)) continue;
    const m = line.match(/^\s*(\d+)\s+(\d+)\s/);
    if (!m) continue;
    const pid = Number(m[1]), ppid = Number(m[2]);
    if (ppid !== 1 || pid === process.pid) continue;
    try { process.kill(pid, "SIGKILL"); killed++; } catch {}
  }
  return killed;
}

let guardsInstalled = false;
function installExitGuards() {
  if (guardsInstalled) return;
  guardsInstalled = true;
  /* Synchronous by necessity: an "exit" handler cannot await, and a signal
     handler that awaits may not finish before the process goes. child.kill()
     is a synchronous syscall, which is all this needs. */
  const killAll = () => {
    for (const child of liveChildren) {
      try { child.kill("SIGKILL"); } catch {}
    }
    liveChildren.clear();
  };
  /* "exit" covers an uncaught exception too — the process is on its way out by
     then and this handler still runs — so there is deliberately no
     uncaughtException listener here. Installing one would preempt the node:test
     runner's own handling, which is how it attributes a crash to the test that
     caused it. */
  process.on("exit", killAll);
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.once(signal, () => {
      killAll();
      // Re-raise so the exit status still reads as "killed by <signal>" rather
      // than a clean 0 that would tell CI the run passed.
      process.kill(process.pid, signal);
    });
  }
}

/** Register a spawned browser so the guards above can reach it. */
function trackChild(child) {
  if (!child) return child;
  installExitGuards();
  liveChildren.add(child);
  child.once("exit", () => liveChildren.delete(child));
  return child;
}

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
  ".woff2": "font/woff2", ".wasm": "application/wasm", ".glb": "model/gltf-binary",
};

/* ---- static server ------------------------------------------------------ */

export async function serveApp() {
  const server = createServer(async (req, res) => {
    // strip the query and pin every path inside the repo
    let path = decodeURIComponent(req.url.split("?")[0]);
    if (path.endsWith("/")) path += "index.html";
    const abs = join(ROOT, normalize(path).replace(/^(\.\.[/\\])+/, ""));
    if (!abs.startsWith(ROOT)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    try {
      const body = await readFile(abs);
      res.writeHead(200, {
        "content-type": MIME[extname(abs).toLowerCase()] || "application/octet-stream",
        "cache-control": "no-store",
      });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return {
    origin: "http://127.0.0.1:" + server.address().port,
    // server.close() alone waits out every keep-alive socket Chrome is holding,
    // which is ~30s of a test run spent watching an idle browser exit
    close: () =>
      new Promise((resolve, reject) => {
        /* Start the graceful close first, then evict keep-alive connections.
           Calling closeAllConnections before close leaves a small race where
           Chrome can open one last connection between the two calls and the
           close callback never resolves. That stranded the node:test after
           hook after every assertion had already passed. */
        const timer = setTimeout(() => {
          server.closeAllConnections();
          reject(new Error("browser harness server did not close"));
        }, 5000);
        server.close((error) => {
          clearTimeout(timer);
          error ? reject(error) : resolve();
        });
        server.closeAllConnections();
      }),
  };
}

/* ---- chrome ------------------------------------------------------------- */

/* Windows entries use the real install paths rather than a PATH lookup: the
   Chrome installer does not put chrome.exe on PATH, so without these the audit
   reports "Headless Chrome not found" on a machine that has Chrome. LOCALAPPDATA
   covers a per-user install, which is what a non-admin install produces. */
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  process.env.PROGRAMFILES && `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
  process.env["PROGRAMFILES(X86)"] && `${process.env["PROGRAMFILES(X86)"]}\\Google\\Chrome\\Application\\chrome.exe`,
  process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  process.env.PROGRAMFILES && `${process.env.PROGRAMFILES}\\Microsoft\\Edge\\Application\\msedge.exe`,
  process.env["PROGRAMFILES(X86)"] && `${process.env["PROGRAMFILES(X86)"]}\\Microsoft\\Edge\\Application\\msedge.exe`,
].filter(Boolean);

export async function findChrome() {
  const { access } = await import("node:fs/promises");
  for (const p of CHROME_CANDIDATES) {
    try {
      await access(p);
      return p;
    } catch {}
  }
  return null;
}

/* ---- a minimal CDP client ----------------------------------------------- */

/* Whoever calls send() gets the promise and may await it, catch it, or — if
   the page closed underneath them — never look at it again. Attaching a
   throwaway handler stops that last case being reported as an unhandled
   rejection, while the caller's own copy still throws as normal. */
function handled(promise) {
  promise.catch(() => {});
  return promise;
}

export class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.consoleErrors = [];
    this.dead = null;
    /* A socket that has gone can never answer the requests already on it, and
       the timeout below is unref'd so it will not fail them either. Those
       promises simply dangled: node:test saw a file that had passed every
       assertion and still had a promise outstanding, and cancelled it. Running
       the browser files together is what made it show — several Chromes
       competing for the CPU means there is nearly always a request in flight
       when a page is closed. */
    ws.on("close", () => this.fail("closed"));
    ws.on("error", (error) => this.fail(error && error.message ? error.message : "errored"));
    ws.on("message", (raw) => {
      const msg = JSON.parse(raw);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject, timer } = this.pending.get(msg.id);
        clearTimeout(timer);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else if (msg.method === "Runtime.exceptionThrown") {
        this.consoleErrors.push(
          msg.params.exceptionDetails.exception?.description ||
            msg.params.exceptionDetails.text,
        );
      }
    });
  }
  /* Settle everything still outstanding. Called when the socket dies and, so
     the ordering is not left to an event, directly by close(). */
  fail(why) {
    if (!this.dead) this.dead = new Error("CDP connection " + why);
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(this.dead);
    }
    this.pending.clear();
  }
  send(method, params = {}) {
    if (this.dead) return handled(Promise.reject(this.dead));
    const id = ++this.id;
    const promise = new Promise((resolve, reject) => {
      // unref'd AND cleared on reply: an un-cleared 30s timer per request keeps
      // the event loop alive long after the test has finished
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(method + " timed out"));
      }, 30000);
      timer.unref?.();
      this.pending.set(id, { resolve, reject, timer });
    });
    handled(promise);
    try {
      this.ws.send(JSON.stringify({ id, method, params }));
    } catch (error) {
      this.fail(error && error.message ? error.message : "unsendable");
    }
    return promise;
  }
}

/* Waiting on "open" alone is another promise with no way to fail: a socket
   that errors or closes before it opens simply never fires it. Under a
   parallel browser run that is a real outcome, and a run that hangs there
   looks exactly like the dangling-request bug above. */
export function waitForOpen(ws, what = "devtools socket", ms = 20000) {
  return new Promise((resolve, reject) => {
    const done = (error) => {
      clearTimeout(timer);
      ws.off("open", onOpen); ws.off("error", onError); ws.off("close", onClose);
      error ? reject(error) : resolve(ws);
    };
    const timer = setTimeout(() => done(new Error(what + " did not open")), ms);
    const onOpen = () => done(null);
    const onError = (error) => done(new Error(what + " failed: " + (error && error.message ? error.message : error)));
    const onClose = () => done(new Error(what + " closed before it opened"));
    ws.once("open", onOpen); ws.once("error", onError); ws.once("close", onClose);
  });
}

/* Startup can fail after any one of these resources has been created. Keep
   teardown independent of the page object so the catch path can release a
   half-open socket, Chrome process, server, and profile too. */
export async function closeHarnessResources({ app, profile, child, browser, pageWs, cdp } = {}) {
  try { cdp?.fail?.("closed"); } catch {}
  try { browser?.fail?.("closed"); } catch {}
  try { if (pageWs) pageWs.terminate(); } catch {}
  try { if (browser?.ws) browser.ws.terminate(); } catch {}

  /* Chrome's stderr is a pipe, and after startup has read the DevTools URL off
     it nobody reads it again. Headless Chrome keeps writing, so the stream
     stays an active libuv handle: killing the process removes the process
     handle but leaves the pipe, and a test file that had passed every assertion
     sat there with an open fd and never exited. Under a parallel run — slower
     browsers, more chatter — that was the hang. */
  for (const stream of [child?.stderr, child?.stdout, child?.stdin]) {
    try { stream?.removeAllListeners(); stream?.destroy(); } catch {}
  }

  if (child) liveChildren.delete(child);
  if (child?.pid) {
    const exited = child.exitCode != null || child.signalCode != null
      ? Promise.resolve()
      : new Promise((resolve) => child.once("exit", resolve));
    try { child.kill("SIGKILL"); } catch {}
    /* The giving-up timer is cleared once the race is over. A SIGKILL'd Chrome
       normally exits in milliseconds, and an armed 3s timer left behind by each
       page.close() holds the event loop open long after the file has passed —
       the same shape of bug as the un-cleared request timeouts above. */
    let giveUp;
    const deadline = new Promise((resolve) => { giveUp = setTimeout(resolve, 3000); });
    giveUp.unref?.();
    try { await Promise.race([exited, deadline]); } finally { clearTimeout(giveUp); }
  }

  let closeError = null;
  try { if (app) await app.close(); } catch (error) { closeError = error; }
  if (profile) await rm(profile, { recursive: true, force: true }).catch(() => {});
  if (closeError) throw closeError;
}

/* ---- the page object the tests actually use ----------------------------- */

export async function openPage({ width = 375, height = 812, lang = "en", mobile = undefined, touch = undefined } = {}) {
  const bin = await findChrome();
  if (!bin) return null;
  const isMobile = mobile !== undefined ? !!mobile : (width <= 768 || (width <= 1024 && height <= 500));
  const isTouch = touch !== undefined ? !!touch : isMobile;

  /* Heal what earlier runs left behind before adding to it. Cheap (one ps) and
     it only ever touches browsers whose owning process is gone. */
  sweepOrphanedHarnessChromes();

  const app = await serveApp();
  let profile;
  try {
    profile = await mkdtemp(join(tmpdir(), "mf-harness-"));
  } catch (error) {
    await app.close().catch(() => {});
    throw error;
  }
  let child;
  try {
    child = trackChild(spawn(
      bin,
      [
      ...(process.env.MF_BROWSER_GPU==="1"?[]:["--headless=new"]),
      "--remote-debugging-port=0",
      "--user-data-dir=" + profile,
      "--no-first-run",
      "--no-default-browser-check",
      /* No GPU and no SwiftShader: the editor's three.js preview throws on a
         null WebGL context here, which callers filter out (see NO_GL in
         tests/model_editor_layout.browser.mjs). Software GL would render it for
         real but costs minutes per run — this harness tests chrome LAYOUT, and
         layout does not depend on whether the viewport painted a model. */
      ...(process.env.MF_BROWSER_GPU==="1"?[]:["--disable-gpu"]),
      "--hide-scrollbars",
      "--window-size=" + width + "," + height,
      "about:blank",
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    ));
  } catch (error) {
    await closeHarnessResources({ app, profile });
    throw error;
  }

  let browser = null, pageWs = null, cdp = null;
  let cleanupPromise = null;
  const cleanup = () => cleanupPromise ||= closeHarnessResources({
    app, profile, child, browser, pageWs, cdp,
  });

  try {

  // Chrome prints the DevTools ws endpoint on stderr once it is listening
  const wsUrl = await new Promise((resolve, reject) => {
    let buf = "";
    const finish = (error, value) => {
      clearTimeout(timer);
      child.stderr.off("data", onData);
      child.off("exit", onExit);
      child.off("error", onError);
      error ? reject(error) : resolve(value);
    };
    const timer = setTimeout(() => finish(new Error("chrome did not start")), 20000);
    const onData = (d) => {
      buf += d;
      const m = buf.match(/ws:\/\/[^\s]+/);
      if (m) finish(null, m[0]);
    };
    const onExit = (code) => finish(new Error("chrome exited early: " + code));
    const onError = (error) => finish(new Error("chrome failed to start: " + error.message));
    child.stderr.on("data", onData);
    child.once("exit", onExit);
    child.once("error", onError);
  });

  /* Keep the pipe flowing and discarded from here on. A paused stream whose
     buffer fills would also stall Chrome's own writes, and a flowing one has
     nothing left to hold when it is destroyed at close. */
  child.stderr.resume();

  browser = new CDP(new WebSocket(wsUrl));
  await waitForOpen(browser.ws, "browser devtools socket");
  const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
  pageWs = new WebSocket(wsUrl.replace(/\/devtools\/browser\/.*$/, "/devtools/page/" + targetId));
  cdp = new CDP(pageWs);
  await waitForOpen(pageWs, "page devtools socket");

  await cdp.send("Page.enable");
  /* A native dialog blocks the renderer, and nothing in a headless run is there
     to click it: every later CDP command — Emulation, Runtime.evaluate — then
     sits until its 30s timeout, so one dirty document turned into a whole file
     of timeouts that looked like infrastructure failure rather than the one
     real assertion that started it. persist.js guards reloads with a
     beforeunload handler whenever there are unsaved edits, which a test that
     builds anything trips by construction. Accept every dialog as it opens. */
  cdp.ws.on("message", (raw) => {
    var msg;
    try { msg = JSON.parse(raw); } catch (error) { return; }
    if (msg.method === "Page.javascriptDialogOpening") {
      cdp.send("Page.handleJavaScriptDialog", { accept: true }).catch(() => {});
    }
  });
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width, height, deviceScaleFactor: 1, mobile: isMobile,
  });
  await cdp.send("Emulation.setTouchEmulationEnabled", isTouch ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });

  const page = {
    consoleErrors: cdp.consoleErrors,
    send: (method, params) => cdp.send(method, params),

    async eval(fn, ...args) {
      const expr = "(" + fn.toString() + ")(" + args.map((a) => JSON.stringify(a)).join(",") + ")";
      let res;
      try {
        res = await cdp.send("Runtime.evaluate", {
          expression: expr,
          awaitPromise: true,
          returnByValue: true,
        });
      } catch (err) {
        if (err && err.message && err.message.includes("Promise was collected")) {
          res = await cdp.send("Runtime.evaluate", {
            expression: expr,
            awaitPromise: true,
            returnByValue: true,
          });
        } else {
          throw err;
        }
      }
      const { result, exceptionDetails } = res;
      if (exceptionDetails)
        throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
      return result?.value;
    },

    /* `boot: false` for a page that is not the app. waitForBoot() polls for
       main.js's __home3dBooted, so a standalone fixture — uikit's, or any
       future module's demo page — would sit there for the full timeout and
       then throw, reporting a harness timeout instead of the module's own
       result. Such a page is "booted" once its module graph has run, which is
       one painted frame after load. */
    async goto(path = "/", { boot = true } = {}) {
      await cdp.send("Page.navigate", { url: app.origin + path });
      await new Promise((r) => {
        const timer = setTimeout(() => {
          cdp.ws.off("message", listener);
          r();
        }, 15000);
        const done = (m) => {
          if (m.method === "Page.loadEventFired") {
            clearTimeout(timer);
            cdp.ws.off("message", listener);
            r();
          }
        };
        const listener = (raw) => done(JSON.parse(raw));
        cdp.ws.on("message", listener);
      });
      /* The load event only says the document arrived; the ES-module graph
         boots after it, and a fixed sleep here is a race that a cold cache or
         a loaded machine loses — the test then pokes a half-built UI and fails
         as though the app were broken. main.js sets __home3dBooted as its last
         step, so wait for that, then one painted frame. */
      if (boot) await page.waitForBoot();
      else await page.eval(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))));
    },

    /* Poll a page-side predicate until it is true. For anything the app now
       does asynchronously, where a fixed sleep is a guess that a loaded machine
       loses. The model editor is the case that forced this: opening it fetches
       js/modeler.js on demand (it is no longer on the boot graph), so "click,
       wait 400ms, assume it is up" held on an idle box and lost under
       --test-concurrency=3. Throws on timeout — a predicate that never comes
       true is a real failure, not something to test through. */
    async waitUntil(fn, { ms = 15000, what = "condition" } = {}) {
      const deadline = Date.now() + ms;
      for (;;) {
        if (await page.eval(fn)) return true;
        if (Date.now() > deadline) throw new Error("timed out waiting for " + what);
        await new Promise((r) => setTimeout(r, 25));
      }
    },

    /* Resolves once main.js has finished initialising and the UI has painted
       once. Throws rather than continuing silently if boot never completes —
       a timeout here is a real failure, not something to test through. */
    // Concurrent full-suite browsers occasionally need more than 20 seconds
    // for the complete module graph. Keep boot bounded, independently of the
    // much shorter deadlines for individual user actions.
    async waitForBoot(ms = 60000) {
      const deadline = Date.now() + ms;
      for (;;) {
        if (await page.eval(() => !!window.__home3dBooted)) break;
        if (Date.now() > deadline) throw new Error("app did not boot within " + ms + "ms");
        await new Promise((r) => setTimeout(r, 50));
      }
      await page.eval(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))));
    },

    async screenshot(filepath) {
      const res = await cdp.send("Page.captureScreenshot", { format: "png" });
      if (filepath && res?.data) {
        const { writeFile, mkdir } = await import("node:fs/promises");
        const { dirname } = await import("node:path");
        await mkdir(dirname(filepath), { recursive: true });
        await writeFile(filepath, Buffer.from(res.data, "base64"));
      }
      return res?.data;
    },

    async setLang(l) {
      await page.eval((v) => localStorage.setItem("home3d_lang", v), l);
    },

    async resize(w, h, { mobile = undefined, touch = undefined } = {}) {
      const isMob = mobile !== undefined ? !!mobile : (w <= 768 || (w <= 1024 && h <= 500));
      const isTch = touch !== undefined ? !!touch : isMob;
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width: w, height: h, deviceScaleFactor: 1, mobile: isMob,
      });
      await cdp.send("Emulation.setTouchEmulationEnabled", isTch ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
      await page.eval(() => new Promise((r) => setTimeout(r, 250)));
    },

    async close() {
      await cleanup();
    },
  };

  await page.goto("/");
  if (lang !== "en") {
    await page.setLang(lang);
    await page.goto("/");
  }
  return page;
  } catch (error) {
    try { await cleanup(); } catch {}
    throw error;
  }
}

/* Why the browser suite is run with --test-concurrency=3 (package.json):
 *
 * node:test defaults to one file per CPU, which on a ten-core machine starts
 * seven Chromes at once. Measured over the whole suite:
 *
 *   serial (1)   266s
 *   capped  (3)  102s
 *   default (7)   68-88s
 *
 * This is now a resource choice, not a workaround. The runs that used to hang
 * at the default were the undrained stderr pipe fixed above, found by letting
 * a hung run write a diagnostic report: of seven test files one was still
 * alive, holding no process, socket or timer — just an open pipe. With that
 * fixed the default ran clean six times over, so the cap can be dropped if the
 * wall clock ever matters more than bounding peak memory to three browsers.
 */
