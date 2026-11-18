import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import type { EditorView } from '@tiptap/pm/view'
import { Ruler } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Pressed } from '@/components/haligtree/ui'
import { caretLine, lineOf } from '@/extensions/line-numbers'
import { minutesToRead } from '@/lib/note-size'
import { domOf } from '@/lib/editor-dom'
import { openCue } from '@/lib/sound'
import { frontPane } from '@/lib/split'
import { useCounts } from './word-count'
import { howLong, num, plural } from '../../../../main/dates'

/** The key that shows it, as Pages shows its word count. */
export const SIZE_KEYS = '⇧⌘W'

/** The scroller a note's words move in. */
const scrollerOf = (dom: HTMLElement): HTMLElement | null => {
  for (let at = dom.parentElement; at && at !== document.body; at = at.parentElement) if (/(auto|scroll)/.test(getComputedStyle(at).overflowY)) return at
  return null
}

/** The line at the top of what shows of the note: read where the words are, at the top of the scroller or of the note. */
const lineOnScreen = (view: EditorView): number => {
  const page = view.dom.getBoundingClientRect()
  const top = Math.max(page.top, scrollerOf(view.dom)?.getBoundingClientRect().top ?? page.top) + 4
  const at = view.posAtCoords({ left: page.left + page.width / 2, top })
  return at ? lineOf(view.state.doc, at.inside >= 0 ? at.inside : at.pos) : caretLine(view.state)
}

/**
 * Where the reader is, by line: the caret's while the note has the keys, else the line at the top of what shows.
 * Read only while the card is up, again on a change or a scroll, once a frame at most.
 */
function usePlace(editor: Editor | null, open: boolean): number | null {
  const [line, setLine] = useState<number | null>(null)
  useEffect(() => {
    if (!open || !editor || editor.isDestroyed) return
    const view = editor.view
    let frame = 0
    const read = (): void => {
      frame = 0
      if (!editor.isDestroyed) setLine(editor.isFocused ? caretLine(view.state) : lineOnScreen(view))
    }
    const later = (): void => void (frame ||= requestAnimationFrame(read))
    read()
    const scroller = scrollerOf(view.dom)
    editor.on('transaction', later)
    scroller?.addEventListener('scroll', later, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      editor.off('transaction', later)
      scroller?.removeEventListener('scroll', later)
    }
  }, [open, editor])
  return open ? line : null
}

/**
 * How big the open note is, in its bar beside when it was written: its lines (the margin's own count, so the two
 * always agree; a line is a paragraph, a heading, an item, however the window wraps it) and its words. Pointed at,
 * clicked or asked for by its key (⇧⌘W), one small card says the rest: how long it takes to read, its characters,
 * headings, pictures, links and the lines Review asks as cards, and how far in the reader is. Counted from the counts
 * kept block by block (lib/note-size.ts), so it moves as the words do, a key costing its one line.
 */
export function NoteSize({ editor }: { editor: Editor | null }): React.JSX.Element | null {
  const size = useCounts(editor)
  const [open, setOpen] = useState(false)
  // Asked for (a click, a key): it answers with the opening cue, and arrives at once when a key asked. Pointed at, it
  // comes silently, as every hover does.
  const asked = useRef(false)
  const show = (next: boolean, ask = false): void => {
    asked.current = next && ask
    setOpen(next)
  }
  // A press on it shows it and keeps it: a tip puts itself away as its control is pressed, which here would shut the
  // card and open it again a frame later.
  const pressing = useRef(false)
  const cue = useCallback((node: HTMLDivElement | null) => void (asked.current && openCue(node)), [])
  const line = usePlace(editor, open)

  // Its key, answered by the note in front: the pane that has the keys, in a window with several.
  useEffect(() => {
    if (!editor) return
    const onKey = (event: KeyboardEvent): void => {
      if (!event.metaKey || !event.shiftKey || event.altKey || event.ctrlKey || event.code !== 'KeyW' || event.defaultPrevented) return
      const dom = domOf(editor)
      if (!dom?.isConnected || !(dom as HTMLElement).offsetParent) return
      const pane = dom.closest('[data-pane]')?.getAttribute('data-pane')
      if (pane && frontPane() && pane !== frontPane()) return
      event.preventDefault()
      setOpen((now) => ((asked.current = !now), !now))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editor])

  if (!size || (!size.words && size.lines < 2)) return null
  const lines = plural(size.lines, 'line')
  const words = plural(size.words, 'word')
  const minutes = minutesToRead(size.words)
  const rows: [string, number][] = [
    ['Lines', size.lines],
    ['Words', size.words],
    ['Characters', size.characters],
    ['Headings', size.headings],
    ['Pictures', size.pictures],
    ['Links', size.links],
    ['Review cards', size.cards]
  ]
  return (
    <Tooltip card open={open} onOpenChange={(next) => (next || !pressing.current) && show(next)} delayDuration={500}>
      <TooltipTrigger asChild>
        <button type="button" data-note-size aria-label={`${lines}, ${words}`} aria-keyshortcuts="Shift+Meta+W"
          onPointerDown={() => {
            pressing.current = true
            document.addEventListener('pointerup', () => void (pressing.current = false), { once: true, capture: true })
          }}
          // Its own click: the tip's would put it away.
          onClick={(event) => (event.preventDefault(), show(true, true))}
          // Its lines stay in the smallest window, where the date has folded away; in a bar narrower still it keeps its
          // place unseen (no width, out of the tab order), so ⇧⌘W's card still opens under the bar, never at a corner.
          className="invisible w-0 shrink-0 overflow-hidden rounded-md py-1 text-meta whitespace-nowrap text-muted-foreground tabular-nums transition-colors hover:bg-accent hover:text-foreground @[22rem]/head:visible @[22rem]/head:w-auto @[22rem]/head:px-1.5">
          {lines}
          <span className="hidden @[36rem]/head:inline"> · {words}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent ref={cue} data-note-size-card side="bottom" align="end" sideOffset={6}
        className="block w-64 max-w-none rounded-xl p-3 text-control">
        {/* Its key beside its name, as a peek card shows one: the way to ask for it again without the pointer. */}
        <p className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Ruler aria-hidden className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1">Size of this note</span>
          <span className="flex shrink-0 gap-0.5"><Pressed keys={SIZE_KEYS} /></span>
        </p>
        <p data-size-read className="mb-2 font-semibold text-foreground">{minutes ? `About ${howLong(minutes)} to read` : 'Nothing to read yet'}</p>
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 tabular-nums">
          {rows.filter(([label, n]) => n || label === 'Words' || label === 'Characters' || label === 'Lines').map(([label, n]) => (
            <Fragment key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd data-size-row={label} className="text-right text-foreground">{num(n)}</dd>
            </Fragment>
          ))}
        </dl>
        {line !== null && (
          <p data-size-place className="mt-2 border-t pt-2 text-xs text-muted-foreground tabular-nums">
            <span className="text-foreground">Line {num(Math.min(line, size.lines))}</span> of {num(size.lines)} · {Math.round((Math.min(line, size.lines) / size.lines) * 100)}% in
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  )
}
