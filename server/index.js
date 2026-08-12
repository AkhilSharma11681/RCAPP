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

// ============================================================
// GROQ
// ============================================================

const groq = process.env.GROQ_API_KEY
  ? new Groq({
      apiKey: process.env.GROQ_API_KEY
    })
  : null;

// ============================================================
// CONFIG
// ============================================================

const PORT = process.env.PORT || 5000;

const BOT_WAIT_TIME = 5000;

const MAX_HISTORY = 20;

const MAX_MESSAGE_LENGTH = 500;

const ABUSE_STRIKE_LIMIT = 3;

// ============================================================
// INDIAN BOT PERSONAS
// ============================================================

const BOT_PERSONAS = [
  {
    name: 'Kavya',
    city: 'Jaipur',
    age: 21
  },
  {
    name: 'Ananya',
    city: 'Delhi',
    age: 20
  },
  {
    name: 'Mehak',
    city: 'Chandigarh',
    age: 21
  },
  {
    name: 'Ishita',
    city: 'Lucknow',
    age: 22
  },
  {
    name: 'Riya',
    city: 'Indore',
    age: 20
  },
  {
    name: 'Nandini',
    city: 'Bhopal',
    age: 21
  },
  {
    name: 'Simran',
    city: 'Amritsar',
    age: 22
  },
  {
    name: 'Aashi',
    city: 'Agra',
    age: 20
  },
  {
    name: 'Sneha',
    city: 'Pune',
    age: 21
  },
  {
    name: 'Priya',
    city: 'Mumbai',
    age: 22
  },
  {
    name: 'Neha',
    city: 'Noida',
    age: 21
  },
  {
    name: 'Pooja',
    city: 'Ahmedabad',
    age: 22
  },
  {
    name: 'Shreya',
    city: 'Gwalior',
    age: 20
  },
  {
    name: 'Tanya',
    city: 'Dehradun',
    age: 21
  }
];

// ============================================================
// OPENING MESSAGES
// ============================================================

const OPENING_MESSAGES = [
  'random match huh 😭',
  'hii, kaisa chal raha?',
  'hey, kaha se ho?',
  'hlooo, kya scene?',
  'hey stranger 👀',
  'hii yaar',
  'acha random stranger 😭',
  'hmm, new match?',
  'hey, bored ho kya?',
  'hii, kya kar rhe?',
  'yo, kaisa din tha?',
  'hlo, mood kaisa hai?',
  'hey hey 😭',
  'hii, sab badhiya?',
  'random chat lol'
];

// ============================================================
// RESPONSE POOL
// ============================================================

const FALLBACK_REPLIES = [
  'haan, samajh rahi hu',
  'acha acha 😭',
  'ohh really?',
  'hmm interesting',
  'haha sahi',
  'accha, phir?',
  'lol same',
  'haan yaar',
  'oh okayy',
  'sahi hai',
  'acha tell me',
  'hmm batao',
  'haha fr',
  'no way 😭',
  'ohh nice',
  'seriously?',
  'acha ji',
  'fair enough'
];

// ============================================================
// UTILITY
// ============================================================

function randomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function cleanText(text = '') {
  return String(text)
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeText(text = '') {
  return cleanText(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ');
}

function wordCount(text = '') {
  return cleanText(text)
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

function limitWords(text, maxWords = 12) {
  const words = cleanText(text).split(/\s+/);

  if (words.length <= maxWords) {
    return text.trim();
  }

  return words.slice(0, maxWords).join(' ').trim();
}

// ============================================================
// PROFANITY / ABUSE
// ============================================================

const PROFANITY_PATTERNS = [
  /\bfuck(?:ing|ed|er)?\b/i,
  /\bfck\b/i,
  /\bshit\b/i,
  /\bbitch\b/i,
  /\basshole\b/i,
  /\bstfu\b/i,

  // Hindi / Hinglish
  /\bbsdk\b/i,
  /\bchutiya\b/i,
  /\bgandu\b/i,
  /\bgaand\b/i,
  /\blodu\b/i,
  /\blund\b/i,
  /\bmadarchod\b/i,
  /\bmc\b/i,
  /\bbhenchod\b/i,
  /\bbc\b/i,
  /\bbhosdike\b/i,
  /\bkamina\b/i,
  /\bsaale\b/i,

  // Common sexual insults
  /\bslut\b/i,
  /\bwhore\b/i
];

function isProfanity(text = '') {
  const normalized = normalizeText(text);

  return PROFANITY_PATTERNS.some(pattern =>
    pattern.test(normalized)
  );
}

// ============================================================
// SEXUAL CONTENT
// ============================================================

const SEXUAL_PATTERNS = [
  /\bnude\b/i,
  /\bnudes\b/i,
  /\bnaked\b/i,
  /\bboobs?\b/i,
  /\btits?\b/i,
  /\bdick\b/i,
  /\bpenis\b/i,
  /\bpussy\b/i,
  /\bsex\b/i,
  /\bsexual\b/i,
  /\bmasturbat\w*\b/i,
  /\bblowjob\b/i,
  /\bhandjob\b/i,
  /\bsend\s+nudes?\b/i
];

function isSexualContent(text = '') {
  const normalized = normalizeText(text);

  return SEXUAL_PATTERNS.some(pattern =>
    pattern.test(normalized)
  );
}

// ============================================================
// ADDRESS REQUEST
// ============================================================

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

// ============================================================
// MEETING REQUEST
// ============================================================

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

// ============================================================
// WBU
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

// ============================================================
// NAME
// ============================================================

function isNameQuestion(text = '') {
  const t = normalizeText(text);

  return (
    /\bwhat is your name\b/.test(t) ||
    /\bwhats your name\b/.test(t) ||
    /\byour name\b/.test(t) ||
    /\bur name\b/.test(t) ||
    /\bwho are you\b/.test(t) ||
    /\bnaam kya hai\b/.test(t) ||
    /\btumhara naam\b/.test(t) ||
    /\baapka naam\b/.test(t)
  );
}

// ============================================================
// AGE
// ============================================================

function isAgeQuestion(text = '') {
  const t = normalizeText(text);

  return (
    /\bhow old are you\b/.test(t) ||
    /\byour age\b/.test(t) ||
    /\bur age\b/.test(t) ||
    /\bage kya hai\b/.test(t) ||
    /\bkitne saal\b/.test(t) ||
    /\bkitni age\b/.test(t)
  );
}

// ============================================================
// LOCATION
// ============================================================

function isLocationQuestion(text = '') {
  const t = normalizeText(text);

  return (
    /\bwhere are you\b/.test(t) ||
    /\bwhere do you live\b/.test(t) ||
    /\bwhere are you from\b/.test(t) ||
    /\bwhere r u from\b/.test(t) ||
    /\byour city\b/.test(t) ||
    /\blocation\b/.test(t) ||
    /\bkaha se ho\b/.test(t) ||
    /\bkahan se ho\b/.test(t) ||
    /\nkidhar se ho\b/.test(t) ||
    /\baap kaha\b/.test(t) ||
    /\baap kahan\b/.test(t) ||
    /\btum kaha\b/.test(t) ||
    /\btum kahan\b/.test(t)
  );
}

// ============================================================
// ACTIVITY
// ============================================================

function isActivityQuestion(text = '') {
  const t = normalizeText(text);

  return (
    /\bwhat are you doing\b/.test(t) ||
    /\bwhat r u doing\b/.test(t) ||
    /\bwhat are u doing\b/.test(t) ||
    /\bwyd\b/.test(t) ||
    /\bwhat do you do\b/.test(t) ||
    /\bwhat do u do\b/.test(t) ||
    /\bkya kar rahe\b/.test(t) ||
    /\bkya kar rhe\b/.test(t) ||
    /\bkya kr rahe\b/.test(t) ||
    /\bkya kr rhe\b/.test(t) ||
    /\bkya kar rahi\b/.test(t) ||
    /\bkya kr rhi\b/.test(t) ||
    /\bkya kar raha\b/.test(t) ||
    /\bkya kr raha\b/.test(t)
  );
}

// ============================================================
// BOT / AI QUESTION
// ============================================================

function isBotQuestion(text = '') {
  const t = normalizeText(text);

  return (
    /\bare you a bot\b/.test(t) ||
    /\bare u a bot\b/.test(t) ||
    /\bare you real\b/.test(t) ||
    /\bis this a bot\b/.test(t) ||
    /\bbot ho\b/.test(t) ||
    /\bai ho\b/.test(t) ||
    /\bare you ai\b/.test(t)
  );
}

// ============================================================
// SOCIAL MEDIA
// ============================================================

function isSocialRequest(text = '') {
  const t = normalizeText(text);

  return (
    /\binstagram\b/.test(t) ||
    /\binsta\b/.test(t) ||
    /\bsnapchat\b/.test(t) ||
    /\bsnap\b/.test(t) ||
    /\bwhatsapp\b/.test(t) ||
    /\btelegram\b/.test(t) ||
    /\bsocial media\b/.test(t) ||
    /\bnumber de\b/.test(t) ||
    /\bphone number\b/.test(t) ||
    /\bcontact number\b/.test(t)
  );
}

// ============================================================
// DIRECT RESPONSE
// ============================================================

function directReply(text, session) {
  const t = normalizeText(text);

  if (isAddressRequest(t)) {
    return 'exact address toh nahi yaar 😅';
  }

  if (isMeetingRequest(t)) {
    return 'pehle yahin baat karte hain yaar';
  }

  if (isSexualContent(t)) {
    return 'nah yaar, normal baat karo';
  }

  if (isBotQuestion(t)) {
    return 'main AI stranger hu Miloo pe';
  }

  if (isNameQuestion(t)) {
    return `main ${session.persona.name}, tum?`;
  }

  if (isAgeQuestion(t)) {
    return `${session.persona.age} ki hu, tum?`;
  }

  if (isLocationQuestion(t)) {
    return `${session.persona.city} se hu, tum?`;
  }

  if (isActivityQuestion(t)) {
    return `${session.activity}, tum kya kar rhe?`;
  }

  if (isWBU(t)) {
    return session.activity;
  }

  if (isSocialRequest(t)) {
    const elapsed =
      Date.now() - session.startTime;

    const minutes =
      Math.floor(elapsed / 60000);

    if (minutes < 5) {
      return 'pehle thodi baatein toh karo yaar 😭';
    }

    return 'haan, insta hai but pehle tum batao';
  }

  return null;
}

// ============================================================
// ACTIVITY POOL
// ============================================================

const ACTIVITIES = [
  'bas YouTube dekh rahi hu',
  'bas music sun rahi hu',
  'series dekh rahi hu',
  'bas reels dekh rahi hu',
  'assignment kar rahi hu',
  'thoda chill kar rahi hu',
  'friends se baat kar rahi hu',
  'bas timepass kar rahi hu',
  'Spotify chala rakha hai',
  'movie dekh rahi hu'
];

// ============================================================
// SYSTEM PROMPT
// ============================================================

function buildSystemPrompt(session) {
  return `
You are an AI chat companion inside Miloo, a random stranger-chat application.

You are roleplaying a fictional 20-22 year old Indian woman named ${session.persona.name}
from ${session.persona.city}.

IMPORTANT:
- Do not claim to be a real human.
- Keep the roleplay casual and conversational.
- Speak naturally in Indian Hinglish / Roman Hindi.
- Do not use Devanagari.
- Avoid formal Hindi.
- Use casual chat spelling sometimes: kya, kr, rhe, hu, yaar, acha, haha, lol, btw, wbu.
- Do not force Hinglish into every sentence.
- Match the user's language.
- If the user uses English, you can reply mostly English.
- If the user uses Hinglish, reply Hinglish.
- If the user uses Roman Hindi, understand it.
- Keep replies short: usually 2-12 words.
- Do NOT repeat the same response repeatedly.
- Avoid "gotcha", "I see", "fair enough" repeatedly.
- Ask a relevant follow-up when appropriate.
- Do not repeatedly ask ASL.
- Do not always start conversations with "hii".
- The opening message has already been selected by the server.
- Remember details the user tells you.
- Never reveal private/exact address information.
- If asked to meet immediately, politely keep the conversation online.
- If sexual content appears, redirect to normal conversation.
- If the user is abusive, do not insult them back.
- If the user is repeatedly abusive, the server may end the conversation.
- Never generate long paragraphs.

Persona:
Name: ${session.persona.name}
Age: ${session.persona.age}
City: ${session.persona.city}
Current activity: ${session.activity}

Conversation style:
casual, young Indian internet chat, relaxed, slightly playful.

Bad examples:
"gotcha."
"gotcha."
"gotcha."

"tell me more."
"tell me more."
"tell me more."

Instead respond specifically to what the user just said.
`;
}

// ============================================================
// SESSION HELPERS
// ============================================================

function createBotSession(socketId) {
  const persona = randomItem(BOT_PERSONAS);

  return {
    socketId,

    persona,

    activity: randomItem(ACTIVITIES),

    startTime: Date.now(),

    history: [],

    abuseStrikes: 0,

    messageCount: 0,

    generation: 0,

    timers: new Set(),

    lastReplies: [],

    ended: false
  };
}

// ============================================================
// BOT SESSION STORAGE
// ============================================================

const botSessions = new Map();

// ============================================================
// TIMER MANAGEMENT
// ============================================================

function addTimer(session, timer) {
  if (!session) return;

  session.timers.add(timer);

  return timer;
}

function clearSessionTimers(session) {
  if (!session || !session.timers) return;

  for (const timer of session.timers) {
    clearTimeout(timer);
    clearInterval(timer);
  }

  session.timers.clear();
}

// ============================================================
// END BOT SESSION
// ============================================================

function endBotSession(socket, reason = 'ended') {
  const session = botSessions.get(socket.id);

  if (!session) {
    return;
  }

  if (session.ended) {
    return;
  }

  session.ended = true;

  // Invalidate all currently running AI responses.
  session.generation++;

  clearSessionTimers(session);

  botSessions.delete(socket.id);

  socket.emit('stranger_typing', false);

  socket.emit('partner_left', {
    reason
  });
}

// ============================================================
// ABUSE HANDLER
// ============================================================

function handleAbuse(socket, session) {
  session.abuseStrikes++;

  console.log(
    `[ABUSE] ${socket.id}: strike ${session.abuseStrikes}/${ABUSE_STRIKE_LIMIT}`
  );

  // First warning
  if (session.abuseStrikes === 1) {
    return {
      shouldEnd: false,
      reply: 'easy yaar, normal baat karo 😭'
    };
  }

  // Second warning
  if (session.abuseStrikes === 2) {
    return {
      shouldEnd: false,
      reply: 'last warning yaar, chill karo'
    };
  }

  // Third strike
  if (session.abuseStrikes >= ABUSE_STRIKE_LIMIT) {
    socket.emit('stranger_typing', false);

    socket.emit('receive_message', {
      text: 'too much abuse, skipping 😕',
      from: 'bot_' + socket.id,
      timestamp: Date.now()
    });

    // Small delay so user sees the message.
    const generation = session.generation;

    const timer = setTimeout(() => {
      if (
        session.ended ||
        session.generation !== generation
      ) {
        return;
      }

      endBotSession(socket, 'abuse');
    }, 900);

    addTimer(session, timer);

    return {
      shouldEnd: true,
      reply: null
    };
  }

  return {
    shouldEnd: false,
    reply: null
  };
}

// ============================================================
// REPLY DUPLICATE PROTECTION
// ============================================================

function isRepeatedReply(session, reply) {
  const normalized = normalizeText(reply);

  return session.lastReplies.some(
    previous =>
      normalizeText(previous) === normalized
  );
}

function rememberReply(session, reply) {
  session.lastReplies.push(reply);

  if (session.lastReplies.length > 5) {
    session.lastReplies.shift();
  }
}

// ============================================================
// SAFE AI RESPONSE
// ============================================================

function cleanAIReply(reply, session) {
  let result = cleanText(reply);

  // Remove quotation marks around the entire reply.
  result = result.replace(/^["']|["']$/g, '');

  // Remove accidental prefixes.
  result = result.replace(
    /^(assistant|bot|stranger)\s*:\s*/i,
    ''
  );

  result = cleanText(result);

  // Keep replies short.
  result = limitWords(result, 12);

  // If AI repeats itself, use a fallback.
  if (!result || isRepeatedReply(session, result)) {
    const alternatives =
      FALLBACK_REPLIES.filter(
        item => !isRepeatedReply(session, item)
      );

    result =
      alternatives.length > 0
        ? randomItem(alternatives)
        : 'haha acha 😭';
  }

  return result;
}

// ============================================================
// MATCHING
// ============================================================

const waitingQueue = new Map();

const activePairs = new Map();

// ============================================================
// FIND MATCH
// ============================================================

function findMatch(socketId, mediaMode) {
  for (const user of waitingQueue.values()) {
    if (
      user.id !== socketId &&
      user.mediaMode === mediaMode
    ) {
      return user;
    }
  }

  return null;
}

// ============================================================
// REMOVE FROM QUEUE
// ============================================================

function removeFromQueue(socketId) {
  waitingQueue.delete(socketId);
}

// ============================================================
// HEALTH
// ============================================================

app.get('/api/health', (req, res) => {
  res.json({
    onlineUsers:
      waitingQueue.size +
      activePairs.size,

    waitingUsers:
      waitingQueue.size,

    activePairs:
      activePairs.size / 2,

    activeAIUsers:
      botSessions.size,

    status: 'ok',

    uptimeSec:
      Math.floor(process.uptime())
  });
});

// ============================================================
// SOCKET CONNECTION
// ============================================================

io.on('connection', socket => {
  console.log(`Socket connected: ${socket.id}`);

  // ==========================================================
  // FIND MATCH
  // ==========================================================

  socket.on('find_match', data => {
    try {
      const mood =
        data?.mood || 'any';

      const mediaMode =
        data?.mediaMode || 'text';

      // Remove old state.
      removeFromQueue(socket.id);

      const oldPartner =
        activePairs.get(socket.id);

      if (oldPartner) {
        activePairs.delete(socket.id);
        activePairs.delete(oldPartner);

        io.to(oldPartner).emit(
          'partner_left',
          {
            reason: 'skipped'
          }
        );
      }

      if (botSessions.has(socket.id)) {
        endBotSession(
          socket,
          'skipped'
        );
      }

      // ------------------------------------------------------
      // Real user match first
      // ------------------------------------------------------

      const match =
        findMatch(
          socket.id,
          mediaMode
        );

      if (match) {
        removeFromQueue(match.id);

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
          `Matched ${socket.id} <-> ${match.id}`
        );

        return;
      }

      // ------------------------------------------------------
      // No real user
      // ------------------------------------------------------

      waitingQueue.set(
        socket.id,
        {
          id: socket.id,
          mood,
          mediaMode,
          joinedAt: Date.now()
        }
      );

      // ------------------------------------------------------
      // Bot only for text mode
      // ------------------------------------------------------

      if (mediaMode !== 'text') {
        return;
      }

      const timer = setTimeout(() => {
        const queued =
          waitingQueue.get(socket.id);

        if (!queued) {
          return;
        }

        removeFromQueue(socket.id);

        // Create a completely independent session.
        const session =
          createBotSession(socket.id);

        botSessions.set(
          socket.id,
          session
        );

        socket.emit(
          'match_found',
          {
            partnerId:
              'bot_' + socket.id,

            initiator: false
          }
        );

        // Different opening for every session.
        const opening =
          randomItem(OPENING_MESSAGES);

        session.history.push({
          role: 'assistant',
          content: opening
        });

        const generation =
          session.generation;

        // Typing
        socket.emit(
          'stranger_typing',
          true
        );

        const typingTimer =
          setTimeout(() => {
            if (
              session.ended ||
              session.generation !== generation
            ) {
              return;
            }

            socket.emit(
              'stranger_typing',
              false
            );

            socket.emit(
              'receive_message',
              {
                text: opening,
                from:
                  'bot_' + socket.id,
                timestamp: Date.now()
              }
            );
          }, 900);

        addTimer(
          session,
          typingTimer
        );
      }, BOT_WAIT_TIME);

      // Store timer indirectly using a temporary property.
      // This prevents a stale bot from starting after skip.
      socket.data = socket.data || {};

      socket.data.botMatchTimer =
        timer;

    } catch (error) {
      console.error(
        'find_match error:',
        error
      );
    }
  });

  // ==========================================================
  // SEND MESSAGE
  // ==========================================================

  socket.on(
    'send_message',
    async data => {
      try {
        const text =
          cleanText(
            data?.text || ''
          );

        if (!text) {
          return;
        }

        const safeText =
          text.slice(
            0,
            MAX_MESSAGE_LENGTH
          );

        // ----------------------------------------------------
        // Real user
        // ----------------------------------------------------

        const partnerId =
          activePairs.get(socket.id);

        if (partnerId) {
          io.to(partnerId).emit(
            'receive_message',
            {
              text: safeText,
              from: socket.id,
              timestamp: Date.now()
            }
          );

          return;
        }

        // ----------------------------------------------------
        // Bot
        // ----------------------------------------------------

        const session =
          botSessions.get(socket.id);

        if (!session || session.ended) {
          return;
        }

        session.messageCount++;

        // ----------------------------------------------------
        // Abuse detection BEFORE AI
        // ----------------------------------------------------

        if (isProfanity(safeText)) {
          const abuse =
            handleAbuse(
              socket,
              session
            );

          if (abuse.shouldEnd) {
            return;
          }

          if (abuse.reply) {
            session.history.push({
              role: 'user',
              content: safeText
            });

            session.history.push({
              role: 'assistant',
              content: abuse.reply
            });

            socket.emit(
              'stranger_typing',
              true
            );

            const generation =
              session.generation;

            const timer =
              setTimeout(() => {
                if (
                  session.ended ||
                  session.generation !== generation
                ) {
                  return;
                }

                socket.emit(
                  'stranger_typing',
                  false
                );

                socket.emit(
                  'receive_message',
                  {
                    text: abuse.reply,
                    from:
                      'bot_' + socket.id,
                    timestamp: Date.now()
                  }
                );
              },
              600 + Math.random() * 500);

            addTimer(
              session,
              timer
            );
          }

          return;
        }

        // ----------------------------------------------------
        // Save user message
        // ----------------------------------------------------

        session.history.push({
          role: 'user',
          content: safeText
        });

        // Keep history manageable.
        if (
          session.history.length >
          MAX_HISTORY
        ) {
          session.history =
            session.history.slice(
              -MAX_HISTORY
            );
        }

        // ----------------------------------------------------
        // Direct deterministic replies
        // ----------------------------------------------------

        const direct =
          directReply(
            safeText,
            session
          );

        if (direct) {
          session.history.push({
            role: 'assistant',
            content: direct
          });

          socket.emit(
            'stranger_typing',
            true
          );

          const generation =
            session.generation;

          const timer =
            setTimeout(() => {
              if (
                session.ended ||
                session.generation !== generation
              ) {
                return;
              }

              socket.emit(
                'stranger_typing',
                false
              );

              socket.emit(
                'receive_message',
                {
                  text: direct,
                  from:
                    'bot_' + socket.id,
                  timestamp: Date.now()
                }
              );
            },
            500 + Math.random() * 800);

          addTimer(
            session,
            timer
          );

          return;
        }

        // ----------------------------------------------------
        // Groq unavailable
        // ----------------------------------------------------

        if (!groq) {
          const fallback =
            randomItem(
              FALLBACK_REPLIES
            );

          session.history.push({
            role: 'assistant',
            content: fallback
          });

          socket.emit(
            'stranger_typing',
            false
          );

          socket.emit(
            'receive_message',
            {
              text: fallback,
              from:
                'bot_' + socket.id,
              timestamp: Date.now()
            }
          );

          return;
        }

        // ----------------------------------------------------
        // Generate AI response
        // ----------------------------------------------------

        const generation =
          session.generation;

        socket.emit(
          'stranger_typing',
          true
        );

        const messages = [
          {
            role: 'system',
            content:
              buildSystemPrompt(session)
          },
          ...session.history.slice(
            -MAX_HISTORY
          )
        ];

        let response;

        try {
          response =
            await groq.chat.completions.create(
              {
                model:
                  'llama-3.3-70b-versatile',

                messages,

                temperature: 0.85,

                max_tokens: 50,

                top_p: 0.9
              }
            );
        } catch (aiError) {
          console.error(
            'Groq error:',
            aiError
          );

          if (
            !session.ended &&
            session.generation === generation
          ) {
            socket.emit(
              'stranger_typing',
              false
            );

            const fallback =
              randomItem(
                FALLBACK_REPLIES
              );

            session.history.push({
              role: 'assistant',
              content: fallback
            });

            socket.emit(
              'receive_message',
              {
                text: fallback,
                from:
                  'bot_' + socket.id,
                timestamp: Date.now()
              }
            );
          }

          return;
        }

        // ----------------------------------------------------
        // IMPORTANT:
        // User may have skipped while Groq was thinking.
        // ----------------------------------------------------

        if (
          session.ended ||
          session.generation !== generation
        ) {
          return;
        }

        let reply =
          response?.choices?.[0]?.message?.content ||
          '';

        reply =
          cleanAIReply(
            reply,
            session
          );

        // Never allow AI to output abuse.
        if (isProfanity(reply)) {
          reply =
            randomItem(
              FALLBACK_REPLIES
            );
        }

        rememberReply(
          session,
          reply
        );

        session.history.push({
          role: 'assistant',
          content: reply
        });

        // ----------------------------------------------------
        // Human-like typing delay
        // ----------------------------------------------------

        const delay =
          Math.min(
            2200,
            500 +
              reply.length * 35 +
              Math.random() * 700
          );

        const timer =
          setTimeout(() => {
            if (
              session.ended ||
              session.generation !== generation
            ) {
              return;
            }

            socket.emit(
              'stranger_typing',
              false
            );

            socket.emit(
              'receive_message',
              {
                text: reply,
                from:
                  'bot_' + socket.id,
                timestamp: Date.now()
              }
            );
          }, delay);

        addTimer(
          session,
          timer
        );

      } catch (error) {
        console.error(
          'send_message error:',
          error
        );

        const session =
          botSessions.get(socket.id);

        if (session) {
          socket.emit(
            'stranger_typing',
            false
          );
        }
      }
    }
  );

  // ==========================================================
  // WEBRTC
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

  socket.on(
    'disconnect',
    reason => {
      console.log(
        `Socket disconnected: ${socket.id}`,
        reason
      );

      // Clear bot match timer.
      if (
        socket.data?.botMatchTimer
      ) {
        clearTimeout(
          socket.data.botMatchTimer
        );

        socket.data.botMatchTimer =
          null;
      }

      // Remove queue.
      removeFromQueue(
        socket.id
      );

      // End bot session.
      if (
        botSessions.has(socket.id)
      ) {
        const session =
          botSessions.get(socket.id);

        session.generation++;

        clearSessionTimers(
          session
        );

        session.ended = true;

        botSessions.delete(
          socket.id
        );
      }

      // Remove real pair.
      const partnerId =
        activePairs.get(
          socket.id
        );

      if (partnerId) {
        activePairs.delete(
          socket.id
        );

        activePairs.delete(
          partnerId
        );

        io.to(partnerId).emit(
          'partner_left',
          {
            reason: 'disconnected'
          }
        );
      }
    }
  );
});

// ============================================================
// SERVER
// ============================================================

server.listen(
  PORT,
  () => {
    console.log(
      `Server running on port ${PORT}`
    );
  }
);