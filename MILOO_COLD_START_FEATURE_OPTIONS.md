# Miloo Chat — Cold Start: 3 Feature Options

**Author:** AI Product Manager
**Date:** 2026-03-06
**Status:** Decision document — pick one to ship this sprint
**Constraint:** $0 marketing spend; must use what we already have

---

## Problem statement

Miloo Chat suffers from a **classic two-sided cold start**: when a user lands, the
waiting queue is usually empty, they stare at a spinner for 10–60s, then leave.
Every departure makes the next user's wait longer, so the active-user count
hovers near zero. The current `find_match` flow in `server/index.js` uses tiered
matching (mood × mode), which is correct *given* a queue — but the queue is
the bottleneck.

**North-star metric (NSM):** % of sessions that reach a `chat_started` event
within 30 seconds of `find_match`.

**Guardrail:** Time-to-first-message with a *real* user must NOT regress.

---

## Codebase context (what we already have)

- `client/src/pages/ChatRoom.jsx` — already implements a **Milo AI companion**
  that activates after ~10s of waiting and posts to `/api/milo`
- `server/index.js` lines 646–710 — `/api/milo` endpoint on **Groq**
  (`llama-3.3-70b-versatile`), rate-limited at 30 req/min/IP, with a detailed
  `MILO_SYSTEM` prompt (multilingual EN/HI/Hinglish, 1–2 sentence replies)
- Tiered matching (mood × mode), trust scores, anti-spam, slow_down, reconnect
  codes, TURN credentials, GA analytics via `trackEvent` already wired
- Moods: deep / laugh / vent / music / gaming / culture / any
- Modes: text, video (audio-fallback inside)

This means **Option 1 is a 70%-built feature** — not a greenfield build.

---

## Option 1 — Milo 2.0: AI Companion Backup ⭐ RECOMMENDED

> "If a real user isn't found in 15s, drop them into a natural chat with Milo
> until a real match shows up. Hand off seamlessly."

### What ships
1. **Lower Milo trigger from 10s → 8s** for text mode, keep 15s for video mode
   (camera permission takes time — don't interrupt it).
2. **Proactive icebreakers from Milo** matched to the user's selected mood
   ("If you were a song right now, which one?", etc.).
3. **Handoff protocol** — when `match_found` fires while Milo is active, Milo
   says a 1-line goodbye, partner joins after a 1.8s grace, conversation
   history with Milo is hidden (not erased) so the user can scroll up.
4. **Milo personality switch** — choose 3 personas (Milo / Mira / Jax) at
   signup-free first run, stored in `localStorage`.
5. **Optional: swap Groq → Claude (Anthropic) API** for higher-quality replies.
   The current Groq endpoint is the same shape; only the SDK call changes.
6. **Rate-limit per session** (not per IP) to stop one user from burning the
   free tier. 20 messages / 10 min / fingerprint.

### Hypotheses
- **H1:** Keeping a user engaged for the 15–90s wait window will increase
  `chat_started` rate by ≥30% because users stop rage-quitting.
- **H2:** Users who talked to Milo for >30s before being matched will rate
  the eventual real partner **higher** (warm-up effect).

### KPIs
| KPI | Baseline (no Milo) | Target (with Milo 2.0) |
|---|---|---|
| 30s `chat_started` rate | ~12% (estimate) | ≥40% |
| Median session length | ~45s | ≥90s |
| 7-day return rate | TBD | +20% rel. |
| Milo → real-match handoff rate | n/a | ≥35% of Milo sessions |

### Risks
- **Cost blow-up** if a user stays 30 min with Milo → cap with per-session
  rate-limit + a soft "want to keep chatting? here's a 5-min tip" wall.
- **Loneliness trap** — a user prefers Milo forever. Mitigation: cap
  consecutive Milo sessions at 5 before nudging "try a real chat?"
- **Tone drift** if model returns cringe/unsafe. Mitigation: stronger
  system prompt, output moderation pass, `isSuspiciousMessage`-style filter
  on Milo's replies.

### Effort
**~3–5 engineering days.** Most of the plumbing already exists. Work is in
`ChatRoom.jsx` (UI), `server/index.js` (`/api/milo` extension), and
`server/.env.example` (add `ANTHROPIC_API_KEY` if we swap).

### Why this is the right pick
- **Lowest risk, fastest ship.** Building on what works.
- **Free-tier friendly.** Groq is generous; even Claude Haiku is <$0.001/session.
- **Directly addresses the 15-second cold start** stated in the brief.
- **Doesn't compromise the 1:1 video promise** — Milo is a *bridge*, not a
  replacement.
- **Telemetry-rich** — we can measure exactly how long the wait was, what
  mood, and whether Milo → real handoff happened.

---

## Option 2 — Text-only Global Lobby

> "If 1:1 matching takes >15s, drop the user into a public group chat room
> sorted by mood/topic."

### What ships
- A new `lobby:<mood>` Socket.IO room per mood (8 rooms).
- Server-side broadcast of `lobby_message` events to all sockets in the room.
- Client-side "Global Lobby" tab in `ChatRoom` that opens after 15s of
  waiting, with a "leave lobby, keep looking for 1:1" button.
- Soft moderation: 5-message/30s limit, banned-fingerprint filter, profanity
  regex (reuse `isSuspiciousMessage`).

### Hypotheses
- **H1:** A global room gives users *something* to do during the wait and
  reduces bounce.
- **H2:** Some users will stay in the lobby instead of 1:1 — a viable
  secondary mode.

### KPIs
- Bounce rate at 15s ↓
- Lobby → 1:1 conversion %
- Average messages per lobby session
- Report rate per 100 messages

### Risks
- **Moderation at scale** — a public room needs a human-ready escalation path.
- **Troll magnet** — even with our rate limits, a single bad actor poisons
  the room vibe for everyone.
- **WebRTC framing** — Miloo's brand is 1:1 intimacy; a lobby dilutes that.
- **Harder to scope** — needs new UX (room list, side chat, leave/join),
  new server state, new moderation tooling.

### Effort
**~10–15 days.** New server module, new UI, moderation policy, abuse runbook.

### When to pick this instead
- If we have **>2K DAU** and 1:1 waits are still >30s (i.e., Milo isn't
  enough and we need genuine human density).
- If we have a content mod budget.

---

## Option 3 — Gamified Queue + Text-to-Media Previews

> "Make the queue itself entertaining: 3-question icebreaker quiz, reveal
> your match's answers when they join; show a Spotify/YouTube clip while
> waiting."

### What ships
- A 3-question "vibe card" modal after `find_match` (e.g., "pick a song that
  matches your mood", "emoji that describes your day"). Answers stored on
  socket metadata.
- A pre-match preview screen: while waiting, the user sees their own card +
  a short looping preview (Spotify 30s clip or a YouTube embed of a mood-
  matched playlist).
- On `match_found`, the partner's answers are revealed side-by-side before
  the chat opens ("Your match picked: 🎵 Blinding Lights").

### Hypotheses
- **H1:** A gamified wait feels shorter (Kouvaras "filled time" effect).
- **H2:** Revealing answers before the chat reduces awkward silence and
  increases message count in the first 60s.

### KPIs
- Wait-time *perceived* (NPS-style post-chat survey)
- First-message latency after `chat_started`
- 1:1 chat length

### Risks
- **External media deps** — Spotify/YouTube embed licensing, autoplay rules,
  and rate limits.
- **Friction** — a quiz before chat is a barrier; we lose the "no signup,
  instant" promise.
- **Doesn't fix the zero-user problem** — the wait is *entertaining*, but
  the user still leaves if no one shows in 90s.
- **High build cost** for a partial fix.

### Effort
**~8–12 days.** Heavy front-end work, media-licensing research, new server
state for answers.

### When to pick this instead
- Once we have ≥5K DAU and want to *deepen* the matching experience, not
  just plug the cold-start gap.

---

## Decision matrix

| | Option 1 (Milo 2.0) | Option 2 (Lobby) | Option 3 (Gamified) |
|---|---|---|---|
| Time to ship | 3–5 days | 10–15 days | 8–12 days |
| Engineering risk | Low (70% built) | High | Med-High |
| Brand fit (1:1 intimacy) | ✅ Bridge only | ❌ Dilutes | ✅ |
| Cost @ 1K DAU | ~$0 (Groq free) | ~$0 | ~$0 + media |
| Directly fixes 15s wait | ✅ | ✅ (partial) | ✅ (perceived only) |
| Scales beyond cold-start | ✅ Companion mode | ✅ | ✅ |
| Telemetry | High | Medium | Medium |

## Recommendation

**Ship Option 1 (Milo 2.0) this sprint.** It is the highest-leverage, lowest-
risk move and turns an existing 70%-built feature into a true cold-start
moat. Re-evaluate Options 2 and 3 once we hit 1K DAU and have data on Milo
2.0's actual handoff rate and session-length lift.

See:
- `MILOO_MILO_2_0_DESIGN.md` — full design doc
- `MILOO_MILO_2_0_DATA_FLOW.md` — data flow diagram
- `MILOO_MILO_2_0_IMPLEMENTATION_PLAN.md` — Kiro build plan
