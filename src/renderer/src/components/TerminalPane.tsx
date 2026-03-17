import { useEffect, useRef } from 'react'
import { Restty, getBuiltinTheme } from 'restty'
import { useAppStore } from '../store'

type PtyTransport = {
  connect: (options: {
    url: string
    cols?: number
    rows?: number
    callbacks: {
      onConnect?: () => void
      onDisconnect?: () => void
      onData?: (data: string) => void
      onStatus?: (shell: string) => void
      onError?: (message: string, errors?: string[]) => void
      onExit?: (code: number) => void
    }
  }) => void | Promise<void>
  disconnect: () => void
  sendInput: (data: string) => boolean
  resize: (
    cols: number,
    rows: number,
    meta?: { widthPx?: number; heightPx?: number; cellW?: number; cellH?: number }
  ) => boolean
  isConnected: () => boolean
  destroy?: () => void | Promise<void>
}

const OSC_TITLE_RE = /\x1b\]([012]);([^\x07\x1b]*?)(?:\x07|\x1b\\)/g

function extractLastOscTitle(data: string): string | null {
  let last: string | null = null
  let m: RegExpExecArray | null
  OSC_TITLE_RE.lastIndex = 0
  while ((m = OSC_TITLE_RE.exec(data)) !== null) {
    last = m[2]
  }
  return last
}

function createIpcPtyTransport(
  cwd?: string,
  onPtyExit?: () => void,
  onTitleChange?: (title: string) => void,
  onPtySpawn?: (ptyId: string) => void
): PtyTransport {
  let connected = false
  let ptyId: string | null = null
  let storedCallbacks: {
    onConnect?: () => void
    onDisconnect?: () => void
    onData?: (data: string) => void
    onStatus?: (shell: string) => void
    onError?: (message: string, errors?: string[]) => void
    onExit?: (code: number) => void
  } = {}
  let unsubData: (() => void) | null = null
  let unsubExit: (() => void) | null = null

  return {
    async connect(options) {
      storedCallbacks = options.callbacks

      try {
        const result = await window.api.pty.spawn({
          cols: options.cols ?? 80,
          rows: options.rows ?? 24,
          cwd
        })
        ptyId = result.id
        connected = true
        onPtySpawn?.(result.id)

        unsubData = window.api.pty.onData((payload) => {
          if (payload.id === ptyId) {
            storedCallbacks.onData?.(payload.data)
            if (onTitleChange) {
              const title = extractLastOscTitle(payload.data)
              if (title !== null) onTitleChange(title)
            }
          }
        })

        unsubExit = window.api.pty.onExit((payload) => {
          if (payload.id === ptyId) {
            connected = false
            storedCallbacks.onExit?.(payload.code)
            storedCallbacks.onDisconnect?.()
            onPtyExit?.()
          }
        })

        storedCallbacks.onConnect?.()
        storedCallbacks.onStatus?.('shell')
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        storedCallbacks.onError?.(msg)
      }
    },

    disconnect() {
      if (ptyId) {
        window.api.pty.kill(ptyId)
        connected = false
        ptyId = null
        unsubData?.()
        unsubExit?.()
        unsubData = null
        unsubExit = null
        storedCallbacks.onDisconnect?.()
      }
    },

    sendInput(data: string): boolean {
      if (!connected || !ptyId) return false
      window.api.pty.write(ptyId, data)
      return true
    },

    resize(cols: number, rows: number): boolean {
      if (!connected || !ptyId) return false
      window.api.pty.resize(ptyId, cols, rows)
      return true
    },

    isConnected() {
      return connected
    },

    destroy() {
      this.disconnect()
    }
  }
}

interface TerminalPaneProps {
  tabId: string
  cwd?: string
  isActive: boolean
  onPtyExit: () => void
}

export default function TerminalPane({
  tabId,
  cwd,
  isActive,
  onPtyExit
}: TerminalPaneProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const resttyRef = useRef<Restty | null>(null)
  const wasActiveRef = useRef(isActive)

  const updateTabTitle = useAppStore((s) => s.updateTabTitle)
  const updateTabPtyId = useAppStore((s) => s.updateTabPtyId)

  // Use a ref so the Restty closure always calls the latest onPtyExit
  const onPtyExitRef = useRef(onPtyExit)
  onPtyExitRef.current = onPtyExit

  // Initialize Restty instance once
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const onTitleChange = (title: string): void => {
      updateTabTitle(tabId, title)
    }

    const onPtySpawn = (ptyId: string): void => {
      updateTabPtyId(tabId, ptyId)
    }

    const restty = new Restty({
      root: container,
      createInitialPane: false,
      autoInit: false,
      shortcuts: { enabled: true },
      appOptions: ({ id }) => {
        const onExit = (): void => {
          // Schedule close via parent
          const panes = restty.getPanes()
          if (panes.length <= 1) {
            onPtyExitRef.current()
            return
          }
          restty.closePane(id)
        }
        return {
          renderer: 'webgpu',
          fontSize: 14,
          fontSizeMode: 'em',
          alphaBlending: 'native',
          ptyTransport: createIpcPtyTransport(cwd, onExit, onTitleChange, onPtySpawn) as never,
          fontSources: [
            {
              type: 'local' as const,
              label: 'SF Mono',
              matchers: ['sf mono', 'sfmono-regular'],
              required: true
            },
            {
              type: 'local' as const,
              label: 'Menlo',
              matchers: ['menlo', 'menlo regular']
            }
          ]
        }
      },
      onPaneCreated: async (pane) => {
        await pane.app.init()
        const theme = getBuiltinTheme('Aizen Dark')
        if (theme) pane.app.applyTheme(theme, 'Aizen Dark')
        pane.app.updateSize(true)
        pane.app.connectPty('')
        pane.canvas.focus({ preventScroll: true })
      },
      onPaneClosed: () => {},
      onActivePaneChange: () => {}
    })

    restty.createInitialPane({ focus: isActive })
    resttyRef.current = restty

    return () => {
      restty.destroy()
      resttyRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, cwd])

  // Handle focus and resize when tab becomes active
  useEffect(() => {
    const restty = resttyRef.current
    if (!restty) return

    if (isActive && !wasActiveRef.current) {
      // Tab just became active - focus and resize
      requestAnimationFrame(() => {
        const panes = restty.getPanes()
        for (const p of panes) {
          p.app.updateSize(true)
        }
        const active = restty.getActivePane() ?? panes[0]
        if (active) {
          active.canvas.focus({ preventScroll: true })
        }
      })
    }
    wasActiveRef.current = isActive
  }, [isActive])

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ display: isActive ? 'block' : 'none' }}
    />
  )
}
