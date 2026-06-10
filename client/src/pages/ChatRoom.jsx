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
import Logo from '../components/Logo'
import ThemeToggle from '../components/ThemeToggle'

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

const MATCH_KF = `
@keyframes milooRadar{0%{transform:scale(.3);opacity:.85}100%{transform:scale(2.2);opacity:0}}
@keyframes milooDotPulse{0%,100%{opacity:.25;transform:translateY(0)}50%{opacity:1;transform:translateY(-3px)}}
@keyframes milooMsgIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
`

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

const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)'

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

  const [miloActive, setMiloActive] = useState(false)
  const [miloMessages, setMiloMessages] = useState([])
  const [miloTyping, setMiloTyping] = useState(false)
  const [persona, setPersona] = useState(() => getStoredPersona() || 'milo')
  const [showPersonaPicker, setShowPersonaPicker] = useState(() => !getStoredPersona())
  const [miloCapped, setMiloCapped] = useState(false)
  const [miloInput, setMiloInput] = useState('')
  const miloInputRef = useRef(null)
  const miloMessageIndexRef = useRef(0)

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
  const miloScrollRef = useRef(null)
  const msgScrollRef = useRef(null)

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

  // ── Auto-scroll message lists ──
  useEffect(() => {
    if (miloScrollRef.current) {
      miloScrollRef.current.scrollTop = miloScrollRef.current.scrollHeight
    }
  }, [miloMessages, miloTyping])
  useEffect(() => {
    if (msgScrollRef.current) {
      msgScrollRef.current.scrollTop = msgScrollRef.current.scrollHeight
    }
  }, [messages])

  // ── Adaptive activation timer (Milo 2.0 §F1) ──
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
    const sock = socketRef.current
    if (sock && typeof sock.emit === 'function' && sock.connected) {
      try {
        sock.emit('milo_chat_message', {
          fingerprint: getFingerprint(),
          text: trimmed,
        })
      } catch (err) {
        trackEvent('milo_emit_failed', { error: String(err && err.message) })
      }
    }
  }, [miloInput])

  // ── WebRTC helpers ──
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

    pc.addEventListener('iceconnectionstatechange', () => {
      const s = pc.iceConnectionState
      setIceState(s)
      if (s === 'failed' || s === 'disconnected' || s === 'closed') {
        trackEvent('webrtc_ice_state', { state: s })
      }
    })

    pc.addEventListener('icecandidate', (e) => {
      if (!e || !e.candidate) return
      const sock = socketRef.current
      if (!sock || !remotePartnerId) return
      try {
        sock.emit('webrtc_signal', {
          to: remotePartnerId,
          type: 'ice',
          candidate: e.candidate,
        })
      } catch (err) {
        trackEvent('ice_emit_failed', { error: String(err && err.message) })
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

  // ── Socket lifecycle ──
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

    sock.on('match_found', (raw) => {
      const payload = raw && typeof raw === 'object' ? raw : {}
      const pid = typeof payload.partnerId === 'string' ? payload.partnerId : null
      const initiator = !!payload.initiator
      if (miloActiveRef.current && pid) {
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

      if (chatModeRef.current === 'video' && pid && typeof pid === 'string') {
        try {
          setupWebRTC(pid, !!initiator)
        } catch (err) {
          trackEvent('webrtc_setup_failed', { error: String(err && err.message) })
          setStatus('partner_left')
        }
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
      const reply =
        (data && typeof data.reply === 'string' && data.reply) ||
        'hmm, lost my train of thought — try again?'
      setMiloTyping(false)
      setMiloMessages((prev) =>
        Array.isArray(prev) ? [...prev, { role: 'assistant', content: reply, time: nowTime() }] : [{ role: 'assistant', content: reply, time: nowTime() }]
      )
    })
    sock.on('milo_system_message', (data) => {
      const text =
        (data && typeof data.text === 'string' && data.text) ||
        'Milo is pausing for a bit so you can focus on the real people here. Try Find someone again ✨'
      setMiloMessages((prev) =>
        Array.isArray(prev) ? [...prev, { role: 'assistant', content: text, time: nowTime() }] : [{ role: 'assistant', content: text, time: nowTime() }]
      )
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
      try { sock.disconnect() } catch { /* no-op */ }
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
    const trimmed = (text || '').trim()
    if (!trimmed) return
    const sock = socketRef.current
    if (!sock || typeof sock.emit !== 'function') return
    const pid = partnerIdRef.current
    if (!pid) {
      setMessages((prev) => [
        ...prev,
        { from: 'system', text: 'Still searching for a match — hang tight ✨', time: nowTime() },
      ])
      return
    }
    try {
      sock.emit('send_message', { text: trimmed, to: pid })
      setMessages((prev) => [...prev, { from: 'me', text: trimmed, time: nowTime() }])
    } catch (err) {
      trackEvent('send_message_failed', { error: String(err && err.message) })
    }
  }, [])

  const waitingHint = useMemo(() => {
    if (miloActive) return 'Milo is here to keep you company while you wait ✨'
    if (matchSeconds < 8) return "Looking for someone who's up for a chat..."
    if (matchSeconds < 20) return 'Hang tight — most matches happen in under 30s.'
    return 'Still searching. Want to try text-only? It usually pairs faster.'
  }, [miloActive, matchSeconds])

  const findNext = useCallback(() => {
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
  }, [intent])

  // ── Render ──
  return (
    <>
      <style>{MATCH_KF}</style>
      <div
        className="chat-room"
        style={{
          background: 'var(--bg-0)',
          color: 'var(--text-1)',
        }}
      >
        {/* ── Top bar ── */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            padding: '12px clamp(12px, 3vw, 20px)',
            borderBottom: '1px solid var(--border-1)',
            background: 'var(--bg-0)',
            flexShrink: 0,
          }}
        >
          <button
            onClick={onExit}
            aria-label="Exit chat"
            className="compact"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 12px',
              borderRadius: 'var(--radius-pill)',
              background: 'var(--surface-1)',
              border: '1px solid var(--border-1)',
              color: 'var(--text-2)',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <span aria-hidden="true">←</span>
            <span>Exit</span>
          </button>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: 'var(--radius-pill)',
              background: 'var(--surface-1)',
              border: '1px solid var(--border-1)',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text-3)',
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: statusDotColor(status, iceState),
                boxShadow: `0 0 6px ${statusDotColor(status, iceState)}`,
              }}
              aria-hidden="true"
            />
            <span style={{ textTransform: 'capitalize' }}>{statusLabel(status, iceState, isVideo, mood)}</span>
          </div>

          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </header>

        {/* ── Main body ── */}
        <main
          style={{
            flex: 1,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          {status === 'pre_permission' && <PrePermissionView onAllow={requestCamera} onExit={onExit} />}
          {status === 'cam_error' && <ErrorView title="Camera access denied" onExit={onExit} />}
          {(status === 'waiting' || status === 'text_connecting') && (
            <MatchingView
              mood={mood}
              matchSeconds={matchSeconds}
              hint={waitingHint}
              miloActive={miloActive}
            />
          )}
          {miloActive && (
            <MiloPanel
              persona={persona}
              showPersonaPicker={showPersonaPicker}
              choosePersona={choosePersona}
              personas={PERSONAS}
              miloMessages={miloMessages}
              miloTyping={miloTyping}
              miloCapped={miloCapped}
              miloInput={miloInput}
              setMiloInput={setMiloInput}
              sendMiloMessage={sendMiloMessage}
              miloInputRef={miloInputRef}
              scrollRef={miloScrollRef}
            />
          )}
          {(status === 'text_chat' || status === 'connected') && (
            <ChatView
              isVideo={isVideo}
              iceState={iceState}
              messages={messages}
              sendText={sendText}
              localStream={localStreamRef.current}
              remoteStream={remoteStreamRef.current}
              scrollRef={msgScrollRef}
            />
          )}
          {status === 'partner_left' && <PartnerLeftView onNext={findNext} onExit={onExit} />}
          {status === 'busy' && <SimpleStatusView title="Server is busy" desc="Too many open sockets from your network." />}
          {status === 'slow_down' && <SimpleStatusView title="Slowing down…" desc="Hang on, we'll re-queue you in a sec." />}
        </main>
      </div>
    </>
  )
}

// ── Helper: status display ──
function statusLabel(status, iceState, isVideo, mood) {
  if (status === 'pre_permission') return 'Camera needed'
  if (status === 'cam_error') return 'Camera blocked'
  if (status === 'waiting' || status === 'text_connecting') return 'Finding match'
  if (status === 'text_chat') return `Mood: ${mood}`
  if (status === 'connected') return isVideo ? `ICE: ${iceState}` : 'Connected'
  if (status === 'partner_left') return 'Partner left'
  if (status === 'busy') return 'Server busy'
  if (status === 'slow_down') return 'Slowing down'
  return 'Connecting'
}

function statusDotColor(status, iceState) {
  if (status === 'connected' || iceState === 'connected' || iceState === 'completed') return 'var(--success)'
  if (status === 'partner_left' || status === 'busy' || iceState === 'failed' || iceState === 'disconnected') return 'var(--danger)'
  if (status === 'cam_error') return 'var(--danger)'
  return 'var(--warning)'
}

// ═══════════════════════════════════════════════════════════════════════════
// ── Subcomponents ──
// ═══════════════════════════════════════════════════════════════════════════

function PrePermissionView({ onAllow, onExit }) {
  return (
    <Center>
      <div
        className="scale-in"
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: 'var(--accent-dim)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 28,
          marginBottom: 16,
        }}
      >
        🎥
      </div>
      <h2 style={{ fontSize: 'clamp(20px, 3vw, 24px)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 8 }}>
        Camera & microphone access
      </h2>
      <p style={{ color: 'var(--text-3)', fontSize: 14, marginBottom: 24, maxWidth: 320, lineHeight: 1.5 }}>
        We need access to match you with a real person. Your stream is peer-to-peer and never recorded.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 'min(100%, 320px)' }}>
        <PrimaryButton onClick={onAllow}>Allow Camera & Find Match</PrimaryButton>
        <GhostButton onClick={onExit}>Go back</GhostButton>
      </div>
    </Center>
  )
}

function ErrorView({ title, onExit }) {
  return (
    <Center>
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: 'var(--accent-dim)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 28,
          marginBottom: 16,
        }}
      >
        ⚠️
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>{title}</h2>
      <GhostButton onClick={onExit}>Go back</GhostButton>
    </Center>
  )
}

function MatchingView({ mood, matchSeconds, hint, miloActive }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(16px, 4vw, 32px)',
      }}
    >
      <div
        className="scale-in glass"
        style={{
          width: '100%',
          maxWidth: 420,
          borderRadius: 'var(--radius-xl)',
          padding: 'clamp(24px, 4vw, 36px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--text-3)',
            alignSelf: 'flex-start',
          }}
        >
          Mood: <span style={{ color: 'var(--accent)', textTransform: 'capitalize' }}>{mood}</span>
        </div>

        <div
          aria-hidden="true"
          style={{
            position: 'relative',
            width: 160,
            height: 160,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              style={{
                position: 'absolute',
                width: 140,
                height: 140,
                borderRadius: '50%',
                border: '1.5px solid rgba(192, 132, 252, 0.6)',
                background: 'radial-gradient(circle, rgba(192,132,252,0.08) 0%, rgba(192,132,252,0) 70%)',
                animation: `milooRadar 3.3s cubic-bezier(0,0,0.2,1) infinite`,
                animationDelay: `${i * 1.1}s`,
                pointerEvents: 'none',
              }}
            />
          ))}
          <span
            style={{
              position: 'relative',
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: 'radial-gradient(circle, #f0abfc 0%, #c084fc 60%, #7c3aed 100%)',
              boxShadow: '0 0 24px rgba(192,132,252,0.8), 0 0 8px rgba(255,255,255,0.5)',
              zIndex: 2,
            }}
          />
        </div>

        <h2 style={{ fontSize: 'clamp(20px, 3vw, 26px)', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
          {miloActive ? 'Milo is here with you' : 'Finding your match…'}
        </h2>
        <p style={{ color: 'var(--text-3)', fontSize: 14, margin: 0, maxWidth: 320, lineHeight: 1.5 }}>{hint}</p>

        <div
          aria-hidden="true"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 14 }}
        >
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--accent-2)',
                boxShadow: '0 0 8px rgba(192,132,252,0.7)',
                animation: 'milooDotPulse 1.2s ease-in-out infinite',
                animationDelay: `${i * 0.18}s`,
              }}
            />
          ))}
        </div>

        <div
          style={{
            marginTop: 4,
            padding: '8px 18px',
            display: 'inline-flex',
            alignItems: 'baseline',
            gap: 10,
            background: 'var(--surface-1)',
            border: '1px solid var(--border-1)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.18em',
              color: 'var(--accent-2)',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            }}
          >
            ELAPSED
          </span>
          <span
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: 'var(--accent-3)',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '0.04em',
            }}
          >
            {String(matchSeconds).padStart(2, '0')}s
          </span>
        </div>
      </div>
    </div>
  )
}

function PartnerLeftView({ onNext, onExit }) {
  return (
    <Center>
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: 'var(--accent-dim)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 28,
          marginBottom: 16,
        }}
      >
        👋
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Your partner left</h2>
      <p style={{ color: 'var(--text-3)', fontSize: 14, marginBottom: 24 }}>Find the next person?</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 'min(100%, 320px)' }}>
        <PrimaryButton onClick={onNext}>Find next</PrimaryButton>
        <GhostButton onClick={onExit}>Go home</GhostButton>
      </div>
    </Center>
  )
}

function SimpleStatusView({ title, desc }) {
  return (
    <Center>
      <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>{title}</h2>
      <p style={{ color: 'var(--text-3)', fontSize: 14 }}>{desc}</p>
    </Center>
  )
}

function Center({ children }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(24px, 4vw, 40px)',
        textAlign: 'center',
      }}
    >
      {children}
    </div>
  )
}

function PrimaryButton({ children, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%',
        padding: '14px 22px',
        fontSize: 15,
        fontWeight: 700,
        letterSpacing: '-0.01em',
        color: 'var(--accent-text)',
        background: 'var(--gradient-cta)',
        border: 'none',
        borderRadius: 'var(--radius-pill)',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        boxShadow: 'var(--accent-glow)',
        transition: 'transform 150ms ease, box-shadow 150ms ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-1px)'
        e.currentTarget.style.boxShadow = 'var(--shadow-glow)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = 'var(--accent-glow)'
      }}
    >
      {children}
    </button>
  )
}

function GhostButton({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      className="compact"
      style={{
        width: '100%',
        padding: '12px 22px',
        fontSize: 14,
        fontWeight: 600,
        color: 'var(--text-2)',
        background: 'transparent',
        border: '1px solid var(--border-1)',
        borderRadius: 'var(--radius-pill)',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = 'var(--text-1)'
        e.currentTarget.style.background = 'var(--surface-1)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = 'var(--text-2)'
        e.currentTarget.style.background = 'transparent'
      }}
    >
      {children}
    </button>
  )
}

function MiloPanel({
  persona,
  showPersonaPicker,
  choosePersona,
  personas,
  miloMessages,
  miloTyping,
  miloCapped,
  miloInput,
  setMiloInput,
  sendMiloMessage,
  miloInputRef,
  scrollRef,
}) {
  const currentPersona = personas.find((p) => p.id === persona) || personas[0]
  return (
    <section
      aria-live="polite"
      role="log"
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        margin: '12px clamp(12px, 3vw, 20px)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--bg-1)',
        border: '1px solid var(--border-1)',
        overflow: 'hidden',
        animation: 'milooMsgIn 240ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
      }}
    >
      {/* Persona header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 14px',
          borderBottom: '1px solid var(--border-1)',
          background: 'var(--surface-1)',
        }}
      >
        <span style={{ fontSize: 22 }} aria-hidden="true">{currentPersona.emoji}</span>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{currentPersona.label}</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{currentPersona.blurb}</div>
        </div>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--success)',
            padding: '4px 10px',
            borderRadius: 'var(--radius-pill)',
            background: 'rgba(52, 211, 153, 0.1)',
          }}
        >
          AI
        </span>
      </div>

      {showPersonaPicker && (
        <div
          role="dialog"
          aria-label="Pick a Milo persona"
          style={{
            padding: '10px 14px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
            gap: 8,
            background: 'var(--surface-1)',
            borderBottom: '1px solid var(--border-1)',
          }}
        >
          {personas.map((p) => (
            <button
              key={p.id}
              onClick={() => choosePersona(p.id)}
              className="card-hover"
              style={{
                padding: '10px 8px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-2)',
                color: 'var(--text-1)',
                border: '1px solid var(--border-1)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                textAlign: 'center',
              }}
            >
              <span style={{ fontSize: 22 }}>{p.emoji}</span>
              <strong style={{ fontSize: 12, fontWeight: 700 }}>{p.label}</strong>
              <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{p.blurb}</span>
            </button>
          ))}
        </div>
      )}

      <div
        ref={scrollRef}
        className="no-scrollbar"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: '14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {miloMessages.map((m, i) => (
          <MessageBubble key={i} role={m.role} time={m.time}>
            {m.content}
          </MessageBubble>
        ))}
        {miloTyping && (
          <div style={{ alignSelf: 'flex-start', display: 'inline-flex', gap: 4, padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'var(--bg-2)', border: '1px solid var(--border-1)' }}>
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </div>
        )}
        {miloCapped && (
          <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: '8px 0' }}>
            Milo is pausing — try Find Next if you want a real person ✨
          </p>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          sendMiloMessage()
        }}
        style={{
          display: 'flex',
          gap: 8,
          padding: '10px 12px',
          borderTop: '1px solid var(--border-1)',
          background: 'var(--surface-1)',
        }}
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
          style={{
            flex: 1,
            minWidth: 0,
            padding: '10px 14px',
            borderRadius: 'var(--radius-pill)',
            border: '1px solid var(--border-1)',
            background: 'var(--bg-2)',
            color: 'var(--text-1)',
            fontSize: 14,
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={!miloInput.trim()}
          aria-label="Send"
          className="compact"
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            border: 'none',
            background: miloInput.trim() ? 'var(--accent)' : 'var(--bg-2)',
            color: miloInput.trim() ? 'var(--accent-text)' : 'var(--text-3)',
            cursor: miloInput.trim() ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            flexShrink: 0,
          }}
        >
          ➤
        </button>
      </form>
    </section>
  )
}

function ChatView({ isVideo, iceState, messages, sendText, localStream, remoteStream, scrollRef }) {
  return (
    <section
      aria-live="polite"
      role="log"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        padding: 'clamp(12px, 3vw, 20px)',
        gap: 12,
      }}
    >
      {isVideo ? (
        <VideoStage iceState={iceState} localStream={localStream} remoteStream={remoteStream} />
      ) : (
        <>
          <div
            ref={scrollRef}
            className="no-scrollbar"
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              padding: '14px',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--bg-1)',
              border: '1px solid var(--border-1)',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            {messages.length === 0 && (
              <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-3)', fontSize: 14 }}>
                Say hi! 👋
              </div>
            )}
            {messages.map((m, i) =>
              m.from === 'system' ? (
                <div key={i} style={{ alignSelf: 'center', fontSize: 12, color: 'var(--text-3)', padding: '4px 10px', borderRadius: 'var(--radius-pill)', background: 'var(--surface-1)' }}>
                  {m.text}
                </div>
              ) : (
                <MessageBubble key={i} role={m.from === 'me' ? 'user' : 'stranger'} time={m.time}>
                  {m.text}
                </MessageBubble>
              )
            )}
          </div>
          <ChatInput onSend={sendText} placeholder="Say something kind…" />
        </>
      )}
    </section>
  )
}

function MessageBubble({ role, time, children }) {
  const isMe = role === 'user' || role === 'me'
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isMe ? 'flex-end' : 'flex-start',
        maxWidth: '85%',
        alignSelf: isMe ? 'flex-end' : 'flex-start',
        animation: 'milooMsgIn 220ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
      }}
    >
      <div
        style={{
          padding: '8px 14px',
          borderRadius: isMe ? 'var(--radius-md) var(--radius-md) 4px var(--radius-md)' : 'var(--radius-md) var(--radius-md) var(--radius-md) 4px',
          background: isMe ? 'var(--gradient-cta)' : 'var(--bg-2)',
          color: isMe ? 'var(--accent-text)' : 'var(--text-1)',
          border: isMe ? 'none' : '1px solid var(--border-1)',
          fontSize: 14,
          lineHeight: 1.4,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {children}
      </div>
      {time && (
        <span style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4, padding: '0 4px' }}>
          {isMe ? 'You' : 'Stranger'} · {time}
        </span>
      )}
    </div>
  )
}

function VideoStage({ iceState, localStream, remoteStream }) {
  const localRef = useRef(null)
  const remoteRef = useRef(null)
  useEffect(() => {
    if (localRef.current && localStream && localRef.current.srcObject !== localStream) {
      localRef.current.srcObject = localStream
    }
  }, [localStream])
  useEffect(() => {
    if (remoteRef.current && remoteStream && remoteRef.current.srcObject !== remoteStream) {
      remoteRef.current.srcObject = remoteStream
    }
  }, [remoteStream])

  const connState = (iceState || '').toLowerCase()
  const isLive = connState === 'connected' || connState === 'completed'

  return (
    <div
      style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: '1fr',
        gap: 12,
        minHeight: 0,
      }}
    >
      <div
        style={{
          position: 'relative',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          background: '#000',
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid var(--border-1)',
        }}
      >
        <video
          ref={remoteRef}
          autoPlay
          playsInline
          style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#000' }}
        />
        {!remoteStream && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 14 }}>
            Waiting for partner's video…
          </div>
        )}
        <div
          style={{
            position: 'absolute',
            top: 10,
            left: 10,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            borderRadius: 'var(--radius-pill)',
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            fontSize: 11,
            fontWeight: 600,
            color: '#fff',
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: isLive ? 'var(--success)' : 'var(--warning)' }} />
          {isLive ? 'Live' : (iceState || 'connecting')}
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 10,
            right: 10,
            width: 'clamp(80px, 22vw, 140px)',
            aspectRatio: '4 / 3',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
            background: '#000',
            border: '2px solid rgba(255,255,255,0.2)',
            boxShadow: 'var(--shadow)',
          }}
        >
          <video
            ref={localRef}
            autoPlay
            playsInline
            muted
            style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
          />
        </div>
      </div>
    </div>
  )
}

function ChatInput({ onSend, placeholder }) {
  const [value, setValue] = useState('')
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const trimmed = value.trim()
        if (!trimmed) return
        onSend(trimmed)
        setValue('')
      }}
      style={{
        display: 'flex',
        gap: 8,
        padding: '6px 6px 6px 14px',
        borderRadius: 'var(--radius-pill)',
        background: 'var(--surface-1)',
        border: '1px solid var(--border-1)',
        alignItems: 'center',
      }}
    >
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label="Message"
        style={{
          flex: 1,
          minWidth: 0,
          padding: '10px 0',
          background: 'transparent',
          border: 'none',
          color: 'var(--text-1)',
          fontSize: 14,
          outline: 'none',
        }}
      />
      <button
        type="submit"
        disabled={!value.trim()}
        aria-label="Send"
        className="compact"
        style={{
          width: 38,
          height: 38,
          borderRadius: '50%',
          border: 'none',
          background: value.trim() ? 'var(--accent)' : 'var(--bg-2)',
          color: value.trim() ? 'var(--accent-text)' : 'var(--text-3)',
          cursor: value.trim() ? 'pointer' : 'not-allowed',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
          flexShrink: 0,
        }}
      >
        ➤
      </button>
    </form>
  )
}
