import {
  resolveNativeChatTranscriptAgent,
  shouldStepNativeChatAskAnswer
} from './native-chat-agent-support'
import { buildAskAnswerKeys, buildCodexAskAnswerKeys } from './native-chat-ask'
import type { AskAnswerKeyGroup, AskPrompt } from './native-chat-ask'

/** A keystroke-only delivery. Text groups are deliberately excluded — see below. */
export type AutopilotAnswerDelivery = {
  /** Written in order, paced apart; every group is raw keystrokes. */
  keystrokes: string[]
}

export type DeliveryRefusal = 'unknown-agent' | 'not-a-keystroke-agent' | 'no-such-option'

export type AutopilotDeliveryPlan =
  | { ok: true; delivery: AutopilotAnswerDelivery }
  | { ok: false; refusal: DeliveryRefusal }

/**
 * Work out the keystrokes that answer this question, for this agent.
 *
 * Delegates entirely to the per-agent builders native chat already uses when a
 * human answers, so Autopilot and the human drive the same selector the same
 * way. Nothing here knows what Claude or Codex keys look like — that knowledge
 * stays in one place, and a new agent becomes supported by teaching those
 * builders rather than by editing Autopilot.
 *
 * Paste-committing agents are refused rather than approximated: their delivery
 * needs bracketed-paste framing that lives in the renderer, and a half-framed
 * paste would land as literal text in the agent's composer.
 */
export function planAutopilotAnswerDelivery(
  agentType: string | undefined,
  prompt: AskPrompt,
  optionIndex: number
): AutopilotDeliveryPlan {
  const agent = resolveNativeChatTranscriptAgent(agentType)
  if (!agent) {
    return { ok: false, refusal: 'unknown-agent' }
  }
  if (!shouldStepNativeChatAskAnswer(agentType)) {
    return { ok: false, refusal: 'not-a-keystroke-agent' }
  }
  const [question] = prompt.questions
  if (!question || optionIndex < 0 || optionIndex >= question.options.length) {
    return { ok: false, refusal: 'no-such-option' }
  }
  const selections = [{ indices: [optionIndex] }]
  const groups =
    agent === 'codex'
      ? buildCodexAskAnswerKeys(prompt, selections)
      : buildAskAnswerKeys(prompt, selections)
  const keystrokes = toKeystrokesOnly(groups)
  if (!keystrokes) {
    // Why: a plan containing typed text means the builder chose the free-text
    // row. Autopilot only ever picks a declared option, so this is a mismatch
    // worth refusing rather than partially writing.
    return { ok: false, refusal: 'not-a-keystroke-agent' }
  }
  return { ok: true, delivery: { keystrokes } }
}

function toKeystrokesOnly(groups: readonly AskAnswerKeyGroup[]): string[] | null {
  const keystrokes: string[] = []
  for (const group of groups) {
    if (!('raw' in group)) {
      return null
    }
    keystrokes.push(group.raw)
  }
  return keystrokes.length > 0 ? keystrokes : null
}
