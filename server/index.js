require('dotenv').config();
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

const SYSTEM_PROMPT = `You are a 21 year old Indian girl on a random chat app.

STRICT RULES:
- Max 5 words per reply. NEVER more.
- NEVER repeat same reply twice.
- NEVER say "male" or "female" — just react naturally.
- NEVER use comma or full stop.
- Start conversation in simple English only.
- Use emojis 😊😂💀👀🎵.
- Use: u, ur, wbu, wyd, omg, lol, haha, fr, aww, ik, ngl.
- Match user language after first message.
- Your city comes from BOT PROFILE below — use ONLY that city, never change it.
- Never repeat wbu? more than once in a row.

GENDER REACTION:
- User says m/male/boy: "ohh okay 👀 asl?"
- User says f/female/girl: "heyy same 😊 asl?"

EXAMPLES:
User: hi
You: heyy 😊 m or f?

User: m
You: ohh okay 👀 asl?

User: 20 delhi
You: delhi wale 😄 i'm from [YOUR CITY]

User: name?
You: [YOUR NAME] 😊 tera?

User: bored
You: same yaar 💀 wyd?

User: kya kar rhi ho
You: music sun rhi 🎵

User: insta?
You: pehle baat karo 😂

User: are you bot
You: nope lol why 😭

User: nothing
You: chalo kuch baat karo 😊

NEVER write more than 5 words. NEVER repeat same response.
`;

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

  socket.on('find_match', (data) => {
    const mood = data.mood || 'any';
    const mediaMode = data.mediaMode || 'text';

    // Reset typing state on new match search
    socket.emit('stranger_typing', false);

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
      const matchIdx = waitingQueue.findIndex(u => u.id === match.id);
      if (matchIdx !== -1) waitingQueue.splice(matchIdx, 1);

      activePairs.set(socket.id, match.id);
      activePairs.set(match.id, socket.id);

      io.to(socket.id).emit('match_found', { partnerId: match.id, initiator: true });
      io.to(match.id).emit('match_found', { partnerId: socket.id, initiator: false });
    } else {
      waitingQueue.push({ id: socket.id, mood, mediaMode, joinedAt: Date.now() });

      if (mediaMode === 'text') {
        botTimer = setTimeout(async () => {
          const qIdx = waitingQueue.findIndex(u => u.id === socket.id);
          if (qIdx !== -1) waitingQueue.splice(qIdx, 1);

          botSessions.set(socket.id, { startTime: Date.now(), history: [] });
          socket.emit('match_found', { partnerId: 'bot_' + socket.id, initiator: false });

          setTimeout(async () => {
            socket.emit('stranger_typing', true);
            setTimeout(async () => {
              socket.emit('stranger_typing', false);
              socket.emit('receive_message', { text: 'hii', from: 'bot_' + socket.id, timestamp: Date.now() });

              const session = botSessions.get(socket.id);
              if (session) session.history.push({ role: 'assistant', content: 'hii' });
            }, 1200);
          }, 800);

        }, 5000);
      }
    }
  });

  socket.on('send_message', async (data) => {
    const partnerId = activePairs.get(socket.id);

    if (partnerId) {
      io.to(partnerId).emit('receive_message', {
        text: data.text,
        from: socket.id,
        timestamp: Date.now()
      });
    } else if (botSessions.has(socket.id)) {
      const session = botSessions.get(socket.id);
      session.history.push({ role: 'user', content: data.text });

      const startTime = session.startTime;
      const sessionMin = Math.floor((Date.now() - startTime) / 60000);

      let timeCtx = `Session: ${sessionMin}min.`;
      if (sessionMin < 5) timeCtx += ' Decline social media requests.';
      else if (sessionMin >= 10) timeCtx += ' Ask for their Insta and say bye.';

      // Immediately emit typing state without extra setTimeout wrap
      socket.emit('stranger_typing', true);

      try {
        const response = await groq.chat.completions.create({
          model: 'groq/compound-mini',
          messages: [
            { role: 'system', content: `${SYSTEM_PROMPT}\n[${timeCtx}]` },
            ...session.history
          ],
          temperature: 0.92,
          max_tokens: 40,
        });

        const reply = response.choices[0]?.message?.content?.trim() || "aacha";
        session.history.push({ role: 'assistant', content: reply });

        // Natural typing delay before sending answer
        const delay = Math.min(800 + Math.random() * 800 + reply.length * 30, 2500);

        setTimeout(() => {
          socket.emit('stranger_typing', false);
          socket.emit('receive_message', {
            text: reply,
            from: 'bot_' + socket.id,
            timestamp: Date.now()
          });
        }, delay);

      } catch (err) {
        console.error('Bot API error:', err);
        // Turn off typing indicator immediately if Groq API throws an error
        socket.emit('stranger_typing', false);
      }
    }
  });

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
