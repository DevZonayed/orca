import { parentPort, workerData } from 'node:worker_threads'
import { listClaudeTranscripts, mineTranscript, transcriptFingerprint } from './transcript-mining'
import type { MinedTranscript } from './transcript-mining'

export type MiningWorkerInput = {
  root: string
  /** path → fingerprint already mined, so unchanged transcripts are never read. */
  alreadyMined: Record<string, string>
}

export type MiningWorkerOutput = {
  scanned: number
  skipped: number
  transcripts: MinedTranscript[]
}

/**
 * Walk every Claude transcript off the main thread.
 *
 * The corpus is gigabytes; reading it inline would jank the UI for seconds.
 * Only transcripts whose size+mtime changed are opened, so steady-state cost
 * after the first run is a directory walk and a stat per file.
 */
export function runMiningScan(input: MiningWorkerInput): MiningWorkerOutput {
  const transcripts: MinedTranscript[] = []
  let scanned = 0
  let skipped = 0
  for (const candidate of listClaudeTranscripts(input.root)) {
    const fingerprint = transcriptFingerprint(candidate.path)
    if (!fingerprint) {
      continue
    }
    if (input.alreadyMined[candidate.path] === fingerprint) {
      skipped += 1
      continue
    }
    const mined = mineTranscript(candidate.path, candidate.cwd)
    if (mined) {
      scanned += 1
      transcripts.push(mined)
    }
  }
  return { scanned, skipped, transcripts }
}

if (parentPort) {
  const input = workerData as MiningWorkerInput
  parentPort.postMessage(runMiningScan(input))
}
