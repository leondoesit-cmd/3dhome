// Material substitution does not establish a fastener strength class. Retain
// the catalog choice as provenance, never as a claim about the assigned body.
export function toolboxAssignedMetadata(metadata, part) {
  if (!metadata || !part?.materialCatalogId || !part.materialName) return metadata;
  const catalogMaterialId = metadata.catalogMaterialId || metadata.materialId;
  if (part.materialCatalogId === "toolbox:" + catalogMaterialId) return metadata;
  const catalogDesignation = metadata.catalogDesignation || metadata.designation || "";
  const catalogPropertyClass = metadata.catalogPropertyClass || metadata.propertyClass || "";
  const suffix = " - " + catalogPropertyClass;
  const designation = catalogPropertyClass && catalogDesignation.endsWith(suffix) ? catalogDesignation.slice(0, -suffix.length) : catalogDesignation;
  return { ...metadata, catalogMaterialId, catalogMaterial: metadata.catalogMaterial || metadata.material,
    catalogDesignation, catalogPropertyClass, material: part.materialName,
    materialId: part.materialCatalogId, materialQualificationId: part.materialQualificationId || null,
    propertyClass: null, designation, materialSubstituted: true };
}

export function assignedToolboxBody(parts, metadata) {
  return (parts || []).find(part => part.materialQualificationId) ||
    (parts || []).find(part => part.materialCatalogId && part.materialCatalogId !== "toolbox:" + (part.materialId || metadata?.catalogMaterialId || metadata?.materialId)) || null;
}

export function synchronizeToolboxMaterial(document, featureId, assignedPart) {
  const parts = (document.parts || []).filter(part => part.toolboxFeatureId === featureId);
  const record = (document.toolboxParts || []).find(item => item.featureId === featureId);
  const source = record || parts.find(part => part.standardPart)?.standardPart;
  const body = assignedPart && parts.includes(assignedPart) ? assignedPart : assignedToolboxBody(parts, source);
  if (!body) return;
  const metadata = toolboxAssignedMetadata(source, body);
  const substrateId = body.materialId || source?.catalogMaterialId || source?.materialId;
  const materialKeys = ["materialName", "materialCatalogId", "materialQualificationId", "density", "densitySource", "color", "metal", "rough"];
  parts.forEach(part => {
    // Head, shaft and disposable socket cutter are projections of the same
    // substrate. A nylon insert has a different generated materialId and
    // retains its constituent material. Visibility/opacity are not material.
    if (part !== body && part.materialId === substrateId) {
      materialKeys.forEach(key => {
        if (body[key] === undefined) delete part[key];
        else part[key] = body[key];
      });
    }
    if (part.standardPart) part.standardPart = toolboxAssignedMetadata(part.standardPart, body);
    if (part.standardCompliance?.propertyClass) part.standardCompliance = { ...part.standardCompliance,
      catalogPropertyClass: part.standardCompliance.propertyClass, propertyClass: null };
  });
  if (record && metadata !== record) Object.assign(record, metadata);
}
