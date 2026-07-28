import React, { useEffect, useRef, useState } from 'react'
import { FolderPlus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'

export function RemoteDirectoryCreation({
  disabled,
  onCreate,
  onPendingChange
}: {
  disabled: boolean
  onCreate: (name: string) => Promise<void>
  onPendingChange: (pending: boolean) => void
}): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const cancel = (): void => {
    if (submitting) {
      return
    }
    setEditing(false)
    setName('')
    setError(null)
  }

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    if (submitting) {
      return
    }
    setSubmitting(true)
    onPendingChange(true)
    setError(null)
    try {
      await onCreate(name)
      if (mountedRef.current) {
        setEditing(false)
        setName('')
      }
    } catch (creationError) {
      if (mountedRef.current) {
        setError(creationError instanceof Error ? creationError.message : String(creationError))
      }
    } finally {
      if (mountedRef.current) {
        setSubmitting(false)
        onPendingChange(false)
      }
    }
  }

  if (!editing) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        disabled={disabled}
        onClick={() => setEditing(true)}
      >
        <FolderPlus />
        {translate('auto.components.sidebar.RemoteDirectoryCreation.newFolder', 'New folder')}
      </Button>
    )
  }

  return (
    <div className="min-w-0 flex-1">
      <form className="flex items-center gap-2" onSubmit={submit}>
        <Input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              cancel()
            }
          }}
          aria-label={translate(
            'auto.components.sidebar.RemoteDirectoryCreation.folderName',
            'Folder name'
          )}
          aria-invalid={Boolean(error)}
          disabled={submitting}
          className="h-7 text-xs"
        />
        <Button type="submit" size="sm" className="h-7 text-xs" disabled={submitting}>
          {submitting && <Loader2 className="animate-spin" />}
          {translate('auto.components.sidebar.RemoteDirectoryCreation.create', 'Create')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          disabled={submitting}
          onClick={cancel}
        >
          {translate('auto.components.sidebar.RemoteDirectoryCreation.dismiss', 'Dismiss')}
        </Button>
      </form>
      {error && (
        <p role="alert" className="mt-1 text-[11px] text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
