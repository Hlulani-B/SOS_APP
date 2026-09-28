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
    console.error(`${fn} failed:`, err);
    return { status: 500, payload: { ok: false, function: fn, error: err.message } };
  }
}
