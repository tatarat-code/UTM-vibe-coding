/**
 * Voice conversation — the server side.
 *
 * The browser needs credentials to open a WebRTC call with the model, but
 * OPENAI_API_KEY must never reach it. So the Worker mints a short-lived client
 * token instead: it expires in about a minute and carries the session's whole
 * configuration, which the browser therefore cannot change.
 *
 * Endpoint choice: gpt-live-1 is reachable over both the Live endpoint and the
 * Realtime endpoint, and it is the Realtime one that documents a browser WebRTC
 * flow (POST the SDP offer to /v1/realtime/calls). Verified against the API:
 * minting with model gpt-live-1 returns 200 with the token in "value".
 */

const CLIENT_SECRETS_URL = "https://api.openai.com/v1/realtime/client_secrets";

export const LIVE_MODEL = "gpt-live-1";

// Voices the Realtime endpoint accepts: alloy, ash, ballad, coral, echo, sage,
// shimmer, verse, marin, cedar. (The Playground's "Gleam" is not among them.)
export const LIVE_VOICE = "cedar";

const INSTRUCTIONS = [
  "You are the UTM MOT teaching assistant.",
  "In your first words, introduce yourself as \"the UTM MOT teaching assistant\".",
  "You help students on a graduate course on management of technology at UTM.",
  "Always answer in English, even if the user speaks another language.",
  "Keep answers short: two or three sentences unless asked for more.",
].join(" ");

export async function handleLiveSession(request, env) {
  if (request.method !== "POST") {
    return json({ error: "Use POST" }, 405);
  }

  if (!env.OPENAI_API_KEY) {
    return json({ error: "OPENAI_API_KEY is not configured on this Worker" }, 500);
  }

  const session = {
    type: "realtime",
    model: env.LIVE_MODEL || LIVE_MODEL,
    instructions: INSTRUCTIONS,
    audio: {
      // Transcribing the student's side too, so the page can show both halves
      // of the conversation — the audience reads what the microphone heard.
      input: { transcription: { model: "gpt-4o-mini-transcribe" } },
      output: { voice: env.LIVE_VOICE || LIVE_VOICE },
    },
  };

  let response;
  try {
    response = await fetch(CLIENT_SECRETS_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ session }),
    });
  } catch (error) {
    return json({ error: `Could not reach the OpenAI API: ${error.message}` }, 502);
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.value) {
    const message = payload?.error?.message ?? `The token service returned ${response.status}`;
    return json({ error: message }, response.status === 429 ? 429 : 502);
  }

  // Only the short-lived token and the details the page displays.
  return json({
    value: payload.value,
    expires_at: payload.expires_at ?? null,
    model: session.model,
    voice: session.audio.output.voice,
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
