import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { sourceFunctionText } from "./helpers/source_function.mjs";
import { acceptRemote, sameProject } from "../js/net.js";

// Browser entry points import the renderer; run their parsed declarations with controlled services.
async function load(file, name, services) {
  const source = await readFile(new URL("../js/" + file, import.meta.url), "utf8");
  return runInNewContext("(" + sourceFunctionText(source, name) + ")", services);
}
const host = { code: "owner", owner: "owner", joined: true, members: { viewer: {}, editor: {} }, admissions: { viewer: "view", editor: "edit" } };
const guest = { code: "viewer", owner: "owner", joined: true, members: { owner: {}, editor: {} }, admissions: {} };
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("plan handler gates snapshots, requests and edits before reading or mutating the plan", async () => {
  let ctx = host, reads = 0, writes = 0, snapshots = 0;
  const sent = [];
  const handle = await load("plan_sync.js", "onData", {
    acceptRemote, sameProject: (d) => sameProject("project", d.projectId), remoteContext: () => ctx,
    isHome: () => ctx.code === ctx.owner, sceneGetter: async () => { reads++; return {}; },
    applyIncoming: () => { writes++; return true; }, applyScene: async () => { snapshots++; return true; },
    sendData: (data, to) => sent.push({ data, to }), projectId: () => "project", planRev: 0,
    requestSurveyPhotos: async () => {}, S: {}, paint() {}, requestResync() {},
  });
  const packet = (from, k, extra = {}) => handle({ from, data: { k, projectId: "project", ...extra } });
  packet("stranger", "plan_hello");
  packet("viewer", "plan_op_req", { op: {} });
  handle({ from: "editor", data: { k: "plan_op_req", op: {} } });
  assert.equal(reads, 0); assert.equal(writes, 0); assert.equal(sent.length, 0);
  packet("viewer", "plan_hello"); await tick();
  assert.equal(reads, 1); assert.equal(sent[0].to, "viewer");
  packet("editor", "plan_op_req", { op: {} });
  assert.equal(writes, 1); assert.equal(sent.at(-1).data.k, "plan_op");
  // Authority is checked again after a deferred scene read.
  packet("editor", "plan_hello"); ctx = { ...host, joined: false }; await tick();
  assert.equal(sent.length, 2);
  ctx = guest;
  packet("editor", "plan_sync", { scene: {} });
  packet("editor", "plan_op", { op: {}, rev: 2 });
  assert.equal(snapshots, 0); assert.equal(writes, 1);
  packet("owner", "plan_sync", { scene: {} }); await tick();
  assert.equal(snapshots, 1);
  packet("owner", "plan_op", { op: {}, rev: 1 });
  assert.equal(writes, 2);
});

test("visit handler answers admitted visitors and adopts only the owner's scene after admission", async () => {
  let ctx = host, applied = 0;
  const callbacks = {}, sent = [], visit = { friend: null };
  const init = await load("visit.js", "initVisit", {
    net: { on: (event, fn) => { callbacks[event] = fn; }, acceptRemote, remoteContext: () => ctx,
      sendData: (data, to) => sent.push({ data, to }), NET: {} },
    VISIT: visit, visitGeneration: 0, isVisiting: () => !!visit.friend, serialize: () => "home",
    applyData: () => { applied++; return true; }, t: () => "", flash() {}, console,
  });
  init();
  callbacks.data({ from: "stranger", data: { k: "scene_req" } });
  assert.equal(sent.length, 0);
  callbacks.data({ from: "viewer", data: { k: "scene_req" } });
  assert.equal(sent.length, 1); assert.equal(sent[0].data.json, "home");
  visit.friend = { code: "owner" }; ctx = guest;
  callbacks.data({ from: "editor", data: { k: "scene", json: "{}" } });
  assert.equal(applied, 0);
  ctx = { ...guest, joined: false };
  callbacks.data({ from: "owner", data: { k: "scene", json: "{}" } });
  assert.equal(applied, 0);
  ctx = guest;
  callbacks.data({ from: "owner", data: { k: "scene", json: "{}" } });
  await tick(); assert.equal(applied, 1);
});

test("collaboration handler ignores unadmitted comments and missing project IDs", async () => {
  const callbacks = {}, state = { workspace: { id: "project", comments: [], role: "viewer" } };
  const init = await load("collaboration.js", "initCollaboration", {
    network: { on: (event, fn) => { callbacks[event] = fn; }, connect() {}, sameProject, acceptRemote, remoteContext: () => host },
    listening: false, S: state,
  });
  await init();
  const comment = { id: "one", text: "comment" };
  callbacks.data({ from: "stranger", data: { k: "project_comment", projectId: "project", comment } });
  callbacks.data({ from: "viewer", data: { k: "project_comment", comment } });
  callbacks.data({ from: "viewer", data: { k: "project_present", projectId: "project", scene: {} } });
  assert.equal(state.workspace.comments.length, 0);
  callbacks.data({ from: "viewer", data: { k: "project_comment", projectId: "project", comment } });
  callbacks.data({ from: "viewer", data: { k: "project_comment", projectId: "project", comment } });
  assert.deepEqual(state.workspace.comments, [comment]);
});

test("approval cards expose all three actions and isolate friend codes in Hebrew", async () => {
  class Element {
    constructor() { this.children = []; }
    set innerHTML(_) { assert.fail("untrusted names must be plain text"); }
    appendChild(node) { this.children.push(node); }
    replaceChildren() { this.children = []; }
    addEventListener(event, fn) { this[event] = fn; }
  }
  for (const lang of ["en", "he"]) {
    const box = new Element(), decisions = [], code = "ABCD-EFGH", name = "<img onerror=alert(1)>";
    const render = await load("ui_friends.js", "renderKnocks", {
      $: () => box, document: { createElement: () => new Element() }, getLang: () => lang,
      net: { NET: { knocks: { [code]: { code, name } } }, answerKnock: (...args) => decisions.push(args) },
    });
    render(); render();
    assert.equal(box.children.length, 1);
    const [label, actions] = box.children[0].children;
    assert.ok(label.textContent.includes(name));
    if (lang === "he") assert.ok(label.textContent.includes("\u2068" + code + "\u2069"));
    assert.deepEqual(actions.children.map((b) => b.textContent), lang === "en"
      ? ["Allow view", "Allow edit", "Deny"] : ["אפשר צפייה", "אפשר עריכה", "דחה"]);
    actions.children.forEach((button) => button.click());
    assert.deepEqual(decisions, [[code, "view"], [code, "edit"], [code, "deny"]]);
  }
});
