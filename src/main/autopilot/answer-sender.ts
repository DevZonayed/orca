import { readAskUserQuestionPrompt } from '../../shared/agent-question-answered-option'
import { parseAskFromStatus } from '../../shared/native-chat-ask'
import { planAutopilotAnswerDelivery } from '../../shared/autopilot-answer-delivery'
import { classifyQuestionSafety } from '../../shared/autopilot-destructive-gate'

export type AutopilotSendRefusal =
  | 'disabled'
  | 'pane-not-armed'
  | 'no-answer'
  | 'not-local'
  | 'agent-delivery-unsupported'
  | 'destructive'
  | 'prompt-changed'
  | 'answer-not-an-option'
  | 'multi-select'
  | 'already-answered'
  | 'write-refused'

export type AutopilotSendResult =
  | { sent: true; keystrokes: string[] }
  | { sent: false; refusal: AutopilotSendRefusal; detail?: string }

export type AutopilotSendRequest = {
  paneKey: string
  /** The question tool that produced this prompt; the registry parses by it. */
  toolName: string | undefined
  /** The exact payload the decision was made against. */
  decidedInteractivePrompt: string
  answer: string
  agentType: string | undefined
  /** Null for a local pane; anything else means the pane lives over SSH. */
  connectionId: string | null
}

export type AutopilotSendDeps = {
  /** The global master switch. Off means no pane may send, whatever it asked for. */
  isEnabled: () => boolean
  /** Whether this specific session was armed by the human. Defaults to false. */
  isPaneArmed: (paneKey: string) => boolean
  /** The pane's live payload, re-read at send time rather than trusted from the decision. */
  readLivePrompt: (paneKey: string) => string | undefined
  wasAlreadyAnswered: (paneKey: string, questionText: string) => boolean
  write: (request: {
    paneKey: string
    expectedInteractivePrompt: string
    keystrokes: readonly string[]
  }) => {
    sent: boolean
    reason?: string
  }
}

function refuse(refusal: AutopilotSendRefusal, detail?: string): AutopilotSendResult {
  return { sent: false, refusal, ...(detail ? { detail } : {}) }
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
  // Why: two keys, not one. The global switch says Autopilot may act at all;
  // arming says this session wants it. Running many agents across projects means
  // "on everywhere" is never the right shape.
  if (!deps.isPaneArmed(request.paneKey)) {
    return refuse('pane-not-armed')
  }
  if (!request.answer) {
    return refuse('no-answer')
  }
  // Why: local only. An SSH pane's keystroke crosses a mux Autopilot does not
  // own, and the accuracy evidence from shadow mode is local-pane evidence.
  if (request.connectionId !== null) {
    return refuse('not-local')
  }
  const live = deps.readLivePrompt(request.paneKey)
  if (!live || live !== request.decidedInteractivePrompt) {
    return refuse('prompt-changed')
  }
  const prompt = readAskUserQuestionPrompt(live)
  if (!prompt) {
    return refuse('prompt-changed')
  }

  // Why: one option cannot settle a multi-select, and the old digit check that
  // implied this is gone. Stated explicitly so the guarantee is not incidental.
  if (prompt.multiSelect) {
    return refuse('multi-select')
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

  const ask = parseAskFromStatus(live, request.toolName)
  const optionIndex = ask?.questions[0]?.options.findIndex(
    (option) => option.label === request.answer
  )
  if (!ask || optionIndex === undefined || optionIndex < 0) {
    return refuse('answer-not-an-option')
  }
  // Why: the same builders native chat uses when a human answers, so Autopilot
  // drives each agent's selector exactly as a person would. Nothing here knows
  // what Claude or Codex keys look like.
  const plan = planAutopilotAnswerDelivery(request.agentType, ask, optionIndex)
  if (!plan.ok) {
    return refuse('agent-delivery-unsupported', plan.refusal)
  }

  const result = deps.write({
    paneKey: request.paneKey,
    expectedInteractivePrompt: live,
    keystrokes: plan.delivery.keystrokes
  })
  return result.sent
    ? { sent: true, keystrokes: plan.delivery.keystrokes }
    : refuse('write-refused', result.reason)
}
