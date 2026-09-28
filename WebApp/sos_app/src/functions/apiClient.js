/**
 * Shared transport for every api-fetch wrapper in this folder.
 *
 * The Express backend exposes each functions/ module as one dispatcher
 * endpoint: POST <base>/api/<module> with { function, params } and a
 * { ok, data } / { ok: false, error } reply (see api/caller.js).
 *
 * The base comes from VITE_API_BASE (.env, baked in at build time):
 *   - unset/empty -> relative /api/* : dev requests go through the Vite
 *     proxy to localhost:3000 and stay same-origin.
 *   - set         -> absolute calls to the deployed backend, required once
 *     the frontend and the API live on different hosts (and in a packaged
 *     Capacitor app, where no dev proxy exists at all).
 *
 * Failure is converted to a thrown Error carrying the backend's message so
 * callers can try/catch like any local function; the function name is
 * prefixed for stack traces.
 */
const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export async function callApi(module, fn, params) {
  const res = await fetch(`${API_BASE}/api/${module}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ function: fn, params }),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    throw new Error(`${fn}: ${json?.error || `request failed (${res.status})`}`);
  }
  return json.data;
}
