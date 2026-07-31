import { useCallback, useEffect, useState } from 'react'
import { agreementRate, type AutopilotActivity } from '../../../../shared/autopilot-activity'
import { SettingsBadge, SettingsSubsectionHeader } from './SettingsFormControls'
import {
  formatAutopilotHumanAnswer,
  formatAutopilotProposedAnswer,
  getAutopilotActivityDescription,
  getAutopilotActivityEmpty,
  getAutopilotActivityStatLabels,
  getAutopilotActivityTitle,
  getAutopilotAgreementUntested,
  getAutopilotDeclinedHeading,
  getAutopilotRecentHeading
} from './autopilot-activity-copy'

function Stat({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="min-w-0 space-y-0.5">
      <div className="text-sm font-medium tabular-nums text-foreground">{value}</div>
      <div className="truncate text-xs text-muted-foreground">{label}</div>
    </div>
  )
}

function formatAgreement(activity: AutopilotActivity): string {
  const rate = agreementRate(activity)
  // Why: an untested rate is not 0%. Showing a percentage here would read as
  // "it is always wrong" when the truth is that it has never been scored.
  return rate === null ? getAutopilotAgreementUntested() : `${Math.round(rate * 100)}%`
}

export function AutopilotActivityPanel(): React.JSX.Element {
  const [activity, setActivity] = useState<AutopilotActivity | null>(null)
  const statLabels = getAutopilotActivityStatLabels()

  const load = useCallback(() => {
    void window.api.autopilot
      .getActivity()
      .then(setActivity)
      .catch((error: unknown) => {
        console.warn('[autopilot] could not load activity', error)
      })
  }, [])

  // Why: on mount only. The main-side read is synchronous sqlite, so it must
  // not be tied to render.
  useEffect(load, [load])

  return (
    <section className="space-y-3">
      <SettingsSubsectionHeader
        title={getAutopilotActivityTitle()}
        description={getAutopilotActivityDescription()}
      />
      {!activity || !activity.hasData ? (
        <p className="text-xs text-muted-foreground">{getAutopilotActivityEmpty()}</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label={statLabels.agreement} value={formatAgreement(activity)} />
            <Stat label={statLabels.scored} value={String(activity.resolved)} />
            <Stat label={statLabels.sent} value={String(activity.sent)} />
            <Stat label={statLabels.declined} value={String(activity.abstained)} />
            <Stat label={statLabels.pending} value={String(activity.pending)} />
            <Stat label={statLabels.decisions} value={String(activity.decisions)} />
          </div>

          {activity.abstentionReasons.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-foreground/80">
                {getAutopilotDeclinedHeading()}
              </div>
              <ul className="space-y-1">
                {activity.abstentionReasons.map((entry) => (
                  <li
                    key={entry.reason}
                    className="flex items-start justify-between gap-3 text-xs text-muted-foreground"
                  >
                    <span className="min-w-0 flex-1 break-words">{entry.reason}</span>
                    <SettingsBadge tone="muted">{entry.count}</SettingsBadge>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {activity.recent.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-foreground/80">
                {getAutopilotRecentHeading()}
              </div>
              <ul className="space-y-2">
                {activity.recent.map((proposal, index) => (
                  <li
                    key={`${proposal.proposedAt}-${index}`}
                    className="space-y-0.5 border-l-2 border-border/50 pl-2.5"
                  >
                    <div className="break-words text-xs text-foreground/90">
                      {proposal.question}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      <SettingsBadge tone={proposal.matched === true ? 'accent' : 'muted'}>
                        {proposal.source}
                      </SettingsBadge>
                      {proposal.proposedAnswer ? (
                        <span className="break-words">
                          {formatAutopilotProposedAnswer(proposal.proposedAnswer)}
                        </span>
                      ) : null}
                      {proposal.humanAnswer ? (
                        <span className="break-words">
                          {formatAutopilotHumanAnswer(proposal.humanAnswer)}
                        </span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
