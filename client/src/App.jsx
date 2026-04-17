import { useEffect, useState } from 'react'
import Home from './pages/Home'
import MoodSelect from './pages/MoodSelect'
import ChatRoom from './pages/ChatRoom'
import Terms from './pages/Terms'

function navigate(page) {
  window.history.pushState({ page }, '', `#${page}`)
}

export default function App() {
  const [page, setPage] = useState('home')
  const [selectedMood, setSelectedMood] = useState(null)
  const [selectedIntent, setSelectedIntent] = useState(null)
  const [safeMode, setSafeMode] = useState(false)
  const [chatMode, setChatMode] = useState('video')

  // Theme — default to system preference, persist to localStorage
  const getInitialTheme = () => {
    const saved = localStorage.getItem('miloo-theme')
    if (saved) return saved
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  }
  const [theme, setTheme] = useState(getInitialTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('miloo-theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark')

  // History / back button
  useEffect(() => {
    window.history.replaceState({ page: 'home' }, '', '#home')
    const handlePop = event => {
      const p = event.state?.page || 'home'
      if (p === 'home') {
        setSelectedMood(null)
        setSelectedIntent(null)
        setSafeMode(false)
        setChatMode('video')
      }
      setPage(p)
    }
    window.addEventListener('popstate', handlePop)
    return () => window.removeEventListener('popstate', handlePop)
  }, [])

  useEffect(() => {
    const handleEsc = event => {
      if (event.key === 'Escape' && page !== 'home') goHome()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [page])

  const goToMood = () => { navigate('mood'); setPage('mood') }

  const goToChat = ({ mood, intent, safeMode: safe, chatMode: mode }) => {
    setSelectedMood(mood)
    setSelectedIntent(intent)
    setSafeMode(safe)
    setChatMode(mode || 'video')
    navigate('chat')
    setPage('chat')
  }

  const goHome = () => {
    setSelectedMood(null)
    setSelectedIntent(null)
    setSafeMode(false)
    setChatMode('video')
    navigate('home')
    setPage('home')
  }

  return (
    <>
      {page === 'home' && (
        <Home
          onStart={goToMood}
          onTerms={() => { navigate('terms'); setPage('terms') }}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      )}
      {page === 'mood' && (
        <MoodSelect
          onContinue={goToChat}
          onBack={goHome}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      )}
      {page === 'chat' && (
        <ChatRoom
          mood={selectedMood}
          intent={selectedIntent}
          safeMode={safeMode}
          chatMode={chatMode}
          theme={theme}
          onToggleTheme={toggleTheme}
          onExit={goHome}
        />
      )}
      {page === 'terms' && (
        <Terms onBack={goHome} theme={theme} onToggleTheme={toggleTheme} />
      )}
    </>
  )
}
