import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
export default function StrangerChatIndia() {
  const navigate = useNavigate()
  useEffect(() => { document.title = 'Stranger Chat India Free - Miloo | Meet Random People Online' }, [])
  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 20px', fontFamily: 'sans-serif', background: '#0a0a0f', color: '#fff', minHeight: '100vh' }}>
      <h1 style={{ color: '#a78bfa', fontSize: 32, marginBottom: 16 }}>Stranger Chat India — Meet Random People Free</h1>
      <p style={{ color: '#ccc', lineHeight: 1.7, marginBottom: 20 }}>Miloo is India's best free stranger chat platform. Meet random people online instantly — no signup, no login needed. Safe, anonymous, and completely free.</p>
      <h2 style={{ color: '#a78bfa', fontSize: 24, marginBottom: 12 }}>Talk to Strangers Online India</h2>
      <ul style={{ color: '#ccc', lineHeight: 2 }}>
        <li>🎯 Mood-based matching — find someone who shares your vibe</li>
        <li>💬 Text chat — no camera needed</li>
        <li>🎥 Video chat — face to face with strangers</li>
        <li>🔒 100% anonymous — no account required</li>
        <li>⚡ Works on Jio, Airtel, Vi mobile data</li>
      </ul>
      <h2 style={{ color: '#a78bfa', fontSize: 24, margin: '24px 0 12px' }}>Popular in These Cities</h2>
      <p style={{ color: '#ccc', lineHeight: 1.7 }}>Miloo is used by people across India — Delhi, Mumbai, Bangalore, Hyderabad, Chennai, Kolkata, Pune, Jaipur and more. Meet strangers from your city or anywhere in India.</p>
      <button onClick={() => navigate('/')} style={{ background: '#7c3aed', color: '#fff', border: 'none', padding: '14px 32px', borderRadius: 50, fontSize: 18, cursor: 'pointer', marginTop: 32 }}>Start Stranger Chat →</button>
    </div>
  )
}
