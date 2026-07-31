import {
  readAskUserQuestionPrompt,
  type AskUserQuestionPrompt
} from '../../shared/agent-question-answered-option'
import { isQuestionAnsweredSubmitInput } from '../../shared/agent-question-answered-intent'
import { classifyQuestionSafety } from '../../shared/autopilot-destructive-gate'

export type AutopilotSendRefusal =
  | 'disabled'
  | 'no-answer'
  | 'not-local'
  | 'not-claude'
  | 'destructive'
  | 'prompt-changed'
  | 'answer-not-an-option'
  | 'keystroke-would-not-submit'
  | 'already-answered'
  | 'write-refused'

export type AutopilotSendResult =
  | { sent: true; data: string }
  | { sent: false; refusal: AutopilotSendRefusal; detail?: string }

export type AutopilotSendRequest = {
  paneKey: string
  /** The exact payload the decision was made against. */
  decidedInteractivePrompt: string
  answer: string
  agentType: string | undefined
  /** Null for a local pane; anything else means the pane lives over SSH. */
  connectionId: string | null
}

export type AutopilotSendDeps = {
  isEnabled: () => boolean
  /** The pane's live payload, re-read at send time rather than trusted from the decision. */
  readLivePrompt: (paneKey: string) => string | undefined
  wasAlreadyAnswered: (paneKey: string, questionText: string) => boolean
  write: (request: { paneKey: string; expectedInteractivePrompt: string; data: string }) => {
    sent: boolean
    reason?: string
  }
}

function refuse(refusal: AutopilotSendRefusal, detail?: string): AutopilotSendResult {
  return { sent: false, refusal, ...(detail ? { detail } : {}) }
}

/** The keystroke that picks `answer` out of the live prompt, or null. */
function resolveKeystroke(prompt: AskUserQuestionPrompt, answer: string): string | null {
  const index = prompt.options.findIndex((option) => option.label === answer)
  if (index < 0) {
    return null
  }
  // Why: derived from the LIVE prompt, never carried from the decision. If the
  // agent reordered its options in the interval, the old index now names a
  // different row — which is exactly how a safe answer becomes a wrong one.
  return String(index + 1)
}

/**
 * Send an answer into a live pane, or explain why not.
 *
 * Every refusal path returns before `write` is reached, so "did not send" is the
 * default and sending is the exception that has to earn its way through all of
 * them. The order is cheapest-and-most-absolute first.
 */
export function sendAutopilotAnswer(
  request: AutopilotSendRequest,
  deps: AutopilotSendDeps
): AutopilotSendResult {
  if (!deps.isEnabled()) {
    return refuse('disabled')
  }
  if (!request.answer) {
    return refuse('no-answer')
  }
  // Why: local only. An SSH pane's keystroke crosses a mux Autopilot does not
  // own, and the accuracy evidence from shadow mode is local-pane evidence.
  if (request.connectionId !== null) {
    return refuse('not-local')
  }
  // Why: the single-keystroke submit contract is Claude's AskUserQuestion. Other
  // agents' prompts may advance rather than submit on a digit.
  if (request.agentType !== 'claude') {
    return refuse('not-claude')
  }

  const live = deps.readLivePrompt(request.paneKey)
  if (!live || live !== request.decidedInteractivePrompt) {
    return refuse('prompt-changed')
  }
  const prompt = readAskUserQuestionPrompt(live)
  if (!prompt) {
    return refuse('prompt-changed')
  }

  const safety = classifyQuestionSafety(prompt)
  if (!safety.safe) {
    return refuse('destructive', safety.matched)
  }

  // Why: re-asking a question Autopilot already answered on this pane means the
  // previous answer did not settle it. Answering again would loop.
  if (deps.wasAlreadyAnswered(request.paneKey, prompt.question)) {
    return refuse('already-answered')
  }

  const data = resolveKeystroke(prompt, request.answer)
  if (!data) {
    return refuse('answer-not-an-option')
  }
  // Why: the same gate the human's keystroke passes through. If this digit would
  // not have completed the prompt for a person, it must not be sent for one.
  if (!isQuestionAnsweredSubmitInput(data, live)) {
    return refuse('keystroke-would-not-submit')
  }

  const result = deps.write({
    paneKey: request.paneKey,
    expectedInteractivePrompt: live,
    data
  })
  return result.sent ? { sent: true, data } : refuse('write-refused', result.reason)
}
