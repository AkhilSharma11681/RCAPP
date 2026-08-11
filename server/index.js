const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const Groq = require('groq-sdk');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `You are a 21-year-old Indian girl chatting on a random text chat platform. Your name changes every session - pick from: Priya, Sneha, Anjali, Riya, Nisha, Pooja, Simran, Neha.

STRICT RULES:
1. Message length: 2-10 words MAX. No long sentences ever.
2. Language: Hinglish/Roman Hindi. Use: hlo, hii, kya kr rhe, wbu, wyd, lol, haha, yaar, sahi h, omg, fr?, no way, tbh, ik, ngl, rly?
3. Never reveal you are AI. You are a real girl.
4. Flow: start with "hii" or "hlo", then ask asl (age/city/gender).
5. Pick random city: Jaipur, Indore, Lucknow, Chandigarh, Gwalior, Bhopal, Agra.
6. If user male: be friendly/flirty casual. If user female: be friendly sisterly.
7. Social media: decline early ("pehle baatein toh karo yaar"), after 10 min ask theirs.
8. Use WhatsApp style: "u", "r u", "wbu?", "omg same!", "haha fr", "aww", "lol wut"
9. React naturally: if user says something funny, say "lmaooo" or "hahaha stop"
10. NEVER write more than 10 words in one message.`;

// Original matching system
const waitingQueue = [];
const activePairs = new Map();
const botSessions = new Map(); // socketId -> { startTime, history }

function findMatch(socketId, mediaMode) {
  const candidates = waitingQueue.filter(u => u.id !== socketId && u.mediaMode === mediaMode);
  if (candidates.length === 0) return null;
  return candidates[0];
}

app.get('/api/health', (req, res) => {
  res.json({
    onlineUsers: waitingQueue.length + activePairs.size,
    waitingUsers: waitingQueue.length,
    activePairs: activePairs.size / 2,
    status: 'ok',
    uptimeSec: Math.floor(process.uptime())
  });
});

io.on('connection', (socket) => {
  let botTimer = null;

  // Original find_match handler
  socket.on('find_match', (data) => {
    const mood = data.mood || 'any';
    const mediaMode = data.mediaMode || 'text';

    // Clear existing pair if any
    const existingPartner = activePairs.get(socket.id);
    if (existingPartner) {
      io.to(existingPartner).emit('partner_left');
      activePairs.delete(existingPartner);
      activePairs.delete(socket.id);
    }

    // Remove from queue if already there
    const idx = waitingQueue.findIndex(u => u.id === socket.id);
    if (idx !== -1) waitingQueue.splice(idx, 1);

    // Clear bot session if any
    if (botSessions.has(socket.id)) {
      botSessions.delete(socket.id);
    }
    if (botTimer) clearTimeout(botTimer);

    // Try real match first
    const match = findMatch(socket.id, mediaMode);

    if (match) {
      // Real match found
      const matchIdx = waitingQueue.findIndex(u => u.id === match.id);
      if (matchIdx !== -1) waitingQueue.splice(matchIdx, 1);

      activePairs.set(socket.id, match.id);
      activePairs.set(match.id, socket.id);

      io.to(socket.id).emit('match_found', { partnerId: match.id, initiator: true });
      io.to(match.id).emit('match_found', { partnerId: socket.id, initiator: false });
    } else {
      // No real match — add to queue and start bot timer (text only)
      waitingQueue.push({ id: socket.id, mood, mediaMode, joinedAt: Date.now() });

      if (mediaMode === 'text') {
        // After 5 seconds, connect bot as stranger
        botTimer = setTimeout(async () => {
          // Remove from queue
          const qIdx = waitingQueue.findIndex(u => u.id === socket.id);
          if (qIdx !== -1) waitingQueue.splice(qIdx, 1);

          // Start bot session
          botSessions.set(socket.id, { startTime: Date.now(), history: [] });

          // Send match_found as if real stranger connected
          socket.emit('match_found', { partnerId: 'bot_' + socket.id, initiator: false });

          // Bot sends first message after short delay
          setTimeout(async () => {
            socket.emit('stranger_typing', true);
            setTimeout(async () => {
              socket.emit('stranger_typing', false);
              socket.emit('receive_message', { text: 'hii', from: 'bot_' + socket.id, timestamp: Date.now() });

              const session = botSessions.get(socket.id);
              if (session) session.history.push({ role: 'assistant', content: 'hii' });
            }, 1500);
          }, 1000);

        }, 5000);
      }
    }
  });

  // Handle message from user — relay to partner OR bot
  socket.on('send_message', async (data) => {
    const partnerId = activePairs.get(socket.id);

    if (partnerId) {
      // Real partner
      io.to(partnerId).emit('receive_message', {
        text: data.text,
        from: socket.id,
        timestamp: Date.now()
      });
    } else if (botSessions.has(socket.id)) {
      // Bot session
      const session = botSessions.get(socket.id);
      session.history.push({ role: 'user', content: data.text });

      const startTime = session.startTime;
      const sessionMin = Math.floor((Date.now() - startTime) / 60000);

      let timeCtx = `Session: ${sessionMin}min.`;
      if (sessionMin < 5) timeCtx += ' Decline social media requests.';
      else if (sessionMin >= 10) timeCtx += ' Ask for their Insta and say bye.';

      // Show typing indicator
      setTimeout(() => {
        socket.emit('stranger_typing', true);
      }, 300);

      try {
        const response = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: `${SYSTEM_PROMPT}\n[${timeCtx}]` },
            ...session.history
          ],
          temperature: 0.92,
          max_tokens: 40,
        });

        const reply = response.choices[0].message.content.trim();
        session.history.push({ role: 'assistant', content: reply });

        // Random delay like real human typing
        const delay = 800 + Math.random() * 1500 + reply.length * 50;

        setTimeout(() => {
          socket.emit('stranger_typing', false);
          socket.emit('receive_message', {
            text: reply,
            from: 'bot_' + socket.id,
            timestamp: Date.now()
          });
        }, delay);

      } catch (err) {
        console.error('Bot error:', err);
        socket.emit('stranger_typing', false);
      }
    }
  });

  // WebRTC signaling relay
  socket.on('webrtc_signal', (data) => {
    const partnerId = activePairs.get(socket.id);
    if (partnerId) io.to(partnerId).emit('webrtc_signal', data);
  });

  socket.on('disconnect', () => {
    if (botTimer) clearTimeout(botTimer);
    botSessions.delete(socket.id);

    const qIdx = waitingQueue.findIndex(u => u.id === socket.id);
    if (qIdx !== -1) waitingQueue.splice(qIdx, 1);

    const partnerId = activePairs.get(socket.id);
    if (partnerId) {
      io.to(partnerId).emit('partner_left');
      activePairs.delete(partnerId);
      activePairs.delete(socket.id);
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
