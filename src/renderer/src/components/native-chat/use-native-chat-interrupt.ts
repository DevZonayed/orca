import { useCallback } from 'react'
import { sendRuntimePtyInput } from '@/runtime/runtime-terminal-inspection'

/** ESC is the agent-TUI interrupt key over the PTY. */
const ESC = '\u001b'

/**
 * Stop the agent, or cancel whatever the composer is waiting on.
 *
 * A working agent gets its own stop path; otherwise ESC goes to the TUI, which
 * is what cancels a question or denies an approval.
 */
export function useNativeChatInterrupt({
  cancelPendingSends,
  isWorking,
  onStop,
  resolveTarget
}: {
  cancelPendingSends: () => void
  isWorking: boolean
  onStop?: () => void
  resolveTarget: () => { settings: Parameters<typeof sendRuntimePtyInput>[0]; ptyId: string } | null
}): () => void {
  return useCallback(() => {
    cancelPendingSends()
    if (isWorking && onStop) {
      onStop()
      return
    }
    const target = resolveTarget()
    if (!target) {
      return
    }
    sendRuntimePtyInput(target.settings, target.ptyId, ESC)
  }, [cancelPendingSends, isWorking, onStop, resolveTarget])
}
