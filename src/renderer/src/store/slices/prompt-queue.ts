import type { StateCreator } from 'zustand'
import type { AppState } from '../types'
import type { PanePromptQueue, QueuedPrompt } from '../../../../shared/prompt-queue-types'

export type PromptQueuesByPaneKey = Record<string, PanePromptQueue>

/** Bounds a runaway queue. Reached only by scripted input, not by typing. */
const MAX_QUEUED_PROMPTS_PER_PANE = 100

function emptyQueue(): PanePromptQueue {
  return { items: [], paused: false }
}

function readQueue(queues: PromptQueuesByPaneKey, paneKey: string): PanePromptQueue {
  return queues[paneKey] ?? emptyQueue()
}

/** Drops the pane entry entirely once its queue is empty and running, so an
 *  untouched pane never accumulates state. */
function writeQueue(
  queues: PromptQueuesByPaneKey,
  paneKey: string,
  next: PanePromptQueue
): PromptQueuesByPaneKey {
  if (next.items.length === 0 && !next.paused) {
    if (!(paneKey in queues)) {
      return queues
    }
    const { [paneKey]: _removed, ...rest } = queues
    return rest
  }
  return { ...queues, [paneKey]: next }
}

export function enqueuePrompt(
  queues: PromptQueuesByPaneKey,
  paneKey: string,
  text: string,
  id: string,
  queuedAt: number
): PromptQueuesByPaneKey {
  const trimmed = text.trim()
  if (!trimmed) {
    return queues
  }
  const queue = readQueue(queues, paneKey)
  if (queue.items.length >= MAX_QUEUED_PROMPTS_PER_PANE) {
    return queues
  }
  return writeQueue(queues, paneKey, {
    ...queue,
    items: [...queue.items, { id, text: trimmed, queuedAt }]
  })
}

export function removeQueuedPrompt(
  queues: PromptQueuesByPaneKey,
  paneKey: string,
  id: string
): PromptQueuesByPaneKey {
  const queue = readQueue(queues, paneKey)
  const items = queue.items.filter((item) => item.id !== id)
  return items.length === queue.items.length
    ? queues
    : writeQueue(queues, paneKey, { ...queue, items })
}

export function editQueuedPrompt(
  queues: PromptQueuesByPaneKey,
  paneKey: string,
  id: string,
  text: string
): PromptQueuesByPaneKey {
  const trimmed = text.trim()
  // Why: an edit to nothing is a delete in disguise. Removing it explicitly
  // beats leaving an empty row that would later send an empty prompt.
  if (!trimmed) {
    return removeQueuedPrompt(queues, paneKey, id)
  }
  const queue = readQueue(queues, paneKey)
  let changed = false
  const items = queue.items.map((item) => {
    if (item.id !== id || item.text === trimmed) {
      return item
    }
    changed = true
    return { ...item, text: trimmed }
  })
  return changed ? writeQueue(queues, paneKey, { ...queue, items }) : queues
}

/** Move a prompt to an absolute position, clamped into range. */
export function moveQueuedPrompt(
  queues: PromptQueuesByPaneKey,
  paneKey: string,
  id: string,
  toIndex: number
): PromptQueuesByPaneKey {
  const queue = readQueue(queues, paneKey)
  const from = queue.items.findIndex((item) => item.id === id)
  if (from < 0) {
    return queues
  }
  const to = Math.max(0, Math.min(queue.items.length - 1, toIndex))
  if (to === from) {
    return queues
  }
  const items = [...queue.items]
  const [moved] = items.splice(from, 1)
  items.splice(to, 0, moved)
  return writeQueue(queues, paneKey, { ...queue, items })
}

export function setPromptQueuePaused(
  queues: PromptQueuesByPaneKey,
  paneKey: string,
  paused: boolean
): PromptQueuesByPaneKey {
  const queue = readQueue(queues, paneKey)
  return queue.paused === paused ? queues : writeQueue(queues, paneKey, { ...queue, paused })
}

/**
 * Take the head of a pane's queue, or null when nothing may be sent.
 *
 * Returns the remaining queues alongside the prompt so the caller cannot send
 * one and forget to remove it — the two must not come apart.
 */
export function dequeuePrompt(
  queues: PromptQueuesByPaneKey,
  paneKey: string
): { prompt: QueuedPrompt; queues: PromptQueuesByPaneKey } | null {
  const queue = readQueue(queues, paneKey)
  if (queue.paused || queue.items.length === 0) {
    return null
  }
  const [head, ...rest] = queue.items
  return { prompt: head, queues: writeQueue(queues, paneKey, { ...queue, items: rest }) }
}

/** Forget a pane's queue outright — used when its pane goes away. */
export function clearPromptQueue(
  queues: PromptQueuesByPaneKey,
  paneKey: string
): PromptQueuesByPaneKey {
  if (!(paneKey in queues)) {
    return queues
  }
  const { [paneKey]: _removed, ...rest } = queues
  return rest
}

export type PromptQueueSlice = {
  /** Prompts waiting for each pane's agent to become free. */
  promptQueuesByPaneKey: PromptQueuesByPaneKey
  enqueuePromptForPane: (paneKey: string, text: string) => void
  editQueuedPromptForPane: (paneKey: string, id: string, text: string) => void
  moveQueuedPromptForPane: (paneKey: string, id: string, toIndex: number) => void
  removeQueuedPromptForPane: (paneKey: string, id: string) => void
  setPromptQueuePausedForPane: (paneKey: string, paused: boolean) => void
  clearPromptQueueForPane: (paneKey: string) => void
}

let queuedPromptCounter = 0

/** Unique within a session; the queue is not persisted, so this need not survive. */
function nextQueuedPromptId(): string {
  queuedPromptCounter += 1
  return `qp-${Date.now().toString(36)}-${queuedPromptCounter}`
}

export const createPromptQueueSlice: StateCreator<AppState, [], [], PromptQueueSlice> = (set) => ({
  promptQueuesByPaneKey: {},
  enqueuePromptForPane: (paneKey, text) => {
    set((s) => {
      const next = enqueuePrompt(
        s.promptQueuesByPaneKey,
        paneKey,
        text,
        nextQueuedPromptId(),
        Date.now()
      )
      return next === s.promptQueuesByPaneKey ? s : { promptQueuesByPaneKey: next }
    })
  },
  editQueuedPromptForPane: (paneKey, id, text) => {
    set((s) => {
      const next = editQueuedPrompt(s.promptQueuesByPaneKey, paneKey, id, text)
      return next === s.promptQueuesByPaneKey ? s : { promptQueuesByPaneKey: next }
    })
  },
  moveQueuedPromptForPane: (paneKey, id, toIndex) => {
    set((s) => {
      const next = moveQueuedPrompt(s.promptQueuesByPaneKey, paneKey, id, toIndex)
      return next === s.promptQueuesByPaneKey ? s : { promptQueuesByPaneKey: next }
    })
  },
  removeQueuedPromptForPane: (paneKey, id) => {
    set((s) => {
      const next = removeQueuedPrompt(s.promptQueuesByPaneKey, paneKey, id)
      return next === s.promptQueuesByPaneKey ? s : { promptQueuesByPaneKey: next }
    })
  },
  setPromptQueuePausedForPane: (paneKey, paused) => {
    set((s) => {
      const next = setPromptQueuePaused(s.promptQueuesByPaneKey, paneKey, paused)
      return next === s.promptQueuesByPaneKey ? s : { promptQueuesByPaneKey: next }
    })
  },
  clearPromptQueueForPane: (paneKey) => {
    set((s) => {
      const next = clearPromptQueue(s.promptQueuesByPaneKey, paneKey)
      return next === s.promptQueuesByPaneKey ? s : { promptQueuesByPaneKey: next }
    })
  }
})
