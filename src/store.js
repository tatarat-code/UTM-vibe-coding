/**
 * Thin KV wrapper (namespace DEMO_KV).
 *
 * Kept generic: the rubric (rubric:) and submission (sub:) steps are meant to
 * use the same helpers with their own key prefixes.
 */

export class StoreUnavailable extends Error {
  constructor() {
    super("Storage is not available on this Worker");
    this.name = "StoreUnavailable";
    this.status = 503;
  }
}

function kv(env) {
  if (!env?.DEMO_KV) throw new StoreUnavailable();
  return env.DEMO_KV;
}

export function hasStore(env) {
  return Boolean(env?.DEMO_KV);
}

export async function getJson(env, key, fallback = null) {
  const value = await kv(env).get(key, "json");
  return value ?? fallback;
}

export async function putJson(env, key, value, options = {}) {
  const put = {};
  if (options.expirationTtl) put.expirationTtl = options.expirationTtl;
  await kv(env).put(key, JSON.stringify(value), put);
  return value;
}

export async function remove(env, key) {
  await kv(env).delete(key);
}

/**
 * Read, change, write back.
 * KV has no transactions; for a single-phone demo that is enough, and a lost
 * concurrent write costs one row in a list, not a record.
 */
export async function updateJson(env, key, update, options = {}) {
  const current = await getJson(env, key, options.fallback ?? null);
  const next = update(current);
  await putJson(env, key, next, options);
  return next;
}
