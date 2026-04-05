export default function Home({ onStart }) {
  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f0f0f 0%, #1a1a2e 100%)',
      gap: '24px',
      padding: '20px',
      textAlign: 'center'
    }}>
      <div style={{ fontSize: '48px' }}>⚡</div>

      <h1 style={{
        fontSize: '42px',
        fontWeight: '800',
        background: 'linear-gradient(90deg, #a78bfa, #60a5fa)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        lineHeight: 1.2
      }}>
        Real Connections.<br />No Filters.
      </h1>

      <p style={{ color: '#888', fontSize: '16px', maxWidth: '320px' }}>
        Meet real people. Same vibe. No bots. No BS.
      </p>

      <button
        onClick={onStart}
        style={{
          marginTop: '16px',
          padding: '16px 48px',
          fontSize: '18px',
          fontWeight: '700',
          background: 'linear-gradient(90deg, #7c3aed, #2563eb)',
          color: '#fff',
          borderRadius: '50px',
          boxShadow: '0 0 30px rgba(124,58,237,0.4)',
          transition: 'transform 0.2s, box-shadow 0.2s',
        }}
        onMouseEnter={e => {
          e.target.style.transform = 'scale(1.05)'
          e.target.style.boxShadow = '0 0 40px rgba(124,58,237,0.6)'
        }}
        onMouseLeave={e => {
          e.target.style.transform = 'scale(1)'
          e.target.style.boxShadow = '0 0 30px rgba(124,58,237,0.4)'
        }}
      >
        Start Chatting →
      </button>

      <p style={{ color: '#444', fontSize: '12px' }}>
        No signup. No personal data. 100% anonymous.
      </p>
    </div>
  )
}
