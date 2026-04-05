import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'

const SERVER = 'https://rcapp-server.onrender.com'

const iceConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]
}

export default function ChatRoom({ mood, onExit }) {
  const [status, setStatus] = useState('connecting')
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [starter, setStarter] = useState('')
  const [goodSent, setGoodSent] = useState(false)

  // Dark Room Mode states
  const [darkRoom, setDarkRoom] = useState(true)      // starts in dark mode
  const [countdown, setCountdown] = useState(60)       // 60 sec countdown
  const [revealed, setRevealed] = useState(false)      // face revealed?
  const [blur, setBlur] = useState(20)                 // blur amount

  const socketRef = useRef(null)
  const pcRef = useRef(null)
  const myVideoRef = useRef(null)
  const partnerVideoRef = useRef(null)
  const myStreamRef = useRef(null)
  const partnerIdRef = useRef(null)
  const messagesEndRef = useRef(null)
  const countdownRef = useRef(null)
  const blurRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ─── Dark Room Timer ───
  function startDarkRoomTimer() {
    setDarkRoom(true)
    setRevealed(false)
    setBlur(20)
    setCountdown(60)

    // Countdown
    let timeLeft = 60
    countdownRef.current = setInterval(() => {
      timeLeft -= 1
      setCountdown(timeLeft)
      if (timeLeft <= 0) {
        clearInterval(countdownRef.current)
        startReveal()
      }
    }, 1000)
  }

  function startReveal() {
    // Slowly reduce blur over 3 seconds
    let currentBlur = 20
    blurRef.current = setInterval(() => {
      currentBlur -= 1
      setBlur(currentBlur)
      if (currentBlur <= 0) {
        clearInterval(blurRef.current)
        setDarkRoom(false)
        setRevealed(true)
      }
    }, 150)
  }

  function skipDarkRoom() {
    clearInterval(countdownRef.current)
    clearInterval(blurRef.current)
    setCountdown(0)
    startReveal()
  }

  function resetDarkRoom() {
    clearInterval(countdownRef.current)
    clearInterval(blurRef.current)
    setDarkRoom(true)
    setRevealed(false)
    setBlur(20)
    setCountdown(60)
  }

  useEffect(() => {
    let socket

    const init = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        myStreamRef.current = stream
        if (myVideoRef.current) myVideoRef.current.srcObject = stream
      } catch {
        setStatus('cam_error')
        return
      }

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
        setStarter(s)
        setStatus('connected')
        setMessages([])
        setGoodSent(false)
        startDarkRoomTimer()
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
        setMessages(prev => [...prev, { from: 'them', text: message }])
      })

      socket.on('message_blocked', () => {
        setMessages(prev => [...prev, { from: 'system', text: '🚫 Links allowed nahi hain' }])
      })

      socket.on('partner_left', () => {
        setStatus('partner_left')
        clearInterval(countdownRef.current)
        clearInterval(blurRef.current)
        pcRef.current?.close()
        if (partnerVideoRef.current) partnerVideoRef.current.srcObject = null
      })

      socket.on('report_received', () => {
        setMessages(prev => [...prev, { from: 'system', text: '✅ Report submit ho gayi' }])
      })
    }

    init()

    return () => {
      clearInterval(countdownRef.current)
      clearInterval(blurRef.current)
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
    socketRef.current.emit('send_message', { message: input, to: partnerIdRef.current })
    setMessages(prev => [...prev, { from: 'me', text: input }])
    setInput('')
  }

  function findNext() {
    clearInterval(countdownRef.current)
    clearInterval(blurRef.current)
    pcRef.current?.close()
    if (partnerVideoRef.current) partnerVideoRef.current.srcObject = null
    setStatus('waiting')
    setMessages([])
    setStarter('')
    resetDarkRoom()
    socketRef.current.emit('find_match', { mood })
  }

  if (status === 'cam_error') return (
    <Center>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '48px' }}>📷</div>
        <h3 style={{ marginTop: '16px', color: '#fff' }}>Camera access do</h3>
        <p style={{ color: '#666', marginTop: '8px', fontSize: '14px' }}>Browser settings mein camera allow karo</p>
        <Btn onClick={onExit} style={{ marginTop: '24px' }}>Wapas Jao</Btn>
      </div>
    </Center>
  )

  if (status === 'busy') return (
    <Center>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '48px' }}>🔌</div>
        <h3 style={{ marginTop: '16px', color: '#fff' }}>Server thoda busy hai</h3>
        <p style={{ color: '#666', marginTop: '8px', fontSize: '14px' }}>Thodi der mein try karo</p>
        <Btn onClick={onExit} style={{ marginTop: '24px' }}>Wapas Jao</Btn>
      </div>
    </Center>
  )

  return (
    <div style={{
      height: '100vh',
      display: 'flex', flexDirection: 'column',
      background: '#0a0a0f'
    }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px',
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)',
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10
      }}>
        <span style={{
          fontSize: '18px', fontWeight: '900', letterSpacing: '-0.5px',
          background: 'linear-gradient(90deg, #a78bfa, #60a5fa)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
        }}>miloo</span>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* Dark room indicator */}
          {status === 'connected' && darkRoom && (
            <span style={{
              fontSize: '11px', color: '#a78bfa',
              background: 'rgba(124,58,237,0.15)',
              padding: '3px 10px', borderRadius: '20px',
              border: '1px solid rgba(124,58,237,0.3)'
            }}>
              🌑 Dark Room
            </span>
          )}
          {status === 'connected' && revealed && (
            <span style={{
              fontSize: '11px', color: '#4ade80',
              background: 'rgba(74,222,128,0.1)',
              padding: '3px 10px', borderRadius: '20px',
              border: '1px solid rgba(74,222,128,0.3)'
            }}>
              ● Connected
            </span>
          )}
          <button onClick={onExit} style={{
            background: 'rgba(255,255,255,0.05)', color: '#888',
            padding: '4px 12px', borderRadius: '20px', fontSize: '12px',
            border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer'
          }}>Exit</button>
        </div>
      </div>

      {/* Video area */}
      <div style={{ flex: 1, position: 'relative', background: '#0a0a0f' }}>

        {/* Partner video with blur effect */}
        <video ref={partnerVideoRef} autoPlay playsInline
          style={{
            width: '100%', height: '100%', objectFit: 'cover',
            filter: darkRoom ? `blur(${blur}px) brightness(0.4)` : 'none',
            transition: 'filter 0.15s ease'
          }}
        />

        {/* Waiting overlay */}
        {(status === 'waiting' || status === 'slow_down' || status === 'partner_left' || status === 'connecting') && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, #0a0a0f, #12001f)', gap: '20px'
          }}>
            <div style={{
              width: '80px', height: '80px', borderRadius: '50%',
              background: 'rgba(124,58,237,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '36px', boxShadow: '0 0 40px rgba(124,58,237,0.2)'
            }}>
              {status === 'partner_left' ? '👋' : '🔍'}
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: '#fff', fontSize: '18px', fontWeight: '700' }}>
                {status === 'partner_left' ? 'Partner chala gaya' : 'Match dhundh rahe hain...'}
              </p>
              <p style={{ color: '#555', fontSize: '13px', marginTop: '6px' }}>
                {status === 'partner_left' ? 'Next dabao naya milne ke liye' : 'Same vibe waala dhundh rahe hain'}
              </p>
            </div>
            {status === 'partner_left' && <Btn onClick={findNext}>🔍 Naya Match</Btn>}
          </div>
        )}

        {/* Dark Room Overlay — Voice only phase */}
        {status === 'connected' && darkRoom && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: '16px', zIndex: 5,
            background: 'rgba(0,0,0,0.5)'
          }}>
            {/* Animated sound waves */}
            <div style={{ position: 'relative', width: '80px', height: '80px' }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  position: 'absolute', inset: 0, borderRadius: '50%',
                  border: '2px solid rgba(124,58,237,0.4)',
                  animation: `ping ${1 + i * 0.3}s ease-out infinite`,
                  animationDelay: `${i * 0.2}s`
                }} />
              ))}
              <div style={{
                position: 'absolute', inset: '20px', borderRadius: '50%',
                background: 'linear-gradient(135deg, #7c3aed, #2563eb)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '20px'
              }}>🎤</div>
            </div>

            <div style={{ textAlign: 'center' }}>
              <p style={{ color: '#fff', fontSize: '16px', fontWeight: '700' }}>
                🌑 Dark Room Mode
              </p>
              <p style={{ color: '#888', fontSize: '13px', marginTop: '4px' }}>
                Pehle baat karo, phir face dekhna
              </p>
            </div>

            {/* Countdown ring */}
            <div style={{
              background: 'rgba(124,58,237,0.15)',
              border: '1px solid rgba(124,58,237,0.3)',
              borderRadius: '50px', padding: '8px 24px',
              textAlign: 'center'
            }}>
              <span style={{ color: '#a78bfa', fontSize: '13px', fontWeight: '600' }}>
                {countdown > 0 ? `${countdown}s mein face reveal hoga ✨` : 'Revealing...'}
              </span>
            </div>

            <button onClick={skipDarkRoom} style={{
              background: 'none', color: '#555', fontSize: '12px',
              textDecoration: 'underline', cursor: 'pointer', border: 'none'
            }}>
              Skip karo — abhi dekhna hai
            </button>
          </div>
        )}

        {/* Face reveal animation */}
        {status === 'connected' && revealed && (
          <div style={{
            position: 'absolute', top: '60px', left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(124,58,237,0.85)',
            backdropFilter: 'blur(10px)',
            padding: '8px 18px', borderRadius: '50px',
            fontSize: '13px', fontWeight: '600', color: '#fff',
            animation: 'fadeOut 3s forwards'
          }}>
            ✨ Face reveal! Namaste!
          </div>
        )}

        {/* Convo starter */}
        {status === 'connected' && !darkRoom && starter && (
          <div style={{
            position: 'absolute', top: '60px', left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(10px)',
            padding: '8px 18px', borderRadius: '50px',
            fontSize: '13px', fontWeight: '600', color: '#fff',
            whiteSpace: 'nowrap', maxWidth: '90vw',
            overflow: 'hidden', textOverflow: 'ellipsis'
          }}>
            {starter}
          </div>
        )}

        {/* My video — also blurred in dark room */}
        <video ref={myVideoRef} autoPlay muted playsInline style={{
          position: 'absolute', bottom: '16px', right: '12px',
          width: '90px', height: '120px', objectFit: 'cover',
          borderRadius: '12px',
          border: '2px solid rgba(124,58,237,0.6)',
          filter: darkRoom ? 'blur(8px) brightness(0.5)' : 'none',
          transition: 'filter 0.3s ease',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
        }} />
      </div>

      {/* Bottom panel */}
      <div style={{
        display: 'flex', flexDirection: 'column',
        background: 'rgba(10,10,15,0.97)',
        backdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(255,255,255,0.06)'
      }}>
        {/* Action bar */}
        <div style={{
          display: 'flex', gap: '6px', padding: '8px 12px',
          justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            <ActionBtn onClick={() => socketRef.current?.emit('report_user')} color="#f87171">🚩</ActionBtn>
            <ActionBtn
              onClick={() => { socketRef.current?.emit('good_convo'); setGoodSent(true) }}
              color={goodSent ? '#4ade80' : '#888'}
              bg={goodSent ? 'rgba(74,222,128,0.1)' : undefined}
            >
              {goodSent ? '✅' : '👍'}
            </ActionBtn>
          </div>
          <Btn onClick={findNext} style={{ padding: '7px 20px', fontSize: '13px' }}>⏭ Next</Btn>
        </div>

        {/* Messages */}
        <div style={{
          height: '120px', overflowY: 'auto',
          padding: '4px 12px', display: 'flex',
          flexDirection: 'column', gap: '4px'
        }}>
          {messages.length === 0 && status === 'connected' && (
            <p style={{ color: '#333', fontSize: '12px', textAlign: 'center', marginTop: '8px' }}>
              {darkRoom ? '🌑 Voice se baat karo pehle...' : 'Conversation shuru karo! 👋'}
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{
              alignSelf: m.from === 'me' ? 'flex-end' : m.from === 'system' ? 'center' : 'flex-start',
              background: m.from === 'me' ? 'linear-gradient(90deg,#7c3aed,#2563eb)' : m.from === 'system' ? 'transparent' : 'rgba(255,255,255,0.07)',
              color: m.from === 'system' ? '#555' : '#fff',
              padding: m.from === 'system' ? '2px 0' : '6px 12px',
              borderRadius: '14px', fontSize: '13px', maxWidth: '75%'
            }}>{m.text}</div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div style={{ display: 'flex', gap: '8px', padding: '8px 12px 16px' }}>
          <input value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
            placeholder={darkRoom ? "🌑 Voice mode..." : "Message likho..."}
            style={{
              flex: 1, background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '50px', padding: '9px 16px',
              color: '#fff', fontSize: '14px', outline: 'none'
            }} />
          <Btn onClick={sendMessage} style={{ padding: '9px 16px', fontSize: '13px' }}>↑</Btn>
        </div>
      </div>

      <style>{`
        @keyframes ping {
          0% { transform: scale(1); opacity: 1; }
          100% { transform: scale(2); opacity: 0; }
        }
        @keyframes fadeOut {
          0% { opacity: 1; }
          70% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  )
}

function Center({ children }) {
  return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#0a0a0f'
    }}>{children}</div>
  )
}

function Btn({ children, onClick, style = {}, disabled = false }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: 'linear-gradient(90deg, #7c3aed, #2563eb)',
      color: '#fff', padding: '10px 20px', borderRadius: '50px',
      fontSize: '14px', fontWeight: '600',
      opacity: disabled ? 0.5 : 1, border: 'none', cursor: 'pointer', ...style
    }}>{children}</button>
  )
}

function ActionBtn({ children, onClick, color = '#888', bg }) {
  return (
    <button onClick={onClick} style={{
      background: bg || 'rgba(255,255,255,0.05)',
      color, width: '34px', height: '34px', borderRadius: '50%',
      fontSize: '14px', border: '1px solid rgba(255,255,255,0.08)',
      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>{children}</button>
  )
}
