import { useEffect, useState } from 'react'
import Home from './pages/Home'
import MoodSelect from './pages/MoodSelect'
import ChatRoom from './pages/ChatRoom'
import Terms from './pages/Terms'

export default function App() {
  const [page, setPage] = useState('home')
  const [selectedMood, setSelectedMood] = useState(null)
  const [selectedIntent, setSelectedIntent] = useState(null)
  const [safeMode, setSafeMode] = useState(true)

  useEffect(() => {
    const handleEsc = event => {
      if (event.key === 'Escape' && page !== 'home') {
        setPage('home')
      }
    }

    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [page])

  const goToMood = () => setPage('mood')

  const goToChat = ({ mood, intent, safeMode: safe }) => {
    setSelectedMood(mood)
    setSelectedIntent(intent)
    setSafeMode(safe)
    setPage('chat')
  }

  const goHome = () => {
    setSelectedMood(null)
    setSelectedIntent(null)
    setSafeMode(true)
    setPage('home')
  }

  return (
    <>
      {page === 'home' && <Home onStart={goToMood} onTerms={() => setPage('terms')} />}
      {page === 'mood' && <MoodSelect onContinue={goToChat} />}
      {page === 'chat' && (
        <ChatRoom
          mood={selectedMood}
          intent={selectedIntent}
          safeMode={safeMode}
          onExit={goHome}
        />
      )}
      {page === 'terms' && <Terms onBack={goHome} />}
    </>
  )
}
