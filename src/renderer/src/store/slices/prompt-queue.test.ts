import { describe, expect, it } from 'vitest'
import {
  clearPromptQueue,
  dequeuePrompt,
  editQueuedPrompt,
  enqueuePrompt,
  moveQueuedPrompt,
  removeQueuedPrompt,
  setPromptQueuePaused,
  type PromptQueuesByPaneKey
} from './prompt-queue'

const PANE = 'pane-1'

function withPrompts(...texts: string[]): PromptQueuesByPaneKey {
  return texts.reduce<PromptQueuesByPaneKey>(
    (queues, text, index) => enqueuePrompt(queues, PANE, text, `id-${index}`, 1000 + index),
    {}
  )
}

function textsOf(queues: PromptQueuesByPaneKey, paneKey = PANE): string[] {
  return (queues[paneKey]?.items ?? []).map((item) => item.text)
}

describe('enqueuePrompt', () => {
  it('appends prompts in the order they were queued', () => {
    expect(textsOf(withPrompts('first', 'second', 'third'))).toEqual(['first', 'second', 'third'])
  })

  it('trims the text it stores', () => {
    expect(textsOf(enqueuePrompt({}, PANE, '  spaced  ', 'id', 1))).toEqual(['spaced'])
  })

  it('ignores an empty prompt rather than queuing a no-op', () => {
    expect(enqueuePrompt({}, PANE, '   ', 'id', 1)).toEqual({})
  })

  it('keeps queues separate per pane', () => {
    const queues = enqueuePrompt(withPrompts('mine'), 'pane-2', 'theirs', 'other', 2)
    expect(textsOf(queues)).toEqual(['mine'])
    expect(textsOf(queues, 'pane-2')).toEqual(['theirs'])
  })

  it('refuses to grow past the per-pane bound', () => {
    let queues: PromptQueuesByPaneKey = {}
    for (let index = 0; index < 105; index += 1) {
      queues = enqueuePrompt(queues, PANE, `p${index}`, `id-${index}`, index)
    }
    expect(queues[PANE].items).toHaveLength(100)
  })
})

describe('editQueuedPrompt', () => {
  it('replaces the text in place, keeping position', () => {
    const queues = editQueuedPrompt(withPrompts('a', 'b', 'c'), PANE, 'id-1', 'edited')
    expect(textsOf(queues)).toEqual(['a', 'edited', 'c'])
  })

  it('removes the prompt when edited to nothing', () => {
    // Why: an empty edit is a delete. Keeping the row would later send nothing.
    const queues = editQueuedPrompt(withPrompts('a', 'b'), PANE, 'id-0', '   ')
    expect(textsOf(queues)).toEqual(['b'])
  })

  it('leaves the queues untouched for an unknown id', () => {
    const before = withPrompts('a')
    expect(editQueuedPrompt(before, PANE, 'missing', 'x')).toBe(before)
  })
})

describe('moveQueuedPrompt', () => {
  it('moves a prompt later in the queue', () => {
    expect(textsOf(moveQueuedPrompt(withPrompts('a', 'b', 'c'), PANE, 'id-0', 2))).toEqual([
      'b',
      'c',
      'a'
    ])
  })

  it('moves a prompt earlier in the queue', () => {
    expect(textsOf(moveQueuedPrompt(withPrompts('a', 'b', 'c'), PANE, 'id-2', 0))).toEqual([
      'c',
      'a',
      'b'
    ])
  })

  it('clamps an out-of-range target instead of dropping the prompt', () => {
    expect(textsOf(moveQueuedPrompt(withPrompts('a', 'b'), PANE, 'id-0', 99))).toEqual(['b', 'a'])
    expect(textsOf(moveQueuedPrompt(withPrompts('a', 'b'), PANE, 'id-1', -5))).toEqual(['b', 'a'])
  })

  it('is a no-op when the prompt is already there', () => {
    const before = withPrompts('a', 'b')
    expect(moveQueuedPrompt(before, PANE, 'id-0', 0)).toBe(before)
  })
})

describe('removeQueuedPrompt', () => {
  it('removes just that prompt', () => {
    expect(textsOf(removeQueuedPrompt(withPrompts('a', 'b', 'c'), PANE, 'id-1'))).toEqual([
      'a',
      'c'
    ])
  })

  it('forgets the pane entirely once its last prompt goes', () => {
    expect(removeQueuedPrompt(withPrompts('only'), PANE, 'id-0')).toEqual({})
  })
})

describe('setPromptQueuePaused', () => {
  it('pauses and resumes', () => {
    const paused = setPromptQueuePaused(withPrompts('a'), PANE, true)
    expect(paused[PANE].paused).toBe(true)
    expect(setPromptQueuePaused(paused, PANE, false)[PANE].paused).toBe(false)
  })

  it('remembers a pause set before anything is queued', () => {
    const paused = setPromptQueuePaused({}, PANE, true)
    expect(paused[PANE]).toEqual({ items: [], paused: true })
  })
})

describe('dequeuePrompt', () => {
  it('takes the head and returns the queues without it', () => {
    const taken = dequeuePrompt(withPrompts('first', 'second'), PANE)
    expect(taken?.prompt.text).toBe('first')
    expect(textsOf(taken!.queues)).toEqual(['second'])
  })

  it('returns null while paused, leaving the queue intact', () => {
    expect(dequeuePrompt(setPromptQueuePaused(withPrompts('a'), PANE, true), PANE)).toBeNull()
  })

  it('returns null for an empty or unknown pane', () => {
    expect(dequeuePrompt({}, PANE)).toBeNull()
  })

  it('does not touch another pane while draining one', () => {
    const queues = enqueuePrompt(withPrompts('mine'), 'pane-2', 'theirs', 'other', 2)
    const taken = dequeuePrompt(queues, PANE)
    expect(textsOf(taken!.queues, 'pane-2')).toEqual(['theirs'])
  })
})

describe('clearPromptQueue', () => {
  it('drops the pane, paused or not', () => {
    expect(clearPromptQueue(setPromptQueuePaused(withPrompts('a'), PANE, true), PANE)).toEqual({})
  })

  it('is identity for a pane with no queue', () => {
    const before = withPrompts('a')
    expect(clearPromptQueue(before, 'pane-9')).toBe(before)
  })
})
