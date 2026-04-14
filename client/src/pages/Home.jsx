export default function Home({ onStart, onTerms }) {
  const trustPoints = [
    { icon: '🛡️', title: 'Safer First', desc: 'Voice-first intro and optional blur before reveal' },
    { icon: '⚡', title: 'Fast Match', desc: 'Jump into a real conversation in seconds' },
    { icon: '✨', title: 'Mood-Based', desc: 'Meet people who actually want the same vibe' },
  ]

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 20px',
        background: 'linear-gradient(135deg, #07070b 0%, #110019 42%, #07101c 100%)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          width: '520px',
          height: '520px',
          background: 'radial-gradient(circle, rgba(124,58,237,0.18) 0%, transparent 68%)',
          top: '-180px',
          left: '-140px',
          borderRadius: '50%',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'absolute',
          width: '420px',
          height: '420px',
          background: 'radial-gradient(circle, rgba(37,99,235,0.18) 0%, transparent 68%)',
          bottom: '-140px',
          right: '-100px',
          borderRadius: '50%',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(circle at 20% 30%, rgba(255,255,255,0.04), transparent 18%), radial-gradient(circle at 78% 76%, rgba(255,255,255,0.03), transparent 16%)',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          width: '100%',
          maxWidth: '1080px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '28px',
          alignItems: 'center',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
                width: 'fit-content',
                padding: '8px 14px',
                borderRadius: '999px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#ddd6fe',
                fontSize: '12px',
                fontWeight: '700',
                letterSpacing: '0.02em',
              }}
            >
              <span>✨</span>
              <span>Anonymous conversations that actually feel human</span>
            </div>

            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  marginBottom: '8px',
                }}
              >
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #7c3aed, #2563eb)',
                    opacity: 0.95,
                  }}
                />
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
                    marginLeft: '-12px',
                    opacity: 0.95,
                  }}
                />
              </div>

              <h1
                style={{
                  fontSize: 'clamp(54px, 9vw, 92px)',
                  fontWeight: '900',
                  letterSpacing: '-0.06em',
                  lineHeight: 0.92,
                  background: 'linear-gradient(90deg, #a78bfa, #60a5fa, #c4b5fd)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                miloo
              </h1>
            </div>
          </div>

          <div style={{ maxWidth: '560px' }}>
            <p
              style={{
                fontSize: 'clamp(30px, 4vw, 52px)',
                fontWeight: '850',
                color: '#f8fafc',
                lineHeight: 1.04,
                letterSpacing: '-0.04em',
              }}
            >
              Same vibe.
              <br />
              Real people.
              <br />
              Real connection.
            </p>

            <p
              style={{
                color: '#a1a1b1',
                fontSize: '17px',
                marginTop: '16px',
                lineHeight: 1.75,
                maxWidth: '520px',
              }}
            >
              Meet strangers who want the same kind of conversation as you do. Start with voice, stay anonymous if you want, and reveal only when it feels right.
            </p>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '4px' }}>
            <button
              onClick={onStart}
              style={{
                padding: '18px 34px',
                fontSize: '18px',
                fontWeight: '800',
                background: 'linear-gradient(90deg, #7c3aed, #2563eb)',
                color: '#fff',
                borderRadius: '999px',
                boxShadow: '0 18px 60px rgba(124,58,237,0.35)',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Meet Someone →
            </button>

            <button
              onClick={onTerms}
              style={{
                padding: '18px 24px',
                fontSize: '15px',
                fontWeight: '700',
                background: 'rgba(255,255,255,0.05)',
                color: '#e4e4e7',
                borderRadius: '999px',
                border: '1px solid rgba(255,255,255,0.1)',
                cursor: 'pointer',
                backdropFilter: 'blur(10px)',
              }}
            >
              Safety & Terms
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '12px',
              marginTop: '6px',
            }}
          >
            {['No signup', '18+ only', 'Link sharing blocked', 'Optional safe mode'].map(item => (
              <span
                key={item}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: '#d4d4d8',
                  borderRadius: '999px',
                  padding: '8px 12px',
                  fontSize: '12px',
                  fontWeight: '700',
                }}
              >
                {item}
              </span>
            ))}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '430px',
              background: 'linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '32px',
              padding: '22px',
              backdropFilter: 'blur(20px)',
              boxShadow: '0 30px 80px rgba(0,0,0,0.35)',
            }}
          >
            <div
              style={{
                display: 'grid',
                gap: '14px',
              }}
            >
              <div
                style={{
                  borderRadius: '24px',
                  padding: '18px',
                  background: 'linear-gradient(135deg, rgba(124,58,237,0.18), rgba(37,99,235,0.18))',
                  border: '1px solid rgba(124,58,237,0.22)',
                }}
              >
                <div style={{ color: '#ddd6fe', fontSize: '12px', fontWeight: '800', marginBottom: '8px' }}>
                  Why people choose Miloo
                </div>
                <div style={{ color: '#fff', fontSize: '22px', fontWeight: '800', lineHeight: 1.2 }}>
                  Less chaos.
                  <br />
                  Better conversations.
                </div>
                <div style={{ color: '#a1a1b1', fontSize: '14px', lineHeight: 1.65, marginTop: '10px' }}>
                  Match by mood, start safer, and let the conversation earn the reveal.
                </div>
              </div>

              {trustPoints.map(point => (
                <div
                  key={point.title}
                  style={{
                    display: 'flex',
                    gap: '14px',
                    alignItems: 'flex-start',
                    padding: '16px',
                    borderRadius: '22px',
                    background: 'rgba(255,255,255,0.035)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <div
                    style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: '50%',
                      background: 'rgba(124,58,237,0.16)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '20px',
                      flexShrink: 0,
                    }}
                  >
                    {point.icon}
                  </div>

                  <div>
                    <div style={{ color: '#fff', fontSize: '15px', fontWeight: '800' }}>{point.title}</div>
                    <div style={{ color: '#9e9eb0', fontSize: '13px', lineHeight: 1.65, marginTop: '3px' }}>
                      {point.desc}
                    </div>
                  </div>
                </div>
              ))}

              <div
                style={{
                  borderRadius: '22px',
                  padding: '16px',
                  background: 'rgba(255,255,255,0.035)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div style={{ color: '#fff', fontSize: '14px', fontWeight: '800' }}>How it works</div>
                <div style={{ display: 'grid', gap: '10px', marginTop: '12px' }}>
                  {[
                    'Pick your mood',
                    'Choose safe mode if you want a softer start',
                    'Get matched instantly',
                    'Talk first, reveal later',
                  ].map((step, index) => (
                    <div key={step} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <div
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, #7c3aed, #2563eb)',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '11px',
                          fontWeight: '800',
                          flexShrink: 0,
                        }}
                      >
                        {index + 1}
                      </div>
                      <div style={{ color: '#d4d4d8', fontSize: '13px' }}>{step}</div>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={onStart}
                style={{
                  marginTop: '4px',
                  width: '100%',
                  padding: '16px 20px',
                  borderRadius: '999px',
                  border: 'none',
                  cursor: 'pointer',
                  background: 'linear-gradient(90deg, #7c3aed, #2563eb)',
                  color: '#fff',
                  fontSize: '16px',
                  fontWeight: '800',
                }}
              >
                Start Now
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
