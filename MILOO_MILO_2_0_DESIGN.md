# Milo 2.0 — Full Design Document

**Status:** Ready for engineering build
**Owner:** AI Product Manager
**Sprint target:** This sprint (3–5 dev days)
**Related:** `MILOO_COLD_START_FEATURE_OPTIONS.md` (recommendation rationale)

---

## 1. Goal & non-goals

### Goal
Eliminate the 0–90 second "dead air" cold-start window in Miloo Chat by
automatically engaging the user with an AI companion (Milo) while they wait
for a real human match, and handing off seamlessly when a real partner
appears.

### Non-goals (this sprint)
- Replacing 1:1 video matching as the primary experience.
- Building a "talk to Milo forever" product. Milo is a bridge.
- Switching the entire app to Claude. We may **optionally** support Claude
  via env flag, but Groq remains the default (free, already integrated).
- New account system, login, or persistent history.

---

## 2. User stories

| ID | As a... | I want to... | So that... |
|---|---|---|---|
| US-1 | text-mode user waiting 8s+ | be chatted up by Milo automatically | I don't get bored and leave |
| US-2 | video-mode user waiting 15s+ | have Milo send a friendly nudge | the camera-permission wait feels less awkward |
| US-3 | user who just got matched | Milo to say goodbye before my partner joins | the handoff doesn't feel jarring |
| US-4 | returning user | Milo to remember my mood/language | conversation feels continuous |
| US-5 | user who loves Milo | choose between Milo, Mira, Jax | I get a vibe I actually like |
| US-6 | PM / founder | see how many sessions use Milo and convert | I can measure ROI without a marketer |

---

## 3. Functional requirements

### F1 — Adaptive activation thresholds
- **Text mode:** Milo activates at **8 seconds** of `waiting` status
  (down from current 10s).
- **Video mode:** Milo activates at **15 seconds** of `waiting` status
  (unchanged — we must not interrupt camera permission UX).
- The `setInterval` that drives `waitingTime` already exists at
  `client/src/pages/ChatRoom.jsx:234`. Only the threshold constant changes.

### F2 — Mood-aware first message
- When Milo activates, server reads the user's `lastMood` (already stored
  in `userMeta` at `server/index.js:488`) and returns a **mood-tuned opener**
  instead of a generic "hey! what's up? 😊".
- Mood → opener mapping (additive to the system prompt):
  | Mood | Milo opener |
  |---|---|
  | `vent` | "I'm here, take your time. What's on your mind?" |
  | `laugh` | "okay be honest — worst joke you know. go." |
  | `deep` | "what have you been thinking about a lot lately?" |
  | `music` | "if your week had a soundtrack, what's the first song?" |
  | `gaming` | "controller or keyboard? settle this once and for all." |
  | `culture` | "where are you from and what's underrated about it?" |
  | `any` | "what's your vibe tonight?" |
  | (default) | "hey! what's up? 😊" |

### F3 — Personality switcher
- On first activation in a session, if `localStorage` has no
  `miloo_persona`, show a 3-card picker: **Milo** (warm) / **Mira**
  (playful) / **Jax** (sarcastic-but-kind). Default if dismissed: Milo.
- Each persona has a one-line addition to the system prompt, e.g.:
  - Milo: "You are warm, supportive, ask how someone feels."
  - Mira: "You are playful, witty, tease gently, use more emojis."
  - Jax: "You are dry, observant, brief, but never mean."
- Persona is passed as `persona` in the POST body to `/api/milo`.

### F4 — Seamless handoff
- Already implemented at `client/src/pages/ChatRoom.jsx:414–435` (text) and
  `:580–610` (video): when `match_found` fires while Milo is active, Milo
  appends a goodbye bubble and 1.8s later the partner joins.
- **Enhancement:** the goodbye bubble is *persona-aware*
  ("It was fun talking! Bye 👋" → "okay go be social, weirdo 😏" for Jax).
- **Enhancement:** if user is mid-typing when `match_found` arrives, finish
  sending the message to Milo first, *then* handoff (don't drop the message).

### F5 — Per-session rate limit
- Add a per-fingerprint counter on the server: max **20 Milo messages
  per 10 minutes per fingerprint**.
- When the limit is hit, return a graceful reply:
  `"Heads up — I'm pausing for a bit so you can focus on the real people here. Try 'Find someone' again ✨"`.
- After limit, any subsequent message to `/api/milo` is short-circuited.

### F6 — Output moderation
- Reuse the regex list at `server/index.js:341` (`isSuspiciousMessage`) on
  Milo's outbound reply. If matched, replace with a safe fallback:
  `"haha okay 😅"` (preserves conversation without leaking contact info).
- Hard cap each reply at **200 chars** server-side (defense in depth — the
  prompt already says 1–2 sentences).

### F7 — Telemetry
New GA events to add via `trackEvent` (`client/src/utils/analytics.js`):
- `milo_2_activated` — `{ waitSeconds, mode, mood, persona }`
- `milo_2_message_sent` — `{ messageLength, sessionMessageIndex }`
- `milo_2_handoff_completed` — `{ miloMessagesExchanged, totalWaitSeconds, mode }`
- `milo_2_session_capped` — `{ messagesSent, totalWaitSeconds }`
- `milo_2_persona_chosen` — `{ persona }`

### F8 — Optional Claude swap
- Add `ANTHROPIC_API_KEY` to `server/.env.example`.
- In `/api/milo`, if `process.env.MILOO_USE_CLAUDE === 'true'`, route the
  call to `@anthropic-ai/sdk` instead of Groq. Same request/response shape.
- Model default: `claude-haiku-4-5` for cost. Configurable via
  `MILOO_CLAUDE_MODEL` env.

---

## 4. Non-functional requirements

- **Latency:** First Milo token within **2.5s p95** (Groq currently ~600ms
  TTFT; Claude Haiku ~800ms — both well under budget).
- **Cost ceiling:** At 1K DAU, avg 3 Milo messages per session =
  ~3K LLM calls/day. Groq free tier covers ~14K/day. **Free.**
  Claude Haiku at 3K calls/day × ~400 tokens avg = ~$1.20/day. **<$40/mo.**
- **Privacy:** No PII sent to the LLM. History capped at 20 messages
  (already enforced at `server/index.js:689`) and truncated to 500 chars
  per message.
- **Resilience:** If `/api/milo` 5xx's, the client already shows
  `"Connection slow... one sec 😅"` (ChatRoom.jsx:288). Add a 3-strikes
  auto-disable: if 3 errors in 60s, stop calling Milo and surface a
  "Milo is taking a break" toast for the rest of the session.
- **Accessibility:** Milo bubbles have `aria-live="polite"`. The persona
  picker is keyboard-navigable.

---

## 5. UX flows

### Flow A — Text mode cold start (primary)

```
User clicks "Find Someone to Chat With" (MoodSelect)
  → ChatRoom mounts, status = 'text_connecting'
  → Socket connects, emits find_match
  → status = 'waiting'
  → Rotating "looking for someone..." hint (existing)
  → At 8s, Milo activates:
       • Show 3-card persona picker (first time only) OR persona bubble
       • Append first Milo message (mood-tuned)
       • Reveal Milo input box
  → User types → POST /api/milo → reply bubble
  → At any point, if match_found fires:
       • Append persona-specific goodbye bubble
       • 1.8s delay (existing)
       • status = 'text_chat', Milo UI hides, real chat reveals
  → At 20 messages / 10 min:
       • Cap reply with the "pausing" message
       • Show "Try 'Find someone' again ✨" CTA
```

### Flow B — Video mode cold start

```
User clicks "Find My Match" (MoodSelect)
  → ChatRoom mounts, status = 'pre_permission'
  → User clicks "Allow Camera & Find Match"
  → status = 'connecting' → 'waiting' (after socket + getUserMedia)
  → At 15s of 'waiting', Milo bubble appears at the bottom of the
    video screen (small overlay, doesn't block the video tiles)
  → Handoff identical to Flow A: goodbye bubble + 1.8s + real partner
    joins + WebRTC offer/answer flow continues
```

### Flow C — The "I just want to talk to Milo" edge case

```
User is matched within 2s, before Milo activates:
  → No change — existing fast-path (no Milo message rendered)
User chats with Milo for 5+ minutes without a real match:
  → At message #20: cap message fires
  → If still no match after 5 min in Milo:
       • Show "Want to keep chatting with real people? Tap 'Next'"
         as a non-blocking toast
       • Continue Milo only if user types again (re-enable for 5 more)
```

---

## 6. Edge cases

| Case | Handling |
|---|---|
| User skips (Next) while Milo is active | `findNext()` already resets `isMiloActive`. Add: also clears `miloMessages` and `miloInput` so the next session starts clean. |
| User denies camera mid-Milo | `continueAsText()` already handles cam_error. Milo state persists. |
| Server `/api/milo` returns 429 | Client shows "Milo is busy, try again in a sec 😅" and disables Milo input for 30s. |
| Two matches arrive back-to-back (race) | `activePairs` map on server is idempotent; second `match_found` is dropped. Client guard: only process first. |
| User opens app in 2 tabs | Each tab has its own socket; rate-limit is per-fingerprint, so they share the cap. |
| Milo reply is empty string | Treat as error, show fallback "hmm, lost my train of thought — try again?" |
| Mood is `"any"` | Use neutral opener from F2 table. |

---

## 7. Acceptance criteria (definition of done)

- [ ] Text-mode Milo activates at 8s with a mood-tuned opener.
- [ ] Video-mode Milo activates at 15s with a small overlay bubble.
- [ ] 3 personas (Milo / Mira / Jax) selectable, persisted in localStorage.
- [ ] Per-fingerprint rate limit of 20 msgs / 10 min enforced server-side.
- [ ] All 5 GA events fire with the documented payload shape.
- [ ] Match-handoff preserves the last 1.8s goodbye bubble and hides Milo UI.
- [ ] Optional Claude swap works behind `MILOO_USE_CLAUDE=true` env flag.
- [ ] No regression in median `time-to-match` for users who match <8s.
- [ ] No new dependency added to `client/package.json`.
- [ ] One new dev dep on the server: `@anthropic-ai/sdk` (only if Claude
      swap is implemented — otherwise optional).

---

## 8. Out of scope (deferred)

- Voice-mode Milo (TTS) — would need audio UX redesign.
- Milo avatars / profile pictures.
- Persistent memory across days (no account system).
- Custom persona builder.
- Multilingual STT/TTS for Hindi.
- Group Milo (3+ users).
