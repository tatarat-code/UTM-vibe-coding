/**
 * Banner Reader — saved entries (KV).
 *
 * Keys:  entry:<id>   one record
 *        idx:all      newest-first list of summaries, used for the list screen
 *
 * Records expire after 24 hours (NFR-06). A record saved with ?keep=1 has no
 * expiry: that is how the speaker's rehearsal entries survive to the next day.
 * Images are never stored, here or anywhere else.
 */

import { normaliseEntry } from "./capture.js";
import { getJson, putJson, remove, updateJson, StoreUnavailable } from "../store.js";
import { ENTRY_TYPES } from "./schema.js";

const TTL_SECONDS = 24 * 60 * 60;
const INDEX_KEY = "idx:all";
const INDEX_LIMIT = 300;
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
  const previous = existingId ? await getJson(env, `entry:${id}`) : null;
  if (existingId && !previous) return json({ error: "No entry with that id" }, 404);

  const pinned = url.searchParams.get("keep") === "1" || previous?.pinned === true;

  const entry = normaliseEntry(raw, raw.meta ?? {}, {
    id,
    reviewedBy: raw.reviewedBy === "human" ? "human" : previous?.reviewedBy ?? null,
    capturedAt: previous?.capturedAt ?? raw.capturedAt,
  });
  entry.pinned = pinned;
  entry.savedAt = new Date().toISOString();

  const options = pinned ? {} : { expirationTtl: TTL_SECONDS };
  await putJson(env, `entry:${id}`, entry, options);
  await updateIndex(env, (rows) => [summarise(entry), ...rows.filter((row) => row.id !== id)]);

  return json(entry, existingId ? 200 : 201);
}

/** GET /api/banner/entries?type=&q=&limit=&offset= */
async function list(env, url) {
  const type = url.searchParams.get("type");
  const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const limit = clampNumber(url.searchParams.get("limit"), DEFAULT_LIMIT, 1, 100);
  const offset = clampNumber(url.searchParams.get("offset"), 0, 0, 10000);

  const rows = live(await getJson(env, INDEX_KEY, []));

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

async function readOne(env, id) {
  const entry = await getJson(env, `entry:${safeId(id)}`);
  if (!entry) return json({ error: "No entry with that id" }, 404);
  return json(entry);
}

async function deleteOne(env, id) {
  const key = safeId(id);
  await remove(env, `entry:${key}`);
  await updateIndex(env, (rows) => rows.filter((row) => row.id !== key));
  return json({ deleted: key });
}

/* ---------- index ---------- */

async function updateIndex(env, change) {
  await updateJson(
    env,
    INDEX_KEY,
    (current) => {
      const rows = live(Array.isArray(current) ? current : []);
      return change(rows).slice(0, INDEX_LIMIT);
    },
    { fallback: [] },
  );
}

/** Rows whose entry has not expired yet. Pinned rows never expire. */
function live(rows) {
  const cutoff = Date.now() - TTL_SECONDS * 1000;
  return rows.filter((row) => {
    if (!row?.id) return false;
    if (row.pinned) return true;
    const savedAt = Date.parse(row.savedAt ?? row.capturedAt ?? "");
    return Number.isFinite(savedAt) ? savedAt > cutoff : true;
  });
}

function summarise(entry) {
  return {
    id: entry.id,
    type: entry.type,
    title: entry.title,
    org: entry.org,
    summary: entry.summary,
    tags: entry.tags ?? [],
    contacts: entry.contacts?.length ?? 0,
    capturedAt: entry.capturedAt,
    savedAt: entry.savedAt,
    reviewedBy: entry.reviewedBy,
    pinned: entry.pinned === true,
  };
}

/* ---------- helpers ---------- */

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
