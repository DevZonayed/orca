import { useAppStore } from '../store'

export default function Landing(): React.JSX.Element {
  const repos = useAppStore((s) => s.repos)
  const addRepo = useAppStore((s) => s.addRepo)

  return (
    <div className="flex-1 flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <h1 className="text-5xl font-bold text-muted-foreground tracking-tight">Orca</h1>
        {repos.length === 0 ? (
          <>
            <p className="text-sm text-muted-foreground">Get started by adding a repository</p>
            <button
              className="bg-secondary border border-border text-foreground font-mono text-sm px-6 py-2 rounded-md cursor-pointer hover:bg-accent transition-colors"
              onClick={addRepo}
            >
              Add Repository
            </button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Select a worktree from the sidebar</p>
        )}
      </div>
    </div>
  )
}
