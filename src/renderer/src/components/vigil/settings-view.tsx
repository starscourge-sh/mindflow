import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { chime, click, soundOn, step } from '@/lib/sound'
import { Download, Search as SearchIcon, X } from 'lucide-react'
import { applyTheme, customThemes, frosted, importTheme, removeTheme, restoreTheme, setFrosted, themeName } from '@/lib/theme'
import { Marked, ShortcutList } from './shortcut-sheet'
import { Swatch } from '../theme/theme-picker'

import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { ThemePicker } from '../theme/theme-picker'
import { Switch } from '@/components/ui/switch'
import { useLive, vigil, type Settings } from '@/lib/vigil'
import { SoundPacks } from './sound-packs'
import { FontPicker, TextSize } from './font-picker'
import { Kbd, Page, Rolling, beaming, refuse, toast } from './ui'
import { Button } from '@/components/ui/button'

/**
 * What the search at the top asks for, and whether the island a row sits in
 * matched it by its own heading (then every row in it shows).
 */
const Query = createContext({ query: '', all: false })
const matches = (query: string, ...texts: string[]): boolean => !query.trim() || texts.join(' ').toLowerCase().includes(query.trim().toLowerCase())

/**
 * One setting, as a row in an island the way System Settings groups them: its
 * name and what it changes on the left, the control on the right. Anything
 * set under it (`below`) takes the full width. Searched for and not matching,
 * it is not there at all.
 */
function Setting({ title, children, note, below }: { title: string; children?: ReactNode; note: string; below?: ReactNode }): React.JSX.Element | null {
  const { query, all } = useContext(Query)
  if (!all && !matches(query, title, note)) return null
  const shown = all ? '' : query
  return (
    <div data-setting className="px-4 py-3">
      <div className="flex items-center justify-between gap-6">
        <div className="min-w-0">
          <div className="text-body font-medium text-foreground"><Marked text={title} query={shown} /></div>
          <p className="mt-0.5 max-w-md text-meta leading-relaxed text-muted-foreground"><Marked text={note} query={shown} /></p>
        </div>
        {children && <div className="flex shrink-0 items-center gap-2 text-control">{children}</div>}
      </div>
      {below}
    </div>
  )
}

/** Settings that belong together, in one rounded island under a heading. Gone while a search leaves none of them. */
function Group({ title, children }: { title: string; children: ReactNode }): React.JSX.Element {
  const { query } = useContext(Query)
  return (
    <Query.Provider value={{ query, all: !!query.trim() && matches(query, title) }}>
      <section className="mt-6 first:mt-0 [&:not(:has([data-setting]))]:hidden">
        <h2 className="mb-2 px-1 text-body font-semibold text-foreground"><Marked text={title} query={query} /></h2>
        <div className="divide-y divide-border/60 overflow-hidden rounded-xl border bg-accent/25">{children}</div>
      </section>
    </Query.Provider>
  )
}

const field = 'h-8 tabular-nums'

/**
 * The settings. Each one is a value read in one place, and each says what it
 * changes in a sentence, so a setting never needs looking up.
 */
export function SettingsView(): React.JSX.Element {
  const settings = useLive(vigil.settings, null as Settings | null)
  // The search at the top: rows that do not match go, and the words are marked.
  const [query, setQuery] = useState('')
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
      <Query.Provider value={{ query, all: false }}>
      <div ref={page} className="mx-auto w-full max-w-2xl px-5 pt-5 pb-16 [&:has([data-setting])>[data-none]]:hidden">
        <label className="mb-6 flex items-center gap-2 rounded-lg border bg-accent/25 px-3 py-2 text-muted-foreground focus-within:border-ring">
          <SearchIcon className="size-4 shrink-0" />
          <input
            value={query}
            placeholder="Search settings and shortcuts…"
            className="min-w-0 flex-1 bg-transparent text-body text-foreground outline-none"
            onChange={(event) => {
              // One ping as a search starts, then a soft tick for each letter.
              if (!query && event.target.value) chime('search')
              else click('soft')
              setQuery(event.target.value)
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Escape' || !query) return
              event.preventDefault()
              chime('fold')
              setQuery('')
            }}
          />
          {query && <Kbd>Esc</Kbd>}
        </label>
        <p data-none className="px-1 text-body text-muted-foreground">Nothing here matches “{query}”. Try fewer letters, or what it changes.</p>
        <Group title="Appearance">
          <Setting title="Theme" note="The colours of every window: the prompt and this one change together. Point at one to try it, click to keep it.">
            <ThemePicker className="-mr-2 h-8 gap-1.5 rounded-full px-2 hover:bg-accent" />
          </Setting>
          <ImportedThemes />
          <Frosted />
          <Setting title="Full width" note="Off, pages sit in a centred column the way Notion lays them out. On, the writing runs edge to edge.">
            <Switch checked={settings.fullWidth} onCheckedChange={(fullWidth) => set({ fullWidth })} />
          </Setting>
          <Setting title="Motion" note="Things ease in and out: a capture leaving, a card arriving, a page sliding over. Off, everything appears at once.">
            <Switch checked={settings.motion} onCheckedChange={(motion) => set({ motion })} />
          </Setting>
          <Setting title="Pictures in lists" note="A note with a picture in it shows the first one, small, at the end of its row and on its card.">
            <Switch checked={settings.thumbnails !== false} onCheckedChange={(thumbnails) => set({ thumbnails })} />
          </Setting>
          <Setting title="Note font" note="What notes are written in, in the box and here: Fraunces, a few others, or any font on this Mac. OpenDyslexic is easier for some to read.">
            <FontPicker value={settings.noteFont} />
          </Setting>
          <Setting title="Text size" note="How big the words in notes are. ⌘+ and ⌘− change it from any note, ⌘0 puts it back.">
            <TextSize value={settings.textSize} />
          </Setting>
        </Group>

        <Group title="Writing">
          <Setting title="Math as you type" note="End a line with = and its answer shows after it; Tab writes it in. lunch = 25 names a number for the lines below. Units and money work too: 5 km in mi, $40 * 3 in EUR.">
            <Switch checked={settings.calc} onCheckedChange={(calc) => set({ calc })} />
          </Setting>
          <Setting title="Title in the top bar" note="Once a note's first line scrolls out of sight, it shows faintly at the top of the box, so you know what you are reading.">
            <Switch checked={settings.topTitle} onCheckedChange={(topTitle) => set({ topTitle })} />
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
            <Setting title="Sound pack" note="Nine characters for the same sounds. Point at one to hear it; click it to make it yours. The pieces on the right always play the one you have." below={<SoundPacks chosen={settings.soundPack} />} />
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
          <Setting title="Memories" note="Some hints are memories, the way Photos brings them: a year ago today, this week in an earlier year, more from one source. Each says which it is.">
            <Switch checked={settings.memories} onCheckedChange={(memories) => set({ memories })} />
          </Setting>
          <Setting title="Weekly review" note="Once a week, on the day you pick, the prompt suggests walking the inbox through its exits. Never in quiet hours.">
            {settings.weeklyReview && (
              <div className="flex rounded-md border p-0.5">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((letter, day) => (
                  <button
                    key={day}
                    type="button"
                    aria-label={new Date(2023, 0, 1 + day).toLocaleDateString('en', { weekday: 'long' })}
                    onMouseEnter={() => step(day)}
                    onClick={() => {
                      chime('settled')
                      set({ weeklyDay: day })
                    }}
                    className={`w-6 rounded-sm py-1 transition-colors ${settings.weeklyDay === day ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    {letter}
                  </button>
                ))}
              </div>
            )}
            <Switch checked={settings.weeklyReview} onCheckedChange={(weeklyReview) => set({ weeklyReview })} />
          </Setting>
          <Setting title="Quiet hours" note="Nothing private, and no capture you have not dealt with yet, comes up unasked; pins stay, except private ones and unhandled captures. Search and lists still show everything.">
            <Input type="time" className={field} value={settings.quietStart} onChange={(event) => set({ quietStart: event.target.value })} />
            <span className="text-muted-foreground">to</span>
            <Input type="time" className={field} value={settings.quietEnd} onChange={(event) => set({ quietEnd: event.target.value })} />
          </Setting>
          <Setting title="Safe mode" note="Nothing comes up unasked at all: no hints, rot cards or pins. For screen shares. ⌥⌘S from anywhere.">
            <Switch checked={settings.safeMode} onCheckedChange={(safeMode) => {
              set({ safeMode })
              toast(safeMode ? 'Safe mode: no hints, rot cards or pins come up' : 'Safe mode off')
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
          <Setting title="Exam nudges" note="A tag with an exam date (set on its page in Tags) says so in the prompt when its cards fall behind, once a day at most, never in quiet hours.">
            <Switch checked={settings.examNudges} onCheckedChange={(examNudges) => set({ examNudges })} />
          </Setting>
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

        <Group title="Capturing">
          <Setting title="Weather" note="Each capture keeps the weather outside when you caught it, like 12°C, light rain. It asks wttr.in, which guesses your town from your connection: no account and no location permission. Left out when offline.">
            <Switch checked={settings.weather} onCheckedChange={(weather) => set({ weather })} />
          </Setting>
        </Group>

        <Group title="Help">
          <Setting title="Tour" note="The two-minute walk through the box, the inbox's exits, rot cards and hints that played the first time.">
            <Button variant="outline" size="sm" onClick={() => window.dispatchEvent(new CustomEvent('vigil:tour'))}>Play it again</Button>
          </Setting>
          <Setting title="Shortcut sheet" note="Every shortcut over the window you are in, whenever you are not typing.">
            <Kbd>?</Kbd>
          </Setting>
        </Group>

        <Group title="Your data">
          <Setting title="Export everything" note="All of it as JSON and Markdown, in a folder you choose: yours to read without this app.">
            <Button variant="outline" size="sm" onClick={() => void beaming(vigil.exportAll()).then((folder) => {
              if (!folder) return
              chime('send')
              toast(`Exported to ${folder.split('/').slice(-2).join('/')}`)
            })}>
              <Download className="size-4" /> Export
            </Button>
          </Setting>
          <Setting title="Import" note="Notes from an Obsidian vault; highlights from Readwise or Kindle; Markdown, bookmarks or Anki cards. The menu bar icon has the same.">
            <Button variant="outline" size="sm" onClick={() => (chime('open'), void window.api.importFrom('vault'))}>Obsidian…</Button>
            <Button variant="outline" size="sm" onClick={() => (chime('open'), void window.api.importFrom('files'))}>Files…</Button>
          </Setting>
        </Group>

        <Group title="Shortcuts">
          <ShortcutRows />
        </Group>
      </div>
      </Query.Provider>
    </Page>
  )
}

/** The shortcuts, as an island: those matching the search, or all of them. */
function ShortcutRows(): React.JSX.Element {
  const { query, all } = useContext(Query)
  return <div className="px-3 pt-3"><ShortcutList query={all ? '' : query} quiet /></div>
}

/**
 * Themes from a file: JSON of the colours (bg, ink, accent and the nine hues,
 * or CSS variables by name) or a CSS file of variables. Each joins the theme
 * list, and can be taken out again here.
 */
function ImportedThemes(): React.JSX.Element {
  const [themes, setThemes] = useState(customThemes)
  const file = useRef<HTMLInputElement>(null)
  const refresh = (): void => setThemes(customThemes())
  return (
    <Setting
      title="Imported themes"
      note="A theme from a file: JSON with bg, ink and accent (and the nine hues if you like), or CSS variables. It joins the list above."
      below={themes.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {themes.map((one) => (
            <span key={one.id} className="flex items-center gap-1.5 rounded-full border py-0.5 pr-1 pl-2 text-control">
              <Swatch theme={one.id} />
              {themeName(one.id)}
              <button type="button" aria-label={`Remove ${one.name}`} className="rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => {
                const gone = removeTheme(one.id)
                refresh()
                chime('away')
                if (gone) toast(`Removed ${gone.name}`, () => (restoreTheme(gone), refresh()))
              }}>
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    >
      <input ref={file} type="file" accept=".json,.css,application/json,text/css" className="hidden" onChange={(event) => {
        const picked = event.target.files?.[0]
        event.target.value = ''
        if (!picked) return
        void picked.text().then((text) => {
          const made = importTheme(picked.name, text)
          if (typeof made === 'string') return refuse(made)
          refresh()
          applyTheme(made.id)
          chime('settled')
          toast(`Imported ${made.name}, and wearing it`, () => (removeTheme(made.id), refresh()))
        })
      }} />
      <Button variant="outline" size="sm" onClick={() => file.current?.click()}>Import a theme…</Button>
    </Setting>
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

/** The frosted, see-through window, or a solid one in the theme's colour. */
function Frosted(): React.JSX.Element {
  const [on, setOn] = useState(frosted)
  return (
    <Setting title="See-through windows" note="On, the desktop shows through every window, frosted. Off, windows are solid in your theme's colour.">
      <Switch
        checked={on}
        onCheckedChange={(next) => {
          setFrosted(next)
          setOn(next)
          chime(next ? 'on' : 'off')
        }}
      />
    </Setting>
  )
}
