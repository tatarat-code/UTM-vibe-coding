/**
 * UTM CEE Guest Lecture — live demo Worker
 *
 * Static files live in public/ and are served automatically by Cloudflare.
 * Only requests under /api/* reach this code.
 *
 * Roadmap for the lecture (each step is added live with Claude Code):
 *   Step 1 — /api/chat      : voice-enabled AI chat
 *   Step 2 — /api/rubric    : rubric authoring assistant
 *   Step 3 — /api/grade     : rubric-based grading of submissions
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({
        ok: true,
        service: "utm-vibe-coding",
        time: new Date().toISOString(),
      });
    }

    return json({ error: "Not found", path: url.pathname }, 404);
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
