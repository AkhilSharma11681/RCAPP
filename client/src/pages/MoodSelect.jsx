import { useState } from 'react'

const moods = [
  { id: 'vent', emoji: '😤', label: 'Vent', desc: 'Someone to listen' },
  { id: 'laugh', emoji: '😂', label: 'Just Laugh', desc: 'Comedy & fun' },
  { id: 'music', emoji: '🎵', label: 'Music', desc: 'Share what you love' },
  { id: 'deep', emoji: '🧠', label: 'Deep Talk', desc: 'Real conversations' },
  { id: 'gaming', emoji: '🎮', label: 'Gaming', desc: 'Find a gaming buddy' },
  { id: 'culture', emoji: '🌍', label: 'Culture', desc: 'Explore the world' },
]

export default function MoodSelect({ onMoodSelect }) {
  const [safeMode, setSafeMode] = useState(false)

  return (
    <div style={{
      height: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0a0a0f 0%, #12001f 50%, #0a0f1a 100%)',
      padding: '20px', gap: '20px', position: 'relative', overflow: 'hidden'
    }}>
      <div style={{
        position: 'absolute', width: '400px', height: '400px',
        background: 'radial-gradient(circle, rgba(124,58,237,0.1) 0%, transparent 70%)',
        top: '-100px', right: '-100px', borderRadius: '50%'
      }} />

      <div style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
        <h2 style={{
          fontSize: '28px', fontWeight: '900', letterSpacing: '-1px',
          background: 'linear-gradient(90deg, #a78bfa, #60a5fa)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
        }}>miloo</h2>
        <p style={{ color: '#fff', fontSize: '20px', fontWeight: '700', marginTop: '8px' }}>
          What's your mood? 👇
        </p>
        <p style={{ color: '#444', fontSize: '13px', marginTop: '4px' }}>
          You'll match with someone on the same vibe
        </p>
      </div>

      {/* Safe Mode Toggle */}
      <div onClick={() => setSafeMode(!safeMode)} style={{
        position: 'relative', zIndex: 1,
        display: 'flex', alignItems: 'center', gap: '12px',
        background: safeMode ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${safeMode ? 'rgba(167,139,250,0.4)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: '50px', padding: '10px 20px',
        cursor: 'pointer', transition: 'all 0.3s',
        width: '100%', maxWidth: '380px'
      }}>
        <div style={{
          width: '36px', height: '36px', borderRadius: '50%',
          background: safeMode ? 'linear-gradient(135deg, #a78bfa, #60a5fa)' : 'rgba(255,255,255,0.05)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '18px', flexShrink: 0, transition: 'all 0.3s'
        }}>🛡️</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#fff', fontSize: '14px', fontWeight: '700' }}>Safe Mode</span>
            {safeMode && (
              <span style={{
                background: 'rgba(167,139,250,0.2)', color: '#a78bfa',
                fontSize: '10px', padding: '2px 8px', borderRadius: '20px',
                border: '1px solid rgba(167,139,250,0.3)'
              }}>ON</span>
            )}
          </div>
          <p style={{ color: '#555', fontSize: '11px', marginTop: '2px' }}>
            {safeMode
              ? '✅ Your face stays hidden — you decide when to reveal'
              : 'Face blur + voice only — recommended for everyone'}
          </p>
        </div>
        <div style={{
          width: '40px', height: '22px', borderRadius: '11px',
          background: safeMode ? 'linear-gradient(90deg, #7c3aed, #2563eb)' : 'rgba(255,255,255,0.1)',
          position: 'relative', transition: 'all 0.3s', flexShrink: 0
        }}>
          <div style={{
            position: 'absolute', top: '3px',
            left: safeMode ? '21px' : '3px',
            width: '16px', height: '16px', borderRadius: '50%',
            background: '#fff', transition: 'left 0.3s'
          }} />
        </div>
      </div>

      {/* Mood grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '10px', width: '100%', maxWidth: '380px',
        position: 'relative', zIndex: 1
      }}>
        {moods.map((mood) => (
          <button key={mood.id} onClick={() => onMoodSelect(mood.id, safeMode)}
            style={{
              padding: '18px 14px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: '16px', color: '#fff', textAlign: 'left',
              transition: 'all 0.2s', cursor: 'pointer'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(124,58,237,0.15)'
              e.currentTarget.style.borderColor = 'rgba(124,58,237,0.5)'
              e.currentTarget.style.transform = 'scale(1.03)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'
              e.currentTarget.style.transform = 'scale(1)'
            }}
          >
            <div style={{ fontSize: '26px', marginBottom: '6px' }}>{mood.emoji}</div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: '#e2e8f0' }}>{mood.label}</div>
            <div style={{ fontSize: '11px', color: '#555', marginTop: '3px' }}>{mood.desc}</div>
          </button>
        ))}
      </div>

      <button onClick={() => onMoodSelect('any', safeMode)} style={{
        color: '#444', background: 'none', fontSize: '13px',
        textDecoration: 'underline', cursor: 'pointer',
        position: 'relative', zIndex: 1, border: 'none'
      }}>
        No preference — match me randomly
      </button>
    </div>
  )
}
