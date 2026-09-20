/**
 * Banner Reader — image(s) in, structured entry out.
 *
 * Stateless: the images are sent to the model and dropped. Nothing is
 * written to KV or anywhere else here (NFR-06).
 */

import { respondJson, imageContent, OpenAIError, DEFAULT_MODEL } from "../openai.js";
import {
  buildCaptureSchema,
  buildFieldGuide,
  ENTRY_TYPES,
  TYPED,
  TYPE_FIELDS,
  CONTACT_FIELDS,
} from "./schema.js";

const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * The instruction block. Point 1-4 are the product, not a safety rail:
 * an entry that is honestly empty is worth more than one that is quietly
 * filled in from general knowledge (FR-11).
 */
const INSTRUCTIONS = `You are Banner Reader. You turn photographs of conference banners, research
posters, exhibition panels and business cards into structured records.

You transcribe. You do not interpret, recommend or evaluate.

RULES — these outrank any wish to be helpful or complete:

1. READ ONLY WHAT IS IN THE IMAGE. If a value is not legible, set value to null,
   sourceText to null and confidence to 0. An empty field is a correct answer.

2. NEVER USE OUTSIDE KNOWLEDGE. If you recognise the conference, company, product,
   institution or person, you must still write only what is printed here. Do not
   expand an acronym, complete a conference name, add a city, a date, a URL, a
   grant number or an affiliation from memory or from what is typical. Guessing
   is a defect, not a service.

3. EVERY VALUE NEEDS EVIDENCE. sourceText is the exact string as it appears in the
   image, copied character by character, including the original script, spelling,
   punctuation and any typo. If you cannot supply sourceText, value must be null.

4. BLURRED IS NOT READABLE. Text that is out of focus, deliberately blurred, cropped,
   covered or too small to resolve must not be reconstructed — not even partly, not
   even when the heading next to it tells you what kind of value it should be. List
   each such region in "unreadable" (for example: "funding box, body text blurred").

5. NUMBERS KEEP THEIR UNITS. Copy them exactly as printed: "±0.5 °C", "-40 - 250 °C",
   "2,000 m", "24 V DC, 18 W", "MYR 1,200". Never round, convert or tidy them.

6. KEEP THE ORIGINAL LANGUAGE. value is written in the same language and script as the
   print. In practice value is sourceText itself, with line breaks tidied — not a
   rendering of it in another language. Never translate into English because English
   is convenient for you. If a line is printed in Japanese only, value is Japanese. If
   the panel prints Japanese and English side by side, keep both, as printed.
   In a list field, every printed item gets its own entry, whatever its language:
   do not drop the Japanese items and keep only the English ones.

7. NO DECODING. Do not read QR codes, barcodes or logos. Only text you can actually see.

8. TYPE FIRST. Decide what the image mainly shows: conference, research, exhibition,
   card, or unknown. Fill the object for that type only; the other two must be null.
   A business card photographed together with a poster does not change the type.

9. CONTACTS. Put every person from a business card or a contact block into contacts[].
   One entry per person, even when spread over several images. If there are none,
   return an empty list.

10. CONFIDENCE is your reading confidence for that value: 0.9-1.0 crisp and certain,
    0.5-0.8 legible but uncertain, below 0.5 barely legible. 0 when the value is null.

11. LISTS ARE COMPLETE. When a section holds several bullets, rows or items, copy all of
    them, in the printed order. Do not select the interesting ones, do not merge them,
    and do not skip an item because it repeats another one in a different language.

The fields, and what each one means:

`;

export async function handleCapture(request, env) {
  if (request.method !== "POST") {
    return json({ error: "Use POST with multipart/form-data" }, 405);
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Expected multipart/form-data with one or more 'images'" }, 400);
  }

  const files = [...form.getAll("images"), ...form.getAll("image")].filter(
    (item) => item && typeof item !== "string" && typeof item.arrayBuffer === "function",
  );

  if (files.length === 0) return json({ error: "No image was attached" }, 400);
  if (files.length > MAX_IMAGES) {
    return json({ error: `Up to ${MAX_IMAGES} images per entry (got ${files.length})` }, 400);
  }

  const content = [
    {
      type: "input_text",
      text:
        files.length === 1
          ? "One image. Read it and fill the schema."
          : `${files.length} images of the same subject. Read them together and return one record.`,
    },
  ];

  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength === 0) return json({ error: "One of the images was empty" }, 400);
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      return json({ error: "Each image must be under 8 MB after resizing" }, 413);
    }
    const mimeType = file.type && file.type.startsWith("image/") ? file.type : "image/jpeg";
    content.push(imageContent(bytes, mimeType));
  }

  const startedAt = Date.now();
  let result;
  try {
    result = await respondJson(env, {
      instructions: INSTRUCTIONS + buildFieldGuide(),
      input: [{ role: "user", content }],
      schemaName: "banner_entry",
      schema: buildCaptureSchema(),
      model: env.BANNER_MODEL || DEFAULT_MODEL,
    });
  } catch (error) {
    if (error instanceof OpenAIError) {
      return json({ error: error.message }, error.status >= 400 && error.status < 600 ? error.status : 502);
    }
    throw error;
  }

  const entry = normaliseEntry(result.data, {
    model: result.model,
    images: files.length,
    ms: Date.now() - startedAt,
  });

  return json(entry);
}

/**
 * Rebuild the answer field by field.
 *
 * This is where the "no guessing" rule is enforced rather than merely asked for:
 * a value without sourceText is dropped, whatever the model claimed (FR-10, FR-11).
 */
export function normaliseEntry(raw, meta = {}) {
  const type = ENTRY_TYPES.includes(raw?.type) ? raw.type : "unknown";

  const fields = {};
  if (TYPED.includes(type)) {
    const source = raw?.[type] ?? {};
    for (const field of TYPE_FIELDS[type]) {
      fields[field.key] = normaliseField(source?.[field.key], field.multi);
    }
  }

  const contacts = [];
  for (const rawContact of asArray(raw?.contacts)) {
    const contact = {};
    let hasValue = false;
    for (const field of CONTACT_FIELDS) {
      contact[field.key] = normaliseField(rawContact?.[field.key], field.multi);
      if (contact[field.key].value !== null) hasValue = true;
    }
    if (hasValue) contacts.push(contact);
  }

  return {
    id: newId(),
    type,
    typeConfidence: clampConfidence(raw?.typeConfidence),
    language: text(raw?.language),
    title: text(raw?.title),
    org: text(raw?.org),
    summary: text(raw?.summary),
    tags: stringList(raw?.tags),
    urls: stringList(raw?.urls),
    fields,
    contacts,
    unreadable: stringList(raw?.unreadable),
    capturedAt: new Date().toISOString(),
    reviewedBy: null,
    meta: { model: meta.model ?? null, images: meta.images ?? null, ms: meta.ms ?? null },
  };
}

/** One { value, sourceText, confidence } triple, cleaned up. */
function normaliseField(raw, multi) {
  const sourceText = text(raw?.sourceText);
  let value = multi ? stringList(raw?.value) : text(raw?.value);

  // No evidence, no value. Keeps the model from filling blanks from memory.
  if (sourceText === null) value = null;
  if (multi && Array.isArray(value) && value.length === 0) value = null;

  return {
    value,
    sourceText,
    confidence: value === null ? 0 : clampConfidence(raw?.confidence),
  };
}

function text(input) {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (trimmed === "") return null;
  // The model sometimes writes these instead of leaving the field null.
  if (/^(null|n\/a|na|none|unknown|not (specified|legible|readable|visible))$/i.test(trimmed)) return null;
  return trimmed;
}

function stringList(input) {
  const list = asArray(input)
    .map((item) => text(item))
    .filter((item) => item !== null);
  return [...new Set(list)];
}

function asArray(input) {
  return Array.isArray(input) ? input : [];
}

function clampConfidence(input) {
  const value = typeof input === "number" && Number.isFinite(input) ? input : 0;
  return Math.min(1, Math.max(0, Math.round(value * 100) / 100));
}

function newId() {
  const random = crypto.getRandomValues(new Uint8Array(5));
  return "e_" + [...random].map((byte) => byte.toString(36).padStart(2, "0")).join("").slice(0, 8);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
