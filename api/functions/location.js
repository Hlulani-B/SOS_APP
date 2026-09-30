import { pool } from '../db.js';

// How long a shared position counts as live: three missed broadcasts of the
// app's 10s share loop, with slack for network jitter and Render cold starts.
const PRESENCE_TTL_SECONDS = 30;

/**
 * Resolves the device's current coordinates through the geolocation API,
 * with the same options the SOS app uses. A Node server has no geolocation,
 * so a route handling a device report passes coordinates in explicitly
 * instead.
 */
function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    const geolocation = globalThis.navigator?.geolocation;
    if (!geolocation) {
      reject(new Error('No geolocation API in this runtime — pass coordinates instead: ShareLocation(email, { latitude, longitude })'));
      return;
    }

    geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (err) => reject(new Error(`Geolocation failed: ${err.message}`)),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

export class Location {
  /**
   * Stores the current coordinates on the contact's row, creating the row on
   * first share. `email` is the primary key, so the lookup is the email
   * itself. The UPDATE-only version threw "register it with addEmail first"
   * for every account that had never been registered - nothing in the app
   * ever called addEmail - so the share toggle could never turn on. The
   * ON CONFLICT keeps StopLiveLocation's contract: the row stays and only
   * the coordinates clear, so sharing can always resume.
   *
   * Every write stamps last_shared = now(); that stamp, not the coordinates
   * themselves, is what makes a pal "online" (see getLocationsByEmails), so
   * a device that goes silent without a clean stop - force-quit, crash, a
   * failed or raced StopLiveLocation call - ages out instead of posing as
   * online forever.
   */
  async ShareLocation(email, coordinates) {
    const position = coordinates ?? await getCurrentPosition();

    await pool.query(
      `INSERT INTO locations (email, latitude, longitude, last_shared)
       VALUES ($3, $1, $2, now())
       ON CONFLICT (email) DO UPDATE
         SET latitude = EXCLUDED.latitude,
             longitude = EXCLUDED.longitude,
             last_shared = now()`,
      [position.latitude, position.longitude, email]
    );
  }

  /**
   * Stops live sharing by clearing both coordinates. The row stays, so the
   * contact keeps their place in the table and sharing can resume.
   */
  async StopLiveLocation(email) {
    await pool.query(
      'UPDATE locations SET latitude = NULL, longitude = NULL WHERE email = $1',
      [email]
    );
  }

  /**
   * Registers a contact: one row holding the email, with no location yet.
   */
  async addEmail(email) {
    await pool.query(
      'INSERT INTO locations (email, latitude, longitude) VALUES ($1, NULL, NULL)',
      [email]
    );
  }

  /**
   * Batch read for the map screen: the last shared coordinates for each
   * email asked for, limited to positions still fresh enough to count as
   * live. A pal is ONLINE only while they keep stamping last_shared (the
   * app broadcasts every 10s); rows older than PRESENCE_TTL are excluded
   * here even if coordinates are present, so any unclean exit - toggle-off
   * whose request was lost, a late in-flight share re-writing the coords,
   * force-quit, crash - self-heals into OFFLINE. Rows whose coordinates are
   * NULL (never shared, or stopped cleanly) are excluded as before, so
   * callers only ever receive plottable, current positions.
   */
  async getLocationsByEmails(emails) {
    const { rows } = await pool.query(
      `SELECT email, latitude, longitude
         FROM locations
        WHERE email = ANY($1::text[])
          AND latitude IS NOT NULL
          AND longitude IS NOT NULL
          AND last_shared > now() - ($2 || ' seconds')::interval`,
      [emails, PRESENCE_TTL_SECONDS]
    );

    return rows;
  }
}
