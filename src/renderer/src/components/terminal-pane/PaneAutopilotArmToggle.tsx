import { Bot } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'

export function paneAutopilotArmLabel(armed: boolean): string {
  return armed
    ? translate('components.terminalPane.autopilotArmed', 'Autopilot on for this session')
    : translate('components.terminalPane.autopilotDisarmed', 'Autopilot off for this session')
}

/**
 * Arm or disarm Autopilot for one session.
 *
 * Rendered only when the global switch is on, because arming a session while
 * Autopilot is globally off would look armed and never act. Both keys are
 * required before anything is sent — see `sendAutopilotAnswer`.
 */
export function PaneAutopilotArmToggle({
  armed,
  onToggle
}: {
  armed: boolean
  onToggle: (armed: boolean) => void
}): React.JSX.Element {
  const label = paneAutopilotArmLabel(armed)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-pressed={armed}
          aria-label={label}
          onClick={(event) => {
            event.stopPropagation()
            onToggle(!armed)
          }}
        >
          <Bot className={armed ? 'size-3 text-foreground' : 'size-3 opacity-40'} />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
