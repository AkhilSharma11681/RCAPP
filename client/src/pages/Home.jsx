// client/src/pages/Home.jsx
// Direct-CTA entry surface. No intermediate mood step for the primary
// "Start Text Chat" / "Start Video Chat" buttons — App.jsx owns the
// routing state and pushes users straight into /chat via goToChat().
// The /mood route is preserved as a secondary path for users who want
// mood-specific matching.
import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const SERVER =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SERVER_URL) ||
  (typeof window !== 'undefined' && window.location.origin.replace(/:\d+$/, ':5055')) ||
  'http://localhost:5055'

export default function Home({
  onStartText,
  onStartVideo,
  onTerms,
  theme = 'dark',
  onToggleTheme,
}) {
  const navigate = useNavigate()
  const [liveStats, setLiveStats] = useState(null)

  useEffect(() => {
    let cancelled = false
    const fetchStats = () => {
      fetch(`${SERVER}/api/health`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (cancelled) return
          if (data) setLiveStats(data)
        })
        .catch(() => {
          if (!cancelled) setLiveStats({ onlineUsers: 0, waitingUsers: 0, activePairs: 0 })
        })
    }
    fetchStats()
    const timer = setInterval(fetchStats, 10000) // REQ-UX-01
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  const statsLabel =
    liveStats && liveStats.onlineUsers > 0
      ? `${liveStats.onlineUsers} people online now`
      : 'Be the first to start a conversation ✨'

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '40px 20px',
        textAlign: 'center',
        fontFamily: 'sans-serif',
        background: 'var(--bg-0, #0b0b14)',
        color: 'var(--text-1, #f3f4f6)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          maxWidth: '640px',
          margin: '0 auto 24px',
        }}
      >
        <h2 style={{ margin: 0 }}>Miloo Chat</h2>
        {onToggleTheme ? (
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label="Toggle theme"
            style={{
              background: 'transparent',
              border: '1px solid var(--border-1, #2a2a3a)',
              color: 'var(--text-1, #f3f4f6)',
              borderRadius: '8px',
              padding: '6px 10px',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        ) : null}
      </div>

      {/* REQ-UX-01 / REQ-FB-01 Stats Pill */}
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 16px',
          borderRadius: '999px',
          background: 'var(--bg-1, #e0e7ff)',
          border: '1px solid var(--border-1, #c7d2fe)',
          color: 'var(--text-2, #4f46e5)',
          fontSize: '14px',
          fontWeight: 700,
          marginBottom: '32px',
        }}
      >
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: 'var(--text-2, #4f46e5)',
            display: 'inline-block',
          }}
        />
        {statsLabel}
      </div>

      {/* Primary Funnel Layout — direct CTAs */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          width: '100%',
          maxWidth: '300px',
          margin: '0 auto',
        }}
      >
        <button
          type="button"
          onClick={onStartText}
          aria-label="Start text chat"
          style={{
            padding: '16px 32px',
            fontSize: '16px',
            fontWeight: 700,
            background: 'var(--accent, #4f46e5)',
            color: '#fff',
            borderRadius: '12px',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Start Text Chat →
        </button>
        <button
          type="button"
          onClick={onStartVideo}
          aria-label="Start video chat"
          style={{
            padding: '14px 24px',
            fontSize: '14px',
            fontWeight: 600,
            background: 'transparent',
            color: 'var(--text-1, #1f2937)',
            borderRadius: '12px',
            border: '1px solid var(--border-1, #d1d5db)',
            cursor: 'pointer',
          }}
        >
          📹 Start Video Chat
        </button>

        <button
          type="button"
          onClick={() => navigate('/mood')}
          style={{
            marginTop: '8px',
            padding: '10px 16px',
            fontSize: '13px',
            background: 'transparent',
            color: 'var(--text-3, #6b7280)',
            border: 'none',
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >
          Or pick a mood first
        </button>
      </div>

      {onTerms ? (
        <button
          type="button"
          onClick={onTerms}
          style={{
            marginTop: '32px',
            background: 'none',
            border: 'none',
            color: 'var(--text-3, #6b7280)',
            cursor: 'pointer',
            fontSize: '12px',
            textDecoration: 'underline',
          }}
        >
          Terms
        </button>
      ) : null}
    </div>
  )
}
