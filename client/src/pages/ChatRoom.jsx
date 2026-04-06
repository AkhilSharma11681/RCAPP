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
  const [darkRoom, setDarkRoom] = useState(true)
  const [countdown, setCountdown] = useState(60)
  const [revealed, setRevealed] = useState(false)
  const [blur, setBlur] = useState(20)
  const [muted, setMuted] = useState(false)
  const [camOff, setCamOff] = useState(false)
  const [showWelcome, setShowWelcome] = useState(false)

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

  function startDarkRoomTimer() {
    setDarkRoom(true)
    setRevealed(false)
    setBlur(20)
    setCountdown(60)
    setShowWelcome(true)
    setTimeout(() => setShowWelcome(false), 3000)

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
    let currentBlur = 20
    blurRef.current = setInterval(() => {
      currentBlur -= 1
      setBlur(currentBlur)
      if (currentBlur <= 0) {
        clearInterval(blurRef.current)
        setDarkRoom(false)
        setRevealed(true)
        setTimeout(() => setRevealed(false), 3000)
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
    setShowWelcome(false)
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
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#0a0a0f' }}>

      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px', background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(10px)', position: 'absolute',
        top: 0, left: 0, right: 0, zIndex: 20
      }}>
        <span style={{
          fontSize: '18px', fontWeight: '900',
          background: 'linear-gradient(90deg, #a78bfa, #60a5fa)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
        }}>miloo</span>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {status === 'connected' && (
            <span style={{
              fontSize: '11px',
              color: darkRoom ? '#a78bfa' : '#4ade80',
              background: darkRoom ? 'rgba(124,58,237,0.15)' : 'rgba(74,222,128,0.1)',
              padding: '3px 10px', borderRadius: '20px',
              border: `1px solid ${darkRoom ? 'rgba(124,58,237,0.3)' : 'rgba(74,222,128,0.3)'}`
            }}>
              {darkRoom ? `🌑 Dark Room • ${countdown}s` : '● Live'}
            </span>
          )}
          <button onClick={onExit} style={{
            background: 'rgba(255,255,255,0.05)', color: '#888',
            padding: '4px 12px', borderRadius: '20px',
            fontSize: '12px', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer'
          }}>Exit</button>
        </div>
      </div>

      {/* Video */}
      <div style={{ flex: 1, position: 'relative', background: '#0a0a0f' }}>
        <video ref={partnerVideoRef} autoPlay playsInline style={{
          width: '100%', height: '100%', objectFit: 'cover',
          filter: darkRoom ? `blur(${blur}px) brightness(0.3)` : 'none',
          transition: 'filter 0.15s ease'
        }} />

        {/* Welcome card — clearly explains Dark Room */}
        {showWelcome && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 15,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(20px)'
          }}>
            <div style={{
              background: 'linear-gradient(135deg, rgba(124,58,237,0.3), rgba(37,99,235,0.3))',
              border: '1px solid rgba(124,58,237,0.4)',
              borderRadius: '24px', padding: '32px', textAlign: 'center',
              maxWidth: '300px'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>🌑</div>
              <h3 style={{ color: '#fff', fontSize: '20px', fontWeight: '800', marginBottom: '8px' }}>
                Dark Room Mode
              </h3>
              <p style={{ color: '#aaa', fontSize: '14px', lineHeight: 1.6 }}>
                Ye intentional hai! Pehle <strong style={{ color: '#a78bfa' }}>sirf voice</strong> se baat karo.<br />
                60 seconds baad <strong style={{ color: '#60a5fa' }}>face reveal</strong> hoga. ✨
              </p>
              <div style={{
                marginTop: '16px', padding: '8px 16px',
                background: 'rgba(124,58,237,0.2)', borderRadius: '50px',
                color: '#a78bfa', fontSize: '13px'
              }}>
                Network issue nahi hai — ye feature hai! 😊
              </div>
            </div>
          </div>
        )}

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

        {/* Dark room voice indicator */}
        {status === 'connected' && darkRoom && !showWelcome && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 5,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: '20px'
          }}>
            {/* Pulse rings */}
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
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '22px'
              }}>🎤</div>
            </div>

            <div style={{ textAlign: 'center' }}>
              <p style={{ color: '#fff', fontSize: '15px', fontWeight: '700' }}>
                Sirf voice — Face {countdown}s mein reveal hoga
              </p>
              <p style={{ color: '#666', fontSize: '12px', marginTop: '4px' }}>
                Pehle baat karo, phir dekhna 👀
              </p>
            </div>

            <button onClick={skipDarkRoom} style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#666', fontSize: '12px', padding: '6px 16px',
              borderRadius: '20px', cursor: 'pointer'
            }}>
              Abhi reveal karo →
            </button>
          </div>
        )}

        {/* Face reveal toast */}
        {revealed && (
          <div style={{
            position: 'absolute', top: '70px', left: '50%',
            transform: 'translateX(-50%)', zIndex: 15,
            background: 'linear-gradient(90deg, #7c3aed, #2563eb)',
            padding: '10px 24px', borderRadius: '50px',
            fontSize: '14px', fontWeight: '700', color: '#fff',
            boxShadow: '0 4px 20px rgba(124,58,237,0.4)',
            animation: 'fadeOut 3s forwards'
          }}>
            ✨ Face reveal! Namaste!
          </div>
        )}

        {/* Convo starter */}
        {status === 'connected' && !darkRoom && starter && !revealed && (
          <div style={{
            position: 'absolute', top: '60px', left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(10px)',
            padding: '8px 18px', borderRadius: '50px',
            fontSize: '13px', fontWeight: '600', color: '#fff',
            whiteSpace: 'nowrap', maxWidth: '90vw',
            overflow: 'hidden', textOverflow: 'ellipsis'
          }}>
            {starter}
          </div>
        )}

        {/* My video */}
        <video ref={myVideoRef} autoPlay muted playsInline style={{
          position: 'absolute', bottom: '16px', right: '12px',
          width: '90px', height: '120px', objectFit: 'cover',
          borderRadius: '12px',
          border: `2px solid ${camOff ? 'rgba(239,68,68,0.6)' : 'rgba(124,58,237,0.6)'}`,
          filter: darkRoom ? 'blur(8px) brightness(0.4)' : camOff ? 'brightness(0.2)' : 'none',
          transition: 'all 0.3s ease',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
        }} />

        {/* Cam off indicator */}
        {camOff && (
          <div style={{
            position: 'absolute', bottom: '72px', right: '12px',
            background: 'rgba(239,68,68,0.8)', borderRadius: '50px',
            padding: '2px 8px', fontSize: '10px', color: '#fff', zIndex: 10
          }}>cam off</div>
        )}
      </div>

      {/* Bottom panel */}
      <div style={{
        display: 'flex', flexDirection: 'column',
        background: 'rgba(10,10,15,0.97)',
        backdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(255,255,255,0.06)'
      }}>
        {/* Controls */}
        <div style={{
          display: 'flex', gap: '6px', padding: '8px 12px',
          justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            {/* Mute */}
            <ActionBtn onClick={toggleMute}
              color={muted ? '#f87171' : '#888'}
              bg={muted ? 'rgba(239,68,68,0.15)' : undefined}>
              {muted ? '🔇' : '🎤'}
            </ActionBtn>
            {/* Cam */}
            <ActionBtn onClick={toggleCam}
              color={camOff ? '#f87171' : '#888'}
              bg={camOff ? 'rgba(239,68,68,0.15)' : undefined}>
              {camOff ? '📵' : '📹'}
            </ActionBtn>
            {/* Report */}
            <ActionBtn onClick={() => socketRef.current?.emit('report_user')} color="#f87171">
              🚩
            </ActionBtn>
            {/* Good */}
            <ActionBtn
              onClick={() => { socketRef.current?.emit('good_convo'); setGoodSent(true) }}
              color={goodSent ? '#4ade80' : '#888'}
              bg={goodSent ? 'rgba(74,222,128,0.1)' : undefined}>
              {goodSent ? '✅' : '👍'}
            </ActionBtn>
          </div>
          <Btn onClick={findNext} style={{ padding: '7px 20px', fontSize: '13px' }}>⏭ Next</Btn>
        </div>

        {/* Messages */}
        <div style={{
          height: '100px', overflowY: 'auto',
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
            placeholder={darkRoom ? '🌑 Voice mode mein ho...' : 'Message likho...'}
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
        @keyframes pulse {
          0% { transform: scale(1); opacity: 0.8; }
          100% { transform: scale(2.5); opacity: 0; }
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
      color, width: '36px', height: '36px', borderRadius: '50%',
      fontSize: '16px', border: '1px solid rgba(255,255,255,0.08)',
      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>{children}</button>
  )
}
