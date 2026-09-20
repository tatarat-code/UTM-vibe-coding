/**
 * Banner Reader — export.
 *
 * GET /api/banner/export?format=csv|json&type=&q=
 *
 * The column set follows the type, because a conference banner and a business
 * card have almost nothing in common. Every value column is followed by the
 * sourceText it came from: the evidence travels with the data, into the
 * spreadsheet, where someone else can still check it.
 */

import { getJson, StoreUnavailable } from "../store.js";
import { allRows } from "./entries.js";
import { TYPE_FIELDS, TYPED, CONTACT_FIELDS } from "./schema.js";

const MAX_ROWS = 300;

export async function handleExport(request, env, url) {
  if (request.method !== "GET") return text("Use GET", 405);

  try {
    return await exportEntries(env, url);
  } catch (error) {
    if (error instanceof StoreUnavailable) return text(error.message, 503);
    throw error;
  }
}

async function exportEntries(env, url) {

  const format = (url.searchParams.get("format") ?? "json").toLowerCase();
  const type = url.searchParams.get("type") ?? "all";
  const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();

  const rows = await allRows(env);
  const wanted = rows
    .filter((row) => (type === "all" ? true : row.type === type))
    .filter((row) =>
      query
        ? [row.title, row.org, row.summary, ...(row.tags ?? [])]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(query)
        : true,
    )
    .slice(0, MAX_ROWS);

  const entries = [];
  for (const row of wanted) {
    const entry = await getJson(env, `entry:${row.id}`);
    if (entry) entries.push(entry);
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const name = `banner-reader-${type}-${stamp}`;

  if (format === "csv") {
    return new Response("﻿" + toCsv(entries, type), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${name}.csv"`,
      },
    });
  }

  return new Response(JSON.stringify(entries, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${name}.json"`,
    },
  });
}

function toCsv(entries, type) {
  const fields = TYPED.includes(type) ? TYPE_FIELDS[type] : [];

  const header = [
    "id", "type", "title", "org", "summary", "tags", "urls",
    "language", "capturedAt", "savedAt", "reviewedBy", "unreadable",
  ];
  for (const field of fields) header.push(field.key, `${field.key}__source`);
  for (const field of CONTACT_FIELDS) header.push(`contact1_${field.key}`);

  const lines = [header.map(csvCell).join(",")];

  for (const entry of entries) {
    const contact = entry.contacts?.[0] ?? {};
    const row = [
      entry.id,
      entry.type,
      entry.title,
      entry.org,
      entry.summary,
      join(entry.tags),
      join(entry.urls),
      entry.language,
      entry.capturedAt,
      entry.savedAt,
      entry.reviewedBy,
      join(entry.unreadable),
    ];

    for (const field of fields) {
      const cell = entry.fields?.[field.key];
      row.push(join(cell?.value), cell?.sourceText ?? "");
    }
    for (const field of CONTACT_FIELDS) {
      row.push(join(contact?.[field.key]?.value));
    }

    lines.push(row.map(csvCell).join(","));
  }

  return lines.join("\r\n");
}

/** Lists become one cell; a cell keeps the printed text, not a tidied version. */
function join(value) {
  if (Array.isArray(value)) return value.join(" | ");
  return value ?? "";
}

function csvCell(value) {
  const cell = String(value ?? "");
  return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

function text(message, status = 200) {
  return new Response(message, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}
