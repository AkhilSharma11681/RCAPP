// client/src/components/Navbar.jsx
//
// Shared top navigation used across non-chat pages.
// Clean, minimal, fully responsive. Renders nothing if no nav items.

import { useNavigate } from 'react-router-dom'
import ThemeToggle from './ThemeToggle'
import Logo from './Logo'

export default function Navbar({ theme, onToggleTheme, rightSlot, transparent = false }) {
  const navigate = useNavigate()
  return (
    <nav
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px clamp(16px, 4vw, 32px)',
        background: transparent ? 'transparent' : 'var(--bg-0)',
        borderBottom: transparent ? '1px solid transparent' : '1px solid var(--border-1)',
        backdropFilter: transparent ? 'none' : 'saturate(180%) blur(12px)',
        WebkitBackdropFilter: transparent ? 'none' : 'saturate(180%) blur(12px)',
        transition: 'background 0.25s ease, border-color 0.25s ease',
      }}
    >
      <button
        onClick={() => navigate('/')}
        aria-label="Go to home"
        className="compact"
        style={{
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Logo size={28} />
        <span
          style={{
            fontSize: '20px',
            fontWeight: 800,
            letterSpacing: '-0.05em',
            color: 'var(--text-1)',
          }}
        >
          miloo
        </span>
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {rightSlot}
        {onToggleTheme ? <ThemeToggle theme={theme} onToggle={onToggleTheme} /> : null}
      </div>
    </nav>
  )
}
