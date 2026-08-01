import { useCallback, useEffect, useRef } from 'react'
import { useAppStore } from '../../store'
import { dequeuePrompt } from '../../store/slices/prompt-queue'

/**
 * Release one queued prompt each time this session's agent becomes free.
 *
 * One per transition, deliberately: the agent goes back to working the moment
 * it receives a prompt, so the next transition releases the next one. Draining
 * the whole queue at once would merge every prompt into a single turn, which is
 * not what a queue means.
 */
export function useDrainPromptQueueOnIdle({
  paneKey,
  isWorking,
  send
}: {
  paneKey: string
  isWorking: boolean
  send: (queuedText?: string) => void
}): void {
  const wasWorkingRef = useRef(isWorking)
  useEffect(() => {
    const wasWorking = wasWorkingRef.current
    wasWorkingRef.current = isWorking
    if (!wasWorking || isWorking) {
      return
    }
    const taken = dequeuePrompt(useAppStore.getState().promptQueuesByPaneKey, paneKey)
    if (!taken) {
      return
    }
    // Why: removed before sending, so a re-render cannot release it twice.
    useAppStore.setState({ promptQueuesByPaneKey: taken.queues })
    send(taken.prompt.text)
  }, [isWorking, paneKey, send])
}

/**
 * Send now, or queue when the agent is busy.
 *
 * The decision lives here rather than inside `send` so the drain can call
 * `send` directly without the queue swallowing the prompt it just released.
 */
export function useQueueAwareSend({
  paneKey,
  isWorking,
  draft,
  send,
  setDraft,
  clearImageAttachments
}: {
  paneKey: string
  isWorking: boolean
  draft: string
  send: (queuedText?: string) => void
  setDraft: (draft: string) => void
  clearImageAttachments: () => void
}): () => void {
  const enqueue = useAppStore((store) => store.enqueuePromptForPane)
  return useCallback(() => {
    if (isWorking && draft.trim() !== '') {
      enqueue(paneKey, draft)
      setDraft('')
      clearImageAttachments()
      return
    }
    send()
  }, [clearImageAttachments, draft, enqueue, isWorking, paneKey, send, setDraft])
}

/** Both halves of the queue behaviour for one session: queue-aware sending and
 *  the release on idle. Kept as one call so the composer takes one line. */
export function usePromptQueueForSession(args: {
  paneKey: string
  isWorking: boolean
  draft: string
  send: (queuedText?: string) => void
  setDraft: (draft: string) => void
  clearImageAttachments: () => void
}): () => void {
  const handleSend = useQueueAwareSend(args)
  useDrainPromptQueueOnIdle(args)
  return handleSend
}
