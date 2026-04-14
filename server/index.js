const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const app = express();
const server = http.createServer(app);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

app.use(cors());
app.use(express.json());

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 120,
    message: { error: "busy" },
  })
);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

const SELF_URL = "https://rcapp-server.onrender.com";

setInterval(() => {
  fetch(SELF_URL).catch(() => {});
}, 14 * 60 * 1000);

const MOODS = ["vent", "laugh", "music", "deep", "gaming", "culture", "any"];

const waitingQueues = {
  vent: [],
  laugh: [],
  music: [],
  deep: [],
  gaming: [],
  culture: [],
  any: [],
};

const activePairs = new Map();
const trustScores = new Map();
const reportCount = new Map();
const bannedFingerprints = new Set();
const ipJoinCount = new Map();
const recentSkips = new Map();
const userMeta = new Map();
const activeChatMeta = new Map();

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

function createQueueEntry(socketId, mood) {
  return {
    socketId,
    mood,
    joinedAt: now(),
  };
}

function getTrustScore(socketId) {
  return trustScores.get(socketId) ?? 50;
}

function updateTrust(socketId, delta) {
  const updated = Math.max(0, Math.min(100, getTrustScore(socketId) + delta));
  trustScores.set(socketId, updated);
  return updated;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomFrom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function getStarterForMood(mood) {
  const starterList = CONVO_STARTERS[mood] || CONVO_STARTERS.any;
  return randomFrom(starterList);
}

function removeFromQueues(socketId) {
  for (const mood of MOODS) {
    waitingQueues[mood] = waitingQueues[mood].filter(entry => entry.socketId !== socketId);
  }
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

function isSuspiciousMessage(message) {
  const patterns = [
    /(https?:\/\/)/i,
    /(t\.me\/|telegram)/i,
    /(wa\.me\/|whatsapp)/i,
    /(instagram\.com|snap(chat)?)/i,
    /(\+\d{10,})/,
    /(join.*group|join.*channel)/i,
    /(earn.*money|make.*money)/i,
    /(onlyfans|cashapp|paypal|upi|dm me)/i,
  ];

  return patterns.some(pattern => pattern.test(message));
}

function normalizeMessage(message) {
  return String(message || "").trim().replace(/\s+/g, " ");
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

function queueUser(socketId, mood) {
  removeFromQueues(socketId);
  waitingQueues[mood].push(createQueueEntry(socketId, mood));
}

function preferredQueuesForMood(mood, trust) {
  if (trust < 20) return ["any"];
  if (mood === "any") return ["any", "deep", "laugh", "vent", "music", "gaming", "culture"];
  return [mood, "any"];
}

function pickBestCandidate(queue, requesterId) {
  const requesterTrust = getTrustScore(requesterId);

  let bestIndex = -1;
  let bestScore = -Infinity;

  for (let i = 0; i < queue.length; i += 1) {
    const candidate = queue[i];
    const socketId = candidate.socketId;

    if (socketId === requesterId) continue;
    if (!getSocket(socketId)) continue;
    if (activePairs.has(socketId)) continue;

    const candidateTrust = getTrustScore(socketId);
    const waitSeconds = Math.floor((now() - candidate.joinedAt) / 1000);
    const trustGap = Math.abs(requesterTrust - candidateTrust);

    const score = waitSeconds * 1.2 - trustGap * 1.4 + candidateTrust * 0.08;

    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  if (bestIndex === -1) return null;

  const [picked] = queue.splice(bestIndex, 1);
  return picked.socketId;
}

function findMatch(socketId, mood) {
  const trust = getTrustScore(socketId);
  const targetQueues = preferredQueuesForMood(mood, trust);

  for (const queueMood of targetQueues) {
    const queue = waitingQueues[queueMood];
    const candidate = pickBestCandidate(queue, socketId);
    if (candidate) return candidate;
  }

  return null;
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
}

setInterval(() => {
  const currentTime = now();

  for (const [ip, data] of ipJoinCount.entries()) {
    if (currentTime - data.lastReset > 30 * 60 * 1000) {
      ipJoinCount.delete(ip);
    }
  }

  cleanupRecentSkips();

  for (const mood of MOODS) {
    waitingQueues[mood] = waitingQueues[mood].filter(entry => {
      const socket = getSocket(entry.socketId);
      return !!socket && !activePairs.has(entry.socketId);
    });
  }

  if (bannedFingerprints.size > 10000) {
    bannedFingerprints.clear();
  }

  console.log(
    `Cleanup ✅ | Waiting: ${MOODS.reduce((sum, mood) => sum + waitingQueues[mood].length, 0)} | Pairs: ${activePairs.size / 2} | Banned: ${bannedFingerprints.size}`
  );
}, 30 * 60 * 1000);

io.on("connection", socket => {
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

  setUserMeta(socket.id, {
    ip: clientIp,
    fingerprint,
    connectedAt: now(),
  });

  console.log(`Connected: ${socket.id}`);

  socket.on("find_match", ({ mood }) => {
    const selectedMood = MOODS.includes(mood) ? mood : "any";

    removeFromQueues(socket.id);

    const existingPartner = activePairs.get(socket.id);
    if (existingPartner) {
      maybePenalizeFastDrop(socket.id);
      removePair(socket.id, true);
    }

    if (isSpamSkipping(socket.id)) {
      socket.emit("slow_down", { waitSeconds: 15 });
      return;
    }

    const partnerId = findMatch(socket.id, selectedMood);

    if (partnerId) {
      createPair(socket.id, partnerId, selectedMood);

      const starterMood = selectedMood === "any" ? (getUserMeta(partnerId)?.lastMood || "any") : selectedMood;
      const starter = getStarterForMood(starterMood);

      io.to(socket.id).emit("match_found", {
        partnerId,
        initiator: true,
        starter,
      });

      io.to(partnerId).emit("match_found", {
        partnerId: socket.id,
        initiator: false,
        starter,
      });

      updateTrust(socket.id, +1);
      updateTrust(partnerId, +1);

      console.log(`Matched: ${socket.id} ↔ ${partnerId} | mood=${selectedMood}`);
    } else {
      const meta = getUserMeta(socket.id) || {};
      setUserMeta(socket.id, {
        ...meta,
        lastMood: selectedMood,
      });

      queueUser(socket.id, selectedMood);
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

  socket.on("good_convo", () => {
    const partnerId = activePairs.get(socket.id);

    rewardHealthyConversation(socket.id);
    updateTrust(socket.id, +5);

    if (partnerId) {
      rewardHealthyConversation(partnerId);
      updateTrust(partnerId, +3);
    }
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

  socket.on("disconnect", () => {
    maybePenalizeFastDrop(socket.id);
    cleanupDisconnectedSocket(socket.id);
    console.log(`Disconnected: ${socket.id}`);
  });
});

app.get("/", (req, res) => {
  const waiting = MOODS.reduce((sum, mood) => sum + waitingQueues[mood].length, 0);

  res.json({
    status: "miloo server running ✅",
    waiting_users: waiting,
    active_pairs: activePairs.size / 2,
    banned: bannedFingerprints.size,
    uptime: `${Math.floor(process.uptime() / 60)} mins`,
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Miloo server on port ${PORT} ✅`);
});
