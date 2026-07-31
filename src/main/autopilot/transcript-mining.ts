import { readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseAnsweredQuestionsFromTranscript } from '../../shared/claude-transcript-answers'

export type MinedSeed = {
  questionText: string
  answer: string
  cwd?: string
}

export type MinedTranscript = {
  path: string
  fingerprint: string
  seeds: MinedSeed[]
}

/** Size+mtime, so an unchanged transcript is skipped without being read. */
export function transcriptFingerprint(path: string): string | null {
  try {
    const stats = statSync(path)
    return `${stats.size}:${Math.trunc(stats.mtimeMs)}`
  } catch {
    return null
  }
}

/** Claude Code encodes the project path into the directory name. */
function decodeProjectCwd(directoryName: string): string | undefined {
  return directoryName.startsWith('-') ? directoryName.replaceAll('-', '/') : undefined
}

export function claudeProjectsRoot(home: string = homedir()): string {
  return join(home, '.claude', 'projects')
}

/** Every Claude transcript on this machine, newest project directories first. */
export function listClaudeTranscripts(root: string): { path: string; cwd?: string }[] {
  let directories: string[]
  try {
    directories = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    return []
  }
  const transcripts: { path: string; cwd?: string }[] = []
  for (const directory of directories) {
    const cwd = decodeProjectCwd(directory)
    let files: string[]
    try {
      files = readdirSync(join(root, directory)).filter((name) => name.endsWith('.jsonl'))
    } catch {
      continue
    }
    for (const file of files) {
      transcripts.push({ path: join(root, directory, file), ...(cwd ? { cwd } : {}) })
    }
  }
  return transcripts
}

/**
 * Read one transcript and recover the answers it contains.
 *
 * Returns the fingerprint even when nothing was found, so a barren transcript is
 * recorded as scanned and never read again — which is most of them: measured on
 * this machine, 170 of 182 questions ended in a failure result, not an answer.
 */
export function mineTranscript(path: string, cwd: string | undefined): MinedTranscript | null {
  const fingerprint = transcriptFingerprint(path)
  if (!fingerprint) {
    return null
  }
  let contents: string
  try {
    contents = readFileSync(path, 'utf8')
  } catch {
    return null
  }
  const seeds = parseAnsweredQuestionsFromTranscript(contents).map((answer) => ({
    questionText: answer.question,
    answer: answer.answer,
    ...(cwd ? { cwd } : {})
  }))
  return { path, fingerprint, seeds }
}
