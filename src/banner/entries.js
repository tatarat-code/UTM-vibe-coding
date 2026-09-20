/**
 * Banner Reader — saved entries (KV).
 *
 * Keys: entry:<id>, one record each, with a short summary kept in the key's
 * metadata. The list screen is built by listing keys, not by keeping a
 * separate index document: one shared index would have to be read, changed
 * and written back on every save, and two saves in quick succession would
 * lose one of them.
 *
 * Records expire after 24 hours (NFR-06). A record saved with ?keep=1 has no
 * expiry: that is how the speaker's rehearsal entries survive to the next day.
 * Images are never stored, here or anywhere else.
 */

import { normaliseEntry } from "./capture.js";
import { getJson, putJson, remove, listWithMetadata, StoreUnavailable } from "../store.js";
import { ENTRY_TYPES } from "./schema.js";

const TTL_SECONDS = 24 * 60 * 60;
const PREFIX = "entry:";
const MAX_ROWS = 1000;
const DEFAULT_LIMIT = 20;

export async function handleEntries(request, env, url) {
  const segments = url.pathname.split("/").filter(Boolean); // api / banner / entries / :id
  const id = segments[3] ? decodeURIComponent(segments[3]) : null;

  try {
    if (!id) {
      if (request.method === "POST") return await save(request, env, url);
      if (request.method === "GET") return await list(env, url);
      return json({ error: "Use GET to list or POST to save" }, 405);
    }

    if (request.method === "GET") return await readOne(env, id);
    if (request.method === "PATCH" || request.method === "PUT") return await save(request, env, url, id);
    if (request.method === "DELETE") return await deleteOne(env, id);
    return json({ error: "Use GET, PATCH or DELETE" }, 405);
  } catch (error) {
    if (error instanceof StoreUnavailable) {
      return json({ error: error.message, storage: false }, 503);
    }
    throw error;
  }
}

/** POST /api/banner/entries — save, or PATCH /:id — save a corrected copy. */
async function save(request, env, url, existingId = null) {
  let raw;
  try {
    raw = await request.json();
  } catch {
    return json({ error: "Expected the entry as JSON" }, 400);
  }

  if (!raw || typeof raw !== "object") return json({ error: "Expected the entry as JSON" }, 400);
  if (existingId && raw.id && raw.id !== existingId) {
    return json({ error: "The entry id does not match the address" }, 400);
  }

  const id = safeId(existingId ?? raw.id);
  const previous = existingId ? await getJson(env, PREFIX + id) : null;
  if (existingId && !previous) return json({ error: "No entry with that id" }, 404);

  const pinned = url.searchParams.get("keep") === "1" || previous?.pinned === true;

  const entry = normaliseEntry(raw, raw.meta ?? {}, {
    id,
    reviewedBy: raw.reviewedBy === "human" ? "human" : previous?.reviewedBy ?? null,
    capturedAt: previous?.capturedAt ?? raw.capturedAt,
  });
  entry.pinned = pinned;
  entry.savedAt = new Date().toISOString();

  await putJson(env, PREFIX + id, entry, {
    metadata: summarise(entry),
    ...(pinned ? {} : { expirationTtl: TTL_SECONDS }),
  });

  return json(entry, existingId ? 200 : 201);
}

/** GET /api/banner/entries?type=&q=&limit=&offset= */
async function list(env, url) {
  const type = url.searchParams.get("type");
  const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const limit = clampNumber(url.searchParams.get("limit"), DEFAULT_LIMIT, 1, 100);
  const offset = clampNumber(url.searchParams.get("offset"), 0, 0, 10000);

  const rows = await allRows(env);

  const counts = { all: rows.length };
  for (const entryType of ENTRY_TYPES) {
    counts[entryType] = rows.filter((row) => row.type === entryType).length;
  }

  let items = rows;
  if (type && type !== "all") items = items.filter((row) => row.type === type);
  if (query) {
    items = items.filter((row) =>
      [row.title, row.org, row.summary, ...(row.tags ?? [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }

  return json({
    total: items.length,
    counts,
    offset,
    items: items.slice(offset, offset + limit),
  });
}

/** Every saved record, newest first. */
export async function allRows(env) {
  const keys = await listWithMetadata(env, PREFIX, MAX_ROWS);
  const rows = keys.map((key) => ({ id: key.key.slice(PREFIX.length), ...(key.metadata ?? {}) }));

  // A key's metadata can lag a few seconds behind the write that set it, which
  // is exactly the moment someone saves a record and taps through to the list.
  // Read those records directly instead of showing a blank line.
  const pending = rows.filter((row) => !row.type).slice(0, 30);
  await Promise.all(
    pending.map(async (row) => {
      const entry = await getJson(env, PREFIX + row.id);
      if (entry) Object.assign(row, summarise(entry));
    }),
  );

  return rows
    .filter((row) => row.type)
    .sort((a, b) => String(b.savedAt ?? "").localeCompare(String(a.savedAt ?? "")));
}

async function readOne(env, id) {
  const entry = await getJson(env, PREFIX + safeId(id));
  if (!entry) return json({ error: "No entry with that id" }, 404);
  return json(entry);
}

async function deleteOne(env, id) {
  const key = safeId(id);
  await remove(env, PREFIX + key);
  return json({ deleted: key });
}

/**
 * The summary kept in the key's metadata. KV allows about 1 KB there, so the
 * long text is cut: the list screen and the search need a handle, not the
 * record itself.
 */
function summarise(entry) {
  return {
    type: entry.type,
    title: cut(entry.title, 140),
    org: cut(entry.org, 80),
    summary: cut(entry.summary, 160),
    tags: (entry.tags ?? []).slice(0, 6).map((tag) => cut(tag, 30)),
    contacts: entry.contacts?.length ?? 0,
    capturedAt: entry.capturedAt,
    savedAt: entry.savedAt,
    reviewedBy: entry.reviewedBy,
    pinned: entry.pinned === true,
  };
}

/* ---------- helpers ---------- */

function cut(value, length) {
  if (typeof value !== "string") return null;
  return value.length > length ? value.slice(0, length - 1) + "…" : value;
}

function safeId(id) {
  const cleaned = String(id ?? "").replace(/[^A-Za-z0-9_-]/g, "");
  return cleaned.slice(0, 40) || "e_" + Math.random().toString(36).slice(2, 10);
}

function clampNumber(input, fallback, min, max) {
  const value = Number.parseInt(input ?? "", 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
