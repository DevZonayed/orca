import React, { useSyncExternalStore } from 'react'
import { cn } from '@/lib/utils'

const BRAILLE_FRAMES = [
  '\u280B',
  '\u2819',
  '\u2839',
  '\u2838',
  '\u283C',
  '\u2834',
  '\u2826',
  '\u2827',
  '\u2807',
  '\u280F'
]
const FRAME_INTERVAL = 80

// ── Shared global spinner ────────────────────────────────────────
// A single setInterval drives ALL spinner instances. Components
// subscribe via useSyncExternalStore — zero per-instance timers.
let _frame = 0
let _subscribers = 0
let _interval: ReturnType<typeof setInterval> | null = null
const _listeners = new Set<() => void>()

function startSharedTimer(): void {
  if (_interval !== null) return
  _interval = setInterval(() => {
    _frame = (_frame + 1) % BRAILLE_FRAMES.length
    for (const cb of _listeners) cb()
  }, FRAME_INTERVAL)
}

function stopSharedTimer(): void {
  if (_interval === null) return
  clearInterval(_interval)
  _interval = null
  _frame = 0
}

function subscribeFrame(cb: () => void): () => void {
  _listeners.add(cb)
  _subscribers++
  if (_subscribers === 1) startSharedTimer()
  return () => {
    _listeners.delete(cb)
    _subscribers--
    if (_subscribers === 0) stopSharedTimer()
  }
}

function getFrame(): number {
  return _frame
}

// ─────────────────────────────────────────────────────────────────

type Status = 'active' | 'working' | 'permission' | 'inactive'

interface StatusIndicatorProps {
  status: Status
  className?: string
}

const StatusIndicator = React.memo(function StatusIndicator({
  status,
  className
}: StatusIndicatorProps) {
  // Only subscribes to the shared timer when status === 'working'.
  // When not working, the subscribe is a no-op (returns identity unsub).
  const frame = useSyncExternalStore(
    status === 'working' ? subscribeFrame : noopSubscribe,
    getFrame
  )

  if (status === 'working') {
    return (
      <span
        className={cn(
          'inline-flex h-3 w-3 items-center justify-center shrink-0 text-[11px] leading-none text-emerald-500 font-mono',
          className
        )}
      >
        {BRAILLE_FRAMES[frame]}
      </span>
    )
  }

  return (
    <span className={cn('inline-flex h-3 w-3 items-center justify-center shrink-0', className)}>
      <span
        className={cn(
          'block size-2 rounded-full',
          status === 'active'
            ? 'bg-emerald-500'
            : status === 'permission'
              ? 'bg-red-500'
              : 'bg-neutral-500/40'
        )}
      />
    </span>
  )
})

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noopUnsubscribe = (): void => {}
const noopSubscribe = (): (() => void) => noopUnsubscribe

export default StatusIndicator
export type { Status }
