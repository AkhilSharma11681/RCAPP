// client/src/pages/ChatRoom.jsx
//
// Rewrite scope (per user request):
//   1. Direct-CTA integration with App.jsx routing props
//      (mood, intent, safeMode, chatMode, theme, onToggleTheme, onExit).
//   2. Milo 2.0 adaptive activation timer — 8s for text, 15s for video
//      (per MILOO_MILO_2_0_DESIGN.md §F1).
//   3. WebRTC peer connection with `iceconnectionstatechange`
//      monitoring (per MILOO_MILO_2_0_DATA_FLOW.md §1).
//
// Gaps to backend (intentionally NOT in this file):
//   - The /api/milo endpoint and the LLM call are not exposed by the
//     current server/index.js. The persona picker and activation timer
//     work; the network call to /api/milo would need to be wired up
//     alongside the backend changes in
//     MILOO_MILO_2_0_IMPLEMENTATION_PLAN.md Day 1.
//   - PERSONAS + getStoredPersona/setStoredPersona from analytics.js
//     (impl plan Step 2.1) are mirrored as local constants to keep
//     this file self-contained. Hoist them into analytics.js when the
//     backend lands.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { io as socketIO } from 'socket.io-client'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SERVER =
  (typeof import.meta !== 'undefined' &&
    import.meta.env &&
    import.meta.env.VITE_SERVER_URL) ||
  (typeof window !== 'undefined'
    ? window.location.origin.replace(/:\d+$/, ':5055')
    : 'http://localhost:5055') ||
  'http://localhost:5055'

const MILO_TRIGGER_TEXT = 8 // F1
const MILO_TRIGGER_VIDEO = 15 // F1
const HANDOFF_GRACE_MS = 1800 // F4
const STRIKE_WINDOW_MS = 60000 // §4 Resilience
const STRIKE_LIMIT = 3

// STUN config — public Google STUN. Replace with self-hosted TURN in prod.
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }]

// ---------------------------------------------------------------------------
// Local persona + analytics helpers
// ---------------------------------------------------------------------------

const PERSONA_STORAGE_KEY = 'miloo_persona'

const PERSONAS = [
  { id: 'milo', label: 'Milo', emoji: '🤗', blurb: 'Warm & supportive' },
  { id: 'mira', label: 'Mira', emoji: '😏', blurb: 'Playful & cheeky' },
  { id: 'jax', label: 'Jax', emoji: '🧊', blurb: 'Dry & brief' },
]

const MOOD_OPENERS = {
  vent: "I'm here, take your time. What's on your mind?",
  laugh: "okay be honest — worst joke you know. go.",
  deep: "what have you been thinking about a lot lately?",
  music: "if your week had a soundtrack, what's the first song?",
  gaming: "controller or keyboard? settle this once and for all.",
  culture: "where are you from and what's underrated about it?",
  any: "what's your vibe tonight?",
}

const GOODBYE_BY_PERSONA = {
  milo: 'It was fun talking! Bye 👋',
  mira: 'okay go have fun, weirdo 😏',
  jax: "alright, real human's here. don't embarrass me.",
}

function getStoredPersona() {
  try {
    return localStorage.getItem(PERSONA_STORAGE_KEY) || null
  } catch {
    return null
  }
}
function setStoredPersona(p) {
  try {
    localStorage.setItem(PERSONA_STORAGE_KEY, p)
  } catch {
    /* no-op */
  }
}

function trackEvent(name, params = {}) {
  try {
    if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
      window.gtag('event', name, params)
    }
  } catch {
    /* no-op */
  }
}

function moodOpener(m) {
  return MOOD_OPENERS[m] || "hey! what's up? 😊"
}

function nowTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function getFingerprint() {
  try {
    return (
      localStorage.getItem('miloo_fp') || 'fp_' + Math.random().toString(36).slice(2, 10)
    )
  } catch {
    return 'fp_anon'
  }
}

export default function ChatRoom({
  mood = 'any',
  intent = 'random',
  chatMode = 'text',
  theme = 'dark',
  onToggleTheme,
  onExit,
}) {
  const isVideo = chatMode === 'video'

  const [status, setStatus] = useState(isVideo ? 'pre_permission' : 'text_connecting')
  const [matchSeconds, setMatchSeconds] = useState(0)
  const [iceState, setIceState] = useState('new')
  const [partnerId, setPartnerId] = useState(null)
  const [messages, setMessages] = useState([])

  // --- milo state
  const [miloActive, setMiloActive] = useState(false)
  const [miloMessages, setMiloMessages] = useState([])
  const [miloTyping, setMiloTyping] = useState(false)
  const [persona, setPersona] = useState(() => getStoredPersona() || 'milo')
  const [showPersonaPicker, setShowPersonaPicker] = useState(() => !getStoredPersona())
  const [miloCapped, setMiloCapped] = useState(false)
  const [miloInput, setMiloInput] = useState('')
  const miloInputRef = useRef(null)
  const [sendHover, setSendHover] = useState(false)
  const [sendActive, setSendActive] = useState(false)
  const miloMessageIndexRef = useRef(0)

  // --- refs
  const socketRef = useRef(null)
  const pcRef = useRef(null)
  const localStreamRef = useRef(null)
  const remoteStreamRef = useRef(null)
  const miloActiveRef = useRef(false)
  const partnerIdRef = useRef(null)
  const chatModeRef = useRef(chatMode)
  const moodRef = useRef(mood)
  const personaRef = useRef(persona)
  const matchSecondsRef = useRef(0)
  const waitingTimerRef = useRef(null)
  const handoffTimerRef = useRef(null)

  useEffect(() => {
    miloActiveRef.current = miloActive
  }, [miloActive])
  useEffect(() => {
    partnerIdRef.current = partnerId
  }, [partnerId])
  useEffect(() => {
    chatModeRef.current = chatMode
  }, [chatMode])
  useEffect(() => {
    moodRef.current = mood
  }, [mood])
  useEffect(() => {
    personaRef.current = persona
  }, [persona])
  useEffect(() => {
    matchSecondsRef.current = matchSeconds
  }, [matchSeconds])

  // -------------------------------------------------------------------------
  // Adaptive activation timer (Milo 2.0 §F1)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (status !== 'waiting') return undefined
    waitingTimerRef.current = setInterval(() => {
      setMatchSeconds((prev) => {
        const next = prev + 1
        const trigger =
          chatModeRef.current === 'text' ? MILO_TRIGGER_TEXT : MILO_TRIGGER_VIDEO
        if (next >= trigger && !miloActiveRef.current) {
          activateMilo()
        }
        return next
      })
    }, 1000)
    return () => {
      if (waitingTimerRef.current) clearInterval(waitingTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  const activateMilo = useCallback(() => {
    setMiloActive(true)
    miloActiveRef.current = true
    const opener = moodOpener(moodRef.current)
    setMiloMessages([{ role: 'assistant', content: opener, time: nowTime() }])
    trackEvent('milo_2_activated', {
      waitSeconds: matchSecondsRef.current,
      mode: chatModeRef.current,
      mood: moodRef.current,
      persona: personaRef.current,
    })
  }, [])

  const choosePersona = useCallback((p) => {
    setPersona(p)
    setStoredPersona(p)
    setShowPersonaPicker(false)
    trackEvent('milo_2_persona_chosen', { persona: p })
  }, [])

  const sendMiloMessage = useCallback(() => {
    const text = miloInputRef.current ? miloInputRef.current.value : miloInput
    const trimmed = (text || '').trim()
    if (!trimmed) return
    const time = nowTime()
    setMiloMessages((prev) => [...prev, { role: 'user', content: trimmed, time }])
    setMiloInput('')
    if (miloInputRef.current) miloInputRef.current.value = ''
    miloMessageIndexRef.current += 1
    trackEvent('milo_2_message_sent', {
      messageLength: trimmed.length,
      sessionMessageIndex: miloMessageIndexRef.current,
    })
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('milo_chat_message', {
        fingerprint: getFingerprint(),
        text: trimmed,
      })
    }
  }, [miloInput])

  // -------------------------------------------------------------------------
  // WebRTC helpers (used inside the socket effect)
  // -------------------------------------------------------------------------
  const teardownWebRTC = useCallback(() => {
    try {
      if (pcRef.current) {
        pcRef.current.getSenders().forEach((s) => {
          try {
            if (s.track && typeof s.track.stop === 'function') s.track.stop()
          } catch {
            /* no-op */
          }
        })
        pcRef.current.close()
      }
    } catch {
      /* no-op */
    }
    pcRef.current = null
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop())
      localStreamRef.current = null
    }
    remoteStreamRef.current = null
    setIceState('closed')
  }, [])

  const setupWebRTC = useCallback((remotePartnerId, isInitiator) => {
    if (pcRef.current) return
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    pcRef.current = pc

    // ICE state monitoring — the named feature
    pc.addEventListener('iceconnectionstatechange', () => {
      const s = pc.iceConnectionState
      setIceState(s)
      if (s === 'failed' || s === 'disconnected' || s === 'closed') {
        trackEvent('webrtc_ice_state', { state: s })
      }
    })

    pc.addEventListener('icecandidate', (e) => {
      if (e.candidate && socketRef.current) {
        socketRef.current.emit('webrtc_signal', {
          to: remotePartnerId,
          type: 'ice',
          candidate: e.candidate,
        })
      }
    })

    pc.addEventListener('track', (e) => {
      if (!remoteStreamRef.current) {
        remoteStreamRef.current = new MediaStream()
      }
      e.streams[0].getTracks().forEach((t) => remoteStreamRef.current.addTrack(t))
    })

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => pc.addTrack(t, localStreamRef.current))
    }

    if (isInitiator) {
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => {
          if (socketRef.current) {
            socketRef.current.emit('webrtc_signal', {
              to: remotePartnerId,
              type: 'offer',
              sdp: pc.localDescription,
            })
          }
        })
        .catch(() => {
          /* ICE state watcher will surface a failure */
        })
    }
  }, [])

  const handleWebRTCSignal = useCallback((data) => {
    if (!data || !pcRef.current) return
    const pc = pcRef.current
    if (data.type === 'offer' && data.sdp) {
      pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
        .then(() => pc.createAnswer())
        .then((answer) => pc.setLocalDescription(answer))
        .then(() => {
          if (socketRef.current) {
            socketRef.current.emit('webrtc_signal', {
              to: partnerIdRef.current,
              type: 'answer',
              sdp: pc.localDescription,
            })
          }
        })
        .catch(() => {
          /* ignore */
        })
    } else if (data.type === 'answer' && data.sdp) {
      pc.setRemoteDescription(new RTCSessionDescription(data.sdp)).catch(() => {
        /* ignore */
      })
    } else if (data.type === 'ice' && data.candidate) {
      pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(() => {
        /* ignore */
      })
    }
  }, [])

  // -------------------------------------------------------------------------
  // Socket lifecycle
  // -------------------------------------------------------------------------
  useEffect(() => {
    const sock = socketIO(SERVER, {
      transports: ['websocket', 'polling'],
      auth: { fingerprint: getFingerprint() },
    })
    socketRef.current = sock

    sock.on('connect', () => {
      sock.emit('find_match', {
        mood: moodRef.current,
        intent,
        mediaMode: chatModeRef.current,
        trustScore: 50,
      })
      if (chatModeRef.current === 'text') {
        setStatus('waiting')
      }
    })

    sock.on('match_found', ({ partnerId: pid, initiator }) => {
      if (miloActiveRef.current) {
        const bye = GOODBYE_BY_PERSONA[personaRef.current] || GOODBYE_BY_PERSONA.milo
        setMiloMessages((prev) => [...prev, { role: 'assistant', content: bye, time: nowTime() }])
        trackEvent('milo_2_handoff_completed', {
          miloMessagesExchanged: miloMessageIndexRef.current,
          totalWaitSeconds: matchSecondsRef.current,
          mode: chatModeRef.current,
        })
        if (handoffTimerRef.current) clearTimeout(handoffTimerRef.current)
        handoffTimerRef.current = setTimeout(() => {
          setMiloActive(false)
          miloActiveRef.current = false
          setPartnerId(pid)
          partnerIdRef.current = pid
          setStatus(chatModeRef.current === 'text' ? 'text_chat' : 'connected')
        }, HANDOFF_GRACE_MS)
      } else {
        setPartnerId(pid)
        partnerIdRef.current = pid
        setStatus(chatModeRef.current === 'text' ? 'text_chat' : 'connected')
      }

      if (chatModeRef.current === 'video' && pid) {
        setupWebRTC(pid, !!initiator)
      }
    })

    sock.on('webrtc_signal', (data) => {
      handleWebRTCSignal(data)
    })

    sock.on('partner_left', () => {
      setStatus('partner_left')
      teardownWebRTC()
    })

    sock.on('slow_down', ({ remainSec }) => {
      setStatus('slow_down')
      if (handoffTimerRef.current) clearTimeout(handoffTimerRef.current)
      handoffTimerRef.current = setTimeout(() => {
        sock.emit('find_match', {
          mood: moodRef.current,
          intent,
          mediaMode: chatModeRef.current,
          trustScore: 50,
        })
        setStatus('waiting')
        setMatchSeconds(0)
      }, (remainSec || 5) * 1000)
    })

    sock.on('server_busy', () => setStatus('busy'))
    sock.on('queue_timeout', () => setStatus('busy'))
    sock.on('milo_response', (data) => {
      const reply = (data && data.reply) || 'hmm, lost my train of thought — try again?'
      const time = nowTime()
      setMiloTyping(false)
      setMiloMessages((prev) => [...prev, { role: 'assistant', content: reply, time }])
    })
    sock.on('milo_system_message', (data) => {
      const text =
        (data && data.text) ||
        'Milo is pausing for a bit so you can focus on the real people here. Try \'Find someone\' again ✨'
      setMiloMessages((prev) => [...prev, { role: 'assistant', content: text, time: nowTime() }])
      setMiloCapped(true)
      setMiloTyping(false)
    })
    sock.on('spam_detected', () => {
      setMiloTyping(false)
    })
    sock.on('disconnect', () => {
      /* handled by cleanup */
    })

    return () => {
      try {
        sock.disconnect()
      } catch {
        /* no-op */
      }
      socketRef.current = null
      teardownWebRTC()
      if (waitingTimerRef.current) clearInterval(waitingTimerRef.current)
      if (handoffTimerRef.current) clearTimeout(handoffTimerRef.current)
    }


    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const requestCamera = useCallback(async () => {
    try {
      setStatus('connecting')
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      localStreamRef.current = stream
      setStatus('waiting')
    } catch {
      setStatus('cam_error')
    }
  }, [])

  const sendText = useCallback((text) => {
    if (!text.trim() || !socketRef.current) return
    socketRef.current.emit('send_message', { text, to: partnerIdRef.current })
    setMessages((prev) => [...prev, { from: 'me', text, time: nowTime() }])
  }, [])

  const waitingHint = useMemo(() => {
    if (miloActive) return 'Milo is here to keep you company while you wait ✨'
    if (matchSeconds < 8) return "Looking for someone who's up for a chat..."
    if (matchSeconds < 20) return 'Hang tight — most matches happen in under 30s.'
    return 'Still searching. Want to try text-only? It usually pairs faster.'
  }, [miloActive, matchSeconds])

  return (
    <div style={pageStyle}>
      <header style={headerRow}>
        <button type="button" onClick={onExit} aria-label="Exit chat" style={smallBtn}>
          ← Exit
        </button>
        <div style={metaText}>
          {isVideo ? `ICE: ${iceState}` : `Mood: ${mood}`}
        </div>
        {onToggleTheme ? (
          <button type="button" onClick={onToggleTheme} aria-label="Toggle theme" style={smallBtn}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        ) : (
          <span />
        )}
      </header>

      {status === 'pre_permission' && (
        <div style={center}>
          <h3>Camera & microphone access</h3>
          <p style={muted}>We need access to match you with a real person.</p>
          <button type="button" onClick={requestCamera} style={bigBtn}>
            Allow Camera & Find Match
          </button>
        </div>
      )}

      {status === 'cam_error' && (
        <div style={center}>
          <h3>Camera access denied</h3>
          <button type="button" onClick={onExit} style={ghostBtn}>Go back</button>
        </div>
      )}

      {status === 'waiting' && (
        <div style={center}>
          <h3>Finding your match…</h3>
          <p style={muted}>{waitingHint}</p>
          <p style={{ ...muted, fontSize: '12px' }}>{matchSeconds}s elapsed</p>
        </div>
      )}

      {miloActive && (
        <section aria-live="polite" aria-atomic="false" role="log" style={panel}>
          {showPersonaPicker && (
            <div role="dialog" aria-label="Pick a Milo persona" style={personaRow}>
              {PERSONAS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => choosePersona(p.id)}
                  style={personaCard}
                >
                  <span style={{ fontSize: '20px' }}>{p.emoji}</span>
                  <strong style={{ fontSize: '12px' }}>{p.label}</strong>
                  <span style={{ fontSize: '10px', color: 'var(--text-3, #6b7280)' }}>
                    {p.blurb}
                  </span>
                </button>
              ))}
            </div>
          )}
          <div style={miloMsgList}>
            {miloMessages.map((m, i) => (
              <div key={i} style={{ fontSize: '14px' }}>
                <strong>{m.role === 'assistant' ? 'Milo' : 'You'}:</strong> {m.content}
              </div>
            ))}
            {miloTyping && <div style={typing}>Milo is typing…</div>}
          </div>
          {miloCapped && <p style={capped}>Milo is pausing — try Find Next if you want a real person ✨</p>}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              sendMiloMessage()
            }}
            style={miloInputBar}
          >
            <input
              ref={miloInputRef}
              type="text"
              defaultValue={miloInput}
              onChange={(e) => setMiloInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendMiloMessage()
                }
              }}
              placeholder="Type a message to Milo…"
              aria-label="Message Milo"
              style={miloInputField}
            />
            <button
              type="submit"
              disabled={!miloInput.trim()}
              onMouseEnter={() => setSendHover(true)}
              onMouseLeave={() => {
                setSendHover(false)
                setSendActive(false)
              }}
              onMouseDown={() => setSendActive(true)}
              onMouseUp={() => setSendActive(false)}
              style={{
                ...miloSendBtn,
                ...(miloInput.trim() ? (sendActive ? miloSendBtnActive : sendHover ? miloSendBtnHover : null) : miloSendBtnDisabled),
              }}
            >
              Send
            </button>
          </form>
        </section>
      )}

      {(status === 'text_chat' || status === 'connected') && (
        <section aria-live="polite" role="log" style={{ ...panel, flex: 1 }}>
          {status === 'connected' && isVideo && (
            <div style={iceRow}>
              <span style={iceDot(iceState)} />
              <span style={typing}>Connection: {iceState}</span>
            </div>
          )}
          <div style={msgList}>
            {messages.map((m, i) => (
              <div key={i} style={{ fontSize: '14px' }}>
                <strong>{m.from === 'me' ? 'You' : 'Stranger'}:</strong> {m.text}
              </div>
            ))}
          </div>
          {!isVideo && <ChatInput onSend={sendText} placeholder="Say something kind…" />}
        </section>
      )}

      {status === 'partner_left' && (
        <div style={center}>
          <h3>Your partner left</h3>
          <p style={muted}>Find the next person?</p>
          <button
            type="button"
            onClick={() => {
              setStatus('waiting')
              setMatchSeconds(0)
              if (socketRef.current) {
                socketRef.current.emit('find_match', {
                  mood: moodRef.current,
                  intent,
                  mediaMode: chatModeRef.current,
                  trustScore: 50,
                })
              }
            }}
            style={bigBtn}
          >
            Find next
          </button>
        </div>
      )}

      {status === 'busy' && (
        <div style={center}>
          <h3>Server is busy</h3>
          <p style={muted}>Too many open sockets from your network.</p>
        </div>
      )}

      {status === 'slow_down' && (
        <div style={center}>
          <h3>Slowing down…</h3>
          <p style={muted}>Hang on, we'll re-queue you in a sec.</p>
        </div>
      )}
    </div>
  )
}

const pageStyle = {
  minHeight: '100vh',
  padding: '16px',
  background: 'var(--bg-0, #0b0b14)',
  color: 'var(--text-1, #f3f4f6)',
  fontFamily: 'sans-serif',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
}
const headerRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
const metaText = { fontSize: '12px', color: 'var(--text-3, #6b7280)' }
const smallBtn = {
  background: 'transparent',
  color: 'var(--text-2, #9ca3af)',
  border: '1px solid var(--border-1, #2a2a3a)',
  borderRadius: '8px',
  padding: '6px 10px',
  cursor: 'pointer',
  fontSize: '13px',
}
const bigBtn = {
  padding: '12px 20px',
  borderRadius: '12px',
  border: 'none',
  background: 'var(--accent, #4f46e5)',
  color: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
}
const ghostBtn = {
  padding: '10px 16px',
  borderRadius: '10px',
  border: '1px solid var(--border-1, #2a2a3a)',
  background: 'transparent',
  color: 'var(--text-1, #f3f4f6)',
  cursor: 'pointer',
}
const panel = {
  background: 'var(--bg-1, #14141f)',
  border: '1px solid var(--border-1, #2a2a3a)',
  borderRadius: '12px',
  padding: '12px',
}
const personaRow = { display: 'flex', gap: '8px', marginBottom: '12px' }
const personaCard = {
  flex: 1,
  padding: '10px 6px',
  borderRadius: '10px',
  background: 'var(--bg-2, #1c1c2b)',
  color: 'var(--text-1, #f3f4f6)',
  border: '1px solid var(--border-1, #2a2a3a)',
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '4px',
}
const msgList = { display: 'flex', flexDirection: 'column', gap: '6px' }
const miloMsgList = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  maxHeight: '300px',
  overflowY: 'auto',
  paddingRight: '4px',
  scrollbarWidth: 'thin',
  scrollbarColor: 'var(--border-1, #2a2a3a) transparent',
}
const typing = { fontSize: '12px', color: 'var(--text-3, #6b7280)' }
const capped = { color: 'var(--text-3, #6b7280)', fontSize: '12px', marginTop: '8px' }
const miloInputBar = {
  position: 'sticky',
  bottom: 0,
  display: 'flex',
  gap: '8px',
  marginTop: '12px',
  padding: '8px',
  background: 'var(--bg-1, #14141f)',
  border: '1px solid var(--border-1, #2a2a3a)',
  borderRadius: '12px',
  zIndex: 50,
}
const miloInputField = {
  flex: 1,
  minWidth: 0,
  padding: '10px 12px',
  borderRadius: '8px',
  border: '1px solid var(--border-1, #2a2a3a)',
  background: 'var(--bg-2, #1c1c2b)',
  color: 'var(--text-1, #f3f4f6)',
  fontSize: '14px',
  outline: 'none',
}
const miloSendBtn = {
  padding: '10px 18px',
  borderRadius: '8px',
  border: '1px solid var(--accent, #4f46e5)',
  background: 'var(--accent, #4f46e5)',
  color: '#ffffff',
  fontWeight: 800,
  letterSpacing: '0.02em',
  cursor: 'pointer',
  fontSize: '14px',
  lineHeight: 1,
  transition:
    'background 140ms ease, border-color 140ms ease, transform 80ms ease, box-shadow 140ms ease',
  boxShadow: '0 1px 0 rgba(0,0,0,0.15)',
}
const miloSendBtnHover = {
  background: '#5b54f5',
  borderColor: '#5b54f5',
  boxShadow: '0 4px 14px rgba(79, 70, 229, 0.35)',
}
const miloSendBtnActive = {
  background: '#3f37d6',
  borderColor: '#3f37d6',
  transform: 'translateY(1px)',
  boxShadow: '0 1px 0 rgba(0,0,0,0.2)',
}
const miloSendBtnDisabled = {
  background: '#3a3a4a',
  borderColor: '#3a3a4a',
  color: '#9ca3af',
  cursor: 'not-allowed',
  boxShadow: 'none',
}
const center = { textAlign: 'center', padding: '40px 20px' }
const muted = { color: 'var(--text-3, #6b7280)' }
const iceRow = { display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center' }
function iceDot(state) {
  const bg =
    state === 'connected' || state === 'completed'
      ? '#10b981'
      : state === 'failed' || state === 'disconnected'
      ? '#ef4444'
      : '#f59e0b'
  return {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: bg,
    display: 'inline-block',
  }
}

function ChatInput({ onSend, placeholder }) {
  const [value, setValue] = useState('')
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!value.trim()) return
        onSend(value)
        setValue('')
      }}
      style={{ display: 'flex', gap: '8px', marginTop: '12px' }}
    >
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label="Message"
        style={{
          flex: 1,
          padding: '10px 12px',
          borderRadius: '10px',
          border: '1px solid var(--border-1, #2a2a3a)',
          background: 'var(--bg-2, #1c1c2b)',
          color: 'var(--text-1, #f3f4f6)',
          fontSize: '14px',
        }}
      />
      <button
        type="submit"
        style={{
          padding: '10px 16px',
          borderRadius: '10px',
          border: 'none',
          background: 'var(--accent, #4f46e5)',
          color: '#fff',
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        Send
      </button>
    </form>
  )
}
