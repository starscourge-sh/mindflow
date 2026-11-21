import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Gem } from '@/components/ui/icons'
import { chime } from '@/lib/sound'
import { useLive } from '@/lib/haligtree'
import { tipUp, useTipUp } from '@/lib/motion'
import { folders, type Folder, type GemIdea } from '@/lib/folders'
import { Island, Pressed, toast } from './ui'
import { num, plural } from '../../../../main/dates'

/**
 * A folder's gem suggestions (main/folder-gems.ts): one quiet line at the top of its page, "14 lines here could be
 * gems · See them", said once per folder and never again once answered. "See them" opens the lines, each with its
 * note: ↵ keeps the one the cursor is on as a gem (in this folder, back in Review), ⌫ lets it go; both with Undo.
 * Read by Apple Intelligence on this Mac where it is on, else by the capture box's own word rules, and labelled so.
 */
export function FolderGems({ folder }: { folder: Folder }): React.JSX.Element | null {
  const ideas = useLive(() => folders.gemIdeas(folder.id), null as Awaited<ReturnType<typeof folders.gemIdeas>> | null, [folder.id], undefined, `folders:gem-ideas:${folder.id}`)
  const [open, setOpen] = useState(false)
  // Answered here (seen, or put away): the line goes at once, before the book says so.
  const [answered, setAnswered] = useState(false)
  const [at, setAt] = useState(0)
  const list = useRef<HTMLDivElement>(null)
  const lines = ideas?.lines ?? []
  useEffect(() => void (open && list.current?.focus({ preventScroll: true })), [open])
  useEffect(() => setAt((now) => Math.min(now, Math.max(0, lines.length - 1))), [lines.length])
  // A first-visit tip: decided once, as it would first show. With the list's drag tip already up on this page it
  // waits for another visit (never stacked over it, lib/motion.ts `useTipUp`); shown, it stays till answered.
  const wants = !!ideas && !open && !ideas.offered && !answered && lines.length > 0
  const held = useRef<boolean | null>(null)
  if (wants && held.current === null) held.current = tipUp('drag')
  const showing = wants && held.current === false
  useTipUp('folder-gems', showing)
  if (!ideas) return null
  const by = ideas.by === 'ai' ? 'Read by Apple Intelligence, on this Mac' : 'Read by the capture box’s own word rules'
  if (!open) {
    if (!showing) return null
    const answer = (): void => (setAnswered(true), void folders.gemsOffered(folder.id))
    // One quiet line in the breadcrumb's own size, its gem on the content's left edge, grown in as it arrives.
    return (
      <p data-folder-gems-line="" className="mf-grow-in mt-1 flex min-h-7 items-center gap-1.5 text-control text-muted-foreground">
        <Gem aria-hidden className="size-3.5 shrink-0" />
        <span className="text-foreground">{plural(lines.length, 'line')} here could be gems</span>
        <span aria-hidden>·</span>
        <button type="button" data-folder-gems-see="" onClick={() => (chime('open'), answer(), setOpen(true))} className="cursor-pointer rounded-md font-medium text-foreground underline-offset-2 hover:underline">See them</button>
        <span>({by.replace('Read by ', '')})</span>
        <button type="button" aria-label="Not now" data-folder-gems-off="" onClick={() => (chime('tuck'), answer())} className="ml-0.5 flex size-6 cursor-pointer items-center justify-center rounded-md hover:bg-accent hover:text-foreground"><X className="size-3.5" /></button>
      </p>
    )
  }
  const answerOne = async (idea: GemIdea, keep: boolean): Promise<void> => {
    await folders.gemIdea(folder.id, idea, keep)
    chime(keep ? 'saved' : 'tuck')
    toast(keep ? `Kept as a gem in ${folder.name}` : 'Let go: not offered again', () => void folders.gemIdeaUndo(folder.id, idea.line))
  }
  return (
    <Island className="mt-3" title={`Could be gems · ${num(lines.length)}`} actions={<button type="button" aria-label="Close" onClick={() => (chime('fold'), setOpen(false))} className="cursor-pointer rounded-md p-1 hover:bg-accent"><X className="size-3.5" /></button>}>
      <div ref={list} tabIndex={-1} data-folder-gems-list="" role="listbox" aria-label="Lines that could be gems" className="outline-none"
        onKeyDown={(event) => {
          const idea = lines[at]
          // Its own keys, never the list's under it (↵ there opens a note, ⌫ bins it).
          if (['ArrowDown', 'ArrowUp', 'Escape', 'Enter', 'Backspace', 'Delete'].includes(event.key) && !event.metaKey) event.stopPropagation()
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') (event.preventDefault(), setAt(Math.max(0, Math.min(lines.length - 1, at + (event.key === 'ArrowDown' ? 1 : -1)))))
          else if (event.key === 'Escape') (event.preventDefault(), chime('fold'), setOpen(false))
          else if (idea && event.key === 'Enter' && !event.metaKey) (event.preventDefault(), void answerOne(idea, true))
          else if (idea && (event.key === 'Backspace' || event.key === 'Delete') && !event.metaKey) (event.preventDefault(), void answerOne(idea, false))
        }}>
        {!lines.length && <p className="px-3 py-2 text-body text-muted-foreground">All answered. Nothing more to offer here.</p>}
        {lines.map((idea, index) => (
          <div key={`${idea.id}:${idea.line}`} role="option" aria-selected={index === at} data-folder-gem-idea="" data-cursor={index === at ? '' : undefined}
            onMouseMove={() => index !== at && setAt(index)} onClick={() => (setAt(index), list.current?.focus({ preventScroll: true }))}
            className={`group/idea flex cursor-pointer items-start gap-3 px-3 py-2 ${index === at ? 'bg-accent/60' : ''}`}>
            <div className="min-w-0 flex-1">
              <p className="text-body text-foreground">{idea.line}</p>
              <p className="mt-0.5 truncate text-meta text-muted-foreground">from {idea.title}</p>
            </div>
            <span className={`flex shrink-0 gap-1 pt-0.5 ${index === at ? '' : 'invisible'}`}>
              <button type="button" data-folder-gem-keep="" onClick={(event) => (event.stopPropagation(), void answerOne(idea, true))} className="flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-control text-foreground hover:bg-background">Keep <Pressed keys="↵" /></button>
              <button type="button" data-folder-gem-drop="" onClick={(event) => (event.stopPropagation(), void answerOne(idea, false))} className="flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-control text-foreground hover:bg-background">Let go <Pressed keys="⌫" /></button>
            </span>
          </div>
        ))}
      </div>
      <p className="border-t border-border/60 px-3 py-1.5 text-meta text-muted-foreground">{by}. Nothing leaves your Mac.</p>
    </Island>
  )
}
