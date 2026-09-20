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
  if (options.metadata) put.metadata = options.metadata;
  await kv(env).put(key, JSON.stringify(value), put);
  return value;
}

/**
 * Every key under a prefix, with the metadata stored beside it.
 *
 * This is how lists are built. A separate index document would be one blob
 * that every save has to read, change and write back — and KV reads can lag
 * a moment behind the last write, so two saves in quick succession quietly
 * lose one of them. Listing keys has no such race, and expired keys simply
 * stop appearing.
 */
export async function listWithMetadata(env, prefix, limit = 1000) {
  const rows = [];
  let cursor;

  do {
    const page = await kv(env).list({ prefix, limit: Math.min(1000, limit), cursor });
    for (const key of page.keys) {
      rows.push({ key: key.name, metadata: key.metadata ?? null });
      if (rows.length >= limit) return rows;
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  return rows;
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
