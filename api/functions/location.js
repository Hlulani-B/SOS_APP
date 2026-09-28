import { pool } from '../db.js';

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
   */
  async ShareLocation(email, coordinates) {
    const position = coordinates ?? await getCurrentPosition();

    await pool.query(
      `INSERT INTO locations (email, latitude, longitude)
       VALUES ($3, $1, $2)
       ON CONFLICT (email) DO UPDATE
         SET latitude = EXCLUDED.latitude,
             longitude = EXCLUDED.longitude`,
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
   * email asked for. Rows whose coordinates are NULL (never shared, or
   * live sharing stopped) are excluded here, so callers only ever receive
   * plottable positions.
   */
  async getLocationsByEmails(emails) {
    const { rows } = await pool.query(
      `SELECT email, latitude, longitude
         FROM locations
        WHERE email = ANY($1::text[])
          AND latitude IS NOT NULL
          AND longitude IS NOT NULL`,
      [emails]
    );

    return rows;
  }
}
