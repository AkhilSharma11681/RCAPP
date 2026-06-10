// client/src/pages/MoodSelect.jsx
//
// Mobile-first mood + mode selector. Two columns on desktop,
// single column with sticky CTA on mobile.

import { useState } from 'react'
import Navbar from '../components/Navbar'
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

export default function MoodSelect({ onContinue, theme, onToggleTheme }) {
  useCanonical('https://www.miloo.chat/mood')
  const [selectedMood, setSelectedMood] = useState('any')
  const [chatMode, setChatMode] = useState('text')

  function handleContinue() {
    trackEvent('mood_selected', { mood: selectedMood })
    trackEvent('chat_mode_selected', { mode: chatMode })
    onContinue({ mood: selectedMood, intent: 'random', safeMode: false, chatMode })
  }

  return (
    <div className="page page-enter" style={{ background: 'var(--bg-0)' }}>
      <Navbar theme={theme} onToggleTheme={onToggleTheme} />

      <main
        className="container"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          maxWidth: 560,
          width: '100%',
          paddingTop: 'clamp(24px, 4vh, 40px)',
          paddingBottom: 'clamp(24px, 4vh, 40px)',
        }}
      >
        {/* Header */}
        <header style={{ textAlign: 'center', marginBottom: 'clamp(20px, 3vh, 28px)' }}>
          <h1
            style={{
              fontSize: 'clamp(24px, 4.5vw, 36px)',
              fontWeight: 800,
              letterSpacing: '-0.03em',
              lineHeight: 1.1,
              color: 'var(--text-1)',
              marginBottom: 8,
            }}
          >
            What's your <span className="gradient-text">vibe</span>?
          </h1>
          <p
            style={{
              color: 'var(--text-3)',
              fontSize: 'clamp(13px, 1.5vw, 15px)',
              lineHeight: 1.5,
              maxWidth: 380,
              margin: '0 auto',
            }}
          >
            Pick a mood — we'll find someone on the same wavelength.
          </p>
        </header>

        {/* ── Chat mode selector ── */}
        <section style={{ marginBottom: 'clamp(20px, 3vh, 28px)' }}>
          <SectionLabel>How do you want to chat?</SectionLabel>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 10,
            }}
          >
            {CHAT_MODES.map((m) => (
              <ModeButton
                key={m.id}
                mode={m}
                active={chatMode === m.id}
                onClick={() => setChatMode(m.id)}
              />
            ))}
          </div>
        </section>

        {/* ── Mood grid ── */}
        <section style={{ flex: 1, marginBottom: 'clamp(20px, 3vh, 24px)' }}>
          <SectionLabel>Pick your mood</SectionLabel>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 140px), 1fr))',
              gap: 10,
            }}
          >
            {moods.map((mood) => (
              <MoodCard
                key={mood.id}
                mood={mood}
                active={selectedMood === mood.id}
                onClick={() => setSelectedMood(mood.id)}
              />
            ))}
          </div>
        </section>

        {/* ── Sticky CTA ── */}
        <div
          style={{
            position: 'sticky',
            bottom: 0,
            paddingTop: 12,
            paddingBottom: 12,
            background: 'linear-gradient(to top, var(--bg-0) 60%, transparent)',
          }}
        >
          <button
            onClick={handleContinue}
            className="fade-in-up"
            style={{
              width: '100%',
              padding: 'clamp(14px, 2vw, 18px) 22px',
              fontSize: 'clamp(15px, 1.6vw, 16px)',
              fontWeight: 700,
              letterSpacing: '-0.01em',
              color: 'var(--accent-text)',
              background: 'var(--gradient-cta)',
              border: 'none',
              borderRadius: 'var(--radius-pill)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: 'var(--accent-glow)',
              transition: 'transform 0.15s ease, box-shadow 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px)'
              e.currentTarget.style.boxShadow = 'var(--shadow-glow)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = 'var(--accent-glow)'
            }}
          >
            {chatMode === 'text' ? 'Find Someone to Chat With' : 'Find My Match'}
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </main>
    </div>
  )
}

/* ── Subcomponents ── */

function SectionLabel({ children }) {
  return (
    <p
      style={{
        color: 'var(--text-3)',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        marginBottom: 10,
      }}
    >
      {children}
    </p>
  )
}

function ModeButton({ mode, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className="card-hover"
      style={{
        textAlign: 'left',
        padding: 'clamp(12px, 2vw, 16px)',
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        background: active ? 'var(--accent-dim)' : 'var(--surface-1)',
        border: active
          ? '2px solid var(--accent)'
          : '1px solid var(--border-1)',
        boxShadow: active ? 'var(--accent-glow-soft)' : 'none',
        transition: 'all 0.18s ease',
        minHeight: 64,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <span style={{ fontSize: 22, lineHeight: 1 }} aria-hidden="true">
        {mode.icon}
      </span>
      <div>
        <div
          style={{
            color: active ? 'var(--accent)' : 'var(--text-1)',
            fontWeight: 700,
            fontSize: 14,
            lineHeight: 1.2,
          }}
        >
          {mode.label}
        </div>
        <div
          style={{
            color: 'var(--text-3)',
            fontSize: 12,
            lineHeight: 1.3,
            marginTop: 2,
          }}
        >
          {mode.sub}
        </div>
      </div>
    </button>
  )
}

function MoodCard({ mood, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className="card-hover"
      style={{
        textAlign: 'left',
        padding: 'clamp(14px, 2vw, 18px) 14px',
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        background: active ? 'var(--accent-dim)' : 'var(--surface-1)',
        border: active ? '2px solid var(--accent)' : '1px solid var(--border-1)',
        transition: 'all 0.18s ease',
        minHeight: 90,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <span style={{ fontSize: 24, lineHeight: 1 }} aria-hidden="true">
        {mood.emoji}
      </span>
      <div>
        <div
          style={{
            color: active ? 'var(--accent)' : 'var(--text-1)',
            fontWeight: 700,
            fontSize: 14,
            lineHeight: 1.2,
          }}
        >
          {mood.label}
        </div>
        <div
          style={{
            color: 'var(--text-3)',
            fontSize: 12,
            lineHeight: 1.3,
            marginTop: 2,
          }}
        >
          {mood.desc}
        </div>
      </div>
    </button>
  )
}
