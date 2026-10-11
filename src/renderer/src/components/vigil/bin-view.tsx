import { useState } from 'react'
import { ArchiveRestore } from 'lucide-react'
import { chime } from '@/lib/sound'
import { unloaded, useLive, vigil, whenInLine } from '@/lib/vigil'
import { Button } from '@/components/ui/button'
import { Page, toast } from './ui'
import { Example } from './example'
import { exampleDiscarded } from '@/lib/examples'
import { HoldButton } from './hold-button'
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
      toast(`${KIND_SAID[one.type] ?? 'It'} restored`, undefined, 'success', onOpen && one.type !== 'task' ? { label: 'Open', key: 'O', run: () => onOpen(one.type, one.id) } : undefined)
    })
  }
  const empty = (): void => {
    void vigil.emptyBin().then((n) => (chime('away'), toast(`${num(n)} ${n === 1 ? 'thing' : 'things'} let go for good`, undefined, 'info')))
  }
  return (
    <Page title="Bin" count={unloaded(binned) ? undefined : binned.length} unit={['thing', 'things']} actions={
      binned.length > 0 ? <HoldButton hint="Everything in the Bin, for good" done="Emptying…" onHold={empty}>Hold to empty</HoldButton> : null
    }>
      <div data-bin className="mx-auto w-full max-w-3xl px-5 pt-5 pb-16">
        <p className="mb-4 text-[0.9375rem] text-foreground"><strong className="font-semibold">Everything you let go, of every kind.</strong> <span className="text-muted-foreground">Restore brings one back where it was; emptying the Bin lets them all go for good.</span></p>
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
          <Rows list={shown} onRestore={restore} />
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

/** What the Bin holds when it is empty, as an example: three let-go captures, a task and a gem. */
const EXAMPLES = (): Binned[] => [
  ...exampleDiscarded().map((one) => ({ type: 'capture', id: one.id, title: one.label ?? '', kind: one.kind, at: one.closedAt ?? one.capturedAt })),
  { type: 'task', id: 'example:bin-task', title: 'Learn to juggle three oranges', kind: 'todo', at: new Date(Date.now() - 3 * 86400000).toISOString() },
  { type: 'nugget', id: 'example:bin-gem', title: 'Every list is a wish', kind: 'note', at: new Date(Date.now() - 6 * 86400000).toISOString() }
]

function Rows({ list, onRestore }: { list: Binned[]; onRestore: (one: Binned) => void }): React.JSX.Element {
  return (
    <ul className="divide-y divide-border/60">
      {list.map((one) => (
        <li key={`${one.type}:${one.id}`} data-row data-id={one.id} data-bin-row={one.type} className="flex items-center gap-3 py-2">
          <span className="w-16 shrink-0 text-xs text-muted-foreground">{KIND_SAID[one.type] ?? one.type}</span>
          <span className="private-text min-w-0 flex-1 truncate text-body text-foreground">{one.title || 'Untitled'}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{whenInLine(one.at)}</span>
          <Button size="sm" variant="ghost" onClick={() => onRestore(one)}><ArchiveRestore className="size-3.5" /> Restore</Button>
        </li>
      ))}
    </ul>
  )
}
