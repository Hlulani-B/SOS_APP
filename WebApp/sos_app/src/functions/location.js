/**
 * location - shared geolocation helper for all three alert paths (SOS,
 * audio, video). Resolves to a Google Maps link, or to the text
 * "Location unavailable" when the device has no geolocation, permission
 * is denied, or the fix times out. The promise NEVER rejects, so callers
 * can await it without risking a lost alert.
 */
export function getMapsLink() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      console.warn("Geolocation unavailable - sending without location");
      resolve("Location unavailable");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve(
          `https://maps.google.com/?q=${position.coords.latitude},${position.coords.longitude}`
        );
      },
      (err) => {
        console.warn("Geolocation error:", err.message);
        resolve("Location unavailable");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}
