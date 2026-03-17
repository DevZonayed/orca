import { useEffect } from 'react'
import { useAppStore } from './store'
import { useIpcEvents } from './hooks/useIpcEvents'
import Sidebar from './components/Sidebar'
import Terminal from './components/Terminal'
import Landing from './components/Landing'
import Settings from './components/Settings'

function App(): React.JSX.Element {
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const activeView = useAppStore((s) => s.activeView)
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const fetchRepos = useAppStore((s) => s.fetchRepos)
  const fetchSettings = useAppStore((s) => s.fetchSettings)

  // Subscribe to IPC push events
  useIpcEvents()

  // Fetch initial data
  useEffect(() => {
    fetchRepos()
    fetchSettings()
  }, [fetchRepos, fetchSettings])

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      <div className="titlebar">
        <div className="titlebar-traffic-light-pad" />
        <button className="sidebar-toggle" onClick={toggleSidebar} title="Toggle sidebar">
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <line x1="2" y1="4" x2="14" y2="4" />
            <line x1="2" y1="8" x2="14" y2="8" />
            <line x1="2" y1="12" x2="14" y2="12" />
          </svg>
        </button>
        <div className="titlebar-title">Orca</div>
        <div className="titlebar-spacer" />
      </div>
      <div className="flex flex-row flex-1 overflow-hidden">
        <Sidebar />
        {activeView === 'settings' ? <Settings /> : activeWorktreeId ? <Terminal /> : <Landing />}
      </div>
    </div>
  )
}

export default App
