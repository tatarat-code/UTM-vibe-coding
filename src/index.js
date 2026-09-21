/**
 * UTM CEE Guest Lecture — live demo Worker
 *
 * Static files live in public/ and are served automatically by Cloudflare.
 * Only requests under /api/* reach this code.
 *
 * Roadmap for the lecture (each step is added live with Claude Code):
 *   Banner Reader — /api/banner/* : photo of a poster or banner -> structured record
 *   Step 2 — /api/rubric    : rubric authoring assistant
 *   Step 3 — /api/grade     : rubric-based grading of submissions
 */

import { handleLiveSession } from "./live.js";
import { handleGrade, rubric } from "./grade.js";
import { handleSubmissions } from "./submissions.js";
import { handleCapture } from "./banner/capture.js";
import { handleEntries } from "./banner/entries.js";
import { handleExport } from "./banner/exporter.js";
import { buildFieldManifest } from "./banner/schema.js";

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

    // Step 1 — voice conversation. Mints a short-lived token for the browser.
    if (url.pathname === "/api/live/session") {
      return handleLiveSession(request, env);
    }

    // Step 2 — grading against the rubric in samples/rubric.json.
    if (url.pathname === "/api/grade") {
      return handleGrade(request, env);
    }

    if (url.pathname === "/api/rubric") {
      return json(rubric);
    }

    if (url.pathname === "/api/submissions" || url.pathname.startsWith("/api/submissions/")) {
      return handleSubmissions(request, env, url);
    }

    // Banner Reader. Everything for it lives in src/banner/.
    if (url.pathname === "/api/banner/capture") {
      return handleCapture(request, env);
    }

    if (url.pathname === "/api/banner/schema") {
      return json(buildFieldManifest());
    }

    if (url.pathname === "/api/banner/entries" || url.pathname.startsWith("/api/banner/entries/")) {
      return handleEntries(request, env, url);
    }

    if (url.pathname === "/api/banner/export") {
      return handleExport(request, env, url);
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
