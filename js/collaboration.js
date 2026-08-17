import { S } from "./state.js";

let network = null, listening = false;
function commentId() { return "comment-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
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
      if (!data || data.projectId !== S.workspace.id) return;
      if (data.k === "project_comment" && data.comment && !S.workspace.comments.some((c) => c.id === data.comment.id)) {
        S.workspace.comments.push(data.comment); onUpdate?.();
      } else if (data.k === "project_present" && data.scene && S.workspace.role === "viewer") {
        import("./ui.js").then((ui) => {
          try {
            ui.applyData(data.scene);
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
