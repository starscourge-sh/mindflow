import type { ReactNode } from 'react'
import { Download } from 'lucide-react'

import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { useLive, vigil, type Settings } from '@/lib/vigil'
import { Page, toast } from './ui'

function Setting({ title, children, note }: { title: string; children: ReactNode; note: string }): React.JSX.Element {
  return (
    <div className="flex items-start justify-between gap-8 border-b py-5">
      <div>
        <div className="font-medium">{title}</div>
        <p className="mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">{note}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}

const field = 'rounded-md border bg-transparent px-2 py-1 tabular-nums outline-none focus:border-ring'

/**
 * The settings. Each one is a value read in one place, and each says what it
 * changes in a sentence, so a setting never needs looking up.
 */
export function SettingsView(): React.JSX.Element {
  const settings = useLive(vigil.settings, null as Settings | null)
  if (!settings) return <Page title="Settings"><div /></Page>
  const set = (patch: Partial<Settings>): void => void vigil.setSettings(patch)

  return (
    <Page title="Settings">
      <div className="mx-auto max-w-2xl px-6 pb-16">
        <Setting title="Full width" note="Off, pages sit in a centred column the way Notion lays them out, with room either side. On, the writing runs edge to edge.">
          <Switch checked={settings.fullWidth} onCheckedChange={(fullWidth) => set({ fullWidth })} />
        </Setting>
        <Setting title="Sounds" note="A small sound when you finish a task, promote a capture or grade a review. Always off if your system asks for reduced motion.">
          <Switch checked={settings.sounds} onCheckedChange={(sounds) => set({ sounds })} />
        </Setting>
        <Setting title="Hints" note="How often the prompt shows you something you kept. Rare is the point: a hint every time is one you learn to ignore.">
          <Slider className="w-40" min={0} max={0.5} step={0.05} value={[settings.hintRate]} onValueChange={([hintRate]) => set({ hintRate })} />
          <span className="w-16 text-right tabular-nums">{settings.hintRate ? `1 in ${Math.round(1 / settings.hintRate)}` : 'never'}</span>
        </Setting>
        <Setting title="Rot cards" note="How many unhandled captures come back each time you open the prompt. A few, never the whole pile.">
          <Slider className="w-40" min={0} max={6} step={1} value={[settings.rotCount]} onValueChange={([rotCount]) => set({ rotCount })} />
          <span className="w-16 text-right tabular-nums">{settings.rotCount}</span>
        </Setting>
        <Setting title="How much to remember" note="The share of tested items you want to still know when they come back. Higher means more reviews; 90% is where most people land.">
          <Slider className="w-40" min={0.8} max={0.97} step={0.01} value={[settings.retention]} onValueChange={([retention]) => set({ retention })} />
          <span className="w-10 text-right tabular-nums">{Math.round(settings.retention * 100)}%</span>
        </Setting>
        <Setting title="Daily limits" note="New items and reviews a day. A cap is what keeps the queue finishable; an uncapped one becomes a wall you stop opening.">
          <input type="number" min={0} className={`${field} w-16`} value={settings.newPerDay} onChange={(event) => set({ newPerDay: Number(event.target.value) })} /> new
          <input type="number" min={0} className={`${field} w-16`} value={settings.reviewsPerDay} onChange={(event) => set({ reviewsPerDay: Number(event.target.value) })} /> reviews
        </Setting>
        <Setting title="Quiet hours" note="A window in which nothing marked private comes up unasked. Search and lists still show everything.">
          <input type="time" className={field} value={settings.quietStart} onChange={(event) => set({ quietStart: event.target.value })} />
          <span className="text-muted-foreground">to</span>
          <input type="time" className={field} value={settings.quietEnd} onChange={(event) => set({ quietEnd: event.target.value })} />
        </Setting>
        <Setting title="When a task's time comes" note="Pull: it rises to the top of Today. Quiet: the menu bar counts it too. Alerts: a notification over your work, once, at the time. Alerts train you to dismiss them, so the default is quiet.">
          <div className="flex rounded-md border p-0.5">
            {(['pull', 'quiet', 'alerts'] as const).map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => set({ notify: level })}
                className={`rounded px-2.5 py-1 capitalize transition-colors ${settings.notify === level ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {level}
              </button>
            ))}
          </div>
        </Setting>
        <Setting title="Safe mode" note="Nothing comes up unasked at all: no hints, rot cards or pins. For screen shares. ⌥⌘S anywhere in the app.">
          <Switch checked={settings.safeMode} onCheckedChange={(safeMode) => set({ safeMode })} />
        </Setting>
        <Setting title="Your data" note="Everything as JSON and Markdown, in a folder you choose. No lock-in: it is all yours to read without this app. Importing is in the menu bar icon.">
          <button
            type="button"
            className="flex items-center gap-2 rounded-md border px-3 py-1.5 hover:bg-accent"
            onClick={() => void vigil.exportAll().then((folder) => folder && toast(`Exported to ${folder.split('/').slice(-2).join('/')}`))}
          >
            <Download className="size-4" /> Export everything
          </button>
        </Setting>
      </div>
    </Page>
  )
}
