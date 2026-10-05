import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { PACKS, chime, click, soundOn, step } from '@/lib/sound'
import { NOTE_FONTS } from '@/lib/editor-setup'
import { Brain, Download, HardDrive, Inbox, Keyboard, LifeBuoy, ListChecks, Palette, PenLine, Search as SearchIcon, Sparkles, Volume2, X, type LucideIcon } from 'lucide-react'
import { allThemes, applyTheme, customThemes, frosted, importTheme, removeTheme, restoreTheme, setFrosted, themeName } from '@/lib/theme'
import { Marked, ShortcutList } from './shortcut-sheet'
import { Swatch } from '../theme/theme-picker'

import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { ThemePicker } from '../theme/theme-picker'
import { Switch } from '@/components/ui/switch'
import { useLive, vigil, type Settings } from '@/lib/vigil'
import { SoundPacks } from './sound-packs'
import { FontPicker, TextSize } from './font-picker'
import { BackToTop, Kbd, Rolling, Tip, beaming, refuse, toast, useSmooth } from './ui'
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
function Setting({ title, children, note, below, keywords = '' }: {
  title: string
  children?: ReactNode
  note: string
  below?: ReactNode
  /** More words it is found by: the names of what it offers, a theme's or a font's. */
  keywords?: string
}): React.JSX.Element | null {
  const { query, all } = useContext(Query)
  if (!all && !matches(query, title, note, keywords)) return null
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

/**
 * The sections down the left, the way Raycast's settings list them: a small
 * coloured tile each, one section on the right at a time. A Group names its
 * section; one whose section is not listed here would never show, so a new
 * section goes in this list too.
 */
const SECTIONS: { title: string; icon: LucideIcon; tile: string }[] = [
  { title: 'Appearance', icon: Palette, tile: 'bg-violet-500' },
  { title: 'Writing', icon: PenLine, tile: 'bg-orange-500' },
  { title: 'Capturing', icon: Inbox, tile: 'bg-sky-500' },
  { title: 'What comes back to you', icon: Sparkles, tile: 'bg-amber-500' },
  { title: 'Review', icon: Brain, tile: 'bg-pink-500' },
  { title: 'Tasks', icon: ListChecks, tile: 'bg-emerald-500' },
  { title: 'Sound', icon: Volume2, tile: 'bg-red-500' },
  { title: 'Your data', icon: HardDrive, tile: 'bg-slate-500' },
  { title: 'Help', icon: LifeBuoy, tile: 'bg-teal-500' },
  { title: 'Shortcuts', icon: Keyboard, tile: 'bg-indigo-500' }
]
/** The section on show, unless a search shows every section's matches. */
const Shown = createContext('')

/** Settings that belong together, in one rounded island under a heading. Gone while a search leaves none of them, or while another section is on show. */
function Group({ title, section = title, children }: { title: string; section?: string; children: ReactNode }): React.JSX.Element | null {
  const { query } = useContext(Query)
  const shown = useContext(Shown)
  if (!query.trim() && section !== shown) return null
  return (
    <Query.Provider value={{ query, all: !!query.trim() && matches(query, title, section) }}>
      <section className="mt-6 first:mt-0 [&:not(:has([data-setting]))]:hidden">
        {/* Searching, rows from every section show at once, so each island says whose it is. */}
        <h2 className="mb-2 px-1 text-body font-semibold text-foreground">{query.trim() && <span className="font-normal text-muted-foreground">{section} · </span>}<Marked text={title} query={query} /></h2>
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
  // One section at a time, the last one you looked at, as Raycast keeps it.
  const [section, setSectionState] = useState(() => {
    try {
      const kept = localStorage.getItem('settings:section')
      return SECTIONS.some((one) => one.title === kept) ? kept! : SECTIONS[0].title
    } catch {
      return SECTIONS[0].title
    }
  })
  const setSection = (title: string): void => {
    if (title === section) return
    // Each section has its own note, so moving down the list is a scale.
    step(SECTIONS.findIndex((one) => one.title === title))
    setSectionState(title)
    if (scroller) scroller.scrollTop = 0
    try {
      localStorage.setItem('settings:section', title)
    } catch {
      // Not remembered, but still shown.
    }
  }
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null)
  useSmooth(scroller)
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const active = document.activeElement as HTMLElement | null
      // In the section list, j and k move between sections instead.
      if (event.metaKey || event.ctrlKey || event.altKey || ['INPUT', 'TEXTAREA'].includes(active?.tagName ?? '') || active?.closest('[data-sections]')) return
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
  if (!settings) return <section className="flex-1" />
  const set = (patch: Partial<Settings>): void => void vigil.setSettings(patch)
  const searching = !!query.trim()

  // The section list and the search over it on the left, the section on the
  // right. Under 44rem of page the list folds to its tiles, like the main
  // sidebar, and the search moves over the settings. Not in the page column,
  // so Full width changes nothing here.
  return (
    <section className={`grid min-h-0 min-w-0 flex-1 grid-cols-[3.5rem_1fr] grid-rows-[auto_1fr] @[44rem]/page:grid-cols-[14rem_1fr]`}>
      <nav
        data-sections
        aria-label="Settings sections"
        className={`col-start-1 row-span-2 row-start-1 flex flex-col gap-px overflow-y-auto px-2 pt-4 pb-4 @[44rem]/page:row-span-1 @[44rem]/page:row-start-2 @[44rem]/page:pt-0`}
        onKeyDown={(event) => {
          const by = { ArrowDown: 1, j: 1, ArrowUp: -1, k: -1 }[event.key]
          if (!by || event.metaKey || event.ctrlKey || event.altKey) return
          event.preventDefault()
          const at = SECTIONS.findIndex((one) => one.title === section)
          const next = SECTIONS[Math.max(0, Math.min(SECTIONS.length - 1, at + by))]
          setSection(next.title)
          event.currentTarget.querySelector<HTMLElement>(`[data-section="${next.title}"]`)?.focus()
        }}
      >
        {SECTIONS.map((one) => (
          <Tip key={one.title} label={one.title}>
            <button
              type="button"
              data-section={one.title}
              aria-current={!searching && section === one.title ? 'page' : undefined}
              onClick={() => {
                setSection(one.title)
                if (searching) (chime('fold'), setQuery(''))
              }}
              className={`flex items-center justify-center gap-2.5 rounded-md p-1.5 text-left text-body transition-colors @[44rem]/page:justify-start @[44rem]/page:px-2 ${!searching && section === one.title ? 'bg-accent text-foreground' : 'text-foreground/80 hover:bg-accent/60'}`}
            >
              <span className={`flex size-5 shrink-0 items-center justify-center rounded-md text-white ${one.tile}`}><one.icon className="size-3.5" /></span>
              <span className={`hidden truncate @[44rem]/page:inline`}>{one.title}</span>
            </button>
          </Tip>
        ))}
      </nav>
      <label className={`col-start-2 row-start-1 mx-5 mt-4 mb-2 flex items-center gap-2 rounded-lg border bg-accent/25 px-3 py-1.5 text-muted-foreground focus-within:border-ring @[44rem]/page:col-start-1 @[44rem]/page:mx-2`}>
        <SearchIcon className="size-4 shrink-0" />
        <input
          value={query}
          placeholder="Search…"
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
      <div className={`relative col-start-2 row-start-2 flex min-h-0 min-w-0 flex-col @[44rem]/page:row-span-2 @[44rem]/page:row-start-1`}>
      <div ref={setScroller} className="min-h-0 flex-1 overflow-y-auto">
      <Query.Provider value={{ query, all: false }}>
      <Shown.Provider value={section}>
      <div ref={page} className="w-full max-w-2xl px-6 pt-4 pb-16 [&:has([data-setting])>[data-none]]:hidden">
        {!searching && <h1 className="px-1 text-lg font-semibold text-foreground">{section}</h1>}
        <p data-none className="px-1 text-body text-muted-foreground">Nothing here matches “{query}”. Try fewer letters, or what it changes.</p>
        <Group section="Appearance" title="Theme">
          <Setting title="Theme" note="The colours of every window: the prompt and this one change together. Point at one to try it, click to keep it." keywords={allThemes().map(themeName).join(' ')}>
            <ThemePicker className="-mr-2 h-8 gap-1.5 rounded-full px-2 hover:bg-accent" />
          </Setting>
          <ImportedThemes />
          <Frosted />
        </Group>
        <Group section="Appearance" title="Layout">
          <Setting title="Full width" note="Off, pages sit in a centred column the way Notion lays them out. On, the writing runs edge to edge.">
            <Switch checked={settings.fullWidth} onCheckedChange={(fullWidth) => set({ fullWidth })} />
          </Setting>
          <Setting title="Motion" note="Things ease in and out: a capture leaving, a card arriving, a page sliding over. Off, everything appears at once.">
            <Switch checked={settings.motion} onCheckedChange={(motion) => set({ motion })} />
          </Setting>
          <Setting title="Pictures in lists" note="A note with a picture in it shows the first one, small, at the end of its row and on its card.">
            <Switch checked={settings.thumbnails !== false} onCheckedChange={(thumbnails) => set({ thumbnails })} />
          </Setting>
        </Group>
        <Group section="Appearance" title="Text">
          <Setting title="Note font" note="What notes are written in, in the box and here: Fraunces, a few others, or any font on this Mac. OpenDyslexic is easier for some to read." below={<Sample />} keywords={NOTE_FONTS.map((font) => font.label).join(' ')}>
            <FontPicker value={settings.noteFont} />
          </Setting>
          <Setting title="Text size" note="How big the words in notes are. ⌘+ and ⌘− change it from any note, ⌘0 puts it back." below={<Sample />}>
            <TextSize value={settings.textSize} />
          </Setting>
        </Group>

        <Group section="Writing" title="As you write">
          <Setting title="Math as you type" note="End a line with = and its answer shows after it; Tab writes it in. lunch = 25 names a number for the lines below. Units and money work too: 5 km in mi, $40 * 3 in EUR.">
            <Switch checked={settings.calc} onCheckedChange={(calc) => set({ calc })} />
          </Setting>
          <Setting title="Title in the top bar" note="Once a note's first line scrolls out of sight, it shows faintly at the top of the box, so you know what you are reading.">
            <Switch checked={settings.topTitle} onCheckedChange={(topTitle) => set({ topTitle })} />
          </Setting>
        </Group>

        <Group section="Sound" title="What you hear">
          <Setting title="Sounds" note="A small click as you point at things and scroll, and a sound for each thing you do.">
            <Switch checked={settings.sounds} onCheckedChange={(sounds) => {
              soundOn(sounds)
              set({ sounds })
            }} />
          </Setting>
          {/* Shown with sounds off too, greyed, so a search still finds them. */}
          <Setting title="Volume" note="How loud every sound is, from silent to as loud as they were made.">
            <Slider disabled={!settings.sounds} className="w-40" min={0} max={1} step={0.05} value={[settings.volume]} onValueChange={([volume]) => set({ volume })} onValueCommit={() => chime('tap')} />
          </Setting>
          <Setting
            title="Sound pack"
            note="Nine characters for the same sounds. Point at one to hear it; click it to make it yours. The pieces on the right always play the one you have."
            keywords={Object.values(PACKS).map((one) => `${one.label} ${one.feel}`).join(' ')}
            below={<div inert={!settings.sounds} className={settings.sounds ? '' : 'opacity-50'}><SoundPacks chosen={settings.soundPack} /></div>}
          />
        </Group>

        <Group section="What comes back to you" title="Hints and cards">
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
        </Group>
        <Group section="What comes back to you" title="Once a week">
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
        </Group>
        <Group section="What comes back to you" title="Keeping it quiet">
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

        <Group section="Review" title="Remembering">
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
        <Group section="Review" title="Exams">
          <Setting title="Exam nudges" note="A tag with an exam date (set on its page in Tags) says so in the prompt when its cards fall behind, once a day at most, never in quiet hours.">
            <Switch checked={settings.examNudges} onCheckedChange={(examNudges) => set({ examNudges })} />
          </Setting>
        </Group>

        <Group section="Tasks" title="Reminders">
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

        <Group section="Capturing" title="With each capture">
          <Setting title="Weather" note="Each capture keeps the weather outside when you caught it, like 12°C, light rain. It asks wttr.in, which guesses your town from your connection: no account and no location permission. Left out when offline.">
            <Switch checked={settings.weather} onCheckedChange={(weather) => set({ weather })} />
          </Setting>
        </Group>

        <Group section="Help" title="Getting started">
          <Setting title="Tour" note="The two-minute walk through the box, the inbox's exits, rot cards and hints that played the first time.">
            <Button variant="outline" size="sm" onClick={() => window.dispatchEvent(new CustomEvent('vigil:tour'))}>Play it again</Button>
          </Setting>
          <Setting title="Shortcut sheet" note="Every shortcut over the window you are in, whenever you are not typing.">
            <Kbd>?</Kbd>
          </Setting>
        </Group>

        <Group section="Your data" title="Export and import">
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

        <Group section="Shortcuts" title="Every shortcut">
          <ShortcutRows />
        </Group>
      </div>
      </Shown.Provider>
      </Query.Provider>
      </div>
      <BackToTop target={scroller} />
      </div>
    </section>
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

/**
 * A line in the note font at the note size, under those two settings: both
 * only change notes, so without it a pick would show nothing here.
 */
function Sample(): React.JSX.Element {
  return (
    <p className="mt-2 truncate text-foreground" style={{ fontFamily: 'var(--mf-font, "Fraunces Variable", Georgia, serif)', fontSize: 'calc(1rem * var(--mf-text-scale, 1))' }}>
      The quick brown fox jumps over the lazy dog.
    </p>
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
