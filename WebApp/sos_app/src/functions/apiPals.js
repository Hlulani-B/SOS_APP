import { callApi } from "./apiClient.js";

/**
 * Fetch wrappers for api/functions/pals.js - one per backend method, same
 * names, same positional signatures. All hit POST /api/pals.
 */

/**
 * Record a pending invite from `inviter` to `invitee`.
 * @returns {Promise<number>} the new invite's id
 */
export async function send_invite(inviter, invitee) {
  return callApi("pals", "send_invite", [inviter, invitee]);
}

/**
 * All invites still waiting on this user.
 * @returns {Promise<Array<{ id, inviter, invitee, status }>>}
 */
export async function get_invites(invitee) {
  return callApi("pals", "get_invites", [invitee]);
}

/**
 * All invites this user has sent, in every status (pending/accepted/rejected).
 * @returns {Promise<Array<{ id, inviter, invitee, status }>>}
 */
export async function get_sent_invites(inviter) {
  return callApi("pals", "get_sent_invites", [inviter]);
}

/**
 * The email list this user is pals with (empty array when they have none).
 * @returns {Promise<string[]>}
 */
export async function get_pals(email) {
  return callApi("pals", "get_pals", [email]);
}

/** Cross-links two users as pals in both directions. */
export async function make_pals(email1, email2) {
  return callApi("pals", "make_pals", [email1, email2]);
}

/**
 * Answer an invite; 'accepted' also makes the pair pals (one transaction).
 * @param {string} status 'accepted' | 'rejected'
 */
export async function accept_invite(email1, email2, status) {
  return callApi("pals", "accept_invite", [email1, email2, status]);
}

/**
 * Un-link two pals: removes each from the other's array and deletes the
 * invite row between them (whichever direction it was sent).
 */
export async function remove_pal(email1, email2) {
  return callApi("pals", "remove_pal", [email1, email2]);
}
