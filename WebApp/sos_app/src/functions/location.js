/**
 * location - shared geolocation helper for all three alert paths (SOS,
 * audio, video). Resolves to a Google Maps link, or to the text
 * "Location unavailable" when the device has no geolocation, permission
 * is denied, or the fix times out. The promise NEVER rejects, so callers
 * can await it without risking a lost alert. Coordinates come from the
 * shared getPosition() helper (see geoPosition.js) so the packaged app
 * uses the native plugin and the browser keeps using the web API.
 */
import { getPosition } from "./geoPosition.js";

export async function getMapsLink() {
  try {
    const { latitude, longitude } = await getPosition();
    return `https://maps.google.com/?q=${latitude},${longitude}`;
  } catch (err) {
    console.warn("Geolocation unavailable - sending without location:", err?.message || err);
    return "Location unavailable";
  }
}
