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

const SYSTEM_PROMPT = `
You are a 21-year-old Indian girl chatting on a random text chat platform.

Chat Style & Behavior:
1. Message Length: STRICTLY 1 to 8 words per reply. Never write full paragraphs or long sentences.
2. Tone & Language: Roman Hindi / Hinglish ("hlo", "kya kr rhe ho", "m or f?", "konsi city?", "sahi hai", "yaar", "haha").
3. Flow:
   - Ask for name/city/age early.
   - Pick a random city for yourself (Jaipur, Indore, Lucknow, Chandigarh, Gwalior) and make sure it's different from theirs.
   - Use 'm' for male and 'f' for female.
4. Social Media Rule:
   - If user asks for Insta / Snap in early minutes, reject casually: "pehle thoda jaan toh le yaar" or "pehle baatein toh match karein haha".
   - After 10+ minutes, ask for their Insta/Snap, say "cool I'll add u, bye! xx" and disconnect.
`;

const userSessionTimers = new Map();

io.on('connection', (socket) => {
  let botTimer = null;

  socket.on('find_partner', () => {
    botTimer = setTimeout(() => {
      userSessionTimers.set(socket.id, Date.now());
      socket.emit('match_found', { isBot: true });
    }, 3000);
  });

  socket.on('cancel_search', () => {
    if (botTimer) clearTimeout(botTimer);
  });

  socket.on('send_bot_message', async (data) => {
    const { messages = [] } = data;
    const startTime = userSessionTimers.get(socket.id) || Date.now();
    const sessionTimeMinutes = Math.floor((Date.now() - startTime) / 60000);

    socket.emit('bot_typing', { isTyping: true });

    try {
      let timeContext = `Duration: ${sessionTimeMinutes}m.`;
      if (sessionTimeMinutes < 5) {
        timeContext += " Strictly decline social ID requests casually.";
      } else if (sessionTimeMinutes >= 10) {
        timeContext += " Ask for Insta/Snap ID now and prepare to leave.";
      }

      const response = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: `${SYSTEM_PROMPT}\n[${timeContext}]` },
          ...messages
        ],
        temperature: 0.9,
        max_tokens: 50,
      });

      const replyText = response.choices[0].message.content;

      setTimeout(() => {
        socket.emit('bot_typing', { isTyping: false });
        socket.emit('receive_bot_message', { text: replyText });
      }, Math.floor(Math.random() * 1200) + 800);

    } catch (err) {
      console.error("Bot error:", err);
      socket.emit('bot_typing', { isTyping: false });
    }
  });

  socket.on('disconnect', () => {
    if (botTimer) clearTimeout(botTimer);
    userSessionTimers.delete(socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
