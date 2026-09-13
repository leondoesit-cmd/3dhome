// Planner dimension edits are requests against product rules.  They never
// mutate mesh scale; the caller applies a parameter/configuration result and
// then asks the rebuild pipeline for new derived geometry.

import { authoredProductRules } from "./product_rules.js";

const finite = (value) => typeof value === "number" && Number.isFinite(value);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function inferProductRules(type, dimensions = {}, catalogueOverride) {
  const width = Number(dimensions.width) || 100;
  const authored = authoredProductRules(type, dimensions, catalogueOverride);
  if (authored) return authored;
  const rules = {
    id: "inferred.generic",
    version: 1,
    source: "inferred",
    family: "generic",
    dimensions: {
      width: { min: 5, max: 800, continuous: true },
      depth: { min: 5, max: 800, continuous: true },
      height: { min: 2, max: 600, continuous: true },
    },
    invariants: [],
    configuration: {},
  };
  if (/bed|bunk|crib/i.test(type || "")) {
    rules.family = "bed";
    rules.dimensions.width = { min: 70, max: 210, allowed: [80, 90, 100, 120, 140, 160, 180, 200], tolerance: 2 };
    rules.dimensions.depth = { min: 180, max: 220, allowed: [190, 200, 210], tolerance: 2 };
    rules.configuration = { sizeFamily: nearest(width, rules.dimensions.width.allowed) + " cm mattress" };
    rules.invariants.push("frameThickness", "mattressClearance");
  } else if (/sofa|couch|recliner|bench|pouf/i.test(type || "")) {
    rules.family = "seating";
    rules.dimensions.width = { min: 55, max: 420, continuous: true };
    rules.module = { parameter: "seatCount", dimension: "width", minSpan: 52, maxSpan: 78, minCount: 1, maxCount: 6, noun: "seats" };
    rules.configuration = { seatCount: clamp(Math.round(width / 65), 1, 6) };
    rules.invariants.push("armWidth", "frameThickness", "cushionGap");
  } else if (/table|desk|island/i.test(type || "")) {
    rules.family = "table";
    rules.dimensions.width = { min: 35, max: 500, continuous: true };
    rules.module = { parameter: "supportCount", dimension: "width", minSpan: 45, maxSpan: 160, minCount: 2, maxCount: 6, noun: "supports" };
    rules.configuration = { supportCount: width > 260 ? 4 : width > 160 ? 3 : 2 };
    rules.invariants.push("topThickness", "legSection", "edgeOverhang");
  } else if (/cab|wardrobe|shelf|dresser|pantry|vanity/i.test(type || "")) {
    rules.family = "casework";
    rules.dimensions.width = { min: 30, max: 600, continuous: true };
    rules.module = { parameter: "moduleCount", dimension: "width", minSpan: 30, maxSpan: 90, minCount: 1, maxCount: 12, noun: "modules" };
    rules.configuration = { moduleCount: clamp(Math.ceil(width / 90), 1, 12), doorCount: clamp(Math.ceil(width / 70), 1, 12) };
    rules.invariants.push("panelThickness", "backThickness", "hardwareSpacing", "supportedSpan");
  }
  return rules;
}

function nearest(value, choices) {
  return choices.reduce((best, choice) => Math.abs(choice - value) < Math.abs(best - value) ? choice : best, choices[0]);
}

function alternative(label, parameters, configuration, reason, key) {
  const stableKey = key || JSON.stringify({ parameters, configuration });
  let hash = 2166136261;
  for (let index = 0; index < stableKey.length; index++) hash = Math.imul(hash ^ stableKey.charCodeAt(index), 16777619);
  return { id: "alternative:" + (hash >>> 0).toString(36), label, parameters, configuration, reason };
}

export function evaluateDimensionRequest(definition, instance, dimension, requested) {
  const parameter = definition?.parameters?.[dimension];
  if (!parameter) return { status: "rejected", code: "unknown-dimension", message: "This object does not expose " + dimension };
  if (parameter.adjustable === false || parameter.fixed) return { status: "rejected", code: "fixed-dimension", message: parameter.label + " is fixed by the definition" };
  let value = Number(requested);
  if (!finite(value)) return { status: "rejected", code: "not-a-number", message: "Enter a valid dimension" };
  const rule = definition.rules?.dimensions?.[dimension] || {};
  if (rule.adjustable === false || rule.fixed) return { status: "rejected", code: "fixed-dimension", message: parameter.label + " is fixed by the product rule pack" };
  const min = finite(rule.min) ? rule.min : finite(parameter.min) ? parameter.min : -Infinity;
  const max = finite(rule.max) ? rule.max : finite(parameter.max) ? parameter.max : Infinity;
  if (value < min || value > max) {
    const bounded = clamp(value, min, max);
    return {
      status: "proposal",
      code: "outside-range",
      requested: value,
      message: "The requested size is outside the supported range",
      alternatives: [alternative("Use " + bounded + " cm", { [dimension]: bounded }, instance?.configuration || {}, "Nearest supported size", dimension + ":bounded:" + bounded)],
    };
  }
  const allowed = rule.allowed;
  if (Array.isArray(allowed) && allowed.length && !allowed.some((choice) => Math.abs(choice - value) <= (rule.tolerance || 0))) {
    const sorted = allowed.slice().sort((a, b) => Math.abs(a - value) - Math.abs(b - value));
    return {
      status: "proposal",
      code: "discrete-size-family",
      requested: value,
      message: "This product uses discrete size families",
      alternatives: sorted.slice(0, 3).map((choice) => alternative(choice + " cm", { [dimension]: choice }, { ...(instance?.configuration || {}), sizeFamily: choice + " cm" }, "Standard size family", dimension + ":family:" + choice)),
    };
  }
  if (Array.isArray(allowed) && allowed.length) value = nearest(value, allowed);
  const links=definition.rules?.linkedDimensions||[],seen=new Set([dimension]),queue=[dimension],parameters={[dimension]:value};
  let prompt=false;
  for(let index=0;index<queue.length;index++)for(const link of links.filter(link=>link.source===queue[index]&&link.relation==='equal')){
    if(seen.has(link.target))continue;seen.add(link.target);queue.push(link.target);
    const check=evaluateDimensionRequest({...definition,rules:{...definition.rules,linkedDimensions:[]}},instance,link.target,value);
    if(check.status!=='applied'||check.parameters[link.target]!==value)return {status:'rejected',code:'linked-dimension-unavailable',message:'Linked dimension '+link.target+' cannot accept this size'};
    parameters[link.target]=value;
    const current=Number(instance?.parameterOverrides?.[link.target]??definition.parameters?.[link.target]?.value);
    if((!finite(current)||Math.abs(current-value)>1e-6)&&link.prompt!==false)prompt=true;
  }
  if(queue.length>1){
    if(prompt)return {status:'proposal',code:'linked-dimension-change',requested:value,message:queue.join(', ')+' are linked by the product configuration',alternatives:[alternative('Keep linked dimensions equal',parameters,instance?.configuration||{},'Preserves every linked relationship')]};
    return {status:'applied',parameters,configuration:instance?.configuration||{},message:'Rebuilt from linked parameters'};
  }
  const module = definition.rules?.module;
  if (module && module.dimension === dimension) {
    const current = Number(instance?.configuration?.[module.parameter] || definition.rules?.configuration?.[module.parameter] || module.minCount || 1);
    const span = value / Math.max(1, current);
    if (span < module.minSpan || span > module.maxSpan) {
      const ideal = clamp(Math.ceil(value / module.maxSpan), module.minCount || 1, module.maxCount || 99);
      const candidates = new Set([ideal, clamp(Math.round(value / ((module.minSpan + module.maxSpan) / 2)), module.minCount || 1, module.maxCount || 99)]);
      for(const count of candidates)if(value/count<module.minSpan || value/count>module.maxSpan)candidates.delete(count);
      if(!candidates.size)return {status:"rejected",code:"module-span-unavailable",requested:value,message:"No supported module count can accommodate this size",alternatives:[]};
      const coupled = definition.rules?.coupledCounts || [];
      return {
        status: "proposal",
        code: "configuration-change",
        requested: value,
        message: "The current " + module.noun + " configuration would exceed its supported span",
        alternatives: Array.from(candidates).sort((a, b) => a - b).map((count) => {
          const configuration = { ...(instance?.configuration || {}), [module.parameter]: count };
          coupled.filter((entry) => entry.from === module.parameter).forEach((entry) => {
            configuration[entry.parameter] = Math.max(1, Math.round(count * (entry.multiplier || 1)));
          });
          return alternative(
            count + " " + module.noun + " · " + Math.round((value / count) * 10) / 10 + " cm each",
            { [dimension]: value }, configuration,
            "Keeps each module within " + module.minSpan + "–" + module.maxSpan + " cm",
            dimension + ":" + module.parameter + ":" + count + ":" + value,
          );
        }),
      };
    }
  }
  return { status: "applied", parameters: { [dimension]: value }, configuration: instance?.configuration || {}, message: "Rebuilt from parameters" };
}

export function applyDimensionAlternative(instance, result, alternativeId) {
  if (!instance || !result) return false;
  let choice = result.status === "applied" ? result : (result.alternatives || []).find((item) => item.id === alternativeId);
  if (!choice) return false;
  instance.parameterOverrides ||= {};
  Object.assign(instance.parameterOverrides, choice.parameters || {});
  instance.configuration = { ...(instance.configuration || {}), ...(choice.configuration || {}) };
  return true;
}
