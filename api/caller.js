/**
 * Runs one function from a module class by name, for the generic /api routes.
 *
 * The request body decides which function executes, so the name is checked
 * against an explicit allowlist instead of `typeof instance[name] ===
 * 'function'`: without that, a caller could reach `constructor`, `__proto__` or
 * anything else inherited by the object.
 */
export async function callFunction(instance, allowed, body) {
  const fn = body?.function;
  const params = body?.params ?? [];

  if (typeof fn !== 'string' || !allowed.includes(fn)) {
    return {
      status: 400,
      payload: {
        ok: false,
        error: `Unknown function ${JSON.stringify(fn)}`,
        allowed,
      },
    };
  }

  if (!Array.isArray(params)) {
    return {
      status: 400,
      payload: { ok: false, error: 'params must be an array of positional arguments' },
    };
  }

  try {
    const data = await instance[fn](...params);
    return { status: 200, payload: { ok: true, function: fn, data: data ?? null } };
  } catch (err) {
    // The function modules all throw with the input in the message, which is
    // what the caller needs to know; anything deeper stays in the server log.
    // A function may attach err.status to classify the failure as a client
    // error (bad input, missing rows, duplicates) instead of a server fault;
    // unmarked errors keep the historic 500 so nothing else changes.
    console.error(`${fn} failed:`, err);
    const status = Number.isInteger(err.status) ? err.status : 500;
    return { status, payload: { ok: false, function: fn, error: err.message } };
  }
}
