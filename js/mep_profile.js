// Configurable residential MEP design rules. Profiles are schematic design
// aids, not a substitute for approval by the authority having jurisdiction.
export const GENERIC_RESIDENTIAL_PROFILE = Object.freeze({
  id: "generic-residential",
  version: 1,
  name: "Generic residential schematic",
  certified: false,
  electrical: Object.freeze({
    outletSpacingCm: 300,
    maxSocketsPerCircuit: 8,
    maxLightsPerCircuit: 10,
    maxCircuitLoadW: 3600,
    defaultOutletLoadW: 180,
    defaultLightLoadW: 20,
  }),
  plumbing: Object.freeze({
    coldDiameterCm: 2,
    hotDiameterCm: 2,
    wasteDiameterCm: 6,
    wasteFall: 0.02,
    condensateFall: 0.01,
  }),
  clearances: Object.freeze({ wetZoneCm: 60, openingCm: 12, cornerCm: 20 }),
});

const PROFILES = new Map([[GENERIC_RESIDENTIAL_PROFILE.id, GENERIC_RESIDENTIAL_PROFILE]]);

export function registerMEPProfile(profile) {
  if (!profile || typeof profile.id !== "string" || !profile.id ||
    !Number.isInteger(profile.version) || profile.version <= 0)
    throw new TypeError("Invalid MEP profile");
  var normalized = { ...profile };
  for (var group of ["electrical", "plumbing", "clearances"]) {
    normalized[group] = { ...GENERIC_RESIDENTIAL_PROFILE[group], ...profile[group] };
    for (var [key, value] of Object.entries(normalized[group])) {
      if (!Number.isFinite(value) || value <= 0 || (/^max.*PerCircuit$/.test(key) && !Number.isInteger(value)))
        throw new TypeError("Invalid MEP rule: " + key);
    }
    Object.freeze(normalized[group]);
  }
  PROFILES.set(profile.id, Object.freeze(normalized));
  return normalized;
}

export function mepProfile(id) {
  return PROFILES.get(id) || GENERIC_RESIDENTIAL_PROFILE;
}

// Generation must not silently design to the generic rules when a requested
// standards profile is missing. The fallback above remains for displaying
// legacy documents whose custom profile has not been installed on this host.
export function registeredMEPProfile(id) {
  return PROFILES.get(id) || null;
}

export function mepProfileRef(profile = GENERIC_RESIDENTIAL_PROFILE) {
  return { id: profile.id, version: profile.version, certified: !!profile.certified };
}
