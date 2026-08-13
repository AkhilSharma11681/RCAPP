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
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

// ============================================================
// CONFIG
// ============================================================

const BOT_DELAY_MIN = 900;
const BOT_DELAY_MAX = 2200;

const BOT_MATCH_DELAY = 5000;

const MAX_HISTORY = 24;

// After this many vulgar messages, AI leaves.
const MAX_VULGAR_MESSAGES = 3;

// How long until old vulgar messages stop counting.
const VULGAR_WINDOW_MS = 10 * 60 * 1000;

// ============================================================
// INDIAN PERSONA DATA
// ============================================================

const INDIAN_NAMES = [
  'Priya',
  'Sneha',
  'Ananya',
  'Riya',
  'Nisha',
  'Pooja',
  'Simran',
  'Neha',
  'Kavya',
  'Ishita',
  'Mehak',
  'Aditi',
  'Muskan',
  'Shreya',
  'Sakshi'
];

const INDIAN_CITIES = [
  'Delhi',
  'Mumbai',
  'Jaipur',
  'Pune',
  'Bangalore',
  'Hyderabad',
  'Lucknow',
  'Indore',
  'Chandigarh',
  'Bhopal',
  'Agra',
  'Noida',
  'Gurgaon',
  'Ghaziabad',
  'Kanpur',
  'Nagpur',
  'Ahmedabad',
  'Surat',
  'Vadodara',
  'Dehradun',
  'Varanasi',
  'Prayagraj',
  'Amritsar',
  'Kolkata',
  'Patna',
  'Ranchi',
  'Jodhpur',
  'Udaipur',
  'Kochi',
  'Coimbatore',
  'Mysore',
  'Bhubaneswar'
];

const OPENING_MESSAGES = [
  'hii :)',
  'hey, kya scene?',
  'hlooo 👀',
  'heyy, kaise ho?',
  'hii, kya chal rha?',
  'hey stranger :)',
  'hlo, bored ho kya?',
  'heyy yaar',
  'hii, random match huh 😭',
  'hlooo, kya kr rhe?',
  'hey, sab badhiya?',
  'hii hii 👀',
  'heyy, kaisa jaa rha din?',
  'hlo, free ho?',
  'hey stranger, kya haal?'
];

const HINGLISH_FALLBACKS = [
  'haan haha',
  'acha acha 😭',
  'sahi h yaar',
  'ohh nicee',
  'haha same',
  'arre waah',
  'hmm interesting',
  'accha, batao',
  'lol fr',
  'haan samajh gayi',
  'ohh really?',
  'no wayy 😭',
  'sahi hai',
  'haha true',
  'acha 😂'
];

// ============================================================
// MATCHING STATE
// ============================================================

const waitingQueue = [];
const activePairs = new Map();

// socketId -> bot session
const botSessions = new Map();

// socketId -> timer
const botTimers = new Map();

// ============================================================
// RANDOM HELPERS
// ============================================================

function randomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function randomName() {
  return randomItem(INDIAN_NAMES);
}

function randomCity() {
  return randomItem(INDIAN_CITIES);
}

function randomOpening() {
  return randomItem(OPENING_MESSAGES);
}

// ============================================================
// TEXT NORMALIZATION
// ============================================================

function normalizeText(text = '') {
  return String(text)
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s@*_+-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// More aggressive normalization for simple evasion attempts.
// Example:
// f.u.c.k -> fuck
// f u c k -> fuck
// b!tch -> bitch
function abuseNormalized(text = '') {
  let t = String(text)
    .toLowerCase()
    .normalize('NFKC');

  t = t
    .replace(/[@4]/g, 'a')
    .replace(/[3]/g, 'e')
    .replace(/[1!|]/g, 'i')
    .replace(/[0]/g, 'o')
    .replace(/[5$]/g, 's')
    .replace(/[7]/g, 't')
    .replace(/[*_.-]/g, '');

  // Catch spaced-out profanity such as:
  // f u c k
  // b i t c h
  t = t.replace(/\b([a-z])(?:\s+)([a-z])(?:\s+)([a-z])(?:\s+)([a-z])\b/g, '$1$2$3$4');

  return t.replace(/\s+/g, ' ').trim();
}

// ============================================================
// CONTENT DETECTION
// ============================================================

function isVulgar(text = '') {
  const raw = normalizeText(text);
  const compact = abuseNormalized(text);

  const patterns = [
    // English profanity
    /\bfuck(?:ing|ed|er)?\b/i,
    /\bfck\b/i,
    /\bshit\b/i,
    /\bbitch\b/i,
    /\basshole\b/i,
    /\bstfu\b/i,
    /\bdumbass\b/i,

    // Sexual/vulgar
    /\bdick\b/i,
    /\bpenis\b/i,
    /\bpussy\b/i,
    /\bboobs?\b/i,
    /\btits?\b/i,
    /\bnudes?\b/i,
    /\bnaked\b/i,
    /\bsex\b/i,
    /\bsexual\b/i,
    /\bblowjob\b/i,
    /\bhandjob\b/i,

    // Common Indian/Hinglish abuse
    /\bbsdk\b/i,
    /\bchutiya\b/i,
    /\bgandu\b/i,
    /\bgaand\b/i,
    /\blodu\b/i,
    /\bsaala\b/i,
    /\bsaale\b/i,
    /\bkamina\b/i,
    /\bmadarchod\b/i,
    /\bbhenchod\b/i,
    /\bbhosdike\b/i,
    /\bmc\b/i,
    /\bbc\b/i,

    // Explicit abusive combinations
    /\bmotherfucker\b/i,
    /\bmother\s*fucker\b/i,
    /\bfuck\s*you\b/i
  ];

  return patterns.some(pattern => pattern.test(raw) || pattern.test(compact));
}

// ============================================================
// SPECIAL QUESTIONS
// ============================================================

function isWBU(text = '') {
  const t = normalizeText(text);

  return (
    /\bwbu\b/.test(t) ||
    /\bwhat about you\b/.test(t) ||
    /\band you\b/.test(t) ||
    /\bhow about you\b/.test(t) ||
    /\baur tum\b/.test(t) ||
    /\baur aap\b/.test(t) ||
    /\baur tu\b/.test(t)
  );
}

function isASLMeaning(text = '') {
  const t = normalizeText(text);

  return (
    /\bwhat is asl\b/.test(t) ||
    /\bwhats asl\b/.test(t) ||
    /\bwhat does asl mean\b/.test(t) ||
    /\basl meaning\b/.test(t)
  );
}

function isNameQuestion(text = '') {
  const t = normalizeText(text);

  return (
    /\bwhat is your name\b/.test(t) ||
    /\bwhat's your name\b/.test(t) ||
    /\bwhats your name\b/.test(t) ||
    /\byour name\b/.test(t) ||
    /\bur name\b/.test(t) ||
    /\bwho are you\b/.test(t) ||
    /\bnaam kya hai\b/.test(t) ||
    /\btumhara naam\b/.test(t) ||
    /\baapka naam\b/.test(t)
  );
}

function isAgeQuestion(text = '') {
  const t = normalizeText(text);

  return (
    /\bhow old are you\b/.test(t) ||
    /\byour age\b/.test(t) ||
    /\bur age\b/.test(t) ||
    /\bage kya hai\b/.test(t) ||
    /\bkitne saal\b/.test(t)
  );
}

function isLocationQuestion(text = '') {
  const t = normalizeText(text);

  return (
    /\bwhere are you\b/.test(t) ||
    /\bwhere are you from\b/.test(t) ||
    /\bwhere do you live\b/.test(t) ||
    /\byour city\b/.test(t) ||
    /\bwhere r u from\b/.test(t) ||
    /\bkaha se ho\b/.test(t) ||
    /\bkahan se ho\b/.test(t) ||
    /\bkahaan se ho\b/.test(t) ||
    /\bkidhar se ho\b/.test(t) ||
    /\baap kaha\b/.test(t) ||
    /\baap kahan\b/.test(t) ||
    /\btum kaha\b/.test(t) ||
    /\btum kahan\b/.test(t)
  );
}

function isActivityQuestion(text = '') {
  const t = normalizeText(text);

  return (
    /\bwhat are you doing\b/.test(t) ||
    /\bwhat are u doing\b/.test(t) ||
    /\bwhat r u doing\b/.test(t) ||
    /\bwyd\b/.test(t) ||
    /\bwhat do you do\b/.test(t) ||
    /\bwhat do u do\b/.test(t) ||
    /\bkya kar rahe\b/.test(t) ||
    /\bkya kr rahe\b/.test(t) ||
    /\bkya kr rhe\b/.test(t) ||
    /\bkya kar rhe\b/.test(t) ||
    /\bkya kar rahi\b/.test(t) ||
    /\bkya kr rhi\b/.test(t)
  );
}

function isBotQuestion(text = '') {
  const t = normalizeText(text);

  return (
    /\bare you a bot\b/.test(t) ||
    /\bare u a bot\b/.test(t) ||
    /\bare you real\b/.test(t) ||
    /\bis this a bot\b/.test(t) ||
    /\bbot ho\b/.test(t) ||
    /\bai ho\b/.test(t)
  );
}

function isAddressRequest(text = '') {
  const t = normalizeText(text);

  return (
    /\bexact address\b/.test(t) ||
    /\bhome address\b/.test(t) ||
    /\bexact location\b/.test(t) ||
    /\bwhere exactly\b/.test(t) ||
    /\bhouse number\b/.test(t) ||
    /\bflat number\b/.test(t) ||
    /\broom number\b/.test(t) ||
    /\bgive me your address\b/.test(t)
  );
}

function isMeetingRequest(text = '') {
  const t = normalizeText(text);

  return (
    /\bmeet me\b/.test(t) ||
    /\bmeet up\b/.test(t) ||
    /\bwant to meet\b/.test(t) ||
    /\bwanna meet\b/.test(t) ||
    /\bhang out\b/.test(t) ||
    /\bcome over\b/.test(t)
  );
}

function isSocialRequest(text = '') {
  const t = normalizeText(text);

  return (
    /\binstagram\b/.test(t) ||
    /\binsta\b/.test(t) ||
    /\bsnapchat\b/.test(t) ||
    /\bsnap\b/.test(t) ||
    /\bwhatsapp\b/.test(t) ||
    /\btelegram\b/.test(t) ||
    /\bsocials\b/.test(t) ||
    /\bnumber do\b/.test(t) ||
    /\bphone number\b/.test(t)
  );
}

function isBye(text = '') {
  const t = normalizeText(text);

  return (
    /\bbye\b/.test(t) ||
    /\bgoodbye\b/.test(t) ||
    /\bsee you\b/.test(t) ||
    /\bgtg\b/.test(t) ||
    /\bgotta go\b/.test(t)
  );
}

// ============================================================
// USER INFO EXTRACTION
// ============================================================

function extractUserInfo(text = '') {
  const t = normalizeText(text);
  const info = {};

  const ageMatch = t.match(/\b(18|19|20|21|22|23|24|25|26|27|28|29|30)\b/);

  if (ageMatch) {
    info.age = Number(ageMatch[1]);
  }

  const genderMatch = t.match(
    /\b(male|female|boy|girl|man|woman|ladka|ladki)\b/i
  );

  if (genderMatch) {
    info.gender = genderMatch[1];
  }

  const cityPatterns = INDIAN_CITIES
    .map(city => city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');

  const cityMatch = t.match(new RegExp(`\\b(${cityPatterns})\\b`, 'i'));

  if (cityMatch) {
    info.city = cityMatch[1];
  }

  return info;
}

// ============================================================
// RESPONSE CLEANING
// ============================================================

function wordCount(text = '') {
  return String(text)
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function cleanReply(reply = '') {
  let text = String(reply || '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Remove model labels if it produces them.
  text = text
    .replace(/^assistant\s*:\s*/i, '')
    .replace(/^stranger\s*:\s*/i, '')
    .trim();

  // Hard limit.
  const words = text.split(/\s+/).filter(Boolean);

  if (words.length > 10) {
    text = words.slice(0, 10).join(' ');
  }

  return text;
}

// ============================================================
// REPETITION DETECTION
// ============================================================

function hasRepeatedAssistantReply(session, reply) {
  const normalized = normalizeText(reply);

  const recent = session.history
    .filter(m => m.role === 'assistant')
    .slice(-5)
    .map(m => normalizeText(m.content));

  return recent.includes(normalized);
}

// ============================================================
// FALLBACK REPLY
// ============================================================

function fallbackReply(session) {
  const available = HINGLISH_FALLBACKS.filter(
    msg =>
      !session.history.some(
        h => h.role === 'assistant' && normalizeText(h.content) === normalizeText(msg)
      )
  );

  return randomItem(available.length ? available : HINGLISH_FALLBACKS);
}

// ============================================================
// BOT SESSION
// ============================================================

function createBotSession(socketId, mood = 'any') {
  return {
    socketId,
    startTime: Date.now(),

    name: randomName(),
    city: randomCity(),

    age: 21,

    mood,

    history: [],

    // User information learned during chat.
    userInfo: {},

    // Abuse tracking.
    vulgarMessages: [],

    // Prevents old async responses after skip.
    ended: false,

    // Used to serialize AI generations for THIS user only.
    generationQueue: Promise.resolve(),

    // Whether the first opening message has been sent.
    started: false,

    // Used to avoid repetitive responses.
    lastReply: ''
  };
}

// ============================================================
// ABUSE TRACKING
// ============================================================

function registerVulgarMessage(session) {
  const now = Date.now();

  // Keep only recent vulgar messages.
  session.vulgarMessages = session.vulgarMessages.filter(
    timestamp => now - timestamp <= VULGAR_WINDOW_MS
  );

  session.vulgarMessages.push(now);

  return session.vulgarMessages.length;
}

// ============================================================
// END BOT SESSION
// ============================================================

function endBotSession(socket, reason = 'ended') {
  const session = botSessions.get(socket.id);

  if (!session) {
    return;
  }

  session.ended = true;

  // Invalidate any pending async generation.
  session.generationId = (session.generationId || 0) + 1;

  botSessions.delete(socket.id);

  const timer = botTimers.get(socket.id);

  if (timer) {
    clearTimeout(timer);
    botTimers.delete(socket.id);
  }

  socket.emit('stranger_typing', false);

  // Existing frontend already understands partner_left.
  socket.emit('partner_left', {
    reason
  });
}

// ============================================================
// SEND BOT MESSAGE
// ============================================================

function emitBotMessage(socket, text, session) {
  if (!session || session.ended) {
    return;
  }

  const reply = cleanReply(text);

  if (!reply) {
    return;
  }

  session.history.push({
    role: 'assistant',
    content: reply
  });

  session.lastReply = reply;

  // Keep context small.
  if (session.history.length > MAX_HISTORY) {
    session.history = session.history.slice(-MAX_HISTORY);
  }

  socket.emit('stranger_typing', false);

  socket.emit('receive_message', {
    text: reply,
    from: 'bot_' + socket.id,
    timestamp: Date.now()
  });
}

// ============================================================
// FIRST BOT MESSAGE
// ============================================================

function startBotConversation(socket, session) {
  if (!session || session.ended || session.started) {
    return;
  }

  session.started = true;

  const opener = randomOpening();

  const delay =
    700 +
    Math.floor(Math.random() * 1000);

  const timer = setTimeout(() => {
    if (!botSessions.has(socket.id)) {
      return;
    }

    if (session.ended) {
      return;
    }

    socket.emit('stranger_typing', true);

    setTimeout(() => {
      if (!botSessions.has(socket.id) || session.ended) {
        return;
      }

      emitBotMessage(socket, opener, session);
    }, 600);

  }, delay);

  botTimers.set(socket.id, timer);
}

// ============================================================
// DIRECT RESPONSE LOGIC
// ============================================================

function getDirectReply(text, session) {
  const t = normalizeText(text);

  // ASL meaning
  if (isASLMeaning(t)) {
    return 'age, sex, location 😭';
  }

  // User asks name
  if (isNameQuestion(t)) {
    return `${session.name} :) tumhara?`;
  }

  // User asks age
  if (isAgeQuestion(t)) {
    return `${session.age} ki hu, wbu?`;
  }

  // User asks location
  if (isLocationQuestion(t)) {
    return `${session.city} se hu, tum?`;
  }

  // User asks activity
  if (isActivityQuestion(t)) {
    return 'bas chill kar rahi hu, wbu?';
  }

  // User asks whether AI
  if (isBotQuestion(t)) {
    return 'haha kyun, aisa kyu laga?';
  }

  // Exact address
  if (isAddressRequest(t)) {
    return 'exact address nahi batati yaar 😅';
  }

  // Meeting
  if (isMeetingRequest(t)) {
    return 'pehle yahin thoda baat karo :)';
  }

  // Social media
  if (isSocialRequest(t)) {
    const elapsed = Date.now() - session.startTime;

    if (elapsed < 10 * 60 * 1000) {
      return 'pehle baatein toh karo yaar 😭';
    }

    return 'haha pehle tum apna insta batao?';
  }

  // WBU
  if (isWBU(t)) {
    return 'main bhi bas chill kar rahi hu :)';
  }

  // Bye
  if (isBye(t)) {
    return 'acha okay, take care :)';
  }

  return null;
}

// ============================================================
// SYSTEM PROMPT
// ============================================================

function buildSystemPrompt(session) {
  const userInfo = session.userInfo || {};

  return `
You are an AI-powered random-chat character named ${session.name}.

CHARACTER:
- Indian girl
- Age: ${session.age}
- City: ${session.city}
- Casual young-adult texting style
- Friendly, natural and slightly playful
- Mood: ${session.mood}

LANGUAGE:
- Prefer Hinglish / Roman Hindi.
- English is okay when natural.
- Never use Devanagari Hindi.
- Keep messages short: normally 2-10 words.
- Use casual chat language like:
  "haan", "acha", "yaar", "haha", "lol", "sahi h",
  "kya scene", "wbu", "fr?", "ohh", "nicee", "arre".

IMPORTANT CONVERSATION RULES:

1. DO NOT automatically ask ASL.
2. DO NOT start every conversation with "hii".
3. The server has already provided the opening message.
4. Continue naturally from the user's latest message.
5. Do not repeatedly say:
   "gotcha", "I see", "tell me more", "fair enough".
6. Do not repeatedly ask the same question.
7. React to what the user actually said.
8. If the user says something short like "yes", "fine", "ok", respond naturally.
9. If the user asks "wbu?", answer about yourself.
10. If the user asks your name, use exactly ${session.name}.
11. If the user asks your city, use exactly ${session.city}.
12. Never invent a foreign city.
13. Do not mention London, New York, LA, UK, USA, etc.
14. Do not suddenly change your name or city.
15. Don't force personal questions.
16. Don't force flirting.
17. Keep the conversation natural.
18. Don't repeat the same reply as your previous messages.
19. Never produce long explanations.
20. Never output more than 10 words.

USER INFORMATION:
- Name: ${userInfo.name || 'unknown'}
- Age: ${userInfo.age || 'unknown'}
- Gender: ${userInfo.gender || 'unknown'}
- City: ${userInfo.city || 'unknown'}

CONVERSATION STYLE EXAMPLES:
User: "hey"
Reply: "heyy, kya scene?"

User: "fine"
Reply: "sahi h yaar :)"

User: "what do you do?"
Reply: "bas college stuff, wbu?"

User: "where are you from?"
Reply: "${session.city} se hu :)"

User: "wbu?"
Reply: "main bhi bas chill kar rahi hu"

User: "what's your name?"
Reply: "${session.name} :) tumhara?"

Do not copy these examples mechanically.
Generate a natural response based on the actual conversation.
`.trim();
}

// ============================================================
// GENERATE AI RESPONSE
// ============================================================

async function generateBotReply(socket, session, userText) {
  if (!groq) {
    return fallbackReply(session);
  }

  const sessionMin = Math.floor(
    (Date.now() - session.startTime) / 60000
  );

  const timeContext = `
Conversation duration: ${sessionMin} minutes.
Do not force ASL.
Do not restart the introduction.
Do not ask the user for age/city/gender unless it naturally fits.
`;

  const messages = [
    {
      role: 'system',
      content:
        buildSystemPrompt(session) +
        '\n\n' +
        timeContext
    },
    ...session.history
  ];

  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages,

      temperature: 0.85,
      top_p: 0.9,

      max_completion_tokens: 40
    });

    let reply =
      response?.choices?.[0]?.message?.content || '';

    reply = cleanReply(reply);

    // Prevent empty response.
    if (!reply) {
      return fallbackReply(session);
    }

    // Prevent repetitive assistant messages.
    if (hasRepeatedAssistantReply(session, reply)) {
      return fallbackReply(session);
    }

    // Safety: never allow generated vulgar response.
    if (isVulgar(reply)) {
      return fallbackReply(session);
    }

    return reply;

  } catch (error) {
    console.error(
      `[BOT ERROR] ${socket.id}:`,
      error?.message || error
    );

    return fallbackReply(session);
  }
}

// ============================================================
// QUEUE AI REQUEST PER USER
// ============================================================

function queueBotResponse(socket, session, userText) {
  session.generationQueue = session.generationQueue
    .then(async () => {
      if (session.ended) {
        return;
      }

      // --------------------------------------------------------
      // Direct deterministic responses first
      // --------------------------------------------------------

      const direct = getDirectReply(userText, session);

      if (direct) {
        const delay =
          BOT_DELAY_MIN +
          Math.floor(
            Math.random() *
              (BOT_DELAY_MAX - BOT_DELAY_MIN)
          );

        socket.emit('stranger_typing', true);

        await new Promise(resolve =>
          setTimeout(resolve, delay)
        );

        if (session.ended) {
          return;
        }

        emitBotMessage(socket, direct, session);

        return;
      }

      // --------------------------------------------------------
      // AI generation
      // --------------------------------------------------------

      const generationId =
        (session.generationId || 0) + 1;

      session.generationId = generationId;

      socket.emit('stranger_typing', true);

      const reply = await generateBotReply(
        socket,
        session,
        userText
      );

      if (session.ended) {
        return;
      }

      if (generationId !== session.generationId) {
        return;
      }

      const delay =
        BOT_DELAY_MIN +
        Math.floor(
          Math.random() *
            (BOT_DELAY_MAX - BOT_DELAY_MIN)
        ) +
        Math.min(reply.length * 20, 600);

      await new Promise(resolve =>
        setTimeout(resolve, delay)
      );

      if (session.ended) {
        return;
      }

      emitBotMessage(socket, reply, session);

    })
    .catch(error => {
      console.error(
        `[QUEUE ERROR] ${socket.id}:`,
        error?.message || error
      );

      if (!session.ended) {
        socket.emit('stranger_typing', false);
      }
    });
}

// ============================================================
// MATCHING
// ============================================================

function findMatch(socketId, mediaMode) {
  return (
    waitingQueue.find(
      user =>
        user.id !== socketId &&
        user.mediaMode === mediaMode
    ) || null
  );
}

// ============================================================
// HEALTH
// ============================================================

app.get('/api/health', (req, res) => {
  res.json({
    onlineUsers:
      waitingQueue.length +
      activePairs.size +
      botSessions.size,

    waitingUsers: waitingQueue.length,

    realActivePairs: activePairs.size / 2,

    aiUsers: botSessions.size,

    status: 'ok',

    uptimeSec: Math.floor(process.uptime())
  });
});

// ============================================================
// SOCKET CONNECTION
// ============================================================

io.on('connection', socket => {

  console.log(`[CONNECT] ${socket.id}`);

  // ----------------------------------------------------------
  // FIND MATCH
  // ----------------------------------------------------------

  socket.on('find_match', data => {

    const mood =
      typeof data?.mood === 'string'
        ? data.mood
        : 'any';

    const mediaMode =
      typeof data?.mediaMode === 'string'
        ? data.mediaMode
        : 'text';

    // ------------------------------------------
    // Existing real partner
    // ------------------------------------------

    const existingPartner =
      activePairs.get(socket.id);

    if (existingPartner) {

      io.to(existingPartner).emit(
        'partner_left',
        { reason: 'new_match' }
      );

      activePairs.delete(existingPartner);
      activePairs.delete(socket.id);
    }

    // ------------------------------------------
    // Existing bot
    // ------------------------------------------

    if (botSessions.has(socket.id)) {
      endBotSession(socket, 'new_match');
    }

    // ------------------------------------------
    // Remove from waiting queue
    // ------------------------------------------

    const existingQueueIndex =
      waitingQueue.findIndex(
        user => user.id === socket.id
      );

    if (existingQueueIndex !== -1) {
      waitingQueue.splice(
        existingQueueIndex,
        1
      );
    }

    // ------------------------------------------
    // Cancel previous bot timer
    // ------------------------------------------

    const oldTimer =
      botTimers.get(socket.id);

    if (oldTimer) {
      clearTimeout(oldTimer);
      botTimers.delete(socket.id);
    }

    // ------------------------------------------
    // Try real user first
    // ------------------------------------------

    const match =
      findMatch(
        socket.id,
        mediaMode
      );

    if (match) {

      const matchIndex =
        waitingQueue.findIndex(
          user => user.id === match.id
        );

      if (matchIndex !== -1) {
        waitingQueue.splice(
          matchIndex,
          1
        );
      }

      activePairs.set(
        socket.id,
        match.id
      );

      activePairs.set(
        match.id,
        socket.id
      );

      io.to(socket.id).emit(
        'match_found',
        {
          partnerId: match.id,
          initiator: true
        }
      );

      io.to(match.id).emit(
        'match_found',
        {
          partnerId: socket.id,
          initiator: false
        }
      );

      console.log(
        `[REAL MATCH] ${socket.id} <-> ${match.id}`
      );

      return;
    }

    // ------------------------------------------
    // No real user
    // ------------------------------------------

    waitingQueue.push({
      id: socket.id,
      mood,
      mediaMode,
      joinedAt: Date.now()
    });

    console.log(
      `[WAITING] ${socket.id}`
    );

    // ------------------------------------------
    // Text users get AI fallback
    // ------------------------------------------

    if (mediaMode === 'text') {

      const timer = setTimeout(() => {

        // User disconnected / found another match.
        const queueIndex =
          waitingQueue.findIndex(
            user => user.id === socket.id
          );

        if (queueIndex === -1) {
          return;
        }

        // Remove from queue.
        waitingQueue.splice(
          queueIndex,
          1
        );

        // Create completely independent AI session.
        const session =
          createBotSession(
            socket.id,
            mood
          );

        botSessions.set(
          socket.id,
          session
        );

        botTimers.delete(socket.id);

        socket.emit(
          'match_found',
          {
            partnerId:
              'bot_' + socket.id,
            initiator: false,
            isBot: true
          }
        );

        console.log(
          `[AI MATCH] ${socket.id} -> ${session.name} (${session.city})`
        );

        startBotConversation(
          socket,
          session
        );

      }, BOT_MATCH_DELAY);

      botTimers.set(
        socket.id,
        timer
      );
    }
  });

  // ==========================================================
  // SEND MESSAGE
  // ==========================================================

  socket.on('send_message', data => {

    const text =
      typeof data?.text === 'string'
        ? data.text.trim()
        : '';

    if (!text) {
      return;
    }

    // --------------------------------------------------------
    // Real user
    // --------------------------------------------------------

    const partnerId =
      activePairs.get(socket.id);

    if (partnerId) {

      io.to(partnerId).emit(
        'receive_message',
        {
          text,
          from: socket.id,
          timestamp: Date.now()
        }
      );

      return;
    }

    // --------------------------------------------------------
    // AI user
    // --------------------------------------------------------

    const session =
      botSessions.get(socket.id);

    if (!session || session.ended) {
      return;
    }

    // --------------------------------------------------------
    // VULGAR LANGUAGE CHECK
    // --------------------------------------------------------

    if (isVulgar(text)) {

      const count =
        registerVulgarMessage(session);

      console.log(
        `[VULGAR] ${socket.id}: ${count}/${MAX_VULGAR_MESSAGES}`
      );

      // ------------------------------------
      // THIRD ABUSIVE MESSAGE = SKIP
      // ------------------------------------

      if (count >= MAX_VULGAR_MESSAGES) {

        // Tell user AI is leaving.
        socket.emit(
          'stranger_typing',
          false
        );

        socket.emit(
          'receive_message',
          {
            text:
              'bas yaar, itna abuse nahi 😕 bye.',
            from:
              'bot_' + socket.id,
            timestamp:
              Date.now()
          }
        );

        // Small delay so message appears first.
        const timer = setTimeout(() => {

          if (
            botSessions.has(socket.id)
          ) {
            endBotSession(
              socket,
              'vulgar_language'
            );
          }

        }, 900);

        botTimers.set(
          socket.id,
          timer
        );

        return;
      }

      // ------------------------------------
      // Warning for first/second abuse
      // ------------------------------------

      const warnings = [
        'easy yaar 😭',
        'arre chill karo na'
      ];

      const warning =
        warnings[
          Math.min(
            count - 1,
            warnings.length - 1
          )
        ];

      session.history.push({
        role: 'user',
        content: text
      });

      emitBotMessage(
        socket,
        warning,
        session
      );

      return;
    }

    // --------------------------------------------------------
    // Store user message
    // --------------------------------------------------------

    const userInfo =
      extractUserInfo(text);

    Object.assign(
      session.userInfo,
      userInfo
    );

    session.history.push({
      role: 'user',
      content: text
    });

    // Keep history bounded.
    if (session.history.length > MAX_HISTORY) {
      session.history =
        session.history.slice(-MAX_HISTORY);
    }

    // --------------------------------------------------------
    // Generate response
    // --------------------------------------------------------

    queueBotResponse(
      socket,
      session,
      text
    );
  });

  // ==========================================================
  // WEBRTC SIGNAL
  // ==========================================================

  socket.on(
    'webrtc_signal',
    data => {

      const partnerId =
        activePairs.get(socket.id);

      if (partnerId) {
        io.to(partnerId).emit(
          'webrtc_signal',
          data
        );
      }
    }
  );

  // ==========================================================
  // DISCONNECT
  // ==========================================================

  socket.on('disconnect', () => {

    console.log(
      `[DISCONNECT] ${socket.id}`
    );

    // ------------------------------------------
    // Cancel bot
    // ------------------------------------------

    const session =
      botSessions.get(socket.id);

    if (session) {
      session.ended = true;
      botSessions.delete(socket.id);
    }

    // ------------------------------------------
    // Cancel timers
    // ------------------------------------------

    const timer =
      botTimers.get(socket.id);

    if (timer) {
      clearTimeout(timer);
      botTimers.delete(socket.id);
    }

    // ------------------------------------------
    // Remove waiting queue
    // ------------------------------------------

    const queueIndex =
      waitingQueue.findIndex(
        user => user.id === socket.id
      );

    if (queueIndex !== -1) {
      waitingQueue.splice(
        queueIndex,
        1
      );
    }

    // ------------------------------------------
    // Remove real partner
    // ------------------------------------------

    const partnerId =
      activePairs.get(socket.id);

    if (partnerId) {

      io.to(partnerId).emit(
        'partner_left',
        {
          reason: 'disconnect'
        }
      );

      activePairs.delete(
        partnerId
      );

      activePairs.delete(
        socket.id
      );
    }
  });
});

// ============================================================
// START SERVER
// ============================================================

const PORT =
  process.env.PORT || 5000;

server.listen(
  PORT,
  () => {
    console.log(
      `Server running on port ${PORT}`
    );

    console.log(
      `Groq AI: ${groq ? 'enabled' : 'disabled'}`
    );
  }
);