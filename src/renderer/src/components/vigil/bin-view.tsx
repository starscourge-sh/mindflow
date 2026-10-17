import { useEffect, useRef, useState } from 'react'
import { ArchiveRestore, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { EASE, byKeys, shift, spring } from '@/lib/motion'
import { chime } from '@/lib/sound'
import { unloaded, useLive, vigil, whenInLine } from '@/lib/vigil'
import { Button } from '@/components/ui/button'
import { Page, Tags, Tip, toast, typing, useListKeys } from './ui'
import { taskName } from '@/lib/tasks'
import { useSelectAll } from '@/lib/select-all'
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
 */
type Binned = { type: string; id: string; title: string; kind: string; at: string }

const KIND_SAID: Record<string, string> = { capture: 'Capture', task: 'Task', nugget: 'Gem', article: 'Article', question: 'Question', goal: 'Goal', card: 'Card', event: 'Event', calendar: 'Calendar' }

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
  const [cursor, setCursor] = useListKeys(shown.length, { onOpen: (index) => restore(shown[index]) })
  const here = useHere()
  const clear = (): void => (chime('off'), setPicked([]))
  const ask = (keys: string[]): void => void (keys.length && (chime('tap'), setAsking(keys)))
  // ⌘A picks every row on show; ⌫ asks first, since nothing comes back from here.
  const selectAll = useSelectAll(() => shown.map(keyOf), chosen, setPicked, { here, onDelete: ask, deleteSaid: '⌫ asks first; hold “Hold to delete” to delete them for good', current: () => (shown[cursor] ? keyOf(shown[cursor]) : null), titleOf: (key) => binned.find((one) => keyOf(one) === key)?.title })
  const allPicked = shown.length > 0 && shown.every((one) => chosen.includes(keyOf(one)))
  const from = useRef<string | null>(null)
  const toggle = (key: string): void => {
    from.current = key
    setPicked((keys) => (chime(keys.includes(key) ? 'off' : 'on'), keys.includes(key) ? keys.filter((one) => one !== key) : [...keys, key]))
  }
  // A click picks that row alone, ⌘-click adds or takes away one, ⇧-click a run, as in Finder.
  const click = (one: Binned, event: React.MouseEvent): void => {
    const key = keyOf(one)
    setCursor(shown.indexOf(one))
    if (event.metaKey) return toggle(key)
    if (event.shiftKey && from.current) {
      const a = shown.findIndex((row) => keyOf(row) === from.current)
      const b = shown.indexOf(one)
      if (a >= 0) return (chime('on'), setPicked((keys) => [...new Set([...keys, ...shown.slice(Math.min(a, b), Math.max(a, b) + 1).map(keyOf)])]))
    }
    from.current = key
    chime('tap')
    setPicked(chosen.length === 1 && chosen[0] === key ? [] : [key])
  }
  const now = useRef({ chosen, asking, shown, cursor })
  now.current = { chosen, asking, shown, cursor }
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!here() || typing() || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      if (document.querySelector('[role="menu"]')) return
      // Escape says no to the question first, then lets the picked rows go.
      if (event.key === 'Escape' && (now.current.asking || now.current.chosen.length)) {
        event.preventDefault()
        event.stopPropagation()
        if (now.current.asking) return void (chime('off'), setAsking(null))
        return clear()
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
  const many = asking && asking.length > 1
  return (
    <Page title="Bin" count={unloaded(binned) ? undefined : chosen.length || shown.length} unit={chosen.length ? ['selected', 'selected'] : ['thing', 'things']} actions={
      chosen.length ? (
        <span className="flex items-center gap-1">
          <Button size="sm" variant="secondary" onClick={() => restoreMany(pickedRows)}>{chosen.length === 1 ? 'Restore' : `Restore ${num(chosen.length)}`}</Button>
          <Tip label="Asks first, then you hold to delete for good  ⌫"><Button size="sm" variant="ghost" onClick={() => ask(chosen)}>Delete for good…</Button></Tip>
          {!allPicked && <Tip label="Everything on show  ⌘A"><Button size="sm" variant="ghost" onClick={selectAll}>Select all</Button></Tip>}
          <Tip label="Clear the selection  Esc"><Button variant="ghost" size="icon-sm" aria-label="Clear the selection" onClick={clear}><X className="size-3.5" /></Button></Tip>
        </span>
      ) : binned.length > 0 ? <span className="flex items-center gap-1">{shown.length > 1 && <Button size="sm" variant="ghost" onClick={() => restoreMany(shown)}>Restore {kind ? `these ${num(shown.length)}` : `all ${num(shown.length)}`}</Button>}<HoldButton hint="Everything in the Bin, deleted for good" done="Emptying…" onHold={empty}>Hold to empty</HoldButton></span> : null
    }>
      <div data-bin className="mx-auto w-full max-w-3xl px-5 pt-5 pb-16">
        <p className="mb-4 text-[0.9375rem] text-foreground"><strong className="font-semibold">Everything you moved to the Bin, of every kind.</strong> <span className="text-muted-foreground">“Restore” puts one back where it was. Pick some, press ⌫ and hold “Hold to delete” to delete them for good, or hold “Hold to empty” for all of it.</span></p>
        {/* Several asked about at once: the question over the list, with the count, until a yes or a no. */}
        {many && (
          <div data-bin-ask className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2">
            <span className="mr-auto text-control font-semibold text-foreground">Delete {num(asking.length)} for good? They cannot come back.</span>
            <HoldButton variant="destructive" hint={`${num(asking.length)} things, deleted for good`} done="Deleting…" onHold={() => forget(asking)}>Hold to delete {num(asking.length)}</HoldButton>
            <Button size="sm" variant="ghost" onClick={() => (chime('off'), setAsking(null))}>Keep them</Button>
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
          <Rows list={shown} cursor={cursor} chosen={chosen} asking={many ? null : asking?.[0] ?? null} onClick={click} onAsk={ask} onKeep={() => (chime('off'), setAsking(null))}
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
            onToggle={toggle} />
        ) : unloaded(binned) ? null : (
          // Nothing in the Bin yet: a few made-up ones show what waits here, dimmed and out of reach.
          <Example tryIt="choose “Move to the Bin” on any note, or close a task without doing it.">
            <Rows list={EXAMPLES()} onRestore={() => undefined} />
          </Example>
        )}
      </div>
    </Page>
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

function Rows({ list, onRestore, onForget, cursor = -1, chosen = [], asking = null, onClick, onAsk, onKeep, menuFor, onToggle }: {
  list: Binned[]
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
}): React.JSX.Element {
  return (
    <ul className="divide-y divide-border/60">
      {/* Restored, a row lifts up out of the list as it fades, and the rows below close the gap. */}
      <AnimatePresence initial={false}>
      {list.map((one, index) => {
        const key = keyOf(one)
        const picked = chosen.includes(key)
        return (
        // A right-click offers what the row's button does, and its words to copy.
        <RowMenu key={key} items={menuFor?.(one) ?? [
          { label: 'Restore', keys: '↵', run: () => onRestore(one) },
          { label: 'Copy text', run: () => copy(one.title) },
          !!onToggle && { label: picked ? 'Unselect' : 'Select', keys: 'X', run: () => onToggle(key) },
          'separator',
          !!onForget && { label: 'Delete for good…', keys: '⌫', danger: true, run: () => onAsk?.([key]) }
        ]}>
        <motion.li key={key} data-row data-id={one.id} data-bin-row={one.type} data-picked={picked || undefined} data-cursor={index === cursor || undefined}
          onClick={onClick ? (event) => !(event.target as Element).closest('button') && onClick(one, event) : undefined}
          className={`flex items-center gap-3 overflow-hidden rounded-md px-2 py-2 ${picked ? PICKED_ROW : index === cursor ? 'bg-accent/40' : ''}`}
          layout="position"
          // Restored by ↵ it simply goes; by a click it lifts away. The rows below close the gap on `layout`.
          variants={{ gone: () => (byKeys() ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, transform: shift('translateY(-8px)'), transition: { duration: 0.16, ease: EASE } }) }}
          exit="gone"
          // The rows below close the gap on their own spring, or at once after a key.
          transition={byKeys() ? { duration: 0 } : spring.moderate}>
          {/* A capture says its own kind (Note, Quote, Link), as it did before it went to the Bin. */}
          <span className="w-16 shrink-0 text-xs text-muted-foreground">{one.type === 'capture' ? CAPTURE_TYPES.find((type) => type.id === one.kind)?.label ?? 'Note' : KIND_SAID[one.type] ?? one.type}</span>
          {/* The name without its #tags, the tags as chips after it, as every main list shows them. */}
          <span className="private-text min-w-0 flex-1 truncate text-body text-foreground">{taskName(one.title).text || 'Untitled'}</span>
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
      })}
      </AnimatePresence>
    </ul>
  )
}
