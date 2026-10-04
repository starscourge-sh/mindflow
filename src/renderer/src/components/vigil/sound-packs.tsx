import { useRef, useState } from 'react'
import { Check, CircleDashed } from 'lucide-react'

import { CAPTURE_TYPES } from '../capture-kinds/capture-kind-picker'
import { PACKS, chime, click, withPack, type ClickName, type PackName } from '@/lib/sound'
import { vigil } from '@/lib/vigil'

/**
 * The sound pack, chosen by ear: the nine packs down the left, and on the right
 * the app's own pieces to try them on, each making the sound it makes in use.
 * Pointing at a pack is enough to hear it; clicking one keeps it. Inspired by
 * sensory-ui's showcase, set in this app rather than in a demo of buttons.
 */
export function SoundPacks({ chosen }: { chosen: PackName }): React.JSX.Element {
  const [trying, setTrying] = useState<PackName>(chosen)
  const [done, setDone] = useState(false)
  const last = useRef(0)
  const play = (sound: () => void): void => withPack(trying, sound)
  const hover = (name: ClickName): void => {
    const now = performance.now()
    if (now - last.current < 40) return
    last.current = now
    play(() => click(name))
  }
  const sample = [
    { kind: 'quote', title: 'Friction determines behaviour more than intent does' },
    { kind: 'word', title: 'anachronistic' },
    { kind: 'idea', title: 'Dev logs where I clone a UI from scratch' }
  ]

  return (
    <div data-silent className="grid grid-cols-[14rem_1fr] gap-6 py-5">
      <div className="flex flex-col gap-0.5" onMouseLeave={() => setTrying(chosen)}>
        {(Object.keys(PACKS) as PackName[]).map((name) => (
          <button
            key={name}
            type="button"
            onMouseEnter={() => {
              setTrying(name)
              withPack(name, () => click('soft'))
            }}
            onClick={() => {
              void vigil.setSettings({ soundPack: name })
              withPack(name, () => chime('promote'))
            }}
            className={`flex items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${trying === name ? 'bg-accent' : ''}`}
          >
            <Check className={`mt-0.5 size-4 shrink-0 ${chosen === name ? 'text-[var(--tt-brand-color-400)]' : 'invisible'}`} />
            <span>
              <span className="block font-medium">{PACKS[name].label}</span>
              <span className="block text-xs leading-snug text-muted-foreground">{PACKS[name].feel}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-5 text-sm">
        <p className="text-muted-foreground">
          Trying <span className="text-foreground">{PACKS[trying].label}</span>. Point at, scroll and press the pieces below.
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
            <button type="button" className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => play(() => chime('promote'))}>Promote</button>
            <button type="button" className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => play(() => chime('away'))}>Discard</button>
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
          <button
            type="button"
            onClick={() => {
              setDone(!done)
              if (!done) play(() => chime('done'))
            }}
            className="flex items-center gap-2 rounded-md border px-3 py-1.5 hover:bg-accent"
          >
            {done ? <Check className="size-4 text-[var(--tt-color-text-green)]" /> : <CircleDashed className="size-4" />} Tick off a task
          </button>
          <button type="button" onClick={() => play(() => chime('send'))} className="rounded-md border px-3 py-1.5 hover:bg-accent">Send a capture</button>
          <button type="button" onClick={() => play(() => chime('hint'))} className="rounded-md border px-3 py-1.5 hover:bg-accent">A hint arrives</button>
          <button type="button" onClick={() => play(() => chime('tap'))} className="rounded-md border px-3 py-1.5 hover:bg-accent">Switch tab</button>
        </div>

        <div>
          <p className="mb-1 text-xs text-muted-foreground">Review: reveal, then grade</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => play(() => chime('reveal'))} className="rounded-md border px-3 py-1.5 hover:bg-accent">Show</button>
            {(['again', 'hard', 'good', 'easy'] as const).map((grade) => (
              <button key={grade} type="button" onClick={() => play(() => chime(grade))} className="rounded-md border px-3 py-1.5 capitalize hover:bg-accent">{grade}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
