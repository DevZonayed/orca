import { translate } from '@/i18n/i18n'
import { searchKeywords } from './settings-search-keywords'

const AUTOPILOT_AUTO_ANSWER_TITLE_KEY = 'auto.components.settings.autopilot-auto-answer-copy.title'
const AUTOPILOT_AUTO_ANSWER_DESCRIPTION_KEY =
  'auto.components.settings.autopilot-auto-answer-copy.description'

export function getAutopilotAutoAnswerTitle(): string {
  return translate(AUTOPILOT_AUTO_ANSWER_TITLE_KEY, 'Autopilot answers')
}

export function getAutopilotAutoAnswerDescription(): string {
  return translate(
    AUTOPILOT_AUTO_ANSWER_DESCRIPTION_KEY,
    'Answers non-destructive agent questions on local panes for you, using your past choices. Questions that mention anything consequential are always left for you.'
  )
}

export function getAutopilotAutoAnswerSearchKeywords(): string[] {
  return searchKeywords([
    { key: 'auto.components.settings.agents.search.autopilot', fallback: 'autopilot' },
    { key: 'auto.components.settings.agents.search.answer', fallback: 'answer' },
    { key: 'auto.components.settings.agents.search.6984d4291a', fallback: 'status' },
    { key: 'auto.components.settings.agents.search.13b20636a6', fallback: 'waiting' },
    { key: 'auto.components.settings.agents.search.automatic', fallback: 'automatic' },
    { key: 'auto.components.settings.agents.search.5963143e00', fallback: 'settings' }
  ])
}
