import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'

const SERVER = 'https://rcapp-server.onrender.com'
const iceConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]
}

export default function ChatRoom({ mood, safeMode, onExit }) {
  const [status, setStatus] = useState('connecting')
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [starter, setStarter] = useState('')
  const [goodSent, setGoodSent] = useState(false)
  const [darkRoom, setDarkRoom] = useState(true)
  const [countdown, setCountdown] = useState(60)
  const [revealed, setRevealed] = useState(false)
  const [blur, setBlur] = useState(20)
  const [muted, setMuted] = useState(false)
  const [camOff, setCamOff] = useState(false)
  const [showWelcome, setShowWelcome] = useState(false)
  const [myBlur, setMyBlur] = useState(safeMode)
  const [chatFocused, setChatFocused] = useState(false)
  const [unread, setUnread] = useState(0)

  const socketRef = useRef(null)
  const pcRef = useRef(null)
  const myVideoRef = useRef(null)
  const partnerVideoRef = useRef(null)
  const myStreamRef = useRef(null)
  const partnerIdRef = useRef(null)
  const messagesEndRef = useRef(null)
  const countdownRef = useRef(null)
  const blurRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    if (chatFocused) setUnread(0)
  }, [messages])

  function startDarkRoomTimer() {
    setDarkRoom(true); setRevealed(false); setBlur(20); setCountdown(60)
    setShowWelcome(true)
    setTimeout(() => setShowWelcome(false), 3500)
    let timeLeft = 60
    countdownRef.current = setInterval(() => {
      timeLeft -= 1; setCountdown(timeLeft)
      if (timeLeft <= 0) { clearInterval(countdownRef.current); startReveal() }
    }, 1000)
  }

  function startReveal() {
    let b = 20
    blurRef.current = setInterval(() => {
      b -= 1; setBlur(b)
      if (b <= 0) {
        clearInterval(blurRef.current)
        setDarkRoom(false); setRevealed(true)
        setTimeout(() => setRevealed(false), 3000)
      }
    }, 150)
  }

  function skipDarkRoom() {
    clearInterval(countdownRef.current)
    clearInterval(blurRef.current)
    startReveal()
  }

  function resetAll() {
    clearInterval(countdownRef.current)
    clearInterval(blurRef.current)
    setDarkRoom(true); setRevealed(false); setBlur(20); setCountdown(60)
    setShowWelcome(false); setMyBlur(safeMode)
    setMessages([]); setUnread(0); setChatFocused(false)
  }

  function toggleMute() {
    const t = myStreamRef.current?.getAudioTracks()[0]
    if (t) { t.enabled = !t.enabled; setMuted(!t.enabled) }
  }

  function toggleCam() {
    const t = myStreamRef.current?.getVideoTracks()[0]
    if (t) { t.enabled = !t.enabled; setCamOff(!t.enabled) }
  }

  useEffect(() => {
    let socket
    const init = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        myStreamRef.current = stream
        if (myVideoRef.current) myVideoRef.current.srcObject = stream
      } catch { setStatus('cam_error'); return }

      socket = io(SERVER, { auth: { fingerprint: 'fp_' + Math.random().toString(36).substr(2, 9) } })
      socketRef.current = socket

      socket.on('connect', () => { setStatus('waiting'); socket.emit('find_match', { mood }) })
      socket.on('waiting', () => setStatus('waiting'))
      socket.on('server_busy', () => setStatus('busy'))
      socket.on('slow_down', ({ waitSeconds }) => {
        setStatus('slow_down')
        setTimeout(() => { setStatus('waiting'); socket.emit('find_match', { mood }) }, waitSeconds * 1000)
      })
      socket.on('match_found', async ({ partnerId, initiator, starter: s }) => {
        partnerIdRef.current = partnerId
        setStarter(s); setStatus('connected'); setGoodSent(false)
        resetAll(); startDarkRoomTimer()
        await startPC(initiator, socket, partnerId)
      })
      socket.on('webrtc_offer', async ({ offer, from }) => {
        partnerIdRef.current = from
        const pc = createPC(socket, from)
        await pc.setRemoteDescription(new RTCSessionDescription(offer))
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        socket.emit('webrtc_answer', { answer, to: from })
      })
      socket.on('webrtc_answer', async ({ answer }) => {
        await pcRef.current?.setRemoteDescription(new RTCSessionDescription(answer))
      })
      socket.on('ice_candidate', async ({ candidate }) => {
        try { await pcRef.current?.addIceCandidate(new RTCIceCandidate(candidate)) } catch {}
      })
      socket.on('receive_message', ({ message }) => {
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        setMessages(prev => [...prev, { from: 'them', text: message, time, id: Date.now() }])
        if (!chatFocused) setUnread(prev => prev + 1)
      })
      socket.on('message_blocked', () => {
        setMessages(prev => [...prev, { from: 'system', text: '🚫 Links are not allowed', id: Date.now() }])
      })
      socket.on('partner_left', () => {
        setStatus('partner_left')
        clearInterval(countdownRef.current); clearInterval(blurRef.current)
        pcRef.current?.close()
        if (partnerVideoRef.current) partnerVideoRef.current.srcObject = null
      })
      socket.on('report_received', () => {
        setMessages(prev => [...prev, { from: 'system', text: '✅ Reported', id: Date.now() }])
      })
    }
    init()
    return () => {
      clearInterval(countdownRef.current); clearInterval(blurRef.current)
      pcRef.current?.close()
      myStreamRef.current?.getTracks().forEach(t => t.stop())
      socket?.disconnect()
    }
  }, [mood])

  function createPC(socket, partnerId) {
    if (pcRef.current) pcRef.current.close()
    const pc = new RTCPeerConnection(iceConfig)
    pcRef.current = pc
    myStreamRef.current?.getTracks().forEach(track => pc.addTrack(track, myStreamRef.current))
    pc.ontrack = (e) => { if (partnerVideoRef.current) partnerVideoRef.current.srcObject = e.streams[0] }
    pc.onicecandidate = (e) => { if (e.candidate) socket.emit('ice_candidate', { candidate: e.candidate, to: partnerId }) }
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

  function sendMessage() {
    if (!input.trim() || !partnerIdRef.current) return
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    socketRef.current.emit('send_message', { message: input, to: partnerIdRef.current })
    setMessages(prev => [...prev, { from: 'me', text: input, time, id: Date.now() }])
    setInput('')
    inputRef.current?.focus()
  }

  function findNext() {
    clearInterval(countdownRef.current); clearInterval(blurRef.current)
    pcRef.current?.close()
    if (partnerVideoRef.current) partnerVideoRef.current.srcObject = null
    setStatus('waiting'); setStarter('')
    resetAll()
    socketRef.current.emit('find_match', { mood })
  }

  const partnerFilter = darkRoom ? `blur(${blur}px) brightness(0.3)` : 'none'
  const myFilter = darkRoom ? 'blur(8px) brightness(0.4)' : camOff ? 'brightness(0.15)' : myBlur ? 'blur(12px) brightness(0.3)' : 'none'

  // Only show last 4 messages on video
  const visibleMessages = messages.filter(m => m.from !== 'system').slice(-4)

  if (status === 'cam_error') return (
    <Center>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '48px' }}>📷</div>
        <h3 style={{ color: '#fff', marginTop: '16px' }}>Allow Camera Access</h3>
        <p style={{ color: '#666', marginTop: '8px', fontSize: '14px' }}>Please allow camera in your browser settings</p>
        <Btn onClick={onExit} style={{ marginTop: '24px' }}>Go Back</Btn>
      </div>
    </Center>
  )

  if (status === 'busy') return (
    <Center>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '48px' }}>🔌</div>
        <h3 style={{ color: '#fff', marginTop: '16px' }}>Server is busy</h3>
        <p style={{ color: '#666', marginTop: '8px', fontSize: '14px' }}>Please try again in a moment</p>
        <Btn onClick={onExit} style={{ marginTop: '24px' }}>Go Back</Btn>
      </div>
    </Center>
  )

  return (
    <div style={{ height: '100vh', background: '#000', position: 'relative', overflow: 'hidden' }}>

      {/* FULL SCREEN VIDEO */}
      <video ref={partnerVideoRef} autoPlay playsInline style={{
        position: 'absolute', inset: 0,
        width: '100%', height: '100%', objectFit: 'cover',
        filter: partnerFilter, transition: 'filter 0.15s ease'
      }} />

      {/* Dark gradient overlays — top and bottom */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '120px',
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)',
        zIndex: 2, pointerEvents: 'none'
      }} />
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '200px',
        background: 'linear-gradient(to top, rgba(0,0,0,0.85), transparent)',
        zIndex: 2, pointerEvents: 'none'
      }} />

      {/* TOP BAR */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px', zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            fontSize: '20px', fontWeight: '900',
            background: 'linear-gradient(90deg, #a78bfa, #60a5fa)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
          }}>miloo</span>
          {safeMode && (
            <span style={{
              fontSize: '10px', color: '#a78bfa',
              background: 'rgba(167,139,250,0.2)',
              padding: '2px 8px', borderRadius: '20px',
              border: '1px solid rgba(167,139,250,0.4)'
            }}>🛡️ Safe</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {status === 'connected' && (
            <span style={{
              fontSize: '11px',
              color: darkRoom ? '#c4b5fd' : '#86efac',
              background: 'rgba(0,0,0,0.4)',
              padding: '4px 12px', borderRadius: '20px',
              backdropFilter: 'blur(10px)',
              border: `1px solid ${darkRoom ? 'rgba(196,181,253,0.3)' : 'rgba(134,239,172,0.3)'}`
            }}>
              {darkRoom ? `🌑 ${countdown}s` : '● Live'}
            </span>
          )}
          <button onClick={onExit} style={{
            background: 'rgba(0,0,0,0.4)', color: '#ccc',
            padding: '5px 14px', borderRadius: '20px', backdropFilter: 'blur(10px)',
            fontSize: '12px', border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer'
          }}>Exit</button>
        </div>
      </div>

      {/* WELCOME CARD */}
      {showWelcome && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(20px)'
        }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(124,58,237,0.25), rgba(37,99,235,0.25))',
            border: '1px solid rgba(124,58,237,0.4)',
            borderRadius: '24px', padding: '32px', textAlign: 'center', maxWidth: '300px'
          }}>
            <div style={{ fontSize: '52px', marginBottom: '16px' }}>{safeMode ? '🛡️' : '🌑'}</div>
            <h3 style={{ color: '#fff', fontSize: '20px', fontWeight: '800', marginBottom: '12px' }}>
              {safeMode ? 'Safe Mode is ON!' : 'Dark Room Mode'}
            </h3>
            <p style={{ color: '#bbb', fontSize: '14px', lineHeight: 1.7 }}>
              {safeMode
                ? <>Your face is <span style={{ color: '#c4b5fd', fontWeight: '700' }}>hidden</span>. Tap <span style={{ color: '#93c5fd', fontWeight: '700' }}>Reveal</span> when ready. ✨</>
                : <>Talk first, see each other after. Face reveals in <span style={{ color: '#c4b5fd', fontWeight: '700' }}>60 seconds</span>. ✨</>
              }
            </p>
            <div style={{
              marginTop: '16px', padding: '8px 16px',
              background: 'rgba(124,58,237,0.2)', borderRadius: '50px',
              color: '#c4b5fd', fontSize: '12px'
            }}>Not a network issue — this is a feature! 😊</div>
          </div>
        </div>
      )}

      {/* WAITING SCREEN */}
      {(status === 'waiting' || status === 'slow_down' || status === 'partner_left' || status === 'connecting') && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 15,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(135deg, #0a0a0f, #12001f)', gap: '20px'
        }}>
          <div style={{
            width: '80px', height: '80px', borderRadius: '50%',
            background: 'rgba(124,58,237,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '36px'
          }}>
            {status === 'partner_left' ? '👋' : '🔍'}
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: '#fff', fontSize: '18px', fontWeight: '700' }}>
              {status === 'partner_left' ? 'They left the chat' : 'Finding your match...'}
            </p>
            <p style={{ color: '#555', fontSize: '13px', marginTop: '6px' }}>
              {status === 'partner_left' ? 'Hit Next to find someone new' : 'Looking for someone on the same vibe'}
            </p>
          </div>
          {status === 'partner_left' && <Btn onClick={findNext}>🔍 Find Someone New</Btn>}
        </div>
      )}

      {/* DARK ROOM VOICE INDICATOR */}
      {status === 'connected' && darkRoom && !showWelcome && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 8,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: '16px'
        }}>
          <div style={{ position: 'relative', width: '90px', height: '90px' }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                position: 'absolute', inset: 0, borderRadius: '50%',
                border: '2px solid rgba(124,58,237,0.5)',
                animation: `pulse ${1.2 + i * 0.4}s ease-out infinite`,
                animationDelay: `${i * 0.3}s`
              }} />
            ))}
            <div style={{
              position: 'absolute', inset: '18px', borderRadius: '50%',
              background: 'linear-gradient(135deg, #7c3aed, #2563eb)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px'
            }}>🎤</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: '#fff', fontSize: '16px', fontWeight: '700' }}>
              Voice only — Face reveals in {countdown}s
            </p>
            <p style={{ color: '#666', fontSize: '12px', marginTop: '4px' }}>Talk first, see each other after 👀</p>
          </div>
          <button onClick={skipDarkRoom} style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.15)',
            color: '#888', fontSize: '12px', padding: '6px 18px',
            borderRadius: '20px', cursor: 'pointer', backdropFilter: 'blur(10px)'
          }}>Reveal now →</button>
        </div>
      )}

      {/* FACE REVEAL TOAST */}
      {revealed && (
        <div style={{
          position: 'absolute', top: '70px', left: '50%',
          transform: 'translateX(-50%)', zIndex: 15,
          background: 'linear-gradient(90deg, #7c3aed, #2563eb)',
          padding: '10px 24px', borderRadius: '50px',
          fontSize: '14px', fontWeight: '700', color: '#fff',
          boxShadow: '0 4px 30px rgba(124,58,237,0.5)',
          animation: 'fadeOut 3s forwards'
        }}>✨ Face revealed! Say hi!</div>
      )}

      {/* CONVO STARTER */}
      {status === 'connected' && !darkRoom && starter && !revealed && (
        <div style={{
          position: 'absolute', top: '65px', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(12px)',
          padding: '8px 18px', borderRadius: '50px',
          fontSize: '13px', fontWeight: '600', color: '#fff', zIndex: 10,
          whiteSpace: 'nowrap', maxWidth: '85vw', overflow: 'hidden', textOverflow: 'ellipsis',
          border: '1px solid rgba(255,255,255,0.1)'
        }}>{starter}</div>
      )}

      {/* MY VIDEO — bottom right */}
      <div style={{
        position: 'absolute', bottom: '100px', right: '12px', zIndex: 10
      }}>
        <video ref={myVideoRef} autoPlay muted playsInline style={{
          width: '90px', height: '120px', objectFit: 'cover',
          borderRadius: '14px',
          border: `2px solid ${myBlur && !darkRoom ? 'rgba(196,181,253,0.7)' : camOff ? 'rgba(239,68,68,0.7)' : 'rgba(124,58,237,0.7)'}`,
          filter: myFilter, transition: 'all 0.3s ease',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)'
        }} />
        {safeMode && !darkRoom && (
          <button onClick={() => setMyBlur(!myBlur)} style={{
            position: 'absolute', bottom: '-10px', left: '50%', transform: 'translateX(-50%)',
            background: myBlur ? 'rgba(167,139,250,0.9)' : 'rgba(74,222,128,0.9)',
            color: '#fff', border: 'none', borderRadius: '50px',
            fontSize: '9px', fontWeight: '800', padding: '3px 10px',
            cursor: 'pointer', whiteSpace: 'nowrap'
          }}>
            {myBlur ? '👁 Reveal' : '🛡 Hide'}
          </button>
        )}
      </div>

      {/* FLOATING MESSAGES — video ke upar, bottom left */}
      {status === 'connected' && !darkRoom && visibleMessages.length > 0 && (
        <div style={{
          position: 'absolute', bottom: '100px', left: '12px',
          zIndex: 10, display: 'flex', flexDirection: 'column',
          gap: '6px', maxWidth: 'calc(100% - 120px)'
        }}>
          {visibleMessages.map((m, i) => (
            <div key={m.id || i} style={{
              display: 'inline-flex', alignItems: 'flex-start', gap: '6px',
              animation: 'msgPop 0.2s ease',
              opacity: i === visibleMessages.length - 1 ? 1 : 0.5 + (i * 0.15)
            }}>
              <span style={{
                fontSize: '10px', fontWeight: '800',
                color: m.from === 'me' ? '#c4b5fd' : '#93c5fd',
                marginTop: '2px', flexShrink: 0
              }}>
                {m.from === 'me' ? 'You' : 'Them'}
              </span>
              <div style={{
                background: 'rgba(0,0,0,0.55)',
                backdropFilter: 'blur(12px)',
                color: '#fff', padding: '6px 12px',
                borderRadius: m.from === 'me' ? '14px 14px 14px 4px' : '14px 14px 4px 14px',
                fontSize: '13px', lineHeight: 1.4,
                border: '1px solid rgba(255,255,255,0.08)',
                maxWidth: '200px', wordBreak: 'break-word'
              }}>
                {m.text}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* BOTTOM CONTROLS */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        zIndex: 10, padding: '12px 16px 20px'
      }}>
        {/* Chat input */}
        <div style={{
          display: 'flex', gap: '8px', marginBottom: '12px',
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(16px)',
          borderRadius: '50px', padding: '6px 6px 6px 16px',
          border: '1px solid rgba(255,255,255,0.1)'
        }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
            onFocus={() => { setChatFocused(true); setUnread(0) }}
            onBlur={() => setChatFocused(false)}
            placeholder={darkRoom ? '🌑 Voice only mode...' : 'Say something...'}
            style={{
              flex: 1, background: 'none', border: 'none',
              color: '#fff', fontSize: '14px', outline: 'none',
              '::placeholder': { color: '#666' }
            }}
          />
          {unread > 0 && (
            <span style={{
              background: '#ef4444', color: '#fff',
              borderRadius: '50px', padding: '2px 8px',
              fontSize: '11px', fontWeight: '800',
              alignSelf: 'center', flexShrink: 0
            }}>{unread} new</span>
          )}
          <button onClick={sendMessage} style={{
            background: input.trim() ? 'linear-gradient(90deg, #7c3aed, #2563eb)' : 'rgba(255,255,255,0.1)',
            color: '#fff', border: 'none', borderRadius: '50%',
            width: '36px', height: '36px', fontSize: '16px',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.2s', flexShrink: 0
          }}>↑</button>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <GlassBtn onClick={toggleMute} active={muted} activeColor="rgba(239,68,68,0.4)">
              {muted ? '🔇' : '🎤'}
            </GlassBtn>
            <GlassBtn onClick={toggleCam} active={camOff} activeColor="rgba(239,68,68,0.4)">
              {camOff ? '📵' : '📹'}
            </GlassBtn>
            <GlassBtn onClick={() => socketRef.current?.emit('report_user')}>
              🚩
            </GlassBtn>
            <GlassBtn
              onClick={() => { socketRef.current?.emit('good_convo'); setGoodSent(true) }}
              active={goodSent} activeColor="rgba(74,222,128,0.3)">
              {goodSent ? '✅' : '👍'}
            </GlassBtn>
          </div>

          <button onClick={findNext} style={{
            background: 'linear-gradient(90deg, #7c3aed, #2563eb)',
            color: '#fff', border: 'none', borderRadius: '50px',
            padding: '10px 22px', fontSize: '14px', fontWeight: '700',
            cursor: 'pointer', boxShadow: '0 4px 15px rgba(124,58,237,0.4)'
          }}>Next ⏭</button>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0% { transform: scale(1); opacity: 0.8; }
          100% { transform: scale(2.5); opacity: 0; }
        }
        @keyframes fadeOut {
          0% { opacity: 1; }
          70% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes msgPop {
          from { transform: translateY(8px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        input::placeholder { color: #555; }
      `}</style>
    </div>
  )
}

function Center({ children }) {
  return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0f' }}>{children}</div>
}

function Btn({ children, onClick, style = {} }) {
  return (
    <button onClick={onClick} style={{
      background: 'linear-gradient(90deg, #7c3aed, #2563eb)', color: '#fff',
      padding: '10px 20px', borderRadius: '50px', fontSize: '14px',
      fontWeight: '600', border: 'none', cursor: 'pointer', ...style
    }}>{children}</button>
  )
}

function GlassBtn({ children, onClick, active, activeColor }) {
  return (
    <button onClick={onClick} style={{
      background: active ? activeColor : 'rgba(0,0,0,0.45)',
      color: '#fff', width: '40px', height: '40px', borderRadius: '50%',
      fontSize: '17px', border: '1px solid rgba(255,255,255,0.12)',
      cursor: 'pointer', backdropFilter: 'blur(10px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'all 0.2s'
    }}>{children}</button>
  )
}
