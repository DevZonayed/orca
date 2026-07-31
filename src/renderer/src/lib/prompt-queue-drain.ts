import type { AgentStatusState } from '../../../shared/agent-status-types'
import { becameFreeForPrompt, type QueuedPrompt } from '../../../shared/prompt-queue-types'
import { dequeuePrompt, type PromptQueuesByPaneKey } from '../store/slices/prompt-queue'

export type PromptQueueDrainDeps = {
  getQueues: () => PromptQueuesByPaneKey
  setQueues: (queues: PromptQueuesByPaneKey) => void
  /** Returns false when the prompt could not be delivered, so it goes back. */
  sendPrompt: (paneKey: string, prompt: QueuedPrompt) => boolean
}

/**
 * Release one queued prompt each time a pane's agent becomes free.
 *
 * One per transition, deliberately: the agent goes back to `working` the moment
 * it receives a prompt, so the next transition to `done` is what releases the
 * next one. Draining the whole queue at once would paste every prompt into a
 * single turn, which is not what a queue means.
 *
 * A separate observer rather than a hook inside the status slice, so the
 * 3030-line slice stays untouched and this is testable on its own.
 */
export class PromptQueueDrain {
  private readonly deps: PromptQueueDrainDeps
  private readonly lastStateByPaneKey = new Map<string, AgentStatusState>()

  constructor(deps: PromptQueueDrainDeps) {
    this.deps = deps
  }

  /** Feed every status change here; only transitions to free do anything. */
  observe(paneKey: string, state: AgentStatusState | undefined): void {
    const previous = this.lastStateByPaneKey.get(paneKey)
    if (state === undefined) {
      this.lastStateByPaneKey.delete(paneKey)
      return
    }
    this.lastStateByPaneKey.set(paneKey, state)
    if (!becameFreeForPrompt(previous, state)) {
      return
    }
    this.releaseOne(paneKey)
  }

  /** Send the head now, if the queue is running and non-empty. */
  releaseOne(paneKey: string): boolean {
    const taken = dequeuePrompt(this.deps.getQueues(), paneKey)
    if (!taken) {
      return false
    }
    // Why: remove before sending. A send that fails puts it back at the head;
    // leaving it in place instead would risk a second observer sending it twice.
    this.deps.setQueues(taken.queues)
    let sent = false
    try {
      sent = this.deps.sendPrompt(paneKey, taken.prompt)
    } catch (error) {
      console.warn('[prompt-queue] send threw', error)
    }
    if (!sent) {
      this.restore(paneKey, taken.prompt)
    }
    return sent
  }

  /** Put a prompt back at the head, keeping the rest of the order. */
  private restore(paneKey: string, prompt: QueuedPrompt): void {
    const queues = this.deps.getQueues()
    const queue = queues[paneKey] ?? { items: [], paused: false }
    this.deps.setQueues({
      ...queues,
      [paneKey]: { ...queue, items: [prompt, ...queue.items] }
    })
  }

  forgetPane(paneKey: string): void {
    this.lastStateByPaneKey.delete(paneKey)
  }
}
