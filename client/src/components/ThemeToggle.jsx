export default function ThemeToggle({ theme, onToggle, style = {} }) {
  const isDark = theme === 'dark'
  return (
    <button
      onClick={onToggle}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      style={{
        width: '36px', height: '36px', borderRadius: '50%',
        background: 'var(--surface-2)',
        border: '1px solid var(--border-1)',
        color: 'var(--text-2)',
        fontSize: '15px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', flexShrink: 0,
        transition: 'background 0.2s ease, border-color 0.2s ease',
        ...style,
      }}
    >
      {isDark ? '☀️' : '🌙'}
    </button>
  )
}
