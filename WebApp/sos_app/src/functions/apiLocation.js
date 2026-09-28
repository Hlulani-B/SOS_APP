import { callApi } from "./apiClient.js";

/**
 * Fetch wrappers for api/functions/location.js - one per backend method,
 * same names, same signatures. All hit POST /api/location.
 *
 * The backend runs in Node and cannot read a device position, so when
 * ShareLocation is called without coordinates the browser grabs them here
 * (same options the old local helper used) and sends them along.
 */

function currentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("ShareLocation: no geolocation on this device, pass coordinates instead"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }),
      (err) => reject(new Error(`ShareLocation: geolocation failed (${err.message})`)),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

/** Register a contact row (email only, no location yet). */
export async function addEmail(email) {
  return callApi("location", "addEmail", [email]);
}

/**
 * Store the contact's current coordinates.
 * @param {{ latitude: number, longitude: number }} [coordinates]
 *        omit to share this device's live position
 */
export async function ShareLocation(email, coordinates) {
  const position = coordinates ?? (await currentPosition());
  return callApi("location", "ShareLocation", [email, position]);
}

/** Stop live sharing: coordinates are cleared, the row is kept. */
export async function StopLiveLocation(email) {
  return callApi("location", "StopLiveLocation", [email]);
}

/**
 * Last shared coordinates for a batch of emails. Rows with NULL
 * coordinates (never shared, or sharing stopped) are excluded by the
 * backend, so everything returned is plottable.
 * @returns {Promise<Array<{ email, latitude, longitude }>>}
 */
export async function getLocationsByEmails(emails) {
  return callApi("location", "getLocationsByEmails", [emails]);
}
