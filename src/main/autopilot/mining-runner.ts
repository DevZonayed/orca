import { Worker } from 'node:worker_threads'
import { join } from 'node:path'
import { app } from 'electron'
import type { AutopilotDecisionStore } from './decision-store'
import { claudeProjectsRoot } from './transcript-mining'
import type { MiningWorkerInput, MiningWorkerOutput } from './autopilot-mining-worker'

/** Generous: the first run reads gigabytes; later runs only stat unchanged files. */
const MINING_TIMEOUT_MS = 120_000

function getMiningWorkerPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'app.asar', 'out', 'main', 'autopilot-mining-worker.js')
  }
  return join(__dirname, 'autopilot-mining-worker.js')
}

function runWorker(input: MiningWorkerInput): Promise<MiningWorkerOutput | null> {
  return new Promise((resolve) => {
    let worker: Worker
    try {
      worker = new Worker(getMiningWorkerPath(), { workerData: input })
    } catch (error) {
      console.warn('[autopilot] could not start the mining worker', error)
      resolve(null)
      return
    }
    let settled = false
    const settle = (result: MiningWorkerOutput | null): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      worker.removeAllListeners()
      void worker.terminate()
      resolve(result)
    }
    const timeout = setTimeout(() => settle(null), MINING_TIMEOUT_MS)
    timeout.unref?.()
    worker.once('message', (message: unknown) => settle(message as MiningWorkerOutput))
    worker.once('error', (error) => {
      console.warn('[autopilot] mining worker failed', error)
      settle(null)
    })
    worker.once('exit', () => settle(null))
  })
}

export type MiningSummary = {
  scanned: number
  skipped: number
  seeded: number
}

/**
 * Seed Autopilot's memory from Claude transcripts already on this machine.
 *
 * Best-effort and idempotent: a failure leaves the store exactly as it was, and
 * a second run re-reads nothing that has not changed. The yield is small by
 * measurement — most transcript questions end in a failure result rather than an
 * answer — so this is about starting from *something*, not about volume.
 */
export async function seedAutopilotMemoryFromHistory(
  store: AutopilotDecisionStore,
  root: string = claudeProjectsRoot()
): Promise<MiningSummary | null> {
  const output = await runWorker({ root, alreadyMined: store.getMinedFingerprints() })
  if (!output) {
    return null
  }
  let seeded = 0
  for (const transcript of output.transcripts) {
    if (store.isFileMined(transcript.path, transcript.fingerprint)) {
      continue
    }
    try {
      seeded += store.seedMinedDecisions(transcript.seeds)
      store.markFileMined(transcript.path, transcript.fingerprint, transcript.seeds.length)
    } catch (error) {
      console.warn('[autopilot] failed to seed a transcript', transcript.path, error)
    }
  }
  return { scanned: output.scanned, skipped: output.skipped, seeded }
}
