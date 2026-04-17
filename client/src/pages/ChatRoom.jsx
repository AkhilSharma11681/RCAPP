import { useEffect, useMemo, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import ThemeToggle from '../components/ThemeToggle'

const SERVER =
  window.location.hostname === 'localhost'
    ? 'http://localhost:3001'
    : 'https://rcapp-server.onrender.com'

const iceConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
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

function fingerprint() {
  return 'fp_' + Math.random().toString(36).slice(2, 11)
}

export default function ChatRoom({ mood, intent, safeMode, chatMode = 'video', theme, onToggleTheme, onExit }) {
  const moodMeta = useMemo(() => getMoodMeta(mood), [mood])

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

  function emitTyping() {
    if (!partnerIdRef.current || !socketRef.current) return
    socketRef.current.emit('typing', { to: partnerIdRef.current })
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
      pcRef.current?.close()
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
  }

  function initializeTextOnlySocket() {
    setStatus('waiting')

    const socket = io(SERVER, {
      auth: { fingerprint: fingerprint() },
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
      systemMessage(`Too many fast skips. Try again in ${waitSeconds}s.`)
      setTimeout(() => {
        setStatus('waiting')
        socket.emit('find_match', { mood, intent, textOnly: true })
      }, waitSeconds * 1000)
    })

    socket.on('match_found', ({ partnerId, starter: serverStarter }) => {
      partnerIdRef.current = partnerId
      setStarter(serverStarter || '')
      setStatus('text_chat')
      resetAll()
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
      setStatus('partner_left')
    })

    socket.on('report_received', () => {
      setReportSent(true)
      systemMessage('Report received. Thanks for helping keep Miloo safe.')
    })
  }

  async function initializeMediaAndSocket() {
    setStatus('connecting')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      myStreamRef.current = stream
      if (myVideoRef.current) myVideoRef.current.srcObject = stream
    } catch {
      setStatus('cam_error')
      return
    }

    const socket = io(SERVER, {
      auth: { fingerprint: fingerprint() },
      timeout: 20000,
    })

    socketRef.current = socket

    // Handle cold-start on Render — server may take up to 30s to wake
    const wakeTimeout = setTimeout(() => {
      if (socket.connected) return
      setStatus('waking')
    }, 4000)

    socket.on('connect', () => {
      clearTimeout(wakeTimeout)
      setStatus('waiting')
      socket.emit('find_match', { mood, intent })
    })

    socket.on('connect_error', () => {
      clearTimeout(wakeTimeout)
      setStatus('waking')
      // Keep trying — socket.io will auto-reconnect
    })

    socket.on('waiting', () => setStatus('waiting'))
    socket.on('server_busy', () => setStatus('busy'))

    socket.on('slow_down', ({ waitSeconds }) => {
      setStatus('slow_down')
      systemMessage(`Too many fast skips. Try again in ${waitSeconds}s.`)
      setTimeout(() => {
        setStatus('waiting')
        socket.emit('find_match', { mood, intent })
      }, waitSeconds * 1000)
    })

    socket.on('match_found', async ({ partnerId, initiator, starter: serverStarter }) => {
      partnerIdRef.current = partnerId
      setStarter(serverStarter || '')
      setStatus('connected')
      resetAll()
      await startPC(initiator, socket, partnerId)
    })

    socket.on('webrtc_offer', async ({ offer, from }) => {
      try {
        partnerIdRef.current = from
        const pc = createPC(socket, from)
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

    socket.on('message_blocked', () => {
      systemMessage('Links and contact-sharing are blocked for safety.')
    })

    socket.on('partner_left', () => {
      setStatus('partner_left')
      pcRef.current?.close()
      if (partnerVideoRef.current) partnerVideoRef.current.srcObject = null
    })

    socket.on('report_received', () => {
      setReportSent(true)
      systemMessage('Report received. Thanks for helping keep Miloo safe.')
    })
  }

  function createPC(socket, partnerId) {
    if (pcRef.current && pcRef.current.signalingState !== 'closed') {
      return pcRef.current
    }

    const pc = new RTCPeerConnection(iceConfig)
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

    return pc
  }

  async function startPC(initiator, socket, partnerId) {
    const pc = createPC(socket, partnerId)

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
    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }

    if (partnerVideoRef.current) partnerVideoRef.current.srcObject = null

    setStatus('waiting')
    setStarter('')
    resetAll()
    if (chatMode === 'text') {
      socketRef.current?.emit('find_match', { mood, intent, textOnly: true })
    } else {
      socketRef.current?.emit('find_match', { mood, intent })
    }
  }

  function sendPrompt(prompt) {
    setQuickPrompt(prompt)
    sendMessage(prompt)
  }

  function sendGoodConvo() {
    socketRef.current?.emit('good_convo')
    setGoodSent(true)
    systemMessage('Nice. We will use that feedback to improve future matches.')
  }

  function reportUser() {
    if (reportSent) return
    socketRef.current?.emit('report_user')
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
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-0)' }}>
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
        <div style={{ textAlign: 'center', maxWidth: '320px', padding: '24px' }}>
          <div style={{ fontSize: '50px' }}>📷</div>
          <h3 style={{ color: 'var(--text-1)', marginTop: '16px', fontSize: '26px' }}>Camera access is required</h3>
          <p style={{ color: 'var(--text-3)', marginTop: '10px', fontSize: '14px', lineHeight: 1.6 }}>
            Allow camera and microphone permissions in the browser, then try again.
          </p>
          <Btn onClick={onExit} style={{ marginTop: '24px' }}>Go Back</Btn>
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
    <div style={{ height: '100vh', background: '#000', position: 'relative', overflow: 'hidden' }}>
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
          <div style={{
            width: '94px', height: '94px', borderRadius: '50%',
            background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.22)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '40px',
          }}>
            {status === 'partner_left' ? '👋' : '🔎'}
          </div>

          <div style={{ textAlign: 'center', maxWidth: '360px', marginTop: '22px' }}>
            <p style={{ color: 'var(--text-1)', fontSize: '26px', fontWeight: '800', lineHeight: 1.15 }}>
              {status === 'partner_left' ? 'That chat ended' : 'Finding your match...'}
            </p>
            <p style={{ color: 'var(--text-3)', fontSize: '15px', marginTop: '10px', lineHeight: 1.6 }}>
              {status === 'partner_left'
                ? 'Hit next to meet someone new on the same vibe.'
                : matchSeconds > 30
                  ? 'Not many people online right now. Try a different mood or check back later.'
                  : waitingHint}
            </p>
          </div>

          {status !== 'partner_left' && (
            <div style={{ marginTop: '18px', display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <Pill>{moodMeta.emoji} {moodMeta.label}</Pill>
              <Pill>Waiting {matchSeconds}s</Pill>
            </div>
          )}

          {status !== 'partner_left' && matchSeconds > 20 && (
            <button onClick={onExit} style={{ marginTop: '20px', background: 'var(--surface-1)', border: '1px solid var(--border-1)', color: 'var(--text-2)', borderRadius: '999px', padding: '10px 20px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
              ← Go back
            </button>
          )}

          {status === 'partner_left' && <Btn onClick={findNext} style={{ marginTop: '24px' }}>Find Someone New</Btn>}
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
  )
}

function Center({ children }) {
  return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-0)',
      padding: '20px',
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
