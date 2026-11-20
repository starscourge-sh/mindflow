import { useEffect, useRef, useState } from 'react'
import { call } from '@/lib/haligtree'
import { chime } from '@/lib/sound'
import { useHas } from '@/lib/needs'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Setting } from './settings-view'
import { Orb } from './orb'
import { namedByApp, toast } from './ui'
import { num, plural } from '../../../../main/dates'

type Long = { kind: 'capture' | 'task'; id: string; name: string; /** A recording named after its event, not by what was said. */ fromEvent?: boolean }
type Row = Long & { to: string; on: boolean }

/** A long name and, on, the short one Apple Intelligence gives it, the long one kept under it. */
const LongNamesSample = ({ on }: { on: boolean }): React.JSX.Element => (
  <span data-preview="long-names" data-on={on || undefined} className="flex h-9 w-40 flex-col justify-center overflow-hidden rounded-md border bg-background px-2 leading-none">
    <span className={`truncate text-[10px] font-semibold text-foreground transition-opacity duration-200 ${on ? '' : 'opacity-0'}`}>Build a database in Go</span>
    <span className="mt-[3px] truncate text-[9px] text-muted-foreground">Go: Code a database in 45 steps: a series of…</span>
  </span>
)

type Was = { id: string; title: string }

/**
 * A list of names the app would give, looked over before any is changed: each shown as Apple Intelligence names it,
 * changeable or left out, then one notice with Undo. "Rename the long ones I have…" and "Name 12 recordings by what
 * was said" are both this.
 */
function RenamePreview({ offer, list, ask, done, what, after }: {
  /** The button that starts it. */
  offer: string
  list: () => Promise<Long[]>
  ask: (one: Long) => Promise<string | null>
  /** The notice once renamed. */
  done: (count: number, picked: Row[]) => string
  /** What a row is now, under its new name. */
  what: (one: Long) => string
  /** Run once names were given, and again once Undo put them back. */
  after?: () => void
}): React.JSX.Element {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [asking, setAsking] = useState<{ done: number; of: number } | null>(null)
  const stopped = useRef(false)
  const look = async (): Promise<void> => {
    stopped.current = false
    const long = await list()
    if (!long.length) return void toast('Nothing left to name: every one is named already')
    setRows([])
    setAsking({ done: 0, of: long.length })
    // One at a time, each shown as it comes: the model answers in about a second each.
    for (const [at, one] of long.entries()) {
      if (stopped.current) break
      const to = await ask(one).catch(() => null)
      if (to) setRows((was) => [...(was ?? []), { ...one, to, on: true }])
      setAsking({ done: at + 1, of: long.length })
    }
    setAsking(null)
  }
  const apply = async (): Promise<void> => {
    const picked = (rows ?? []).filter((one) => one.on && one.to.trim())
    // Each new name rolls in over the old one wherever it is shown, and back again on Undo.
    for (const one of picked) namedByApp(one.id, one.to.trim())
    const was = await call<Was[]>('names:apply', picked)
    chime('noted')
    setRows(null)
    after?.()
    toast(done(was.length, picked), () => {
      for (const one of picked) namedByApp(one.id, one.name)
      void call('names:undo', was).then(() => (chime('undo'), after?.()))
    })
  }
  const picked = rows?.filter((one) => one.on).length ?? 0
  return (
    <div data-rename-preview className="mt-2 space-y-2">
      {rows === null && !asking && <Button size="sm" variant="outline" className="h-8 cursor-pointer px-3" data-rename-look onClick={() => void look()}>{offer}</Button>}
      {asking && <Orb label={`Naming ${num(asking.done + 1 > asking.of ? asking.of : asking.done + 1)} of ${num(asking.of)} on this Mac…`} stop={() => (stopped.current = true)} />}
      {rows !== null && (
        <>
          {rows.length > 0 && (
            <ul className="max-h-[22rem] divide-y overflow-y-auto rounded-xl border bg-background">
              {rows.map((one, at) => (
                <li key={`${one.kind}:${one.id}`} data-long-name={one.id} className="flex items-start gap-3 px-3 py-2">
                  <Switch aria-label={`Rename “${one.name}”`} className="mt-0.5" checked={one.on} onCheckedChange={(on) => (chime(on ? 'on' : 'off'), setRows((was) => was && was.with(at, { ...one, on })))} />
                  <span className="min-w-0 flex-1">
                    <input aria-label="Its new name" value={one.to} disabled={!one.on} onChange={(event) => setRows((was) => was && was.with(at, { ...one, to: event.target.value }))}
                      className="w-full rounded-sm bg-transparent text-control font-medium text-foreground outline-none disabled:text-muted-foreground" />
                    <span className="block truncate text-meta text-muted-foreground" title={one.name}>{what(one)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {!asking && (
            <div className="flex items-center gap-3">
              <Button size="sm" className="h-8 cursor-pointer px-3" data-rename-apply disabled={!picked} onClick={() => void apply()}>{picked ? `Rename ${num(picked)}` : 'None picked'}</Button>
              <Button size="sm" variant="ghost" className="h-8 cursor-pointer px-3" onClick={() => (chime('fold'), setRows(null))}>Leave them</Button>
              {!rows.length && <span className="text-control text-muted-foreground">Apple Intelligence found no better name for any of them.</span>}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/**
 * Settings' "Name long notes for me" (main/long-names.ts): on, each note or task made with a long name is named
 * short by Apple Intelligence on this Mac, its long name kept. "Rename the long ones…" does those already kept:
 * a list to look over first, each name changeable or left out, then one notice with Undo.
 */
export function LongNamesSetting({ on, set }: { on: boolean; set: (on: boolean) => void }): React.JSX.Element | null {
  // Not drawn at all on a Mac without Apple Intelligence: Settings' "Apple Intelligence" line says what it would add.
  if (!useHas('ai')) return null
  return (
    <div data-mac-needs="ai">
      <Setting title="Name long notes for me" note="A note or task made with a long name gets a short one from Apple Intelligence; the long one stays."
        more="A note keeps its long first line under the short name, and is found by either. A task's long words move to its description. On this Mac, with nothing sent anywhere."
        keywords="rename long name title short apple intelligence alias backfill task description auto name"
        below={(
          <div data-long-names>
            <RenamePreview offer="Rename the long ones I have…" list={() => call<Long[]>('names:long')} ask={(one) => call<string | null>('names:ask', one.name)}
              done={(count) => `Renamed ${plural(count, 'note or task', 'notes and tasks')}, their long names kept`} what={(one) => `${one.kind === 'task' ? 'Task' : 'Note'}, now “${one.name}”`} />
          </div>
        )}>
        <LongNamesSample on={on} />
        <Switch aria-label="Name long notes for me" checked={on} onCheckedChange={set} />
      </Setting>
    </div>
  )
}

/** How recordings were (or would be) named: after their events, by what was said, or some each way. */
const namedHow = (list: Long[]): string => (list.every((one) => one.fromEvent) ? 'after their events' : list.some((one) => one.fromEvent) ? 'after their events or by what was said' : 'by what was said')

/**
 * Under Settings' "Apple Intelligence": the recordings kept before it named them ("Recording, 8 Nov at 15:28"),
 * offered while there are any, each named after its event or by what was said in its first minutes, after a look over the list.
 * Nothing at all where it is off or this Mac lacks it (main/long-names.ts gives none).
 */
export function RecordingNames({ on }: { on: boolean }): React.JSX.Element | null {
  const [offered, setOffered] = useState<Long[]>([])
  const count = offered.length
  const [seen, setSeen] = useState(0)
  useEffect(() => {
    if (!on) return setOffered([])
    let live = true
    void call<Long[]>('names:recordings').then((list) => live && setOffered(list))
    return () => void (live = false)
  }, [on, seen])
  if (!on || !count) return null
  return (
    <div data-recording-names>
      <RenamePreview offer={`Name ${plural(count, 'recording')} ${namedHow(offered).replace('their events', count === 1 ? 'its event' : 'their events')}…`} list={() => call<Long[]>('names:recordings')} ask={(one) => call<string | null>('names:recording', one.id)}
        done={(n, picked) => `Named ${plural(n, 'recording')} ${namedHow(picked)}, their old names kept`} what={(one) => `Recording, now “${one.name}”`} after={() => setSeen((at) => at + 1)} />
    </div>
  )
}
