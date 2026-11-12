import { S } from "./state.js";

let network = null, listening = false;
function commentId() { return "comment-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
/* A peer's comment is data from the network: keep only the fields the review
   panel reads, in the types it reads them as. One without a target used to
   stop the whole panel rendering, and it was saved with the project. */
export function cleanRemoteComment(c) {
  if (!c || typeof c !== "object" || typeof c.id !== "string" || !c.id || c.id.length > 80) return null;
  const text = typeof c.text === "string" ? c.text.trim().slice(0, 500) : "";
  if (!text) return null;
  const t = c.target && typeof c.target === "object" ? c.target : {};
  return {
    id: c.id,
    text,
    author: typeof c.author === "string" ? c.author.slice(0, 48) : "",
    at: Number.isFinite(c.at) ? c.at : Date.now(),
    target: { kind: typeof t.kind === "string" ? t.kind.slice(0, 24) : "project", id: typeof t.id === "string" || Number.isFinite(t.id) ? t.id : null },
    resolved: c.resolved === true,
  };
}
function targetForSelection() {
  if (!S.sel) return { kind: "project", id: S.workspace.id };
  if (S.sel.ref && S.sel.ref.id != null) return { kind: S.sel.kind, id: S.sel.ref.id };
  return { kind: S.sel.kind, id: String(S.sel.ref || "selection") };
}

export async function initCollaboration(onUpdate) {
  if (!network) network = await import("./net.js");
  if (!listening) {
    listening = true;
    network.on("data", ({ from, data }) => {
      if (!data || !network.sameProject(S.workspace.id, data.projectId) ||
          !network.acceptRemote(data.k, from, network.remoteContext())) return;
      const comment = data.k === "project_comment" ? cleanRemoteComment(data.comment) : null;
      if (comment && !S.workspace.comments.some((c) => c.id === comment.id)) {
        S.workspace.comments.push(comment); onUpdate?.();
      } else if (data.k === "project_present" && data.scene && S.workspace.role === "viewer") {
        import("./ui.js").then((ui) => {
          if (!network.sameProject(S.workspace.id, data.projectId) ||
              !network.acceptRemote(data.k, from, network.remoteContext())) return;
          try {
            Promise.resolve(ui.applyData(data.scene)).catch(function (err) {
              // A malformed present payload is expected and ignorable, but a
              // failed builder fetch leaves the viewer on a blank plan with no
              // clue why. Still do not blank the plan; just say what happened.
              if (window.console && console.error)
                console.error("presented scene failed to apply", err);
            });
          } catch (_) {
            // A peer can send a malformed present payload; ignore rather than
            // blank the viewer's plan mid-review.
          }
        });
      }
    });
  }
  network.connect();
  return network;
}

export async function addComment(text, onUpdate) {
  const value = String(text || "").trim().slice(0, 500);
  if (!value) return null;
  const net = await initCollaboration(onUpdate);
  const comment = { id: commentId(), text: value, author: net.NET.name || net.NET.code, at: Date.now(), target: targetForSelection(), resolved: false };
  S.workspace.comments.push(comment);
  net.sendData({ k: "project_comment", projectId: S.workspace.id, comment });
  return comment;
}

export function toggleResolved(id) {
  const comment = S.workspace.comments.find((c) => c.id === id);
  if (comment) comment.resolved = !comment.resolved;
}

export async function presentScene() {
  const net = await initCollaboration();
  const { sceneObject } = await import("./ui.js");
  return net.sendData({ k: "project_present", projectId: S.workspace.id, scene: sceneObject(false) });
}

export function setRole(role) {
  S.workspace.role = ["owner", "editor", "viewer"].includes(role) ? role : "viewer";
  document.body.dataset.projectRole = S.workspace.role;
}
