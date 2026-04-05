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
  const [showChat, setShowChat] = useState(true)

  const socketRef = useRef(null)
  const pcRef = useRef(null)
  const myVideoRef = useRef(null)
  const partnerVideoRef = useRef(null)
  const myStreamRef = useRef(null)
  const partnerIdRef = useRef(null)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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
        pcRef.current?.close()
        if (partnerVideoRef.current) partnerVideoRef.current.srcObject = null
      })

      socket.on('report_received', () => {
        setMessages(prev => [...prev, { from: 'system', text: '✅ Report submit ho gayi' }])
      })
    }

    init()

    return () => {
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
    pcRef.current?.close()
    if (partnerVideoRef.current) partnerVideoRef.current.srcObject = null
    setStatus('waiting')
    setMessages([])
    setStarter('')
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
      height: '100vh', height: '-webkit-fill-available',
      display: 'flex', flexDirection: 'column',
      background: '#0a0a0f', position: 'relative'
    }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px',
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(10px)',
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10
      }}>
        <span style={{
          fontSize: '18px', fontWeight: '900', letterSpacing: '-0.5px',
          background: 'linear-gradient(90deg, #a78bfa, #60a5fa)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
        }}>miloo</span>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{
            fontSize: '11px', color: status === 'connected' ? '#4ade80' : '#f59e0b',
            background: status === 'connected' ? 'rgba(74,222,128,0.1)' : 'rgba(245,158,11,0.1)',
            padding: '3px 10px', borderRadius: '20px',
            border: `1px solid ${status === 'connected' ? 'rgba(74,222,128,0.3)' : 'rgba(245,158,11,0.3)'}`
          }}>
            {status === 'connected' ? '● Connected' : status === 'waiting' ? '● Searching...' : status === 'partner_left' ? '● Left' : '● ...'}
          </span>
          <button onClick={onExit} style={{
            background: 'rgba(255,255,255,0.05)', color: '#888',
            padding: '4px 12px', borderRadius: '20px', fontSize: '12px',
            border: '1px solid rgba(255,255,255,0.1)'
          }}>Exit</button>
        </div>
      </div>

      {/* Video area */}
      <div style={{ flex: 1, position: 'relative', background: '#0a0a0f' }}>
        <video ref={partnerVideoRef} autoPlay playsInline
          style={{ width: '100%', height: '100%', objectFit: 'cover' }} />

        {/* Overlay states */}
        {(status === 'waiting' || status === 'slow_down' || status === 'partner_left' || status === 'connecting') && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, #0a0a0f, #12001f)',
            gap: '20px'
          }}>
            <div style={{
              width: '80px', height: '80px', borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(124,58,237,0.3), rgba(37,99,235,0.3))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '36px',
              boxShadow: '0 0 40px rgba(124,58,237,0.2)'
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

        {/* Convo starter */}
        {status === 'connected' && starter && (
          <div style={{
            position: 'absolute', top: '60px', left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(124,58,237,0.85)', backdropFilter: 'blur(10px)',
            padding: '8px 18px', borderRadius: '50px',
            fontSize: '13px', fontWeight: '600', color: '#fff',
            whiteSpace: 'nowrap', maxWidth: '90vw', overflow: 'hidden', textOverflow: 'ellipsis'
          }}>
            {starter}
          </div>
        )}

        {/* My video */}
        <video ref={myVideoRef} autoPlay muted playsInline style={{
          position: 'absolute', bottom: '16px', right: '12px',
          width: '90px', height: '120px', objectFit: 'cover',
          borderRadius: '12px', border: '2px solid rgba(124,58,237,0.6)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
        }} />
      </div>

      {/* Chat toggle button (mobile) */}
      <button onClick={() => setShowChat(!showChat)} style={{
        position: 'absolute', bottom: showChat ? '285px' : '16px', right: '12px',
        background: 'rgba(124,58,237,0.8)', backdropFilter: 'blur(10px)',
        color: '#fff', width: '36px', height: '36px', borderRadius: '50%',
        fontSize: '16px', zIndex: 20, transition: 'bottom 0.3s',
        display: 'none'
      }} id="chat-toggle">💬</button>

      {/* Bottom chat panel */}
      <div style={{
        height: showChat ? '260px' : '60px',
        display: 'flex', flexDirection: 'column',
        background: 'rgba(10,10,15,0.95)', backdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        transition: 'height 0.3s ease'
      }}>
        {/* Action bar */}
        <div style={{
          display: 'flex', gap: '6px', padding: '8px 12px',
          justifyContent: 'space-between', alignItems: 'center',
          borderBottom: '1px solid rgba(255,255,255,0.05)'
        }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            <ActionBtn onClick={() => socketRef.current?.emit('report_user')} color="#f87171">
              🚩
            </ActionBtn>
            <ActionBtn
              onClick={() => { socketRef.current?.emit('good_convo'); setGoodSent(true) }}
              color={goodSent ? '#4ade80' : '#888'}
              bg={goodSent ? 'rgba(74,222,128,0.1)' : undefined}
            >
              {goodSent ? '✅' : '👍'}
            </ActionBtn>
          </div>

          <Btn onClick={findNext} style={{ padding: '7px 20px', fontSize: '13px' }}>
            ⏭ Next
          </Btn>
        </div>

        {showChat && (
          <>
            {/* Messages */}
            <div style={{
              flex: 1, overflowY: 'auto', padding: '8px 12px',
              display: 'flex', flexDirection: 'column', gap: '5px'
            }}>
              {messages.length === 0 && status === 'connected' && (
                <p style={{ color: '#333', fontSize: '12px', textAlign: 'center', marginTop: '8px' }}>
                  Conversation shuru karo! 👋
                </p>
              )}
              {messages.map((m, i) => (
                <div key={i} style={{
                  alignSelf: m.from === 'me' ? 'flex-end' : m.from === 'system' ? 'center' : 'flex-start',
                  background: m.from === 'me' ? 'linear-gradient(90deg,#7c3aed,#2563eb)' : m.from === 'system' ? 'transparent' : 'rgba(255,255,255,0.07)',
                  color: m.from === 'system' ? '#555' : '#fff',
                  padding: m.from === 'system' ? '2px 0' : '7px 12px',
                  borderRadius: '14px', fontSize: '13px', maxWidth: '75%'
                }}>{m.text}</div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div style={{
              display: 'flex', gap: '8px', padding: '8px 12px 12px'
            }}>
              <input value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMessage()}
                placeholder="Message likhو..."
                style={{
                  flex: 1, background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '50px', padding: '9px 16px',
                  color: '#fff', fontSize: '14px', outline: 'none'
                }} />
              <Btn onClick={sendMessage} style={{ padding: '9px 16px', fontSize: '13px' }}>↑</Btn>
            </div>
          </>
        )}
      </div>
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
