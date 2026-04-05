const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const app = express();
const server = http.createServer(app);

// ─── Security Headers ───
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}))

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

app.use(cors());
app.use(express.json());

// ─── Rate limiting ───
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'busy' }
}));

// ─── Self ping ───
const SELF_URL = 'https://rcapp-server.onrender.com';
setInterval(() => {
  fetch(SELF_URL).catch(() => {});
}, 14 * 60 * 1000);

// ─── Storage ───
const waitingQueues = { vent: [], laugh: [], music: [], deep: [], gaming: [], culture: [], any: [] };
const activePairs = new Map();
const trustScores = new Map();
const reportCount = new Map();
const bannedFingerprints = new Set();
const ipJoinCount = new Map();
const recentSkips = new Map();
const connectionTime = new Map();

// ─── Auto cleanup ───
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of ipJoinCount.entries()) {
    if (now - data.lastReset > 30 * 60 * 1000) ipJoinCount.delete(ip);
  }
  for (const [id, skips] of recentSkips.entries()) {
    const recent = skips.filter(t => now - t < 60 * 1000);
    if (recent.length === 0) recentSkips.delete(id);
    else recentSkips.set(id, recent);
  }
  if (bannedFingerprints.size > 10000) bannedFingerprints.clear();
  console.log(`Cleanup ✅ | Pairs: ${activePairs.size / 2} | Banned: ${bannedFingerprints.size}`);
}, 30 * 60 * 1000);

// ─── Security Functions ───
function isRateLimited(ip) {
  const now = Date.now();
  const data = ipJoinCount.get(ip) || { count: 0, lastReset: now };
  if (now - data.lastReset > 10 * 60 * 1000) { data.count = 0; data.lastReset = now; }
  data.count++;
  ipJoinCount.set(ip, data);
  return data.count > 20;
}

function isSpamSkipping(socketId) {
  const now = Date.now();
  const skips = recentSkips.get(socketId) || [];
  const recentOnes = skips.filter(t => now - t < 60 * 1000);
  recentOnes.push(now);
  recentSkips.set(socketId, recentOnes);
  return recentOnes.length > 10;
}

function isSuspiciousMessage(message) {
  const patterns = [
    /(https?:\/\/)/i,
    /(t\.me\/|telegram)/i,
    /(wa\.me\/|whatsapp)/i,
    /(instagram\.com|snapchat)/i,
    /(\+\d{10,})/,
    /(join.*group|join.*channel)/i,
    /(earn.*money|make.*money|₹.*free)/i,
  ];
  return patterns.some(p => p.test(message));
}

function getTrustScore(socketId) { return trustScores.get(socketId) ?? 50; }
function updateTrust(socketId, delta) {
  const updated = Math.max(0, Math.min(100, getTrustScore(socketId) + delta));
  trustScores.set(socketId, updated);
  return updated;
}

function removeFromQueues(socketId) {
  for (const mood in waitingQueues) {
    waitingQueues[mood] = waitingQueues[mood].filter(id => id !== socketId);
  }
}

function findMatch(socketId, mood) {
  const trust = getTrustScore(socketId);
  const useQueue = trust < 20 ? "any" : mood;
  const queue = waitingQueues[useQueue];
  if (queue.length > 0) {
    const partnerId = queue.shift();
    if (partnerId === socketId) { queue.push(partnerId); return null; }
    return partnerId;
  }
  if (useQueue !== "any" && waitingQueues["any"].length > 0) return waitingQueues["any"].shift();
  return null;
}

const convoStarters = [
  "👋 Wave karo camera ko!",
  "😂 30 seconds mein apni worst joke sunao",
  "🤔 Ek cheez batao jo aaj interesting lagi",
  "📦 Apne room ki sabse weird cheez dikhao",
  "🎵 Abhi jo song sun rahe ho woh batao",
  "🌍 Ek place batao jahan bahut jaana chahte ho",
  "⚡ Ek superpower choose karo — fly ya invisible?",
  "🍕 Abhi kya kha rahe ho ya khaoge?",
];
function getRandomStarter() { return convoStarters[Math.floor(Math.random() * convoStarters.length)]; }

// ─── Socket Logic ───
io.on("connection", (socket) => {
  const clientIp = socket.handshake.headers["x-forwarded-for"]?.split(',')[0] || socket.handshake.address;
  const fingerprint = socket.handshake.auth?.fingerprint || "unknown";
  connectionTime.set(socket.id, Date.now());

  // Silent ban check
  if (bannedFingerprints.has(fingerprint)) {
    socket.emit("server_busy");
    socket.disconnect();
    return;
  }

  // Rate limit check
  if (isRateLimited(clientIp)) {
    socket.emit("server_busy");
    socket.disconnect();
    return;
  }

  console.log(`Connected: ${socket.id} | Trust: ${getTrustScore(socket.id)}`);

  socket.on("find_match", ({ mood }) => {
    removeFromQueues(socket.id);
    const currentPartner = activePairs.get(socket.id);
    if (currentPartner) {
      activePairs.delete(socket.id);
      activePairs.delete(currentPartner);
      io.to(currentPartner).emit("partner_left");
    }

    if (isSpamSkipping(socket.id)) {
      socket.emit("slow_down", { waitSeconds: 15 });
      return;
    }

    const selectedMood = mood || "any";
    const partner = findMatch(socket.id, selectedMood);

    if (partner) {
      activePairs.set(socket.id, partner);
      activePairs.set(partner, socket.id);
      const starter = getRandomStarter();
      io.to(socket.id).emit("match_found", { partnerId: partner, initiator: true, starter });
      io.to(partner).emit("match_found", { partnerId: socket.id, initiator: false, starter });
      console.log(`Matched: ${socket.id} ↔ ${partner}`);
    } else {
      waitingQueues[selectedMood].push(socket.id);
      socket.emit("waiting");
    }
  });

  socket.on("webrtc_offer", ({ offer, to }) => { io.to(to).emit("webrtc_offer", { offer, from: socket.id }); });
  socket.on("webrtc_answer", ({ answer, to }) => { io.to(to).emit("webrtc_answer", { answer, from: socket.id }); });
  socket.on("ice_candidate", ({ candidate, to }) => { io.to(to).emit("ice_candidate", { candidate, from: socket.id }); });

  socket.on("send_message", ({ message, to }) => {
    if (!message || typeof message !== 'string') return;
    if (message.length > 300) return;

    if (isSuspiciousMessage(message)) {
      socket.emit("message_blocked");
      updateTrust(socket.id, -10);
      const newTrust = getTrustScore(socket.id);
      if (newTrust <= 0) {
        bannedFingerprints.add(fingerprint);
        socket.emit("server_busy");
        socket.disconnect();
      }
      return;
    }

    io.to(to).emit("receive_message", { message });
  });

  socket.on("good_convo", () => {
    updateTrust(socket.id, +5);
    const partner = activePairs.get(socket.id);
    if (partner) updateTrust(partner, +5);
  });

  socket.on("report_user", () => {
    const partner = activePairs.get(socket.id);
    if (!partner) return;
    const count = (reportCount.get(partner) || 0) + 1;
    reportCount.set(partner, count);
    updateTrust(partner, -20);
    if (count >= 3) {
      bannedFingerprints.add(partner);
      io.to(partner).emit("server_busy");
      io.sockets.sockets.get(partner)?.disconnect();
      console.log(`Auto-banned: ${partner}`);
    }
    socket.emit("report_received");
  });

  socket.on("disconnect", () => {
    removeFromQueues(socket.id);
    const partner = activePairs.get(socket.id);
    if (partner) {
      activePairs.delete(socket.id);
      activePairs.delete(partner);
      io.to(partner).emit("partner_left");
    }
    trustScores.delete(socket.id);
    recentSkips.delete(socket.id);
    connectionTime.delete(socket.id);
    console.log(`Disconnected: ${socket.id}`);
  });
});

// ─── Health check ───
app.get("/", (req, res) => {
  res.json({
    status: "miloo server running ✅",
    active_users: activePairs.size / 2,
    banned: bannedFingerprints.size,
    uptime: Math.floor(process.uptime() / 60) + " mins"
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => { console.log(`Miloo server running on port ${PORT} ✅`); });
