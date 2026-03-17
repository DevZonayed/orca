import React, { useState, useEffect, useRef } from 'react'
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

type Status = 'active' | 'working' | 'inactive'

interface StatusIndicatorProps {
  status: Status
  className?: string
}

const StatusIndicator = React.memo(function StatusIndicator({
  status,
  className
}: StatusIndicatorProps) {
  const [frame, setFrame] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (status === 'working') {
      intervalRef.current = setInterval(() => {
        setFrame((f) => (f + 1) % BRAILLE_FRAMES.length)
      }, FRAME_INTERVAL)
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current)
      }
    }
    setFrame(0)
    return undefined
  }, [status])

  if (status === 'working') {
    return (
      <span
        className={cn(
          'text-[11px] leading-none text-foreground font-mono w-3 text-center shrink-0',
          className
        )}
      >
        {BRAILLE_FRAMES[frame]}
      </span>
    )
  }

  return (
    <span
      className={cn(
        'block size-2 rounded-full shrink-0',
        status === 'active' ? 'bg-emerald-500' : 'bg-neutral-500/40',
        className
      )}
    />
  )
})

export default StatusIndicator
export type { Status }
