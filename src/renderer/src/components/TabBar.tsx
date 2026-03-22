import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { X, Plus, FileCode, GitCompareArrows, Copy } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import type { TerminalTab } from '../../../shared/types'
import type { OpenFile } from '../store/slices/editor'
import { SortableTab } from './SortableTab'

const CLOSE_ALL_CONTEXT_MENUS_EVENT = 'orca-close-all-context-menus'

function EditorFileTab({
  file,
  isActive,
  editorFileCount,
  onActivate,
  onClose,
  onCloseOthers,
  onCloseAll
}: {
  file: OpenFile
  isActive: boolean
  editorFileCount: number
  onActivate: () => void
  onClose: () => void
  onCloseOthers: () => void
  onCloseAll: () => void
}): React.JSX.Element {
  const fileName = file.relativePath.split('/').pop() ?? file.relativePath
  const isDiff = file.mode === 'diff'
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPoint, setMenuPoint] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const closeMenu = (): void => setMenuOpen(false)
    window.addEventListener(CLOSE_ALL_CONTEXT_MENUS_EVENT, closeMenu)
    return () => window.removeEventListener(CLOSE_ALL_CONTEXT_MENUS_EVENT, closeMenu)
  }, [])

  return (
    <>
      <div
        onContextMenuCapture={(event) => {
          event.preventDefault()
          window.dispatchEvent(new Event(CLOSE_ALL_CONTEXT_MENUS_EVENT))
          setMenuPoint({ x: event.clientX, y: event.clientY })
          setMenuOpen(true)
        }}
      >
        <div
          className={`group relative flex items-center h-full px-3 text-sm cursor-pointer select-none shrink-0 border-r border-border ${
            isActive
              ? 'bg-background text-foreground border-b-transparent'
              : 'bg-card text-muted-foreground hover:text-foreground hover:bg-accent/50'
          }`}
          onClick={onActivate}
          onMouseDown={(e) => {
            if (e.button === 1) {
              e.preventDefault()
              e.stopPropagation()
              onClose()
            }
          }}
        >
          {isDiff ? (
            <GitCompareArrows className="w-3.5 h-3.5 mr-1.5 shrink-0 text-muted-foreground" />
          ) : (
            <FileCode className="w-3.5 h-3.5 mr-1.5 shrink-0 text-muted-foreground" />
          )}
          {file.isDirty && (
            <span className="mr-1 size-1.5 rounded-full bg-foreground/60 shrink-0" />
          )}
          <span className="truncate max-w-[130px] mr-1.5">
            {isDiff
              ? file.relativePath === 'All Changes'
                ? 'All Changes'
                : `${fileName} (diff${file.diffStaged ? ' staged' : ''})`
              : fileName}
          </span>
          <button
            className={`flex items-center justify-center w-4 h-4 rounded-sm shrink-0 ${
              isActive
                ? 'text-muted-foreground hover:text-foreground hover:bg-muted'
                : 'text-transparent group-hover:text-muted-foreground hover:!text-foreground hover:!bg-muted'
            }`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              onClose()
            }}
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen} modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            aria-hidden
            tabIndex={-1}
            className="pointer-events-none fixed size-px opacity-0"
            style={{ left: menuPoint.x, top: menuPoint.y }}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-48" sideOffset={0} align="start">
          <DropdownMenuItem onSelect={onClose}>Close</DropdownMenuItem>
          <DropdownMenuItem onSelect={onCloseOthers} disabled={editorFileCount <= 1}>
            Close Others
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onCloseAll}>Close All Editor Tabs</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              navigator.clipboard.writeText(file.filePath)
            }}
          >
            <Copy className="w-3.5 h-3.5 mr-1.5" />
            Copy Path
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}

type TabBarProps = {
  tabs: TerminalTab[]
  activeTabId: string | null
  worktreeId: string
  expandedPaneByTabId: Record<string, boolean>
  onActivate: (tabId: string) => void
  onClose: (tabId: string) => void
  onCloseOthers: (tabId: string) => void
  onCloseToRight: (tabId: string) => void
  onReorder: (worktreeId: string, tabIds: string[]) => void
  onNewTab: () => void
  onSetCustomTitle: (tabId: string, title: string | null) => void
  onSetTabColor: (tabId: string, color: string | null) => void
  onTogglePaneExpand: (tabId: string) => void
  editorFiles?: OpenFile[]
  activeFileId?: string | null
  activeTabType?: 'terminal' | 'editor'
  onActivateFile?: (fileId: string) => void
  onCloseFile?: (fileId: string) => void
  onCloseAllFiles?: () => void
}

export default function TabBar({
  tabs,
  activeTabId,
  worktreeId,
  expandedPaneByTabId,
  onActivate,
  onClose,
  onCloseOthers,
  onCloseToRight,
  onReorder,
  onNewTab,
  onSetCustomTitle,
  onSetTabColor,
  onTogglePaneExpand,
  editorFiles,
  activeFileId,
  activeTabType,
  onActivateFile,
  onCloseFile,
  onCloseAllFiles: _onCloseAllFiles
}: TabBarProps): React.JSX.Element {
  void _onCloseAllFiles
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 }
    })
  )

  const tabIds = useMemo(() => tabs.map((t) => t.id), [tabs])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) {
        return
      }

      const oldIndex = tabIds.indexOf(active.id as string)
      const newIndex = tabIds.indexOf(over.id as string)
      if (oldIndex === -1 || newIndex === -1) {
        return
      }

      const newOrder = arrayMove(tabIds, oldIndex, newIndex)
      onReorder(worktreeId, newOrder)
    },
    [tabIds, worktreeId, onReorder]
  )

  // Horizontal wheel scrolling for the tab strip
  const tabStripRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = tabStripRef.current
    if (!el) {
      return
    }
    const onWheel = (e: WheelEvent): void => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault()
        el.scrollLeft += e.deltaY
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const handleCloseOtherEditorFiles = useCallback(
    (keepFileId: string) => {
      if (!editorFiles || !onCloseFile) {
        return
      }
      for (const f of editorFiles) {
        if (f.id !== keepFileId) {
          onCloseFile(f.id)
        }
      }
    },
    [editorFiles, onCloseFile]
  )

  return (
    <div className="flex items-stretch h-9 bg-card border-b border-border overflow-hidden shrink-0">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={tabIds} strategy={horizontalListSortingStrategy}>
          <div
            ref={tabStripRef}
            className="terminal-tab-strip flex items-stretch overflow-x-auto overflow-y-hidden"
          >
            {tabs.map((tab, index) => (
              <SortableTab
                key={tab.id}
                tab={tab}
                tabCount={tabs.length}
                hasTabsToRight={index < tabs.length - 1}
                isActive={activeTabType === 'terminal' && tab.id === activeTabId}
                isExpanded={expandedPaneByTabId[tab.id] === true}
                onActivate={onActivate}
                onClose={onClose}
                onCloseOthers={onCloseOthers}
                onCloseToRight={onCloseToRight}
                onSetCustomTitle={onSetCustomTitle}
                onSetTabColor={onSetTabColor}
                onToggleExpand={onTogglePaneExpand}
              />
            ))}
            {/* Editor tabs - after terminal tabs */}
            {editorFiles?.map((file) => (
              <EditorFileTab
                key={file.id}
                file={file}
                isActive={activeTabType === 'editor' && activeFileId === file.id}
                editorFileCount={editorFiles.length}
                onActivate={() => onActivateFile?.(file.id)}
                onClose={() => onCloseFile?.(file.id)}
                onCloseOthers={() => handleCloseOtherEditorFiles(file.id)}
                onCloseAll={() => _onCloseAllFiles?.()}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <button
        className="flex items-center justify-center w-9 h-full shrink-0 text-muted-foreground hover:text-foreground hover:bg-accent/50"
        onClick={onNewTab}
        title="New terminal (Cmd+T)"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  )
}
