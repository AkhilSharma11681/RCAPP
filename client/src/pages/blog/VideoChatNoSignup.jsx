import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
export default function VideoChatNoSignup() {
  const navigate = useNavigate()
  useEffect(() => { document.title = 'Video Chat Without Signup Free India 2026 - Miloo' }, [])
  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 20px', fontFamily: 'sans-serif', background: '#0a0a0f', color: '#fff', minHeight: '100vh' }}>
      <h1 style={{ color: '#a78bfa', fontSize: 32, marginBottom: 16 }}>Free Video Chat Without Signup — India 2026</h1>
      <p style={{ color: '#ccc', lineHeight: 1.7, marginBottom: 20 }}>Tired of video chat apps that ask for registration? Miloo lets you start video chatting with strangers instantly — no signup, no email, no phone number. Just open and chat.</p>
      <h2 style={{ color: '#a78bfa', fontSize: 24, marginBottom: 12 }}>Why No Signup?</h2>
      <ul style={{ color: '#ccc', lineHeight: 2 }}>
        <li>✅ Start chatting in under 10 seconds</li>
        <li>✅ No personal data collected</li>
        <li>✅ No spam emails or notifications</li>
        <li>✅ Completely anonymous</li>
        <li>✅ Free forever — no hidden charges</li>
      </ul>
      <h2 style={{ color: '#a78bfa', fontSize: 24, margin: '24px 0 12px' }}>How It Works</h2>
      <ol style={{ color: '#ccc', lineHeight: 2 }}>
        <li>Open miloo.chat on any device</li>
        <li>Click Video Chat</li>
        <li>Allow camera — takes 2 seconds</li>
        <li>Instantly matched with a real person</li>
      </ol>
      <button onClick={() => navigate('/')} style={{ background: '#7c3aed', color: '#fff', border: 'none', padding: '14px 32px', borderRadius: 50, fontSize: 18, cursor: 'pointer', marginTop: 32 }}>Start Video Chat Free →</button>
    </div>
  )
}
