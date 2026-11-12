import test from "node:test";
import assert from "node:assert/strict";
import { acceptRemote, sameProject, NET, answerKnock, remoteContext, on, connect, disconnect } from "../js/net.js";
import { handleSurveyPhoto, requestSurveyPhotos } from "../js/survey_photo_sync.js";
import { surveyStore } from "../js/survey_store.js";

const members = { owner: {}, viewer: {}, editor: {} };
const home = { code: "owner", owner: "owner", joined: true, members, admissions: { viewer: "view", editor: "edit" } };
const guest = { ...home, code: "viewer", admissions: {} };
const ownerPayloads = ["plan_sync", "plan_op", "scene", "project_present"];

test("guests accept authoritative payloads only from the admitted room owner", () => {
  for (const kind of [...ownerPayloads, "survey_photo_chunk", "survey_photo_request"]) {
    for (const from of ["owner", "viewer", "editor", "stranger", "", null])
      assert.equal(acceptRemote(kind, from, guest), from === "owner", `${kind} from ${from}`);
    assert.equal(acceptRemote(kind, "owner", { ...guest, joined: false }), false);
    assert.equal(acceptRemote(kind, "owner", { ...guest, members: {} }), false);
  }
  for (const kind of ownerPayloads)
    for (const from of Object.keys(members)) assert.equal(acceptRemote(kind, from, home), false);
});

test("host requests require admission; edits and uploaded photos require edit rights", () => {
  for (const kind of ["plan_hello", "scene_req", "survey_photo_request", "plan_op_req", "survey_photo_chunk"]) {
    for (const from of ["owner", "viewer", "editor", "stranger"]) {
      const expected = from === "editor" || (from === "viewer" && !["plan_op_req", "survey_photo_chunk"].includes(kind));
      assert.equal(acceptRemote(kind, from, home), expected, `${kind} from ${from}`);
    }
    assert.equal(acceptRemote(kind, "editor", { ...home, admissions: {} }), false);
    assert.equal(acceptRemote(kind, "editor", { ...home, members: {} }), false);
    assert.equal(acceptRemote(kind, "editor", { ...home, joined: false }), false);
  }
  // A saved role chosen by the sender cannot grant authority.
  assert.equal(acceptRemote("plan_op_req", "viewer", { ...home, role: "owner" }), false);
  assert.equal(acceptRemote("plan_op_req", "editor", guest), false);
});

test("comments, cursors and voice signaling require admitted room membership", () => {
  for (const kind of ["project_comment", "plan_cursor", "rtc"]) {
    assert.equal(acceptRemote(kind, "viewer", home), true);
    assert.equal(acceptRemote(kind, "viewer", { ...home, admissions: {} }), false);
    assert.equal(acceptRemote(kind, "editor", guest), true);
    assert.equal(acceptRemote(kind, "stranger", guest), false);
    assert.equal(acceptRemote(kind, "editor", { ...guest, joined: false }), false);
  }
  for (const ctx of [undefined, {}, home, guest]) {
    assert.equal(acceptRemote("unknown", "editor", ctx), false);
    assert.equal(acceptRemote("project_comment", "toString", ctx), false);
  }
});

test("project matching fails closed for missing, empty, malformed and different IDs", () => {
  for (const mine of [undefined, null, "", 1, "a", "b"])
    for (const theirs of [undefined, null, "", 1, "a", "b"])
      assert.equal(sameProject(mine, theirs), typeof mine === "string" && !!mine && mine === theirs,
        `${mine} / ${theirs}`);
});

test("live photo handling rejects a peer even when it was selected as the transfer source", async () => {
  const id = "policy-photo", survey = { photos: [{ attachmentId: id }] };
  const chunk = { k: "survey_photo_chunk", projectId: "p", id, index: 0, count: 1, part: "data:image/png;base64,YQ==" };
  await requestSurveyPhotos(survey, "editor", "p", () => {});
  await handleSurveyPhoto(chunk, "editor", survey, "p", () => {}, guest);
  assert.equal(await surveyStore("get", id), undefined);
  await handleSurveyPhoto(chunk, "editor", survey, "p", () => {}, home);
  assert.equal((await surveyStore("get", id)).data, chunk.part);
  let sent = 0;
  const request = { k: "survey_photo_request", projectId: "p", id };
  await handleSurveyPhoto(request, "stranger", survey, "p", () => sent++, home);
  assert.equal(sent, 0);
  await handleSurveyPhoto(request, "viewer", survey, "p", () => sent++, home);
  assert.equal(sent, 1);
  await surveyStore("delete", id);
});

test("client remembers approval rights per connection and clears them on disconnect", async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "WebSocket");
  const oldLocation = Object.getOwnPropertyDescriptor(globalThis, "location");
  let ws;
  class Socket {
    constructor() { ws = this; this.readyState = 0; this.sent = []; }
    send(text) { this.sent.push(JSON.parse(text)); }
    close() { this.readyState = 3; this.onclose(); }
    receive(m) { this.onmessage({ data: JSON.stringify(m) }); }
  }
  Object.defineProperty(globalThis, "WebSocket", { configurable: true, value: Socket });
  Object.defineProperty(globalThis, "location", { configurable: true, value: { protocol: "file:" } });
  t.after(() => {
    disconnect();
    for (const [key, descriptor] of [["WebSocket", previous], ["location", oldLocation]]) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  connect(); ws.readyState = 1; ws.onopen();
  ws.receive({ t: "knock", code: "viewer", name: "Viewer" });
  assert.equal(answerKnock("viewer", "view"), true);
  assert.equal(NET.admissions.viewer, "view");
  ws.receive({ t: "knock", code: "editor", name: "Editor" });
  assert.equal(answerKnock("editor", "edit"), true);
  ws.receive({ t: "knock", code: "stranger", name: "Stranger" });
  assert.equal(answerKnock("stranger", "deny"), true);
  assert.equal(answerKnock("unrequested", "edit"), false);
  assert.deepEqual(ws.sent.slice(-3), [{ t: "admit", code: "viewer" }, { t: "admit", code: "editor" }, { t: "deny", code: "stranger" }]);
  ws.receive({ t: "admitted", room: "apt:" + NET.code });
  ws.receive({ t: "roster", users: [{ code: "viewer", room: "apt:" + NET.code }, { code: "editor", room: "apt:" + NET.code }] });
  assert.equal(acceptRemote("plan_op_req", "viewer", remoteContext()), false);
  assert.equal(acceptRemote("plan_op_req", "editor", remoteContext()), true);
  const off = on("data", () => assert.fail("voice signaling must not become generic data"));
  ws.receive({ t: "msg", from: "stranger", data: { k: "rtc", sdp: {} } });
  off();
  disconnect();
  assert.equal(NET.joined, false);
  assert.deepEqual(Object.keys(NET.admissions), []);
  assert.deepEqual(Object.keys(NET.knocks), []);
});
