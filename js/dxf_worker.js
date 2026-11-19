/* Keep the drawing in the worker until the import dialog closes. */
import { createDxfSession } from "./dxf_import.js";

const session = createDxfSession();
self.onmessage = async (event) => {
  const { id, method, file, options } = event.data;
  try {
    let result;
    if (method === "open") result = session.open(await file.arrayBuffer(), { name: file.name || "drawing.dxf" });
    else if (method === "plan") result = session.plan(options);
    else throw new Error("Unknown DXF request");
    const transfer = method === "open" ? result.preview.map((r) => r.segs.buffer) : [];
    self.postMessage({ id, result }, transfer);
  } catch (err) {
    self.postMessage({ id, error: { code: err.code, message: err.message } });
  }
};
