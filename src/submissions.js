/**
 * Step 2 — submissions.
 *
 * Keys: sub:<id>, one submission each, its summary in the key's metadata.
 * The list is a prefix listing rather than a shared index document, for the
 * reason written up in src/banner/entries.js: two saves in quick succession
 * would lose one of them.
 *
 * A grade is stored in two states. The draft the model proposed is kept as
 * `draft`, and only what the instructor confirmed becomes `grade`, at which
 * point the status turns to "released" and the student can see it.
 */

import { getJson, putJson, listWithMetadata, StoreUnavailable } from "./store.js";
import { gradeText, totalFor, rubric } from "./grade.js";

const PREFIX = "sub:";
const TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_CHARS = 60000;

export async function handleSubmissions(request, env, url) {
  const segments = url.pathname.split("/").filter(Boolean); // api / submissions / :id / :action
  const id = segments[2] ? safeId(decodeURIComponent(segments[2])) : null;
  const action = segments[3] ?? null;

  try {
    if (!id) {
      if (request.method === "POST") return await create(request, env);
      if (request.method === "GET") return await list(env);
      return json({ error: "Use GET to list or POST to submit" }, 405);
    }

    if (id === "export" && request.method === "GET") return await exportAll(env, url);
    if (!action && request.method === "GET") return await readOne(env, id);
    if (action === "grade" && request.method === "POST") return await gradeOne(env, id);
    if (action === "release" && request.method === "POST") return await release(request, env, id);
    return json({ error: "No such endpoint" }, 404);
  } catch (error) {
    if (error instanceof StoreUnavailable) {
      return json({ error: error.message, storage: false }, 503);
    }
    throw error;
  }
}

/** POST /api/submissions — a student hands work in. */
async function create(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Expected JSON: { studentName, text }" }, 400);
  }

  const studentName = typeof body?.studentName === "string" ? body.studentName.trim().slice(0, 80) : "";
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, MAX_CHARS) : "";

  if (studentName === "") return json({ error: "Enter your name" }, 400);
  if (text.length < 40) return json({ error: "Paste your submission text" }, 400);

  const submission = {
    id: newId(),
    studentName,
    text,
    words: countWords(text),
    submittedAt: new Date().toISOString(),
    status: "submitted",
    draft: null,
    grade: null,
  };

  await save(env, submission);
  return json({ id: submission.id, submittedAt: submission.submittedAt }, 201);
}

/** GET /api/submissions — newest first. */
async function list(env) {
  const keys = await listWithMetadata(env, PREFIX, 500);

  const rows = keys.map((key) => ({ id: key.key.slice(PREFIX.length), ...(key.metadata ?? {}) }));

  // Key metadata can lag a few seconds behind the write that set it.
  const pending = rows.filter((row) => !row.submittedAt).slice(0, 30);
  await Promise.all(
    pending.map(async (row) => {
      const submission = await getJson(env, PREFIX + row.id);
      if (submission) Object.assign(row, summarise(submission));
    }),
  );

  const items = rows
    .filter((row) => row.submittedAt)
    .sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));

  return json({ total: items.length, items });
}

/** GET /api/submissions/:id — the work, plus the grade once it is released. */
async function readOne(env, id) {
  const submission = await getJson(env, PREFIX + id);
  if (!submission) return json({ error: "No submission with that id" }, 404);

  return json({
    id: submission.id,
    studentName: submission.studentName,
    submittedAt: submission.submittedAt,
    status: submission.status,
    words: submission.words,
    text: submission.text,
    grade: submission.status === "released" ? submission.grade : null,
    rubric: submission.status === "released" ? rubricForStudent() : null,
  });
}

/** POST /api/submissions/:id/grade — draft a grade and keep it. */
async function gradeOne(env, id) {
  const submission = await getJson(env, PREFIX + id);
  if (!submission) return json({ error: "No submission with that id" }, 404);

  const drafted = await gradeText(submission.text, env);
  if (drafted.error) return json({ error: drafted.error }, drafted.status ?? 502);

  submission.draft = drafted.grade;
  submission.status = submission.status === "released" ? "released" : "graded";
  await save(env, submission);

  return json(drafted.grade);
}

/** POST /api/submissions/:id/release — the instructor's decision, to the student. */
async function release(request, env, id) {
  const submission = await getJson(env, PREFIX + id);
  if (!submission) return json({ error: "No submission with that id" }, 404);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Expected JSON: { items, total, summary }" }, 400);
  }

  const items = rubric.criteria.map((criterion) => {
    const sent = Array.isArray(body?.items)
      ? body.items.find((entry) => entry?.criterionId === criterion.id)
      : null;
    return {
      criterionId: criterion.id,
      score: clampScore(sent?.score),
      evidence: typeof sent?.evidence === "string" ? sent.evidence : null,
      quoteFound: sent?.quoteFound ?? null,
      quoteTrimmed: sent?.quoteTrimmed === true,
      comment: typeof sent?.comment === "string" ? sent.comment : "",
    };
  });

  submission.grade = {
    items,
    // Recomputed here: the total a student sees is never taken on trust
    // from the browser that sent it.
    total: totalFor(items),
    maxTotal: rubric.scoring.maxTotal,
    summary: typeof body?.summary === "string" ? body.summary.trim() : "",
    releasedAt: new Date().toISOString(),
    decidedBy: "instructor",
  };
  submission.status = "released";

  await save(env, submission);
  return json({ id: submission.id, status: submission.status, total: submission.grade.total });
}

/**
 * GET /api/submissions/export?format=csv|json — the raw grading data.
 *
 * One row per submission and criterion, carrying both numbers: what the model
 * drafted and what the instructor decided. Those two columns beside each other
 * are the whole record of who decided what — which is the reason to export at
 * all, rather than just the final marks.
 */
async function exportAll(env, url) {
  const keys = await listWithMetadata(env, PREFIX, 500);

  const records = [];
  for (const key of keys) {
    const submission = await getJson(env, key.key);
    if (submission) records.push(submission);
  }
  records.sort((a, b) => String(a.submittedAt).localeCompare(String(b.submittedAt)));

  const stamp = new Date().toISOString().slice(0, 10);

  if ((url.searchParams.get("format") ?? "csv").toLowerCase() === "json") {
    return new Response(JSON.stringify(records, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="grading-data-${stamp}.json"`,
      },
    });
  }

  // The BOM is for Excel, which otherwise reads UTF-8 as the local code page.
  return new Response("﻿" + toCsv(records), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="grading-data-${stamp}.csv"`,
    },
  });
}

function toCsv(records) {
  const header = [
    "submission_id", "student_name", "submitted_at", "status", "words",
    "released_at", "decided_by", "total_ai_draft", "total_final", "max_total",
    "criterion_id", "criterion_name", "weight",
    "ai_score", "final_score", "changed_by_instructor", "level_awarded",
    "evidence", "quote_found", "quote_trimmed", "comment", "summary",
  ];

  const lines = [header.map(csvCell).join(",")];

  for (const record of records) {
    for (const criterion of rubric.criteria) {
      const draft = record.draft?.items?.find((item) => item.criterionId === criterion.id) ?? null;
      const final = record.grade?.items?.find((item) => item.criterionId === criterion.id) ?? null;
      const shown = final ?? draft;
      const level = criterion.levels.find((entry) => entry.score === shown?.score);

      lines.push([
        record.id,
        record.studentName,
        record.submittedAt,
        record.status,
        record.words,
        record.grade?.releasedAt ?? "",
        record.grade?.decidedBy ?? "",
        record.draft?.total ?? "",
        record.grade?.total ?? "",
        rubric.scoring.maxTotal,
        criterion.id,
        criterion.name,
        criterion.weight,
        draft?.score ?? "",
        final?.score ?? "",
        draft && final && draft.score !== final.score ? "yes" : "no",
        level?.label ?? "",
        shown?.evidence ?? "",
        shown?.quoteFound ?? "",
        shown?.quoteTrimmed ? "yes" : "no",
        shown?.comment ?? "",
        record.grade?.summary ?? record.draft?.summary ?? "",
      ].map(csvCell).join(","));
    }
  }

  return lines.join("\r\n") + "\r\n";
}

function csvCell(value) {
  const cell = String(value ?? "");
  return /["\,\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

/* ---------- helpers ---------- */

async function save(env, submission) {
  await putJson(env, PREFIX + submission.id, submission, {
    metadata: summarise(submission),
    expirationTtl: TTL_SECONDS,
  });
}

function summarise(submission) {
  return {
    studentName: submission.studentName,
    submittedAt: submission.submittedAt,
    status: submission.status,
    words: submission.words,
    total: submission.grade?.total ?? null,
  };
}

function rubricForStudent() {
  return {
    title: rubric.title,
    scale: rubric.scale,
    scoring: { maxTotal: rubric.scoring.maxTotal },
    criteria: rubric.criteria.map((criterion) => ({
      id: criterion.id,
      name: criterion.name,
      description: criterion.description,
      weight: criterion.weight,
      levels: criterion.levels,
    })),
  };
}

function countWords(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

function clampScore(value) {
  const score = Number.parseInt(value, 10);
  if (!Number.isFinite(score)) return rubric.scale.min;
  return Math.min(rubric.scale.max, Math.max(rubric.scale.min, score));
}

function safeId(id) {
  return String(id).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
}

function newId() {
  const random = crypto.getRandomValues(new Uint8Array(4));
  return "s_" + [...random].map((byte) => byte.toString(36).padStart(2, "0")).join("").slice(0, 7);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
