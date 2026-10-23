import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { chime } from '@/lib/sound'
import { useLive } from '@/lib/haligtree'
import { loadSaid, practices, startPractice, type LoadKind, type PracticeSwitch } from '@/lib/practices'
import { num } from '../../../../main/dates'
import { Chips } from './display'
import { Island, PropInput, Tip, toast } from './ui'
import { LinkField } from './note-extras'
import { Tag as TagIcon } from '@/components/ui/icons'

const LOADS: { id: LoadKind | 'none'; label: string; tip: string }[] = [
  { id: 'none', label: 'Just the time', tip: 'Nothing opens: the 5 minutes alone' },
  { id: 'tag', label: 'A tag', tip: 'Your gems on it, recall cards due, the last draft' },
  { id: 'source', label: 'A book or source', tip: 'Its page at your last spot, ready for an excerpt' },
  { id: 'queue', label: 'Reading queue', tip: 'The next thing in your queue' },
  { id: 'problems', label: 'A problem list', tip: 'A note of problems: the next one, and last time’s note' }
]
const MINUTES = [5, 15, 30, 60]

/**
 * "Practise it" on a repeating task: at the task's time it offers 5 minutes
 * (never starts by itself), opens with the material you pick, and after it a
 * line goes in the log and it asks "What stuck?". Off, it keeps its settings
 * and its log for when it is on again.
 */
export function PractiseIt({ taskId }: { taskId: string }): React.JSX.Element {
  const on = useLive(() => practices.ofTask(taskId), null as PracticeSwitch | null, [taskId], ['item'])
  const set = (patch: Parameters<typeof practices.set>[1], said?: string): void => {
    const was = on
    void practices.set(taskId, patch).then(() => {
      chime(patch.on === false ? 'off' : patch.on ? 'on' : 'tap')
      if (said) toast(said, was ? () => void practices.set(taskId, { on: was.on, targetMin: was.targetMin, loadKind: was.loadKind, load: was.load }).then(() => chime('undo')) : undefined)
    })
  }
  const kind = on?.loadKind ?? 'none'
  return (
    <Island compact title="Practise it">
      <label data-practise-it className="flex cursor-pointer items-center gap-2 px-2 py-1.5">
        <span className="flex-1 text-control text-foreground">Practise it</span>
        <Switch aria-label="Practise it" checked={!!on?.on} onCheckedChange={(next) => set({ on: next }, next ? 'At its time it offers you 5 minutes' : 'No longer offered. Its log is kept')} />
      </label>
      <p className="px-2 pb-1.5 text-xs leading-relaxed">
        {on?.on
          ? `At its time it offers 5 minutes, never more unless you want. ${loadSaid({ loadKind: on.loadKind, load: on.load })}. After, a line goes in its log and it asks “What stuck?”`
          : 'At its time, an offer of 5 minutes; it opens with your material, and afterwards asks “What stuck?”'}
      </p>
      {on?.on && (
        <div className="flex flex-col gap-1.5 px-2 pb-2">
          <span className="text-xs text-muted-foreground">It opens with</span>
          <Chips options={LOADS.map(({ id, label }) => ({ id, label }))} on={(id) => id === kind} pick={(id) => set({ loadKind: id === 'none' ? null : (id as LoadKind), load: id === kind ? on.load : null })} />
          {kind === 'tag' && <PropInput icon={TagIcon} value={on.load ?? ''} placeholder="Which tag" ghost="spanish" does="Opens your gems and due cards on this tag" onSave={(tag) => set({ loadKind: 'tag', load: tag }, tag ? `Opens #${tag.replace(/^#/, '')}` : undefined)} />}
          {kind === 'source' && <PropInput icon={TagIcon} value={on.load?.replace(/^(attribution|medium):/, '') ?? ''} placeholder="Which book or source" ghost="Clean Code" does="Opens this source at your last spot" onSave={(name) => set({ loadKind: 'source', load: name ? `medium:${name}` : null })} />}
          {kind === 'problems' && <LinkField label="List" placeholder="The note of problems" value={on.load} onSave={(link) => set({ loadKind: 'problems', load: link?.replace(/^\w+:/, '') ?? null })} />}
          <span className="pt-1 text-xs text-muted-foreground">Aim for</span>
          <Chips options={MINUTES.map((n) => ({ id: String(n), label: `${n} min` }))} on={(id) => Number(id) === on.targetMin} pick={(id) => set({ targetMin: Number(id) })} />
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-muted-foreground">{on.runs ? `Practised ${num(on.runs)} ${on.runs === 1 ? 'time' : 'times'}` : 'Not practised yet'}</span>
            <Tip label="Start now: 5 minutes to begin, the timer runs as long as you like">
              <Button size="sm" variant="ghost" data-practise-now onClick={() => on.id && void startPractice(on.id)}>Start now</Button>
            </Tip>
          </div>
          {on.lastNote && <p className="text-xs leading-relaxed"><span className="text-muted-foreground">What stuck last time:</span> <span className="private-text text-foreground">{on.lastNote}</span></p>}
        </div>
      )}
    </Island>
  )
}
