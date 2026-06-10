// client/src/pages/Terms.jsx
//
// Safety, terms & privacy page. Clean card layout, fully responsive.

import { useNavigate } from 'react-router-dom'
import useCanonical from '../hooks/useCanonical'
import Navbar from '../components/Navbar'
import Logo from '../components/Logo'

const sections = [
  {
    icon: '🔞',
    title: '18+ Only',
    desc: 'Miloo is only for adults. If someone is under 18, they should not use the platform.',
  },
  {
    icon: '🕶️',
    title: 'Anonymous by Design',
    desc: 'You do not need to create an account to start chatting. Avoid sharing your name, phone number, social handles, address, or any private details.',
  },
  {
    icon: '🤝',
    title: 'Respect Is Mandatory',
    desc: 'Harassment, threats, hate, spam, coercion, and abusive behavior are not allowed. Reports can lead to removal or bans.',
  },
  {
    icon: '🚫',
    title: 'No Sexual Misconduct',
    desc: 'Sexually explicit behavior, exploitation, nudity, and predatory conduct are prohibited. Safety comes before growth.',
  },
  {
    icon: '🛑',
    title: 'No Spam or Promotion',
    desc: 'Bots, repeated copy-paste messages, suspicious links, promotions, and attempts to move users off-platform too quickly may be blocked.',
  },
  {
    icon: '⚠️',
    title: 'Use Caution',
    desc: 'Even in anonymous products, strangers are still strangers. If something feels wrong, leave, block, or report immediately.',
  },
  {
    icon: '🗂️',
    title: 'Limited Session Data',
    desc: 'The experience may use temporary technical identifiers to support matching, abuse prevention, and safety systems. Do not assume other users are verified.',
  },
  {
    icon: '🔄',
    title: 'Rules Can Change',
    desc: 'Miloo may update these terms, safety rules, and moderation systems as the product evolves.',
  },
]

export default function Terms({ onBack, theme, onToggleTheme }) {
  useCanonical('https://www.miloo.chat/terms')
  const navigate = useNavigate()
  const handleBack = onBack || (() => navigate('/'))

  return (
    <div className="page page-enter" style={{ background: 'var(--bg-0)' }}>
      <Navbar theme={theme} onToggleTheme={onToggleTheme} />

      <main
        className="container"
        style={{
          flex: 1,
          paddingTop: 'clamp(24px, 4vh, 40px)',
          paddingBottom: 'clamp(40px, 6vh, 60px)',
          width: '100%',
        }}
      >
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          {/* Header card */}
          <header
            className="glass"
            style={{
              padding: 'clamp(20px, 3vw, 32px)',
              borderRadius: 'var(--radius-xl)',
              marginBottom: 'clamp(20px, 3vh, 28px)',
            }}
          >
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 'var(--radius-pill)',
                background: 'var(--accent-dim)',
                border: '1px solid var(--accent-border)',
                color: 'var(--accent-2)',
                fontSize: 12,
                fontWeight: 700,
                marginBottom: 16,
              }}
            >
              <span aria-hidden="true">🛡️</span>
              <span>Safety, Terms & Privacy</span>
            </div>

            <h1
              style={{
                fontSize: 'clamp(28px, 5vw, 44px)',
                fontWeight: 800,
                letterSpacing: '-0.04em',
                lineHeight: 1.05,
                color: 'var(--text-1)',
                marginBottom: 12,
              }}
            >
              Keep Miloo{' '}
              <span className="gradient-text">human, safe, and worth returning to.</span>
            </h1>

            <p
              style={{
                color: 'var(--text-2)',
                fontSize: 'clamp(14px, 1.5vw, 16px)',
                lineHeight: 1.7,
                maxWidth: 620,
              }}
            >
              Miloo works best when people show up with respect, curiosity, and boundaries.
              These rules exist to protect users and keep the experience from becoming
              another chaotic random chat app.
            </p>

            <div
              style={{
                marginTop: 16,
                color: 'var(--text-3)',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Last updated: April 2026
            </div>
          </header>

          {/* Rules grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
              gap: 12,
              marginBottom: 20,
            }}
          >
            {sections.map((section) => (
              <article
                key={section.title}
                className="card-hover"
                style={{
                  padding: 'clamp(16px, 2.5vw, 20px)',
                  borderRadius: 'var(--radius-lg)',
                  background: 'var(--surface-1)',
                  border: '1px solid var(--border-1)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    aria-hidden="true"
                    style={{
                      fontSize: 20,
                      width: 36,
                      height: 36,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--accent-dim)',
                      flexShrink: 0,
                    }}
                  >
                    {section.icon}
                  </span>
                  <h3
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: 'var(--text-1)',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {section.title}
                  </h3>
                </div>
                <p
                  style={{
                    fontSize: 14,
                    color: 'var(--text-2)',
                    lineHeight: 1.65,
                  }}
                >
                  {section.desc}
                </p>
              </article>
            ))}
          </div>

          {/* Smart safety habits */}
          <section
            style={{
              padding: 'clamp(18px, 3vw, 24px)',
              borderRadius: 'var(--radius-lg)',
              background:
                'linear-gradient(135deg, rgba(124,58,237,0.10), rgba(79,70,229,0.10))',
              border: '1px solid var(--accent-border)',
              marginBottom: 20,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginBottom: 12,
              }}
            >
              <span aria-hidden="true" style={{ fontSize: 20 }}>
                💡
              </span>
              <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-1)' }}>
                Smart safety habits
              </h3>
            </div>
            <ul
              style={{
                display: 'grid',
                gap: 8,
                color: 'var(--text-2)',
                fontSize: 14,
                lineHeight: 1.65,
                paddingLeft: 0,
                listStyle: 'none',
                margin: 0,
              }}
            >
              {[
                'Do not share phone numbers, Instagram, Snapchat, Telegram, or payment details too quickly.',
                'If a chat feels pushy, sexual, manipulative, or suspicious, leave immediately.',
                'Use Safe Mode if you want a softer start with more control.',
                'Reporting helps improve trust and removes harmful users faster.',
              ].map((tip) => (
                <li
                  key={tip}
                  style={{
                    display: 'flex',
                    gap: 10,
                    paddingLeft: 0,
                  }}
                >
                  <span style={{ color: 'var(--accent-2)', flexShrink: 0 }}>•</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Footer card */}
          <footer
            className="glass"
            style={{
              padding: 'clamp(16px, 2.5vw, 22px)',
              borderRadius: 'var(--radius-lg)',
              textAlign: 'center',
            }}
          >
            <p
              style={{
                fontSize: 13,
                color: 'var(--text-3)',
                lineHeight: 1.7,
                margin: 0,
              }}
            >
              Questions or support:
              <br />
              <a
                href="mailto:support@miloo.app"
                style={{ color: 'var(--accent-2)', fontWeight: 700, textDecoration: 'none' }}
              >
                support@miloo.app
              </a>
            </p>
          </footer>

          <div style={{ textAlign: 'center', marginTop: 24 }}>
            <button
              onClick={handleBack}
              className="compact"
              style={{
                background: 'var(--surface-1)',
                color: 'var(--text-2)',
                fontSize: 14,
                fontWeight: 600,
                padding: '10px 20px',
                borderRadius: 'var(--radius-pill)',
                border: '1px solid var(--border-1)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span aria-hidden="true">←</span>
              <span>Back to home</span>
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              marginTop: 32,
              color: 'var(--text-3)',
              fontSize: 12,
            }}
          >
            <Logo size={16} />
            <span>© {new Date().getFullYear()} Miloo · Made with care</span>
          </div>
        </div>
      </main>
    </div>
  )
}
