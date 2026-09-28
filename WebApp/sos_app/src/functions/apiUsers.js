import { callApi } from "./apiClient.js";

/**
 * Fetch wrappers for api/functions/users.js - one per backend method, same
 * names, same positional signatures. All hit POST /api/users; the dispatcher
 * on the backend runs the named method and returns { ok, data }.
 */

/**
 * Boolean "does this email already have a users row?" - the new-vs-returning
 * user check used to route logins and signups.
 * @returns {Promise<boolean>}
 */
export async function Checkuser(email) {
  return callApi("users", "Checkuser", [email]);
}

/** @returns {Promise<{ name: string, surname: string }>} */
export async function getFullName(email) {
  return callApi("users", "getFullName", [email]);
}

/**
 * Batch profile read for the map: one row per email that still has a users
 * row. Emails with no row are skipped silently by the backend.
 * @returns {Promise<Array<{ email, name, surname, avatar }>>}
 */
export async function getProfiles(emails) {
  return callApi("users", "getProfiles", [emails]);
}

/** @returns {Promise<{ email, name, surname }>} */
export async function addUser(email, name, surname) {
  return callApi("users", "addUser", [email, name, surname]);
}

/** @returns {Promise<{ email, name }>} */
export async function setName(email, name) {
  return callApi("users", "setName", [email, name]);
}

/** @returns {Promise<{ email, surname }>} */
export async function setSurname(email, surname) {
  return callApi("users", "setSurname", [email, surname]);
}

/** @returns {Promise<{ email, avatar }>} */
export async function setAvatar(email, avatar) {
  return callApi("users", "setAvatar", [email, avatar]);
}
