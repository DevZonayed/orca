import type { AgentStatusState } from './agent-status-types'

/** One prompt waiting for its agent to become free. */
export type QueuedPrompt = {
  id: string
  text: string
  /** When it was queued, so the UI can show age without a second source. */
  queuedAt: number
}

export type PanePromptQueue = {
  items: QueuedPrompt[]
  /** While paused nothing drains, but new prompts still queue. */
  paused: boolean
}

export const EMPTY_PANE_PROMPT_QUEUE: PanePromptQueue = Object.freeze({
  items: Object.freeze([]) as unknown as QueuedPrompt[],
  paused: false
})

/**
 * True when a prompt sent now would land in the agent's own turn.
 *
 * `waiting` and `blocked` count as busy: the agent is stopped on a question or a
 * permission prompt, and typing a new instruction there answers *that*, not the
 * conversation. Only `done` — or a pane with no agent status at all — is free.
 */
export function isAgentBusyForPrompt(state: AgentStatusState | undefined): boolean {
  return state !== undefined && state !== 'done'
}

/** The transition that releases one queued prompt. */
export function becameFreeForPrompt(
  previous: AgentStatusState | undefined,
  next: AgentStatusState | undefined
): boolean {
  return next === 'done' && previous !== 'done' && previous !== undefined
}
