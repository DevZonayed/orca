import { describe, expect, it, vi } from 'vitest'
import { makePaneKey } from '../../shared/stable-pane-id'
import { AgentHookServer, type QuestionAnsweredRecord } from './server'

const PANE_KEY = makePaneKey('tab-capture', '22222222-2222-4222-8222-222222222222')

const PROMPT_JSON = JSON.stringify({
  questions: [
    {
      header: 'Auth method',
      question: 'Which auth method should we use?',
      multiSelect: false,
      options: [{ label: 'JWT' }, { label: 'Session cookies' }]
    }
  ]
})

function waitingQuestionServer(): AgentHookServer {
  const server = new AgentHookServer()
  server.ingestRemote(
    {
      paneKey: PANE_KEY,
      tabId: 'tab-capture',
      worktreeId: 'worktree-capture',
      hookEventName: 'PreToolUse',
      toolUseId: 'tool-question',
      payload: {
        state: 'waiting',
        agentType: 'claude',
        toolName: 'AskUserQuestion',
        interactivePrompt: PROMPT_JSON
      }
    },
    'connection-1'
  )
  return server
}

function answeredRequest(
  server: AgentHookServer,
  submittedData?: string
): Parameters<AgentHookServer['inferQuestionAnswered']>[0] {
  const [entry] = server.getStatusSnapshot()
  return {
    paneKey: entry.paneKey,
    baselineUpdatedAt: entry.receivedAt,
    baselineStateStartedAt: entry.stateStartedAt,
    baselinePrompt: entry.prompt as string,
    baselineAgentType: entry.agentType,
    ...(submittedData === undefined ? {} : { submittedData })
  }
}

describe('question-answered capture', () => {
  it('emits the option the human picked', () => {
    const server = waitingQuestionServer()
    const listener = vi.fn<(record: QuestionAnsweredRecord) => void>()
    server.setQuestionAnsweredListener(listener)

    expect(server.inferQuestionAnswered(answeredRequest(server, '2'))).toBe(true)

    expect(listener).toHaveBeenCalledExactlyOnceWith({
      paneKey: PANE_KEY,
      agentType: 'claude',
      worktreeId: 'worktree-capture',
      promptJson: PROMPT_JSON,
      answered: {
        header: 'Auth method',
        question: 'Which auth method should we use?',
        answer: 'Session cookies'
      }
    })
  })

  it('emits the question with no answer when Enter was pressed', () => {
    const server = waitingQuestionServer()
    const listener = vi.fn<(record: QuestionAnsweredRecord) => void>()
    server.setQuestionAnsweredListener(listener)

    server.inferQuestionAnswered(answeredRequest(server, '\r'))

    expect(listener).toHaveBeenCalledOnce()
    const [record] = listener.mock.calls[0] as [QuestionAnsweredRecord]
    expect(record.answered).toEqual({
      header: 'Auth method',
      question: 'Which auth method should we use?'
    })
    expect(record.answered.answer).toBeUndefined()
  })

  it('stays silent when the caller reported no keystroke', () => {
    const server = waitingQuestionServer()
    const listener = vi.fn<(record: QuestionAnsweredRecord) => void>()
    server.setQuestionAnsweredListener(listener)

    expect(server.inferQuestionAnswered(answeredRequest(server))).toBe(true)

    expect(listener).not.toHaveBeenCalled()
  })

  it('stays silent when the baseline no longer matches', () => {
    // Why: a losing race is not an answer. Capturing here would record a
    // decision the human never made.
    const server = waitingQuestionServer()
    const listener = vi.fn<(record: QuestionAnsweredRecord) => void>()
    server.setQuestionAnsweredListener(listener)

    const stale = { ...answeredRequest(server, '1'), baselineUpdatedAt: 1 }
    expect(server.inferQuestionAnswered(stale)).toBe(false)

    expect(listener).not.toHaveBeenCalled()
  })

  it('clears the wait even when the listener throws', () => {
    // Why: capture is a side effect. A storage failure must never leave the
    // question card stuck on screen.
    const server = waitingQuestionServer()
    server.setQuestionAnsweredListener(() => {
      throw new Error('store unavailable')
    })

    expect(server.inferQuestionAnswered(answeredRequest(server, '1'))).toBe(true)
    expect(server.getStatusSnapshot()[0]).toMatchObject({ state: 'working' })
  })
})
