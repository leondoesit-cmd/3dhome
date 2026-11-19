// A panel can be reused for another command, even another instance of the
// same command on the same document. Keep its lifetime separate from Undo.
export function registerQuickForm(editor, panel, action, onDismiss) {
  const type = editor.docType;
  const document = () => editor.docType === "assembly" ? editor.assembly : editor.def;
  const owner = document();
  const initial = new Map();
  let readDraft, initialDraft;
  const value = field => ["checkbox", "radio"].includes(field.type) ? field.checked : field.value;
  let dismissing = false;
  const instance = {
    ownsDocument: () => editor.docType === type && document() === owner,
    isCurrent: () => editor.quickFormInstance === instance && instance.ownsDocument() && !panel.hidden,
    rememberInputs(draft, baselineDraft) {
      initial.clear();
      for (const field of panel.querySelectorAll?.("input,textarea,select") || []) initial.set(field, value(field));
      readDraft = draft;
      initialDraft = readDraft && JSON.stringify(baselineDraft === undefined ? readDraft() : baselineDraft);
    },
    editSnapshot() {
      // Dirty can stay true across several edits. Capture values, including
      // picker-only draft state, so a discard approval covers just this input.
      return JSON.stringify([
        Array.from(panel.querySelectorAll?.("input,textarea,select") || [], value),
        readDraft ? readDraft() : null,
      ]);
    },
    hasPendingEdits() {
      if (!instance.isCurrent()) return false;
      for (const [field, original] of initial) {
        if (panel.contains(field) && value(field) !== original) return true;
      }
      return !!readDraft && JSON.stringify(readDraft()) !== initialDraft;
    },
    dismiss(leavingDocument = false) {
      if (editor.quickFormInstance !== instance || dismissing) return;
      dismissing = true;
      try { onDismiss?.(leavingDocument); }
      finally {
        if (editor.quickFormInstance === instance) {
          editor.quickFormInstance = null;
          editor.quickAction = null;
          panel.innerHTML = "";
          panel.hidden = true;
        }
      }
    },
  };
  editor.quickFormInstance = instance;
  editor.quickAction = action;
  panel.hidden = false;
  panel.innerHTML = "";
  return instance;
}
