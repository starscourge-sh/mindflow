import { useEffect, useRef, type ReactNode } from 'react'
import { chime, soundOn, step } from '@/lib/sound'
import { Download } from 'lucide-react'

import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { ThemePicker } from '../theme/theme-picker'
import { Switch } from '@/components/ui/switch'
import { useLive, vigil, type Settings } from '@/lib/vigil'
import { SoundPacks } from './sound-packs'
import { Page, Rolling, beaming, toast } from './ui'
import { Button } from '@/components/ui/button'

/**
 * One setting, as a row in an island the way System Settings groups them: its
 * name and what it changes on the left, the control on the right.
 */
function Setting({ title, children, note }: { title: string; children: ReactNode; note: string }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-6 px-4 py-3">
      <div className="min-w-0">
        <div className="text-body font-medium text-foreground">{title}</div>
        <p className="mt-0.5 max-w-md text-meta leading-relaxed text-muted-foreground">{note}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2 text-control">{children}</div>
    </div>
  )
}

/** Settings that belong together, in one rounded island under a heading. */
function Group({ title, children }: { title: string; children: ReactNode }): React.JSX.Element {
  return (
    <section className="mt-6 first:mt-0">
      <h2 className="mb-2 px-1 text-body font-semibold text-foreground">{title}</h2>
      <div className="divide-y divide-border/60 overflow-hidden rounded-xl border bg-accent/25">{children}</div>
    </section>
  )
}

const field = 'h-8 tabular-nums'

/**
 * The settings. Each one is a value read in one place, and each says what it
 * changes in a sentence, so a setting never needs looking up.
 */
export function SettingsView(): React.JSX.Element {
  const settings = useLive(vigil.settings, null as Settings | null)
  // Vim keys here too: j and k move between the controls, h and l turn a
  // slider down and up, and Enter or Space presses what has the focus.
  const page = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const active = document.activeElement as HTMLElement | null
      if (event.metaKey || event.ctrlKey || event.altKey || ['INPUT', 'TEXTAREA'].includes(active?.tagName ?? '')) return
      const controls = [...(page.current?.querySelectorAll<HTMLElement>('button, [role="slider"], input') ?? [])]
      const at = controls.indexOf(active as HTMLElement)
      if (event.key === 'j' || event.key === 'k') {
        event.preventDefault()
        controls[Math.max(0, Math.min(controls.length - 1, at + (event.key === 'j' ? 1 : -1)))]?.focus()
      } else if ((event.key === 'h' || event.key === 'l') && active?.getAttribute('role') === 'slider') {
        event.preventDefault()
        active.dispatchEvent(new KeyboardEvent('keydown', { key: event.key === 'h' ? 'ArrowLeft' : 'ArrowRight', bubbles: true }))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  if (!settings) return <Page title="Settings"><div /></Page>
  const set = (patch: Partial<Settings>): void => void vigil.setSettings(patch)

  return (
    <Page title="Settings">
      <div ref={page} className="mx-auto w-full max-w-2xl px-5 pt-5 pb-16">
        <Group title="Appearance">
          <Setting title="Theme" note="The colours of every window: the prompt and this one change together. Point at one to try it, click to keep it.">
            <ThemePicker className="-mr-2 h-8 gap-1.5 rounded-full px-2 hover:bg-accent" />
          </Setting>
          <Setting title="Full width" note="Off, pages sit in a centred column the way Notion lays them out. On, the writing runs edge to edge.">
            <Switch checked={settings.fullWidth} onCheckedChange={(fullWidth) => set({ fullWidth })} />
          </Setting>
          <Setting title="Motion" note="Things ease in and out: a capture leaving, a card arriving, a page sliding over. Off, everything appears at once.">
            <Switch checked={settings.motion} onCheckedChange={(motion) => set({ motion })} />
          </Setting>
        </Group>

        <Group title="Sound">
          <Setting title="Sounds" note="A small click as you point at things and scroll, and a sound for each thing you do.">
            <Switch checked={settings.sounds} onCheckedChange={(sounds) => {
              soundOn(sounds)
              set({ sounds })
            }} />
          </Setting>
          {settings.sounds && (
            <Setting title="Volume" note="How loud every sound is, from silent to as loud as they were made.">
              <Slider className="w-40" min={0} max={1} step={0.05} value={[settings.volume]} onValueChange={([volume]) => set({ volume })} onValueCommit={() => chime('tap')} />
            </Setting>
          )}
          {settings.sounds && (
            <div className="px-4 py-3">
              <div className="text-body font-medium text-foreground">Sound pack</div>
              <p className="mt-0.5 max-w-md text-meta leading-relaxed text-muted-foreground">Nine characters for the same sounds. Point at one to hear it; click it to make it yours. The pieces on the right always play the one you have.</p>
              <SoundPacks chosen={settings.soundPack} />
            </div>
          )}
        </Group>

        <Group title="What comes back to you">
          <Setting title="Hints" note="How often the prompt shows you something you kept. Rare is the point: a hint every time is one you learn to ignore.">
            <Slider className="w-40" min={0} max={0.5} step={0.05} value={[settings.hintRate]} onValueChange={([hintRate]) => set({ hintRate })} onValueCommit={() => chime('tap')} />
            <span className="w-16 text-right tabular-nums"><Rolling text={settings.hintRate ? `1 in ${Math.round(1 / settings.hintRate)}` : 'never'} /></span>
          </Setting>
          <HintTuning />
          <Setting title="Rot cards" note="How many unhandled captures come back each time you open the prompt. A few, never the whole pile.">
            <Slider className="w-40" min={0} max={6} step={1} value={[settings.rotCount]} onValueChange={([rotCount]) => set({ rotCount })} onValueCommit={() => chime('tap')} />
            <span className="w-16 text-right tabular-nums"><Rolling text={settings.rotCount} /></span>
          </Setting>
          <Setting title="Quiet hours" note="Nothing private, and no capture you have not dealt with yet, comes up unasked. Your pins stay; search and lists still show everything.">
            <Input type="time" className={field} value={settings.quietStart} onChange={(event) => set({ quietStart: event.target.value })} />
            <span className="text-muted-foreground">to</span>
            <Input type="time" className={field} value={settings.quietEnd} onChange={(event) => set({ quietEnd: event.target.value })} />
          </Setting>
          <Setting title="Safe mode" note="Nothing comes up unasked at all: no hints, rot cards or pins. For screen shares. ⌥⌘S from anywhere.">
            <Switch checked={settings.safeMode} onCheckedChange={(safeMode) => {
              set({ safeMode })
              toast(safeMode ? 'Safe mode: nothing will surface unasked' : 'Safe mode off')
            }} />
          </Setting>
        </Group>

        <Group title="Review">
          <Setting title="How much to remember" note="The share of tested items you want to still know when they come back. Higher means more reviews; 90% is where most land.">
            <Slider className="w-40" min={0.8} max={0.97} step={0.01} value={[settings.retention]} onValueChange={([retention]) => set({ retention })} onValueCommit={() => chime('tap')} />
            <span className="w-10 text-right tabular-nums"><Rolling text={`${Math.round(settings.retention * 100)}%`} /></span>
          </Setting>
          <Setting title="Daily limits" note="New items and reviews a day. A cap keeps the queue finishable; an uncapped one becomes a wall you stop opening.">
            <Input type="number" min={0} className={`${field} w-16`} value={settings.newPerDay} onChange={(event) => set({ newPerDay: Number(event.target.value) })} /> new
            <Input type="number" min={0} className={`${field} w-16`} value={settings.reviewsPerDay} onChange={(event) => set({ reviewsPerDay: Number(event.target.value) })} /> reviews
          </Setting>
          <CapTuning />
        </Group>

        <Group title="Tasks">
          <Setting title="When a task's time comes" note="Pull: it rises to the top of Today. Quiet: the menu bar counts it too. Alerts: a notification, once, at the time.">
            <div className="flex rounded-md border p-0.5">
              {(['pull', 'quiet', 'alerts'] as const).map((level, index) => (
                <button
                  key={level}
                  type="button"
                  onMouseEnter={() => step(index)}
                  onClick={() => {
                    chime('settled')
                    set({ notify: level })
                  }}
                  className={`rounded-sm px-2.5 py-1 capitalize transition-colors ${settings.notify === level ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {level}
                </button>
              ))}
            </div>
          </Setting>
        </Group>

        <Group title="Your data">
          <Setting title="Export everything" note="All of it as JSON and Markdown, in a folder you choose: yours to read without this app. Importing is in the menu bar icon.">
            <Button variant="outline" size="sm" onClick={() => void beaming(vigil.exportAll()).then((folder) => {
              if (!folder) return
              chime('send')
              toast(`Exported to ${folder.split('/').slice(-2).join('/')}`)
            })}>
              <Download className="size-4" /> Export
            </Button>
          </Setting>
        </Group>
      </div>
    </Page>
  )
}

/** Said out loud when the app has lowered the new-item cap itself, and why. */
function CapTuning(): React.JSX.Element | null {
  const tuning = useLive(vigil.reviewTuning, null as Awaited<ReturnType<typeof vigil.reviewTuning>> | null)
  if (!tuning?.tuned) return null
  return (
    <p className="px-4 py-3 text-meta leading-relaxed text-[var(--tt-color-text-orange)]">
      {tuning.behind} reviews are more than a day overdue, more than a day's limit, so new items are halved to {tuning.cap} a day. It goes back up once the queue is being finished.
    </p>
  )
}

/** Said out loud when the app has turned the hints down itself, and why. */
function HintTuning(): React.JSX.Element | null {
  const tuning = useLive(vigil.hintRate, null as Awaited<ReturnType<typeof vigil.hintRate>> | null)
  if (!tuning?.tuned) return null
  return (
    <p className="px-4 py-3 text-meta leading-relaxed text-[var(--tt-color-text-orange)]">
      Only {tuning.stopped} of the last {tuning.shown} hints stopped you, so half as many are being shown: 1 in {Math.round(1 / tuning.rate)}. It goes back up when they start landing again.
    </p>
  )
}
