import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ThemeToggle from '../components/ThemeToggle'
import useCanonical from '../hooks/useCanonical'

const SERVER =
  window.location.hostname === 'localhost'
    ? 'http://localhost:3001'
    : 'https://rcapp-server.onrender.com'

export default function Home({ onStart, onTerms, theme, onToggleTheme }) {
  useCanonical('https://www.miloo.chat/')
  const navigate = useNavigate()
  const [liveStats, setLiveStats] = useState(null)

  useEffect(() => {
    fetch(SERVER).then(r => r.json()).then(setLiveStats).catch(() => {})
    const t = setInterval(() => {
      fetch(SERVER).then(r => r.json()).then(setLiveStats).catch(() => {})
    }, 15000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="page-scroll page-enter" style={{ background: 'var(--bg-0)', minHeight: '100vh' }}>

      {/* ── Navbar ── */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 24px',
        borderBottom: '1px solid var(--border-1)',
        position: 'sticky', top: 0, zIndex: 20,
        background: 'var(--bg-0)',
      }}>
        <span style={{ fontSize: '20px', fontWeight: '900', letterSpacing: '-0.06em', color: 'var(--text-1)' }}>
          miloo
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {liveStats && (liveStats.active_pairs > 0 || liveStats.waiting_users > 0) && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '5px 12px', borderRadius: '999px',
              background: 'var(--accent-dim)', border: '1px solid var(--accent-border)',
              color: 'var(--accent)', fontSize: '12px', fontWeight: '700',
            }}>
              <span className="blink" style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />
              {liveStats.active_pairs > 0
                ? `🟢 ${liveStats.active_pairs * 2} log abhi baat kar rahe hain`
                : `🟢 ${liveStats.waiting_users} waiting`}
            </div>
          )}
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>
      </nav>

      {/* ── Hero ── */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        textAlign: 'center', padding: '64px 24px 48px',
        maxWidth: '580px', margin: '0 auto',
      }}>

        <h1 style={{
          fontSize: 'clamp(52px, 12vw, 100px)',
          fontWeight: '900', letterSpacing: '-0.07em', lineHeight: 0.88,
          color: 'var(--text-1)', marginBottom: '16px',
        }}>
          Miloo — Free Random Chat
        </h1>

        <h2 style={{
          fontSize: 'clamp(16px, 3vw, 22px)',
          fontWeight: '700', color: 'var(--accent)',
          letterSpacing: '-0.02em', lineHeight: 1.2,
          marginBottom: '20px',
        }}>
          Free Random Chat &amp; Omegle Alternative
        </h2>

        <p style={{
          fontSize: 'clamp(20px, 3.5vw, 28px)',
          fontWeight: '600', color: 'var(--text-1)',
          lineHeight: 1.3, letterSpacing: '-0.02em',
          marginBottom: '14px', maxWidth: '420px',
        }}>
          Meet someone new.<br />Have a real conversation.
        </p>

        <p style={{
          color: 'var(--text-3)', fontSize: '15px', lineHeight: 1.8,
          marginBottom: '40px', maxWidth: '360px',
        }}>
          No signup. No profile. No algorithm.<br />
          Pick a mood and start talking.
        </p>

        {/* CTAs */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: '12px',
          width: '100%', maxWidth: '300px', marginBottom: '40px',
        }}>
          <button onClick={onStart} style={{
            padding: '18px 32px', fontSize: '17px', fontWeight: '700',
            background: 'var(--accent)', color: 'var(--accent-text)',
            borderRadius: '999px', border: 'none', cursor: 'pointer',
            boxShadow: 'var(--accent-glow)',
          }}>
            Start Chatting →
          </button>
          <a href="/terms" style={{
            color: 'inherit', textDecoration: 'none',
            padding: '13px 24px', fontSize: '14px', fontWeight: '500',
            background: 'transparent',
            borderRadius: '999px', border: '1px solid var(--border-1)', cursor: 'pointer',
            display: 'inline-block',
          }}>
            Safety &amp; Terms
          </a>
        </div>

        {/* Trust pills */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: '8px',
          justifyContent: 'center', marginBottom: '24px',
        }}>
          {['No signup', '18+ only', 'Anonymous', 'Text or Video', 'Always free'].map(item => (
            <span key={item} style={{
              background: 'var(--surface-1)', border: '1px solid var(--border-1)',
              color: 'var(--text-3)', borderRadius: '999px',
              padding: '7px 14px', fontSize: '13px', fontWeight: '500',
            }}>{item}</span>
          ))}
        </div>

        {/* Social proof */}
        <div style={{ marginBottom: '40px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-3)', fontSize: '13px', fontWeight: '600', letterSpacing: '0.02em' }}>
            10,000+ conversations started &nbsp;•&nbsp; No signup &nbsp;•&nbsp; No bots &nbsp;•&nbsp; 100% anonymous
          </p>
        </div>

        {/* How it works — responsive grid */}
        <div style={{
          width: '100%',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '12px',
          marginBottom: '56px',
        }}>
          {[
            { emoji: '🎭', label: 'Pick a mood', desc: 'Choose the kind of conversation you want' },
            { emoji: '⚡', label: 'Get matched',  desc: 'We find someone on the same wavelength' },
            { emoji: '💬', label: 'Start talking', desc: 'Text or video — your choice' },
          ].map(step => (
            <div key={step.label} className="card-hover" style={{
              padding: '20px 14px', borderRadius: '18px',
              background: 'var(--bg-2)', border: '1px solid var(--border-1)',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '28px', marginBottom: '10px' }}>{step.emoji}</div>
              <div style={{ color: 'var(--text-1)', fontSize: '13px', fontWeight: '700', marginBottom: '5px' }}>{step.label}</div>
              <div style={{ color: 'var(--text-3)', fontSize: '12px', lineHeight: 1.55 }}>{step.desc}</div>
            </div>
          ))}
        </div>

        {/* FAQ — SEO */}
        <div style={{ width: '100%', textAlign: 'left', marginBottom: '48px' }}>
          <p style={{ color: 'var(--text-3)', fontSize: '11px', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '16px', textAlign: 'center' }}>
            Frequently Asked Questions
          </p>
          {[
            { q: 'Is Miloo free?', a: 'Yes, Miloo is completely free. No subscription, no hidden fees, no signup required.' },
            { q: 'Is Miloo safe?', a: 'Miloo is built with safety in mind — no accounts, no stored video, and a reporting system to remove bad actors. Always use caution with strangers online.' },
            { q: 'What happened to Omegle?', a: 'Omegle shut down in 2023. Miloo is a modern alternative focused on real conversations, mood-based matching, and a safer experience.' },
            { q: 'How is Miloo different from other random chat apps?', a: 'Miloo matches you by mood — deep talk, music, gaming, venting, and more. No bots, no signup, and an AI companion (Milo) keeps you company while you wait for a real match.' },
          ].map(({ q, a }) => (
            <details key={q} style={{ marginBottom: '10px', borderRadius: '14px', background: 'var(--bg-2)', border: '1px solid var(--border-1)', padding: '14px 18px' }}>
              <summary style={{ color: 'var(--text-1)', fontSize: '14px', fontWeight: '700', cursor: 'pointer', listStyle: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {q} <span style={{ color: 'var(--text-3)', fontSize: '18px', fontWeight: '400' }}>+</span>
              </summary>
              <p style={{ color: 'var(--text-3)', fontSize: '13px', lineHeight: 1.7, marginTop: '10px' }}>{a}</p>
            </details>
          ))}
        </div>

      </div>

      {/* ── Footer ── */}
      <footer style={{
        borderTop: '1px solid var(--border-1)',
        padding: '24px',
        textAlign: 'center',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: '8px 20px',
      }}>
        <a
          href="/terms"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-3)', fontSize: '13px', fontWeight: '500', padding: 0,
            textDecoration: 'none',
          }}
        >
          Safety &amp; Terms
        </a>
        <a
          href="/blog/omegle-alternative"
          style={{
            color: 'var(--text-3)', fontSize: '13px', fontWeight: '500',
            textDecoration: 'none',
          }}
        >
          Best Omegle Alternatives in India 2026
        </a>
        <span style={{ color: 'var(--text-3)', fontSize: '13px' }}>
          © {new Date().getFullYear()} Miloo
        </span>
      </footer>

    </div>
  )
}
