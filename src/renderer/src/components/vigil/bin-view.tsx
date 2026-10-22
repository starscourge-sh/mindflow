import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { JSONContent } from '@tiptap/core'
import { ArchiveRestore, Trash2, X } from 'lucide-react'
import { AnimatePresence, PresenceContext, motion } from 'motion/react'
import { EASE, byKeys, shift, spring } from '@/lib/motion'
import { chime } from '@/lib/sound'
import { unloaded, useLive, vigil, whenInLine, type BinPeek } from '@/lib/vigil'
import { MindflowEditor } from '@/components/mindflow'
import { hoverNote } from './note-preview'
import { Button } from '@/components/ui/button'
import { Page, Stepper, Tags, Tip, toast, typing, useListKeys, VirtualList } from './ui'
import { taskName } from '@/lib/tasks'
import { useSelectAll } from '@/lib/select-all'
import { usePicking } from '@/lib/pick-range'
import { useHere } from '@/lib/split'
import { PICKED_ROW } from './task-pick'
import { Example } from './example'
import { exampleDiscarded } from '@/lib/examples'
import { HoldButton } from './hold-button'
import { CAPTURE_TYPES } from '../capture-kinds/capture-kind-picker'
import { RowMenu, copy, type MenuItem } from './row-menu'
import { num } from '../../../../main/dates'
import { quoted } from '../../../../main/clip'

/**
 * The Bin: one place for everything moved there, of every kind. A capture,
 * a task closed without doing, a gem, a piece of writing, a question or a
 * goal. Each comes back with Restore; “Hold to empty” deletes them all for
 * good. Rows pick as every list's do: click, ⇧-click, ⌘-click, X, ⌘A; ⌫ asks
 * before deleting what is picked for good.
 *
 * What is inside one shows before you decide, as in Finder's Trash: a click
 * shows it read only beside the list, Space shows it large over the page
 * (Quick Look), ↑ ↓ step through either, and pointing at a title shows the
 * card an @ link shows.
 */
type Binned = { type: string; id: string; title: string; kind: string; at: string; line?: string | null }

const KIND_SAID: Record<string, string> = { capture: 'Capture', task: 'Task', nugget: 'Gem', article: 'Article', question: 'Question', goal: 'Goal', card: 'Card', event: 'Event', calendar: 'Calendar', practice: 'Practice' }

export function BinView({ onOpen }: { onOpen?: (type: string, id: string) => void }): React.JSX.Element {
  const binned = useLive(vigil.bin, [] as Binned[])
  const [kind, setKind] = useState<string | null>(null)
  const kinds = [...new Set(binned.map((one) => one.type))]
  const shown = kind ? binned.filter((one) => one.type === kind) : binned
  // Picked rows, by type and id; only what is still on show counts.
  const [picked, setPicked] = useState<string[]>([])
  const chosen = picked.filter((key) => shown.some((one) => keyOf(one) === key))
  // The rows being asked about: “Delete for good?” until a yes or a no.
  const [asking, setAsking] = useState<string[] | null>(null)
  // The question's hold button takes the focus once a menu has given it back, so Space or Return held right after ⌫ goes through too.
  useEffect(() => {
    if (!asking) return
    const later = setTimeout(() => document.querySelector<HTMLButtonElement>('[data-bin-ask] button')?.focus({ preventScroll: true }), 250)
    return () => clearTimeout(later)
  }, [asking])
  const [cursor, setCursor] = useListKeys(shown.length, { onOpen: (index) => restore(shown[index]), onExtend: (from, to) => picking.extend(shown[from] && keyOf(shown[from]), keyOf(shown[to])) })
  // What is inside: beside the list after a click, large over the page on Space. Both follow the cursor.
  const [looking, setLooking] = useState(false)
  const [quick, setQuick] = useState(false)
  const looked = looking ? shown[cursor] : undefined
  const quickOne = quick ? shown[cursor] : undefined
  const look = (one: Binned): void => (setCursor(shown.indexOf(one)), chime('look'), setQuick(true))
  // Nothing left to look at (the last one restored): the pane goes, not left open on nothing.
  if ((looking || quick) && !shown[cursor]) {
    setLooking(false)
    setQuick(false)
  }
  const here = useHere()
  const clear = (): void => (chime('off'), setPicked([]))
  const ask = (keys: string[]): void => void (keys.length && (chime('tap'), setAsking(keys)))
  // ⌘A picks every row on show; ⌫ asks first, since nothing comes back from here.
  const selectAll = useSelectAll(() => shown.map(keyOf), chosen, setPicked, { here, onDelete: ask, deleteSaid: '⌫ asks first; hold “Hold to delete” to delete them for good', current: () => (shown[cursor] ? keyOf(shown[cursor]) : null), titleOf: (key) => binned.find((one) => keyOf(one) === key)?.title })
  const allPicked = shown.length > 0 && shown.every((one) => chosen.includes(keyOf(one)))
  const picking = usePicking(shown.map(keyOf), chosen, setPicked)
  const toggle = picking.toggle
  // A click picks that row alone, ⌘-click adds or takes away one, ⇧-click a run, as in Finder.
  const click = (one: Binned, event: React.MouseEvent): void => {
    const key = keyOf(one)
    setCursor(shown.indexOf(one))
    // A plain click shows what is inside, beside the list; a second click on the one shown puts it away.
    if (!event.metaKey && !event.shiftKey) setLooking(!(looked && keyOf(looked) === key && chosen.length === 1 && chosen[0] === key))
    if (picking.click(event, key)) return
    chime('tap')
    setPicked(chosen.length === 1 && chosen[0] === key ? [] : [key])
  }
  const now = useRef({ chosen, asking, shown, cursor, looking })
  now.current = { chosen, asking, shown, cursor, looking }
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!here() || typing() || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      if (document.querySelector('[role="menu"]')) return
      // Escape says no to the question first, then puts the preview away and lets the picked rows go, together.
      if (event.key === 'Escape' && (now.current.asking || now.current.looking || now.current.chosen.length)) {
        event.preventDefault()
        event.stopPropagation()
        if (now.current.asking) return void (chime('off'), setAsking(null))
        setLooking(false)
        return clear()
      }
      // Space: Quick Look, as in Finder, on the row the keys are on (else the one picked, else the first).
      // A button reached with Tab keeps its own Space.
      if (event.key === ' ' && now.current.shown.length) {
        const held = document.activeElement
        if (held instanceof HTMLElement && held.matches('button, a[href], [role="button"], [role="checkbox"]') && !held.closest('[data-row]')) return
        event.preventDefault()
        event.stopPropagation()
        const { shown, cursor, chosen } = now.current
        if (!shown[cursor]) setCursor(Math.max(0, shown.findIndex((one) => chosen.includes(keyOf(one)))))
        chime('look')
        return setQuick(true)
      }
      const row = now.current.shown[now.current.cursor]
      if (event.key === 'x' && row) {
        event.preventDefault()
        toggle(keyOf(row))
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const restore = (one: Binned): void => {
    void vigil.restore(one.type, one.id).then(() => {
      chime('undo')
      toast(`${KIND_SAID[one.type] ?? 'It'} restored: back where it was`, () => void unbin(one), 'success', onOpen && one.type !== 'task' && one.type !== 'calendar' ? { label: 'Open', key: 'O', run: () => onOpen(one.type, one.id) } : undefined)
    })
  }
  // Several back where they were, in one go, and back in the Bin with one undo.
  const restoreMany = (list: Binned[]): void => {
    void Promise.all(list.map((one) => vigil.restore(one.type, one.id))).then(() => {
      chime('unshelve')
      setPicked([])
      toast(`Restored ${num(list.length)}: back where ${list.length === 1 ? 'it was' : 'they were'}`, () => void Promise.all(list.map(unbin)))
    })
  }
  // Deleted for good, after a held yes: it cannot be undone, so it is said so before, not after.
  const forget = (keys: string[]): void => {
    const list = binned.filter((one) => keys.includes(keyOf(one)))
    setAsking(null)
    void Promise.all(list.map((one) => vigil.forgetBinned(one.type, one.id))).then((done) => {
      const n = done.filter(Boolean).length
      if (!n) return
      chime('away')
      setPicked([])
      toast(n === 1 ? `${quoted(list[0].title || 'Untitled', 41)} is deleted for good` : `${num(n)} deleted for good`, undefined, 'info')
    })
  }
  const empty = (): void => {
    void vigil.emptyBin().then((n) => (chime('away'), toast(`${num(n)} ${n === 1 ? 'thing' : 'things'} deleted for good`, undefined, 'info')))
  }
  const pickedRows = shown.filter((one) => chosen.includes(keyOf(one)))
  // Several asked about, or one while the preview narrows the list (no room in its row): the question over the list.
  const many = asking && (asking.length > 1 || !!looked)
  const single = asking?.length === 1
  return (
    <>
    <Page aside={!!looked} title="Bin" count={unloaded(binned) ? undefined : chosen.length || shown.length} unit={chosen.length ? ['selected', 'selected'] : ['thing', 'things']} actions={
      chosen.length ? (
        <span className="flex items-center gap-1">
          <Button size="sm" variant="secondary" onClick={() => restoreMany(pickedRows)}>{chosen.length === 1 ? 'Restore' : `Restore ${num(chosen.length)}`}</Button>
          <Tip label="Asks first, then you hold to delete for good  ⌫"><Button size="sm" variant="ghost" onClick={() => ask(chosen)}>Delete for good…</Button></Tip>
          {!allPicked && <Tip label="Everything on show  ⌘A"><Button size="sm" variant="ghost" onClick={selectAll}>Select all</Button></Tip>}
          <Tip label="Clear the selection  Esc"><Button variant="ghost" size="icon-sm" aria-label="Clear the selection" onClick={clear}><X className="size-3.5" /></Button></Tip>
        </span>
      ) : binned.length > 0 ? <span className="flex items-center gap-1">{shown.length > 1 && <Button size="sm" variant="ghost" onClick={() => restoreMany(shown)}>Restore {kind ? `these ${num(shown.length)}` : `all ${num(shown.length)}`}</Button>}<HoldButton hint="Everything in the Bin, deleted for good" done="Emptying…" onHold={empty}>Hold to empty</HoldButton></span> : null
    }>
      <div data-bin className="w-full px-5 pt-5 pb-16">
        <p className="mb-4 text-[0.9375rem] text-foreground"><strong className="font-semibold">Everything you moved to the Bin, of every kind.</strong> <span className="text-muted-foreground">“Restore” puts one back where it was. Pick some, press ⌫ and hold “Hold to delete” to delete them for good, or hold “Hold to empty” for all of it.</span></p>
        {/* Several asked about at once: the question over the list, with the count, until a yes or a no. */}
        {many && (
          <div data-bin-ask className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2">
            <span className="mr-auto text-control font-semibold text-foreground">{single ? 'Delete it for good? It cannot come back.' : `Delete ${num(asking.length)} for good? They cannot come back.`}</span>
            <HoldButton variant="destructive" hint={single ? 'This one, deleted for good' : `${num(asking.length)} things, deleted for good`} done="Deleting…" onHold={() => forget(asking)}>{single ? 'Hold to delete' : `Hold to delete ${num(asking.length)}`}</HoldButton>
            <Button size="sm" variant="ghost" onClick={() => (chime('off'), setAsking(null))}>{single ? 'Keep it' : 'Keep them'}</Button>
          </div>
        )}
        {kinds.length > 1 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {[null, ...kinds].map((one) => (
              <button key={one ?? 'all'} type="button" aria-pressed={kind === one} onClick={() => (chime('tap'), setKind(one))}
                className={`h-7 rounded-full px-3 text-control transition-colors ${kind === one ? 'bg-foreground text-background' : 'bg-foreground/[0.06] text-foreground/85 hover:bg-foreground/[0.1]'}`}>
                {one ? KIND_SAID[one] ?? one : 'Everything'} <span className="opacity-70 tabular-nums">{num(one ? binned.filter((b) => b.type === one).length : binned.length)}</span>
              </button>
            ))}
          </div>
        )}
        {shown.length ? (
          <Rows list={shown} cursor={cursor} chosen={chosen} looked={looked ? keyOf(looked) : null} onLook={look} asking={many ? null : asking?.[0] ?? null} onClick={click} onAsk={ask} onKeep={() => (chime('off'), setAsking(null))}
            onRestore={restore} onForget={(one) => forget([keyOf(one)])}
            // Right-clicked among several picked, the menu speaks for all of them.
            menuFor={(one) => chosen.includes(keyOf(one)) && chosen.length > 1 ? [
              { label: `Restore ${num(chosen.length)}`, run: () => restoreMany(pickedRows) },
              'separator',
              { label: `Delete ${num(chosen.length)} for good…`, keys: '⌫', danger: true, run: () => ask(chosen) },
              'separator',
              !allPicked && { label: 'Select all', keys: '⌘A', run: selectAll },
              { label: 'Clear the selection', keys: 'esc', run: clear }
            ] : null}
            onToggle={toggle} onSelectAll={allPicked ? undefined : selectAll} />
        ) : unloaded(binned) ? null : (
          // Nothing in the Bin yet: a few made-up ones show what waits here, dimmed and out of reach.
          <Example tryIt="choose “Move to the Bin” on any note, or close a task without doing it.">
            <Rows list={EXAMPLES()} onRestore={() => undefined} />
          </Example>
        )}
      </div>
    </Page>
    {/* What is inside the one clicked, read only, where an open note sits beside every other list. */}
    {looked && (
      <div data-open={looked.id} data-bin-preview={looked.type} className="note-pane flex min-w-0 flex-[1.4] flex-col @[56rem]/page:border-l">
        <header className="flex h-10 shrink-0 items-center gap-2 border-b px-4">
          <Stepper at={shown.indexOf(looked)} total={shown.length} onStep={setCursor} />
          <Tip label="Put it away  Esc"><Button variant="ghost" size="icon-sm" aria-label="Close the preview" className="ml-auto" onClick={() => (chime('off'), setLooking(false))}><X className="size-3.5" /></Button></Tip>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Inside one={looked} onRestore={() => restore(looked)} onForget={() => forget([keyOf(looked)])} />
        </div>
      </div>
    )}
    {quickOne && <QuickLook one={quickOne} at={shown.indexOf(quickOne)} total={shown.length} onStep={setCursor} onClose={() => (chime('unlook'), setQuick(false))}
      onRestore={() => restore(quickOne)} onForget={() => forget([keyOf(quickOne)])} />}
    </>
  )
}

/** A binned thing's kind, in a word: a capture says its own (Note, Quote, Link). */
const kindSaid = (one: Pick<Binned, 'type' | 'kind'>): string =>
  one.type === 'capture' ? CAPTURE_TYPES.find((type) => type.id === one.kind)?.label ?? 'Note' : KIND_SAID[one.type] ?? one.type

/** Its name; with none of its own (no title, or the “Untitled” it began with), its first line, said to be one. */
const nameOf = (one: Pick<Binned, 'title' | 'line'>): { text: string; line: boolean } => {
  const text = taskName(one.title).text.trim()
  const named = !!text && text !== 'Untitled'
  const line = one.line?.trim() ? taskName(one.line).text.trim() : ''
  return named ? { text, line: false } : line ? { text: line, line: true } : { text: 'Untitled', line: false }
}

/** One binned thing as stored, fetched when it is looked at. */
function usePeek(one: Binned): BinPeek | null {
  const [peek, setPeek] = useState<BinPeek | null>(null)
  useEffect(() => {
    let old = false
    void vigil.binPeek(one.type, one.id).then((found) => !old && setPeek(found))
    return () => void (old = true)
  }, [one.type, one.id])
  return peek && peek.type === one.type && peek.id === one.id ? peek : null
}

/**
 * What is inside one, read only: what it is, its tags, when it was made and
 * binned, the line that says why nothing here can be changed with Restore
 * beside it, then its words whole, pictures and blocks and all.
 */
function Inside({ one, onRestore, onForget, large = false }: { one: Binned; onRestore: () => void; onForget: () => void; large?: boolean }): React.JSX.Element {
  const peek = usePeek(one)
  const name = nameOf(one)
  const words = typeof peek?.body === 'string' ? !!peek.body.trim() : /"text":|"src":|"type":"(image|excalidraw|attachment|embed|bookmark)"/.test(JSON.stringify(peek?.body ?? null))
  return (
    <div data-bin-inside={keyOf(one)} data-private={peek?.private ? '' : undefined} className="flex flex-col">
      <div className={`flex flex-col gap-2 ${large ? 'px-8 pt-6' : 'px-6 pt-5'}`}>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-control text-muted-foreground">
          <span className="font-medium text-foreground/85">{kindSaid(one)}</span>
          {!!peek?.tags.length && <Tags tags={peek.tags} max={6} go={false} />}
        </p>
        <h2 className={`private-text font-semibold leading-snug ${large ? 'text-2xl' : 'text-xl'} ${name.line ? 'text-muted-foreground' : 'text-foreground'}`}>{name.text}</h2>
        {peek?.attribution && <p className="private-text text-body text-muted-foreground">{peek.attribution}</p>}
        {/* An event or a practice: when it was set for, and the rest of what it held, a line each. */}
        {!!peek?.facts?.length && <div data-bin-facts className="flex flex-col gap-0.5 text-body text-foreground">{peek.facts.map((fact) => <p key={fact}>{fact}</p>)}</div>}
        <p className="min-h-5 text-control text-muted-foreground">
          {peek && <>Made {whenInLine(peek.madeAt)}<span aria-hidden>  ·  </span>Moved to the Bin {whenInLine(peek.binnedAt ?? one.at)}</>}
        </p>
        {/* Why nothing below takes a keystroke, said once where the eye lands, with the way out beside it. */}
        <div data-bin-readonly className="mt-1 flex flex-wrap items-center gap-2 rounded-lg bg-foreground/[0.05] px-3 py-2">
          <Trash2 className="size-4 shrink-0 text-muted-foreground" />
          <span className="mr-auto text-body font-medium text-foreground">In the Bin. Restore it to change it.</span>
          <Tip label="Back where it was  ↵"><Button size="sm" variant="secondary" onClick={onRestore}><ArchiveRestore className="size-3.5" /> Restore</Button></Tip>
          <HoldButton variant="ghost" hint="Deleted for good: it cannot come back" done="Deleting…" onHold={onForget}>Hold to delete for good</HoldButton>
        </div>
      </div>
      <div className={`pb-10 ${large ? '[--mf-padding:1rem_2rem]' : '[--mf-padding:1rem_1.5rem]'}`}>
        {peek && (words ? (
          <MindflowEditor key={keyOf(one)} defaultContent={(peek.body as JSONContent | string | null) ?? ''} readOnly toolbar={false} handles={false} slash={false} outline={false} search={false} autofocus={false} />
        ) : (
          <p className={`${large ? 'px-8' : 'px-6'} pt-4 text-body text-muted-foreground`}>{peek.facts?.length ? 'No notes written in it.' : 'Nothing written in it beyond its name.'}</p>
        ))}
      </div>
    </div>
  )
}

/**
 * Quick Look, as Finder's: Space shows the row the keys are on, large, over
 * the page; Space or Esc puts it away, ↑ ↓ step to the next row while it stays.
 */
function QuickLook({ one, at, total, onStep, onClose, onRestore, onForget }: {
  one: Binned
  at: number
  total: number
  onStep: (to: number) => void
  onClose: () => void
  onRestore: () => void
  onForget: () => void
}): React.JSX.Element {
  const latest = useRef({ at, total, onStep, onClose })
  latest.current = { at, total, onStep, onClose }
  const here = useHere()
  useEffect(() => {
    // Ahead of the list's own keys: while it is up, these keys are its own.
    const onKey = (event: KeyboardEvent): void => {
      if (!here() || event.metaKey || event.ctrlKey || event.altKey) return
      const { at, total, onStep, onClose } = latest.current
      if (event.key === ' ' || event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        return onClose()
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        event.stopImmediatePropagation()
        const to = at + (event.key === 'ArrowDown' ? 1 : -1)
        if (to < 0 || to >= total) return
        chime('tap')
        onStep(to)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const still = document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches
  return createPortal(
    <div data-bin-look className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-6" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <motion.div role="dialog" aria-modal="true" aria-label={`${kindSaid(one)} in the Bin`}
        initial={still || byKeys() ? false : { opacity: 0, transform: 'scale(0.96)' }} animate={{ opacity: 1, transform: 'scale(1)' }} transition={spring.moderate}
        className="flex max-h-[88vh] w-[min(60rem,94vw)] flex-col overflow-hidden rounded-xl border bg-background shadow-(--mf-panel-shadow)">
        <header className="flex h-11 shrink-0 items-center gap-2 border-b px-4">
          <span className="text-control font-medium text-foreground">Quick Look</span>
          <span className="text-control text-muted-foreground">Space or Esc closes it</span>
          <span className="ml-auto" />
          <Stepper at={at} total={total} onStep={onStep} />
          <Tip label="Close  Space"><Button variant="ghost" size="icon-sm" aria-label="Close Quick Look" onClick={onClose}><X className="size-3.5" /></Button></Tip>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Inside key={keyOf(one)} one={one} onRestore={onRestore} onForget={onForget} large />
        </div>
      </motion.div>
    </div>,
    document.body
  )
}

const keyOf = (one: Pick<Binned, 'type' | 'id'>): string => `${one.type}:${one.id}`

/** Back in the Bin, the way each kind went there: a restore taken back. */
const unbin = (one: Binned): Promise<unknown> =>
  one.type === 'capture' ? window.api.captures.save(one.id, { status: 'discarded', bin: true })
    : one.type === 'task' ? vigil.saveTask(one.id, { status: 'dropped' })
      : vigil.toBin(one.id)

/** What the Bin holds when it is empty, as an example: three captures, a task and a gem. */
const EXAMPLES = (): Binned[] => [
  ...exampleDiscarded().map((one) => ({ type: 'capture', id: one.id, title: one.label ?? '', kind: one.kind, at: one.closedAt ?? one.capturedAt })),
  { type: 'task', id: 'example:bin-task', title: 'Learn to juggle three oranges', kind: 'todo', at: new Date(Date.now() - 3 * 86400000).toISOString() },
  { type: 'nugget', id: 'example:bin-gem', title: 'Every list is a wish', kind: 'note', at: new Date(Date.now() - 6 * 86400000).toISOString() }
]

function Rows({ list, onRestore, onForget, cursor = -1, chosen = [], looked = null, asking = null, onClick, onLook, onAsk, onKeep, menuFor, onToggle, onSelectAll }: {
  list: Binned[]
  /** The row shown in the preview beside the list. */
  looked?: string | null
  /** Quick Look on this row. */
  onLook?: (one: Binned) => void
  onRestore: (one: Binned) => void
  onForget?: (one: Binned) => void
  cursor?: number
  chosen?: string[]
  /** The one row asked about, in its place. */
  asking?: string | null
  onClick?: (one: Binned, event: React.MouseEvent) => void
  onAsk?: (keys: string[]) => void
  onKeep?: () => void
  menuFor?: (one: Binned) => MenuItem[] | null
  onToggle?: (key: string) => void
  /** Every row picked, while some are not: the row menu's "Select all", as every list has. */
  onSelectAll?: () => void
}): React.JSX.Element {
  // A long Bin draws only the rows in sight, without the lift-away: hundreds
  // of binned notes each drawn and animated made the page slow to open.
  const long = list.length > BIN_DRAWN
  const row = (one: Binned, index: number): React.JSX.Element => {
        const key = keyOf(one)
        const picked = chosen.includes(key)
        return (
        // A right-click offers what the row's button does, and its words to copy.
        <RowMenu key={key} items={menuFor?.(one) ?? [
          { label: 'Restore', keys: '↵', run: () => onRestore(one) },
          !!onLook && { label: 'Quick Look', keys: 'Space', run: () => onLook(one) },
          { label: 'Copy text', run: () => copy(one.title) },
          !!onToggle && { label: picked ? 'Unselect' : 'Select', keys: 'X', run: () => onToggle(key) },
          !!onSelectAll && { label: 'Select all', keys: '⌘A', run: onSelectAll },
          'separator',
          !!onForget && { label: 'Delete for good…', keys: '⌫', danger: true, run: () => onAsk?.([key]) }
        ]}>
        <motion.li key={key} data-row data-id={one.id} data-bin-row={one.type} data-picked={picked || undefined} data-cursor={index === cursor || undefined}
          onClick={onClick ? (event) => !(event.target as Element).closest('button') && onClick(one, event) : undefined}
          data-looked={key === looked || undefined}
          className={`flex items-center gap-3 overflow-hidden rounded-md px-2 py-2 ${long ? 'border-b border-border/60' : ''} ${picked ? PICKED_ROW : index === cursor ? 'bg-accent/40' : ''}`}
          layout={long ? false : 'position'}
          // Restored by ↵ it simply goes; by a click it lifts away. The rows below close the gap on `layout`.
          variants={{ gone: () => (byKeys() ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, transform: shift('translateY(-8px)'), transition: { duration: 0.16, ease: EASE } }) }}
          exit="gone"
          // The rows below close the gap on their own spring, or at once after a key.
          transition={byKeys() ? { duration: 0 } : spring.moderate}>
          {/* A capture says its own kind (Note, Quote, Link), as it did before it went to the Bin. */}
          <span className="w-16 shrink-0 text-xs text-muted-foreground">{kindSaid(one)}</span>
          {/* The name without its #tags, the tags as chips after it, as every main list shows them.
              With no name of its own, its first line, in muted ink. Pointed at, the card an @ link
              shows (note-preview.tsx), except on the one already open beside the list. */}
          <span className="min-w-0 flex-1 truncate">
            <span {...(onClick && key !== looked ? hoverNote(one.type, one.id, { kind: one.type === 'capture' ? one.kind : one.type === 'nugget' ? 'idea' : one.type, binned: true }) : {})}
              data-untitled={nameOf(one).line || undefined}
              className={`private-text text-body ${nameOf(one).line ? 'text-muted-foreground' : 'text-foreground'}`}>{nameOf(one).text}</span>
          </span>
          <Tags tags={taskName(one.title).tags} />
          <span className="shrink-0 text-xs text-muted-foreground">{whenInLine(one.at)}</span>
          {asking === key && onForget ? (
            <span data-bin-ask className="flex shrink-0 items-center gap-1">
              <span className="text-control font-medium text-foreground">Delete for good? It cannot come back.</span>
              <HoldButton variant="destructive" hint="This one, deleted for good" done="Deleting…" onHold={() => onForget(one)}>Hold to delete</HoldButton>
              <Button size="sm" variant="ghost" onClick={() => onKeep?.()}>Keep it</Button>
            </span>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => onRestore(one)}><ArchiveRestore className="size-3.5" /> Restore</Button>
          )}
        </motion.li>
        </RowMenu>
        )
  }
  // Out of the page's own going: a row the list stops drawing mid-exit never
  // says it has gone, and the page waited on it for ever, left in the window
  // under every page after it.
  if (long)
    return (
      <PresenceContext.Provider value={null}>
        <VirtualList items={list} keyOf={keyOf} cursor={cursor} estimate={45}>
          {(one, index) => <ul>{row(one, index)}</ul>}
        </VirtualList>
      </PresenceContext.Provider>
    )
  return (
    <ul className="divide-y divide-border/60">
      {/* Restored, a row lifts up out of the list as it fades, and the rows below close the gap. */}
      <AnimatePresence initial={false}>
      {list.map(row)}
      </AnimatePresence>
    </ul>
  )
}

/** How many rows the Bin draws whole, each lifting away as it is restored; past this it draws only what is in sight. */
const BIN_DRAWN = 80
