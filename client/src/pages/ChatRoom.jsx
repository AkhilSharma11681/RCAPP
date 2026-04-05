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

      socket.on('connect', () => {
        setStatus('waiting')
        socket.emit('find_match', { mood })
      })

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

    myStreamRef.current?.getTracks().forEach(track => {
      pc.addTrack(track, myStreamRef.current)
    })

    pc.ontrack = (e) => {
      if (partnerVideoRef.current) partnerVideoRef.current.srcObject = e.streams[0]
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) socket.emit('ice_candidate', { candidate: e.candidate, to: partnerId })
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

  function sendGood() {
    socketRef.current?.emit('good_convo')
    setGoodSent(true)
  }

  function reportUser() {
    socketRef.current?.emit('report_user')
  }

  if (status === 'cam_error') return (
    <Center>
      <div style={{ textAlign: 'center', color: '#fff' }}>
        <div style={{ fontSize: '48px' }}>📷</div>
        <h3 style={{ marginTop: '16px' }}>Camera access do</h3>
        <p style={{ color: '#666', marginTop: '8px' }}>Browser mein camera allow karo</p>
        <Btn onClick={onExit} style={{ marginTop: '24px' }}>Wapas Jao</Btn>
      </div>
    </Center>
  )

  if (status === 'busy') return (
    <Center>
      <div style={{ textAlign: 'center', color: '#fff' }}>
        <div style={{ fontSize: '48px' }}>🔌</div>
        <h3 style={{ marginTop: '16px' }}>Server thoda busy hai</h3>
        <p style={{ color: '#666', marginTop: '8px' }}>Thodi der mein try karo</p>
        <Btn onClick={onExit} style={{ marginTop: '24px' }}>Wapas Jao</Btn>
      </div>
    </Center>
  )

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#0f0f0f' }}>
      <div style={{ flex: 1, position: 'relative', background: '#111' }}>
        <video ref={partnerVideoRef} autoPlay playsInline
          style={{ width: '100%', height: '100%', objectFit: 'cover' }} />

        {(status === 'waiting' || status === 'slow_down' || status === 'partner_left') && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.85)', gap: '16px'
          }}>
            <div style={{ fontSize: '40px' }}>{status === 'partner_left' ? '👋' : '🔍'}</div>
            <p style={{ color: '#fff', fontSize: '18px', fontWeight: '600' }}>
              {status === 'partner_left' ? 'Partner chala gaya' : 'Match dhundh rahe hain...'}
            </p>
            {status === 'partner_left' && <Btn onClick={findNext}>Naya Match Dhundo</Btn>}
            {status === 'slow_down' && <p style={{ color: '#888', fontSize: '14px' }}>Thodi der ruko...</p>}
          </div>
        )}

        {status === 'connected' && starter && (
          <div style={{
            position: 'absolute', top: '16px', left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(124,58,237,0.9)', padding: '10px 20px', borderRadius: '50px',
            fontSize: '14px', fontWeight: '600', color: '#fff', whiteSpace: 'nowrap'
          }}>
            {starter}
          </div>
        )}

        <video ref={myVideoRef} autoPlay muted playsInline style={{
          position: 'absolute', bottom: '16px', right: '16px',
          width: '120px', height: '90px', objectFit: 'cover',
          borderRadius: '12px', border: '2px solid #7c3aed'
        }} />
      </div>

      <div style={{ height: '280px', display: 'flex', flexDirection: 'column', background: '#111', borderTop: '1px solid #222' }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {messages.map((m, i) => (
            <div key={i} style={{
              alignSelf: m.from === 'me' ? 'flex-end' : m.from === 'system' ? 'center' : 'flex-start',
              background: m.from === 'me' ? '#7c3aed' : m.from === 'system' ? 'transparent' : '#1e1e1e',
              color: m.from === 'system' ? '#666' : '#fff',
              padding: m.from === 'system' ? '0' : '8px 14px',
              borderRadius: '18px', fontSize: '14px', maxWidth: '70%'
            }}>{m.text}</div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div style={{ display: 'flex', gap: '8px', padding: '8px 12px', borderTop: '1px solid #1a1a1a' }}>
          <input value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
            placeholder="Message..."
            style={{
              flex: 1, background: '#1a1a1a', border: '1px solid #2a2a2a',
              borderRadius: '50px', padding: '10px 16px', color: '#fff', fontSize: '14px', outline: 'none'
            }} />
          <Btn onClick={sendMessage} style={{ padding: '10px 16px', fontSize: '13px' }}>Send</Btn>
        </div>

        <div style={{ display: 'flex', gap: '8px', padding: '8px 12px 12px', justifyContent: 'space-between' }}>
          <button onClick={onExit} style={{ background: '#1a1a1a', color: '#888', padding: '8px 16px', borderRadius: '50px', fontSize: '13px' }}>← Exit</button>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={reportUser} style={{ background: '#1a1a1a', color: '#f87171', padding: '8px 14px', borderRadius: '50px', fontSize: '13px' }}>🚩 Report</button>
            <button onClick={sendGood} disabled={goodSent} style={{
              background: goodSent ? '#166534' : '#1a1a1a', color: goodSent ? '#4ade80' : '#888',
              padding: '8px 14px', borderRadius: '50px', fontSize: '13px'
            }}>{goodSent ? '✅ Good!' : '👍 Good Convo'}</button>
            <Btn onClick={findNext}>⏭ Next</Btn>
          </div>
        </div>
      </div>
    </div>
  )
}

function Center({ children }) {
  return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f0f0f' }}>{children}</div>
}

function Btn({ children, onClick, style = {}, disabled = false }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: 'linear-gradient(90deg, #7c3aed, #2563eb)', color: '#fff',
      padding: '10px 20px', borderRadius: '50px', fontSize: '14px',
      fontWeight: '600', opacity: disabled ? 0.5 : 1, ...style
    }}>{children}</button>
  )
}
