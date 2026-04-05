const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

app.use(cors());
app.use(express.json());

// ─── Self-ping (Render free tier ko jaaga rakho) ───
const SELF_URL = 'https://rcapp-server.onrender.com';
setInterval(() => {
  fetch(SELF_URL)
    .then(() => console.log('Self-ping ✅'))
    .catch(() => console.log('Self-ping failed'));
}, 14 * 60 * 1000); // har 14 minute mein

// ─── In-memory storage ───
const waitingQueues = { vent: [], laugh: [], music: [], deep: [], gaming: [], culture: [], any: [] };
const activePairs = new Map();
const trustScores = new Map();
const reportCount = new Map();
const bannedFingerprints = new Set();
const ipJoinCount = new Map();
const recentSkips = new Map();

// ─── Auto cleanup (memory leak rokne ke liye) ───
setInterval(() => {
  const now = Date.now();
  // Purane IP counts saaf karo
  for (const [ip, data] of ipJoinCount.entries()) {
    if (now - data.lastReset > 30 * 60 * 1000) ipJoinCount.delete(ip);
  }
  // Purane skip records saaf karo
  for (const [id, skips] of recentSkips.entries()) {
    const recent = skips.filter(t => now - t < 60 * 1000);
    if (recent.length === 0) recentSkips.delete(id);
    else recentSkips.set(id, recent);
  }
  // Banned list agar bahut badi ho jaaye toh purani entries hata do
  if (bannedFingerprints.size > 10000) bannedFingerprints.clear();
  console.log(`Cleanup done. Active pairs: ${activePairs.size / 2}, Banned: ${bannedFingerprints.size}`);
}, 30 * 60 * 1000); // har 30 min mein

function isRateLimited(ip) {
  const now = Date.now();
  const data = ipJoinCount.get(ip) || { count: 0, lastReset: now };
  if (now - data.lastReset > 10 * 60 * 1000) { data.count = 0; data.lastReset = now; }
  data.count++;
  ipJoinCount.set(ip, data);
  return data.count > 15;
}

function isSpamSkipping(socketId) {
  const now = Date.now();
  const skips = recentSkips.get(socketId) || [];
  const recentOnes = skips.filter((t) => now - t < 60 * 1000);
  recentOnes.push(now);
  recentSkips.set(socketId, recentOnes);
  return recentOnes.length > 8;
}

function getTrustScore(socketId) { return trustScores.get(socketId) ?? 50; }
function updateTrust(socketId, delta) {
  const updated = Math.max(0, Math.min(100, getTrustScore(socketId) + delta));
  trustScores.set(socketId, updated);
}

function removeFromQueues(socketId) {
  for (const mood in waitingQueues) {
    waitingQueues[mood] = waitingQueues[mood].filter((id) => id !== socketId);
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
];
function getRandomStarter() { return convoStarters[Math.floor(Math.random() * convoStarters.length)]; }

io.on("connection", (socket) => {
  const clientIp = socket.handshake.headers["x-forwarded-for"] || socket.handshake.address;
  const fingerprint = socket.handshake.auth?.fingerprint || "unknown";
  console.log(`Connected: ${socket.id}`);

  if (bannedFingerprints.has(fingerprint)) { socket.emit("server_busy"); socket.disconnect(); return; }
  if (isRateLimited(clientIp)) { socket.emit("server_busy"); socket.disconnect(); return; }

  socket.on("find_match", ({ mood }) => {
    removeFromQueues(socket.id);
    const currentPartner = activePairs.get(socket.id);
    if (currentPartner) {
      activePairs.delete(socket.id);
      activePairs.delete(currentPartner);
      io.to(currentPartner).emit("partner_left");
    }
    if (isSpamSkipping(socket.id)) { socket.emit("slow_down", { waitSeconds: 10 }); return; }
    const selectedMood = mood || "any";
    const partner = findMatch(socket.id, selectedMood);
    if (partner) {
      activePairs.set(socket.id, partner);
      activePairs.set(partner, socket.id);
      const starter = getRandomStarter();
      const roomId = `${socket.id}-${partner}`;
      io.to(socket.id).emit("match_found", { partnerId: partner, initiator: true, roomId, starter });
      io.to(partner).emit("match_found", { partnerId: socket.id, initiator: false, roomId, starter });
    } else {
      waitingQueues[selectedMood].push(socket.id);
      socket.emit("waiting");
    }
  });

  socket.on("webrtc_offer", ({ offer, to }) => { io.to(to).emit("webrtc_offer", { offer, from: socket.id }); });
  socket.on("webrtc_answer", ({ answer, to }) => { io.to(to).emit("webrtc_answer", { answer, from: socket.id }); });
  socket.on("ice_candidate", ({ candidate, to }) => { io.to(to).emit("ice_candidate", { candidate, from: socket.id }); });

  socket.on("send_message", ({ message, to }) => {
    const linkPattern = /(https?:\/\/|t\.me\/|wa\.me\/|telegram|whatsapp)/i;
    if (linkPattern.test(message)) { socket.emit("message_blocked"); updateTrust(socket.id, -5); return; }
    if (message.length > 300) return;
    io.to(to).emit("receive_message", { message, from: socket.id });
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
    }
    socket.emit("report_received");
  });

  socket.on("disconnect", () => {
    removeFromQueues(socket.id);
    const partner = activePairs.get(socket.id);
    if (partner) { activePairs.delete(socket.id); activePairs.delete(partner); io.to(partner).emit("partner_left"); }
    trustScores.delete(socket.id);
    recentSkips.delete(socket.id);
    console.log(`Disconnected: ${socket.id}`);
  });
});

app.get("/", (req, res) => { res.json({ status: "Server running ✅", active: activePairs.size / 2 }); });
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => { console.log(`Server running on port ${PORT} ✅`); });
