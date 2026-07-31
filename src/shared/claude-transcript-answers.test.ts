import { describe, expect, it } from 'vitest'
import {
  parseAnsweredQuestionsFromTranscript,
  parseAnsweredQuestionsResult
} from './claude-transcript-answers'

describe('parseAnsweredQuestionsResult', () => {
  it('recovers a single question and answer', () => {
    const text =
      'Your questions have been answered: "What should autopilot be allowed to answer in v1?"="Everything non-destructive" selected preview:\nsome preview'
    expect(parseAnsweredQuestionsResult(text)).toEqual([
      {
        question: 'What should autopilot be allowed to answer in v1?',
        answer: 'Everything non-destructive'
      }
    ])
  })

  it('recovers every pair from a multi-question result', () => {
    const text =
      'Your questions have been answered: "Which surfaces should this rework cover?"="Marketing + billing + admin editor", "Where do the 6-month prices come from?"="New field, you set each price (Recommended)". You can now continue with these answers in mind.'
    expect(parseAnsweredQuestionsResult(text)).toEqual([
      {
        question: 'Which surfaces should this rework cover?',
        answer: 'Marketing + billing + admin editor'
      },
      {
        question: 'Where do the 6-month prices come from?',
        answer: 'New field, you set each price (Recommended)'
      }
    ])
  })

  it('keeps commas inside an answer instead of splitting on them', () => {
    const text = 'Your questions have been answered: "Structure?"="3 tiers: $22k, $29k, $38k".'
    expect(parseAnsweredQuestionsResult(text)[0].answer).toBe('3 tiers: $22k, $29k, $38k')
  })

  it('keeps a question that contains its own quotes intact', () => {
    // Real corpus case. A quote-greedy match starts the question at `") — where`.
    const text =
      'Your questions have been answered: "Your existing calling agent ("green brain") — where does it live relative to this project?"="Not written yet — concept only", "Primary target market?"="Global / undecided". You can now continue with these answers in mind.'
    expect(parseAnsweredQuestionsResult(text)).toEqual([
      {
        question:
          'Your existing calling agent ("green brain") — where does it live relative to this project?',
        answer: 'Not written yet — concept only'
      },
      { question: 'Primary target market?', answer: 'Global / undecided' }
    ])
  })

  it('returns nothing for the permission-failure result', () => {
    expect(
      parseAnsweredQuestionsResult('Tool permission request failed: Error: Stream closed')
    ).toEqual([])
  })

  it('returns nothing when the user did not answer', () => {
    expect(parseAnsweredQuestionsResult('The user did not answer the questions.')).toEqual([])
  })

  it('returns nothing for unrelated text', () => {
    expect(parseAnsweredQuestionsResult('some other tool output')).toEqual([])
  })
})

function line(content: unknown): string {
  return JSON.stringify({ message: { content } })
}

describe('parseAnsweredQuestionsFromTranscript', () => {
  const askLine = line([{ type: 'tool_use', name: 'AskUserQuestion', id: 'toolu_1', input: {} }])
  const resultLine = line([
    {
      type: 'tool_result',
      tool_use_id: 'toolu_1',
      content: 'Your questions have been answered: "Which auth?"="API keys".'
    }
  ])

  it('pairs a result with the question that produced it', () => {
    expect(parseAnsweredQuestionsFromTranscript(`${askLine}\n${resultLine}`)).toEqual([
      { question: 'Which auth?', answer: 'API keys' }
    ])
  })

  it('reads a result delivered as text blocks', () => {
    const blocks = line([
      {
        type: 'tool_result',
        tool_use_id: 'toolu_1',
        content: [{ type: 'text', text: 'Your questions have been answered: "Which auth?"="JWT".' }]
      }
    ])
    expect(parseAnsweredQuestionsFromTranscript(`${askLine}\n${blocks}`)).toEqual([
      { question: 'Which auth?', answer: 'JWT' }
    ])
  })

  it('ignores a result whose tool_use was never an AskUserQuestion', () => {
    const other = line([{ type: 'tool_use', name: 'Bash', id: 'toolu_9' }])
    const spoof = line([
      {
        type: 'tool_result',
        tool_use_id: 'toolu_9',
        content: 'Your questions have been answered: "Spoofed?"="Yes".'
      }
    ])
    expect(parseAnsweredQuestionsFromTranscript(`${other}\n${spoof}`)).toEqual([])
  })

  it('ignores assistant prose that merely quotes the phrase', () => {
    const prose = line([
      { type: 'text', text: 'Your questions have been answered: "Fake?"="Yes".' }
    ])
    expect(parseAnsweredQuestionsFromTranscript(prose)).toEqual([])
  })

  it('skips malformed lines without losing later ones', () => {
    const transcript = `${askLine}\nnot json at all\n${resultLine}`
    expect(parseAnsweredQuestionsFromTranscript(transcript)).toHaveLength(1)
  })

  it('returns nothing for a transcript with no questions', () => {
    expect(parseAnsweredQuestionsFromTranscript(line([{ type: 'text', text: 'hello' }]))).toEqual(
      []
    )
  })
})
