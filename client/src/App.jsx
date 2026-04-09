import { useState } from 'react'
import Home from './pages/Home'
import MoodSelect from './pages/MoodSelect'
import ChatRoom from './pages/ChatRoom'
import Terms from './pages/Terms'

export default function App() {
  const [page, setPage] = useState('home')
  const [selectedMood, setSelectedMood] = useState(null)
  const [safeMode, setSafeMode] = useState(false)

  const goToMood = () => setPage('mood')
  const goToChat = (mood, safe) => { setSelectedMood(mood); setSafeMode(safe); setPage('chat') }
  const goHome = () => { setSelectedMood(null); setSafeMode(false); setPage('home') }

  return (
    <>
      {page === 'home' && <Home onStart={goToMood} onTerms={() => setPage('terms')} />}
      {page === 'mood' && <MoodSelect onMoodSelect={goToChat} />}
      {page === 'chat' && <ChatRoom mood={selectedMood} safeMode={safeMode} onExit={goHome} />}
      {page === 'terms' && <Terms onBack={goHome} />}
    </>
  )
}
