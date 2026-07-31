import { describe, expect, it, vi } from 'vitest'
import { PromptQueueDrain } from './prompt-queue-drain'
import {
  enqueuePrompt,
  setPromptQueuePaused,
  type PromptQueuesByPaneKey
} from '../store/slices/prompt-queue'

const PANE = 'pane-1'

function setup(initial: PromptQueuesByPaneKey, sent = true) {
  let queues = initial
  const sendPrompt = vi.fn().mockReturnValue(sent)
  const drain = new PromptQueueDrain({
    getQueues: () => queues,
    setQueues: (next) => {
      queues = next
    },
    sendPrompt
  })
  return { drain, sendPrompt, read: () => queues }
}

function queued(...texts: string[]): PromptQueuesByPaneKey {
  return texts.reduce<PromptQueuesByPaneKey>(
    (queues, text, index) => enqueuePrompt(queues, PANE, text, `id-${index}`, index),
    {}
  )
}

describe('PromptQueueDrain', () => {
  it('sends the head when the agent becomes free', () => {
    const { drain, sendPrompt } = setup(queued('first', 'second'))
    drain.observe(PANE, 'working')
    drain.observe(PANE, 'done')
    expect(sendPrompt).toHaveBeenCalledOnce()
    expect(sendPrompt.mock.calls[0][1].text).toBe('first')
  })

  it('sends exactly one prompt per transition, not the whole queue', () => {
    // Why: the agent returns to working on receipt, so the next transition to
    // done releases the next prompt. Draining all at once merges every prompt
    // into a single turn, which is not what a queue means.
    const { drain, sendPrompt, read } = setup(queued('first', 'second', 'third'))
    drain.observe(PANE, 'working')
    drain.observe(PANE, 'done')
    expect(sendPrompt).toHaveBeenCalledOnce()
    expect(read()[PANE].items.map((item) => item.text)).toEqual(['second', 'third'])
  })

  it('releases the next prompt on the next transition', () => {
    const { drain, sendPrompt } = setup(queued('first', 'second'))
    drain.observe(PANE, 'working')
    drain.observe(PANE, 'done')
    drain.observe(PANE, 'working')
    drain.observe(PANE, 'done')
    expect(sendPrompt.mock.calls.map((call) => call[1].text)).toEqual(['first', 'second'])
  })

  it('does nothing while the queue is paused', () => {
    const { drain, sendPrompt, read } = setup(setPromptQueuePaused(queued('first'), PANE, true))
    drain.observe(PANE, 'working')
    drain.observe(PANE, 'done')
    expect(sendPrompt).not.toHaveBeenCalled()
    expect(read()[PANE].items).toHaveLength(1)
  })

  it('resumes draining once unpaused and the agent frees again', () => {
    let queues = setPromptQueuePaused(queued('first'), PANE, true)
    const sendPrompt = vi.fn().mockReturnValue(true)
    const drain = new PromptQueueDrain({
      getQueues: () => queues,
      setQueues: (next) => {
        queues = next
      },
      sendPrompt
    })
    drain.observe(PANE, 'working')
    drain.observe(PANE, 'done')
    expect(sendPrompt).not.toHaveBeenCalled()
    queues = setPromptQueuePaused(queues, PANE, false)
    drain.observe(PANE, 'working')
    drain.observe(PANE, 'done')
    expect(sendPrompt).toHaveBeenCalledOnce()
  })

  it('ignores a status that was already free', () => {
    const { drain, sendPrompt } = setup(queued('first'))
    drain.observe(PANE, 'done')
    drain.observe(PANE, 'done')
    expect(sendPrompt).not.toHaveBeenCalled()
  })

  it('does not send while the agent is waiting on a question', () => {
    const { drain, sendPrompt } = setup(queued('first'))
    drain.observe(PANE, 'working')
    drain.observe(PANE, 'waiting')
    expect(sendPrompt).not.toHaveBeenCalled()
  })

  it('drains only the pane that became free', () => {
    let queues = enqueuePrompt(queued('mine'), 'pane-2', 'theirs', 'other', 9)
    const sendPrompt = vi.fn().mockReturnValue(true)
    const drain = new PromptQueueDrain({
      getQueues: () => queues,
      setQueues: (next) => {
        queues = next
      },
      sendPrompt
    })
    drain.observe(PANE, 'working')
    drain.observe(PANE, 'done')
    expect(sendPrompt).toHaveBeenCalledOnce()
    expect(queues['pane-2'].items.map((item) => item.text)).toEqual(['theirs'])
  })

  it('puts the prompt back at the head when the send fails', () => {
    const { drain, read } = setup(queued('first', 'second'), false)
    drain.observe(PANE, 'working')
    drain.observe(PANE, 'done')
    expect(read()[PANE].items.map((item) => item.text)).toEqual(['first', 'second'])
  })

  it('puts the prompt back when the send throws', () => {
    let queues = queued('first')
    const drain = new PromptQueueDrain({
      getQueues: () => queues,
      setQueues: (next) => {
        queues = next
      },
      sendPrompt: () => {
        throw new Error('pty gone')
      }
    })
    drain.observe(PANE, 'working')
    expect(() => drain.observe(PANE, 'done')).not.toThrow()
    expect(queues[PANE].items.map((item) => item.text)).toEqual(['first'])
  })

  it('treats a pane whose status disappeared as unknown, not as free', () => {
    const { drain, sendPrompt } = setup(queued('first'))
    drain.observe(PANE, 'working')
    drain.observe(PANE, undefined)
    drain.observe(PANE, 'done')
    expect(sendPrompt).not.toHaveBeenCalled()
  })
})
