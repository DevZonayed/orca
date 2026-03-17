import { useCallback, useMemo } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
  arrayMove
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { X, Plus } from 'lucide-react'
import type { TerminalTab } from '../../../shared/types'

interface SortableTabProps {
  tab: TerminalTab
  isActive: boolean
  onActivate: (tabId: string) => void
  onClose: (tabId: string) => void
}

function SortableTab({ tab, isActive, onActivate, onClose }: SortableTabProps): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tab.id
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.8 : 1
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`group relative flex items-center h-full px-3 text-sm cursor-pointer select-none shrink-0 border-r border-border ${
        isActive
          ? 'bg-background text-foreground border-b-transparent'
          : 'bg-card text-muted-foreground hover:text-foreground hover:bg-accent/50'
      }`}
      onPointerDown={(e) => {
        // Allow dnd-kit to handle drag, but also activate tab
        onActivate(tab.id)
        // Forward to dnd-kit listeners
        listeners?.onPointerDown?.(e)
      }}
    >
      <span className="truncate max-w-[140px] mr-1.5">{tab.title}</span>
      <button
        className={`flex items-center justify-center w-4 h-4 rounded-sm shrink-0 ${
          isActive
            ? 'text-muted-foreground hover:text-foreground hover:bg-muted'
            : 'text-transparent group-hover:text-muted-foreground hover:!text-foreground hover:!bg-muted'
        }`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          onClose(tab.id)
        }}
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}

interface TabBarProps {
  tabs: TerminalTab[]
  activeTabId: string | null
  worktreeId: string
  onActivate: (tabId: string) => void
  onClose: (tabId: string) => void
  onReorder: (worktreeId: string, tabIds: string[]) => void
  onNewTab: () => void
}

export default function TabBar({
  tabs,
  activeTabId,
  worktreeId,
  onActivate,
  onClose,
  onReorder,
  onNewTab
}: TabBarProps): React.JSX.Element {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 }
    })
  )

  const tabIds = useMemo(() => tabs.map((t) => t.id), [tabs])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      const oldIndex = tabIds.indexOf(active.id as string)
      const newIndex = tabIds.indexOf(over.id as string)
      if (oldIndex === -1 || newIndex === -1) return

      const newOrder = arrayMove(tabIds, oldIndex, newIndex)
      onReorder(worktreeId, newOrder)
    },
    [tabIds, worktreeId, onReorder]
  )

  return (
    <div className="flex items-stretch h-9 bg-card border-b border-border overflow-hidden shrink-0">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={tabIds} strategy={horizontalListSortingStrategy}>
          <div className="flex items-stretch overflow-x-auto">
            {tabs.map((tab) => (
              <SortableTab
                key={tab.id}
                tab={tab}
                isActive={tab.id === activeTabId}
                onActivate={onActivate}
                onClose={onClose}
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
