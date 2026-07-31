import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listClaudeTranscripts, mineTranscript, transcriptFingerprint } from './transcript-mining'
import { runMiningScan } from './autopilot-mining-worker'

let root: string

function writeTranscript(projectDir: string, name: string, lines: string[]): string {
  const directory = join(root, projectDir)
  mkdirSync(directory, { recursive: true })
  const path = join(directory, name)
  writeFileSync(path, lines.join('\n'))
  return path
}

const answeredTranscript = [
  JSON.stringify({
    message: { content: [{ type: 'tool_use', name: 'AskUserQuestion', id: 'toolu_1' }] }
  }),
  JSON.stringify({
    message: {
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'toolu_1',
          content: 'Your questions have been answered: "Which auth?"="API keys".'
        }
      ]
    }
  })
]

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'autopilot-mining-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('listClaudeTranscripts', () => {
  it('finds transcripts and decodes the project path from the directory name', () => {
    writeTranscript('-Users-me-repo', 'a.jsonl', ['{}'])
    const found = listClaudeTranscripts(root)
    expect(found).toHaveLength(1)
    expect(found[0].cwd).toBe('/Users/me/repo')
  })

  it('ignores non-jsonl files', () => {
    writeTranscript('-Users-me-repo', 'notes.txt', ['x'])
    expect(listClaudeTranscripts(root)).toEqual([])
  })

  it('returns nothing when the root does not exist', () => {
    expect(listClaudeTranscripts(join(root, 'missing'))).toEqual([])
  })
})

describe('mineTranscript', () => {
  it('recovers seeds and stamps the project cwd', () => {
    const path = writeTranscript('-Users-me-repo', 'a.jsonl', answeredTranscript)
    const mined = mineTranscript(path, '/Users/me/repo')
    expect(mined?.seeds).toEqual([
      { questionText: 'Which auth?', answer: 'API keys', cwd: '/Users/me/repo' }
    ])
  })

  it('still returns a fingerprint for a transcript with no answers', () => {
    const path = writeTranscript('-Users-me-repo', 'a.jsonl', ['{"message":{"content":[]}}'])
    const mined = mineTranscript(path, undefined)
    expect(mined?.seeds).toEqual([])
    expect(mined?.fingerprint).toBeTruthy()
  })

  it('returns null for a file that does not exist', () => {
    expect(mineTranscript(join(root, 'nope.jsonl'), undefined)).toBeNull()
  })
})

describe('runMiningScan', () => {
  it('reads transcripts it has not seen', () => {
    writeTranscript('-Users-me-repo', 'a.jsonl', answeredTranscript)
    const output = runMiningScan({ root, alreadyMined: {} })
    expect(output.scanned).toBe(1)
    expect(output.skipped).toBe(0)
    expect(output.transcripts[0].seeds).toHaveLength(1)
  })

  it('skips a transcript whose fingerprint is unchanged', () => {
    const path = writeTranscript('-Users-me-repo', 'a.jsonl', answeredTranscript)
    const fingerprint = transcriptFingerprint(path)!
    const output = runMiningScan({ root, alreadyMined: { [path]: fingerprint } })
    expect(output.skipped).toBe(1)
    expect(output.scanned).toBe(0)
    expect(output.transcripts).toEqual([])
  })

  it('re-reads a transcript that changed since it was mined', () => {
    const path = writeTranscript('-Users-me-repo', 'a.jsonl', answeredTranscript)
    const output = runMiningScan({ root, alreadyMined: { [path]: '1:1' } })
    expect(output.scanned).toBe(1)
  })
})
