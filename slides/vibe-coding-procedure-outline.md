# Slide outline — How to build an app by vibe coding

**引き継ぎメモ（日本語）**
この文書は Claude Cowork に渡すスライド設計書です。スライド本文は英語、注記も英語で統一しています。
スライドは 18 枚・30 分・UTM 工学系（学生＋教員）向け。通し事例は今日作った Banner Reader
（リポジトリ `tatarat-code/UTM-vibe-coding`、本番 `https://utm-vibe-coding.naoki-4a5.workers.dev/`）。
数字・不具合・コミットはすべて実際のものです。捏造した数値は入れないでください。

---

## 0. Deck specification

| Item | Value |
|---|---|
| Audience | UTM engineering students and faculty (CEE guest lecture context) |
| Language | English |
| Length | 30 minutes, 18 slides |
| Format | 16:9 |
| Running case | Banner Reader — photograph a conference banner / poster / exhibition panel / business card, get a searchable record |
| Closing line | "AI builds. People decide, and examine." |
| Tone | Practical procedure, not a product pitch. Every claim backed by something that actually happened |

**Visual language** (matches the live site, so the deck and the demo look like one thing)

- Background `#0f172a`, panels `#1e293b`, borders `#334155`
- Text `#e2e8f0`, muted `#94a3b8`, accent `#f59e0b`, success `#22c55e`, warning `#eab308`
- System sans for text, monospace for code and JSON
- Max ~30 words of body text per slide. Code snippets max 8 lines
- Every step slide carries the same step-number chip in the accent colour, so the audience always knows where they are on the map (slide 4)

**Out of scope for this deck** — do not add slides for these:

- Tool comparisons (Claude Code vs others), pricing, model benchmarks
- Cloudflare / OpenAI product tutorials
- "AI will replace programmers" framing
- Anything the speaker cannot demonstrate or evidence

---

## 1. Slide-by-slide outline

### Slide 1 — Title
- **Time:** 0:30
- **One message:** This is a procedure, not a trick.
- **On the slide:** Title "How to build an app by vibe coding" / subtitle "A procedure, and where the human stands in it" / speaker name and affiliation / date
- **Visual:** Dark cover, accent rule, small screenshot of the finished Banner Reader entry screen in the corner
- **Notes:** Say in one sentence that everything shown was built with this procedure in a single working day.

### Slide 2 — The claim
- **Time:** 1:00
- **One message:** AI writes the code. The engineering work moves to deciding and examining.
- **On the slide:** "AI builds. People decide, and examine." / three questions the talk answers: What do I decide? When do I examine? What do I hand to the machine?
- **Visual:** The three words **decide / build / examine** as a loop, with the human icon on decide and examine
- **Notes:** Warn them: the interesting part of this talk is not the code the AI wrote, it is the four defects the process caught.

### Slide 3 — The case: Banner Reader
- **Time:** 1:30
- **One message:** A real app, built in one day, used as the example throughout.
- **On the slide:** What it does (photo → structured record) / four types it reads (conference, research poster, exhibition panel, business card) / the rule that defines it: unreadable fields stay empty
- **Visual:** Phone mockup: sample poster on the left, resulting field cards on the right, one field visibly empty
- **Assets:** `samples/banner/poster_research.jpg`, screenshot of `/banner/entry.html`
- **Notes:** One line only on what it is. The procedure is the subject, the app is the evidence.

### Slide 4 — The map: eight steps
- **Time:** 1:30
- **One message:** Vibe coding has a shape. Here it is.
- **On the slide:** numbered list, one line each
  1. Decide what it is — and what it will never do
  2. Write requirements you can test
  3. Design the data before the screens
  4. Prepare the ground before the first prompt
  5. Hand over in writing
  6. Build in stages that can stop anywhere
  7. Verify against your own criteria
  8. Ship, then design for the next change
- **Visual:** Horizontal 8-step rail; steps 1–5 marked "human decides", 6 "AI builds", 7–8 "human examines"
- **Notes:** Point out that five of eight steps happen before any code is generated.

### Slide 5 — Step 1: Decide what it is, and what it will never do
- **Time:** 2:00
- **One message:** The exclusions define the product more than the features do.
- **On the slide:** Banner Reader's one sentence: "Turn photographs taken at conferences into a searchable record." / Explicitly not doing: interpretation, recommendation, evaluation, translation, image storage, audience participation
- **Visual:** Two columns — "Does" (short) vs "Will not do" (longer), the second column emphasised
- **Notes:** An AI will happily add recommendation features. Ruling them out on day one is what stops a demo from drifting into a different product.

### Slide 6 — Step 2: Write requirements you can test
- **Time:** 2:00
- **One message:** If you cannot state the acceptance criteria, you cannot judge what the AI gives you.
- **On the slide:** The shape used: FR-01…FR-28 with MUST / SHOULD / COULD, NFR-01…NFR-11, AC-01…AC-10 / one real example of each:
  - `FR-11 (MUST): unreadable fields stay null — no inference`
  - `NFR-06: images are never stored on the server`
  - `AC-03: given a deliberately blurred field, the output stays empty`
- **Visual:** Fragment of the real requirements table, with FR-11 and AC-03 highlighted
- **Assets:** `banner_reader/UTM_demo_banner_reader_requirements.md`
- **Notes:** Numbering matters: it lets you and the AI refer to the same rule later. The prompt in step 5 cites FR-11 by name.

### Slide 7 — Step 3: Design the data before the screens
- **Time:** 2:00
- **One message:** The data structure is the decision that everything else inherits.
- **On the slide:** the triple, as code:
  ```json
  { "value": "±0.5 °C", "sourceText": "Accuracy ±0.5 °C", "confidence": 0.95 }
  ```
  Why: a value without its evidence cannot be checked by a person. No `sourceText` → no `value`.
- **Visual:** The JSON on the left; on the right, the same field as it appears on screen, with the sourceText line under it
- **Notes:** This one structure is what makes the "examine" half of the talk possible at all.

### Slide 8 — Step 4: Prepare the ground before the first prompt
- **Time:** 1:30
- **One message:** Set up the ground so that generated code can be run, deployed and checked within a minute.
- **On the slide:** Repository and automatic deploy on push / secrets in the platform, never in the repo or the prompt / storage binding ready / **sample data with known answers, including deliberate traps**
- **Visual:** Pipeline strip: `commit → push → build → live URL (1–2 min)`
- **Notes:** The traps: one sample poster has its funding box deliberately blurred, and one business card has a decorative QR code that cannot be decoded. Both exist so that a wrong answer is visible.

### Slide 9 — Step 5: Hand over in writing
- **Time:** 2:30
- **One message:** The prompt is a specification, not a wish.
- **On the slide:** the six parts of the handover document
  1. What to read first, and which document wins in a conflict
  2. Confirmed environment facts (URL, bindings, what already exists)
  3. Implementation order, and where it is allowed to stop
  4. Absolute rules ("unreadable stays null", "do not store images", "do not touch these files")
  5. How to verify, with which data
  6. Process: commit per stage, English messages, **ask before changing the spec**
- **Visual:** The real handover prompt as a page, with the six parts called out in the margin
- **Assets:** `banner_reader/handover_prompt.md`
- **Notes:** Read rule 1 aloud: forbidding inference is a product feature here, not a safety rail.

### Slide 10 — Step 6: Build in stages that can stop anywhere
- **Time:** 2:00
- **One message:** Order the work so that every stopping point is a working product.
- **On the slide:** the eight build stages, with stage 4 marked "demo works from here" / one commit per stage / real commit list (6 commits, one working day)
- **Visual:** Staircase; a flag on stage 4; the real `git log --oneline` beside it
- **Notes:** Time ran out on nothing today, but the schedule assumed it would. That is why stage 4 was the deadline, not stage 8.

### Slide 11 — Step 7: Verify against your own criteria
- **Time:** 2:30
- **One message:** Run the real data and check the case where the answer should be empty.
- **On the slide:** Results from the four samples:
  - type detected correctly 4/4, confidence 0.95
  - blurred funding box → `null`, with "funding and acknowledgements text blurred" recorded as unreadable
  - units preserved, unrounded: `±0.5 °C`, `-40 - 250 °C`, `2,000 m`, `24 V DC, 18 W`
  - response time 7.6 s – 19.6 s for one image, 15.4 s for two
- **Visual:** The empty field card, large, next to the blurred region of the poster
- **Notes:** An empty field is the hardest output to get from a language model and the easiest to verify. Test that first.

### Slide 12 — What examination actually caught
- **Time:** 2:00
- **One message:** Four defects, none of them visible in code that looked correct.
- **On the slide:**
  1. Japanese text silently translated into English in the value, and two Japanese bullet points dropped — broke the "keep the original language" rule
  2. Saving a record wiped every field — the save path read the wrong shape
  3. Two of five saved records vanished from the list — a shared index document lost updates under eventual consistency
  4. A hidden button stayed visible — a CSS rule outranked the `hidden` attribute
- **Visual:** Four cards, each with "looked fine" → "actually did"
- **Notes:** Defects 1 and 3 would both have appeared on stage, in front of the audience. Neither would have been found by reading the code.

### Slide 13 — Rules in code, not only in the prompt
- **Time:** 1:30
- **One message:** A rule you can only ask for is a rule you do not have.
- **On the slide:** The prompt says "no value without evidence". The server enforces it: any value that arrives without `sourceText` is dropped before the record is returned. A correction made by a person is the one exception, and it is marked as such.
- **Visual:** Two layers: "asked for" (prompt) above, "enforced" (server) below, with the arrow of trust pointing down
- **Notes:** This is the general lesson: put the rule where it cannot be talked out of.

### Slide 14 — Step 8: Ship, and check in production
- **Time:** 1:30
- **One message:** It is not done until it is checked on the real URL, on the real device.
- **On the slide:** push → automatic deploy (1–2 min) → run the same samples against the live URL → check on the phone that will actually be used
- **Visual:** Phone showing the live site, with the production URL visible
- **Notes:** The deploy pipeline is part of the system. Rehearse it on the device that will actually be used, not only on the laptop it was written on.

### Slide 15 — Design for the change that happens on stage
- **Time:** 2:00
- **One message:** In AI-assisted work, the cost of a change is set by how many places define the same thing.
- **On the slide:** Adding a whole new extracted field = **one line in one file**, because the field list is the single source of truth for the schema, the prompt, the validation and the screen.
  ```js
  f("instruments", "Instruments and software", "…", MULTI),
  ```
  Same photograph, read again → a field that was not there before is filled.
- **Visual:** Before/after of the same poster's record, the new field highlighted
- **Notes:** This is the live demo. Say the design decision out loud: it was made on day one specifically so this would take one line.

### Slide 16 — What the machine must not do
- **Time:** 1:30
- **One message:** Deciding what not to record is engineering work, not paperwork.
- **On the slide:** No guessing (empty stays empty) / no images kept on the server / records expire after 24 hours / delete always available / evidence stored beside every value / no decoding QR codes or logos
- **Visual:** Six short rules as a checklist, in the muted palette with accent ticks
- **Notes:** A tool that reads whatever is in front of it creates a duty to decide what it should read. Business cards make this concrete.

### Slide 17 — Pitfalls
- **Time:** 1:30
- **One message:** These are the ways this procedure fails in practice.
- **On the slide:**
  - Judging output by whether it looks plausible, instead of against known answers
  - Letting the AI write both the code and the acceptance criteria
  - A plan with no working stopping point
  - Secrets in the repository or in the prompt
  - Treating a prompt instruction as a guarantee
  - One large commit, nothing to roll back to
  - Letting the specification change silently during generation
- **Visual:** Plain list, each item with a small ✕ in the warning colour
- **Notes:** Every one of these was hit at some point by someone; two were hit today and are on slide 12.

### Slide 18 — Close
- **Time:** 1:00
- **One message:** The work moved, it did not disappear.
- **On the slide:** "AI builds. People decide, and examine." / What stayed human: the one sentence, the exclusions, the data structure, the acceptance criteria, the judgement about what not to record
- **Visual:** The loop from slide 2, now annotated with the eight steps
- **Notes:** End on the question rather than the tool: in your own project, what would you write down before you asked for the first line of code?

---

## 2. Assets to gather before building the deck

| Asset | Where | Used on |
|---|---|---|
| Sample research poster (blurred funding box) | `samples/banner/poster_research.jpg` | 3, 11, 15 |
| Sample exhibition panel (bilingual, units) | `samples/banner/poster_exhibition.jpg` | 11, 12 |
| Screenshot: entry screen with an empty field | capture from `/banner/entry.html` | 3, 11 |
| Screenshot: list screen with type tabs | capture from `/banner/list.html` | 14 |
| Requirements document | `banner_reader/UTM_demo_banner_reader_requirements.md` | 6 |
| Handover prompt | `banner_reader/handover_prompt.md` | 9 |
| Commit list (6 commits) | `git log --oneline` | 10 |
| Field definition file | `src/banner/schema.js` | 15 |

Screenshots should be taken at phone width (375 px) so the deck shows the product as it is actually used.

## 3. Numbers that must stay accurate

- 4 sample images, all four types detected correctly, type confidence 0.95
- Response time: 7.6 s (business card) to 19.6 s (research poster) for one image; 15.4 s for two
- 6 commits, one working day, stage 4 of 8 was the point where the demo became possible
- 4 defects found by verification (slide 12)
- Adding a new extracted field: 1 line in 1 file; the re-read returned 10 items that were not in the record before

## 4. Notes for Cowork

- Build 18 slides in the order above; do not merge or split steps, the map on slide 4 must match the step chips exactly
- Keep body text short; the speaker talks, the slide anchors
- Code and JSON go in a monospace block on a panel background, never as an image of code
- Slides 11, 12 and 15 are the evidence of the talk — give them the most visual room
- If a slide needs more than 30 words to work, the message is wrong, not the word limit
