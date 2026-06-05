import { useEffect, useMemo, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import FingerprintJS from '@fingerprintjs/fingerprintjs'
import ThemeToggle from '../components/ThemeToggle'
import useCanonical from '../hooks/useCanonical'
import { trackEvent, markFirstMatch } from '../utils/analytics'


const SERVER =
  window.location.hostname === 'localhost'
    ? 'http://localhost:3001'
    : 'https://rcapp-server.onrender.com'

const FALLBACK_PERSONAS = [
  { key: 'Milo', label: 'Milo', emoji: '🤎', tagline: 'Warm & steady', description: 'A gentle, curious listener who makes you feel at home.' },
  { key: 'Mira', label: 'Mira', emoji: '💜', tagline: 'Playful & bright', description: 'A bubbly, witty friend who keeps the energy high.' },
  { key: 'Jax', label: 'Jax', emoji: '🖤', tagline: 'Sarcastic & sharp', description: 'A dry-humored, deadpan friend who tells it like it is.' },
]

const FALLBACK_OPENERS = {
  vent: ["Hey, I'm here. Want to vent for a bit?", "Rough day? I'm all ears.", "Tell me what's going on — no judgment."],
  laugh: ["Okay okay, hit me with your worst joke.", "I need a laugh too — go.", "Tell me the dumbest thing that happened today."],
  music: ["What's the song stuck in your head right now?", "Drop a track recommendation on me.", "What artist have you been defending lately?"],
  deep: ["What's been on your mind lately?", "Tell me something you've been thinking about.", "I want the real answer — how are you, actually?"],
  gaming: ["What game could you replay forever?", "Controller or keyboard? Choose your fighter.", "What's your K/D on life this week?"],
  culture: ["Where are you from?", "What's a food everyone should try once?", "Best custom from your culture?"],
  any: ["Hey! How's it going?", "Tell me something interesting.", "What's the vibe tonight?"],
}

function getGoodbyeForPersona(persona) {
  if (persona === 'Mira') {
    return "Ooh, a match! Time for me to skip. Go have fun! Bye 💜"
  }
  if (persona === 'Jax') {
    return "Your match is here. I'm out of here. Don't make it awkward. Bye 🖤"
  }
  return "Someone is here! Connecting you now. Have a wonderful chat! Bye 🤎"
}


const iceConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
}

async function fetchTurnCredentials() {
  try {
    const res = await fetch(`${SERVER}/api/turn-credentials`)
    const turnServers = await res.json()
    // Metered returns an array of ICE server objects
    if (Array.isArray(turnServers) && turnServers.length > 0) {
      return { iceServers: turnServers }
    }
    return iceConfig
  } catch {
    // Fallback to STUN-only if TURN fetch fails
    return iceConfig
  }
}

const MOOD_META = {
  vent: {
    label: 'Vent',
    emoji: '😤',
    waiting: ['Finding a calm listener...', 'Matching you with someone patient...', 'Looking for a safe space conversation...'],
    prompts: [
      'Do you want advice, comfort, or just someone to listen?',
      'What kind of day have you had so far?',
      'What is on your mind most right now?',
    ],
  },
  laugh: {
    label: 'Just Laugh',
    emoji: '😂',
    waiting: ['Finding someone fun...', 'Looking for a light vibe match...', 'Searching for instant chaos and jokes...'],
    prompts: [
      'Tell the worst joke you know.',
      'What is the funniest thing you saw this week?',
      'If your life had a meme title, what would it be?',
    ],
  },
  music: {
    label: 'Music',
    emoji: '🎵',
    waiting: ['Finding another music lover...', 'Looking for someone on your wavelength...', 'Searching for a shared soundtrack...'],
    prompts: [
      'What song matches your mood right now?',
      'Which artist do you never get tired of?',
      'What song would you play for a stranger first?',
    ],
  },
  deep: {
    label: 'Deep Talk',
    emoji: '🧠',
    waiting: ['Finding someone real...', 'Looking for a thoughtful conversation...', 'Searching for a deeper connection...'],
    prompts: [
      'What have you been thinking about a lot lately?',
      'What is something you understand better now than a year ago?',
      'What kind of conversation are you hoping for tonight?',
    ],
  },
  gaming: {
    label: 'Gaming',
    emoji: '🎮',
    waiting: ['Finding another gamer...', 'Looking for your next duo partner...', 'Searching for someone in the same lobby of life...'],
    prompts: [
      'What game could you replay forever?',
      'Controller or keyboard?',
      'What game are you best at but still complain about?',
    ],
  },
  culture: {
    label: 'Culture',
    emoji: '🌍',
    waiting: ['Finding someone from another world...', 'Looking for a curious mind...', 'Searching for a global vibe match...'],
    prompts: [
      'Where are you from and what is underrated about it?',
      'What food should everyone try once?',
      'What custom from your culture do you love most?',
    ],
  },
  any: {
    label: 'Random',
    emoji: '✨',
    waiting: ['Finding a good surprise...', 'Looking for someone interesting...', 'Searching across every vibe...'],
    prompts: [
      'What kind of conversation are you open to?',
      'What is your energy like tonight?',
      'What usually makes a stranger instantly interesting to you?',
    ],
  },
}

const INTENT_META = {
  listener: 'Wants to be heard',
  advice: 'Open to advice',
  vibe: 'Just wants to vibe',
  fun: 'Wants playful energy',
  interesting: 'Wants someone interesting',
  random: 'Open to anything',
}

function getMoodMeta(mood) {
  return MOOD_META[mood] || MOOD_META.any
}

function randomFrom(list) {
  return list[Math.floor(Math.random() * list.length)]
}

export default function ChatRoom({ mood, intent, safeMode, chatMode = 'video', theme, onToggleTheme, onExit }) {
  useCanonical('https://www.miloo.chat/chat')
  const moodMeta = useMemo(() => getMoodMeta(mood), [mood])
  const fingerprintRef = useRef('fp_' + Math.random().toString(36).slice(2, 11))

  const [status, setStatus] = useState(chatMode === 'text' ? 'text_connecting' : 'pre_permission')
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [starter, setStarter] = useState('')
  const [goodSent, setGoodSent] = useState(false)
  const [muted, setMuted] = useState(false)
  const [camOff, setCamOff] = useState(false)
  const [myBlur, setMyBlur] = useState(safeMode)
  const [partnerBlurred, setPartnerBlurred] = useState(safeMode)
  const [chatFocused, setChatFocused] = useState(false)
  const [unread, setUnread] = useState(0)
  const [waitingHint, setWaitingHint] = useState(randomFrom(moodMeta.waiting))
  const [matchSeconds, setMatchSeconds] = useState(0)
  const [quickPrompt, setQuickPrompt] = useState(randomFrom(moodMeta.prompts))
  const [reportSent, setReportSent] = useState(false)
  const [partnerTyping, setPartnerTyping] = useState(false)
  const [myMediaMode, setMyMediaMode] = useState('text')
  const [partnerMediaMode, setPartnerMediaMode] = useState(null)

  // Milo AI companion state
  const [isMiloActive, setIsMiloActive] = useState(false)
  const isMiloActiveRef = useRef(false)
  const [miloMessages, setMiloMessages] = useState([])
  const [miloInput, setMiloInput] = useState('')
  const [miloTyping, setMiloTyping] = useState(false)
  const [waitingTime, setWaitingTime] = useState(0)
  const [onlineCount, setOnlineCount] = useState(null)
  const [rotatingMsg, setRotatingMsg] = useState(0)
  const [chatRating, setChatRating] = useState(0)
  const [reconnectCode, setReconnectCode] = useState(null)
  const [reconnectCodeCopied, setReconnectCodeCopied] = useState(false)
  const [showSharePrompt, setShowSharePrompt] = useState(false)
  const [slowDownSeconds, setSlowDownSeconds] = useState(0)
  const [justMatched, setJustMatched] = useState(false)
  const [miloPersona, setMiloPersona] = useState(null)
  const [miloPersonaOptions, setMiloPersonaOptions] = useState([])
  const [miloOpeners, setMiloOpeners] = useState(null)
  const miloMessagesEndRef = useRef(null)

  const miloTimerRef = useRef(null)
  const waitingTimeRef = useRef(null)
  const rotatingMsgRef = useRef(null)
  const slowDownTimerRef = useRef(null)
  const statusRef = useRef(status)
  statusRef.current = status
  const findNextRef = useRef(null)
  const moodRef = useRef(mood)
  const intentRef = useRef(intent)
  const chatModeRef = useRef(chatMode)
  const mediaModeRefState = useRef('text')
  const camErrorRetriedRef = useRef(false)

  const socketRef = useRef(null)
  const pcRef = useRef(null)
  const myVideoRef = useRef(null)
  const partnerVideoRef = useRef(null)
  const myStreamRef = useRef(null)
  const partnerIdRef = useRef(null)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const waitingHintRef = useRef(null)
  const waitingTimerRef = useRef(null)
  const candidateQueueRef = useRef([])
  const typingTimeoutRef = useRef(null)
  const mediaModeRef = useRef('text')
  const chatStartTimeRef = useRef(null)

  function emitTyping() {
    if (!partnerIdRef.current || !socketRef.current) return
    socketRef.current.emit('typing', { to: partnerIdRef.current })
  }

  // Load real fingerprint on mount and fetch Milo openers
  useEffect(() => {
    FingerprintJS.load()
      .then(fp => fp.get())
      .then(result => { fingerprintRef.current = result.visitorId })
      .catch(() => { /* keep fallback value */ })

    fetch(`${SERVER}/api/milo/openers`)
      .then(r => r.json())
      .then(data => {
        setMiloPersonaOptions(data.personas)
        setMiloOpeners(data.openers)
      })
      .catch(() => { /* keep fallback values */ })
  }, [])

  const ROTATING_MSGS = [
    'Koi interesting insaan dhoondh rahe hain... 🔍',
    'Almost there... 😊',
    'Good things take a moment yaar!',
    'Bas ek second...',
    'Sahi match dhoondh rahe hain tumhare liye ✨',
  ]

  // Fetch online count
  useEffect(() => {
    fetch(SERVER).then(r => r.json()).then(d => {
      setOnlineCount((d.active_pairs * 2) + d.waiting_users)
    }).catch(() => {})
  }, [])

  // Rotating waiting messages
  useEffect(() => {
    rotatingMsgRef.current = setInterval(() => {
      setRotatingMsg(prev => (prev + 1) % ROTATING_MSGS.length)
    }, 5000)
    return () => clearInterval(rotatingMsgRef.current)
  }, [])

  // Milo trigger — after 8s of waiting in text or 15s in video
  useEffect(() => {
    const isWaiting = ['waiting', 'text_connecting'].includes(status)
    const isTextMode = chatMode === 'text' || mediaModeRef.current === 'text'
    const threshold = isTextMode ? 8 : 15

    if (isWaiting && !isMiloActive) {
      waitingTimeRef.current = setInterval(() => {
        setWaitingTime(prev => {
          const next = prev + 1
          if (next >= threshold) {
            clearInterval(waitingTimeRef.current)
            isMiloActiveRef.current = true
            setIsMiloActive(true)
            trackEvent('milo_activated', { waitSeconds: next })
            // If persona is already set, send opening message directly!
            if (miloPersona) {
              const list = (miloOpeners && miloOpeners[mood]) || (miloOpeners && miloOpeners.any) || (FALLBACK_OPENERS[mood] || FALLBACK_OPENERS.any)
              const opener = list[Math.floor(Math.random() * list.length)]
              setMiloMessages([{
                role: 'assistant',
                content: opener,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              }])
              trackEvent('milo_2_activated', { persona: miloPersona, mood })
            }
          }
          return next
        })
      }, 1000)
    } else {
      clearInterval(waitingTimeRef.current)
      if (!isWaiting) setWaitingTime(0)
    }
    return () => clearInterval(waitingTimeRef.current)
  }, [status, isMiloActive, chatMode, miloPersona, miloOpeners, mood])

  // Scroll Milo messages
  useEffect(() => {
    miloMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [miloMessages])

  async function sendMiloMessage(customText) {
    const text = typeof customText === 'string' ? customText : miloInput
    if (!text.trim()) return

    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const userMsg = { role: 'user', content: text, time }
    const updated = [...miloMessages, userMsg]
    setMiloMessages(updated)
    setMiloInput('')
    setMiloTyping(true)

    trackEvent('milo_2_message_sent', { persona: miloPersona })

    try {
      const res = await fetch(`${SERVER}/api/milo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updated.map(m => ({ role: m.role, content: m.content })),
          persona: miloPersona,
          fingerprint: fingerprintRef.current,
          mood: mood,
        }),
      })
      const data = await res.json()
      const replyTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      setMiloMessages(prev => [...prev, { role: 'assistant', content: data.reply, time: replyTime }])
    } catch {
      setMiloMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Connection slow... one sec 😅',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }])
    } finally {
      setMiloTyping(false)
    }
  }

  const selectPersona = (personaKey) => {
    setMiloPersona(personaKey)
    const list = (miloOpeners && miloOpeners[mood]) || (miloOpeners && miloOpeners.any) || (FALLBACK_OPENERS[mood] || FALLBACK_OPENERS.any)
    const opener = list[Math.floor(Math.random() * list.length)]
    setMiloMessages([{
      role: 'assistant',
      content: opener,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }])
    trackEvent('milo_2_activated', { persona: personaKey, mood })
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    if (chatFocused) setUnread(0)
  }, [messages, chatFocused])

  useEffect(() => {
    if (!['waiting', 'connecting', 'slow_down'].includes(status)) {
      clearInterval(waitingHintRef.current)
      clearInterval(waitingTimerRef.current)
      setMatchSeconds(0)
      return
    }

    setWaitingHint(randomFrom(moodMeta.waiting))
    setMatchSeconds(0)

    waitingHintRef.current = setInterval(() => {
      setWaitingHint(randomFrom(moodMeta.waiting))
    }, 2600)

    waitingTimerRef.current = setInterval(() => {
      setMatchSeconds(prev => prev + 1)
    }, 1000)

    return () => {
      clearInterval(waitingHintRef.current)
      clearInterval(waitingTimerRef.current)
    }
  }, [status, moodMeta])

  useEffect(() => {
    if (chatMode === 'text') {
      initializeTextOnlySocket()
    }
    return () => {
      clearInterval(waitingHintRef.current)
      clearInterval(waitingTimerRef.current)
      clearInterval(slowDownTimerRef.current)
      closePC()
      myStreamRef.current?.getTracks().forEach(track => track.stop())
      socketRef.current?.disconnect()
    }
  }, [])

  function systemMessage(text) {
    setMessages(prev => [...prev, { from: 'system', text, id: Date.now() + Math.random() }])
  }

  function resetAll() {
    setMessages([])
    setUnread(0)
    setChatFocused(false)
    setGoodSent(false)
    setReportSent(false)
    setQuickPrompt(randomFrom(moodMeta.prompts))
    setPartnerBlurred(safeMode)
    setMyBlur(safeMode)
    isMiloActiveRef.current = false
    setIsMiloActive(false)
    setMiloMessages([])
    setWaitingTime(0)
    setChatRating(0)
    setReconnectCode(null)
    setReconnectCodeCopied(false)
    setShowSharePrompt(false)
  }

  function initializeTextOnlySocket() {
    setStatus('waiting')

    const socket = io(SERVER, {
      auth: { fingerprint: fingerprintRef.current },
      timeout: 20000,
    })

    socketRef.current = socket

    const wakeTimeout = setTimeout(() => {
      if (socket.connected) return
      setStatus('waking')
    }, 4000)

    socket.on('connect', () => {
      clearTimeout(wakeTimeout)
      setStatus('waiting')
      socket.emit('find_match', { mood, intent, textOnly: true })
    })

    socket.on('connect_error', () => {
      clearTimeout(wakeTimeout)
      setStatus('waking')
    })

    socket.on('waiting', () => setStatus('waiting'))
    socket.on('server_busy', () => setStatus('busy'))

    socket.on('slow_down', ({ waitSeconds }) => {
      setStatus('slow_down')
      setSlowDownSeconds(waitSeconds)
      systemMessage(`Too many fast skips. Take a breath ✋`)
      clearInterval(slowDownTimerRef.current)
      slowDownTimerRef.current = setInterval(() => {
        setSlowDownSeconds(prev => {
          if (prev <= 1) {
            clearInterval(slowDownTimerRef.current)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    })

    socket.on('match_found', ({ partnerId, starter: serverStarter }) => {
      trackEvent('match_found', { mode: 'text' })
      if (markFirstMatch()) {
        systemMessage('🎉 First chat! Say hi to break the ice.')
        trackEvent('first_match', { mood, mode: 'text' })
      }
      // If Milo was active, let Milo say goodbye first
      if (isMiloActiveRef.current) {
        const goodbyeText = getGoodbyeForPersona(miloPersona)
        setMiloMessages(prev => [...prev, {
          role: 'assistant',
          content: goodbyeText,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }])
        trackEvent('milo_2_handoff_completed', { persona: miloPersona })
        setTimeout(() => {
          setJustMatched(true)
          setTimeout(() => {
            setJustMatched(false)
            partnerIdRef.current = partnerId
            setStarter(serverStarter || '')
            setStatus('text_chat')
            resetAll()
            chatStartTimeRef.current = Date.now()
            trackEvent('chat_started', { mood, mode: 'text' })
          }, 1500)
        }, 1800)
      } else {
        setJustMatched(true)
        setTimeout(() => {
          setJustMatched(false)
          partnerIdRef.current = partnerId
          setStarter(serverStarter || '')
          setStatus('text_chat')
          resetAll()
          chatStartTimeRef.current = Date.now()
          trackEvent('chat_started', { mood, mode: 'text' })
        }, 1500)
      }
    })


    socket.on('receive_message', ({ message }) => {
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      setMessages(prev => [...prev, { from: 'them', text: message, time, id: Date.now() + Math.random() }])
      setPartnerTyping(false)
      if (!chatFocused) setUnread(prev => prev + 1)
    })

    socket.on('partner_typing', () => {
      setPartnerTyping(true)
      clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = setTimeout(() => setPartnerTyping(false), 2000)
    })

    socket.on('message_blocked', () => {
      systemMessage('Links and contact-sharing are blocked for safety.')
    })

    socket.on('partner_left', () => {
      const duration = chatStartTimeRef.current ? Math.floor((Date.now() - chatStartTimeRef.current) / 1000) : 0
      trackEvent('chat_ended', { duration_seconds: duration, ended_by: 'partner_left' })
      setStatus('partner_left')
    })

    socket.on('report_received', () => {
      setReportSent(true)
      systemMessage('Report received. Thanks for helping keep Miloo safe.')
    })

    socket.on('reconnect_code', ({ code }) => {
      setReconnectCode(code)
    })

    socket.on('code_invalid', () => {
      systemMessage('That code is invalid or has expired.')
    })
  }

  async function initializeMediaAndSocket() {
    setStatus('connecting')

    let detectedMode = 'text'
    let stream = null

    // Try video+audio first. Permission-denied is fatal — show the cam_error
    // screen and let the user decide to continue as text only.
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      detectedMode = 'video'
    } catch (err) {
      if (err && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' || err.name === 'SecurityError')) {
        setStatus('cam_error')
        return
      }
      // NotAllowed denied only the video track. Try audio-only.
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true })
        detectedMode = 'audio'
      } catch (err2) {
        if (err2 && (err2.name === 'NotAllowedError' || err2.name === 'PermissionDeniedError' || err2.name === 'SecurityError')) {
          setStatus('cam_error')
          return
        }
        // Hardware unavailable — silently fall back to text chat
        detectedMode = 'text'
        stream = null
      }
    }

    myStreamRef.current = stream
    if (myVideoRef.current && stream) myVideoRef.current.srcObject = stream
    setMyMediaMode(detectedMode)
    mediaModeRef.current = detectedMode

    const socket = io(SERVER, {
      auth: { fingerprint: fingerprintRef.current },
      timeout: 20000,
    })

    socketRef.current = socket

    // Handle cold-start on Render — server may take up to 30s to wake
    const wakeTimeout = setTimeout(() => {
      if (socket.connected) return
      setStatus('waking')
    }, 4000)

    // If the socket reconnects after a drop, re-emit find_match so the
    // server knows we're still looking (especially for waking or slow_down states).
    socket.io.on('reconnect', () => {
      console.log('Socket reconnected')
      const s = statusRef.current
      if (s === 'waiting' || s === 'waking' || s === 'slow_down') {
        socket.emit('find_match', { mood, intent, mediaMode: mediaModeRef.current })
      }
    })

    socket.on('connect', () => {
      clearTimeout(wakeTimeout)
      setStatus('waiting')
      socket.emit('find_match', { mood, intent, mediaMode: mediaModeRef.current })
    })

    socket.on('connect_error', () => {
      clearTimeout(wakeTimeout)
      setStatus('waking')
    })

    socket.on('waiting', () => setStatus('waiting'))
    socket.on('server_busy', () => setStatus('busy'))

    // slow_down: show a live countdown. Never auto-loop.
    socket.on('slow_down', ({ waitSeconds }) => {
      setStatus('slow_down')
      setSlowDownSeconds(waitSeconds)
      systemMessage(`Too many fast skips. Take a breath ✋`)
      clearInterval(slowDownTimerRef.current)
      slowDownTimerRef.current = setInterval(() => {
        setSlowDownSeconds(prev => {
          if (prev <= 1) {
            clearInterval(slowDownTimerRef.current)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    })

    socket.on('match_found', async ({ partnerId, initiator, starter: serverStarter, partnerMediaMode: pMode }) => {
      trackEvent('match_found', { mode: chatMode })
      if (markFirstMatch()) {
        systemMessage('🎉 First chat! Say hi to break the ice.')
        trackEvent('first_match', { mood, mode: chatMode })
      }

      if (isMiloActiveRef.current) {
        const goodbyeText = getGoodbyeForPersona(miloPersona)
        setMiloMessages(prev => [...prev, {
          role: 'assistant',
          content: goodbyeText,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }])
        trackEvent('milo_2_handoff_completed', { persona: miloPersona })
        setTimeout(async () => {
          setJustMatched(true)
          setTimeout(async () => {
            setJustMatched(false)
            partnerIdRef.current = partnerId
            setPartnerMediaMode(pMode ?? 'text')
            setStarter(serverStarter || '')
            setStatus('connected')
            resetAll()
            chatStartTimeRef.current = Date.now()
            trackEvent('chat_started', { mood, mode: chatMode })
            if (mediaModeRef.current !== 'text') {
              await startPC(initiator, socket, partnerId)
            }
          }, 1500)
        }, 1800)
      } else {
        setJustMatched(true)
        setTimeout(async () => {
          setJustMatched(false)
          partnerIdRef.current = partnerId
          setPartnerMediaMode(pMode ?? 'text')
          setStarter(serverStarter || '')
          setStatus('connected')
          resetAll()
          chatStartTimeRef.current = Date.now()
          trackEvent('chat_started', { mood, mode: chatMode })
          if (mediaModeRef.current !== 'text') {
            await startPC(initiator, socket, partnerId)
          }
        }, 1500)
      }
    })

    socket.on('webrtc_offer', async ({ offer, from }) => {
      try {
        partnerIdRef.current = from
        const pcConfig = await fetchTurnCredentials()
        const pc = createPC(socket, from, pcConfig)
        await pc.setRemoteDescription(new RTCSessionDescription(offer))
        
        while (candidateQueueRef.current.length > 0) {
          const cand = candidateQueueRef.current.shift()
          await pc.addIceCandidate(new RTCIceCandidate(cand))
        }

        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        socket.emit('webrtc_answer', { answer, to: from })
      } catch (err) {
        console.error('Offer error', err)
      }
    })

    socket.on('webrtc_answer', async ({ answer }) => {
      try {
        if (pcRef.current) {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer))
          while (candidateQueueRef.current.length > 0) {
            const cand = candidateQueueRef.current.shift()
            await pcRef.current.addIceCandidate(new RTCIceCandidate(cand))
          }
        }
      } catch (err) {
        console.error('Answer error', err)
      }
    })

    socket.on('ice_candidate', async ({ candidate }) => {
      try {
        if (pcRef.current && pcRef.current.remoteDescription) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate))
        } else {
          candidateQueueRef.current.push(candidate)
        }
      } catch (err) {
        console.error('ICE candidate error', err)
      }
    })

    socket.on('receive_message', ({ message }) => {
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      setMessages(prev => [...prev, { from: 'them', text: message, time, id: Date.now() + Math.random() }])
      if (!chatFocused) setUnread(prev => prev + 1)
    })

    socket.on('partner_typing', () => {
      setPartnerTyping(true)
      clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = setTimeout(() => setPartnerTyping(false), 2000)
    })

    socket.on('message_blocked', () => {
      systemMessage('Links and contact-sharing are blocked for safety.')
    })

    socket.on('partner_left', () => {
      const duration = chatStartTimeRef.current ? Math.floor((Date.now() - chatStartTimeRef.current) / 1000) : 0
      trackEvent('chat_ended', { duration_seconds: duration, ended_by: 'partner_left' })
      setStatus('partner_left')
      closePC()
      if (partnerVideoRef.current) partnerVideoRef.current.srcObject = null
      // Auto-resume if the chat lasted more than 15s (avoid rewarding instant-skips)
      if (duration > 15) {
        setTimeout(() => {
          if (statusRef.current === 'partner_left') findNext()
        }, 2500)
      }
    })

    socket.on('report_received', () => {
      setReportSent(true)
      systemMessage('Report received. Thanks for helping keep Miloo safe.')
    })

    socket.on('reconnect_code', ({ code }) => {
      setReconnectCode(code)
    })

    socket.on('code_invalid', () => {
      systemMessage('That code is invalid or has expired.')
    })
  }

  function createPC(socket, partnerId, pcConfig = iceConfig) {
    if (pcRef.current && pcRef.current.signalingState !== 'closed') {
      return pcRef.current
    }

    const pc = new RTCPeerConnection(pcConfig)
    pcRef.current = pc
    candidateQueueRef.current = []

    myStreamRef.current?.getTracks().forEach(track => {
      pc.addTrack(track, myStreamRef.current)
    })

    pc.ontrack = event => {
      if (partnerVideoRef.current) {
        // Use the first stream provided, or create a new one if none exist
        const stream = event.streams && event.streams[0] ? event.streams[0] : new MediaStream([event.track])

        // If we already have a srcObject and it's a MediaStream, just add the new track to it
        // Otherwise, set the whole stream as the srcObject
        if (partnerVideoRef.current.srcObject && partnerVideoRef.current.srcObject instanceof MediaStream) {
          // Check if track is already in the stream to avoid duplicates
          if (!partnerVideoRef.current.srcObject.getTracks().find(t => t.id === event.track.id)) {
            partnerVideoRef.current.srcObject.addTrack(event.track)
          }
        } else {
          partnerVideoRef.current.srcObject = stream
        }

        // Explicitly trigger play to handle browser autoplay policies
        partnerVideoRef.current.play().catch(err => {
          console.warn('Auto-play blocked or failed:', err)
        })
      }
    }

    pc.onicecandidate = event => {
      if (event.candidate) {
        socket.emit('ice_candidate', { candidate: event.candidate, to: partnerId })
      }
    }

    // Monitor ICE health — frozen video, NAT timeouts, network changes
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState
      console.log('ICE state:', state)
      if (state === 'failed') {
        // Try ICE restart first; if it doesn't recover in 5s, treat as drop
        try { pc.restartIce?.() } catch (e) { /* no-op */ }
        setTimeout(() => {
          if (pcRef.current && pcRef.current.iceConnectionState === 'failed') {
            socket.emit('peer_dropped', { to: partnerId })
            setStatus('partner_left')
          }
        }, 5000)
      } else if (state === 'disconnected') {
        setTimeout(() => {
          if (pcRef.current && pcRef.current.iceConnectionState === 'disconnected') {
            socket.emit('peer_dropped', { to: partnerId })
            setStatus('partner_left')
          }
        }, 8000)
      }
    }

    return pc
  }

  function closePC() {
    if (pcRef.current) {
      // Null out listeners so a stale event after teardown can't trigger
      // a webrtc_offer/ice_candidate to the wrong partner.
      pcRef.current.onicecandidate = null
      pcRef.current.ontrack = null
      pcRef.current.oniceconnectionstatechange = null
      pcRef.current.onconnectionstatechange = null
      try { pcRef.current.close() } catch (e) { /* no-op */ }
      pcRef.current = null
    }
    candidateQueueRef.current = []
  }

  async function startPC(initiator, socket, partnerId) {
    const pcConfig = await fetchTurnCredentials()
    const pc = createPC(socket, partnerId, pcConfig)

    if (initiator) {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      socket.emit('webrtc_offer', { offer, to: partnerId })
    }
  }

  function toggleMute() {
    const track = myStreamRef.current?.getAudioTracks()[0]
    if (track) {
      track.enabled = !track.enabled
      setMuted(!track.enabled)
    }
  }

  function toggleCam() {
    const track = myStreamRef.current?.getVideoTracks()[0]
    if (track) {
      track.enabled = !track.enabled
      setCamOff(!track.enabled)
    }
  }

  function sendMessage(customText) {
    const text = typeof customText === 'string' ? customText : input
    if (!text.trim() || !partnerIdRef.current) return

    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    socketRef.current.emit('send_message', {
      message: text,
      to: partnerIdRef.current,
    })

    setMessages(prev => [...prev, { from: 'me', text, time, id: Date.now() + Math.random() }])
    setInput('')
    inputRef.current?.focus()
  }

  function findNext() {
    trackEvent('skip_pressed')
    closePC()
    if (partnerVideoRef.current) partnerVideoRef.current.srcObject = null

    setStatus('waiting')
    setStarter('')
    setPartnerMediaMode(null)
    resetAll()
    if (chatMode === 'text') {
      socketRef.current?.emit('find_match', { mood, intent, textOnly: true })
    } else {
      socketRef.current?.emit('find_match', { mood, intent, mediaMode: mediaModeRef.current })
    }
  }

  function continueAsText() {
    // Called from the cam_error screen. Connects as text-only without camera/mic.
    setStatus('connecting')
    mediaModeRef.current = 'text'
    setMyMediaMode('text')
    myStreamRef.current = null
    initializeTextOnlySocket()
  }

  function sendPrompt(prompt) {
    setQuickPrompt(prompt)
    sendMessage(prompt)
  }

  function sendGoodConvo() {
    socketRef.current?.emit('good_convo')
    setGoodSent(true)
    trackEvent('good_convo_sent')
    setShowSharePrompt(true)
    systemMessage('Nice. We will use that feedback to improve future matches.')
  }

  function reportUser() {
    if (reportSent) return
    trackEvent('report_sent')
    socketRef.current?.emit('report_user')
  }

  function shareApp() {
    trackEvent('share_clicked')
    if (navigator.share) {
      navigator.share({ title: 'Miloo', text: 'Real conversations with real strangers — no signup!', url: 'https://www.miloo.chat' })
    } else {
      navigator.clipboard?.writeText('https://www.miloo.chat').then(() => alert('Link copied! Share it with a friend 🙌'))
    }
  }

  const partnerFilter = partnerBlurred ? 'blur(14px) brightness(0.45)' : 'none'
  const myFilter = camOff
    ? 'brightness(0.15)'
    : myBlur
      ? 'blur(12px) brightness(0.35)'
      : 'none'

  const visibleMessages = messages.filter(message => message.from !== 'system').slice(-4)

  if (status === 'pre_permission') {
    return (
      <Center>
        <div
          style={{
            width: '100%',
            maxWidth: '440px',
            padding: '28px',
            borderRadius: '24px',
            background: 'var(--bg-1)',
            border: '1px solid var(--border-1)',
            textAlign: 'center',
          }}
        >
          <div style={{
            width: '72px', height: '72px', borderRadius: '50%',
            background: 'var(--accent-dim)', border: '1px solid var(--accent-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '34px', margin: '0 auto 16px',
          }}>
            {moodMeta.emoji}
          </div>

          <h2 style={{ color: 'var(--text-1)', fontSize: '24px', fontWeight: '800', lineHeight: 1.1 }}>
            Ready to meet someone?
          </h2>
          <p style={{ color: 'var(--text-3)', fontSize: '14px', lineHeight: 1.7, marginTop: '10px' }}>
            Miloo needs your camera and mic to connect you. Your video is only shared with your matched partner — never recorded or stored.
          </p>

          <div style={{ marginTop: '16px', display: 'grid', gap: '8px', textAlign: 'left' }}>
            {[
              { icon: '🔒', text: 'Video goes directly to your partner — not our servers' },
              { icon: '🛡️', text: safeMode ? 'Safe Mode is ON — your video starts blurred' : 'Your video starts live. Enable Safe Mode to start blurred' },
              { icon: '⚡', text: 'You can mute or turn off camera any time during the chat' },
            ].map(item => (
              <div key={item.text} style={{
                padding: '11px 14px', borderRadius: '14px',
                background: 'var(--surface-1)', border: '1px solid var(--border-1)',
                color: 'var(--text-2)', fontSize: '13px',
                display: 'flex', gap: '10px', alignItems: 'flex-start',
              }}>
                <span style={{ flexShrink: 0 }}>{item.icon}</span>
                <span>{item.text}</span>
              </div>
            ))}
          </div>

          <button onClick={initializeMediaAndSocket} style={{
            marginTop: '20px', width: '100%', padding: '16px 18px',
            borderRadius: '999px', border: 'none', cursor: 'pointer',
            background: 'var(--accent)', color: 'var(--accent-text)',
            fontSize: '16px', fontWeight: '700', boxShadow: 'var(--accent-glow)',
          }}>
            Allow Camera & Find Match →
          </button>

          <button
            onClick={continueAsText}
            style={{
              marginTop: '12px',
              width: '100%',
              background: 'none',
              border: 'none',
              color: 'var(--accent)',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              textDecoration: 'underline',
              display: 'block',
            }}
          >
            💬 Skip camera — chat by text first
          </button>

          <button onClick={onExit} style={{
            marginTop: '12px', background: 'none', border: 'none',
            color: 'var(--text-4)', fontSize: '13px', cursor: 'pointer',
          }}>
            ← Go back
          </button>
        </div>
      </Center>
    )
  }

  // ── TEXT-ONLY CHAT UI ──────────────────────────────────────────────
  if (status === 'text_chat') {
    const allMessages = messages.filter(m => m.from !== 'system')
    const systemMsg = messages.filter(m => m.from === 'system').slice(-1)[0]

    return (
      <div className="chat-room" style={{ background: 'var(--bg-0)' }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 20px', borderBottom: '1px solid var(--border-1)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '20px', fontWeight: '900', color: 'var(--text-1)', letterSpacing: '-0.04em' }}>miloo</span>
            <Pill>{moodMeta.emoji} {moodMeta.label}</Pill>
            <Pill color="rgba(99,102,241,0.08)" border="rgba(99,102,241,0.25)" text="var(--accent)">
              <span className="blink" style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />
              Connected
            </Pill>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            <GlassBtn onClick={reportUser} active={reportSent} activeColor="rgba(248,113,113,0.3)">{reportSent ? '✅' : '🚩'}</GlassBtn>
            <GlassBtn onClick={sendGoodConvo} active={goodSent} activeColor="rgba(99,102,241,0.25)">{goodSent ? '✅' : '👍'}</GlassBtn>
            <GlassBtn onClick={shareApp}>🔗</GlassBtn>
            <button onClick={onExit} style={{
              background: 'var(--surface-2)', color: 'var(--text-2)',
              padding: '9px 16px', borderRadius: '999px', fontSize: '13px', fontWeight: '600',
              border: '1px solid var(--border-1)', cursor: 'pointer',
            }}>Exit</button>
          </div>
        </div>

        {/* Starter prompt */}
        {starter && (
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-1)', flexShrink: 0 }}>
            <div style={{
              background: 'var(--accent-dim)', border: '1px solid var(--accent-border)',
              borderRadius: '14px', padding: '12px 16px',
              color: 'var(--accent)', fontSize: '14px', fontWeight: '600',
            }}>
              💬 {starter}
            </div>
          </div>
        )}

        {/* Quick prompts */}
        <div style={{ padding: '12px 20px', display: 'flex', gap: '10px', flexWrap: 'wrap', flexShrink: 0, borderBottom: '1px solid var(--border-1)' }}>
          {moodMeta.prompts.slice(0, 3).map(prompt => (
            <button key={prompt} onClick={() => sendPrompt(prompt)} style={{
              background: 'var(--surface-1)', color: 'var(--text-2)',
              border: '1px solid var(--border-1)', borderRadius: '999px',
              padding: '8px 14px', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
            }}>
              {prompt}
            </button>
          ))}
        </div>

        {/* Messages */}
        <div
          style={{ flex: 1, overflowY: 'auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}
          onClick={() => { setChatFocused(true); setUnread(0) }}
        >
          {allMessages.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-4)', fontSize: '15px', marginTop: '60px' }}>
              <div style={{ fontSize: '42px', marginBottom: '12px' }}>👋</div>
              Say hi to start the conversation
            </div>
          )}
          {allMessages.map((msg, i) => (
            <div key={msg.id || i} style={{
              display: 'flex', flexDirection: 'column',
              alignItems: msg.from === 'me' ? 'flex-end' : 'flex-start',
              animation: 'msgPop 0.18s ease',
            }}>
              <div style={{
                maxWidth: '75%', padding: '12px 16px',
                borderRadius: msg.from === 'me' ? '20px 20px 4px 20px' : '20px 20px 20px 4px',
                background: msg.from === 'me' ? 'var(--accent)' : 'var(--surface-2)',
                color: msg.from === 'me' ? 'var(--accent-text)' : 'var(--text-1)',
                fontSize: '15px', lineHeight: 1.5, wordBreak: 'break-word',
                border: msg.from === 'me' ? 'none' : '1px solid var(--border-1)',
              }}>
                {msg.text}
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-4)', marginTop: '4px', paddingLeft: '6px', paddingRight: '6px' }}>{msg.time}</span>
            </div>
          ))}

          {/* Typing indicator */}
          {partnerTyping && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0' }}>
              <div style={{
                display: 'flex', gap: '5px', padding: '12px 16px',
                background: 'var(--surface-2)', borderRadius: '20px 20px 20px 4px',
                border: '1px solid var(--border-1)',
              }}>
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </div>
            </div>
          )}

          {systemMsg && (
            <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: '13px', padding: '8px 0' }}>{systemMsg.text}</div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <div style={{
          padding: '16px 20px 20px',
          borderTop: '1px solid var(--border-1)',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}>
          <div style={{
            display: 'flex', gap: '10px', alignItems: 'center',
            background: 'var(--surface-1)', borderRadius: '999px',
            padding: '8px 8px 8px 18px', border: '1px solid var(--border-1)',
          }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => { setInput(e.target.value); emitTyping() }}
              onKeyDown={e => e.key === 'Enter' && sendMessage()}
              onFocus={() => { setChatFocused(true); setUnread(0) }}
              onBlur={() => setChatFocused(false)}
              placeholder="Type a message..."
              style={{
                flex: 1, background: 'none', border: 'none',
                color: 'var(--text-1)', fontSize: '15px', outline: 'none',
              }}
            />
            {unread > 0 && (
              <span style={{
                background: 'var(--danger)', color: '#fff',
                borderRadius: '999px', padding: '3px 10px',
                fontSize: '11px', fontWeight: '800',
              }}>{unread} new</span>
            )}
            <button
              onClick={() => sendMessage()}
              style={{
                background: input.trim() ? 'var(--accent)' : 'var(--surface-2)',
                color: input.trim() ? 'var(--accent-text)' : 'var(--text-3)',
                border: 'none', borderRadius: '50%',
                width: '40px', height: '40px', fontSize: '16px',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}
            >↑</button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={findNext}
              style={{
                background: 'var(--accent)', color: 'var(--accent-text)',
                border: 'none', borderRadius: '999px',
                padding: '11px 22px', fontSize: '14px', fontWeight: '700',
                cursor: 'pointer', boxShadow: 'var(--accent-glow)',
              }}
            >
              Next ⏭
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (status === 'waking') {
    return (
      <Center>
        <div style={{ textAlign: 'center', maxWidth: '320px', padding: '24px' }}>
          <div style={{ fontSize: '48px', marginBottom: '4px' }}>☕</div>
          <h3 style={{ color: 'var(--text-1)', marginTop: '12px', fontSize: '24px', fontWeight: '800' }}>Server is waking up</h3>
          <p style={{ color: 'var(--text-3)', marginTop: '10px', fontSize: '14px', lineHeight: 1.6 }}>
            The server was sleeping to save resources. It usually takes 15–30 seconds to wake up. Hang tight...
          </p>
          <div
            style={{
              marginTop: '20px',
              height: '3px',
              borderRadius: '999px',
              background: 'rgba(255,255,255,0.08)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: '40%',
                background: 'var(--accent)',
                borderRadius: '999px',
                animation: 'wakeSlide 1.8s ease-in-out infinite alternate',
              }}
            />
          </div>
          <button onClick={onExit} style={{
            marginTop: '20px', background: 'none', border: 'none',
            color: 'var(--text-4)', fontSize: '13px', cursor: 'pointer',
          }}>
            ← Go back
          </button>
          <style>{`
            @keyframes wakeSlide {
              from { transform: translateX(-100%); }
              to { transform: translateX(300%); }
            }
          `}</style>
        </div>
      </Center>
    )
  }

  if (status === 'cam_error') {
    return (
      <Center>
        <div style={{ textAlign: 'center', maxWidth: '340px', padding: '24px' }}>
          <div style={{ fontSize: '50px' }}>📷</div>
          <h3 style={{ color: 'var(--text-1)', marginTop: '16px', fontSize: '24px' }}>No camera? No problem.</h3>
          <p style={{ color: 'var(--text-3)', marginTop: '10px', fontSize: '14px', lineHeight: 1.6 }}>
            You can still chat with people over text. Or allow camera & mic access in your browser settings to try again.
          </p>
          <button onClick={continueAsText} style={{
            marginTop: '20px', width: '100%', padding: '14px 18px',
            borderRadius: '999px', border: 'none', cursor: 'pointer',
            background: 'var(--accent)', color: 'var(--accent-text)',
            fontSize: '15px', fontWeight: '700',
          }}>
            Continue as Text Only →
          </button>
          <button onClick={initializeMediaAndSocket} style={{
            marginTop: '10px', width: '100%', padding: '13px 18px',
            borderRadius: '999px', border: '1px solid var(--border-1)', cursor: 'pointer',
            background: 'var(--surface-1)', color: 'var(--text-2)',
            fontSize: '14px', fontWeight: '600',
          }}>
            Try Camera Again
          </button>
          <button onClick={onExit} style={{
            marginTop: '10px', background: 'none', border: 'none',
            color: 'var(--text-4)', fontSize: '13px', cursor: 'pointer', padding: '6px 0',
          }}>
            ← Go back
          </button>
        </div>
      </Center>
    )
  }

  if (status === 'busy') {
    return (
      <Center>
        <div style={{ textAlign: 'center', maxWidth: '320px', padding: '24px' }}>
          <div style={{ fontSize: '50px' }}>🔌</div>
          <h3 style={{ color: 'var(--text-1)', marginTop: '16px', fontSize: '26px' }}>Server is busy</h3>
          <p style={{ color: 'var(--text-3)', marginTop: '10px', fontSize: '14px', lineHeight: 1.6 }}>
            Too many people are joining right now. Try again in a moment.
          </p>
          <Btn onClick={onExit} style={{ marginTop: '24px' }}>Go Back</Btn>
        </div>
      </Center>
    )
  }

  return (
    <>
    {/* REQ-FB-03: 1.5s celebration overlay (sits above the video mode) */}
    {justMatched && (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(99,102,241,0.18)', backdropFilter: 'blur(6px)',
        animation: 'msgPop 0.2s ease', pointerEvents: 'none',
      }}>
        <div style={{
          padding: '24px 40px', borderRadius: '20px',
          background: 'var(--accent)', color: 'var(--accent-text)',
          fontSize: '24px', fontWeight: '900', letterSpacing: '-0.02em',
          boxShadow: '0 20px 60px rgba(99,102,241,0.5)',
        }}>
          🎉 Connected!
        </div>
      </div>
    )}
    <div style={{ height: '100dvh', background: '#000', position: 'relative', overflow: 'hidden' }}>

      {partnerMediaMode && partnerMediaMode !== 'video' ? (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: '#0d0d14',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 0,
        }}>
          <div style={{ fontSize: '52px', marginBottom: '12px' }}>
            {partnerMediaMode === 'text' ? '💬' : '🎤'}
          </div>
          <p style={{ color: '#888', fontSize: '14px', fontWeight: '600', letterSpacing: '0.3px' }}>
            {partnerMediaMode === 'text' ? "Text only — they don't have a camera" : 'Voice only — no camera'}
          </p>
        </div>
      ) : (
        <video
          ref={partnerVideoRef}
          autoPlay
          playsInline
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: partnerFilter,
            transition: 'filter 0.2s ease',
            background: 'radial-gradient(circle at center, #10101a, #020203)',
          }}
        />
      )}

      {/* Typing indicator overlay for video mode */}
      {partnerTyping && status === 'connected' && (
        <div style={{
          position: 'absolute',
          bottom: '80px',
          left: '16px',
          background: 'rgba(0,0,0,0.6)',
          padding: '6px 12px',
          borderRadius: '12px',
          color: 'white',
          fontSize: '13px',
          zIndex: 11,
          backdropFilter: 'blur(8px)',
        }}>
          typing...
        </div>
      )}

      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(circle at 20% 20%, rgba(99,102,241,0.08), transparent 35%), radial-gradient(circle at 80% 80%, rgba(99,102,241,0.05), transparent 35%)',
          zIndex: 1,
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '140px',
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.78), transparent)',
          zIndex: 2,
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '240px',
          background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)',
          zIndex: 2,
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          padding: '16px',
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: '22px',
                fontWeight: '900',
                background: 'var(--accent)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              miloo
            </span>

            <Pill>{moodMeta.emoji} {moodMeta.label}</Pill>
            <Pill color="rgba(255,255,255,0.06)" border="rgba(255,255,255,0.1)" text="#ccffee">
              {INTENT_META[intent] || 'Open to anything'}
            </Pill>
            {safeMode && <Pill color="rgba(99,102,241,0.1)" border="rgba(99,102,241,0.25)" text="var(--accent)">🛡 Safe Mode</Pill>}
          </div>
        </div>

        <button
          onClick={onExit}
          style={{
            background: 'rgba(0,0,0,0.4)',
            color: '#ddd',
            padding: '9px 16px',
            borderRadius: '999px',
            backdropFilter: 'blur(12px)',
            fontSize: '13px',
            fontWeight: '600',
            border: '1px solid rgba(255,255,255,0.14)',
            cursor: 'pointer',
          }}
        >
          Exit
        </button>
      </div>

      {(status === 'waiting' || status === 'slow_down' || status === 'partner_left' || status === 'connecting') && (
        <div
          style={{
            position: 'absolute', inset: 0, zIndex: 15,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            background: 'var(--bg-0)',
            padding: '24px',
          }}
        >
          {isMiloActive && status !== 'partner_left' ? (
            <div className="chat-room" style={{ width: '100%', maxWidth: '600px', background: 'var(--bg-0)' }}>
              {/* Header — matches normal text chat exactly */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '18px 20px', borderBottom: '1px solid var(--border-1)', flexShrink: 0,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '20px', fontWeight: '900', color: 'var(--text-1)', letterSpacing: '-0.04em' }}>miloo</span>
                  <Pill color="rgba(99,102,241,0.08)" border="rgba(99,102,241,0.25)" text="var(--accent)">
                    <span className="blink" style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />
                    {miloPersona || 'Milo'}
                  </Pill>
                </div>
                <button onClick={onExit} style={{
                  background: 'var(--surface-2)', color: 'var(--text-2)',
                  padding: '9px 16px', borderRadius: '999px', fontSize: '13px', fontWeight: '600',
                  border: '1px solid var(--border-1)', cursor: 'pointer',
                }}>Exit</button>
              </div>

              {!miloPersona ? (
                /* 3-card inline picker panel */
                <div style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '24px 20px',
                  gap: '20px',
                  overflowY: 'auto',
                }}>
                  <h3 style={{ color: 'var(--text-1)', fontSize: '20px', fontWeight: '800', textAlign: 'center', margin: 0 }}>
                    Select your Milo Companion V2.0 ✨
                  </h3>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                    gap: '12px',
                    width: '100%',
                    maxWidth: '500px',
                  }}>
                    {(miloPersonaOptions && miloPersonaOptions.length > 0 ? miloPersonaOptions : FALLBACK_PERSONAS).map(p => (
                      <div
                        key={p.key}
                        onClick={() => selectPersona(p.key)}
                        style={{
                          padding: '20px 16px',
                          borderRadius: '20px',
                          background: 'var(--surface-1)',
                          border: '1px solid var(--border-1)',
                          textAlign: 'center',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                        }}
                        className="card-hover"
                      >
                        <div style={{ fontSize: '32px', marginBottom: '8px' }}>{p.emoji}</div>
                        <div style={{ color: 'var(--text-1)', fontWeight: '800', fontSize: '16px' }}>{p.label}</div>
                        <div style={{ color: 'var(--accent)', fontSize: '12px', fontWeight: '600', marginTop: '2px' }}>{p.tagline}</div>
                        <div style={{ color: 'var(--text-3)', fontSize: '11px', lineHeight: 1.4, marginTop: '8px' }}>{p.description}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {/* Messages */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {miloMessages.map((msg, i) => (
                      <div key={i} style={{
                        display: 'flex', flexDirection: 'column',
                        alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                        animation: 'msgPop 0.18s ease',
                      }}>
                        <div style={{
                          maxWidth: '75%', padding: '12px 16px',
                          borderRadius: msg.role === 'user' ? '20px 20px 4px 20px' : '20px 20px 20px 4px',
                          background: msg.role === 'user' ? 'var(--accent)' : 'var(--surface-2)',
                          color: msg.role === 'user' ? 'var(--accent-text)' : 'var(--text-1)',
                          fontSize: '15px', lineHeight: 1.5, wordBreak: 'break-word',
                          border: msg.role === 'user' ? 'none' : '1px solid var(--border-1)',
                        }}>{msg.content}</div>
                        <span style={{ fontSize: '11px', color: 'var(--text-4)', marginTop: '4px', paddingLeft: '6px', paddingRight: '6px' }}>{msg.time}</span>
                      </div>
                    ))}
                    {miloTyping && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0' }}>
                        <div style={{ display: 'flex', gap: '5px', padding: '12px 16px', background: 'var(--surface-2)', borderRadius: '20px 20px 20px 4px', border: '1px solid var(--border-1)' }}>
                          <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
                        </div>
                      </div>
                    )}
                    <div ref={miloMessagesEndRef} />
                  </div>

                  {/* Input bar — identical to normal chat */}
                  <div style={{ padding: '16px 20px 20px', borderTop: '1px solid var(--border-1)', flexShrink: 0 }}>
                    <div style={{
                      display: 'flex', gap: '10px', alignItems: 'center',
                      background: 'var(--surface-1)', borderRadius: '999px',
                      padding: '8px 8px 8px 18px', border: '1px solid var(--border-1)',
                    }}>
                      <input
                        value={miloInput}
                        onChange={e => setMiloInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && sendMiloMessage()}
                        placeholder="Type a message..."
                        style={{ flex: 1, background: 'none', border: 'none', color: 'var(--text-1)', fontSize: '15px', outline: 'none' }}
                      />
                      <button onClick={() => sendMiloMessage()} style={{
                        background: miloInput.trim() ? 'var(--accent)' : 'var(--surface-2)',
                        color: miloInput.trim() ? 'var(--accent-text)' : 'var(--text-3)',
                        border: 'none', borderRadius: '50%', width: '40px', height: '40px',
                        fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>↑</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
          <div style={{
            width: '80px', height: '80px', borderRadius: '50%',
            background: 'var(--accent-dim)', border: '1px solid var(--accent-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '36px',
          }}>
            {status === 'partner_left' ? '👋' : '🔎'}
          </div>

          <div style={{ textAlign: 'center', maxWidth: '360px', marginTop: '22px' }}>
            <p style={{ color: 'var(--text-1)', fontSize: '26px', fontWeight: '800', lineHeight: 1.15 }}>
              {status === 'partner_left'
                ? 'That chat ended'
                : status === 'slow_down'
                  ? `Take a breath ✋`
                  : 'Finding your match...'}
            </p>
            <p style={{ color: 'var(--text-3)', fontSize: '15px', marginTop: '10px', lineHeight: 1.6 }}>
              {status === 'partner_left'
                ? 'Hit next to meet someone new on the same vibe.'
                : status === 'slow_down'
                  ? `Try again in ${slowDownSeconds} s`
                  : matchSeconds > 30
                    ? 'Not many people online right now. Try a different mood or check back later.'
                    : ROTATING_MSGS[rotatingMsg]}
            </p>
          </div>

          {status !== 'partner_left' && (
            <div style={{ marginTop: '18px', display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <Pill>{moodMeta.emoji} {moodMeta.label}</Pill>
              <Pill>Waiting {matchSeconds}s</Pill>
              {onlineCount > 0 && <Pill color="rgba(74,222,128,0.08)" border="rgba(74,222,128,0.2)" text="#4ade80">🟢 {onlineCount} online</Pill>}
            </div>
          )}

          {status !== 'partner_left' && matchSeconds > 20 && (
            <button onClick={onExit} style={{ marginTop: '20px', background: 'var(--surface-1)', border: '1px solid var(--border-1)', color: 'var(--text-2)', borderRadius: '999px', padding: '10px 20px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
              ← Go back
            </button>
          )}

          {status === 'slow_down' && slowDownSeconds === 0 && (
            <div style={{ marginTop: '20px' }}>
              <button onClick={findNext} style={{
                background: 'var(--accent)',
                color: 'var(--accent-text)',
                padding: '12px 24px',
                borderRadius: '999px',
                border: 'none',
                fontSize: '15px',
                fontWeight: '700',
                cursor: 'pointer',
                boxShadow: 'var(--accent-glow)',
              }}>
                Try Again
              </button>
            </div>
          )}

          {status === 'partner_left' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', marginTop: '24px' }}>
              {chatRating === 0 && (
                <div style={{ textAlign: 'center' }}>
                  <p style={{ color: 'var(--text-3)', fontSize: '13px', marginBottom: '8px' }}>Kaisi rahi baat?</p>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                    {[1,2,3,4,5].map(star => (
                      <button key={star} onClick={() => {
                        setChatRating(star)
                        socketRef.current?.emit('submit_rating', { rating: star })
                      }} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', minWidth: '44px', minHeight: '44px' }}>⭐</button>
                    ))}
                  </div>
                </div>
              )}
              {chatRating > 0 && <p style={{ color: 'var(--accent)', fontSize: '13px', fontWeight: '600' }}>Shukriya! {'⭐'.repeat(chatRating)}</p>}

              {/* Reconnect code section */}
              <div style={{ textAlign: 'center', padding: '12px 16px', background: 'var(--surface-1)', borderRadius: '16px', border: '1px solid var(--border-1)', width: '100%', maxWidth: '280px' }}>
                <p style={{ color: 'var(--text-3)', fontSize: '12px', marginBottom: '8px' }}>Want to chat with this person again?</p>
                {reconnectCode ? (
                  <div>
                    <p style={{ color: 'var(--text-1)', fontSize: '22px', fontWeight: '900', letterSpacing: '0.12em', marginBottom: '8px' }}>{reconnectCode}</p>
                    <button
                      onClick={() => {
                        navigator.clipboard?.writeText(reconnectCode)
                        setReconnectCodeCopied(true)
                        setTimeout(() => setReconnectCodeCopied(false), 2000)
                      }}
                      style={{ background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: '999px', padding: '8px 18px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}
                    >
                      {reconnectCodeCopied ? 'Copied! ✅' : 'Copy Code'}
                    </button>
                    <p style={{ color: 'var(--text-4)', fontSize: '11px', marginTop: '6px' }}>Valid for 10 minutes</p>
                  </div>
                ) : (
                  <button
                    onClick={() => socketRef.current?.emit('request_reconnect_code')}
                    style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border-1)', borderRadius: '999px', padding: '8px 18px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
                  >
                    Get Reconnect Code
                  </button>
                )}
              </div>

              <Btn onClick={findNext}>Find Someone New</Btn>
              <button onClick={shareApp} style={{ background: 'var(--surface-1)', border: '1px solid var(--border-1)', color: 'var(--text-2)', borderRadius: '999px', padding: '10px 20px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', minHeight: '44px' }}>
                Share Miloo 🔗
              </button>
            </div>
          )}
            </>
          )}
        </div>
      )}

      {status === 'connected' && (
        <div
          style={{
            position: 'absolute',
            top: '84px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            alignItems: 'center',
            width: 'min(92vw, 480px)',
          }}
        >
          {starter && (
            <div
              style={{
                background: 'rgba(0,0,0,0.52)',
                backdropFilter: 'blur(12px)',
                padding: '9px 16px',
                borderRadius: '999px',
                fontSize: '13px',
                fontWeight: '600',
                color: '#fff',
                maxWidth: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                border: '1px solid rgba(255,255,255,0.09)',
              }}
            >
              {starter}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
            {moodMeta.prompts.slice(0, 3).map(prompt => (
              <button
                key={prompt}
                onClick={() => sendPrompt(prompt)}
                style={{
                  background: 'rgba(0,0,0,0.42)',
                  color: '#ececf3',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '999px',
                  padding: '8px 12px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  backdropFilter: 'blur(10px)',
                }}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ position: 'absolute', bottom: '118px', right: '12px', zIndex: 10 }}>
        <video
          ref={myVideoRef}
          autoPlay
          muted
          playsInline
          style={{
            width: '96px',
            height: '126px',
            objectFit: 'cover',
            borderRadius: '16px',
            border: `2px solid ${myBlur ? 'rgba(99,102,241,0.55)' : camOff ? 'rgba(239,68,68,0.7)' : 'rgba(99,102,241,0.7)'}`,
            filter: myFilter,
            transition: 'all 0.3s ease',
            boxShadow: '0 10px 32px rgba(0,0,0,0.6)',
            background: '#111118',
          }}
        />

        {safeMode && (
          <button
            onClick={() => setMyBlur(!myBlur)}
            style={{
              position: 'absolute',
              bottom: '-10px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: myBlur ? 'rgba(99,102,241,0.9)' : 'rgba(99,102,241,0.95)',
              color: '#fff',
              border: 'none',
              borderRadius: '999px',
              fontSize: '10px',
              fontWeight: '800',
              padding: '4px 11px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {myBlur ? 'Reveal me' : 'Hide me'}
          </button>
        )}
      </div>

      {status === 'connected' && visibleMessages.length > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: '118px',
            left: '12px',
            zIndex: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            maxWidth: 'calc(100% - 132px)',
          }}
        >
          {visibleMessages.map((message, index) => (
            <div
              key={message.id || index}
              style={{
                display: 'inline-flex',
                alignItems: 'flex-start',
                gap: '6px',
                animation: 'msgPop 0.2s ease',
                opacity: index === visibleMessages.length - 1 ? 1 : 0.58 + index * 0.12,
              }}
            >
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: '800',
                  color: message.from === 'me' ? 'var(--text-3)' : 'var(--accent)',
                  marginTop: '2px',
                  flexShrink: 0,
                }}
              >
                {message.from === 'me' ? 'You' : 'Them'}
              </span>

              <div
                style={{
                  background: 'rgba(0,0,0,0.58)',
                  backdropFilter: 'blur(12px)',
                  color: '#fff',
                  padding: '7px 12px',
                  borderRadius: message.from === 'me' ? '14px 14px 14px 4px' : '14px 14px 4px 14px',
                  fontSize: '13px',
                  lineHeight: 1.42,
                  border: '1px solid rgba(255,255,255,0.08)',
                  maxWidth: '220px',
                  wordBreak: 'break-word',
                }}
              >
                {message.text}
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          padding: '12px 16px 20px',
        }}
      >
        {messages.some(message => message.from === 'system') && (
          <div style={{ marginBottom: '10px', display: 'flex', justifyContent: 'center' }}>
            <div
              style={{
                background: 'rgba(0,0,0,0.4)',
                color: '#c8c8d1',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '999px',
                padding: '8px 12px',
                fontSize: '12px',
                maxWidth: '100%',
                backdropFilter: 'blur(10px)',
              }}
            >
              {messages.filter(message => message.from === 'system').slice(-1)[0]?.text}
            </div>
          </div>
        )}

        <div
          style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '12px',
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(16px)',
            borderRadius: '999px',
            padding: '6px 6px 6px 16px',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <input
            ref={inputRef}
            value={input}
            onChange={event => setInput(event.target.value)}
            onKeyDown={event => event.key === 'Enter' && sendMessage()}
            onFocus={() => {
              setChatFocused(true)
              setUnread(0)
            }}
            onBlur={() => setChatFocused(false)}
            placeholder="Send a message..."
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              color: '#fff',
              fontSize: '14px',
              outline: 'none',
            }}
          />

          {unread > 0 && (
            <span
              style={{
                background: '#ef4444',
                color: '#fff',
                borderRadius: '999px',
                padding: '2px 8px',
                fontSize: '11px',
                fontWeight: '800',
                alignSelf: 'center',
                flexShrink: 0,
              }}
            >
              {unread} new
            </span>
          )}

          <button
            onClick={() => sendMessage()}
            style={{
              background: input.trim() ? 'var(--accent)' : 'rgba(255,255,255,0.1)',
              color: '#fff',
              border: 'none',
              borderRadius: '50%',
              width: '38px',
              height: '38px',
              fontSize: '16px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            ↑
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <GlassBtn onClick={toggleMute} active={muted} activeColor="rgba(239,68,68,0.4)">
              {muted ? '🔇' : '🎤'}
            </GlassBtn>

            <GlassBtn onClick={toggleCam} active={camOff} activeColor="rgba(239,68,68,0.4)">
              {camOff ? '📵' : '📹'}
            </GlassBtn>

            {safeMode && (
              <GlassBtn onClick={() => setPartnerBlurred(!partnerBlurred)} active={partnerBlurred} activeColor="rgba(99,102,241,0.2)">
                {partnerBlurred ? '🙈' : '👁️'}
              </GlassBtn>
            )}

            <GlassBtn onClick={reportUser} active={reportSent} activeColor="rgba(239,68,68,0.35)">
              {reportSent ? '✅' : '🚩'}
            </GlassBtn>

            <GlassBtn onClick={sendGoodConvo} active={goodSent} activeColor="rgba(74,222,128,0.3)">
              {goodSent ? '✅' : '👍'}
            </GlassBtn>
          </div>

          <button
            onClick={findNext}
            style={{
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              borderRadius: '999px',
              padding: '11px 22px',
              fontSize: '14px',
              fontWeight: '700',
              cursor: 'pointer',
              boxShadow: '0 4px 20px rgba(99,102,241,0.28)',
              whiteSpace: 'nowrap',
            }}
          >
            Next ⏭
          </button>
        </div>

        <div ref={messagesEndRef} />
      </div>

      {/* Share prompt popup — shown after good_convo */}
      {showSharePrompt && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 30,
          background: 'rgba(13,11,20,0.95)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: '20px',
          padding: '24px',
          textAlign: 'center',
          width: 'min(90vw, 320px)',
          animation: 'msgPop 0.2s ease',
        }}>
          <p style={{ color: '#fff', fontSize: '16px', fontWeight: '700', marginBottom: '6px' }}>Having a great chat? Share Miloo! 🔗</p>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', marginBottom: '16px' }}>Help your friends find real conversations too</p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button
              onClick={() => { shareApp(); setShowSharePrompt(false) }}
              style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '999px', padding: '10px 20px', fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}
            >
              Share
            </button>
            <button
              onClick={() => setShowSharePrompt(false)}
              style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '999px', padding: '10px 20px', fontSize: '14px', cursor: 'pointer' }}
            >
              Maybe later
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes msgPop {
          from { transform: translateY(8px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        input::placeholder {
          color: #6b6b78;
        }
      `}</style>
    </div>
    </>
  )
}

function Center({ children }) {

  return (
    <div style={{
      height: '100dvh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-0)', padding: '20px',
    }}>
      {children}
    </div>
  )
}

function Btn({ children, onClick, style = {} }) {
  return (
    <button onClick={onClick} style={{
      background: 'var(--accent)',
      color: 'var(--accent-text)', padding: '12px 24px', borderRadius: '999px',
      fontSize: '14px', fontWeight: '700', border: 'none', cursor: 'pointer',
      boxShadow: '0 0 16px rgba(99,102,241,0.25)',
      ...style,
    }}>
      {children}
    </button>
  )
}

function GlassBtn({ children, onClick, active, activeColor }) {
  return (
    <button onClick={onClick} style={{
      background: active ? activeColor : 'rgba(0,0,0,0.5)',
      color: '#fff', width: '42px', height: '42px', borderRadius: '50%',
      fontSize: '17px', border: '1px solid rgba(255,255,255,0.1)',
      cursor: 'pointer', backdropFilter: 'blur(10px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {children}
    </button>
  )
}

function Pill({ children, color = 'rgba(255,255,255,0.05)', border = 'rgba(255,255,255,0.08)', text = '#ccc' }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      background: color, color: text, border: `1px solid ${border}`,
      borderRadius: '999px', padding: '5px 10px',
      fontSize: '11px', fontWeight: '700', backdropFilter: 'blur(10px)',
    }}>
      {children}
    </span>
  )
}
