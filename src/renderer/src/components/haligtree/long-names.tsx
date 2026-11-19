import { useRef, useState } from 'react'
import { call } from '@/lib/haligtree'
import { chime } from '@/lib/sound'
import { lacks, meets, useCaps } from '@/lib/needs'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Setting } from './settings-view'
import { Orb } from './orb'
import { toast } from './ui'
import { num, plural } from '../../../../main/dates'

type Long = { kind: 'capture' | 'task'; id: string; name: string }
type Row = Long & { to: string; on: boolean }

/** A long name and, on, the short one Apple Intelligence gives it, the long one kept under it. */
const LongNamesSample = ({ on }: { on: boolean }): React.JSX.Element => (
  <span data-preview="long-names" data-on={on || undefined} className="flex h-9 w-40 flex-col justify-center overflow-hidden rounded-md border bg-background px-2 leading-none">
    <span className={`truncate text-[10px] font-semibold text-foreground transition-opacity duration-200 ${on ? '' : 'opacity-0'}`}>Build a database in Go</span>
    <span className="mt-[3px] truncate text-[9px] text-muted-foreground">Go: Code a database in 45 steps: a series of…</span>
  </span>
)

/**
 * Settings' "Name long notes for me" (main/long-names.ts): on, each note or task made with a long name is named
 * short by Apple Intelligence on this Mac, its long name kept. "Rename the long ones…" does those already kept:
 * a list to look over first, each name changeable or left out, then one notice with Undo.
 */
export function LongNamesSetting({ on, set }: { on: boolean; set: (on: boolean) => void }): React.JSX.Element {
  const caps = useCaps()
  const has = meets(caps, 'ai')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [asking, setAsking] = useState<{ done: number; of: number } | null>(null)
  const stopped = useRef(false)
  const look = async (): Promise<void> => {
    stopped.current = false
    const long = await call<Long[]>('names:long')
    if (!long.length) return void toast('No long names: every note and task is named short already')
    setRows([])
    setAsking({ done: 0, of: long.length })
    // One at a time, each shown as it comes: the model answers in about a second each.
    for (const [at, one] of long.entries()) {
      if (stopped.current) break
      const to = await call<string | null>('names:ask', one.name).catch(() => null)
      if (to) setRows((was) => [...(was ?? []), { ...one, to, on: true }])
      setAsking({ done: at + 1, of: long.length })
    }
    setAsking(null)
  }
  const apply = async (): Promise<void> => {
    const picked = (rows ?? []).filter((one) => one.on && one.to.trim())
    const was = await call<unknown[]>('names:apply', picked)
    chime('noted')
    setRows(null)
    toast(`Renamed ${plural(was.length, 'note or task', 'notes and tasks')}, their long names kept`, () => void call('names:undo', was).then(() => chime('undo')))
  }
  const picked = rows?.filter((one) => one.on).length ?? 0
  return (
    <div data-mac-needs="ai" data-mac-lacking={has ? undefined : ''}>
      <Setting title="Name long notes for me" note="A note or task made with a long name gets a short one from Apple Intelligence; the long one stays."
        more="A note keeps its long first line under the short name, and is found by either. A task's long words move to its description. On this Mac, with nothing sent anywhere."
        keywords="rename long name title short apple intelligence alias backfill task description auto name"
        off={has ? undefined : lacks(caps, 'ai', true)}
        below={has && (
          <div data-long-names className="mt-2 space-y-2">
            {rows === null && !asking && <Button size="sm" variant="outline" className="h-8 cursor-pointer px-3" data-long-names-look onClick={() => void look()}>Rename the long ones I have…</Button>}
            {asking && <Orb label={`Naming ${num(asking.done + 1 > asking.of ? asking.of : asking.done + 1)} of ${num(asking.of)} on this Mac…`} stop={() => (stopped.current = true)} />}
            {rows !== null && (
              <>
                {rows.length > 0 && (
                  <ul className="max-h-[22rem] divide-y overflow-y-auto rounded-xl border bg-background">
                    {rows.map((one, at) => (
                      <li key={`${one.kind}:${one.id}`} data-long-name={one.id} className="flex items-start gap-3 px-3 py-2">
                        <Switch aria-label={`Rename “${one.name}”`} className="mt-0.5" checked={one.on} onCheckedChange={(on) => (chime(on ? 'on' : 'off'), setRows((was) => was && was.with(at, { ...one, on })))} />
                        <span className="min-w-0 flex-1">
                          <input aria-label="Its short name" value={one.to} disabled={!one.on} onChange={(event) => setRows((was) => was && was.with(at, { ...one, to: event.target.value }))}
                            className="w-full rounded-sm bg-transparent text-control font-medium text-foreground outline-none disabled:text-muted-foreground" />
                          <span className="block truncate text-meta text-muted-foreground" title={one.name}>{one.kind === 'task' ? 'Task' : 'Note'}, now “{one.name}”</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {!asking && (
                  <div className="flex items-center gap-3">
                    <Button size="sm" className="h-8 cursor-pointer px-3" data-long-names-apply disabled={!picked} onClick={() => void apply()}>{picked ? `Rename ${num(picked)}` : 'None picked'}</Button>
                    <Button size="sm" variant="ghost" className="h-8 cursor-pointer px-3" onClick={() => (chime('fold'), setRows(null))}>Leave them</Button>
                    {!rows.length && <span className="text-control text-muted-foreground">Apple Intelligence found no shorter name for any of them.</span>}
                  </div>
                )}
              </>
            )}
          </div>
        )}>
        {has && <LongNamesSample on={on} />}
        {has && <Switch aria-label="Name long notes for me" checked={on} onCheckedChange={set} />}
      </Setting>
    </div>
  )
}
