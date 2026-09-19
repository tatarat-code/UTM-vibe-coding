# UTM Vibe Coding Demo

Live demo site for the guest lecture at UTM Centre for Engineering Education (21 Sep 2026):
**"Vibe coding is a new way of making things"** — AI builds. People decide, and examine.

Pipeline: **Claude Code → GitHub → Cloudflare Workers**

## Structure

```
public/        static site (served as-is by Cloudflare)
src/index.js   Worker handling /api/*
wrangler.jsonc Cloudflare configuration
```

## Lecture roadmap

| Step | Feature | Endpoint |
|------|---------|----------|
| 0 | Website (this) | `/`, `/api/health` |
| 1 | Voice AI chat | `/api/chat` |
| 2 | Rubric builder | `/api/rubric` |
| 3 | Rubric-based grading | `/api/grade` |

## Local development

```powershell
npm install
npx wrangler login        # first time only
npx wrangler dev          # http://localhost:8787
```

Put the API key for local dev in `.dev.vars` (git-ignored):

```
OPENAI_API_KEY=sk-ant-...
```

## Deploy

```powershell
npx wrangler deploy
```

Production secret (set once):

```powershell
npx wrangler secret put OPENAI_API_KEY
```

After connecting the GitHub repository in the Cloudflare dashboard
(Workers & Pages → utm-vibe-coding → Settings → Build), every push to `main` redeploys automatically.
