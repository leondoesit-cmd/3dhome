import { designTableColumns, designTableCell, prepareDesignTable } from "../core/design_table.js";
import { documentLengthUnit } from "../core/document_length_units.js";

export function openDesignTable(doc, {beforeCommit, afterCommit, isCurrent}) {
  const columns = designTableColumns(doc);
  const unit = documentLengthUnit(doc.context?.units?.length);
  const dialog = document.createElement("dialog");
  dialog.id = "mdDesignTable";
  dialog.className = "pro-dialog";
  dialog.setAttribute("aria-labelledby", "mdDesignTableTitle");
  dialog.innerHTML = '<h2 id="mdDesignTableTitle">Configuration design table</h2><p></p><form><div class="md-table-scroll"><table><thead><tr><th scope="col">Configuration</th></tr></thead><tbody></tbody></table></div><p role="status"></p><button type="submit">Apply</button><button type="button">Cancel</button></form>';
  dialog.querySelector("p").textContent = columns.length
    ? "Edit saved configuration values. Bare lengths use " + unit + ". Allow keeps a feature enabled when its parents are enabled."
    : "This part has no supported native feature or sketch dimensions.";
  const head = dialog.querySelector("tr"), body = dialog.querySelector("tbody");
  const fields = [];
  for (const column of columns) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = column.label + (column.kind === "suppress" ? "" : " (" + (column.field === "angle" ? "°" : unit) + ")");
    head.append(th);
  }
  for (const cfg of doc.configurations) {
    const row = body.insertRow(), th = document.createElement("th");
    th.scope = "row";
    th.textContent = cfg.name + (cfg.id === doc.activeConfiguration ? " (active)" : "");
    row.append(th);
    for (const column of columns) {
      const cell = row.insertCell();
      const {value, reason} = designTableCell(cfg.modelValues, cfg.suppressedFeatureIds, column, unit);
      if (reason) { cell.textContent = reason; continue; }
      const field = document.createElement(column.kind === "suppress" ? "select" : "input");
      if (column.kind === "suppress") {
        for (const label of ["Allow", "Suppress"]) {
          const option = document.createElement("option");
          option.textContent = label;
          field.append(option);
        }
      }
      field.setAttribute("aria-label", cfg.name + " · " + column.label);
      field.value = value;
      cell.append(field);
      fields.push({field, value, rowId:cfg.id, key:column.key});
    }
  }
  dialog.querySelector("form").onsubmit = event => {
    event.preventDefault();
    if (!isCurrent()) { dialog.close(); return; }
    const edits = fields.filter(item => item.field.value !== item.value)
      .map(({field, rowId, key}) => ({rowId, key, text:field.value}));
    if (edits.length) {
      let transaction;
      try { transaction = prepareDesignTable(doc, edits); }
      catch (error) { dialog.querySelector('[role="status"]').textContent = error.message; return; }
      beforeCommit();
      transaction.commit();
      afterCommit(transaction.activeChanged);
    }
    dialog.close();
  };
  dialog.querySelector('[type="button"]').onclick = () => dialog.close();
  dialog.addEventListener("close", () => dialog.remove(), {once:true});
  document.body.append(dialog);
  dialog.showModal();
}
