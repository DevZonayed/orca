import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

// Respect system dark mode preference
function applySystemTheme(): void {
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  document.documentElement.classList.toggle('dark', isDark)
}

applySystemTheme()
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applySystemTheme)

// ---------------------------------------------------------------------------
// Ctrl+Click to open terminal links
// ---------------------------------------------------------------------------
// Restty (the terminal renderer) detects URLs in terminal output and calls
// window.open() on any left-click over a detected link. In Electron,
// window.open with "noopener,noreferrer" may not properly trigger
// setWindowOpenHandler. We override window.open to:
//   1. Route http/https URLs through shell.openExternal (reliable in Electron)
//   2. Only open when Ctrl (Linux/Windows) or Cmd (macOS) was held — matching
//      the standard Ctrl+Click-to-open-link UX in terminals like VS Code.
// ---------------------------------------------------------------------------
let lastPointerModifiers = { ctrlKey: false, metaKey: false }
window.addEventListener(
  'pointerup',
  (e) => {
    lastPointerModifiers = { ctrlKey: e.ctrlKey, metaKey: e.metaKey }
  },
  { capture: true }
)

const originalWindowOpen = window.open.bind(window)
window.open = function (
  url?: string | URL,
  target?: string,
  features?: string
): WindowProxy | null {
  if (url) {
    const urlStr = url.toString()
    try {
      const parsed = new URL(urlStr)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        if (lastPointerModifiers.ctrlKey || lastPointerModifiers.metaKey) {
          window.api.shell.openExternal(urlStr)
        }
        return null
      }
    } catch {
      // not a valid URL — fall through to original
    }
  }
  return originalWindowOpen(url, target, features)
} as typeof window.open

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
