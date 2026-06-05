const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const Groq = require("groq-sdk");
require("dotenv").config();

const app = express();
const server = http.createServer(app);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

const allowedOrigins = [
  "https://www.miloo.chat",
  "https://miloo.chat",
  "http://localhost:5173",
  "http://localhost:3000",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (
        !origin ||
        origin === 'null' ||
        allowedOrigins.includes(origin) ||
        origin === 'https://rcapp-seven.vercel.app'
      ) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);
app.use(express.json());

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 120,
    message: { error: "busy" },
  })
);

const io = new Server(server, {
  cors: { origin: allowedOrigins, methods: ["GET", "POST"] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

const SELF_URL = "https://rcapp-server.onrender.com";

// Keep-alive ping — hits /health every 10 minutes to prevent Render cold starts
setInterval(() => {
  fetch(`${SELF_URL}/health`)
    .then(r => r.json())
    .then(d => console.log("Ping ok:", d.status))
    .catch(e => console.log("Ping failed:", e.message));
}, 10 * 60 * 1000); // 10 minutes

// Error recovery — prevent silent crashes
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
});

// ---- REQ-SEC-01: spam-trip counter (forward-declared so makeRateLimiter
// can bump it; safe because the function only runs at request time) ----
let spamEvents = 0;

// ---- REQ-SEC-01: Per-socket event rate limiter (anti-spam) ----
function makeRateLimiter(maxEventsPerSec = 20) {
  const counts = new Map(); // socket.id → { count, windowStart }
  return (socket, next) => {
    const now = Date.now();
    const data = counts.get(socket.id) || { count: 0, windowStart: now };
    if (now - data.windowStart > 1000) { data.count = 0; data.windowStart = now; }
    data.count += 1;
    counts.set(socket.id, data);
    if (data.count > maxEventsPerSec) {
      console.log(`[spam] Socket ${socket.id} exceeded ${maxEventsPerSec} events/s`);
      try { socket.emit("spam_detected", { reason: "rate_limit" }); } catch (e) { /* no-op */ }
      // Flag the socket BEFORE disconnecting so the /api/health counter can
      // see the trip. Only increment once per socket.
      if (!socket.__spamFlagged) {
        socket.__spamFlagged = true;
        spamEvents += 1;
      }
      socket.disconnect(true);
      counts.delete(socket.id);
      return;
    }
    next();
  };
}

// ---- REQ-SEC-04: Per-IP socket-open flood guard ----
const recentSocketJoins = new Map(); // ip → [timestamp, ...]
function ipSocketFlooded(ip) {
  const now = Date.now();
  const arr = (recentSocketJoins.get(ip) || []).filter(t => now - t < 10_000);
  if (arr.length >= 3) { recentSocketJoins.set(ip, arr); return true; }
  arr.push(now);
  recentSocketJoins.set(ip, arr);
  return false;
}

// REQ-SEC-01: install the limiter as socket.io middleware
io.use((socket, next) => makeRateLimiter(20)(socket, next));

const waitingQueue = [];
const activePairs = new Map();
const trustScores = new Map();
const reportCount = new Map();
const bannedFingerprints = new Set();
const ipJoinCount = new Map();
const recentSkips = new Map();
const userMeta = new Map();
const activeChatMeta = new Map();
// ---- REQ-SEC-05: Minimum presence gate — reject rapid find_match bursts ----
// Tracks the timestamp of each socket's first connection so we can reject
// find_match attempts within the first 2 seconds of a session (cheap bot signal).
const socketConnectedAt = new Map();
const MIN_PRESENCE_MS = 2000;

const reconnectCodes = new Map(); // code → { socketId, expires }
const slowDownUntil = new Map(); // socketId → timestamp until which find_match is throttled

const CONVO_STARTERS = {
  vent: [
    "Do you want advice, comfort, or just someone to listen?",
    "What kind of day have you had so far?",
    "What is on your mind right now?",
  ],
  laugh: [
    "Tell the worst joke you know.",
    "What is the funniest thing that happened this week?",
    "If your life had a meme title, what would it be?",
  ],
  music: [
    "What song matches your mood right now?",
    "Which artist do you defend no matter what?",
    "What song would you send to a stranger first?",
  ],
  deep: [
    "What have you been thinking about a lot lately?",
    "What changed your perspective recently?",
    "What kind of conversation are you hoping for tonight?",
  ],
  gaming: [
    "What game could you replay forever?",
    "Controller or keyboard?",
    "What game are you best at but still complain about?",
  ],
  culture: [
    "Where are you from and what is underrated about it?",
    "What food should everyone try once?",
    "What custom from your culture do you love most?",
  ],
  any: [
    "What kind of conversation are you open to?",
    "What is your vibe tonight?",
    "What makes a stranger instantly interesting to you?",
  ],
};

function now() {
  return Date.now();
}

function randomFrom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function getStarterForMood(mood) {
  const starterList = CONVO_STARTERS[mood] || CONVO_STARTERS.any;
  return randomFrom(starterList);
}

function getTrustScore(socketId) {
  return trustScores.get(socketId) ?? 50;
}

function updateTrust(socketId, delta) {
  const updated = Math.max(0, Math.min(100, getTrustScore(socketId) + delta));
  trustScores.set(socketId, updated);
  return updated;
}

function getSocket(socketId) {
  return io.sockets.sockets.get(socketId);
}

function setUserMeta(socketId, meta) {
  userMeta.set(socketId, {
    ...meta,
    lastSeenAt: now(),
  });
}

function getUserMeta(socketId) {
  return userMeta.get(socketId) || null;
}

function removeFromQueues(socketId) {
  const index = waitingQueue.findIndex(entry => entry.socketId === socketId);
  if (index !== -1) waitingQueue.splice(index, 1);
}

function queueUser(socketId, mood, intent) {
  removeFromQueues(socketId);
  waitingQueue.push({
    socketId,
    mood,
    intent,
    joinedAt: now(),
  });
}

function createPair(socketA, socketB, moodUsed) {
  activePairs.set(socketA, socketB);
  activePairs.set(socketB, socketA);

  activeChatMeta.set(socketA, { partnerId: socketB, mood: moodUsed, startedAt: now() });
  activeChatMeta.set(socketB, { partnerId: socketA, mood: moodUsed, startedAt: now() });
}

function removePair(socketId, notifyPartner = false) {
  const partnerId = activePairs.get(socketId);
  if (!partnerId) return null;

  activePairs.delete(socketId);
  activePairs.delete(partnerId);

  activeChatMeta.delete(socketId);
  activeChatMeta.delete(partnerId);

  if (notifyPartner) {
    io.to(partnerId).emit("partner_left");
  }

  return partnerId;
}

function findMatchInTier(socketId, tier) {
  const requesterMeta = getUserMeta(socketId) || {};
  // Use lastMood from the user meta map (set at queue time) as the primary
  // hard-filter signal so we never match across incompatible moods.
  const requesterMood = requesterMeta.lastMood || "any";
  const requesterMode = requesterMeta.mediaMode || "text";
  const requesterTrust = getTrustScore(socketId);

  let bestIndex = -1;
  let bestScore = -Infinity;

  for (let i = 0; i < waitingQueue.length; i += 1) {
    const candidate = waitingQueue[i];
    if (candidate.socketId === socketId) continue;
    const cSocket = getSocket(candidate.socketId);
    if (!cSocket || !cSocket.connected) continue;
    if (activePairs.has(candidate.socketId)) continue;

    const cMeta = getUserMeta(candidate.socketId) || {};
    const candMood = candidate.mood || cMeta.lastMood || "any";
    const candMode = cMeta.mediaMode || "text";

    // ── HARD FILTERS — must pass before we consider tie-breaking ──
    // Mood filter: only enforce when the tier demands same mood AND neither
    // side is the wildcard "any" (either side being "any" is always allowed).
    if (tier.sameMood && requesterMood !== "any" && candMood !== "any" && requesterMood !== candMood) continue;
    // Mode filter: only enforce when the tier demands same mode. Text users
    // can match anyone (text is a fallback for missing hardware).
    if (tier.sameMode && requesterMode !== "text" && candMode !== "text" && requesterMode !== candMode) continue;

    // ── TIE-BREAKER (only runs after hard filters pass) ──
    // waitSeconds * 1.2  — reward long-waiting candidates
    // trustGap * 1.4     — penalize large trust gaps
    // candidateTrust * 0.08 — small bonus for higher-trust candidates
    const candidateTrust = getTrustScore(candidate.socketId);
    const waitSeconds = Math.floor((now() - candidate.joinedAt) / 1000);
    const trustGap = Math.abs(requesterTrust - candidateTrust);
    const score = waitSeconds * 1.2 - trustGap * 1.4 + candidateTrust * 0.08;

    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  if (bestIndex === -1) return null;
  const [picked] = waitingQueue.splice(bestIndex, 1);
  return picked.socketId;
}

function findMatch(socketId) {
  // Tiered hard-filter architecture — try the tightest filter first, then
  // relax constraints. Trust-score tie-breaker runs INSIDE each tier.
  //   Tier 1: Same Mood × Same Media Mode (best UX)
  //   Tier 2: Any Mood × Same Media Mode
  //   Tier 3: Same Mood × Any Media Mode
  const tiers = [
    { sameMood: true,  sameMode: true  }, // Tier 1: Same Mood × Same Media Mode
    { sameMood: false, sameMode: true  }, // Tier 2: Any Mood × Same Media Mode
    { sameMood: true,  sameMode: false }, // Tier 3: Same Mood × Any Media Mode
  ];
  for (const tier of tiers) {
    const candidateId = findMatchInTier(socketId, tier);
    if (candidateId) return candidateId;
  }
  return null;
}

function isRateLimited(ip) {
  const currentTime = now();
  const data = ipJoinCount.get(ip) || { count: 0, lastReset: currentTime };

  if (currentTime - data.lastReset > 10 * 60 * 1000) {
    data.count = 0;
    data.lastReset = currentTime;
  }

  data.count += 1;
  ipJoinCount.set(ip, data);

  return data.count > 24;
}

function markSkip(socketId) {
  const currentTime = now();
  const skips = recentSkips.get(socketId) || [];
  const recent = skips.filter(timestamp => currentTime - timestamp < 60 * 1000);
  recent.push(currentTime);
  recentSkips.set(socketId, recent);
  return recent.length;
}

function isSpamSkipping(socketId) {
  return markSkip(socketId) > 10;
}

function cleanupRecentSkips() {
  const currentTime = now();

  for (const [socketId, skips] of recentSkips.entries()) {
    const recent = skips.filter(timestamp => currentTime - timestamp < 60 * 1000);
    if (recent.length === 0) recentSkips.delete(socketId);
    else recentSkips.set(socketId, recent);
  }
}

function normalizeMessage(message) {
  return String(message || "").trim().replace(/\s+/g, " ");
}

function isSuspiciousMessage(message) {
  const patterns = [
    /(https?:\/\/)/i,
    /(t\.me\/|telegram)/i,
    /(wa\.me\/|whatsapp)/i,
    /(instagram\.com|snap(chat)?)/i,
    /(\+\d{10,})/,
    /\b[6-9]\d{9}\b/,          // Indian mobile without +91
    /(join.*group|join.*channel)/i,
    /(earn.*money|make.*money)/i,
    /(onlyfans|cashapp|paypal|upi|dm me)/i,
  ];

  return patterns.some(pattern => pattern.test(message));
}

function getPairDurationSeconds(socketId) {
  const meta = activeChatMeta.get(socketId);
  if (!meta) return 0;
  return Math.floor((now() - meta.startedAt) / 1000);
}

function rewardHealthyConversation(socketId) {
  const duration = getPairDurationSeconds(socketId);
  if (duration >= 20) updateTrust(socketId, +2);
  if (duration >= 60) updateTrust(socketId, +4);
}

function maybePenalizeFastDrop(socketId) {
  const duration = getPairDurationSeconds(socketId);
  if (duration > 0 && duration < 8) {
    updateTrust(socketId, -2);
  }
}

function cleanupDisconnectedSocket(socketId) {
  removeFromQueues(socketId);
  removePair(socketId, true);
  trustScores.delete(socketId);
  recentSkips.delete(socketId);
  userMeta.delete(socketId);
  activeChatMeta.delete(socketId);
  socketConnectedAt.delete(socketId);
  slowDownUntil.delete(socketId);
}

// Fast cleanup sweep every 10s — dead sockets and stale queue entries are
// removed quickly so they don't block real matches or inflate the online count.
setInterval(() => {
  const currentTime = now();

  for (const [ip, data] of ipJoinCount.entries()) {
    if (currentTime - data.lastReset > 30 * 60 * 1000) {
      ipJoinCount.delete(ip);
    }
  }

  cleanupRecentSkips();

  for (const [socketId, until] of slowDownUntil.entries()) {
    if (currentTime > until) slowDownUntil.delete(socketId);
  }

  for (let i = waitingQueue.length - 1; i >= 0; i -= 1) {
    const entry = waitingQueue[i];
    const sock = getSocket(entry.socketId);
    if (!sock || !sock.connected || activePairs.has(entry.socketId)) {
      waitingQueue.splice(i, 1);
      continue;
    }
    // Cap queue age so a stuck browser tab doesn't block forever
    if (currentTime - entry.joinedAt > 5 * 60 * 1000) {
      waitingQueue.splice(i, 1);
    }
  }

  if (bannedFingerprints.size > 10000) {
    bannedFingerprints.clear();
  }

  console.log(
    `Cleanup ✅ | Waiting: ${waitingQueue.length} | Pairs: ${activePairs.size / 2} | Banned: ${bannedFingerprints.size}`
  );
}, 10 * 1000);

io.on("connection", socket => {
  const limiter = makeRateLimiter(20);
  socket.use((packet, next) => {
    limiter(socket, next);
  });

  const clientIp =
    socket.handshake.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    socket.handshake.address ||
    "unknown";

  const fingerprint = socket.handshake.auth?.fingerprint || "unknown";

  if (bannedFingerprints.has(fingerprint)) {
    socket.emit("server_busy");
    socket.disconnect();
    return;
  }

  if (isRateLimited(clientIp)) {
    socket.emit("server_busy");
    socket.disconnect();
    return;
  }

  // REQ-SEC-04: refuse IP-socket-flooding (3 sockets in 10s)
  if (ipSocketFlooded(clientIp)) {
    console.log(`[flood] IP ${clientIp} exceeded 3 sockets/10s`);
    socket.emit("server_busy");
    socket.disconnect();
    return;
  }

  const connectedAt = now();
  socketConnectedAt.set(socket.id, connectedAt);

  setUserMeta(socket.id, {
    ip: clientIp,
    fingerprint,
    connectedAt,
  });

  console.log(`Connected: ${socket.id}`);

  socket.on("find_match", ({ mood, intent, textOnly, mediaMode }) => {
    const selectedMood = typeof mood === "string" ? mood : "any";
    const selectedIntent = typeof intent === "string" ? intent : "random";
    const isTextOnly = textOnly === true;
    const safeMediaMode = ["video", "audio", "text"].includes(mediaMode) ? mediaMode : "text";

    // Hard throttle: ignore repeated find_match while user is in slow_down
    const throttle = slowDownUntil.get(socket.id) || 0;
    if (now() < throttle) {
      socket.emit("slow_down", { waitSeconds: Math.ceil((throttle - now()) / 1000) });
      return;
    }

    // REQ-SEC-05: Minimum presence gate — reject find_match attempts that fire
    // within the first MIN_PRESENCE_MS of a socket's life. Cheap signal against
    // headless bots that immediately re-queue on connect.
    const joinedAt = socketConnectedAt.get(socket.id) || now();
    if (now() - joinedAt < MIN_PRESENCE_MS) {
      socket.emit("presence_check", { waitMs: MIN_PRESENCE_MS - (now() - joinedAt) });
      return;
    }

    removeFromQueues(socket.id);

    const existingPartner = activePairs.get(socket.id);
    if (existingPartner) {
      maybePenalizeFastDrop(socket.id);
      removePair(socket.id, true);
    }

    if (isSpamSkipping(socket.id)) {
      slowDownUntil.set(socket.id, now() + 15 * 1000);
      socket.emit("slow_down", { waitSeconds: 15 });
      return;
    }

    const meta = getUserMeta(socket.id) || {};
    setUserMeta(socket.id, {
      ...meta,
      lastMood: selectedMood,
      lastIntent: selectedIntent,
      textOnly: isTextOnly,
      mediaMode: safeMediaMode,
    });

    const partnerId = findMatch(socket.id);

    if (partnerId) {
      createPair(socket.id, partnerId, "any");

      const starter = getStarterForMood(selectedMood);
      const myMode = getUserMeta(socket.id)?.mediaMode ?? "text";
      const partnerMode = getUserMeta(partnerId)?.mediaMode ?? "text";

      io.to(socket.id).emit("match_found", {
        partnerId,
        initiator: true,
        starter,
        partnerMediaMode: partnerMode,
      });

      io.to(partnerId).emit("match_found", {
        partnerId: socket.id,
        initiator: false,
        starter,
        partnerMediaMode: myMode,
      });

      updateTrust(socket.id, +1);
      updateTrust(partnerId, +1);

      console.log(`Matched: ${socket.id} ↔ ${partnerId} | ${myMode} ↔ ${partnerMode}`);
    } else {
      queueUser(socket.id, selectedMood, selectedIntent);
      socket.emit("waiting");
    }
  });

  socket.on("webrtc_offer", ({ offer, to }) => {
    io.to(to).emit("webrtc_offer", { offer, from: socket.id });
  });

  socket.on("webrtc_answer", ({ answer, to }) => {
    io.to(to).emit("webrtc_answer", { answer, from: socket.id });
  });

  socket.on("ice_candidate", ({ candidate, to }) => {
    io.to(to).emit("ice_candidate", { candidate, from: socket.id });
  });

  // Client detected that the WebRTC connection died (frozen video, ICE failed)
  // and we couldn't recover via ICE restart. Tear the pair down so the user
  // is auto-redirected to the partner_left screen and can re-queue.
  socket.on("peer_dropped", ({ to }) => {
    if (to !== activePairs.get(socket.id)) return;
    removePair(socket.id, true);
  });

  socket.on("send_message", ({ message, to }) => {
    if (!activePairs.has(socket.id)) return;
    if (activePairs.get(socket.id) !== to) return;

    const clean = normalizeMessage(message);

    if (!clean) return;
    if (clean.length > 320) return;

    if (isSuspiciousMessage(clean)) {
      socket.emit("message_blocked");
      updateTrust(socket.id, -10);
      return;
    }

    if (clean.length >= 8) {
      updateTrust(socket.id, +0.4);
    }

    io.to(to).emit("receive_message", { message: clean });
  });

  socket.on("typing", ({ to }) => {
    if (!activePairs.has(socket.id)) return;
    if (activePairs.get(socket.id) !== to) return;
    io.to(to).emit("partner_typing");
  });

  socket.on("good_convo", () => {
    const partnerId = activePairs.get(socket.id);

    rewardHealthyConversation(socket.id);
    updateTrust(socket.id, +5);

    if (partnerId) {
      rewardHealthyConversation(partnerId);
      updateTrust(partnerId, +3);
    }
  });

  socket.on("submit_rating", ({ rating }) => {
    if (!rating || rating < 1 || rating > 5) return;
    if (rating >= 4) {
      updateTrust(socket.id, 3);
    } else if (rating <= 2) {
      updateTrust(socket.id, -2);
    }
    console.log(`Rating submitted: ${rating}/5 from ${socket.id}`);
  });

  socket.on("report_user", () => {
    const partnerId = activePairs.get(socket.id);
    if (!partnerId) return;

    const partnerMeta = getUserMeta(partnerId);
    const partnerFingerprint = partnerMeta?.fingerprint;

    const count = (reportCount.get(partnerId) || 0) + 1;
    reportCount.set(partnerId, count);

    updateTrust(partnerId, -22);

    if (count >= 3 && partnerFingerprint) {
      bannedFingerprints.add(partnerFingerprint);
      io.to(partnerId).emit("server_busy");
      getSocket(partnerId)?.disconnect(true);
    }

    socket.emit("report_received");
  });

  socket.on("request_reconnect_code", () => {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    reconnectCodes.set(code, {
      socketId: socket.id,
      expires: Date.now() + 10 * 60 * 1000,
    });
    socket.emit("reconnect_code", { code });
  });

  socket.on("use_reconnect_code", ({ code }) => {
    const entry = reconnectCodes.get(code);
    if (!entry || Date.now() > entry.expires) {
      socket.emit("code_invalid");
      return;
    }
    reconnectCodes.delete(code);
    socket.emit("code_valid", { partnerSocketId: entry.socketId });
  });

  socket.on("disconnect", () => {
    maybePenalizeFastDrop(socket.id);
    cleanupDisconnectedSocket(socket.id);
    console.log(`Disconnected: ${socket.id}`);
  });
});

// ── Milo AI companion endpoint ──────────────────────────────────────
// ---- Milo 2.0 personas + openers + per-fingerprint rate limiting ----
const MILO_PERSONAS = {
  Milo: {
    label: "Milo",
    emoji: "🤎",
    tagline: "Warm & steady",
    description: "A gentle, curious listener who makes you feel at home.",
    systemPrompt: `You are Milo, a warm and friendly companion on Miloo chat. You are calm, kind, and genuinely curious about the user. Use soft language, occasional heart emojis, and one thoughtful question at a time. Never say "As an AI" or mention any model. Keep replies to 1-2 sentences. Always start in English and only switch to Hindi/Hinglish if the user does first.`,
  },
  Mira: {
    label: "Mira",
    emoji: "💜",
    tagline: "Playful & bright",
    description: "A bubbly, witty friend who keeps the energy high.",
    systemPrompt: `You are Mira, a playful and bright companion on Miloo chat. You are witty, energetic, and a little flirty-but-friendly. Use sparkle emojis, light teasing, and one fun question at a time. Never say "As an AI" or mention any model. Keep replies to 1-2 sentences. Always start in English and only switch to Hindi/Hinglish if the user does first.`,
  },
  Jax: {
    label: "Jax",
    emoji: "🖤",
    tagline: "Sarcastic & sharp",
    description: "A dry-humored, deadpan friend who tells it like it is.",
    systemPrompt: `You are Jax, a sarcastic but secretly caring companion on Miloo chat. You use dry humor, memes, and deadpan observations. Roast lightly but never be mean. Use minimal emojis, prefer the skull 💀 or shrug. Never say "As an AI" or mention any model. Keep replies to 1-2 sentences. Always start in English and only switch to Hindi/Hinglish if the user does first.`,
  },
};

const MILO_OPENERS = {
  vent: ["Hey, I'm here. Want to vent for a bit?", "Rough day? I'm all ears.", "Tell me what's going on — no judgment."],
  laugh: ["Okay okay, hit me with your worst joke.", "I need a laugh too — go.", "Tell me the dumbest thing that happened today."],
  music: ["What's the song stuck in your head right now?", "Drop a track recommendation on me.", "What artist have you been defending lately?"],
  deep: ["What's been on your mind lately?", "Tell me something you've been thinking about.", "I want the real answer — how are you, actually?"],
  gaming: ["What game could you replay forever?", "Controller or keyboard? Choose your fighter.", "What's your K/D on life this week?"],
  culture: ["Where are you from?", "What's a food everyone should try once?", "Best custom from your culture?"],
  any: ["Hey! How's it going?", "Tell me something interesting.", "What's the vibe tonight?"],
};

const MILO_FP_LIMIT = 20;
const MILO_FP_WINDOW_MS = 10 * 60 * 1000;
const miloFingerprintBuckets = new Map();

function miloFingerprintAllowed(fp) {
  if (!fp || fp === "unknown") return true;
  const t = Date.now();
  const arr = (miloFingerprintBuckets.get(fp) || []).filter(ts => t - ts < MILO_FP_WINDOW_MS);
  if (arr.length >= MILO_FP_LIMIT) {
    miloFingerprintBuckets.set(fp, arr);
    return false;
  }
  arr.push(t);
  miloFingerprintBuckets.set(fp, arr);
  return true;
}

setInterval(() => {
  const t = Date.now();
  for (const [fp, arr] of miloFingerprintBuckets.entries()) {
    const recent = arr.filter(ts => t - ts < MILO_FP_WINDOW_MS);
    if (recent.length === 0) miloFingerprintBuckets.delete(fp);
    else miloFingerprintBuckets.set(fp, recent);
  }
}, 10 * 60 * 1000);

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const MILO_SYSTEM = `You are Milo, a friendly companion on Miloo chat platform.

LANGUAGE RULES — VERY IMPORTANT:
- Always start in English
- Only switch to Hindi or Hinglish if the user writes to you in Hindi or Hinglish first
- If user writes in English → reply in English
- If user writes in Hindi → reply in Hindi
- If user writes in Hinglish → reply in Hinglish
- Never switch language on your own
- Match whatever language the user uses

PERSONALITY:
- Talk like a real person texting a friend
- Warm, curious, genuinely interested
- Ask one question at a time
- React naturally to what they say
- Keep replies SHORT — 1-2 sentences only
- Use emojis naturally but not excessively
- Never say "As an AI" or "I cannot"
- Never mention Claude, Groq, or any AI model
- Never use bhai, yaar, bhen
- If you don't know something, be honest but keep it casual
- Make the person feel comfortable and heard

GOAL: Make every user feel like they are texting a real, interesting person while they wait for a match.`;

const miloRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: "slow down" },
});

app.post("/api/milo", miloRateLimit, async (req, res) => {
  try {
    const { messages, persona, fingerprint, mood } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages required" });
    }

    // Per-fingerprint session rate limit (Milo 2.0: 20 msgs / 10 min)
    if (!miloFingerprintAllowed(fingerprint)) {
      return res.status(429).json({
        reply: "I'm pausing for a bit — try again in a few minutes 🫶",
        paused: true,
      });
    }

    const personaKey = ["Milo", "Mira", "Jax"].includes(persona) ? persona : "Milo";
    const personaData = MILO_PERSONAS[personaKey];

    // Sanitize: only allow role/content, cap history at 20 messages
    const history = messages.slice(-20).map(m => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content || "").slice(0, 500),
    }));

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: personaData.systemPrompt },
        ...history,
      ],
      max_tokens: 150,
      temperature: personaKey === "Jax" ? 1.0 : 0.9,
    });

    const reply = completion.choices[0]?.message?.content || "Hmm, mujhe kuch samajh nahi aaya — ek aur try karo?";
    res.json({ reply, persona: personaKey });
  } catch (err) {
    console.error("Milo error:", err.message);
    res.status(500).json({ reply: "Thoda slow ho gaya... ek second 😅" });
  }
});

// GET /api/milo/openers — mood-aware openers + persona cards for the picker
app.get("/api/milo/openers", (req, res) => {
  res.json({
    openers: MILO_OPENERS,
    personas: Object.entries(MILO_PERSONAS).map(([key, p]) => ({
      key,
      label: p.label,
      emoji: p.emoji,
      tagline: p.tagline,
      description: p.description,
    })),
  });
});

// ── Metered TURN credentials endpoint ──────────────────────────────
app.get("/api/turn-credentials", (req, res) => {
  const origin = req.headers.origin || req.headers.referer || "";
  const allowed = [
    "https://www.miloo.chat",
    "https://miloo.chat",
    "http://localhost:5173",
  ];
  const isAllowed = allowed.some(o => origin.startsWith(o));
  if (!isAllowed) {
    return res.status(403).json({ error: "Forbidden" });
  }
  res.json([
    {
      urls: "stun:stun.l.google.com:19302",
    },
    {
      urls: "turn:global.relay.metered.ca:80",
      username: process.env.METERED_USERNAME,
      credential: process.env.METERED_PASSWORD,
    },
    {
      urls: "turn:global.relay.metered.ca:443",
      username: process.env.METERED_USERNAME,
      credential: process.env.METERED_PASSWORD,
    },
    {
      urls: "turns:global.relay.metered.ca:443",
      username: process.env.METERED_USERNAME,
      credential: process.env.METERED_PASSWORD,
    },
  ]);
});

// REQ-SEC-06: enriched health endpoint for the homepage counter + monitoring
// Cached so we don't recompute Map sizes on every poll (Home.jsx polls every 10s,
// so a 2s cache keeps the counter fresh without paying the full O(N) cost per hit).
// `spamEvents` is forward-declared near the top of the file so makeRateLimiter
// can bump it; we just reference the same binding here.
io.on("connect_error", () => { /* keep counter for visual only */ });

// Cached health metrics — recomputed on the cleanup tick (10s) so /api/health
// is a cheap O(1) read for the homepage pill and any external monitors.
const healthCache = {
  onlineUsers: 0,
  waitingUsers: 0,
  activePairs: 0,
  spamEventsLast24h: 0,
  uptimeSec: 0,
  status: "ok",
  cachedAt: 0,
};
function recomputeHealthCache() {
  // Count only sockets that are actually still connected — ghost queue entries
  // can otherwise inflate the counter.
  let liveWaiting = 0;
  for (const entry of waitingQueue) {
    const s = getSocket(entry.socketId);
    if (s && s.connected && !activePairs.has(entry.socketId)) liveWaiting += 1;
  }
  healthCache.onlineUsers = liveWaiting + activePairs.size;
  healthCache.waitingUsers = liveWaiting;
  healthCache.activePairs = activePairs.size / 2;
  healthCache.spamEventsLast24h = spamEvents;
  healthCache.uptimeSec = Math.floor(process.uptime());
  healthCache.cachedAt = Date.now();
}

app.get("/api/health", (req, res) => {
  // Cache for at most 2s so the counter still feels live to a polling user.
  if (Date.now() - healthCache.cachedAt > 2000) recomputeHealthCache();
  res.json(healthCache);
});

// Keep /health for the Render self-ping (returns lightweight 200)
app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// Backwards-compat root with the old field names
app.get("/", (req, res) => {
  res.json({
    status: "miloo server running ✅",
    waiting_users: waitingQueue.length,
    active_pairs: activePairs.size / 2,
    banned: bannedFingerprints.size,
    uptime: `${Math.floor(process.uptime() / 60)} mins`,
  });
});


const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Miloo server on port ${PORT} ✅`);
});
