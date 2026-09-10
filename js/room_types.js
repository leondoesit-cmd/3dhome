// Stable semantic types take precedence over editable display names. The name
// fallback is only for legacy generator records that predate typed rooms.
import { roomPreset } from "./room_presets.js";
const LEGACY_TYPES = Object.freeze({
  "Living / Kitchen": "livingKitchen", "Living Room": "living", "Kitchen": "kitchen",
  "Master Bedroom": "masterBedroom", "Bedroom": "bedroom", "Bedroom 2": "kidsRoom",
  "Corridor": "corridor", "Bathroom": "bathroom",
});
export function roomTypeOf(meta) {
  if (!meta) return null;
  if (meta.roomType) return roomPreset(meta.roomType) ? meta.roomType : null;
  if (meta.preset) return roomPreset(meta.preset) ? meta.preset : null;
  return Object.hasOwn(LEGACY_TYPES, meta.name) ? LEGACY_TYPES[meta.name] : null;
}
