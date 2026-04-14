import { useMemo, useState } from 'react'

const moods = [
  {
    id: 'vent',
    emoji: '😤',
    label: 'Vent',
    desc: 'Someone to listen',
    tone: 'Soft landing, less pressure, more empathy.',
  },
  {
    id: 'laugh',
    emoji: '😂',
    label: 'Just Laugh',
    desc: 'Comedy & fun',
    tone: 'Light, playful, low-stakes conversation.',
  },
  {
    id: 'music',
    emoji: '🎵',
    label: 'Music',
    desc: 'Share what you love',
    tone: 'Songs, artists, obsessions, and vibes.',
  },
  {
    id: 'deep',
    emoji: '🧠',
    label: 'Deep Talk',
    desc: 'Real conversations',
    tone: 'Thoughtful, curious, meaningful talk.',
  },
  {
    id: 'gaming',
    emoji: '🎮',
    label: 'Gaming',
    desc: 'Find a gaming buddy',
    tone: 'Games, hot takes, squads, and late-night chat.',
  },
  {
    id: 'culture',
    emoji: '🌍',
    label: 'Culture',
    desc: 'Explore the world',
    tone: 'Places, languages, stories, and perspective.',
  },
]

const intents = [
  { id: 'listener', label: 'Just listen to me', desc: 'Low pressure, I want space to talk' },
  { id: 'advice', label: 'Give me advice', desc: 'I want input, perspective, or clarity' },
  { id: 'vibe', label: 'Just vibe', desc: 'Easygoing, natural conversation' },
  { id: 'fun', label: 'Make it fun', desc: 'Playful, light, and energetic' },
  { id: 'interesting', label: 'Meet someone interesting', desc: 'I want surprise and substance' },
  { id: 'random', label: 'No preference', desc: 'Open to whatever flows naturally' },
]

export default function MoodSelect({ onContinue }) {
  const [safeMode, setSafeMode] = useState(false)
  const [selectedMood, setSelectedMood] = useState('deep')
  const [selectedIntent, setSelectedIntent] = useState('interesting')

  const preview = useMemo(
    () => moods.find(mood => mood.id === selectedMood) || moods[0],
    [selectedMood]
  )

  const selectedIntentMeta = useMemo(
    () => intents.find(intent => intent.id === selectedIntent) || intents[0],
    [selectedIntent]
  )

  function handleContinue() {
    onContinue({
      mood: selectedMood,
      intent: selectedIntent,
      safeMode,
    })
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '28px 20px',
        background: 'linear-gradient(135deg, #07070b 0%, #12001f 50%, #08111d 100%)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          width: '420px',
          height: '420px',
          background: 'radial-gradient(circle, rgba(124,58,237,0.12) 0%, transparent 70%)',
          top: '-140px',
          right: '-80px',
          borderRadius: '50%',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: '380px',
          height: '380px',
          background: 'radial-gradient(circle, rgba(37,99,235,0.12) 0%, transparent 70%)',
          bottom: '-120px',
          left: '-80px',
          borderRadius: '50%',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          width: '100%',
          maxWidth: '1180px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: '26px',
          alignItems: 'start',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <div
              style={{
                fontSize: '42px',
                fontWeight: '900',
                letterSpacing: '-0.05em',
                background: 'linear-gradient(90deg, #a78bfa, #60a5fa)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              miloo
            </div>

            <h2
              style={{
                color: '#fff',
                fontSize: 'clamp(34px, 5vw, 56px)',
                fontWeight: '850',
                letterSpacing: '-0.05em',
                lineHeight: 1.02,
                marginTop: '10px',
              }}
            >
              Build a better match
              <br />
              before it starts
            </h2>

            <p
              style={{
                color: '#9e9eb0',
                fontSize: '16px',
                lineHeight: 1.75,
                marginTop: '14px',
                maxWidth: '540px',
              }}
            >
              The best conversations start with better intent. Choose your mood, tell us what you want from the chat, and turn on Safe Mode only if you want extra privacy.
            </p>
          </div>

          <div
            onClick={() => setSafeMode(!safeMode)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              background: safeMode ? 'rgba(167,139,250,0.12)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${safeMode ? 'rgba(167,139,250,0.32)' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: '26px',
              padding: '16px',
              cursor: 'pointer',
              maxWidth: '560px',
            }}
          >
            <div
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '50%',
                background: safeMode ? 'linear-gradient(135deg, #a78bfa, #60a5fa)' : 'rgba(255,255,255,0.06)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '22px',
                flexShrink: 0,
              }}
            >
              🛡️
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ color: '#fff', fontSize: '16px', fontWeight: '800' }}>Safe Mode</span>
                <span
                  style={{
                    background: safeMode ? 'rgba(167,139,250,0.18)' : 'rgba(255,255,255,0.06)',
                    color: safeMode ? '#ddd6fe' : '#b4b4c0',
                    fontSize: '10px',
                    padding: '3px 8px',
                    borderRadius: '999px',
                    border: `1px solid ${safeMode ? 'rgba(167,139,250,0.24)' : 'rgba(255,255,255,0.08)'}`,
                    fontWeight: '800',
                  }}
                >
                  {safeMode ? 'ON' : 'OPTIONAL'}
                </span>
              </div>

              <p
                style={{
                  color: safeMode ? '#d4d4f4' : '#9e9eb0',
                  fontSize: '13px',
                  lineHeight: 1.6,
                  marginTop: '4px',
                }}
              >
                {safeMode
                  ? 'Blur starts enabled for extra privacy.'
                  : 'Video starts normally. Turn this on only if you want extra privacy.'}
              </p>
            </div>

            <div
              style={{
                width: '44px',
                height: '24px',
                borderRadius: '999px',
                background: safeMode ? 'linear-gradient(90deg, #7c3aed, #2563eb)' : 'rgba(255,255,255,0.12)',
                position: 'relative',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: '3px',
                  left: safeMode ? '23px' : '3px',
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  background: '#fff',
                }}
              />
            </div>
          </div>

          <div
            style={{
              background: 'rgba(255,255,255,0.035)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '28px',
              padding: '20px',
              maxWidth: '560px',
            }}
          >
            <div style={{ color: '#ddd6fe', fontSize: '12px', fontWeight: '800', marginBottom: '8px' }}>
              Preview
            </div>

            <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
              <div
                style={{
                  width: '54px',
                  height: '54px',
                  borderRadius: '18px',
                  background: 'rgba(124,58,237,0.16)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '28px',
                  flexShrink: 0,
                }}
              >
                {preview.emoji}
              </div>

              <div>
                <div style={{ color: '#fff', fontSize: '20px', fontWeight: '800' }}>{preview.label}</div>
                <div style={{ color: '#d4d4d8', fontSize: '14px', fontWeight: '600', marginTop: '2px' }}>
                  {preview.desc}
                </div>
                <div style={{ color: '#8f8fa1', fontSize: '13px', lineHeight: 1.7, marginTop: '8px' }}>
                  {preview.tone}
                </div>
                <div style={{ color: '#c4b5fd', fontSize: '12px', fontWeight: '700', marginTop: '10px' }}>
                  Intent: {selectedIntentMeta.label}
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={handleContinue}
            style={{
              width: '100%',
              maxWidth: '560px',
              padding: '18px 20px',
              borderRadius: '999px',
              border: 'none',
              cursor: 'pointer',
              background: 'linear-gradient(90deg, #7c3aed, #2563eb)',
              color: '#fff',
              fontSize: '17px',
              fontWeight: '800',
              boxShadow: '0 18px 60px rgba(124,58,237,0.28)',
            }}
          >
            Continue to camera access →
          </button>
        </div>

        <div
          style={{
            background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '30px',
            padding: '20px',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 30px 80px rgba(0,0,0,0.28)',
          }}
        >
          <div style={{ color: '#fff', fontSize: '15px', fontWeight: '800', marginBottom: '12px' }}>
            1. Choose your mood
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: '12px',
            }}
          >
            {moods.map(mood => (
              <button
                key={mood.id}
                onClick={() => setSelectedMood(mood.id)}
                style={{
                  padding: '18px 16px',
                  background: selectedMood === mood.id ? 'rgba(124,58,237,0.14)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${selectedMood === mood.id ? 'rgba(124,58,237,0.42)' : 'rgba(255,255,255,0.07)'}`,
                  borderRadius: '20px',
                  color: '#fff',
                  textAlign: 'left',
                  cursor: 'pointer',
                  minHeight: '140px',
                }}
              >
                <div style={{ fontSize: '28px', marginBottom: '10px' }}>{mood.emoji}</div>
                <div style={{ fontSize: '16px', fontWeight: '800', color: '#f3f4f6' }}>{mood.label}</div>
                <div style={{ fontSize: '12px', color: '#b4b4c0', marginTop: '4px', fontWeight: '600' }}>{mood.desc}</div>
                <div style={{ fontSize: '11px', color: '#7f7f91', marginTop: '10px', lineHeight: 1.55 }}>
                  {mood.tone}
                </div>
              </button>
            ))}
          </div>

          <div style={{ color: '#fff', fontSize: '15px', fontWeight: '800', margin: '18px 0 12px' }}>
            2. What do you want from this chat?
          </div>

          <div style={{ display: 'grid', gap: '10px' }}>
            {intents.map(intent => (
              <button
                key={intent.id}
                onClick={() => setSelectedIntent(intent.id)}
                style={{
                  padding: '14px 14px',
                  background: selectedIntent === intent.id ? 'rgba(124,58,237,0.12)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${selectedIntent === intent.id ? 'rgba(124,58,237,0.35)' : 'rgba(255,255,255,0.07)'}`,
                  borderRadius: '18px',
                  color: '#fff',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: '14px', fontWeight: '800' }}>{intent.label}</div>
                <div style={{ fontSize: '12px', color: '#9e9eb0', marginTop: '4px', lineHeight: 1.6 }}>
                  {intent.desc}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
