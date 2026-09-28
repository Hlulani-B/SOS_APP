import { pool } from '../db.js';

export class Users {
  /**
   * Boolean check for login/signup routing: does this email already have a
   * users row? Authentication itself is Supabase's job; the app calls this
   * after a Supabase sign-up/sign-in to tell brand-new users apart from
   * returning ones (new -> onboarding, returning -> the app itself).
   */
  async Checkuser(email) {
    const { rows } = await pool.query(
      `SELECT 1 FROM users WHERE email = $1`,
      [email]
    );

    return rows.length > 0;
  }

  async getFullName(email) {
    const { rows } = await pool.query(
      `SELECT name, surname
         FROM users
        WHERE email = $1`,
      [email]
    );

    if (rows.length === 0) {
      throw new Error(`getFullName found no users row for ${email}`);
    }

    return rows[0];
  }

  /**
   * Batch profile lookup for the map screen: name, surname and avatar for
   * every email asked for, in one round trip. Emails with no users row are
   * silently skipped rather than failing the whole batch, because a pal who
   * deleted her account should just disappear from the map.
   */
  async getProfiles(emails) {
    const { rows } = await pool.query(
      `SELECT email, name, surname, avatar
         FROM users
        WHERE email = ANY($1::text[])`,
      [emails]
    );

    return rows;
  }

  async addUser(email, name, surname) {
    const { rows } = await pool.query(
      `INSERT INTO users (email, name, surname)
       VALUES ($1, $2, $3)
       RETURNING email, name, surname`,
      [email, name, surname]
    );

    return rows[0];
  }

  async setName(email, name) {
    const { rows } = await pool.query(
      `UPDATE users
          SET name = $2
        WHERE email = $1
        RETURNING email, name`,
      [email, name]
    );

    if (rows.length === 0) {
      throw new Error(`setName found no users row for ${email}`);
    }

    return rows[0];
  }

  async setSurname(email, surname) {
    const { rows } = await pool.query(
      `UPDATE users
          SET surname = $2
        WHERE email = $1
        RETURNING email, surname`,
      [email, surname]
    );

    if (rows.length === 0) {
      throw new Error(`setSurname found no users row for ${email}`);
    }

    return rows[0];
  }

  async setAvatar(email, avatar) {
    const { rows } = await pool.query(
      `UPDATE users
          SET avatar = $2
        WHERE email = $1
        RETURNING email, avatar`,
      [email, avatar]
    );

    if (rows.length === 0) {
      throw new Error(`setAvatar found no users row for ${email}`);
    }

    return rows[0];
  }
}