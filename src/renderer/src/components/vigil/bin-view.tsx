import { useState } from 'react'
import { ArchiveRestore } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { EASE, shift, spring } from '@/lib/motion'
import { chime } from '@/lib/sound'
import { unloaded, useLive, vigil, whenInLine } from '@/lib/vigil'
import { Button } from '@/components/ui/button'
import { Page, toast } from './ui'
import { Example } from './example'
import { exampleDiscarded } from '@/lib/examples'
import { HoldButton } from './hold-button'
import { CAPTURE_TYPES } from '../capture-kinds/capture-kind-picker'
import { RowMenu, copy } from './row-menu'
import { num } from '../../../../main/dates'

/**
 * The Bin: one place for everything let go, of every kind. A capture
 * discarded, a task closed without doing, a gem, a piece of writing, a
 * question or a goal moved to the Bin. Each comes back with Restore; Empty,
 * held, lets them all go for good.
 */
type Binned = { type: string; id: string; title: string; kind: string; at: string }

const KIND_SAID: Record<string, string> = { capture: 'Capture', task: 'Task', nugget: 'Gem', article: 'Writing', question: 'Question', goal: 'Goal', card: 'Card' }

export function BinView({ onOpen }: { onOpen?: (type: string, id: string) => void }): React.JSX.Element {
  const binned = useLive(vigil.bin, [] as Binned[])
  const [kind, setKind] = useState<string | null>(null)
  const kinds = [...new Set(binned.map((one) => one.type))]
  const shown = kind ? binned.filter((one) => one.type === kind) : binned
  const restore = (one: Binned): void => {
    void vigil.restore(one.type, one.id).then(() => {
      chime('undo')
      toast(`${KIND_SAID[one.type] ?? 'It'} restored`, () => void unbin(one), 'success', onOpen && one.type !== 'task' ? { label: 'Open', key: 'O', run: () => onOpen(one.type, one.id) } : undefined)
    })
  }
  // Every one on show back where it was, in one go, and back in the Bin with one undo.
  const restoreAll = (): void => {
    const list = shown
    void Promise.all(list.map((one) => vigil.restore(one.type, one.id))).then(() => {
      chime('unshelve')
      toast(`${num(list.length)} ${list.length === 1 ? 'thing' : 'things'} restored`, () => void Promise.all(list.map(unbin)))
    })
  }
  // One let go for good, after a plain yes: it cannot be undone, so it is said so before, not after.
  const forget = (one: Binned): void => {
    void vigil.forgetBinned(one.type, one.id).then((done) => {
      if (!done) return
      chime('away')
      toast(`“${(one.title || 'Untitled').slice(0, 40)}” is gone for good`, undefined, 'info')
    })
  }
  const empty = (): void => {
    void vigil.emptyBin().then((n) => (chime('away'), toast(`${num(n)} ${n === 1 ? 'thing' : 'things'} let go for good`, undefined, 'info')))
  }
  return (
    <Page title="Bin" count={unloaded(binned) ? undefined : binned.length} unit={['thing', 'things']} actions={
      binned.length > 0 ? <span className="flex items-center gap-1">{shown.length > 1 && <Button size="sm" variant="ghost" onClick={restoreAll}>Restore {kind ? `these ${num(shown.length)}` : `all ${num(shown.length)}`}</Button>}<HoldButton hint="Everything in the Bin, for good" done="Emptying…" onHold={empty}>Hold to empty</HoldButton></span> : null
    }>
      <div data-bin className="mx-auto w-full max-w-3xl px-5 pt-5 pb-16">
        <p className="mb-4 text-[0.9375rem] text-foreground"><strong className="font-semibold">Everything you let go, of every kind.</strong> <span className="text-muted-foreground">Restore brings one back where it was. Right-click one to delete it for good, or hold “Hold to empty” to let them all go.</span></p>
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
          <Rows list={shown} onRestore={restore} onForget={forget} />
        ) : unloaded(binned) ? null : (
          // Nothing let go yet: a few made-up ones show what waits here, dimmed and out of reach.
          <Example tryIt="discard a capture, close a task without doing it, or choose “Move to the Bin” on a note's menu.">
            <Rows list={EXAMPLES()} onRestore={() => undefined} />
          </Example>
        )}
      </div>
    </Page>
  )
}

/** Back in the Bin, the way each kind went there: a restore taken back. */
const unbin = (one: Binned): Promise<unknown> =>
  one.type === 'capture' ? window.api.captures.save(one.id, { status: 'discarded' })
    : one.type === 'task' ? vigil.saveTask(one.id, { status: 'dropped' })
      : vigil.toBin(one.id)

/** What the Bin holds when it is empty, as an example: three let-go captures, a task and a gem. */
const EXAMPLES = (): Binned[] => [
  ...exampleDiscarded().map((one) => ({ type: 'capture', id: one.id, title: one.label ?? '', kind: one.kind, at: one.closedAt ?? one.capturedAt })),
  { type: 'task', id: 'example:bin-task', title: 'Learn to juggle three oranges', kind: 'todo', at: new Date(Date.now() - 3 * 86400000).toISOString() },
  { type: 'nugget', id: 'example:bin-gem', title: 'Every list is a wish', kind: 'note', at: new Date(Date.now() - 6 * 86400000).toISOString() }
]

function Rows({ list, onRestore, onForget }: { list: Binned[]; onRestore: (one: Binned) => void; onForget?: (one: Binned) => void }): React.JSX.Element {
  // The row being asked about: “Delete for good?” in its place until a yes or a no.
  const [asking, setAsking] = useState<string | null>(null)
  return (
    <ul className="divide-y divide-border/60">
      {/* Restored, a row lifts up out of the list as it fades, and the rows below close the gap. */}
      <AnimatePresence initial={false}>
      {list.map((one) => (
        // A right-click offers what the row's button does, and its words to copy.
        <RowMenu key={`${one.type}:${one.id}`} items={[
          { label: 'Restore', run: () => onRestore(one) },
          { label: 'Copy text', run: () => copy(one.title) },
          'separator',
          !!onForget && { label: 'Delete for good…', danger: true, run: () => (chime('tap'), setAsking(`${one.type}:${one.id}`)) }
        ]}>
        <motion.li key={`${one.type}:${one.id}`} data-row data-id={one.id} data-bin-row={one.type} className="flex items-center gap-3 overflow-hidden py-2"
          layout="position"
          exit={{ opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0, transform: shift('translateY(-8px)'), transition: { duration: 0.22, ease: EASE } }}
          transition={spring.moderate}>
          {/* A capture says its own kind (Note, Quote, Link), as it did before it was let go. */}
          <span className="w-16 shrink-0 text-xs text-muted-foreground">{one.type === 'capture' ? CAPTURE_TYPES.find((type) => type.id === one.kind)?.label ?? 'Note' : KIND_SAID[one.type] ?? one.type}</span>
          <span className="private-text min-w-0 flex-1 truncate text-body text-foreground">{one.title || 'Untitled'}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{whenInLine(one.at)}</span>
          {asking === `${one.type}:${one.id}` && onForget ? (
            <span data-bin-ask className="flex shrink-0 items-center gap-1">
              <span className="text-control font-medium text-foreground">Delete for good? It cannot come back.</span>
              <Button size="sm" variant="destructive" onClick={() => (setAsking(null), onForget(one))}>Delete for good</Button>
              <Button size="sm" variant="ghost" onClick={() => (chime('off'), setAsking(null))}>Keep it</Button>
            </span>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => onRestore(one)}><ArchiveRestore className="size-3.5" /> Restore</Button>
          )}
        </motion.li>
        </RowMenu>
      ))}
      </AnimatePresence>
    </ul>
  )
}
