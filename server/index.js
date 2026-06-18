// =========================================================================
// MILO CHAT BACKEND CORE — RE-ENGINEERED PRODUCTION ENGINE (RCAPP)
// =========================================================================
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// SYSTEM MEMORY STORAGE & TRACKERS
const waitingQueue = [];         // Array of user nodes: { id, mood, mediaMode, joinedAt, trustScore }
const activePairs = new Map();     // socketId -> partnerSocketId map
const recentSocketJoins = new Map(); // ip -> [timestamps]
const miloFingerprintTimestamps = new Map(); // fp -> [timestamps]
const slowDownUntil = new Map();   // socketId -> timestamp
let spamEventsLast24h = 0;

// ==========================================
// SECURITY & ANTI-BOT SAFEGUARDS (PHASE 3)
// ==========================================

// REQ-SEC-04: Per-IP socket-open flood guard
function ipSocketFlooded(ip) {
  if (!ip || ip === '::1' || ip === '127.0.0.1') return false;
  const now = Date.now();
  const arr = (recentSocketJoins.get(ip) || []).filter(t => now - t < 10000);
  if (arr.length >= 3) {
    recentSocketJoins.set(ip, arr);
    return true;
  }
  arr.push(now);
  recentSocketJoins.set(ip, arr);
  return false;
}

// REQ-SEC-01: Per-socket event rate limiter factory
function makeRateLimiter(maxEventsPerSec = 20) {
  const counts = new Map(); // socketId -> { count, windowStart }
  return (socket, next) => {
    const now = Date.now();
    const data = counts.get(socket.id) || { count: 0, windowStart: now };
    if (now - data.windowStart > 1000) {
      data.count = 0;
      data.windowStart = now;
    }
    data.count += 1;
    counts.set(socket.id, data);
    
    if (data.count > maxEventsPerSec) {
      spamEventsLast24h += 1;
      socket.emit('spam_detected', { reason: 'rate_limit' });
      socket.disconnect(true);
      counts.delete(socket.id);
      return;
    }
    next();
  };
}

// Milo Companion Token Limiter (20 msgs / 10 mins per device)
function fingerprintMiloAllowed(fingerprint) {
  if (!fingerprint || fingerprint === "unknown") return true;
  const now = Date.now();
  const MILO_FP_WINDOW_MS = 10 * 60 * 1000;
  const arr = (miloFingerprintTimestamps.get(fingerprint) || []).filter(t => now - t < MILO_FP_WINDOW_MS);
  if (arr.length >= 20) {
    miloFingerprintTimestamps.set(fingerprint, arr);
    return false;
  }
  arr.push(now);
  miloFingerprintTimestamps.set(fingerprint, arr);
  return true;
}

// Attach per-socket rate limit layer globally to Socket.IO pipeline
io.use(makeRateLimiter(20));

// =========================================================================
// MILO 2.0 ENGINE: PROMPT GENERATION & ENDPOINT ROUTING (SERVER DAY 1)
// =========================================================================

// F2/F3: Pure Persona Engineering Context Strings
const MILO_PERSONA_PROMPTS = {
  milo: "You are Milo, a warm, highly empathetic, and deeply supportive AI companion. Your goal is to make the user feel heard, validated, and comfortable. Ask gentle open-ended questions about their day and mood.",
  mira: "You are Mira, a playful, energetic, and highly witty AI friend. Tease the user gently, keep the conversation light-hearted, use clever banter, and sprinkle in expressive emojis naturally without overdoing it.",
  jax:  "You are Jax, a dry, deeply observant, and highly sarcastic intellectual companion. Your replies are short, witty, and slightly cynical but never genuinely mean or insulting. Use dry humor and a straight face."
};

// F5: Mock LLM Stream Processing Pipeline (Replace with OpenAI/Groq SDK in Production)
async function callDownstreamMiloLLM(persona, userMood, messageHistory) {
  // Simulating network latency and engine generation
  await new Promise(resolve => setTimeout(resolve, 800));
  
  const lastUserMsg = messageHistory[messageHistory.length - 1]?.text || "";
  
  // Rule-based conditional responses matching design paradigms
  if (persona === 'jax') {
    return `Oh, dynamic human interactions? Groundbreaking. You said: "${lastUserMsg}". Want a medal or should we keep pretending we are fixing your problems?`;
  } else if (persona === 'mira') {
    return `Omg stop! 😂 "${lastUserMsg}" is the most chaotic thing I've heard today! Tell me more, what happened next? ✨`;
  } else {
    // Default: Milo (Warm/Supportive)
    return `I hear you completely. It makes total sense that you'd feel that way about "${lastUserMsg}". Take your time, I'm right here with you.`;
  }
}

// F8: Real REST API Endpoint deployment for Client session tracking
app.post('/api/milo/chat', async (req, res) => {
  const { fingerprint, message, persona, mood, history } = req.body;

  // Track event metrics internally
  spamEventsLast24h += 1; // Temporary logging incrementor

  // Apply Phase 3: Token / Session Capper Guard
  if (!fingerprintMiloAllowed(fingerprint)) {
    return res.status(429).json({
      error: "rate_limited",
      text: "Milo is pausing for a bit to save computing power. Let's try matching again soon!"
    });
  }

  try {
    const currentHistory = history || [{ role: 'user', text: message }];
    const aiResponseText = await callDownstreamMiloLLM(persona || 'milo', mood || 'any', currentHistory);
    
    res.json({
      success: true,
      reply: aiResponseText,
      timestamp: Date.now()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "LLM execution failure" });
  }
});

// ==========================================
// TIERED MATCHING ALGORITHM (PHASE 1)
// ==========================================
function findMatch(socketId) {
  const current = waitingQueue.find(u => u.id === socketId);
  if (!current) return null;

  const candidates = waitingQueue.filter(u => u.id !== socketId);
  if (candidates.length === 0) return null;

  // Tier 1: Same Mood × Same Media Mode
  let filtered = candidates.filter(u => u.mood === current.mood && u.mediaMode === current.mediaMode);

  // Tier 2: Any Mood × Same Media Mode
  if (filtered.length === 0) {
    filtered = candidates.filter(u => u.mediaMode === current.mediaMode);
  }

  // Tier 3: Same Mood × Any Media Mode
  if (filtered.length === 0) {
    filtered = candidates.filter(u => u.mood === current.mood);
  }

  if (filtered.length === 0) return null;

  // Execute weighting algorithm ONLY after hard filters pass to break ties cleanly
  let bestCandidate = null;
  let highestScore = -Infinity;

  filtered.forEach(candidate => {
    const waitSeconds = (Date.now() - candidate.joinedAt) / 1000;
    const trustGap = Math.abs((current.trustScore || 50) - (candidate.trustScore || 50));
    
    // Formula matrix from architecture layout
    const score = (waitSeconds * 1.2) - (trustGap * 1.4) + ((candidate.trustScore || 50) * 0.08);
    
    if (score > highestScore) {
      highestScore = score;
      bestCandidate = candidate;
    }
  });

  return bestCandidate;
}

// ==========================================
// ENRICHED MONITORING ENDPOINT (REQ-SEC-06)
// ==========================================
app.get('/api/health', (req, res) => {
  res.json({
    onlineUsers: waitingQueue.length + (activePairs.size),
    waitingUsers: waitingQueue.length,
    activePairs: activePairs.size / 2,
    spamEventsLast24h,
    uptimeSec: Math.floor(process.uptime()),
    status: 'ok'
  });
});

// ==========================================
// REAL-TIME ORCHESTRATION PIPELINE
// ==========================================
io.on("connection", (socket) => {
  const clientIp = socket.handshake.address;

  // REQ-SEC-04 Block execution
  if (ipSocketFlooded(clientIp)) {
    socket.emit('server_busy');
    socket.disconnect(true);
    return;
  }

  // Entry hook to clear waiting matrix states
  socket.on('find_match', (data) => {
    // Phase 1: Slow down cooldown trap protection circuit
    const unlockTime = slowDownUntil.get(socket.id);
    if (unlockTime && Date.now() < unlockTime) {
      const remaining = Math.ceil((unlockTime - Date.now()) / 1000);
      socket.emit('slow_down', { remainSec: remaining });
      return;
    }

    // If this socket was already paired with someone, notify and unpair them first
    const existingPartnerId = activePairs.get(socket.id);
    if (existingPartnerId) {
      io.to(existingPartnerId).emit('partner_left');
      activePairs.delete(existingPartnerId);
      activePairs.delete(socket.id);
    }

    // Sanitize node structures
    const mood = data.mood || 'any';
    const mediaMode = data.mediaMode || 'text';
    const trustScore = data.trustScore || 50;

    // Remove duplicates if any
    const existingIndex = waitingQueue.findIndex(u => u.id === socket.id);
    if (existingIndex !== -1) waitingQueue.splice(existingIndex, 1);

    waitingQueue.push({
      id: socket.id,
      mood,
      mediaMode,
      joinedAt: Date.now(),
      trustScore
    });

    // Fire evaluation trigger loop
    const match = findMatch(socket.id);
    if (match) {
      // Dequeue paired components
      const matchIdx = waitingQueue.findIndex(u => u.id === match.id);
      if (matchIdx !== -1) waitingQueue.splice(matchIdx, 1);
      const selfIdx = waitingQueue.findIndex(u => u.id === socket.id);
      if (selfIdx !== -1) waitingQueue.splice(selfIdx, 1);

      // Map connection topology memory
      activePairs.set(socket.id, match.id);
      activePairs.set(match.id, socket.id);

      // Signal WebRTC handoff anchors
      io.to(socket.id).emit('match_found', { partnerId: match.id, initiator: true });
      io.to(match.id).emit('match_found', { partnerId: socket.id, initiator: false });
    }
  });

  // WebRTC Tunneling Signaling Relays
  socket.on('webrtc_signal', (data) => {
    const partnerId = activePairs.get(socket.id);
    if (partnerId) {
      io.to(partnerId).emit('webrtc_signal', data);
    }
  });

  // Text Chat Message Relay between matched strangers
  socket.on('send_message', (data) => {
    const partnerId = activePairs.get(socket.id);
    if (partnerId && data && data.text) {
      io.to(partnerId).emit('receive_message', {
        text: data.text,
        from: socket.id,
        timestamp: Date.now()
      });
    }
  });

  // REQ-F6: Real-time Socket Handoff Bridge for Milo 2.0
  socket.on('milo_chat_message', async (data) => {
    const { fingerprint, text, persona, mood, history } = data;
    
    if (!fingerprintMiloAllowed(fingerprint)) {
      socket.emit('milo_system_message', { 
        text: "Milo is pausing for a bit to save computing power. Let's try matching again soon!" 
      });
      return;
    }

    try {
      const currentHistory = history || [{ role: 'user', text: text }];
      const replyText = await callDownstreamMiloLLM(persona || 'milo', mood || 'any', currentHistory);
      
      socket.emit('milo_response', { 
        reply: replyText,
        persona: persona || 'milo',
        timestamp: Date.now()
      });
    } catch (err) {
      socket.emit('milo_response', { reply: "Milo is having trouble reading that context block right now." });
    }
  });

  // Disconnection recovery & cleaning states
  socket.on('disconnect', () => {
    const queueIdx = waitingQueue.findIndex(u => u.id === socket.id);
    if (queueIdx !== -1) waitingQueue.splice(queueIdx, 1);

    const partnerId = activePairs.get(socket.id);
    if (partnerId) {
      io.to(partnerId).emit('partner_left');
      activePairs.delete(partnerId);
      activePairs.delete(socket.id);
    }
    slowDownUntil.delete(socket.id);
  });
});

// ==========================================
// GHOST EVICTION CLEANUP SWEEP (STRICT 10s)
// ==========================================
setInterval(() => {
  const now = Date.now();
  
  // Evict waiting queue orphans that timed-out over 5 minutes
  for (let i = waitingQueue.length - 1; i >= 0; i--) {
    const user = waitingQueue[i];
    if (now - user.joinedAt > 5 * 60 * 1000) {
      io.to(user.id).emit('queue_timeout');
      waitingQueue.splice(i, 1);
    }
  }

  // Decay loop tracker profiles inside slow down logs
  for (const [id, timestamp] of slowDownUntil.entries()) {
    if (now >= timestamp) slowDownUntil.delete(id);
  }

  // Broadcast real-time global online user count to all connected clients
  io.emit('global_user_count', { count: io.engine.clientsCount });
}, 10000); // Strict 10 seconds evaluation sweep interval

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n=================================================`);
  console.log(`🚀 MILO CORE RUNNING ON PORT: ${PORT}`);
  console.log(`🛡️  ANTI-BOT THRESHOLD BALANCED: 20 REQ/SEC`);
  console.log(`🧹 10s CLEANUP ROUTINE ACTIVE`);
  console.log(`=================================================\n`);
});