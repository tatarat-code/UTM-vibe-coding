/**
 * OpenAI Responses API wrapper.
 *
 * Deliberately free of Banner Reader specifics: the rubric (step 2) and
 * grading (step 3) demos are expected to call this same helper.
 *
 * The key lives in env.OPENAI_API_KEY:
 *   production — npx wrangler secret put OPENAI_API_KEY
 *   local dev  — .dev.vars (git-ignored)
 */

const API_URL = "https://api.openai.com/v1/responses";

export const DEFAULT_MODEL = "gpt-4.1-mini";

export class OpenAIError extends Error {
  constructor(message, status = 502, detail = null) {
    super(message);
    this.name = "OpenAIError";
    this.status = status;
    this.detail = detail;
  }
}

/**
 * Ask the model for JSON that conforms to `schema` (Structured Outputs, strict).
 *
 * @param {object} env          Worker env (needs OPENAI_API_KEY)
 * @param {object} options
 * @param {string} options.instructions   System-level instructions
 * @param {Array}  options.input          Responses API input array
 * @param {string} options.schemaName     Name of the JSON schema
 * @param {object} options.schema         JSON schema (must be strict-compatible)
 * @param {string} [options.model]
 * @param {number} [options.temperature]
 * @param {number} [options.maxOutputTokens]
 * @returns {Promise<{data: object, model: string, usage: object|null}>}
 */
export async function respondJson(env, options) {
  const {
    instructions,
    input,
    schemaName,
    schema,
    model = DEFAULT_MODEL,
    temperature = 0.1,
    maxOutputTokens = 12000,
  } = options;

  if (!env.OPENAI_API_KEY) {
    throw new OpenAIError("OPENAI_API_KEY is not configured on this Worker", 500);
  }

  const body = {
    model,
    instructions,
    input,
    temperature,
    max_output_tokens: maxOutputTokens,
    text: {
      format: {
        type: "json_schema",
        name: schemaName,
        strict: true,
        schema,
      },
    },
  };

  let response;
  try {
    response = await fetch(API_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new OpenAIError(`Could not reach the OpenAI API: ${error.message}`, 502);
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.error?.message ?? `OpenAI API returned ${response.status}`;
    throw new OpenAIError(message, response.status === 429 ? 429 : 502, payload?.error ?? null);
  }

  if (payload?.status === "incomplete") {
    const reason = payload?.incomplete_details?.reason ?? "unknown reason";
    throw new OpenAIError(`The model stopped before finishing (${reason})`, 502);
  }

  const text = extractOutputText(payload);
  if (!text) {
    throw new OpenAIError("The model returned no text output", 502);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new OpenAIError("The model returned text that is not valid JSON", 502);
  }

  return { data, model: payload?.model ?? model, usage: payload?.usage ?? null };
}

/** Collect the text of the model's message, or throw if it refused. */
function extractOutputText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.length > 0) {
    return payload.output_text;
  }

  const parts = [];
  for (const item of payload?.output ?? []) {
    if (item?.type !== "message") continue;
    for (const piece of item?.content ?? []) {
      if (piece?.type === "output_text" && typeof piece.text === "string") {
        parts.push(piece.text);
      } else if (piece?.type === "refusal") {
        throw new OpenAIError(`The model declined to answer: ${piece.refusal}`, 502);
      }
    }
  }
  return parts.join("");
}

/** Build an input_image content item from raw bytes. */
export function imageContent(bytes, mimeType = "image/jpeg", detail = "high") {
  return {
    type: "input_image",
    detail,
    image_url: `data:${mimeType};base64,${toBase64(bytes)}`,
  };
}

/** ArrayBuffer/Uint8Array -> base64, in chunks so large images do not blow the stack. */
export function toBase64(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
