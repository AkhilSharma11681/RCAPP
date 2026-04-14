const sections = [
  {
    title: '18+ Only',
    desc: 'Miloo is only for adults. If someone is under 18, they should not use the platform.',
  },
  {
    title: 'Anonymous by Design',
    desc: 'You do not need to create an account to start chatting. Avoid sharing your name, phone number, social handles, address, or any private details.',
  },
  {
    title: 'Respect Is Mandatory',
    desc: 'Harassment, threats, hate, spam, coercion, and abusive behavior are not allowed. Reports can lead to removal or bans.',
  },
  {
    title: 'No Sexual Misconduct',
    desc: 'Sexually explicit behavior, exploitation, nudity, and predatory conduct are prohibited. Safety comes before growth.',
  },
  {
    title: 'No Spam or Promotion',
    desc: 'Bots, repeated copy-paste messages, suspicious links, promotions, and attempts to move users off-platform too quickly may be blocked.',
  },
  {
    title: 'Use Caution',
    desc: 'Even in anonymous products, strangers are still strangers. If something feels wrong, leave, block, or report immediately.',
  },
  {
    title: 'Limited Session Data',
    desc: 'The experience may use temporary technical identifiers to support matching, abuse prevention, and safety systems. Do not assume other users are verified.',
  },
  {
    title: 'Rules Can Change',
    desc: 'Miloo may update these terms, safety rules, and moderation systems as the product evolves.',
  },
]

export default function Terms({ onBack }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        overflowY: 'auto',
        background: 'linear-gradient(135deg, #07070b 0%, #12001f 52%, #08111d 100%)',
        padding: '28px 20px 48px',
        color: '#fff',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '760px',
          margin: '0 auto',
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: 'rgba(255,255,255,0.05)',
            color: '#ddd6fe',
            fontSize: '14px',
            fontWeight: '700',
            marginBottom: '22px',
            cursor: 'pointer',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '999px',
            padding: '10px 14px',
            backdropFilter: 'blur(10px)',
          }}
        >
          ← Back
        </button>

        <div
          style={{
            background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '30px',
            padding: '24px',
            boxShadow: '0 24px 80px rgba(0,0,0,0.28)',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              borderRadius: '999px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#ddd6fe',
              fontSize: '12px',
              fontWeight: '800',
              marginBottom: '14px',
            }}
          >
            <span>🛡️</span>
            <span>Safety, Terms & Privacy</span>
          </div>

          <h1
            style={{
              fontSize: 'clamp(32px, 5vw, 52px)',
              fontWeight: '900',
              letterSpacing: '-0.05em',
              lineHeight: 1.02,
              marginBottom: '10px',
            }}
          >
            Keep Miloo human,
            <br />
            safe, and worth returning to.
          </h1>

          <p
            style={{
              color: '#9e9eb0',
              fontSize: '15px',
              lineHeight: 1.8,
              maxWidth: '620px',
            }}
          >
            Miloo works best when people show up with respect, curiosity, and boundaries. These rules exist to protect users and keep the experience from becoming another chaotic random chat app.
          </p>

          <div
            style={{
              marginTop: '14px',
              color: '#73738a',
              fontSize: '12px',
              fontWeight: '700',
            }}
          >
            Last updated: April 2026
          </div>

          <div
            style={{
              marginTop: '28px',
              display: 'grid',
              gap: '16px',
            }}
          >
            {sections.map(section => (
              <div
                key={section.title}
                style={{
                  padding: '18px',
                  borderRadius: '22px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.07)',
                }}
              >
                <h3
                  style={{
                    fontSize: '17px',
                    fontWeight: '800',
                    color: '#c4b5fd',
                    marginBottom: '8px',
                  }}
                >
                  {section.title}
                </h3>

                <p
                  style={{
                    fontSize: '14px',
                    color: '#b4b4c0',
                    lineHeight: 1.75,
                  }}
                >
                  {section.desc}
                </p>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: '24px',
              padding: '18px',
              borderRadius: '22px',
              background: 'linear-gradient(135deg, rgba(124,58,237,0.12), rgba(37,99,235,0.12))',
              border: '1px solid rgba(124,58,237,0.18)',
            }}
          >
            <div style={{ color: '#fff', fontSize: '15px', fontWeight: '800', marginBottom: '8px' }}>
              Smart safety habits
            </div>

            <div
              style={{
                display: 'grid',
                gap: '8px',
                color: '#d4d4d8',
                fontSize: '13px',
                lineHeight: 1.7,
              }}
            >
              <div>• Do not share phone numbers, Instagram, Snapchat, Telegram, or payment details too quickly.</div>
              <div>• If a chat feels pushy, sexual, manipulative, or suspicious, leave immediately.</div>
              <div>• Use Safe Mode if you want a softer start with more control.</div>
              <div>• Reporting helps improve trust and removes harmful users faster.</div>
            </div>
          </div>

          <div
            style={{
              marginTop: '22px',
              padding: '16px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: '20px',
              textAlign: 'center',
            }}
          >
            <p
              style={{
                fontSize: '13px',
                color: '#8f8fa1',
                lineHeight: 1.7,
              }}
            >
              Questions or support:
              <br />
              <span style={{ color: '#ddd6fe', fontWeight: '700' }}>support@miloo.app</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
