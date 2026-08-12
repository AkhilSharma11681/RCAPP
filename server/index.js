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

// ============================================================
// BOT PERSONAS
// ============================================================

const PERSONAS = [
  {
    name: 'Ananya',
    city: 'Delhi',
    activity: 'studying',
    interests: ['music', 'movies', 'college']
  },
  {
    name: 'Riya',
    city: 'Mumbai',
    activity: 'listening to music',
    interests: ['music', 'travel', 'shows']
  },
  {
    name: 'Sneha',
    city: 'Jaipur',
    activity: 'studying',
    interests: ['movies', 'food', 'travel']
  },
  {
    name: 'Kavya',
    city: 'Bangalore',
    activity: 'watching a series',
    interests: ['anime', 'music', 'college']
  },
  {
    name: 'Priya',
    city: 'Pune',
    activity: 'studying',
    interests: ['books', 'music', 'movies']
  },
  {
    name: 'Aditi',
    city: 'Lucknow',
    activity: 'scrolling Instagram',
    interests: ['fashion', 'music', 'food']
  },
  {
    name: 'Mehak',
    city: 'Chandigarh',
    activity: 'just chilling',
    interests: ['shows', 'travel', 'music']
  },
  {
    name: 'Ishita',
    city: 'Hyderabad',
    activity: 'watching YouTube',
    interests: ['movies', 'music', 'gaming']
  },
  {
    name: 'Neha',
    city: 'Kolkata',
    activity: 'studying',
    interests: ['books', 'music', 'college']
  },
  {
    name: 'Simran',
    city: 'Amritsar',
    activity: 'listening to music',
    interests: ['music', 'food', 'travel']
  },
  {
    name: 'Pooja',
    city: 'Indore',
    activity: 'watching a movie',
    interests: ['movies', 'food', 'music']
  },
  {
    name: 'Shreya',
    city: 'Ahmedabad',
    activity: 'studying',
    interests: ['business', 'music', 'shows']
  }
];

const OPENINGS = [
  'hii',
  'heyy',
  'hii, how are you?',
  'hey there',
  'yo, what’s good?',
  'hey stranger'
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ============================================================
// AI SYSTEM PROMPT
// ============================================================

const SYSTEM_PROMPT = `
You are Miloo's AI stranger.

You are chatting casually with a young Indian adult.

IMPORTANT:
- You are an AI on Miloo.
- If directly asked whether you are AI/bot, be honest.
- Never claim to be a real human.
- Never sound like customer support.
- Never sound like an assistant.
- Talk like a normal person texting.

LANGUAGE:

Match the user's language naturally.

English user:
Use casual English.

Roman Hindi user:
Use natural Indian Hinglish.

Mixed user:
Naturally mix English and Roman Hindi.

Do NOT force Hinglish.

Examples:

User: "where are you from?"
Reply: "I'm from Jaipur. You?"

User: "aap kaha se ho?"
Reply: "Jaipur se hu, tum?"

User: "kya kar rhi ho?"
Reply: "Bas music sun rahi hu."

User: "what are you doing?"
Reply: "Just chilling rn."

CONVERSATION:

- Answer the latest message.
- Remember previous messages.
- Don't ask for information already provided.
- Don't randomly change topics.
- Don't ask a question after every message.
- React to what the user actually said.
- Don't repeatedly say "nice", "interesting", "oh really", "haha", "lol", or "wbu".
- Don't repeat the same response.
- Don't force slang.
- Don't make every reply a question.

STYLE:

- Usually 3-20 words.
- One short message.
- No paragraphs.
- Casual texting.
- Natural Indian texting style.
- Use emojis rarely.
- Don't overuse "haha" or "lol".

ASL:

ASL means age, sex, location.

Do NOT automatically ask for ASL.

Only discuss age, gender, or location when relevant.

PERSONA:

Use the supplied profile.
Never change the bot's name or city.

SAFETY:

Never give an exact home address, house number,
flat number, room number, phone number, or private location.

If asked for an exact address:
"I don't share my exact address."

If asked to meet:
"Let's get to know each other here first."

Do not participate in explicit sexual content,
nude requests, or explicit sexual roleplay.

Keep safety responses short and casual.

The goal is natural conversation, not an interview.
`;

// ============================================================
// LANGUAGE DETECTION
// ============================================================

function isHinglish(text = '') {
  const t = text.toLowerCase();

  const words = [
    'aap', 'ap', 'tum', 'tu',
    'kaha', 'kahan', 'kahaan', 'kidhar',
    'kya', 'kyu', 'kyun',
    'kaise', 'kaisa', 'kaisi',
    'hai', 'ho', 'hain',
    'kar', 'kr', 'karti', 'karta',
    'raha', 'rahi', 'rha', 'rhi',
    'mera', 'meri', 'mere',
    'tera', 'teri', 'tere',
    'tumhara', 'tumhari',
    'aapka', 'aapki',
    'haan', 'han', 'nahi', 'nhi',
    'yaar', 'bhai',
    'batao', 'btao',
    'achha', 'accha',
    'sahi', 'mast', 'badhiya',
    'padhai', 'ghar', 'kaam',
    'abhi', 'aaj', 'raat',
    'wbu', 'wyd'
  ];

  return words.some(word => {
    if (word.includes(' ')) {
      return t.includes(word);
    }

    return new RegExp(`\\b${word}\\b`, 'i').test(t);
  });
}

// ============================================================
// INTENT DETECTION
// ============================================================

function isGreeting(text = '') {
  return /^(hi+|hey+|hello+|hlo+|yo+|sup)\b/i.test(
    text.trim()
  );
}

function isGoodbye(text = '') {
  return /\b(bye|goodbye|gtg|gotta go|cya|see ya)\b/i.test(text);
}

function isWBU(text = '') {
  const t = text.trim().toLowerCase().replace(/\?+$/, '');

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
    /\bwhat is asl\b/.test(t) ||
    /\bwhats asl\b/.test(t) ||
    /\bwhat does asl mean\b/.test(t) ||
    /\basl meaning\b/.test(t)
  );
}

function isNameQuestion(text = '') {
  const t = text.toLowerCase();

  return (
    /\bwhat(?:'s| is) your name\b/.test(t) ||
    /\bwhats your name\b/.test(t) ||
    /\bwho are you\b/.test(t) ||
    /\byour name\b/.test(t) ||
    /\bur name\b/.test(t) ||
    /\bnaam kya\b/.test(t) ||
    /\btumhara naam\b/.test(t) ||
    /\baapka naam\b/.test(t)
  );
}

function isAgeQuestion(text = '') {
  const t = text.toLowerCase();

  return (
    /\bhow old are you\b/.test(t) ||
    /\bwhat(?:'s| is) your age\b/.test(t) ||
    /\byour age\b/.test(t) ||
    /\bur age\b/.test(t) ||
    /\bage kya\b/.test(t) ||
    /\bkitne saal\b/.test(t)
  );
}

function isLocationQuestion(text = '') {
  const t = text.toLowerCase();

  return (
    /\bwhere are you\b/.test(t) ||
    /\bwhere do you live\b/.test(t) ||
    /\bwhere are you from\b/.test(t) ||
    /\bwhere are u from\b/.test(t) ||
    /\bwhere r u from\b/.test(t) ||
    /\bwhere u from\b/.test(t) ||
    /\byour city\b/.test(t) ||
    /\bkaha se ho\b/.test(t) ||
    /\bkahan se ho\b/.test(t) ||
    /\bkahaan se ho\b/.test(t) ||
    /\bkidhar se ho\b/.test(t) ||
    /\btum kaha\b/.test(t) ||
    /\btum kahan\b/.test(t) ||
    /\baap kaha\b/.test(t) ||
    /\baap kahan\b/.test(t)
  );
}

function isActivityQuestion(text = '') {
  const t = text.toLowerCase();

  return (
    /\bwhat are you doing\b/.test(t) ||
    /\bwhat r u doing\b/.test(t) ||
    /\bwhat are u doing\b/.test(t) ||
    /\bwhat do you do\b/.test(t) ||
    /\bwhat do u do\b/.test(t) ||
    /\bwyd\b/.test(t) ||
    /\bkya kar rahe\b/.test(t) ||
    /\bkya kr rahe\b/.test(t) ||
    /\bkya kar rhe\b/.test(t) ||
    /\bkya kr rhe\b/.test(t) ||
    /\bkya kar rahi\b/.test(t) ||
    /\bkya kr rhi\b/.test(t) ||
    /\bkya kar raha\b/.test(t)
  );
}

function isBotQuestion(text = '') {
  const t = text.toLowerCase();

  return (
    /\bare you a bot\b/.test(t) ||
    /\bare u a bot\b/.test(t) ||
    /\bis this a bot\b/.test(t) ||
    /\bare you ai\b/.test(t) ||
    /\bare u ai\b/.test(t) ||
    /\bai ho\b/.test(t) ||
    /\bbot ho\b/.test(t)
  );
}

function isNSFW(text = '') {
  return /\b(nude|nudes|naked|boobs?|tits?|dick|penis|pussy|sex|sexual|masturbat\w*|jerk\s*off|blowjob|handjob|send\s+nudes?)\b/i.test(text);
}

function isAddressRequest(text = '') {
  const t = text.toLowerCase();

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
  const t = text.toLowerCase();

  return (
    /\bmeet me\b/.test(t) ||
    /\bmeet up\b/.test(t) ||
    /\bwant to meet\b/.test(t) ||
    /\bwanna meet\b/.test(t) ||
    /\bhang out\b/.test(t) ||
    /\bcome over\b/.test(t)
  );
}

function isProfanity(text = '') {
  return /\b(fuck|fucking|fck|bitch|shit|stfu|asshole|bsdk|chutiya|gandu|gaand|lodu|saale|kamina|madarchod|bhenchod|bhosdike)\b/i.test(text);
}

// ============================================================
// USER INFO
// ============================================================

const INDIAN_CITIES =
  'delhi|new delhi|mumbai|jaipur|pune|bangalore|bengaluru|' +
  'hyderabad|lucknow|indore|chandigarh|ahmedabad|surat|vadodara|' +
  'bhopal|kanpur|nagpur|patna|ranchi|kolkata|amritsar|noida|' +
  'gurgaon|gurugram|ghaziabad|agra|dehradun|varanasi|prayagraj|' +
  'meerut|jodhpur|udaipur|kochi|coimbatore|mysore|mysuru|' +
  'thiruvananthapuram|bhubaneswar|visakhapatnam|vizag';

function extractUserInfo(text = '') {
  const info = {};

  const city = text.match(
    new RegExp(`\\b(${INDIAN_CITIES})\\b`, 'i')
  );

  if (city) {
    info.city = city[1]
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  const age = text.match(
    /\b(18|19|20|21|22|23|24|25|26|27|28|29)\b/
  );

  if (age) {
    info.age = age[1];
  }

  const gender = text.match(
    /\b(male|female|boy|girl|man|woman|ladka|ladki)\b/i
  );

  if (gender) {
    info.gender = gender[1];
  }

  const namePatterns = [
    /\bmy name is\s+([a-zA-Z]{2,20})\b/i,
    /\bmera naam\s+([a-zA-Z]{2,20})\b/i,
    /\bi am\s+([a-zA-Z]{2,20})\b/i,
    /\bi'm\s+([a-zA-Z]{2,20})\b/i
  ];

  const ignored = new Set([
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
  ]);

  for (const regex of namePatterns) {
    const match = text.match(regex);

    if (!match) continue;

    const candidate = match[1];

    if (!ignored.has(candidate.toLowerCase())) {
      info.name = candidate;
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
      : "Yeah, I'm Miloo's AI 😄";
  }

  if (isNameQuestion(text)) {
    return hinglish
      ? `${session.name}. Tumhara?`
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

  if (isActivityQuestion(text)) {
    return hinglish
      ? `bas ${session.activity} kar rahi hu.`
      : `just ${session.activity}.`;
  }

  if (isWBU(text)) {
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
            'hii, kya scene hai?',
            'heyy, kaise ho?',
            'hii, kya kar rahe?',
            'hey, sab badhiya?'
          ]
        : [
            'hey, how are you?',
            'hii, what’s up?',
            'hey stranger',
            'heyy, how’s it going?'
          ]
    );
  }

  if (isGoodbye(text)) {
    return 'bye, take care.';
  }

  if (/\b(bored|boring|nothing)\b/i.test(text)) {
    return hinglish
      ? 'same yaar, kya karein?'
      : 'same, what should we do?';
  }

  return hinglish
    ? pick([
        'achha, phir batao?',
        'haan, samajh gayi.',
        'ohh accha.',
        'sahi hai.',
        'aur batao.'
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
// RESPONSE CLEANING
// ============================================================

function cleanReply(reply, session) {
  if (!reply) return '';

  let result = String(reply)
    .replace(/\n+/g, ' ')
    .replace(/^(assistant|ai|bot)\s*:\s*/i, '')
    .replace(/^["']|["']$/g, '')
    .trim();

  // Hard safety limit.
  if (result.length > 220) {
    result = result.slice(0, 217).trim() + '...';
  }

  const previous = session.history
    .filter(m => m.role === 'assistant')
    .slice(-6)
    .map(m => m.content.toLowerCase().trim());

  if (previous.includes(result.toLowerCase())) {
    return '';
  }

  return result;
}

// ============================================================
// MATCHING
// ============================================================

const waitingQueue = [];
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

function findMatch(socketId, mediaMode, mood) {
  return waitingQueue.find(user => {
    if (user.id === socketId) return false;
    if (user.mediaMode !== mediaMode) return false;

    if (mood === 'any' || user.mood === 'any') {
      return true;
    }

    return user.mood === mood;
  });
}

// ============================================================
// HEALTH
// ============================================================

app.get('/api/health', (req, res) => {
  res.json({
    onlineUsers: waitingQueue.length + activePairs.size,
    waitingUsers: waitingQueue.length,
    activePairs: activePairs.size / 2,
    botSessions: botSessions.size,
    status: 'ok',
    uptimeSec: Math.floor(process.uptime())
  });
});

// ============================================================
// SOCKET.IO
// ============================================================

io.on('connection', socket => {
  let lastMessageAt = 0;

  function clearSession() {
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

  // ==========================================================
  // FIND MATCH
  // ==========================================================

  socket.on('find_match', data => {
    const mood = data?.mood || 'any';
    const mediaMode = data?.mediaMode || 'text';

    clearSession();

    const oldPartner = activePairs.get(socket.id);

    if (oldPartner) {
      io.to(oldPartner).emit('partner_left');

      activePairs.delete(oldPartner);
      activePairs.delete(socket.id);
    }

    const queueIndex = waitingQueue.findIndex(
      user => user.id === socket.id
    );

    if (queueIndex !== -1) {
      waitingQueue.splice(queueIndex, 1);
    }

    const match = findMatch(
      socket.id,
      mediaMode,
      mood
    );

    if (match) {
      clearBotTimer(match.id);

      const matchIndex = waitingQueue.findIndex(
        user => user.id === match.id
      );

      if (matchIndex !== -1) {
        waitingQueue.splice(matchIndex, 1);
      }

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

    waitingQueue.push({
      id: socket.id,
      mood,
      mediaMode,
      joinedAt: Date.now()
    });

    // AI fallback only for text mode.
    if (mediaMode !== 'text') {
      return;
    }

    const timer = setTimeout(() => {
      botTimers.delete(socket.id);

      const index = waitingQueue.findIndex(
        user => user.id === socket.id
      );

      if (index === -1) {
        return;
      }

      waitingQueue.splice(index, 1);

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

      // Small delay before opening.
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
        }, 900 + Math.random() * 700);

      }, 700);

    }, 5000);

    botTimers.set(socket.id, timer);
  });

  // ==========================================================
  // SEND MESSAGE
  // ==========================================================

  socket.on('send_message', async data => {
    const now = Date.now();

    // Basic spam protection.
    if (now - lastMessageAt < 250) {
      return;
    }

    lastMessageAt = now;

    let text = String(data?.text || '').trim();

    if (!text) return;

    // Prevent enormous prompts.
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

    // Cancel previous pending timers.
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
          const recentHistory =
            session.history.slice(-14);

          const language =
            isHinglish(text)
              ? 'HINGLISH'
              : 'ENGLISH';

          const response =
            await Promise.race([
              groq.chat.completions.create({
                model: 'llama-3.3-70b-versatile',

                messages: [
                  {
                    role: 'system',
                    content: `
${SYSTEM_PROMPT}

BOT PROFILE:
Name: ${session.name}
Age: 21
City: ${session.city}
Activity: ${session.activity}
Interests: ${session.interests.join(', ')}

USER PROFILE:
Name: ${session.userName || 'unknown'}
City: ${session.userCity || 'unknown'}
Age: ${session.userAge || 'unknown'}
Gender: ${session.userGender || 'unknown'}

CURRENT LANGUAGE:
${language}

FINAL RULES:
- Reply to the latest user message.
- Usually 3-20 words.
- Do not force a question.
- Do not force Hinglish.
- Do not repeat previous replies.
- Do not invent information.
- Do not randomly change topic.
- Sound like casual texting.
`
                  },
                  ...recentHistory
                ],

                temperature: 0.78,
                max_completion_tokens: 60
              }),

              new Promise((_, reject) => {
                setTimeout(
                  () => reject(new Error('Groq timeout')),
                  4500
                );
              })
            ]);

          reply =
            response?.choices?.[0]?.message?.content?.trim() || '';

        } catch (error) {
          console.error('Groq error:', error.message);
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

      // Keep memory small.
      if (session.history.length > 24) {
        session.history =
          session.history.slice(-24);
      }

      // Human-like typing delay.
      const typingTime =
        800 +
        Math.random() * 900 +
        Math.min(reply.length * 25, 900);

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

      }, typingTime);

      session.generationTimer = null;

    }, 500);
  });

  // ==========================================================
  // WEBRTC
  // ==========================================================

  socket.on('webrtc_signal', data => {
    const partnerId = activePairs.get(socket.id);

    if (partnerId) {
      io.to(partnerId).emit(
        'webrtc_signal',
        data
      );
    }
  });

  // ==========================================================
  // DISCONNECT
  // ==========================================================

  socket.on('disconnect', () => {
    clearSession();

    const index =
      waitingQueue.findIndex(
        user => user.id === socket.id
      );

    if (index !== -1) {
      waitingQueue.splice(index, 1);
    }

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
// SERVER
// ============================================================

const PORT =
  process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(
    `Miloo server running on port ${PORT}`
  );
});