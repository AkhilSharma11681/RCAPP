import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import Home from './pages/Home'
import ChatRoom from './pages/ChatRoom'
import Terms from './pages/Terms'
import OmegleAlternative from './pages/blog/OmegleAlternative'
import RandomVideoChatIndia from './pages/blog/RandomVideoChatIndia'
import StrangerChatIndia from './pages/blog/StrangerChatIndia'
import VideoChatNoSignup from './pages/blog/VideoChatNoSignup'
import { trackEvent } from './utils/analytics'

function AppRoutes() {
  const navigate = useNavigate()
  const location = useLocation()

  const [selectedMood, setSelectedMood] = useState(null)
  const [selectedIntent, setSelectedIntent] = useState(null)
  const [safeMode, setSafeMode] = useState(false)
  const [chatMode, setChatMode] = useState('video')

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

  useEffect(() => {
    const handleEsc = event => {
      if (event.key === 'Escape' && location.pathname !== '/') {
        navigate('/')
      }
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [location.pathname, navigate])

  const startTextChat = () => {
    goToChat({ mood: 'any', intent: 'random', safeMode: false, chatMode: 'text' })
  }

  const startVideoChat = () => {
    goToChat({ mood: 'any', intent: 'random', safeMode: false, chatMode: 'video' })
  }


  const goToChat = ({ mood, intent, safeMode: safe, chatMode: mode }) => {
    trackEvent('go_to_chat', { mood, intent, chatMode: mode || 'video' })
    setSelectedMood(mood)
    setSelectedIntent(intent)
    setSafeMode(safe)
    setChatMode(mode || 'video')
    navigate('/chat')
  }

  const goHome = () => {
    setSelectedMood(null)
    setSelectedIntent(null)
    setSafeMode(false)
    setChatMode('video')
    navigate('/')
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          <Home
            onStartText={startTextChat}
            onStartVideo={startVideoChat}
            onTerms={() => navigate('/terms')}
            theme={theme}
            onToggleTheme={toggleTheme}
          />
        }
      />

      <Route
        path="/chat"
        element={
          selectedMood && selectedIntent ? (
            <ChatRoom
              mood={selectedMood}
              intent={selectedIntent}
              safeMode={safeMode}
              chatMode={chatMode}
              theme={theme}
              onToggleTheme={toggleTheme}
              onExit={goHome}
            />
          ) : (
            <Navigate to="/" replace />
          )
        }
      />
      <Route
        path="/terms"
        element={
          <Terms onBack={goHome} theme={theme} onToggleTheme={toggleTheme} />
        }
      />
      <Route
        path="/blog/omegle-alternative"
        element={<OmegleAlternative />}
      />
      <Route
        path="/blog/random-video-chat-india"
        element={<RandomVideoChatIndia />}
      />
      <Route path="/blog/stranger-chat-india" element={<StrangerChatIndia />}
      />
      <Route path="/blog/video-chat-no-signup" element={<VideoChatNoSignup />}
      />
      {/* Catch-all: redirect unknown paths to home */}
      <Route path="*" element={<RedirectHome />} />
    </Routes>
  )
}

function RedirectHome() {
  const navigate = useNavigate()
  useEffect(() => { navigate('/', { replace: true }) }, [navigate])
  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
