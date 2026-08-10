# Milo 2.0 — Step-by-Step Implementation Plan (for Kiro)

**Companion to:**
- `MILOO_COLD_START_FEATURE_OPTIONS.md` (why this option)
- `MILOO_MILO_2_0_DESIGN.md` (what to build)
- `MILOO_MILO_2_0_DATA_FLOW.md` (how data moves)

**Estimated effort:** 3–5 engineering days
**Risk level:** Low (most code is greenfield on top of an existing 70%-built feature)

> **Tip for Kiro:** Work in the order below. Steps are sized so each one
> compiles and runs before the next. PRs should be small and mergeable
> individually.

---

## Day 0 — Pre-flight (30 min)

### Step 0.1 — Verify baseline runs
```bash
# from repo root
cd server && npm install && npm start
# in another terminal
cd client && npm install && npm run dev
```
- Open `http://localhost:5173`, pick a mood, click "Find Someone".
- Confirm `waiting` screen appears and the rotating hints work.
- Confirm the existing Milo companion activates after ~10s of waiting
  (this is what we're enhancing, not replacing).

### Step 0.2 — Read the relevant slices
- `server/index.js` lines **646–710** (existing `/api/milo` + `MILO_SYSTEM`)
- `client/src/pages/ChatRoom.jsx` lines **150–296** (Milo state, activation
  timer, `sendMiloMessage`)
- `client/src/pages/ChatRoom.jsx` lines **403–436** and **578–610**
  (existing match-handoff flow with Milo's goodbye)
- `client/src/utils/analytics.js` (existing `trackEvent`)
- `server/.env.example` (add new env vars here, never commit secrets)

---

## Day 1 — Server-side foundation (F2, F5, F6, F8)

### Step 1.1 — Add mood-aware opener helper
**File:** `server/index.js`

Add this near the existing `CONVO_STARTERS` constant (around line 125):

```js
const MILO_OPENERS = {
  vent: "I'm here, take your time. What's on your mind?",
  laugh: "okay be honest — worst joke you know. go.",
  deep: "what have you been thinking about a lot lately?",
  music: "if your week had a soundtrack, what's the first song?",
  gaming: "controller or keyboard? settle this once and for all.",
  culture: "where are you from and what's underrated about it?",
  any: "what's your vibe tonight?",
};
function getMiloOpenerForMood(mood) {
  return MILO_OPENERS[mood] || "hey! what's up? 😊";
}
```

### Step 1.2 — Add per-fingerprint rate limiter
**File:** `server/index.js`

Add near the other rate-limiters (around line 110):

```js
// Per-fingerprint Milo rate limit: 20 messages per 10 minutes
const miloFingerprintTimestamps = new Map();
const MILO_FP_LIMIT = 20;
const MILO_FP_WINDOW_MS = 10 * 60 * 1000;
function fingerprintMiloAllowed(fingerprint) {
  if (!fingerprint || fingerprint === "unknown") return true; // don't break anon
  const now = Date.now();
  const arr = (miloFingerprintTimestamps.get(fingerprint) || [])
    .filter(t => now - t < MILO_FP_WINDOW_MS);
  if (arr.length >= MILO_FP_LIMIT) {
    miloFingerprintTimestamps.set(fingerprint, arr);
    return false;
  }
  arr.push(now);
  miloFingerprintTimestamps.set(fingerprint, arr);
  return true;
}
```

Add a sweeper inside the existing `setInterval` cleanup (line 387):

```js
// inside the 10s cleanup interval
for (const [fp, arr] of miloFingerprintTimestamps.entries()) {
  const fresh = arr.filter(t => now - t < MILO_FP_WINDOW_MS);
  if (fresh.length === 0) miloFingerprintTimestamps.delete(fp);
  else miloFingerprintTimestamps.set(fp, fresh);
}
```

### Step 1.3 — Add persona prompt fragments
**File:** `server/index.js`

Right after the `MILO_SYSTEM` constant (line 673):

```js
const PERSONA_FRAGMENTS = {
  milo: "You are warm, supportive, and ask how someone feels.",
  mira: "You are playful and witty — tease gently, use more emojis, be a little cheeky.",
  jax:  "You are dry and observant. Replies are brief but never mean. Use a straight face.",
};
const GOODBYE_BY_PERSONA = {
  milo: "It was fun talking! Bye 👋",
  mira: "okay go have fun, weirdo 😏",
  jax:  "alright, real human's here. don't embarrass me.",
};
function buildSystemPrompt(persona) {
  const fragment = PERSONA_FRAGMENTS[persona] || PERSONA_FRAGMENTS.milo;
  return `${MILO_SYSTEM}\n\nPERSONA:\n${fragment}`;
}
```

### Step 1.4 — Extend `/api/milo`
**File:** `server/index.js` (replace the existing handler, lines 681–710)

```js
app.post("/api/milo", miloRateLimit, async (req, res) => {
  try {
    const { messages, persona, fingerprint } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages required" });
    }
    const safePersona = ["milo", "mira", "jax"].includes(persona) ? persona : "milo";

    if (!fingerprintMiloAllowed(fingerprint)) {
      return res.json({
        reply: "Heads up — I'm pausing for a bit so you can focus on the real people here. Try 'Find someone' again ✨",
        capped: true,
      });
    }

    const history = messages.slice(-20).map(m => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content || "").slice(0, 500),
    }));

    const systemPrompt = buildSystemPrompt(safePersona);

    // Optional Claude swap
    if (process.env.MILOO_USE_CLAUDE === "true" && process.env.ANTHROPIC_API_KEY) {
      const Anthropic = require("@anthropic-ai/sdk");
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const model = process.env.MILOO_CLAUDE_MODEL || "claude-haiku-4-5";
      const completion = await anthropic.messages.create({
        model,
        max_tokens: 150,
        system: systemPrompt,
        messages: history.map(m => ({ role: m.role, content: m.content })),
      });
      const raw = completion.content?.[0]?.text || "";
      const safe = isSuspiciousMessage(raw) ? "haha okay 😅" : raw.slice(0, 200);
      return res.json({ reply: safe });
    }

    // Default: Groq
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "system", content: systemPrompt }, ...history],
      max_tokens: 150,
      temperature: 0.9,
    });
    const raw = completion.choices[0]?.message?.content || "Arre yaar, kuch hua... try again? 😅";
    const safe = isSuspiciousMessage(raw) ? "haha okay 😅" : raw.slice(0, 200);
    res.json({ reply: safe });
  } catch (err) {
    console.error("Milo error:", err.message);
    res.status(500).json({ reply: "Thoda slow ho gaya... ek second 😅" });
  }
});
```

### Step 1.5 — Update `.env.example`
**File:** `server/.env.example`

Append (do not commit real keys):
```
# Optional: enable Claude as the Milo backend instead of Groq
# ANTHROPIC_API_KEY=your_anthropic_api_key_here
# MILOO_USE_CLAUDE=false
# MILOO_CLAUDE_MODEL=claude-haiku-4-5
```

### Step 1.6 — Install Anthropic SDK (only if you'll test Claude)
```bash
cd server && npm install @anthropic-ai/sdk
```
If not testing Claude, skip — the existing setup works.

### Step 1.7 — Manual test
```bash
# 1. Start server
cd server && npm start

# 2. Curl the endpoint with a fake fingerprint
curl -X POST http://localhost:3001/api/milo \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"hi"}],"persona":"mira","fingerprint":"test_fp_1"}'
```
Expected: 200 `{ "reply": "..." }`. Repeat 20 times within 10 min — the
21st should return the "pausing…" message.

### Step 1.8 — Commit & push
```bash
git add server/index.js server/.env.example
git commit -m "feat(milo): per-fingerprint rate limit, personas, Claude swap, output moderation"
```

---

## Day 2 — Client-side state + persona picker (F1, F3, F7)

### Step 2.1 — Add persona constants and localStorage helper
**File:** `client/src/utils/analytics.js` (extend, don't break existing exports)

```js
// Milo 2.0 persona helpers
const MILO_PERSONA_KEY = 'miloo_persona';
export function getStoredPersona() {
  try { return localStorage.getItem(MILO_PERSONA_KEY) || null; } catch { return null; }
}
export function setStoredPersona(p) {
  try { localStorage.setItem(MILO_PERSONA_KEY, p); } catch { /* no-op */ }
}

export const PERSONAS = [
  { id: 'milo', label: 'Milo', emoji: '🤗', blurb: 'Warm & supportive' },
  { id: 'mira', label: 'Mira', emoji: '😏', blurb: 'Playful & cheeky' },
  { id: 'jax',  label: 'Jax',  emoji: '🧊', blurb: 'Dry & brief' },
];
```

### Step 2.2 — Lower text-mode activation threshold to 8s
**File:** `client/src/pages/ChatRoom.jsx`

Around line 232–258 (the existing `useEffect` that ticks `waitingTime`):

```js
// was: if (next >= 15) {
const MILO_TRIGGER_TEXT = 8;
const MILO_TRIGGER_VIDEO = 15;
const trigger = chatModeRef.current === 'text' ? MILO_TRIGGER_TEXT : MILO_TRIGGER_VIDEO;
if (next >= trigger) {
  // ...existing body unchanged
}
```

Also add the `trackEvent` payload to include mode, mood, persona:
```js
trackEvent('milo_2_activated', {
  waitSeconds: next,
  mode: chatModeRef.current,
  mood: moodRef.current,
  persona: getStoredPersona() || 'milo',
});
```

### Step 2.3 — Add persona state in ChatRoom
**File:** `client/src/pages/ChatRoom.jsx` (top, near other useState calls around line 150)

```js
const [miloPersona, setMiloPersona] = useState(getStoredPersona() || 'milo');
const [showPersonaPicker, setShowPersonaPicker] = useState(!getStoredPersona());
const [miloMessageIndex, setMiloMessageIndex] = useState(0);
const [miloErrors, setMiloErrors] = useState(0); // for 3-strike auto-disable
const [miloDisabled, setMiloDisabled] = useState(false);

const choosePersona = (p) => {
  setMiloPersona(p);
  setStoredPersona(p);
  setShowPersonaPicker(false);
  trackEvent('milo_2_persona_chosen', { persona: p });
};
```

### Step 2.4 — Render the persona picker (above the Milo input)
**File:** `client/src/pages/ChatRoom.jsx` (in the existing Milo waiting UI, find the "Milo" header near the bottom of the file)

Add a small inline panel that renders when `isMiloActive && showPersonaPicker`:

```jsx
{isMiloActive && showPersonaPicker && (
  <div role="dialog" aria-label="Pick a Milo persona" style={{
    margin: '8px 12px 0', padding: '10px',
    background: 'var(--bg-1)', border: '1px solid var(--border-1)',
    borderRadius: '14px', display: 'flex', gap: '8px',
  }}>
    {PERSONAS.map(p => (
      <button key={p.id} onClick={() => choosePersona(p.id)} style={{
        flex: 1, padding: '10px 8px', borderRadius: '10px',
        background: 'var(--bg-2)', border: '1px solid var(--border-1)',
        color: 'var(--text-1)', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
      }}>
        <span style={{ fontSize: '20px' }}>{p.emoji}</span>
        <strong style={{ fontSize: '12px' }}>{p.label}</strong>
        <span style={{ fontSize: '10px', color: 'var(--text-3)' }}>{p.blurb}</span>
      </button>
    ))}
  </div>
)}
```

### Step 2.5 — Update `sendMiloMessage` to send persona + telemetry + 3-strike logic
**File:** `client/src/pages/ChatRoom.jsx` (replace `sendMiloMessage` near line 265)

```js
async function sendMiloMessage(customText) {
  if (miloDisabled) return;
  const text = typeof customText === 'string' ? customText : miloInput;
  if (!text.trim()) return;

  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const userMsg = { role: 'user', content: text, time }
  const updated = [...miloMessages, userMsg];
  setMiloMessages(updated);
  setMiloInput('');
  setMiloTyping(true);

  try {
    const res = await fetch(`${SERVER}/api/milo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: updated.map(m => ({ role: m.role, content: m.content })),
        persona: miloPersona,
        fingerprint: fingerprintRef.current,
      }),
    });
    const data = await res.json();
    const replyTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (data.capped) {
      trackEvent('milo_2_session_capped', { messagesSent: updated.length });
    } else {
      const idx = miloMessageIndex + 1;
      setMiloMessageIndex(idx);
      trackEvent('milo_2_message_sent', { messageLength: text.length, sessionMessageIndex: idx });
    }

    setMiloMessages(prev => [...prev, { role: 'assistant', content: data.reply, time: replyTime }]);
    setMiloErrors(0);
  } catch {
    const newCount = miloErrors + 1;
    setMiloErrors(newCount);
    setMiloMessages(prev => [...prev, {
      role: 'assistant',
      content: 'Connection slow... one sec 😅',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }]);
    if (newCount >= 3) {
      setMiloDisabled(true);
      systemMessage('Milo is taking a break — try Find Next if you want a real person ✨');
    }
  } finally {
    setMiloTyping(false);
  }
}
```

### Step 2.6 — Add `aria-live` to the Milo message list
**File:** `client/src/pages/ChatRoom.jsx`

Find the wrapper around `miloMessages` (search for `miloMessages.map` or
the `aria-live` it already may have) and ensure:
```jsx
<div aria-live="polite" aria-atomic="false" role="log">
  {miloMessages.map(...)}
</div>
```

### Step 2.7 — Manual test
- Reload `http://localhost:5173`, pick "Just Laugh" mood, "Text Only".
- Wait 8 seconds. Persona picker appears. Pick "Mira".
- Type a message. Verify reply arrives, `milo_2_message_sent` fires in
  GA debug view (or `gtag` network tab).
- Open 2 tabs, hit the 20-msg cap. Verify the "pausing…" reply and
  `milo_2_session_capped` event.

### Step 2.8 — Commit
```bash
git add client/src/utils/analytics.js client/src/pages/ChatRoom.jsx
git commit -m "feat(milo): persona picker, lowered text trigger, telemetry, 3-strike disable"
```

---

## Day 3 — Handoff polish + mood-tuned openers (F2, F4)

### Step 3.1 — Server returns a mood opener separately (optional but cleaner)

**File:** `server/index.js`

Add a new tiny endpoint (or extend `/api/milo` with `?opener=1`):

```js
app.get("/api/milo/opener", (req, res) => {
  const mood = typeof req.query.mood === "string" ? req.query.mood : "any";
  const persona = ["milo","mira","jax"].includes(req.query.persona