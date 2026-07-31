import { translate } from '@/i18n/i18n'

const ACTIVITY_TITLE_KEY = 'auto.components.settings.autopilot-activity-copy.title'
const ACTIVITY_DESCRIPTION_KEY = 'auto.components.settings.autopilot-activity-copy.description'
const ACTIVITY_EMPTY_KEY = 'auto.components.settings.autopilot-activity-copy.empty'
const AGREEMENT_UNTESTED_KEY = 'auto.components.settings.autopilot-activity-copy.untested'

export function getAutopilotActivityTitle(): string {
  return translate(ACTIVITY_TITLE_KEY, 'Autopilot activity')
}

export function getAutopilotActivityDescription(): string {
  return translate(
    ACTIVITY_DESCRIPTION_KEY,
    'What Autopilot would have answered, scored against what you actually chose. Recorded whether or not Autopilot is turned on.'
  )
}

export function getAutopilotActivityEmpty(): string {
  return translate(
    ACTIVITY_EMPTY_KEY,
    'Nothing recorded yet. Answer an agent question and it will appear here.'
  )
}

/** Why: "0%" would read as "always wrong" when nothing has been scored at all. */
export function getAutopilotAgreementUntested(): string {
  return translate(AGREEMENT_UNTESTED_KEY, 'Not yet scored')
}

export function getAutopilotActivityStatLabels(): Record<string, string> {
  return {
    agreement: translate(
      'auto.components.settings.autopilot-activity-copy.stat.agreement',
      'Agreement'
    ),
    scored: translate('auto.components.settings.autopilot-activity-copy.stat.scored', 'Scored'),
    sent: translate(
      'auto.components.settings.autopilot-activity-copy.stat.sent',
      'Answered for you'
    ),
    declined: translate(
      'auto.components.settings.autopilot-activity-copy.stat.declined',
      'Declined'
    ),
    pending: translate(
      'auto.components.settings.autopilot-activity-copy.stat.pending',
      'Awaiting your answer'
    ),
    decisions: translate(
      'auto.components.settings.autopilot-activity-copy.stat.decisions',
      'Decisions remembered'
    )
  }
}

export function getAutopilotDeclinedHeading(): string {
  return translate('auto.components.settings.autopilot-activity-copy.declined', 'Why it declined')
}

export function getAutopilotRecentHeading(): string {
  return translate('auto.components.settings.autopilot-activity-copy.recent', 'Recent questions')
}

/** Renders as: proposed “X” · you chose “Y”. */
export function formatAutopilotProposedAnswer(answer: string): string {
  return translate(
    'auto.components.settings.autopilot-activity-copy.proposed',
    'proposed “{answer}”'
  ).replace('{answer}', answer)
}

export function formatAutopilotHumanAnswer(answer: string): string {
  return translate(
    'auto.components.settings.autopilot-activity-copy.chose',
    '· you chose “{answer}”'
  ).replace('{answer}', answer)
}
