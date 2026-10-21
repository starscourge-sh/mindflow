import { useEffect, useRef, useState } from 'react'
import { useVim } from '@/lib/vim'
import { createPortal } from 'react-dom'
import { chime, paper } from '@/lib/sound'
import type { Editor, JSONContent } from '@tiptap/core'
import { toMarkdown } from '@/lib/export'
import { AnimatePresence, motion } from 'motion/react'
import { byKeys, EASE, shift, still, TURN } from '@/lib/motion'

import { MindflowEditor } from '../mindflow'
import { vigil, when } from '@/lib/vigil'
import { cn } from '@/lib/cn'
import { CAPTURE_TYPES } from '@/components/capture-kinds/capture-kind-picker'
import { makeTask } from '@/lib/tasks'
import { Kbd, Rolling, Pressed, Tip } from './ui'
import { exit } from '@/lib/capture-links'
import { GlossComposer, openGloss } from './gloss-line'
import { ThoughtBar } from './thought-bar'
import { Signed } from './signature'
import { finish, openLink, readingQueue, type QueueRow } from '@/lib/reading-queue'
import { tagsIn } from '../../../../main/tag-words'
import { ArrowDown, ArrowUp, X as ReadDone } from '@/components/ui/icons'
import { ChevronDown } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useGroups } from '@/lib/groups'
import { moveToBin } from '@/lib/to-bin'
import { toast } from './ui'
import { TagRow } from './pass'

/** How reading ends is said the first three times it opens, then trusted to be known. */
const TOLD = 'readExitTold'
const firstReads = (): boolean => {
  try {
    return Number(localStorage.getItem(TOLD) ?? 0) < 3
  } catch {
    return true
  }
}
const countRead = (): void => {
  try {
    localStorage.setItem(TOLD, String(Number(localStorage.getItem(TOLD) ?? 0) + 1))
  } catch {
    // Said again next time, which does no harm.
  }
}

/** `body`: words read as they are, never changed here, like a question's clues. */
export type Readable = { type: string; id: string; body?: string; title?: string }

type Page = { id: string; title?: string; body: JSONContent | string | null; meta?: string[]; private?: boolean; /** Who said it, for a quote: signed under the words. */ who?: string }

/** The #tags in a note's words, the first few, for the line under its title. */
const tagsOf = (body: unknown): string[] => {
  const words: string[] = []
  const walk = (node: JSONContent | null | undefined): void => {
    if (!node) return
    if (node.text) words.push(node.text)
    node.content?.forEach(walk)
  }
  if (typeof body === 'string') words.push(body)
  else walk(body as JSONContent)
  return tagsIn(words.join(' ')).map((tag) => `#${tag}`).slice(0, 4)
}

/** What it is, when it came, where from, and its tags: the quiet line under the title. */
const metaOf = (kind: string | undefined, at: string | null | undefined, from: (string | null | undefined)[], body?: unknown): string[] => {
  const name = kind && (CAPTURE_TYPES.find((one) => one.id === kind)?.label ?? kind[0].toUpperCase() + kind.slice(1))
  const source = from.find((one) => one && one.trim())
  return [name, at ? when(at) : '', source ? source.split('/').pop()! : '', ...tagsOf(body)].filter((one): one is string => !!one)
}

/** A quote's name, signed under its words rather than said in the meta line. */
const said = (kind: string | undefined, who: string | null | undefined): { who?: string } => (kind === 'quote' && who?.trim() ? { who: who.trim() } : {})

/** The first line, when it is short (or a heading) and there is no title: it reads as one. */
const leads = (page: Page): boolean => {
  if (page.title) return false
  if (typeof page.body === 'string') return page.body.length <= 120 && !page.body.includes('\n')
  const first = page.body?.content?.[0]
  if (first?.type === 'heading' && (first.attrs?.level ?? 1) <= 2) return true
  if (first?.type !== 'paragraph') return false
  const text = (first.content ?? []).map((one) => one.text ?? '').join('')
  return text.length > 0 && text.length <= 120
}

/** Every key Read through answers to, shown when asked for. */
/** `vim`: a key shown only with vim keys on. */
const KEYS: { keys: string[]; vim?: string; label: string; when?: 'own' | 'capture' | 'queue' | 'sort' }[] = [
  { keys: ['S'], label: 'Keep it as it is', when: 'sort' },
  { keys: ['#'], label: 'Tag it', when: 'sort' },
  { keys: ['M'], label: 'Move it to another group', when: 'sort' },
  { keys: ['D'], label: 'Move it to the Bin', when: 'sort' },
  { keys: [']'], label: 'Next in the queue', when: 'queue' },
  { keys: ['⇧→'], label: 'Done, next', when: 'queue' },
  { keys: ['O'], label: "A link's page, in the browser", when: 'queue' },
  { keys: ['↓'], vim: 'J', label: 'Next' },
  { keys: ['↑'], vim: 'K', label: 'Back' },
  { keys: ['E'], label: 'Write in it', when: 'own' },
  { keys: [';'], label: 'Add a thought', when: 'own' },
  { keys: ['P', 'R', 'D'], label: 'Save as a gem, resolve, move to the Bin', when: 'capture' },
  { keys: ['T'], label: 'Make it a task', when: 'capture' },
  { keys: ['Esc'], label: 'Stop reading' },
]

/**
 * Reading, and nothing else: the notes of the list you were on, one at a
 * time, in a quiet column over the whole window. No lists, no panels, no
 * buttons. j and k (or the arrows) turn the page, e opens the one in front of
 * you to change it, Escape goes back to where you were.
 */
export function ReadThrough({ items, start = 0, onClose, queue, clueTo, sorting }: {
  items: Readable[]
  /** "Sort these": imported notes not yet sorted, each kept, tagged, moved or binned in turn. */
  sorting?: boolean
  start?: number
  onClose: () => void
  /** Reading a question's clues: the question, which the composer adds new clues to. */
  clueTo?: string
  /** Reading the queue: its entries, one for each item, for the Up next bar under the page. */
  queue?: QueueRow[]
  /** No longer used: a note is changed in place, here. */
  onEdit?: (type: string, id: string) => void
}): React.JSX.Element | null {
  const [at, setAt] = useState(Math.min(Math.max(0, start), Math.max(0, items.length - 1)))
  const vim = useVim()
  // Pages moved to the Bin while reading (D): stepped over both ways, until Undo brings one back.
  const [binned, setBinned] = useState<string[]>([])
  // Sorting: the ones dealt with, stepped over the same way until an Undo brings one back.
  const [sortedHere, setSortedHere] = useState<string[]>([])
  const [tagging, setTagging] = useState(false)
  const [moving, setMoving] = useState(false)
  /** The next page that way not in the Bin, or -1 at the end. */
  const stepFrom = (from: number, by: 1 | -1, skip = [...binned, ...sortedHere]): number => {
    for (let n = from + by; n >= 0 && n < items.length; n += by) if (!skip.includes(items[n].id)) return n
    return -1
  }
  // Which note the page is: a load that comes back after the page has turned
  // is thrown away, so one note's words are never shown, or saved, as another's.
  const [page, setPage] = useState<Page | null>(null)
  const [keysOpen, setKeysOpen] = useState(false)
  // The page reads first: the count, the hints, the thought field and the
  // pager come up while the pointer moves, and settle away again a moment
  // after it stops, or as soon as the keys turn a page.
  const [awake, setAwake] = useState(true)
  const sleep = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const wake = (): void => {
    setAwake(true)
    clearTimeout(sleep.current)
    sleep.current = setTimeout(() => setAwake(false), 1800)
  }
  useEffect(() => {
    wake()
    return () => clearTimeout(sleep.current)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // The first few times, the way out stays at full strength a while before it quietens.
  const [told, setTold] = useState(() => !firstReads())
  useEffect(() => {
    if (told) return
    countRead()
    const gone = setTimeout(() => setTold(true), 4200)
    return () => clearTimeout(gone)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // Where a click landed in the words, so writing starts with the caret there.
  const reader = useRef<Editor | null>(null)
  const caret = useRef<number | null>(null)
  const item = items[at]
  // What the composer under the page adds to: the question whose clues these
  // are, or the note in front of you. A question's own page takes clues.
  const composerFor = clueTo ?? (item && item.body === undefined ? item.id : undefined)
  const clueMode = !!clueTo || item?.type === 'question'
  // The way out shows when the pointer comes near the top, as a video's
  // controls do, and the soft line at the top says how far down you are.
  const [near, setNear] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const measure = (): void => {
    const box = scroller.current
    if (!box) return
    const room = box.scrollHeight - box.clientHeight
    setProgress(room > 48 ? Math.min(1, box.scrollTop / room) : null)
  }
  useEffect(() => {
    const box = scroller.current
    if (!box) return
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(box)
    if (box.firstElementChild) watch.observe(box.firstElementChild)
    return () => watch.disconnect()
  }, [item?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  // Reading the queue: which entries were read here, and the moves the Up next bar and its keys make.
  const [read, setRead] = useState<Set<string>>(new Set())
  // The whole queue read: what you marked and how long it took, on a page of its own,
  // then a fade back to the Queue.
  const began = useRef(Date.now())
  const [ended, setEnded] = useState<{ titles: { id: string; title: string; private: boolean }[]; minutes: number; last: QueueRow } | null>(null)
  const [leaving, setLeaving] = useState(false)
  const leave = (): void => {
    if (leaving) return
    const flat = still()
    setLeaving(true)
    setTimeout(onClose, flat ? 0 : 300)
  }
  const putBack = (): void => {
    if (!ended) return
    const { last } = ended
    void readingQueue.undone(last.id, true).then(() => chime('undo'))
    setRead((was) => {
      const next = new Set(was)
      next.delete(last.id)
      return next
    })
    setEnded(null)
  }
  const upNext = {
    skip: (): void => {
      if (at >= items.length - 1) return void chime('nope')
      chime('page')
      setAt(at + 1)
    },
    done: (): void => {
      const row = queue?.[at]
      if (!row) return
      if (!read.has(row.id)) void finish(row, true)
      setRead((was) => new Set(was).add(row.id))
      chime('done')
      if (at >= items.length - 1) {
        // The last one: a closing page rather than a toast and gone.
        const marked = queue.filter((one) => one.id === row.id || read.has(one.id))
        setEnded({ titles: marked.map((one) => ({ id: one.id, title: one.title, private: !!one.private })), minutes: (Date.now() - began.current) / 60000, last: row })
        setTimeout(() => chime('wrapped'), 380)
        return
      }
      // On to the next: a sheet slid across, the last one put aside.
      paper('slide')
      setAt(at + 1)
    },
    open: (): void => {
      const row = queue?.[at]
      if (!row?.url) return
      setRead((was) => new Set(was).add(row.id))
      openLink(row, () => setAt((now) => (now === at && now < items.length - 1 ? now + 1 : now)))
    }
  }
  /**
   * Dealt with, so on to the next one still to sort (or back, at the end);
   * the last one ends the reading. Undo brings it back to this page, to sort again.
   */
  const settled = (id: string, said: string | null, undo?: () => Promise<unknown>): void => {
    const here = at
    const skip = [...binned, ...sortedHere, id]
    setSortedHere((all) => [...all, id])
    setTagging(false)
    const back = (): void => (setSortedHere((all) => all.filter((one) => one !== id)), setAt(here))
    if (said && undo) toast(said, () => void undo().then(() => (chime('undo'), back())))
    const to = stepFrom(here, 1, skip) >= 0 ? stepFrom(here, 1, skip) : stepFrom(here, -1, skip)
    if (to >= 0) return void (paper('slide'), setAt(to))
    // None left: the reading ends, and the group's count rolls to nothing behind it.
    setTimeout(() => chime('wrapped'), 200)
    onClose()
  }
  const sort = {
    keep: (): void => {
      if (!item) return
      const id = item.id
      chime('done')
      void vigil.sorted([id], true).then(() => settled(id, 'Kept, and sorted', () => vigil.sorted([id], false)))
    },
    tag: (name: string): void => {
      if (!item) return
      const id = item.id
      // A save the page still has waiting goes first, or it would land after the tag and write over it.
      flush()
      void vigil.passTag(id, name, true).then((doc) => {
        if (doc === null) return void chime('nope')
        chime('tag')
        settled(id, `Tagged #${name}, and sorted`, () => Promise.all([vigil.passTag(id, name, false), vigil.sorted([id], false)]))
      })
    },
    move: (group: string | null, name: string): void => {
      if (!item) return
      const id = item.id
      setMoving(false)
      void window.api.vigil<unknown>('imports:move', id, group).then((was) => {
        if (!was) return void chime('nope')
        chime('move')
        settled(id, group ? `Moved to ${name}` : 'Moved out of the group', () => window.api.vigil('imports:unmove', was))
      })
    },
    bin: (): void => {
      if (!item) return
      const id = item.id
      const here = at
      void moveToBin([{ type: item.type, id }], () => (setSortedHere((all) => all.filter((one) => one !== id)), setAt(here))).then((n) => n && settled(id, null))
    }
  }
  // Writing in place: the same page, the same quiet, the words now editable.
  // E, Enter or a click starts it; Escape puts the keys back to reading.
  const [writing, setWriting] = useState(false)
  useEffect(() => setWriting(false), [item?.id])
  // The save waiting to happen, kept with the note it belongs to, and made at
  // once when the page turns rather than dropped by the next page's typing.
  const saving = useRef<{ timer: ReturnType<typeof setTimeout>; run: () => void } | null>(null)
  const flush = (): void => {
    if (!saving.current) return
    clearTimeout(saving.current.timer)
    saving.current.run()
    saving.current = null
  }
  const save = (target: Readable, doc: JSONContent, editor: Editor): void => {
    if (saving.current) clearTimeout(saving.current.timer)
    const run = (): void => void (target.type === 'capture'
      // The Markdown copy too, where this editor can write one.
      ? window.api.captures.save(target.id, { body: doc, markdown: (editor.storage as { markdown?: unknown }).markdown ? toMarkdown(editor) : undefined })
      : vigil.saveItem(target.id, { body: doc }))
    saving.current = { run, timer: setTimeout(() => ((saving.current = null), run()), 400) }
  }
  useEffect(() => flush, [item?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!item) return
    setPage(null)
    if (item.body !== undefined) return setPage({ id: item.id, title: item.title, body: item.body })
    const load: Promise<Omit<Page, 'id'> | null> = item.type === 'capture'
      ? window.api.captures.get(item.id).then((found) => found && { body: found.body as JSONContent, private: !!found.private, ...said(found.kind, found.attribution), meta: metaOf(found.kind, found.capturedAt, [said(found.kind, found.attribution).who ? null : found.attribution, found.medium, found.source], found.body) })
      : vigil.item(item.id).then((found) => found && { title: found.tier === 'article' || found.tier === 'question' ? found.title : undefined, body: found.body as JSONContent, private: !!found.private, ...said(found.kind, found.attribution), meta: metaOf(found.kind, found.createdAt, [said(found.kind, found.attribution).who ? null : found.attribution, found.context], found.body) })
    let current = true
    void load.then((next) => current && setPage({ id: item.id, ...(next ?? { body: null }) }))
    return () => void (current = false)
  }, [item?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      // The closing page: Enter, Space or Escape go back to the Queue; nothing else reaches underneath.
      if (ended) {
        if (event.metaKey || event.ctrlKey) return
        event.preventDefault()
        event.stopPropagation()
        if (event.key === 'Enter' || event.key === ' ' || event.key === 'Escape') leave()
        return
      }
      // Writing: every key is the note's, but Escape, which stops writing.
      if (writing) {
        if (event.key === 'Escape' && !document.querySelector('.tiptap-suggestion-popup, [role="menu"]')) {
          event.preventDefault()
          event.stopPropagation()
          ;(document.activeElement as HTMLElement | null)?.blur()
          chime('off')
          setWriting(false)
        }
        return
      }
      // A thought being written on the page has the keys, Escape too; so does a tag being written to sort it.
      if (document.activeElement?.closest('[data-gloss], [data-sort-tag]')) return
      // The Move menu, open, has the keys.
      if (moving) return
      // ⌘; as well as ;: the composer under the page.
      if (event.key === ';' && event.metaKey && !event.ctrlKey && !event.altKey && composerFor) {
        event.preventDefault()
        event.stopPropagation()
        return openGloss(composerFor)
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return
      // A question asked over the page (who said it?) has the keys.
      if (document.querySelector('[role="dialog"]:not([aria-label="Reading"])')) return
      if (event.key === '?') {
        event.preventDefault()
        event.stopPropagation()
        return setKeysOpen((open) => !open)
      }
      if (event.key === 'Escape' && keysOpen) {
        event.preventDefault()
        event.stopPropagation()
        return setKeysOpen(false)
      }
      // The queue's own: ] the next one, ⇧→ this one read and the next, O a link's page.
      if (queue && ((event.key === 'ArrowRight' && event.shiftKey) || event.key === ']' || (event.key === 'o' && queue[at]?.url))) {
        event.preventDefault()
        event.stopPropagation()
        if (event.key === ']') return upNext.skip()
        if (event.key === 'o') return upNext.open()
        return upNext.done()
      }
      // Sorting: S keeps it, # tags it, M moves it, D puts it in the Bin; then the next one.
      if (sorting && item && ['s', '#', 'm', 'd'].includes(event.key)) {
        event.preventDefault()
        event.stopPropagation()
        if (event.key === 's') sort.keep()
        else if (event.key === '#') (chime('on'), setTagging(true))
        else if (event.key === 'm') (chime('open'), setMoving(true))
        else sort.bin()
        return
      }
      const next = event.key === 'j' || event.key === 'ArrowDown' || event.key === 'ArrowRight' || event.key === ' '
      const back = event.key === 'k' || event.key === 'ArrowUp' || event.key === 'ArrowLeft'
      // Every plain key is Read's while it is open: none reaches the list
      // or the note underneath, where a stray letter would act or type.
      if (event.key.length === 1 || next || back || event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
      }
      // A page turned sounds like one; at either end there is no page to turn.
      if ((next && stepFrom(at, 1) >= 0) || (back && stepFrom(at, -1) >= 0)) chime('page')
      // Reading by the keys: nothing but the words.
      if (next || back) {
        clearTimeout(sleep.current)
        setAwake(false)
      }
      if (next) setAt((n) => (stepFrom(n, 1) >= 0 ? stepFrom(n, 1) : n))
      else if (back) setAt((n) => (stepFrom(n, -1) >= 0 ? stepFrom(n, -1) : n))
      else if (event.key === 'Escape') onClose()
      // ; a thought on the page in front of you, kept beside it, dated.
      else if (event.key === ';' && composerFor) openGloss(composerFor)
      else if ((event.key === 'e' || event.key === 'Enter') && item && item.body === undefined) {
        event.preventDefault()
        chime('on')
        setWriting(true)
      }
      // Deal with it while it is in front of you: an exit or a task, then the
      // next page. ⌘Z still takes it back.
      else if (item?.type === 'capture' && 'prdth'.includes(event.key)) {
        const next = (): void => setAt((n) => (stepFrom(n, 1) >= 0 ? stepFrom(n, 1) : n))
        // Undone, it is back where you left it: the page you took it from.
        const here = at
        const gone = item.id
        const back = (): void => (setBinned((all) => all.filter((one) => one !== gone)), setAt(here))
        if (event.key === 't') void makeTask({ capture: item.id }, 'Now a task', { onUndo: back }).then((made) => made && next())
        else if (event.key === 'd') void exit(item.id, 'discarded', back).then(() => {
          // In the Bin, its page goes: on to the next, back to the one before at the end, or the reading ends with none left.
          const skip = [...binned, gone]
          setBinned(skip)
          const to = stepFrom(here, 1, skip) >= 0 ? stepFrom(here, 1, skip) : stepFrom(here, -1, skip)
          if (to >= 0) setAt(to)
          else onClose()
        })
        else void exit(item.id, { p: 'promoted', r: 'resolved', h: 'question' }[event.key as 'p' | 'r' | 'h'], back).then(next)
      }
    }
    // Taken first, so the lists and the editor underneath never see the keys.
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [items.length, item, at, onClose, writing, keysOpen, queue, ended, leaving, sortedHere, binned, moving]) // eslint-disable-line react-hooks/exhaustive-deps

  // The focus comes here while reading, and goes back where it was after.
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const was = document.activeElement as HTMLElement | null
    box.current?.focus()
    // Reading opens out and folds away, like a panel, a sheet slid in front of you.
    chime('read')
    paper('slide')
    return () => {
      chime('unread')
      was?.focus?.()
    }
  }, [])

  if (!item) return null
  // Its own words can be written in, and thought about; a clue is read only.
  const own = item.body === undefined
  const shown = page && page.id === item.id ? page : null
  // Private words blur like everywhere else, clear where you point or write.
  const hidden = shown?.private ? '' : undefined
  const lead = !!shown && leads(shown)
  // No words of its own yet (a question only asked): the thoughts follow the title closely, with no empty page between.
  const blank = !!shown && (typeof shown.body === 'string' ? !shown.body.trim() : !JSON.stringify(shown.body ?? null).includes('"text":"'))
  const write = (event?: React.MouseEvent): void => {
    if (writing || !own) return
    // Words being selected to copy are being read, not written.
    if (event && !window.getSelection()?.isCollapsed) return
    caret.current = event ? (reader.current?.view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? null) : null
    chime('on')
    setWriting(true)
  }
  const meta = shown?.meta?.length ? shown.meta.join(' · ') : ''
  // Over the whole window, not inside the pane it was opened from: no
  // sidebar, no other pane, no header. Nothing underneath moves, so leaving
  // puts back the layout exactly as it was.
  return createPortal(
    <div
      ref={box}
      tabIndex={-1}
      data-awake={awake || keysOpen || undefined}
      onPointerMove={(event) => {
        wake()
        setNear(event.clientY < 96)
      }}
      onPointerLeave={() => setNear(false)}
      className={cn('mf-read fixed inset-0 z-[45] isolate flex flex-col bg-background text-foreground outline-none transition-opacity duration-300 ease-out', leaving && 'pointer-events-none opacity-0')}
      role="dialog"
      aria-label="Reading"
    >
      {/* Somewhere to hold the window by, where its title bar was. */}
      <div data-drag-strip="" aria-hidden className="absolute inset-x-0 top-0 h-10 [-webkit-app-region:drag]" />
      {/* How far down the page you are: a hairline, only on a page long enough to scroll. */}
      {progress !== null && (
        <div aria-hidden data-read-progress className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5">
          <div className="h-full origin-left bg-foreground/20" style={{ transform: `scaleX(${progress})` }} />
        </div>
      )}
      {/* The way out: unseen while you read, there as soon as the pointer
          comes near the top (or the keys reach it). Esc does the same. */}
      <Tip label="Stop reading">
        <button
          type="button"
          onClick={() => onClose()}
          className={cn(
            'absolute top-3 right-3 z-10 flex h-7 items-center gap-1.5 rounded-full border bg-background px-3 text-control text-muted-foreground transition-[opacity,background-color,color] duration-300 ease-out [-webkit-app-region:no-drag] hover:bg-accent hover:text-foreground focus-visible:opacity-100',
            near || keysOpen || writing || !told ? 'opacity-100' : 'opacity-0'
          )}
        >
          <ReadDone className="size-3.5" />
          Done reading
          <Kbd className="ml-0.5">Esc</Kbd>
        </button>
      </Tip>
      {ended ? <QueueDone ended={ended} onBack={leave} onPutBack={putBack} /> : <>
      <div ref={scroller} onScroll={measure} className="min-h-0 flex-1 overflow-y-auto">
        {/* j and k turn the page hundreds of times: by key the next one is
            simply there; by the arrows it rises in. */}
        <AnimatePresence mode="wait" initial={false} custom={byKeys()}>
          <motion.article
            key={item.id}
            custom={byKeys()}
            variants={TURN}
            initial={byKeys() ? false : 'from'}
            animate="here"
            exit="gone"
            transition={{ duration: 0.16, ease: EASE }}
            // A page, not a card: the words straight on the window, in the
            // column the note's own text sets (36em of it, about seventy
            // characters), the title over it. A short note sits in the upper
            // third, not lost in the middle of an empty page.
            className="mx-auto flex w-full max-w-[calc(36em+3rem)] flex-col px-6 pt-[clamp(4rem,15vh,8.5rem)] pb-16 text-[length:calc(1.1875rem*var(--mf-text-scale,1))] sm:max-w-[calc(36em+8rem)] sm:px-16"
          >
            {shown?.title && <h1 data-private={hidden} className="private-text font-heading text-[2.25rem] leading-[1.15] font-semibold tracking-[-0.022em] text-balance">{shown.title}</h1>}
            {/* What it is, when, from where, its tags: under the title. With no
                title and no short first line to stand as one, above the words. */}
            {meta && (shown?.title || !lead) && <p className={cn('truncate text-meta text-muted-foreground', shown?.title ? 'mt-3 mb-9' : 'mb-6')}>{meta}</p>}
            {shown && (
              <div data-private={hidden}>
                <div
                  onClick={write}
                  // With no title, the short first line is the title: the meta line goes right under it.
                  style={lead && !writing && meta ? ({ '--meta': JSON.stringify(meta) } as React.CSSProperties) : undefined}
                  className={cn(
                    'private-text',
                    lead && !writing && !!meta && '[&_.tiptap.ProseMirror>:first-child]:after:mt-3 [&_.tiptap.ProseMirror>:first-child]:after:mb-9 [&_.tiptap.ProseMirror>:first-child]:after:block [&_.tiptap.ProseMirror>:first-child]:after:font-sans [&_.tiptap.ProseMirror>:first-child]:after:text-meta [&_.tiptap.ProseMirror>:first-child]:after:font-normal [&_.tiptap.ProseMirror>:first-child]:after:tracking-normal [&_.tiptap.ProseMirror>:first-child]:after:text-muted-foreground [&_.tiptap.ProseMirror>:first-child]:after:content-[var(--meta)]',
                    // The column sets the margins, not the editor's own gutter.
                    '[--mf-padding:0] [&_.mindflow-editor-content]:p-0 [&_.ProseMirror>p:last-child:has(>br:only-child)]:hidden [&_.tiptap.ProseMirror>:first-child]:mt-0!',
                    // The short first line, set as the title is.
                    lead && '[&_.tiptap.ProseMirror>:first-child]:font-heading [&_.tiptap.ProseMirror>:first-child]:text-[2.25rem]! [&_.tiptap.ProseMirror>:first-child]:leading-[1.15]! [&_.tiptap.ProseMirror>:first-child]:font-semibold! [&_.tiptap.ProseMirror>:first-child]:tracking-[-0.022em] [&_.tiptap.ProseMirror>:first-child]:border-0! [&_.tiptap.ProseMirror>:first-child]:p-0! [&_.tiptap.ProseMirror>:first-child]:text-balance',
                    own && !writing && 'cursor-text'
                  )}
                >
                  <MindflowEditor
                    key={`${item.id}-${writing}`}
                    // The note's own files, so its pictures load.
                    host={window.api}
                    shape="document"
                    readOnly={!writing}
                    typewriter
                    // Where the click was, or the end when E asked.
                    autofocus={writing && caret.current === null ? 'end' : false}
                    onReady={(editor) => {
                      reader.current = editor
                      if (!writing || caret.current === null) return
                      const at = Math.min(caret.current, editor.state.doc.content.size)
                      caret.current = null
                      editor.commands.focus(at)
                    }}
                    defaultContent={shown.body ?? ''}
                    onChange={(doc, editor) => {
                      setPage((now) => (now && now.id === item.id ? { ...now, body: doc } : now))
                      save(item, doc, editor)
                    }}
                    // Writing keeps the selection bar, so a highlight or a link is a
                    // selection away; reading has nothing on the page but the words.
                    toolbar={writing ? { fixed: false } : false}
                    handles={false}
                    slash={writing}
                    outline={false}
                    vim={false}
                    search={false}
                  />
                </div>
              </div>
            )}
            {shown?.who && <p data-private={hidden} className="mt-5 text-control text-muted-foreground"><Signed who={shown.who} className="private-text" /></p>}
            {/* Thoughts kept on it stay with the words; a new one goes in the
                composer under the page. */}
            {shown && own && <div data-private={hidden} className={blank && !writing ? 'mt-2' : 'mt-16'}><GlossComposer id={item.id} field={false} /></div>}
          </motion.article>
        </AnimatePresence>
      </div>
      {/* A thought (or a clue) the moment it comes, without leaving the page. */}
      {composerFor && <div className="shrink-0 px-6 pt-1 pb-2 sm:px-16"><ThoughtBar key={composerFor} id={composerFor} clue={clueMode} /></div>}
      {queue && <UpNext queue={queue} at={at} read={read} onSkip={upNext.skip} onDone={upNext.done} onOpen={upNext.open} />}
      {sorting && item && (
        <SortBar id={item.id} left={items.filter((one) => !sortedHere.includes(one.id) && !binned.includes(one.id)).length} tagging={tagging} moving={moving}
          onTagging={setTagging} onMoving={setMoving} onKeep={sort.keep} onTag={sort.tag} onMove={sort.move} onBin={sort.bin} />
      )}
      {/* The only furniture: where you are, how to move, how to write, and the
          rest of the keys when asked. Quiet until the pointer moves. */}
      <footer className="mf-fade relative flex shrink-0 items-center justify-center gap-4 pt-2 pb-3 text-meta text-muted-foreground">
        {/* Asked for with ?, so there at once; from its button it grows up out of the footer. */}
        <AnimatePresence custom={byKeys()}>
          {keysOpen && (
            <motion.div
              custom={byKeys()}
              variants={{
                from: () => ({ opacity: 0, transform: shift('translateY(4px) scale(0.98)') }),
                here: () => ({ opacity: 1, transform: shift('translateY(0px) scale(1)') }),
                gone: (keyed: boolean) => (keyed ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, transform: shift('translateY(4px) scale(0.98)'), transition: { duration: 0.1, ease: EASE } })
              }}
              initial={byKeys() ? false : 'from'}
              animate="here"
              exit="gone"
              transition={{ duration: 0.14, ease: EASE }}
              className="absolute bottom-full mb-1 flex w-72 origin-bottom flex-col gap-0.5 rounded-xl border bg-popover p-2 text-control text-popover-foreground shadow-xl"
              role="list"
              aria-label="Keys"
            >
              {KEYS.filter((one) => !one.when || (one.when === 'sort' ? !!sorting : one.when === 'queue' ? !!queue : one.when === 'own' ? own : own && item.type === 'capture')).map((one) => (
                <div key={one.label} role="listitem" className="flex items-center justify-between gap-3 rounded-md px-2 py-1">
                  <span>{one.label}</span>
                  <span className="flex gap-1">{[...one.keys, ...(vim && one.vim ? [one.vim] : [])].map((key) => <Kbd key={key}>{key}</Kbd>)}</span>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
        <span className="flex items-center gap-1 tabular-nums">
          <span className="text-foreground"><Rolling text={at + 1} /></span> / {items.length}
          <Tip label={<span className="flex items-center gap-2">Next<Kbd>↓</Kbd></span>}><button type="button" aria-label="Next" disabled={stepFrom(at, 1) < 0} onClick={() => (chime('page'), setAt(stepFrom(at, 1)))} className="ml-1 flex size-6 items-center justify-center rounded-md hover:bg-accent hover:text-foreground disabled:opacity-35"><ArrowDown className="size-3.5" /></button></Tip>
          <Tip label={<span className="flex items-center gap-2">Back<Kbd>↑</Kbd></span>}><button type="button" aria-label="Previous" disabled={stepFrom(at, -1) < 0} onClick={() => (chime('page'), setAt(stepFrom(at, -1)))} className="flex size-6 items-center justify-center rounded-md hover:bg-accent hover:text-foreground disabled:opacity-35"><ArrowUp className="size-3.5" /></button></Tip>
        </span>
        {writing ? (
          <span className="flex items-center gap-1.5"><span><span className="text-foreground">Writing</span>, saved as you go</span><Kbd>Esc</Kbd><span>done</span></span>
        ) : (
          <>
            {own && <span className="hidden items-center gap-1.5 sm:flex">Click or <Pressed keys="E" /> to write</span>}
          </>
        )}
        <button type="button" aria-expanded={keysOpen} onClick={() => (chime('tap'), setKeysOpen(!keysOpen))} className={cn('flex h-6 items-center gap-1.5 rounded-md px-1.5 hover:bg-accent hover:text-foreground', keysOpen && 'bg-accent text-foreground')}>
          <Kbd>?</Kbd> Keys
        </button>
      </footer>
      </>}
    </div>,
    document.body
  )
}

/** Minutes as you would say them: "under a minute", "1 minute", "38 minutes", "1 hour 5 minutes". */
const took = (minutes: number): string => {
  const whole = Math.round(minutes)
  if (whole < 1) return 'under a minute'
  if (whole < 60) return `${whole} ${whole === 1 ? 'minute' : 'minutes'}`
  const hours = Math.floor(whole / 60)
  const rest = whole % 60
  return `${hours} ${hours === 1 ? 'hour' : 'hours'}${rest ? ` ${rest} ${rest === 1 ? 'minute' : 'minutes'}` : ''}`
}

/**
 * The end of the queue, on the reading page itself: how many you read and in
 * how long, the ones you marked, and the way back. The last one can be put
 * back, for a Done pressed too soon.
 */
function QueueDone({ ended, onBack, onPutBack }: { ended: { titles: { id: string; title: string; private: boolean }[]; minutes: number }; onBack: () => void; onPutBack: () => void }): React.JSX.Element {
  const flat = still()
  const count = ended.titles.length
  return (
    <div data-queue-done className="min-h-0 flex-1 overflow-y-auto">
      <motion.div initial={flat ? false : { opacity: 0, transform: shift('translateY(8px)') }} animate={{ opacity: 1, transform: shift('translateY(0px)') }} transition={{ duration: 0.32, ease: EASE }}
        className="mx-auto flex w-full max-w-[calc(36em+3rem)] flex-col px-6 pt-[clamp(4rem,15vh,8.5rem)] pb-16 sm:max-w-[calc(36em+8rem)] sm:px-16">
        <h1 className="font-heading text-[2.25rem] leading-[1.15] font-semibold tracking-[-0.022em] text-balance">That was the whole queue.</h1>
        <p className="mt-3 text-[1.1875rem] text-muted-foreground">
          <strong className="font-semibold text-foreground">{count} read in {took(ended.minutes)}.</strong> Each one waits under “Read” on the Queue page, dated.
        </p>
        {count > 0 && (
          <ol className="mt-8 flex flex-col gap-1.5 border-l-2 border-foreground/10 pl-4">
            {ended.titles.map((one, n) => (
              <motion.li key={one.id} initial={flat ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, delay: flat ? 0 : 0.15 + Math.min(n, 8) * 0.04 }}
                data-private={one.private ? '' : undefined} className="private-text flex items-baseline gap-2 text-body text-foreground/85">
                <span className="text-[var(--tt-color-text-green)]">✓</span>
                <span className="min-w-0 truncate">{one.title}</span>
              </motion.li>
            ))}
          </ol>
        )}
        <div className="mt-10 flex flex-wrap items-center gap-3">
          <button type="button" autoFocus onClick={onBack} className="flex h-9 items-center gap-2 rounded-full bg-foreground px-4 text-control font-medium text-background transition-colors hover:bg-foreground/85">
            Back to the Queue <Kbd className="bg-background/15 text-current">↵</Kbd>
          </button>
          <button type="button" onClick={onPutBack} className="h-9 rounded-full px-3 text-control text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            Not finished with the last one? Put it back
          </button>
        </div>
      </motion.div>
    </div>
  )
}

/**
 * Reading the queue: a small bar under the page with what comes next, Next to
 * go on and Done, next to count this one read on the way. A link that is only
 * a link offers its page in the browser, counted read once you come back.
 */
function UpNext({ queue, at, read, onSkip, onDone, onOpen }: { queue: QueueRow[]; at: number; read: Set<string>; onSkip: () => void; onDone: () => void; onOpen: () => void }): React.JSX.Element {
  const now = queue[at]
  const next = queue[at + 1]
  const kind = next ? CAPTURE_TYPES.find((one) => one.id === next.kind) : undefined
  const button = 'flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-control transition-colors hover:bg-accent hover:text-foreground'
  return (
    <div data-up-next className="relative z-10 flex shrink-0 justify-center px-4 pb-1">
      <div className="flex max-w-full min-w-0 items-center gap-1 rounded-full border bg-popover py-1 pr-1 pl-3.5 text-control text-muted-foreground shadow-sm">
        <span className="shrink-0">{next ? 'Up next:' : 'Last in the queue'}</span>
        {next && (
          <span className="flex min-w-0 items-center gap-1.5 pl-1.5 text-foreground">
            {kind && <kind.icon className="size-3.5 shrink-0" style={{ color: kind.tint }} />}
            <span data-private={next.private ? '' : undefined} className="private-text max-w-[22ch] truncate font-medium">{next.title}</span>
          </span>
        )}
        <span aria-hidden className="mx-1.5 h-4 w-px shrink-0 bg-border" />
        {now?.url && (
          <Tip label={<span className="flex items-center gap-2">Read the page in your browser; read once you are back<Kbd>O</Kbd></span>}>
            <button type="button" onClick={onOpen} className={button}>Open the page</button>
          </Tip>
        )}
        {next && (
          <Tip label={<span className="flex items-center gap-2">Next, keeping this one in the queue<Kbd>]</Kbd></span>}>
            <button type="button" onClick={onSkip} className={button}>Next</button>
          </Tip>
        )}
        <Tip label={<span className="flex items-center gap-2">{next ? 'This one read, and on to the next' : 'This one read, and the queue done'}<Kbd>⇧→</Kbd></span>}>
          <button type="button" onClick={onDone} className={cn(button, 'bg-foreground text-background hover:bg-foreground/85 hover:text-background')}>
            {now && read.has(now.id) ? 'Read' : next ? 'Done, next' : 'Done'}
          </button>
        </Tip>
      </div>
    </div>
  )
}

/**
 * Sorting what came in from Apple Notes or Obsidian: a small bar under the
 * page with what is left and the four ways to deal with the note in front of
 * you. Each one sorts it and turns to the next; Undo brings it back.
 */
function SortBar({ id, left, tagging, moving, onTagging, onMoving, onKeep, onTag, onMove, onBin }: {
  id: string
  left: number
  tagging: boolean
  moving: boolean
  onTagging: (on: boolean) => void
  onMoving: (on: boolean) => void
  onKeep: () => void
  onTag: (name: string) => void
  onMove: (group: string | null, name: string) => void
  onBin: () => void
}): React.JSX.Element {
  const groups = useGroups('article')
  const own = groups.find((one) => one.members.includes(id))
  const others = groups.filter((one) => one.id !== own?.id && one.members.length > 1)
  const field = useRef<HTMLInputElement>(null)
  // Asked for by its key, the tag field takes the keys at once, so the letters typed never reach the page.
  useEffect(() => void (tagging && requestAnimationFrame(() => field.current?.focus())), [tagging])
  const button = 'flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-control text-foreground transition-colors hover:bg-accent'
  return (
    <div data-sort-bar={left} className="relative z-10 flex shrink-0 justify-center px-4 pb-1">
      <div className="flex max-w-full min-w-0 flex-wrap items-center justify-center gap-1 rounded-2xl border bg-popover py-1 pr-1 pl-3.5 text-control shadow-sm">
        <span className="flex shrink-0 items-center gap-1.5 font-medium text-foreground">
          <span aria-hidden className="size-1.5 rounded-full bg-[var(--tt-color-text-orange)]" />
          <span><Rolling text={left} /> left to sort</span>
        </span>
        <span aria-hidden className="mx-1.5 h-4 w-px shrink-0 bg-border" />
        {tagging ? (
          <div data-sort-tag="" className="flex min-w-48 items-center gap-1 pt-3 [&>div]:mb-0">
            <TagRow tags={[]} field={field} autoFocus onAdd={onTag} onRemove={() => undefined} onDone={() => (chime('off'), onTagging(false))} />
            <Kbd>Esc</Kbd>
          </div>
        ) : (
          <>
            <Tip label={<span className="flex items-center gap-2">Keep it as it is, where it is<Kbd>S</Kbd></span>}>
              <button type="button" data-sort-keep="" onClick={onKeep} className={cn(button, 'bg-foreground text-background hover:bg-foreground/85 hover:text-background')}>Keep <Kbd className="bg-background/15 text-current">S</Kbd></button>
            </Tip>
            <Tip label={<span className="flex items-center gap-2">Give it a tag, which sorts it<Kbd>#</Kbd></span>}>
              <button type="button" data-sort-tag-button="" onClick={() => (chime('on'), onTagging(true))} className={button}>Tag <Kbd>#</Kbd></button>
            </Tip>
            <DropdownMenu open={moving} onOpenChange={onMoving}>
              <DropdownMenuTrigger asChild>
                <button type="button" data-sort-move="" className={button}>Move <Kbd>M</Kbd><ChevronDown className="size-3.5 text-muted-foreground" /></button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" side="top" className="max-h-72 w-60 overflow-y-auto">
                {own && <DropdownMenuItem data-move-out="" onSelect={() => onMove(null, 'Writing')}>Out of “{own.name}”</DropdownMenuItem>}
                {own && others.length > 0 && <DropdownMenuSeparator />}
                {others.map((one) => (
                  <DropdownMenuItem key={one.id} data-move-to={one.name} onSelect={() => onMove(one.id, one.name)}>
                    <span className="truncate">{one.name}</span>
                  </DropdownMenuItem>
                ))}
                {!own && !others.length && <DropdownMenuItem disabled>No other groups in Writing</DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu>
            <Tip label={<span className="flex items-center gap-2">Move it to the Bin<Kbd>D</Kbd></span>}>
              <button type="button" data-sort-bin="" onClick={onBin} className={button}>Bin <Kbd>D</Kbd></button>
            </Tip>
          </>
        )}
      </div>
    </div>
  )
}
