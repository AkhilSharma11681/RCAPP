const moods = [
  { id: 'vent', emoji: '😤', label: 'Vent Karna', desc: 'Koi sunne wala chahiye' },
  { id: 'laugh', emoji: '😂', label: 'Bas Hasna', desc: 'Comedy / timepass' },
  { id: 'music', emoji: '🎵', label: 'Music Talk', desc: 'Songs share karo' },
  { id: 'deep', emoji: '🧠', label: 'Deep Talk', desc: 'Real conversations' },
  { id: 'gaming', emoji: '🎮', label: 'Gaming', desc: 'Gaming buddy dhundo' },
  { id: 'culture', emoji: '🌍', label: 'Culture', desc: 'Different world explore' },
]

export default function MoodSelect({ onMoodSelect }) {
  return (
    <div style={{
      height: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0a0a0f 0%, #12001f 50%, #0a0f1a 100%)',
      padding: '20px', gap: '28px', position: 'relative', overflow: 'hidden'
    }}>
      <div style={{
        position: 'absolute', width: '400px', height: '400px',
        background: 'radial-gradient(circle, rgba(124,58,237,0.1) 0%, transparent 70%)',
        top: '-100px', right: '-100px', borderRadius: '50%'
      }} />

      {/* Logo small */}
      <div style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
        <h2 style={{
          fontSize: '28px', fontWeight: '900', letterSpacing: '-1px',
          background: 'linear-gradient(90deg, #a78bfa, #60a5fa)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
        }}>miloo</h2>
        <p style={{ color: '#fff', fontSize: '20px', fontWeight: '700', marginTop: '8px' }}>
          Aaj kya mood hai? 👇
        </p>
        <p style={{ color: '#444', fontSize: '13px', marginTop: '4px' }}>
          Same vibe waale se miloge
        </p>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '10px', width: '100%', maxWidth: '380px',
        position: 'relative', zIndex: 1
      }}>
        {moods.map((mood) => (
          <button key={mood.id} onClick={() => onMoodSelect(mood.id)}
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

      <button onClick={() => onMoodSelect('any')} style={{
        color: '#444', background: 'none', fontSize: '13px',
        textDecoration: 'underline', cursor: 'pointer',
        position: 'relative', zIndex: 1, border: 'none'
      }}>
        Koi bhi chalega — random connect karo
      </button>
    </div>
  )
}
