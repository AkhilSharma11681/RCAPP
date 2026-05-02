import { useState } from 'react'
import ThemeToggle from '../components/ThemeToggle'
import useCanonical from '../hooks/useCanonical'
import { trackEvent } from '../utils/analytics'

const moods = [
  { id: 'deep',    emoji: '🧠', label: 'Deep Talk',   desc: 'Real, thoughtful conversation' },
  { id: 'laugh',   emoji: '😂', label: 'Just Laugh',  desc: 'Light, fun, no pressure' },
  { id: 'vent',    emoji: '😤', label: 'Vent',        desc: 'Someone to listen to you' },
  { id: 'gaming',  emoji: '🎮', label: 'Gaming',      desc: 'Find a gaming buddy' },
  { id: 'music',   emoji: '🎵', label: 'Music',       desc: 'Share what you love' },
  { id: 'culture', emoji: '🌍', label: 'Culture',     desc: 'Explore the world' },
  { id: 'any',     emoji: '✨', label: 'Surprise me', desc: 'Open to anything' },
]

const CHAT_MODES = [
  { id: 'text',  icon: '💬', label: 'Text Only',  sub: 'No camera. Instant.' },
  { id: 'video', icon: '🎥', label: 'Video Chat', sub: 'Face to face.' },
]

export default function MoodSelect({ onContinue, onBack, theme, onToggleTheme }) {
  useCanonical('https://www.miloo.chat/mood')
  const [selectedMood, setSelectedMood] = useState('any')
  const [chatMode, setChatMode] = useState('text')

  function handleContinue() {
    trackEvent('mood_selected', { mood: selectedMood })
    trackEvent('chat_mode_selected', { mode: chatMode })
    onContinue({ mood: selectedMood, intent: 'random', safeMode: false, chatMode })
  }

  return (
    <>
      <style>{`
        /* Mobile: full-height locked layout, button always visible */
        @media (max-width: 768px) {
          .mood-wrap {
            height: 100dvh !important;
            overflow: hidden !important;
            padding: 0 !important;
            min-height: unset !important;
            display: flex !important;
            flex-direction: column !important;
            gap: 0 !important;
          }
          .mood-nav {
            padding: 10px 16px !important;
            flex-shrink: 0;
          }
          .mood-header {
            padding: 8px 16px 4px !important;
            flex-shrink: 0;
          }
          .mood-header h2 {
            font-size: 18px !important;
            margin-bottom: 2px !important;
          }
          .mood-header p {
            font-size: 12px !important;
          }
          .mood-mode-section {
            flex-shrink: 0;
            padding: 6px 16px 0 !important;
            gap: 0 !important;
          }
          .mood-mode-label {
            display: none !important;
          }
          .mood-mode-grid {
            display: flex !important;
            gap: 8px !important;
          }
          .mood-mode-btn {
            flex: 1;
            padding: 9px 8px !important;
            border-radius: 12px !important;
            min-height: 44px !important;
            min-width: unset !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 6px !important;
          }
          .mood-mode-icon { font-size: 16px !important; }
          .mood-mode-title { font-size: 13px !important; }
          .mood-mode-sub { font-size: 11px !important; }
          .mood-grid-section {
            flex: 1 !important;
            overflow-y: auto !important;
            -webkit-overflow-scrolling: touch !important;
            padding: 6px 16px !important;
            gap: 0 !important;
          }
          .mood-grid-label { display: none !important; }
          .mood-grid {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 8px !important;
          }
          .mood-card {
            padding: 10px 10px !important;
            min-height: 68px !important;
            border-radius: 12px !important;
            min-width: unset !important;
          }
          .mood-card-emoji { font-size: 20px !important; margin-bottom: 4px !important; }
          .mood-card-label { font-size: 12px !important; }
          .mood-card-desc { font-size: 10px !important; }
          .mood-cta-wrap {
            flex-shrink: 0 !important;
            padding: 8px 16px 16px !important;
          }
          .mood-cta-btn {
            min-height: 52px !important;
            font-size: 15px !important;
            padding: 14px !important;
          }
        }

        /* Desktop: original scrollable layout */
        @media (min-width: 769px) {
          .mood-wrap {
            min-height: 100vh;
            overflow: visible;
          }
          .mood-mode-btn {
            padding: 18px 14px;
            border-radius: 16px;
            text-align: left;
            display: block;
          }
          .mood-mode-icon { font-size: 26px; display: block; margin-bottom: 8px; }
          .mood-mode-title { font-size: 14px; }
          .mood-mode-sub { font-size: 12px; }
          .mood-grid {
            grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
            gap: 10px;
          }
          .mood-card { padding: 18px 14px; border-radius: 16px; }
          .mood-card-emoji { font-size: 26px; margin-bottom: 8px; }
          .mood-card-label { font-size: 13px; }
          .mood-card-desc { font-size: 11px; }
          .mood-cta-btn { padding: 18px; font-size: 16px; }
        }
      `}</style>

      <div
        className="page-enter mood-wrap"
        style={{ background: 'var(--bg-0)' }}
      >
        {/* ── Navbar ── */}
        <nav className="mood-nav" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 24px', borderBottom: '1px solid var(--border-1)',
          position: 'sticky', top: 0, zIndex: 20, background: 'var(--bg-0)',
        }}>
          <button onClick={onBack} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-3)', fontSize: '14px', fontWeight: '600',
            display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 0',
            minHeight: 'unset', minWidth: 'unset',
          }}>← Back</button>
          <span style={{ fontSize: '18px', fontWeight: '900', letterSpacing: '-0.06em', color: 'var(--text-1)' }}>
            miloo
          </span>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </nav>

        {/* ── Inner content wrapper (desktop: centered column) ── */}
        <div style={{ maxWidth: '520px', margin: '0 auto', display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

          {/* Header */}
          <div className="mood-header" style={{ textAlign: 'center', padding: '32px 20px 0' }}>
            <h2 style={{
              color: 'var(--text-1)', fontSize: 'clamp(22px, 5vw, 36px)',
              fontWeight: '800', letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: '8px',
            }}>
              What's your vibe?
            </h2>
            <p style={{ color: 'var(--text-3)', fontSize: '14px', lineHeight: 1.5 }}>
              Pick a mood — we'll find someone on the same wavelength.
            </p>
          </div>

          {/* ── Chat mode selector ── */}
          <div className="mood-mode-section" style={{ padding: '24px 20px 0' }}>
            <p className="mood-mode-label" style={{
              color: 'var(--text-3)', fontSize: '11px', fontWeight: '700',
              letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '10px',
            }}>
              How do you want to chat?
            </p>
            <div className="mood-mode-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {CHAT_MODES.map(m => (
                <button
                  key={m.id}
                  className="mood-mode-btn"
                  onClick={() => setChatMode(m.id)}
                  style={{
                    border: 'none', cursor: 'pointer',
                    background: chatMode === m.id ? 'var(--accent)' : 'var(--bg-2)',
                    outline: chatMode === m.id ? 'none' : '1px solid var(--border-1)',
                    boxShadow: chatMode === m.id ? 'var(--accent-glow)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span className="mood-mode-icon">{m.icon}</span>
                  <div>
                    <div className="mood-mode-title" style={{
                      color: chatMode === m.id ? 'var(--accent-text)' : 'var(--text-1)',
                      fontWeight: '700', lineHeight: 1.2,
                    }}>{m.label}</div>
                    <div className="mood-mode-sub" style={{
                      color: chatMode === m.id ? 'rgba(255,255,255,0.6)' : 'var(--text-3)',
                      lineHeight: 1.3,
                    }}>{m.sub}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* ── Mood grid ── */}
          <div className="mood-grid-section" style={{ padding: '24px 20px 0', flex: 1 }}>
            <p className="mood-grid-label" style={{
              color: 'var(--text-3)', fontSize: '11px', fontWeight: '700',
              letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '10px',
            }}>
              Pick your mood
            </p>
            <div className="mood-grid" style={{ display: 'grid' }}>
              {moods.map(mood => (
                <button
                  key={mood.id}
                  className="mood-card"
                  onClick={() => setSelectedMood(mood.id)}
                  style={{
                    border: 'none', cursor: 'pointer', textAlign: 'left',
                    background: selectedMood === mood.id ? 'var(--accent-dim)' : 'var(--bg-2)',
                    outline: selectedMood === mood.id
                      ? '2px solid var(--accent-border)'
                      : '1px solid var(--border-1)',
                    transition: 'all 0.13s ease',
                    minWidth: 'unset',
                  }}
                >
                  <div className="mood-card-emoji">{mood.emoji}</div>
                  <div className="mood-card-label" style={{
                    color: selectedMood === mood.id ? 'var(--accent)' : 'var(--text-1)',
                    fontWeight: '700', marginBottom: '2px',
                  }}>{mood.label}</div>
                  <div className="mood-card-desc" style={{ color: 'var(--text-3)', lineHeight: 1.3 }}>{mood.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* ── CTA — always visible ── */}
          <div className="mood-cta-wrap" style={{ padding: '24px 20px 40px', flexShrink: 0 }}>
            <button
              className="mood-cta-btn"
              onClick={handleContinue}
              style={{
                width: '100%', borderRadius: '999px', border: 'none',
                cursor: 'pointer', background: 'var(--accent)', color: 'var(--accent-text)',
                fontWeight: '700', boxShadow: 'var(--accent-glow)', letterSpacing: '-0.01em',
                minWidth: 'unset',
              }}
            >
              {chatMode === 'text' ? 'Find Someone to Chat With →' : 'Find My Match →'}
            </button>
          </div>

        </div>
      </div>
    </>
  )
}
