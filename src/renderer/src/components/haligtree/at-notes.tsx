import { chime } from '@/lib/sound'
import type { Task } from '@/lib/haligtree'
import { FileText } from 'lucide-react'
import { hoverNote } from './note-preview'

/** The note a line was linked to with @, and the words it was put in as, to read back as plain words. */
export type AtLink = { id: string; plain: { from: number; to: number }[] }

export function FromNote({ task }: { task: Task }): React.JSX.Element | null {
  if (!task.captureId || task.fromId !== task.captureId || !task.fromTitle) return null
  return (
    <button type="button" data-from-note={task.captureId} onClick={() => (chime('open'), window.api.openInHome(task.fromType ?? 'capture', task.captureId!))}
      {...(task.fromType ? {} : hoverNote('capture', task.captureId))}
      className="mf-hit relative mt-0.5 flex max-w-full items-center gap-1 text-control font-medium text-muted-foreground hover:text-foreground">
      <FileText aria-hidden className="size-3.5 shrink-0" />
      <span className="truncate underline decoration-foreground/20 underline-offset-2">{task.fromTitle}</span>
    </button>
  )
}
