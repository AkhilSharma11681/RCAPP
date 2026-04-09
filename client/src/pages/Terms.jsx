export default function Terms({ onBack }) {
  return (
    <div style={{
      height: '100vh', overflowY: 'auto',
      background: '#0a0a0f', padding: '24px 20px',
      color: '#fff', maxWidth: '600px', margin: '0 auto'
    }}>
      <button onClick={onBack} style={{
        background: 'none', color: '#a78bfa',
        fontSize: '14px', marginBottom: '24px',
        cursor: 'pointer', border: 'none'
      }}>← Wapas</button>

      <h1 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '8px' }}>
        Terms & Privacy
      </h1>
      <p style={{ color: '#555', fontSize: '13px', marginBottom: '32px' }}>
        Last updated: April 2026
      </p>

      {[
        ['18+ Only', 'Miloo sirf 18+ users ke liye hai. Under-18 users ko immediately disconnect kiya jaayega.'],
        ['Anonymous', 'Hum koi personal data store nahi karte. Koi naam, email, phone number nahi. Sirf session ke liye ek random ID.'],
        ['No Recording', 'Hum conversations record nahi karte. Video P2P hai — directly browsers ke beech.'],
        ['Be Respectful', 'Harassment, abuse, spam, ya inappropriate content strictly banned hai. 3 reports = permanent ban.'],
        ['No Spam/Bots', 'Bots, spam links, aur promotional content allowed nahi hai. Ye automatically detect ho jaate hain.'],
        ['Your Safety', 'Apni personal information (phone, address, social media) kisi se share mat karo. Miloo zimmedaar nahi hoga.'],
        ['Content', 'Sexual content, violence, ya illegal activity strictly prohibited hai. Violators permanently ban ho jaate hain.'],
        ['Changes', 'Hum ye terms kabhi bhi update kar sakte hain. Platform use karna matlab in terms se agreement.'],
      ].map(([title, desc]) => (
        <div key={title} style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#a78bfa', marginBottom: '6px' }}>
            {title}
          </h3>
          <p style={{ fontSize: '14px', color: '#888', lineHeight: 1.6 }}>{desc}</p>
        </div>
      ))}

      <div style={{
        marginTop: '32px', padding: '16px',
        background: 'rgba(124,58,237,0.1)',
        border: '1px solid rgba(124,58,237,0.2)',
        borderRadius: '12px'
      }}>
        <p style={{ fontSize: '13px', color: '#666', textAlign: 'center' }}>
          Questions? Contact: support@miloo.app
        </p>
      </div>
    </div>
  )
}
