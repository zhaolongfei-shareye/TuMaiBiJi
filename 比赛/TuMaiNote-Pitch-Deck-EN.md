# TuMaiNote — AI Agent for Personal Knowledge Management

## Pitch Deck Document

---

## 1. The Problem

People save content constantly — articles into bookmarks, screenshots into photo albums, links into chat histories. But **saved ≠ usable**. When they need to reference something later, they remember "I saw it" but not "where I put it." Even when found, they have to re-read the entire piece to extract the key point.

**The core gap:** Bookmarks save entry points, not content. Screenshots preserve visuals but the text inside isn't searchable. The more sources you have, the higher the cost of finding and reusing information.

And every note-taking app starts with a blank editor — asking users "what do you want to write?" — when in reality, users already have someone else's content in hand.

---

## 2. The Solution

**TuMaiNote** is a cross-platform AI knowledge management tool — currently live as a WeChat Mini Program (China), with a native iOS app in development for global rollout. It transforms links, screenshots, and handwritten notes into structured knowledge cards — and makes those cards shareable, printable, and scannable across any social platform.

**One-liner:** We move the starting point of note-taking from a blank page to the content users already have, and turn every note into a visual card that bridges physical and digital worlds — across WeChat, Instagram, X, Xiaohongshu, and beyond.

### Three Input Channels

| Channel | How It Works |
|---------|-------------|
| **Link → Note** | Paste a URL → backend extracts article body → AI summarizes → structured note created with source attribution |
| **Screenshot → Note** | Import up to 9 images → self-hosted OCR (RapidOCR) extracts text → same AI summarization pipeline → structured note |
| **Handwrite** | Title + body typed by the user → same AI summarization pipeline for the summary (since Oct 4, 2026). The user's own title is kept, the model's suggested title is not used here, and the original text is stored verbatim. This channel adds a content-safety check before queueing, because the text is the user's own writing |

All three channels converge into a unified note structure: **Title + Summary (2-3 sentences) + Key Points (3-8) + Tags (3-6)**.

---

## 3. AI Agent Architecture

TuMaiNote is not just a wrapper around an LLM. It is a **multi-stage AI agent** that orchestrates data collection, preprocessing, transformation, and output generation.

### Pipeline

```
User Input (Link / Screenshot / Handwrite)
    ↓
[Ingestion Layer]
    ├── Link: trafilatura extraction → content validation
    ├── Screenshot: RapidOCR (ONNX Runtime, CPU) → text extraction
    └── Handwrite: content-safety check → summarization (user's own title kept)
    ↓
[Preprocessing]
    ├── URL validation & anti-abuse gates
    ├── Image pixel limit (40MP cap, 1600px resize)
    ├── Content truncation (12,000 char limit)
    └── Redis/RQ async task queue
    ↓
[AI Summarization — Tencent Hunyuan]
    ├── Temperature: 0.3 (deterministic output)
    ├── Exponential backoff retry (1s, 2s, 4s; max 4 attempts)
    ├── Graceful degradation: on failure → raw text + "AI summary unavailable"
    └── Model can be toggled off entirely — product still works
    ↓
[Structured Output]
    Title + Summary + Key Points + Tags → stored in user's note library
    ↓
[Card Generation — 10 Templates]
    ├── Canvas-based adaptive layout (measure → draw)
    ├── Auto-height based on content volume
    ├── Category-driven color assignment (22 palettes, 6 style groups)
    └── QR code on every card → public abstract page
```

### Key Design Decisions

- **Graceful degradation is non-negotiable**: AI failure must never destroy successfully extracted content
- **Self-hosted OCR**: No third-party OCR API dependency; runs on own server CPU
- **Server-side API key**: Model calls go through backend with auth, not client-side
- **Content safety**: WeChat msgSecCheck for shared content, with fail-open disclosure

---

## 4. Product Differentiation

### Innovation 1: Recording Start Point Shift

Traditional note apps: blank page → user writes.
TuMaiNote: existing content → AI structures it → user refines.

This is not incremental UX — it fundamentally changes the user's starting state from "what do I write?" to "here's what I found, let me organize it."

### Innovation 2: Knowledge as Visual Social Asset

Every note can be rendered as one of **10 distinct card templates**:

- **4 Classic** (clarity-first): Jade Paper, Verse Slip, Layered Paper, Vertical Letter
- **6 Expressive** (share-worthiness): Pop Panels, Ben-Day Comic, Acid Gradient, Magazine Cover, Paper & Ink, Spec Sheet

Cards are not the same layout recolored — each has unique composition logic. Pop Panels repeats one de-saturated portrait in four duotone panels; Ben-Day Comic uses halftone dots with an offset title; Vertical Letter sets the note in right-to-left columns on rice-paper stock.

**The QR code on every card** bridges physical → digital: scan it to see the note's public abstract page (not the author's private library). This creates a viral loop: card shared → someone scans → saves to their own library → generates their own cards.

### Card Technical Details

- Canvas renders at 750px width, height auto-calculated from content (706px to 1320px)
- Minimum font size 56px, maximum 82px (quote template)
- Aspect ratios fall in 4:5 to 9:16 — optimized for social media feeds
- 4 wallpaper themes (UI-level: Ivory, Celadon, Blush, Mist) + 22 poster palettes (card-level, 6 style groups), independently controlled; all four themes persist to the account
- Category auto-selects color — users never manually pick

---

## 5. Cross-Platform Strategy: China + Global

### Current: WeChat Mini Program (China)

The WeChat Mini Program serves the Chinese market with zero-install friction, native sharing to WeChat conversations and Moments, and QR code as a first-class interaction pattern.

### Next: Native iOS App (Global)

The iOS app extends the same core experience to global users, with platform-native capabilities that unlock the full social media ecosystem:

| Capability | WeChat Mini Program | iOS App |
|-----------|-------------------|---------|
| **Card export** | Save to album | Save to album + Share Sheet |
| **QR scan** | WeChat native scan | Camera + universal link |
| **Shared content** | Mini Program page | H5 URL (any browser) |
| **Social sharing** | WeChat only | Instagram, X, TikTok, Xiaohongshu, WhatsApp, Telegram, etc. |
| **One-click save** | In-app only | iOS Share Extension → save from any app |
| **Card dimensions** | Fixed 750px width | Adaptive per platform |

### Platform-Adaptive Card Sizing

Every note can be exported as a card sized for each target platform — same content, optimal dimensions:

| Platform | Aspect Ratio | Resolution | Use Case |
|----------|-------------|------------|----------|
| Instagram Feed | 4:5 | 1080×1350 | Main feed posts |
| Instagram Story | 9:16 | 1080×1920 | Full-screen stories |
| X (Twitter) | 16:9 | 1200×675 | Timeline cards |
| Xiaohongshu | 3:4 | 1080×1440 | Note-style posts |
| WeChat Moments | 1:1 | 1080×1080 | Square format |
| Print | A4 ratio | 2480×3508 | Physical cards, journals |

The template engine measures content volume once, then renders into each platform's frame — no manual resizing, no duplicate work.

### QR Code → H5 Universal Link

Every card carries a QR code that resolves to an **H5 URL** (not a platform-locked page). This means:

- **Any camera** can scan it — WeChat, iOS Camera, Android Camera, third-party scanners
- **Any browser** can open it — Safari, Chrome, in-app browsers
- **iOS users** see a "Save to TuMaiNote" button that triggers one-click import via Universal Link or Share Extension
- **The public page** shows the note's title, summary, key points, and tags — not the author's private library

This is the bridge between physical cards and digital content, between Chinese and global ecosystems, between any social platform and the TuMaiNote knowledge base.

### iOS Share Extension: One-Click Import

The iOS Share Extension lets users save content from **any app** directly into TuMaiNote:

- Safari → share article URL → auto-extract and summarize
- Photos → share screenshot → auto-OCR and structure
- X / Instagram / TikTok → share post link → extract and save
- Any text → share to TuMaiNote → direct handwrite entry

This turns every app on the phone into a potential input channel, not just the three channels inside the Mini Program.

---

## 6. Business Model

### Current State

- **No paywall, no membership, no per-use charges** — all 10 templates free
- **Notes are unlimited.** The old hard gate ("100 notes per user, the 101st rejected") was removed on Oct 1, 2026 — `app/core/quota_gate.py` deleted
- "100" now means only one thing: the **starting value of the MIND credit** shown on the profile page, not a storage ceiling
- MIND credits: **+10** for a new writer who actually writes their own first note; **+1** whenever someone saves one of your notes into their own library (same person, same note counts once)
- No global cap, no expiry, and nothing to "free up" by deleting — because there is no ceiling

### Why This Works

The free model is a growth engine, not a cost center:
1. Every shared card is an acquisition channel (QR code → public page → "Save to my notes")
2. MIND credit growth is tied to organic referrals, not payment — and it never gates storage, so it is a scoreboard rather than a paywall substitute
3. Zero friction maximizes the viral coefficient of card sharing

### Future Revenue Directions (Not Yet Implemented)

- **Brand collaboration templates**: Brands provide visual assets, product provides content structure, users get branded knowledge cards. Limited edition co-branded card templates.
- This is directional thinking only — no brand partnerships exist, no timeline committed.

---

## 7. Technology Stack

| Layer | Technology |
|-------|-----------|
| China Frontend | WeChat Native Mini Program |
| Global Frontend | iOS Native App (Swift/SwiftUI) — in development |
| Web | H5 public pages (universal link target) |
| Backend | FastAPI (Python), self-hosted |
| AI Model | Tencent Hunyuan (hy3-preview) via Cloud Function |
| OCR | RapidOCR + ONNX Runtime (self-hosted, CPU) |
| Task Queue | Redis + RQ (async processing) |
| Content Extraction | trafilatura (open-source) |
| Database | SQLite (current), PostgreSQL-ready |
| Cloud | Tencent CloudBase (cloud functions, hosting) |
| Object storage | Tencent CloudBase storage, **uploaded directly from the mini program client** — note images, rendered cards and profile-card images; only the client can delete objects |
| iOS Distribution | App Store (global) |

### Platform AI Advantage

WeChat Cloud Development provides not just model access but integrated auth, deployment, and maintenance infrastructure — critical for solo developers who cannot afford dedicated ML ops.

The project leveraged Tencent's Growth Program free tier (1 billion tokens, valid until 2027-03-18) for prototype validation. Actual usage has been tracked and confirmed deducting from this free pool.

---

## 8. Market Opportunity

### Target Users

- **Knowledge workers** who consume 10+ articles/day and lose track of what they've read
- **Content creators** who need to transform research into shareable formats
- **Students and researchers** who screenshot references but never organize them
- **Anyone** who has ever bookmarked something and never found it again

### Why Start with WeChat, Then Go Global

- **WeChat**: 1.3 billion MAU, zero install friction, QR code as first-class citizen, Cloud Development reduces infrastructure cost to near-zero
- **iOS/Global**: 1+ billion active iOS devices, native Share Sheet integration with Instagram/X/TikTok, App Store discovery, Apple ecosystem trust

### Competitive Landscape

- Traditional note apps (Notion, Bear, Apple Notes): start from blank page, no AI summarization of external content, no visual card output
- Read-later apps (Pocket, Instapaper): save but don't transform, no card generation
- AI writing tools (Jasper, Copy.ai): generate new content, don't organize existing content

**TuMaiNote's position**: the intersection of content ingestion + AI structuring + visual output + social distribution. No direct competitor occupies all four.

---

## 9. Traction & Validation

### Development Velocity

- First runnable loop: September 17, 2026
- Card templates, save-to-library flow and the original credit rules closed out: September 24, 2026
- **Phase 2 (Oct 2–11, 2026) — "your stuff is still yours"**: note images kept with the note and read back in place, card renders archived to cloud storage, profile card (four image slots, name, chosen layout, background brightness) stored on the account and restored on a new device, plus a rebuilt first screen
- **A decision made in phase 1 was overturned in phase 2**: the 100-note ceiling was removed on Oct 1. Earlier decisions are not presented as permanent.
- **Live release**: v2.0.0 published Oct 8, 2026 (verified on the platform console); v2.1.8 submitted for review Oct 11, 2026. ICP filing for the mini program is approved.
- **One week to the first complete product**, solo developer with AI-assisted coding; two more phases of hardening since

### Testing Coverage

- Backend tests: collection pipeline, model failure, user isolation, MIND credits/invitations, account deletion, share snapshots, cross-user save activation, input constraints
- Client tests: WeChat DevTools + miniprogram-automator for interaction verification
- Mutation testing + live probes against the production API — used specifically to check whether a test really guards the rule it names
- A pre-submission code audit (Oct 11) fixed 8 findings, 2 of which could have deleted a user's only copy of a file

### Honest Boundaries

- No claimed user scale numbers
- No claimed accuracy percentages
- Interface screenshots are local dev artifacts, not production user data
- OCR quality depends on image clarity, layout complexity, and font size
- iOS app is in development — not yet shipped

---

## 10. Team

**Solo founder** with product management background, extending into full-stack development:

- Product decisions + UX/UI design + engineering + deployment + verification — all owned by one person
- AI-assisted development using Qoder and other coding tools (disclosed)
- This structure connects requirement judgment directly to implementation feedback, enabling rapid iteration

### AI-Assisted Development Disclosure

Development used AI coding assistants for repository search, code drafting, cross-file modifications, testing, and copywriting. The founder owns all requirement decisions, code review, runtime verification, and final submission responsibility. AI assistance ≠ automatic correctness.

---

## 11. The Ask

We are exploring pre-seed funding to:

1. **Ship iOS app**: Complete native iOS development and launch on the App Store for global distribution
2. **Scale infrastructure**: Move from free-tier cloud functions to dedicated compute for OCR and model inference
3. **Expand template ecosystem**: Commission professional designers for premium card templates
4. **Grow distribution**: Optimize the viral loop from card sharing → QR scan → new user acquisition across WeChat and global social platforms

### Use of Funds

| Area | Allocation |
|------|-----------|
| iOS app development (2-3 hires) | 35% |
| Infrastructure (compute, storage, CDN) | 30% |
| Design & template ecosystem | 15% |
| Growth & marketing | 20% |

---

## 12. Contact

**Product**: TuMaiNote (图麦笔记)
**Platforms**: WeChat Mini Program (live) + iOS App (in development)
**Stage**: MVP complete, in active use
**Website**: agentsbin.cn

---

*This document is based on the product as of October 2026. All claims are verified against local source code and production logs. Capabilities described as "directional" or "future" are not yet implemented.*
