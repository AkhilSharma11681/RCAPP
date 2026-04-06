export default function Home({ onStart }) {
  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0a0a0f 0%, #12001f 50%, #0a0f1a 100%)',
      gap: '28px',
      padding: '20px',
      textAlign: 'center',
      position: 'relative',
      overflow: 'hidden'
    }}>
      <div style={{
        position: 'absolute', width: '400px', height: '400px',
        background: 'radial-gradient(circle, rgba(124,58,237,0.15) 0%, transparent 70%)',
        top: '-100px', left: '-100px', borderRadius: '50%'
      }} />
      <div style={{
        position: 'absolute', width: '300px', height: '300px',
        background: 'radial-gradient(circle, rgba(37,99,235,0.15) 0%, transparent 70%)',
        bottom: '-50px', right: '-50px', borderRadius: '50%'
      }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginBottom: '4px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'linear-gradient(135deg, #7c3aed, #2563eb)', opacity: 0.9 }} />
          <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'linear-gradient(135deg, #2563eb, #7c3aed)', marginLeft: '-12px', opacity: 0.9 }} />
        </div>
        <h1 style={{
          fontSize: '52px', fontWeight: '900', letterSpacing: '-2px',
          background: 'linear-gradient(90deg, #a78bfa, #60a5fa, #a78bfa)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>miloo</h1>
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>
        <p style={{ fontSize: '20px', fontWeight: '600', color: '#e2e8f0', letterSpacing: '-0.5px', lineHeight: 1.4 }}>
          Same vibe. Real log.<br />Asli connection.
        </p>
        <p style={{ color: '#555', fontSize: '14px', marginTop: '8px' }}>
          No signup. No data. 100% anonymous.
        </p>
      </div>

      <button
        onClick={onStart}
        style={{
          position: 'relative', zIndex: 1,
          marginTop: '8px', padding: '16px 52px',
          fontSize: '18px', fontWeight: '700',
          background: 'linear-gradient(90deg, #7c3aed, #2563eb)',
          color: '#fff', borderRadius: '50px',
          boxShadow: '0 0 40px rgba(124,58,237,0.35)',
          transition: 'all 0.2s', border: 'none', cursor: 'pointer'
        }}
        onMouseEnter={e => { e.target.style.transform = 'scale(1.05)'; e.target.style.boxShadow = '0 0 60px rgba(124,58,237,0.5)' }}
        onMouseLeave={e => { e.target.style.transform = 'scale(1)'; e.target.style.boxShadow = '0 0 40px rgba(124,58,237,0.35)' }}
      >
        Miloo Kisi Se →
      </button>

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', gap: '32px', marginTop: '8px' }}>
        {[['🔒', 'Anonymous'], ['⚡', 'Instant Match'], ['🤖', 'Bot Free']].map(([icon, label]) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '20px' }}>{icon}</div>
            <div style={{ fontSize: '11px', color: '#444', marginTop: '4px' }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
