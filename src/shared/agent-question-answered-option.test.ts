import { describe, expect, it } from 'vitest'
import { resolveAnsweredQuestionOption } from './agent-question-answered-option'

function singleSelectPrompt(): string {
  return JSON.stringify({
    questions: [
      {
        header: 'Auth method',
        question: 'Which auth method should we use?',
        multiSelect: false,
        options: [
          { label: 'JWT', description: 'stateless' },
          { label: 'Session cookies', description: 'stateful' }
        ]
      }
    ]
  })
}

describe('resolveAnsweredQuestionOption', () => {
  it('maps a digit back to the option label the human picked', () => {
    expect(resolveAnsweredQuestionOption(singleSelectPrompt(), '1')).toEqual({
      header: 'Auth method',
      question: 'Which auth method should we use?',
      answer: 'JWT'
    })
    expect(resolveAnsweredQuestionOption(singleSelectPrompt(), '2')?.answer).toBe('Session cookies')
  })

  it('returns the question without an answer for Enter', () => {
    // Why: Enter selects the highlighted row, and the highlight lives in the
    // agent's TUI. Recording a guessed answer here would poison the corpus.
    const resolved = resolveAnsweredQuestionOption(singleSelectPrompt(), '\r')
    expect(resolved).toEqual({
      header: 'Auth method',
      question: 'Which auth method should we use?'
    })
    expect(resolved?.answer).toBeUndefined()
  })

  it('returns the question without an answer for a multi-select prompt', () => {
    const prompt = JSON.stringify({
      questions: [
        {
          header: 'Features',
          question: 'Which features?',
          multiSelect: true,
          options: [{ label: 'A' }, { label: 'B' }]
        }
      ]
    })
    expect(resolveAnsweredQuestionOption(prompt, '1')?.answer).toBeUndefined()
  })

  it('accepts bare string options', () => {
    const prompt = JSON.stringify({
      questions: [{ question: 'Pick one', options: ['first', 'second'] }]
    })
    expect(resolveAnsweredQuestionOption(prompt, '2')).toEqual({
      question: 'Pick one',
      answer: 'second'
    })
  })

  it('returns the question when the digit is past the declared options', () => {
    expect(resolveAnsweredQuestionOption(singleSelectPrompt(), '9')?.answer).toBeUndefined()
  })

  it('rejects non-submit keystrokes', () => {
    expect(resolveAnsweredQuestionOption(singleSelectPrompt(), 'a')).toBeNull()
    expect(resolveAnsweredQuestionOption(singleSelectPrompt(), '0')).toBeNull()
  })

  it('rejects multi-question prompts, malformed JSON, and missing prompts', () => {
    const twoQuestions = JSON.stringify({
      questions: [
        { question: 'One', options: [{ label: 'a' }] },
        { question: 'Two', options: [{ label: 'b' }] }
      ]
    })
    expect(resolveAnsweredQuestionOption(twoQuestions, '1')).toBeNull()
    expect(resolveAnsweredQuestionOption('{not json', '1')).toBeNull()
    expect(resolveAnsweredQuestionOption(undefined, '1')).toBeNull()
    expect(resolveAnsweredQuestionOption(JSON.stringify({ questions: [] }), '1')).toBeNull()
  })

  it('rejects a question with no text', () => {
    const prompt = JSON.stringify({ questions: [{ question: '', options: [{ label: 'a' }] }] })
    expect(resolveAnsweredQuestionOption(prompt, '1')).toBeNull()
  })
})
