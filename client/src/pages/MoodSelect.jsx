import { useState } from 'react'
import ThemeToggle from '../components/ThemeToggle'

const moods = [
  { id: 'deep',    emoji: '🧠', label: 'Deep Talk',   desc: 'Real, thoughtful conversation' },
  { id: 'laugh',   emoji: '😂', label: 'Just Laugh',  desc: 'Light, fun, no pressure' },
  { id: 'vent',    emoji: '😤', label: 'Vent',        desc: 'Someone to listen to you' },
  { id: 'gaming',  emoji: '🎮', label: 'Gaming',      desc: 'Find a gaming buddy' },
  { id: 'music',   emoji: '🎵', label: 'Music',       desc: 'Share what you love' },
  { id: 'culture', emoji: '🌍', label: 'Culture',     desc: 'Explore the world' },
  { id: 'any',     emoji: '✨', label: 'Surprise me', desc: 'Open to anything' },
]

export default function MoodSelect({ onContinue, onBack, theme, onToggleTheme }) {
  const [selectedMood, setSelectedMood] = useState('any')
  const [chatMode, setChatMode] = useState('text')

  function handleContinue() {
    onContinue({ mood: selectedMood, intent: 'random', safeMode: false, chatMode })
  }

  return (
    <div className="page-enter" style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      background: 'var(--bg-0)', overflow: 'hidden auto',
    }}>
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '18px 32px', borderBottom: '1px solid var(--border-1)',
        flexShrink: 0, position: 'sticky', top: 0, zIndex: 20, background: 'var(--bg-0)',
      }}>
        <button onClick={onBack} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-3)', fontSize: '14px', fontWeight: '600',
          display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0',
        }}>← Back</button>
        <span style={{ fontSize: '20px', fontWeight: '900', letterSpacing: '-0.06em', color: 'var(--text-1)' }}>miloo</span>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </nav>

      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '52px 24px 48px', maxWidth: '540px', margin: '0 auto', width: '100%', gap: '36px',
      }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ color: 'var(--text-1)', fontSize: 'clamp(26px, 5vw, 38px)', fontWeight: '800', letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: '10px' }}>
            What's your vibe?
          </h2>
          <p style={{ color: 'var(--text-3)', fontSize: '15px', lineHeight: 1.65 }}>
            Pick a mood — we'll find someone on the same wavelength.
          </p>
        </div>

        <div style={{ width: '100%' }}>
          <p style={{ color: 'var(--text-3)', fontSize: '11px', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '10px' }}>
            How do you want to chat?
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {[
              { id: 'text',  icon: '💬', label: 'Text Only',  sub: 'No camera. Start instantly.' },
              { id: 'video', icon: '🎥', label: 'Video Chat', sub: 'Face to face.' },
            ].map(m => (
              <button key={m.id} onClick={() => setChatMode(m.id)} style={{
                padding: '18px 14px', borderRadius: '16px', border: 'none', cursor: 'pointer', textAlign: 'left',
                background: chatMode === m.id ? 'var(--accent)' : 'var(--bg-2)',
                outline: chatMode === m.id ? 'none' : '1px solid var(--border-1)',
                transition: 'all 0.15s ease',
                transform: chatMode === m.id ? 'scale(1.01)' : 'scale(1)',
                boxShadow: chatMode === m.id ? 'var(--accent-glow)' : 'none',
              }}>
                <div style={{ fontSize: '24px', marginBottom: '8px' }}>{m.icon}</div>
                <div style={{ color: chatMode === m.id ? '#fff' : 'var(--text-1)', fontSize: '14px', fontWeight: '700', marginBottom: '3px' }}>{m.label}</div>
                <div style={{ color: chatMode === m.id ? 'rgba(255,255,255,0.6)' : 'var(--text-3)', fontSize: '12px', lineHeight: 1.4 }}>{m.sub}</div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ width: '100%' }}>
          <p style={{ color: 'var(--text-3)', fontSize: '11px', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '10px' }}>
            Pick your mood
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' }}>
            {moods.map(mood => (
              <button key={mood.id} onClick={() => setSelectedMood(mood.id)} style={{
                padding: '18px 14px', borderRadius: '16px', border: 'none', cursor: 'pointer', textAlign: 'left',
                background: selectedMood === mood.id ? 'var(--accent-dim)' : 'var(--bg-2)',
                outline: selectedMood === mood.id ? '2px solid var(--accent-border)' : '1px solid var(--border-1)',
                transition: 'all 0.13s ease',
                transform: selectedMood === mood.id ? 'scale(1.01)' : 'scale(1)',
              }}>
                <div style={{ fontSize: '24px', marginBottom: '8px' }}>{mood.emoji}</div>
                <div style={{ color: selectedMood === mood.id ? 'var(--accent)' : 'var(--text-1)', fontSize: '13px', fontWeight: '700', marginBottom: '3px' }}>{mood.label}</div>
                <div style={{ color: 'var(--text-3)', fontSize: '11px', lineHeight: 1.4 }}>{mood.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ width: '100%' }}>
          <button onClick={handleContinue} style={{
            width: '100%', padding: '18px', borderRadius: '999px', border: 'none', cursor: 'pointer',
            background: 'var(--accent)', color: 'var(--accent-text)',
            fontSize: '16px', fontWeight: '700', boxShadow: 'var(--accent-glow)', letterSpacing: '-0.01em',
          }}>
            {chatMode === 'text' ? 'Find Someone to Chat With →' : 'Find My Match →'}
          </button>
        </div>
      </div>
    </div>
  )
}
