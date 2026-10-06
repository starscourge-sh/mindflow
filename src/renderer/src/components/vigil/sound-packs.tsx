import { useState } from 'react'
import { CircleDashed } from 'lucide-react'
import { alive } from '@/components/ui/alive-icon'
import SimpleCheckedIcon from '@/components/ui/simple-checked-icon'

import { CAPTURE_TYPES } from '../capture-kinds/capture-kind-picker'
import { PACKS, chime, click, withPack, type ClickName, type PackName } from '@/lib/sound'
import { vigil } from '@/lib/vigil'
import { Button } from '@/components/ui/button'

// itshover drawings in lucide's place, moving when their control is pointed at.
const Check = alive(SimpleCheckedIcon)

/**
 * The sound pack, chosen by ear: the nine packs down the left, and on the right
 * the app's own pieces, each making the sound it makes in use. One rule: the
 * pieces play the pack you have. Pointing at a pack plays a click of it;
 * clicking one makes it yours, and the pieces play it from then on.
 */
export function SoundPacks({ chosen }: { chosen: PackName }): React.JSX.Element {
  const [done, setDone] = useState(false)
  const play = (sound: () => void): void => withPack(chosen, sound)
  const hover = (name: ClickName): void => play(() => click(name))
  const sample = [
    { kind: 'quote', title: 'Friction determines behaviour more than intent does' },
    { kind: 'word', title: 'anachronistic' },
    { kind: 'note', title: 'Dev logs where I clone a UI from scratch' }
  ]

  return (
    <div data-silent className="grid grid-cols-1 gap-6 py-5 @[48rem]/page:grid-cols-[14rem_minmax(0,1fr)]">
      <div className="flex flex-col gap-0.5">
        {(Object.keys(PACKS) as PackName[]).map((name) => (
          <button
            key={name}
            type="button"
            onMouseEnter={() => withPack(name, () => click('soft'))}
            // Reached by j and k as well as by the pointer: the same preview.
            onFocus={() => withPack(name, () => click('soft'))}
            onClick={() => {
              void vigil.setSettings({ soundPack: name })
              withPack(name, () => chime('promote'))
            }}
            className={`flex items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/60 ${chosen === name ? 'bg-accent' : ''}`}
          >
            <Check className={`mt-0.5 size-4 shrink-0 ${chosen === name ? 'text-[var(--tt-brand-color-400)]' : 'invisible'}`} />
            <span>
              <span className="block font-medium">{PACKS[name].label}</span>
              <span className="block text-meta leading-relaxed text-pretty text-muted-foreground">{PACKS[name].feel}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-5 text-sm">
        <p className="truncate text-muted-foreground">
          Playing <span className="text-foreground">{PACKS[chosen].label}</span>, your pack. Click another to switch.
        </p>

        <div>
          <p className="mb-1 text-xs text-muted-foreground">Captures: hover, then open one</p>
          <div className="rounded-md border">
            {sample.map((row) => {
              const kind = CAPTURE_TYPES.find((type) => type.id === row.kind)!
              return (
                <button key={row.title} type="button" onMouseEnter={() => hover('soft')} onPointerDown={() => play(() => click('tick'))} className="flex w-full items-center gap-2 border-b px-3 py-2 text-left last:border-b-0 hover:bg-accent/60">
                  <kind.icon className="size-4" style={{ color: kind.tint }} />
                  {row.title}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs text-muted-foreground">Waiting on you: a rot card knocks</p>
          <div onMouseEnter={() => hover('knock')} className="flex items-center gap-3 rounded-md border px-3 py-2">
            <span className="flex-1">It disappeared like a fart in the wind.</span>
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => play(() => chime('promote'))}>Promote</Button>
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => play(() => chime('away'))}>Discard</Button>
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs text-muted-foreground">Scroll</p>
          <div
            className="h-24 overflow-y-auto rounded-md border px-3 py-2 text-muted-foreground"
            onScroll={(event) => {
              const box = event.currentTarget
              const at = Number(box.dataset.at ?? box.scrollTop)
              if (Math.abs(box.scrollTop - at) < 24) return
              box.dataset.at = String(box.scrollTop)
              hover('tock')
            }}
          >
            {Array.from({ length: 14 }, (_, index) => <p key={index} className="py-1">A line of a long excerpt, number {index + 1}</p>)}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="lg"
 onClick={() => {
 setDone(!done)
 if (!done) play(() => chime('done'))
 }}
 
>
            {done ? <Check className="size-4 text-[var(--tt-color-text-green)]" /> : <CircleDashed className="size-4" />} Tick off a task
          </Button>
          <Button variant="outline" size="lg" onClick={() => play(() => chime('send'))}>Send a capture</Button>
          <Button variant="outline" size="lg" onClick={() => play(() => chime('hint'))}>A hint arrives</Button>
          <Button variant="outline" size="lg" onClick={() => play(() => chime('tap'))}>Switch tab</Button>
        </div>

        <div>
          <p className="mb-1 text-xs text-muted-foreground">Everything else: each thing you do has its own sound</p>
          <div className="flex flex-wrap gap-2">
            {([
              ['resolve', 'Resolve'], ['away', 'Discard'], ['promote', 'Promote'], ['noted', 'Add a task'],
              ['undo', 'Undo'], ['copy', 'Copy'], ['pin', 'Pin'], ['search', 'Search'],
              ['open', 'A menu opens'], ['on', 'Switch on'], ['off', 'Switch off'],
              ['slide', 'Panel out'], ['fold', 'Panel away'], ['page', 'Turn a page'], ['read', 'Start reading'],
              ['settled', 'Keep a theme'], ['hold', 'Hold a question'], ['clue', 'Add a clue'], ['answered', 'Got it'], ['release', 'Let it go'], ['nope', 'Not allowed']
            ] as const).map(([cue, label]) => (
              <Button variant="outline" size="lg" key={cue} onClick={() => play(() => chime(cue))}>{label}</Button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs text-muted-foreground">Review: reveal, then grade</p>
          <div className="flex gap-2">
            <Button variant="outline" size="lg" onClick={() => play(() => chime('reveal'))}>Show</Button>
            {(['again', 'hard', 'good', 'easy'] as const).map((grade) => (
              <Button variant="outline" size="lg" key={grade} onClick={() => play(() => chime(grade))} className="capitalize">{grade}</Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
