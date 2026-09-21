/**
 * Step 2 — grading against a rubric a person wrote.
 *
 * The model does not decide the criteria, the levels or the weights: those come
 * from samples/rubric.json and are fixed. It proposes a level per criterion and
 * must quote the submission for each one, so the instructor can check every
 * score against the student's own words. The total is arithmetic, done here.
 */

import rubric from "../samples/rubric.json";
import { respondJson, OpenAIError } from "./openai.js";

const MODEL = "gpt-4.1-mini";
const MAX_WORDS = 2000;

export { rubric };

const INSTRUCTIONS = `You are grading a graduate assignment against a fixed rubric.

The rubric is given below. You do not change it, add criteria, or invent levels.

For every criterion you return:
  - score: the level awarded, one of ${rubric.scale.min} to ${rubric.scale.max}
  - evidence: a quotation from the submission, copied VERBATIM — the same words,
    the same spelling, the same punctuation, 10 to 40 words long. It is ONE
    continuous run of words from ONE place in the paper: a reader must be able to
    find it with a single search. Never paraphrase. Never join two passages with
    "..." or any other gap marker — if two parts of the paper matter, quote the
    stronger one. Never quote the rubric instead of the paper.
    If the submission contains nothing that bears on this criterion, set evidence
    to null and say so in the comment. An honest empty hand beats a manufactured quote.
  - comment: one or two sentences addressed to the instructor, naming what is
    present and what is missing.

How to award a level: ${rubric.scoring.rule}

Be strict about the difference between describing something and doing it. Length,
confident tone and long reference lists are not evidence of quality.

Do not compute a total. That is done outside the model.

THE RUBRIC:
`;

export async function handleGrade(request, env) {
  if (request.method !== "POST") {
    return json({ error: "Use POST with { text }" }, 405);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Expected JSON: { text }" }, 400);
  }

  const submitted = typeof body?.text === "string" ? body.text.trim() : "";
  if (submitted.length < 40) {
    return json({ error: "Paste the submission text first" }, 400);
  }

  const drafted = await gradeText(submitted, env);
  if (drafted.error) return json({ error: drafted.error }, drafted.status ?? 502);
  return json(drafted.grade);
}

/**
 * The grading itself: submission text in, draft grade out.
 * Shared by /api/grade and by /api/submissions/:id/grade.
 */
export async function gradeText(submitted, env) {
  const words = submitted.split(/\s+/);
  const truncated = words.length > MAX_WORDS;
  const text = truncated ? words.slice(0, MAX_WORDS).join(" ") : submitted;

  let result;
  try {
    result = await respondJson(env, {
      instructions: INSTRUCTIONS + JSON.stringify(rubricForModel(), null, 2),
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: `THE SUBMISSION:\n\n${text}` }],
        },
      ],
      schemaName: "rubric_grade",
      schema: buildGradeSchema(),
      model: env.GRADE_MODEL || MODEL,
      maxOutputTokens: 4000,
    });
  } catch (error) {
    if (error instanceof OpenAIError) return { error: error.message, status: error.status };
    throw error;
  }

  const items = normaliseItems(result.data?.items, text);

  return {
    grade: {
      rubricId: rubric.id,
      items,
      total: totalFor(items),
      maxTotal: rubric.scoring.maxTotal,
      summary: typeof result.data?.summary === "string" ? result.data.summary.trim() : "",
      truncated,
      gradedAt: new Date().toISOString(),
      meta: { model: result.model },
    },
  };
}

/** total = sum(weight × score / max), as the rubric states it. */
export function totalFor(items) {
  let total = 0;
  for (const criterion of rubric.criteria) {
    const item = items.find((entry) => entry.criterionId === criterion.id);
    if (!item) continue;
    total += (criterion.weight * item.score) / rubric.scale.max;
  }
  return Math.round(total * 10) / 10;
}

/**
 * One item per criterion, in rubric order, whatever the model returned.
 *
 * `quoteFound` is checked here rather than trusted: a quotation that cannot be
 * located in the submission is exactly the thing the instructor needs to see.
 */
function normaliseItems(raw, text) {
  return rubric.criteria.map((criterion) => {
    const found = Array.isArray(raw) ? raw.find((entry) => entry?.criterionId === criterion.id) : null;
    const claimed = typeof found?.evidence === "string" && found.evidence.trim() !== ""
      ? found.evidence.trim()
      : null;

    const checked = checkQuote(claimed, text);

    return {
      criterionId: criterion.id,
      score: clampScore(found?.score),
      evidence: checked.evidence,
      quoteFound: checked.quoteFound,
      quoteTrimmed: checked.trimmed,
      comment: typeof found?.comment === "string" ? found.comment.trim() : "",
    };
  });
}

/**
 * Keep only what the paper actually says.
 *
 * Asked for a short continuous quotation, the model sometimes returns a long
 * reconstruction that no search would find. Rather than show the instructor a
 * quotation that is not in the paper, keep the longest run of it that is, and
 * say that it was trimmed. What survives can always be found with one search.
 */
function checkQuote(claimed, text) {
  if (claimed === null) return { evidence: null, quoteFound: null, trimmed: false };

  const haystack = normalise(text);
  if (haystack.includes(normalise(claimed))) {
    return { evidence: claimed, quoteFound: true, trimmed: false };
  }

  const words = claimed.split(/\s+/).slice(0, 300);
  let best = { start: 0, length: 0 };
  let start = 0;

  for (let end = 1; end <= words.length; end += 1) {
    while (start < end && !haystack.includes(normalise(words.slice(start, end).join(" ")))) {
      start += 1;
    }
    if (end - start > best.length) best = { start, length: end - start };
  }

  if (best.length < 8) return { evidence: claimed, quoteFound: false, trimmed: false };

  return {
    evidence: words.slice(best.start, best.start + best.length).join(" "),
    quoteFound: true,
    trimmed: true,
  };
}

function normalise(value) {
  return value
    .toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function clampScore(value) {
  const score = Number.parseInt(value, 10);
  if (!Number.isFinite(score)) return rubric.scale.min;
  return Math.min(rubric.scale.max, Math.max(rubric.scale.min, score));
}

/** What the model is shown: the criteria and levels, without our bookkeeping. */
function rubricForModel() {
  return {
    title: rubric.title,
    assignment: rubric.assignment,
    requirements: rubric.requirements,
    scale: rubric.scale,
    criteria: rubric.criteria.map((criterion) => ({
      id: criterion.id,
      name: criterion.name,
      description: criterion.description,
      weight: criterion.weight,
      levels: criterion.levels,
    })),
  };
}

function buildGradeSchema() {
  const scores = [];
  for (let score = rubric.scale.min; score <= rubric.scale.max; score += 1) scores.push(score);

  return {
    type: "object",
    properties: {
      items: {
        type: "array",
        description: "One entry per criterion, in the rubric's order",
        items: {
          type: "object",
          properties: {
            criterionId: { type: "string", enum: rubric.criteria.map((criterion) => criterion.id) },
            score: { type: "integer", enum: scores },
            evidence: {
              type: ["string", "null"],
              description: "One continuous verbatim quotation from the submission, 10-40 words, findable with a single search. No ellipsis, no joined passages. null if nothing in the submission bears on this criterion.",
            },
            comment: { type: "string", description: "One or two sentences for the instructor" },
          },
          required: ["criterionId", "score", "evidence", "comment"],
          additionalProperties: false,
        },
      },
      summary: { type: "string", description: "Short overall feedback addressed to the student" },
    },
    required: ["items", "summary"],
    additionalProperties: false,
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
