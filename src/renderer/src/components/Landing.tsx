import { useMemo } from 'react'
import { FolderPlus, GitBranchPlus } from 'lucide-react'
import { useAppStore } from '../store'
import logo from '../../../../resources/icon.png'

type ShortcutItem = {
  id: string
  keys: string[]
  action: string
}

function KeyCap({ label }: { label: string }): React.JSX.Element {
  return (
    <span className="inline-flex min-w-6 items-center justify-center rounded border border-border/80 bg-secondary/70 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
      {label}
    </span>
  )
}

export default function Landing(): React.JSX.Element {
  const repos = useAppStore((s) => s.repos)
  const addRepo = useAppStore((s) => s.addRepo)
  const openModal = useAppStore((s) => s.openModal)

  const canCreateWorktree = repos.length > 0

  const shortcuts = useMemo<ShortcutItem[]>(() => {
    const items: ShortcutItem[] = []
    if (canCreateWorktree) {
      items.push({ id: 'create', keys: ['⌘', 'N'], action: 'Create worktree' })
      items.push({ id: 'up', keys: ['⌘', '⇧', '↑'], action: 'Move up worktree' })
      items.push({ id: 'down', keys: ['⌘', '⇧', '↓'], action: 'Move down worktree' })
    }
    return items
  }, [canCreateWorktree])

  return (
    <div className="flex-1 flex items-center justify-center bg-background">
      <div className="w-full max-w-lg px-6">
        <div className="flex flex-col items-center gap-4 py-8">
          <img
            src={logo}
            alt="Orca logo"
            className="size-16 rounded-xl shadow-lg shadow-black/40"
          />
          <h1 className="text-4xl font-bold text-foreground tracking-tight">ORCA</h1>

          <p className="text-sm text-muted-foreground text-center">
            {canCreateWorktree
              ? 'Select a worktree from the sidebar to begin.'
              : 'Add a repository to get started.'}
          </p>

          <div className="flex items-center justify-center gap-2.5 flex-wrap">
            <button
              className="inline-flex items-center gap-1.5 bg-secondary/70 border border-border/80 text-foreground font-medium text-sm px-4 py-2 rounded-md cursor-pointer hover:bg-accent transition-colors"
              onClick={addRepo}
            >
              <FolderPlus className="size-3.5" />
              Add Repo
            </button>

            {canCreateWorktree && (
              <button
                className="inline-flex items-center gap-1.5 bg-secondary/70 border border-border/80 text-foreground font-medium text-sm px-4 py-2 rounded-md cursor-pointer hover:bg-accent transition-colors"
                onClick={() => openModal('create-worktree')}
              >
                <GitBranchPlus className="size-3.5" />
                Create Worktree
              </button>
            )}
          </div>

          {shortcuts.length > 0 && (
            <div className="mt-6 w-full max-w-xs space-y-2">
              {shortcuts.map((shortcut) => (
                <div key={shortcut.id} className="grid grid-cols-[1fr_auto] items-center gap-3">
                  <span className="text-sm text-muted-foreground">{shortcut.action}</span>
                  <div className="flex items-center gap-1">
                    {shortcut.keys.map((key) => (
                      <KeyCap key={`${shortcut.id}-${key}`} label={key} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
