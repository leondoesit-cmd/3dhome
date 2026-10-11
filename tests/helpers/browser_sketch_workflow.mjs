// Explicit New sketch chooses a real datum plane before entering sketch mode.
export async function startDatumSketch(page, referenceId = "plane:top") {
  await page.eval(() => document.querySelector('#modeler [data-command="newsketch"]').click());
  await page.waitUntil(() => window.cadSketchSnapshot?.().phase === "reference",
    { what: "the datum reference picker to open" });
  await page.eval(id => {
    const picker = document.getElementById("mdReferencePicker");
    const option = [...picker.querySelectorAll("button.md-reference-option")]
      .find(button => button.querySelector("small")?.textContent.trim().endsWith(id));
    if (!option || picker.hidden) throw new Error("Missing visible datum option: " + id);
    option.click();
  }, referenceId);
  await page.waitUntil(() => window.cadSketchSnapshot?.().phase === "sketch",
    { what: "the selected datum sketch to open" });
}
