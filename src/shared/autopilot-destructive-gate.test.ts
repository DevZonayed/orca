import { describe, expect, it } from 'vitest'
import { classifyQuestionSafety } from './autopilot-destructive-gate'
import type { AskUserQuestionPrompt } from './agent-question-answered-option'

function prompt(overrides: Partial<AskUserQuestionPrompt> = {}): AskUserQuestionPrompt {
  return {
    header: 'Approach',
    question: 'How should the parser handle unknown tokens?',
    multiSelect: false,
    options: [{ label: 'Skip them' }, { label: 'Raise an error' }],
    ...overrides
  }
}

describe('classifyQuestionSafety', () => {
  it('allows an ordinary implementation choice', () => {
    expect(classifyQuestionSafety(prompt())).toEqual({ safe: true })
  })

  it('refuses when the question itself is destructive', () => {
    const safety = classifyQuestionSafety(
      prompt({ question: 'Should I delete the old migration files?' })
    )
    expect(safety.safe).toBe(false)
    expect(safety.matched).toBe('delete')
  })

  it('refuses when the header is destructive', () => {
    expect(classifyQuestionSafety(prompt({ header: 'Deploy target' })).safe).toBe(false)
  })

  it('refuses a whole prompt when any option is destructive, not just the chosen one', () => {
    const safety = classifyQuestionSafety(
      prompt({
        options: [{ label: 'Keep the branch' }, { label: 'Force-push the rewritten history' }]
      })
    )
    expect(safety.safe).toBe(false)
  })

  it('refuses when only an option description is destructive', () => {
    const safety = classifyQuestionSafety(
      prompt({
        options: [
          { label: 'Option A', description: 'Cleans up by removing the generated folder' },
          { label: 'Option B' }
        ]
      })
    )
    expect(safety.safe).toBe(false)
  })

  it.each([
    ['Allow always', 'allow always'],
    ["Don't ask again", "don't ask again"],
    ['Yes to all', 'yes to all'],
    ['Bypass the sandbox', 'bypass'],
    ['Skip the confirmation prompt', 'skip the confirmation']
  ])('refuses permission escalation: %s', (label) => {
    expect(classifyQuestionSafety(prompt({ options: [{ label }] })).safe).toBe(false)
  })

  it.each([
    'Delete the branch',
    'Remove the cache directory',
    'Run rm -rf build',
    'Drop the users table',
    'Reset --hard to origin',
    'Rebase onto main',
    'Merge into main',
    'Deploy to production',
    'Publish the package',
    'Charge the customer',
    'Rotate the API key',
    'Shutdown the container',
    'Run the migration',
    'sudo the install',
    'Overwrite the config'
  ])('refuses the destructive option "%s"', (label) => {
    expect(classifyQuestionSafety(prompt({ options: [{ label }] })).safe).toBe(false)
  })

  it.each([
    'Use a lookup table',
    'Add a unit test',
    'Rename the variable',
    'Return early',
    'Log a warning',
    'Keep the current behaviour'
  ])('allows the benign option "%s"', (label) => {
    expect(classifyQuestionSafety(prompt({ options: [{ label }] })).safe).toBe(true)
  })

  it('matches case-insensitively', () => {
    expect(classifyQuestionSafety(prompt({ options: [{ label: 'DELETE IT' }] })).safe).toBe(false)
  })

  it('reports which phrase disqualified the prompt so a refusal is auditable', () => {
    const safety = classifyQuestionSafety(prompt({ options: [{ label: 'Deploy it' }] }))
    expect(safety.matched).toBe('deploy')
  })
})
