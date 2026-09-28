import { pool } from '../db.js';

/**
 * Appends `palEmail` to the pals_email array of the row belonging to `email`.
 * A NULL array is treated as empty, and an email already in the array is left
 * alone, so calling this twice never stores a duplicate.
 */
function linkOneWay(executor, email, palEmail) {
  return executor.query(
    `UPDATE users
        SET pals_email = CASE
              WHEN pals_email IS NULL         THEN ARRAY[$1::text]
              WHEN NOT ($1 = ANY(pals_email)) THEN array_append(pals_email, $1)
              ELSE pals_email
            END
      WHERE email = $2`,
    [palEmail, email]
  );
}

/**
 * Removes `palEmail` from the pals_email array of the row belonging to `email`.
 * A NULL array is left as NULL; an email not present is a no-op.
 */
function unlinkOneWay(executor, email, palEmail) {
  return executor.query(
    `UPDATE users
        SET pals_email = CASE
              WHEN pals_email IS NULL THEN NULL
              ELSE array_remove(pals_email, $1)
            END
      WHERE email = $2`,
    [palEmail, email]
  );
}

export class Pals {
  /**
   * Records an invite from `inviter` to `invitee` with status 'pending'.
   *
   * The duplicate guard is folded into the insert rather than run as a separate
   * SELECT, so there is no round trip for a duplicate to slip through between
   * check and write. Two transactions started at the same instant can still
   * both see no existing row, so a unique index on (inviter, invitee) is what
   * makes the guarantee hold. Returns the new invite's id.
   *
   * The parameters are cast to varchar: used both as a bare SELECT target and
   * inside the NOT EXISTS comparison, an uncast $1 makes Postgres deduce two
   * different types for it and reject the statement.
   */
  async send_invite(inviter, invitee) {
    const { rows } = await pool.query(
      `INSERT INTO invite (inviter, invitee, status)
       SELECT $1::varchar, $2::varchar, 'pending'
        WHERE NOT EXISTS (
                 SELECT 1 FROM invite WHERE inviter = $1::varchar AND invitee = $2::varchar
               )
      RETURNING id`,
      [inviter, invitee]
    );

    if (rows.length === 0) {
      throw new Error(`send_invite: ${inviter} has already invited ${invitee}`);
    }

    return rows[0].id;
  }

  /**
   * The invites still waiting on this user — everything where invitee is their
   * email and the status has not been answered yet.
   */
  async get_invites(invitee) {
    const { rows } = await pool.query(
      `SELECT id, inviter, invitee, status
         FROM invite
        WHERE invitee = $1 AND status = 'pending'
     ORDER BY id`,
      [invitee]
    );

    return rows;
  }

  /**
   * The emails this user is pals with, read from their pals_email array in the
   * users table. A NULL array comes back as an empty list, so callers can always
   * iterate without a null check.
   */
  async get_pals(email) {
    const { rows } = await pool.query(
      `SELECT pals_email
         FROM users
        WHERE email = $1`,
      [email]
    );

    if (rows.length === 0) {
      throw new Error(`get_pals found no users row for ${email}`);
    }

    return rows[0].pals_email ?? [];
  }

  /**
   * Cross-links two users: email2 goes into email1's pals_email array and
   * email1 into email2's. Both directions are needed, otherwise the friendship
   * only shows up for one of them.
   *
   * `executor` lets a caller run these writes inside its own transaction.
   */
  async make_pals(email1, email2, executor = pool) {
    const one = await linkOneWay(executor, email1, email2);
    const two = await linkOneWay(executor, email2, email1);

    if (one.rowCount === 0 || two.rowCount === 0) {
      const missing = one.rowCount === 0 ? email1 : email2;
      throw new Error(`make_pals found no users row for ${missing}`);
    }
  }

  /**
   * Records the invitee's answer to an invite, where `email1` is the inviter
   * and `email2` the invitee.
   *
   * `accepted` writes the status AND makes the pair pals, in one transaction —
   * so an accepted invite can never exist with the two users left unlinked.
   * `rejected` writes the status only.
   */
  async accept_invite(email1, email2, status) {
    if (status !== 'accepted' && status !== 'rejected') {
      throw new Error(`accept_invite expects status 'accepted' or 'rejected', got '${status}'`);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rowCount } = await client.query(
        `UPDATE invite
            SET status = $1
          WHERE inviter = $2 AND invitee = $3 AND status = 'pending'`,
        [status, email1, email2]
      );

      if (rowCount === 0) {
        throw new Error(`accept_invite found no pending invite from ${email1} to ${email2}`);
      }

      if (status === 'accepted') {
        await this.make_pals(email1, email2, client);
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Un-pals email1 and email2: removes each other from their pals_email
   * arrays in users, and deletes the invite row that links them (whichever
   * direction it was sent in). Runs in one transaction so both tables move
   * together.
   */
  async remove_pal(email1, email2) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const one = await unlinkOneWay(client, email1, email2);
      const two = await unlinkOneWay(client, email2, email1);

      if (one.rowCount === 0 || two.rowCount === 0) {
        const missing = one.rowCount === 0 ? email1 : email2;
        throw new Error(`remove_pal found no users row for ${missing}`);
      }

      await client.query(
        `DELETE FROM invite
          WHERE (inviter = $1 AND invitee = $2)
             OR (inviter = $2 AND invitee = $1)`,
        [email1, email2]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}