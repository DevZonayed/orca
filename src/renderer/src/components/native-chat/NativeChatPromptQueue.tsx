import { useState } from 'react'
import { ChevronDown, ChevronUp, Pause, Play, X } from 'lucide-react'
import { useAppStore } from '../../store'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'

/**
 * Prompts waiting for this session's agent to finish.
 *
 * Renders nothing when the queue is empty, so a session that never queues
 * anything sees no change at all. One prompt leaves per busy→free transition.
 */
export function NativeChatPromptQueue({ paneKey }: { paneKey: string }): React.JSX.Element | null {
  const queue = useAppStore((store) => store.promptQueuesByPaneKey[paneKey])
  const editPrompt = useAppStore((store) => store.editQueuedPromptForPane)
  const movePrompt = useAppStore((store) => store.moveQueuedPromptForPane)
  const removePrompt = useAppStore((store) => store.removeQueuedPromptForPane)
  const setPaused = useAppStore((store) => store.setPromptQueuePausedForPane)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')

  if (!queue || queue.items.length === 0) {
    return null
  }

  const commitEdit = (id: string): void => {
    editPrompt(paneKey, id, editingText)
    setEditingId(null)
  }

  return (
    <div className="mb-1.5 space-y-1 rounded-md border border-border/50 bg-muted/20 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-foreground/80">
          {translate('components.native-chat.queue.title', 'Queued ({value0})').replace(
            '{value0}',
            String(queue.items.length)
          )}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-pressed={queue.paused}
          aria-label={
            queue.paused
              ? translate('components.native-chat.queue.resume', 'Resume queue')
              : translate('components.native-chat.queue.pause', 'Pause queue')
          }
          onClick={() => setPaused(paneKey, !queue.paused)}
        >
          {queue.paused ? <Play className="size-3" /> : <Pause className="size-3" />}
        </Button>
      </div>
      {queue.paused ? (
        <p className="text-[11px] text-muted-foreground">
          {translate('components.native-chat.queue.pausedNotice', 'Paused — nothing will be sent.')}
        </p>
      ) : null}
      <ul className="space-y-1">
        {queue.items.map((item, index) => (
          <li key={item.id} className="flex items-start gap-1">
            {editingId === item.id ? (
              <input
                autoFocus
                className="min-w-0 flex-1 rounded border border-border bg-background px-1.5 py-0.5 text-xs"
                aria-label={translate('components.native-chat.queue.edit', 'Edit queued prompt')}
                value={editingText}
                onChange={(event) => setEditingText(event.target.value)}
                onBlur={() => commitEdit(item.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    commitEdit(item.id)
                  } else if (event.key === 'Escape') {
                    setEditingId(null)
                  }
                }}
              />
            ) : (
              <button
                type="button"
                className="min-w-0 flex-1 truncate rounded px-1 text-left text-xs text-foreground/90 hover:bg-muted/50"
                title={item.text}
                aria-label={translate('components.native-chat.queue.edit', 'Edit queued prompt')}
                onClick={() => {
                  setEditingId(item.id)
                  setEditingText(item.text)
                }}
              >
                {item.text}
              </button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              disabled={index === 0}
              aria-label={translate('components.native-chat.queue.moveUp', 'Move up')}
              onClick={() => movePrompt(paneKey, item.id, index - 1)}
            >
              <ChevronUp className="size-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              disabled={index === queue.items.length - 1}
              aria-label={translate('components.native-chat.queue.moveDown', 'Move down')}
              onClick={() => movePrompt(paneKey, item.id, index + 1)}
            >
              <ChevronDown className="size-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={translate('components.native-chat.queue.remove', 'Remove from queue')}
              onClick={() => removePrompt(paneKey, item.id)}
            >
              <X className="size-3" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
