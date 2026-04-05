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
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f0f0f 0%, #1a1a2e 100%)',
      padding: '20px',
      gap: '32px'
    }}>
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ fontSize: '28px', fontWeight: '800', color: '#fff' }}>
          Aaj kya mood hai? 👇
        </h2>
        <p style={{ color: '#666', marginTop: '8px' }}>Same vibe waale se miloge</p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '12px',
        width: '100%',
        maxWidth: '400px'
      }}>
        {moods.map((mood) => (
          <button
            key={mood.id}
            onClick={() => onMoodSelect(mood.id)}
            style={{
              padding: '20px 16px',
              background: '#1a1a2e',
              border: '1px solid #2a2a4a',
              borderRadius: '16px',
              color: '#fff',
              textAlign: 'left',
              transition: 'all 0.2s',
              cursor: 'pointer'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = '#2a2a4a'
              e.currentTarget.style.borderColor = '#7c3aed'
              e.currentTarget.style.transform = 'scale(1.03)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = '#1a1a2e'
              e.currentTarget.style.borderColor = '#2a2a4a'
              e.currentTarget.style.transform = 'scale(1)'
            }}
          >
            <div style={{ fontSize: '28px', marginBottom: '8px' }}>{mood.emoji}</div>
            <div style={{ fontSize: '15px', fontWeight: '700' }}>{mood.label}</div>
            <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>{mood.desc}</div>
          </button>
        ))}
      </div>

      <button
        onClick={() => onMoodSelect('any')}
        style={{
          color: '#555',
          background: 'none',
          fontSize: '14px',
          textDecoration: 'underline'
        }}
      >
        Koi bhi chalega — random connect karo
      </button>
    </div>
  )
}
