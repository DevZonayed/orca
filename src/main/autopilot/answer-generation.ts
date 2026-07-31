import type { GlobalSettings } from '../../shared/types'
import { planCommitMessageGeneration } from '../../shared/commit-message-plan'
import {
  resolveTextGenerationParams,
  runLocalPlan,
  type GenerateCommitMessageParams
} from '../text-generation/commit-message-text-generation'
import {
  prepareLocalCommitMessageAgentEnv,
  type CommitMessageAgentEnvironmentResolvers
} from '../text-generation/commit-message-agent-environment'
import type { GenerateAnswerResult } from './answer-decider'

export type AutopilotGenerationDeps = {
  getSettings: () => GlobalSettings
  getAgentEnvResolvers: () => CommitMessageAgentEnvironmentResolvers | undefined
  /** Where the generating CLI runs. Not the agent's cwd — see below. */
  getLocalCwd: () => string
}

/** Why: Autopilot builds its own prompt from the question, so the source-control
 *  lane's per-operation instructions and command template must not apply — a
 *  user's branch-name wording would otherwise steer an unrelated answer. */
function stripOperationTemplates(params: GenerateCommitMessageParams): GenerateCommitMessageParams {
  const { customPrompt: _customPrompt, commandInputTemplate: _template, ...rest } = params
  return rest
}

/**
 * Build the generation callback the decider uses, or null when nothing is configured.
 *
 * Generation always runs on the local machine, including for questions that
 * arrived from an SSH pane: the generating CLI reasons about the question text
 * and needs no access to the remote filesystem. Returning null is the
 * "no agent configured" signal, which the decider turns into an abstention.
 *
 * ponytail: reuses the `branchName` settings lane for agent + model, so Autopilot
 * cannot yet be pointed at a different model from branch naming. Give it its own
 * operation id once shadow mode proves the feature is worth a settings surface.
 */
export function createAutopilotAnswerGenerator(
  deps: AutopilotGenerationDeps
): ((prompt: string) => Promise<GenerateAnswerResult>) | null {
  const resolved = resolveTextGenerationParams(deps.getSettings(), 'local', 'branchName', null)
  if (!resolved.ok) {
    return null
  }
  const params = stripOperationTemplates(resolved.params)
  return async (prompt: string): Promise<GenerateAnswerResult> => {
    const planned = planCommitMessageGeneration(params, prompt)
    if (!planned.ok) {
      return { success: false, error: planned.error }
    }
    const localEnv = await prepareLocalCommitMessageAgentEnv(
      params.agentId,
      deps.getAgentEnvResolvers()
    )
    if (!localEnv.ok) {
      return { success: false, error: 'could not prepare the local generation environment' }
    }
    const result = await runLocalPlan(
      planned.plan,
      deps.getLocalCwd(),
      localEnv.env,
      'answer',
      'autopilot-answer'
    )
    return result.success
      ? { success: true, reply: result.rawOutput }
      : { success: false, error: result.error }
  }
}
