require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const Groq = require('groq-sdk');

const app = express();
app.use(cors());
app.use(express.json({ limit: '100kb' }));

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

const PORT = process.env.PORT || 5000;

// ============================================================
// BOT CONFIG
// ============================================================

const BOT_WAIT = 5000;
const MAX_AI_CONCURRENT = 6;
const MAX_AI_QUEUE = 30;

// ============================================================
// PERSONAS
// ============================================================

const PERSONAS = [
  { name: 'Ananya', city: 'Delhi', activity: 'studying', interests: ['music', 'movies', 'college'] },
  { name: 'Riya', city: 'Mumbai', activity: 'listening to music', interests: ['music', 'travel', 'shows'] },
  { name: 'Sneha', city: 'Jaipur', activity: 'studying', interests: ['movies', 'food', 'travel'] },
  { name: 'Kavya', city: 'Bangalore', activity: 'watching a series', interests: ['anime', 'music', 'college'] },
  { name: 'Priya', city: 'Pune', activity: 'chilling', interests: ['books', 'music', 'movies'] },
  { name: 'Aditi', city: 'Lucknow', activity: 'scrolling reels', interests: ['music', 'food', 'fashion'] },
  { name: 'Mehak', city: 'Chandigarh', activity: 'watching a show', interests: ['travel', 'music', 'shows'] },
  { name: 'Ishita', city: 'Hyderabad', activity: 'watching YouTube', interests: ['movies', 'music', 'gaming'] },
  { name: 'Neha', city: 'Kolkata', activity: 'studying', interests: ['books', 'music', 'college'] },
  { name: 'Simran', city: 'Amritsar', activity: 'listening to music', interests: ['music', 'food', 'travel'] },
  { name: 'Pooja', city: 'Indore', activity: 'watching a movie', interests: ['movies', 'food', 'music'] },
  { name: 'Shreya', city: 'Ahmedabad', activity: 'having chai', interests: ['music', 'shows', 'food'] },
  { name: 'Nandini', city: 'Bhopal', activity: 'finishing college work', interests: ['music', 'movies', 'college'] },
  { name: 'Ira', city: 'Dehradun', activity: 'reading', interests: ['books', 'travel', 'music'] }
];

// No fixed "hii asl?" opening.
const OPENINGS = [
  "hey, what's up?",
  "what are you upto?",
  "random match huh 😭",
  "how's your day going?",
  "what's the vibe today?",
  "what are you doing rn?",
  "sooo, what's going on?",
  "how's life?",
  "bored or actually social today?",
  "okay stranger, tell me something 😂",
  "what are you into?",
  "how's your day been?",
  "just got matched lol",
  "what do you usually do for fun?",
  "okay, your turn to start 😭",
  "what's keeping you awake?"
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ============================================================
// AI CONCURRENCY QUEUE
// ============================================================

let activeAI = 0;
const aiQueue = [];

function runAI(task) {
  return new Promise((resolve, reject) => {
    if (aiQueue.length >= MAX_AI_QUEUE) {
      reject(new Error('AI queue full'));
      return;
    }

    aiQueue.push({ task, resolve, reject });
    processAIQueue();
  });
}

function processAIQueue() {
  while (activeAI < MAX_AI_CONCURRENT && aiQueue.length) {
    const job = aiQueue.shift();

    activeAI++;

    Promise.resolve()
      .then(job.task)
      .then(job.resolve)
      .catch(job.reject)
      .finally(() => {
        activeAI--;
        processAIQueue();
      });
  }
}

// ============================================================
// SYSTEM PROMPT
// ============================================================

const SYSTEM_PROMPT = `
You are Miloo's AI stranger.

You are an AI chatting casually with a young Indian adult.

IMPORTANT:
- If directly asked whether you are AI or a bot, be honest.
- Never claim to be a real human.
- Talk naturally like a person texting.
- Never sound like customer support.

LANGUAGE:
- Match the user's language.
- English user = casual English.
- Hindi/Roman Hindi user = natural Hinglish.
- Mixed user = naturally mix English and Hindi.
- Do not force Hinglish.

STYLE:
- Usually 3-20 words.
- Short messages.
- Casual Indian texting.
- Don't overuse haha, lol, nice, interesting.
- Don't ask a question after every message.
- Don't repeat previous replies.
- React to what the user actually said.

VERY IMPORTANT:
Do NOT automatically ask "ASL".
Do NOT automatically ask age, sex or location.
Do NOT restart the conversation with "hii" or "hello".

Continue naturally from the latest message.

Use the supplied persona information.
Never change the persona's name or city.

Never provide exact addresses, phone numbers or private locations.

If asked to meet:
"Let's get to know each other here first."

Keep conversations natural and short.
`;

// ============================================================
// LANGUAGE
// ============================================================

function isHinglish(text = '') {
  const words = [
    'aap', 'ap', 'tum', 'tu', 'kaha', 'kahan', 'kya',
    'kyu', 'kyun', 'kaise', 'kaisa', 'kaisi', 'hai', 'ho',
    'hain', 'kar', 'kr', 'karti', 'karta', 'raha', 'rahi',
    'rha', 'rhi', 'mera', 'meri', 'mere', 'tera', 'teri',
    'tumhara', 'tumhari', 'aapka', 'aapki', 'haan', 'han',
    'nahi', 'nhi', 'yaar', 'bhai', 'batao', 'btao', 'achha',
    'accha', 'sahi', 'mast', 'badhiya', 'padhai', 'ghar',
    'kaam', 'abhi', 'aaj', 'raat', 'wbu', 'wyd'
  ];

  const t = text.toLowerCase();

  return words.some(word =>
    new RegExp(`\\b${word}\\b`, 'i').test(t)
  );
}

// ============================================================
// INTENT FUNCTIONS
// ============================================================

function isGreeting(text = '') {
  return /^(hi+|hey+|hello+|hlo+|yo+|sup)\b/i.test(text.trim());
}

function isGoodbye(text = '') {
  return /\b(bye|goodbye|gtg|gotta go|cya|see ya)\b/i.test(text);
}

function isWBU(text = '') {
  const t = text.toLowerCase().trim().replace(/\?+$/, '');

  return [
    'wbu',
    'and you',
    'what about you',
    'how about you',
    'aur tum',
    'aur aap',
    'aur tu'
  ].includes(t);
}

function isASLMeaning(text = '') {
  const t = text.toLowerCase().replace(/\s+/g, ' ').trim();

  return (
    /\bwhat is asl\b/i.test(t) ||
    /\bwhats asl\b/i.test(t) ||
    /\bwhat does asl mean\b/i.test(t) ||
    /\basl meaning\b/i.test(t)
  );
}

function isNameQuestion(text = '') {
  const t = text.toLowerCase();

  return (
    /\bwhat is your name\b/i.test(t) ||
    /\bwhat's your name\b/i.test(t) ||
    /\bwhats your name\b/i.test(t) ||
    /\bwho are you\b/i.test(t) ||
    /\byour name\b/i.test(t) ||
    /\bur name\b/i.test(t) ||
    /\bnaam kya\b/i.test(t) ||
    /\btumhara naam\b/i.test(t) ||
    /\baapka naam\b/i.test(t)
  );
}

function isAgeQuestion(text = '') {
  const t = text.toLowerCase();

  return (
    /\bhow old are you\b/i.test(t) ||
    /\byour age\b/i.test(t) ||
    /\bur age\b/i.test(t) ||
    /\bage kya\b/i.test(t) ||
    /\bkitne saal\b/i.test(t)
  );
}

function isLocationQuestion(text = '') {
  const t = text.toLowerCase();

  return (
    /\bwhere are you\b/i.test(t) ||
    /\bwhere do you live\b/i.test(t) ||
    /\bwhere are you from\b/i.test(t) ||
    /\bwhere are u from\b/i.test(t) ||
    /\bwhere r u from\b/i.test(t) ||
    /\byour city\b/i.test(t) ||
    /\bkaha se ho\b/i.test(t) ||
    /\bkahan se ho\b/i.test(t) ||
    /\btum kaha\b/i.test(t) ||
    /\btum kahan\b/i.test(t) ||
    /\baap kaha\b/i.test(t) ||
    /\baap kahan\b/i.test(t)
  );
}

function isActivityQuestion(text = '') {
  const t = text.toLowerCase();

  return (
    /\bwhat are you doing\b/i.test(t) ||
    /\bwhat r u doing\b/i.test(t) ||
    /\bwhat are u doing\b/i.test(t) ||
    /\bwhat do you do\b/i.test(t) ||
    /\bwhat do u do\b/i.test(t) ||
    /\bwyd\b/i.test(t) ||
    /\bkya kar rahe\b/i.test(t) ||
    /\bkya kr rahe\b/i.test(t) ||
    /\bkya kar rhe\b/i.test(t) ||
    /\bkya kr rhe\b/i.test(t) ||
    /\bkya kar rahi\b/i.test(t) ||
    /\bkya kr rhi\b/i.test(t)
  );
}

function isBotQuestion(text = '') {
  const t = text.toLowerCase();

  return (
    /\bare you a bot\b/i.test(t) ||
    /\bare u a bot\b/i.test(t) ||
    /\bis this a bot\b/i.test(t) ||
    /\bare you ai\b/i.test(t) ||
    /\bare u ai\b/i.test(t) ||
    /\bai ho\b/i.test(t) ||
    /\bbot ho\b/i.test(t)
  );
}

// IMPORTANT: JavaScript does NOT support /x.
// Keep these regexes on one line.
function isNSFW(text = '') {
  return /\b(nude|nudes|naked|boobs?|tits?|dick|penis|pussy|sex|sexual|masturbat\w*|jerk\s*off|blowjob|handjob|send\s+nudes?)\b/i.test(text);
}

function isAddressRequest(text = '') {
  const t = text.toLowerCase();

  return (
    /\bexact address\b/i.test(t) ||
    /\bhome address\b/i.test(t) ||
    /\bexact location\b/i.test(t) ||
    /\bwhere exactly\b/i.test(t) ||
    /\bhouse number\b/i.test(t) ||
    /\bflat number\b/i.test(t) ||
    /\broom number\b/i.test(t) ||
    /\bgive me your address\b/i.test(t)
  );
}

function isMeetingRequest(text = '') {
  const t = text.toLowerCase();

  return (
    /\bmeet me\b/i.test(t) ||
    /\bmeet up\b/i.test(t) ||
    /\bwant to meet\b/i.test(t) ||
    /\bwanna meet\b/i.test(t) ||
    /\bhang out\b/i.test(t) ||
    /\bcome over\b/i.test(t)
  );
}

function isProfanity(text = '') {
  return /\b(fuck|fucking|fck|bitch|shit|stfu|asshole|bsdk|chutiya|gandu|gaand|lodu|saale|kamina|madarchod|bhenchod|bhosdike)\b/i.test(text);
}

// ============================================================
// USER INFO
// ============================================================

const CITY_REGEX =
  /\b(delhi|new delhi|mumbai|jaipur|pune|bangalore|bengaluru|hyderabad|lucknow|indore|chandigarh|ahmedabad|surat|vadodara|bhopal|kanpur|nagpur|patna|ranchi|kolkata|amritsar|noida|gurgaon|gurugram|ghaziabad|agra|dehradun|varanasi|prayagraj|meerut|jodhpur|udaipur|kochi|coimbatore|mysore|mysuru|thiruvananthapuram|bhubaneswar|visakhapatnam|vizag)\b/i;

function extractUserInfo(text = '') {
  const info = {};

  const city = text.match(CITY_REGEX);
  if (city) info.city = city[1];

  const age = text.match(
    /\b(18|19|20|21|22|23|24|25|26|27|28|29)\b/
  );

  if (age) info.age = age[1];

  const gender = text.match(
    /\b(male|female|boy|girl|man|woman|ladka|ladki)\b/i
  );

  if (gender) info.gender = gender[1];

  const patterns = [
    /\bmy name is\s+([a-zA-Z]{2,20})\b/i,
    /\bmera naam\s+([a-zA-Z]{2,20})\b/i,
    /\bi am\s+([a-zA-Z]{2,20})\b/i,
    /\bi'm\s+([a-zA-Z]{2,20})\b/i
  ];

  const ignored = [
    'from',
    'male',
    'female',
    'studying',
    'busy',
    'fine',
    'good',
    'okay',
    'ok',
    'happy',
    'free'
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match && !ignored.includes(match[1].toLowerCase())) {
      info.name = match[1];
      break;
    }
  }

  return info;
}

// ============================================================
// DIRECT RESPONSES
// ============================================================

function directReply(text, session) {
  const hinglish = isHinglish(text);

  if (isASLMeaning(text)) {
    return 'age, sex, location';
  }

  if (isAddressRequest(text)) {
    return hinglish
      ? 'exact address share nahi karti.'
      : "I don't share my exact address.";
  }

  if (isMeetingRequest(text)) {
    return hinglish
      ? 'pehle yahin thoda aur baat karte hain.'
      : "let's get to know each other here first.";
  }

  if (isNSFW(text)) {
    return hinglish
      ? 'nah, normal baat karo.'
      : "nah, let's keep it normal.";
  }

  if (isBotQuestion(text)) {
    return hinglish
      ? 'haan, Miloo ka AI hu 😄'
      : "yeah, I'm Miloo's AI 😄";
  }

  if (isNameQuestion(text)) {
    return hinglish
      ? `${session.name} hu. Tumhara?`
      : `I'm ${session.name}. What's yours?`;
  }

  if (isAgeQuestion(text)) {
    return hinglish
      ? '21 ki hu.'
      : "I'm 21.";
  }

  if (isLocationQuestion(text)) {
    return hinglish
      ? `${session.city} se hu, tum?`
      : `I'm from ${session.city}. You?`;
  }

  if (isActivityQuestion(text) || isWBU(text)) {
    return hinglish
      ? `bas ${session.activity} kar rahi hu.`
      : `just ${session.activity}.`;
  }

  if (isProfanity(text)) {
    return hinglish
      ? 'arre chill 😭'
      : 'easy there 😭';
  }

  return null;
}

// ============================================================
// FALLBACK
// ============================================================

function fallbackReply(text) {
  const hinglish = isHinglish(text);

  if (isGreeting(text)) {
    return pick(
      hinglish
        ? [
            'heyy, kya scene hai?',
            'hii, kaise ho?',
            'hey, kya kar rahe?',
            'sab badhiya?'
          ]
        : [
            "hey, what's up?",
            'how are you?',
            "what's going on?",
            "how's your day?"
          ]
    );
  }

  if (isGoodbye(text)) {
    return pick([
      'bye, take care.',
      'see ya later.',
      'take care, stranger.'
    ]);
  }

  if (/\b(bored|boring|nothing)\b/i.test(text)) {
    return hinglish
      ? pick([
          'same yaar 😭',
          'haan same, bore ho rahi.',
          'kuch interesting karo 😂'
        ])
      : pick([
          'same honestly 😭',
          'yeah, kinda bored too.',
          'we need better plans 😂'
        ]);
  }

  if (/\b(music|song|songs)\b/i.test(text)) {
    return hinglish
      ? pick([
          'music toh always works yaar.',
          'acha, kya sunte ho?',
          'same, music is life 😭'
        ])
      : pick([
          'music is always a good choice.',
          'what kind of music?',
          'same, music fixes everything 😭'
        ]);
  }

  return hinglish
    ? pick([
        'achha, phir batao?',
        'haan, samajh gayi.',
        'ohh accha.',
        'sahi hai.',
        'aur batao?'
      ])
    : pick([
        'oh, really?',
        'I see.',
        'tell me more.',
        'gotcha.',
        'fair enough.'
      ]);
}

// ============================================================
// CLEAN AI RESPONSE
// ============================================================

function cleanReply(reply, session) {
  if (!reply) return '';

  let result = String(reply)
    .replace(/\s+/g, ' ')
    .replace(/^(assistant|ai|bot)\s*:\s*/i, '')
    .replace(/^["']|["']$/g, '')
    .trim();

  if (result.length > 220) {
    result = result.slice(0, 217).trim() + '...';
  }

  const previous = session.history
    .filter(x => x.role === 'assistant')
    .slice(-8)
    .map(x => x.content.toLowerCase().trim());

  if (previous.includes(result.toLowerCase())) {
    return '';
  }

  return result;
}

// ============================================================
// MATCHING
// ============================================================

const waitingQueue = new Map();
const activePairs = new Map();
const botSessions = new Map();
const botTimers = new Map();

function clearBotTimer(socketId) {
  const timer = botTimers.get(socketId);

  if (timer) {
    clearTimeout(timer);
    botTimers.delete(socketId);
  }
}

function clearSession(socket) {
  const session = botSessions.get(socket.id);

  if (session?.generationTimer) {
    clearTimeout(session.generationTimer);
  }

  if (session?.typingTimer) {
    clearTimeout(session.typingTimer);
  }

  botSessions.delete(socket.id);
  clearBotTimer(socket.id);

  socket.emit('stranger_typing', false);
}

function findMatch(socketId, mediaMode, mood) {
  for (const user of waitingQueue.values()) {
    if (user.id === socketId) continue;
    if (user.mediaMode !== mediaMode) continue;

    if (
      mood === 'any' ||
      user.mood === 'any' ||
      user.mood === mood
    ) {
      return user;
    }
  }

  return null;
}

// ============================================================
// HEALTH
// ============================================================

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    waitingUsers: waitingQueue.size,
    activePairs: activePairs.size / 2,
    botSessions: botSessions.size,
    aiActive: activeAI,
    aiQueued: aiQueue.length,
    uptimeSec: Math.floor(process.uptime())
  });
});

// ============================================================
// SOCKET.IO
// ============================================================

io.on('connection', socket => {
  let lastMessageAt = 0;

  // ----------------------------------------------------------
  // FIND MATCH
  // ----------------------------------------------------------

  socket.on('find_match', data => {
    const mood = data?.mood || 'any';
    const mediaMode = data?.mediaMode || 'text';

    clearSession(socket);

    const oldPartner = activePairs.get(socket.id);

    if (oldPartner) {
      io.to(oldPartner).emit('partner_left');
      activePairs.delete(oldPartner);
      activePairs.delete(socket.id);
    }

    waitingQueue.delete(socket.id);

    const match = findMatch(
      socket.id,
      mediaMode,
      mood
    );

    if (match) {
      clearBotTimer(match.id);
      waitingQueue.delete(match.id);

      activePairs.set(socket.id, match.id);
      activePairs.set(match.id, socket.id);

      io.to(socket.id).emit('match_found', {
        partnerId: match.id,
        initiator: true
      });

      io.to(match.id).emit('match_found', {
        partnerId: socket.id,
        initiator: false
      });

      return;
    }

    waitingQueue.set(socket.id, {
      id: socket.id,
      mood,
      mediaMode,
      joinedAt: Date.now()
    });

    // Only text mode gets AI fallback.
    if (mediaMode !== 'text') return;

    const timer = setTimeout(() => {
      botTimers.delete(socket.id);

      if (!waitingQueue.has(socket.id)) {
        return;
      }

      waitingQueue.delete(socket.id);

      const persona = pick(PERSONAS);

      const session = {
        startTime: Date.now(),

        name: persona.name,
        city: persona.city,
        activity: persona.activity,
        interests: persona.interests,

        userName: null,
        userCity: null,
        userAge: null,
        userGender: null,

        history: [],

        generationId: 0,
        generationTimer: null,
        typingTimer: null
      };

      botSessions.set(socket.id, session);

      socket.emit('match_found', {
        partnerId: `bot_${socket.id}`,
        initiator: false
      });

      // Varied opening.
      session.generationTimer = setTimeout(() => {
        if (!botSessions.has(socket.id)) return;

        const opening = pick(OPENINGS);

        socket.emit('stranger_typing', true);

        session.typingTimer = setTimeout(() => {
          if (!botSessions.has(socket.id)) return;

          socket.emit('stranger_typing', false);

          socket.emit('receive_message', {
            text: opening,
            from: `bot_${socket.id}`,
            timestamp: Date.now()
          });

          session.history.push({
            role: 'assistant',
            content: opening
          });

          session.typingTimer = null;
        }, 700 + Math.random() * 700);

      }, 700);

    }, BOT_WAIT);

    botTimers.set(socket.id, timer);
  });

  // ----------------------------------------------------------
  // SEND MESSAGE
  // ----------------------------------------------------------

  socket.on('send_message', async data => {
    const now = Date.now();

    // Small per-user spam protection.
    if (now - lastMessageAt < 250) {
      return;
    }

    lastMessageAt = now;

    let text = String(data?.text || '').trim();

    if (!text) return;

    if (text.length > 1000) {
      text = text.slice(0, 1000);
    }

    // --------------------------------------------------------
    // REAL USER
    // --------------------------------------------------------

    const partnerId = activePairs.get(socket.id);

    if (partnerId) {
      io.to(partnerId).emit('receive_message', {
        text,
        from: socket.id,
        timestamp: Date.now()
      });

      return;
    }

    // --------------------------------------------------------
    // BOT
    // --------------------------------------------------------

    const session = botSessions.get(socket.id);

    if (!session) return;

    session.history.push({
      role: 'user',
      content: text
    });

    const info = extractUserInfo(text);

    if (info.name) session.userName = info.name;
    if (info.city) session.userCity = info.city;
    if (info.age) session.userAge = info.age;
    if (info.gender) session.userGender = info.gender;

    // Cancel previous response timer.
    if (session.generationTimer) {
      clearTimeout(session.generationTimer);
      session.generationTimer = null;
    }

    if (session.typingTimer) {
      clearTimeout(session.typingTimer);
      session.typingTimer = null;
    }

    socket.emit('stranger_typing', false);

    const generationId = ++session.generationId;

    session.generationTimer = setTimeout(async () => {
      if (
        !botSessions.has(socket.id) ||
        generationId !== session.generationId
      ) {
        return;
      }

      socket.emit('stranger_typing', true);

      let reply = directReply(text, session);

      // ------------------------------------------------------
      // GROQ
      // ------------------------------------------------------

      if (!reply && groq) {
        try {
          const language =
            isHinglish(text)
              ? 'HINGLISH'
              : 'ENGLISH';

          const history =
            session.history.slice(-14);

          const response = await runAI(() =>
            groq.chat.completions.create({
              model: 'llama-3.3-70b-versatile',

              messages: [
                {
                  role: 'system',
                  content: `
${SYSTEM_PROMPT}

BOT:
Name: ${session.name}
Age: 21
City: ${session.city}
Activity: ${session.activity}
Interests: ${session.interests.join(', ')}

USER:
Name: ${session.userName || 'unknown'}
City: ${session.userCity || 'unknown'}
Age: ${session.userAge || 'unknown'}
Gender: ${session.userGender || 'unknown'}

LANGUAGE: ${language}

Continue the conversation.

Do NOT restart with hi/hello.

Do NOT automatically ask ASL.

Respond to the latest user message only.
`
                },
                ...history
              ],

              temperature: 0.78,
              max_completion_tokens: 60
            })
          );

          reply =
            response?.choices?.[0]?.message?.content?.trim() || '';

        } catch (error) {
          console.error(
            'Groq error:',
            error.message
          );
        }
      }

      // ------------------------------------------------------
      // FALLBACK
      // ------------------------------------------------------

      if (!reply) {
        reply = fallbackReply(text);
      }

      reply = cleanReply(reply, session);

      if (!reply) {
        reply = fallbackReply(text);
      }

      // ------------------------------------------------------
      // STALE RESPONSE CHECK
      // ------------------------------------------------------

      if (
        !botSessions.has(socket.id) ||
        generationId !== session.generationId
      ) {
        socket.emit('stranger_typing', false);
        return;
      }

      session.history.push({
        role: 'assistant',
        content: reply
      });

      if (session.history.length > 24) {
        session.history =
          session.history.slice(-24);
      }

      // ------------------------------------------------------
      // TYPING DELAY
      // ------------------------------------------------------

      const delay =
        700 +
        Math.random() * 900 +
        Math.min(reply.length * 20, 800);

      session.typingTimer = setTimeout(() => {
        if (
          !botSessions.has(socket.id) ||
          generationId !== session.generationId
        ) {
          return;
        }

        socket.emit('stranger_typing', false);

        socket.emit('receive_message', {
          text: reply,
          from: `bot_${socket.id}`,
          timestamp: Date.now()
        });

        session.typingTimer = null;

      }, delay);

      session.generationTimer = null;

    }, 350);
  });

  // ----------------------------------------------------------
  // WEBRTC
  // ----------------------------------------------------------

  socket.on('webrtc_signal', data => {
    const partnerId = activePairs.get(socket.id);

    if (partnerId) {
      io.to(partnerId).emit(
        'webrtc_signal',
        data
      );
    }
  });

  // ----------------------------------------------------------
  // DISCONNECT
  // ----------------------------------------------------------

  socket.on('disconnect', () => {
    clearSession(socket);

    waitingQueue.delete(socket.id);

    const partnerId =
      activePairs.get(socket.id);

    if (partnerId) {
      io.to(partnerId).emit('partner_left');

      activePairs.delete(partnerId);
      activePairs.delete(socket.id);
    }
  });
});

// ============================================================
// START SERVER
// ============================================================

server.listen(PORT, () => {
  console.log(`Miloo server running on port ${PORT}`);
  console.log(`AI concurrency: ${MAX_AI_CONCURRENT}`);
});