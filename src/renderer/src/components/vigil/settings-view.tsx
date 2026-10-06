import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { PACKS, chime, click, soundOn, step } from '@/lib/sound'
import { NOTE_FONTS } from '@/lib/editor-setup'
import { Brain, FolderPlus, HardDrive, Inbox, Keyboard, LifeBuoy, ListChecks, Mountain, Palette, PenLine, Search as SearchIcon, Sparkles, Volume2, X, type LucideIcon } from 'lucide-react'
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
import { BackToTop, Kbd, Rolling, Tip, refuse, toast, useSmooth } from './ui'
import { Button } from '@/components/ui/button'
import { Orb } from './orb'
import { AliveIcon } from '@/components/ui/alive-icon'
import DownloadIcon from '@/components/ui/download-icon'
import UploadIcon from '@/components/ui/upload-icon'
import { weekdayName } from '../../../../main/dates'

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
 * The sections down the left, the way Raycast's settings list them, one on
 * the right at a time. Each icon is drawn like the main sidebar's: the
 * theme's own hue, softened until it is the one you are on. A Group names its
 * section; one whose section is not listed here would never show, so a new
 * section goes in this list too.
 */
const SECTIONS: { title: string; icon: LucideIcon; tint: string }[] = [
  { title: 'Appearance', icon: Palette, tint: 'purple' },
  { title: 'Scenery', icon: Mountain, tint: 'green' },
  { title: 'Writing', icon: PenLine, tint: 'orange' },
  { title: 'Capturing', icon: Inbox, tint: 'blue' },
  { title: 'What comes back to you', icon: Sparkles, tint: 'yellow' },
  { title: 'Review', icon: Brain, tint: 'pink' },
  { title: 'Tasks', icon: ListChecks, tint: 'green' },
  { title: 'Sound', icon: Volume2, tint: 'red' },
  { title: 'Your data', icon: HardDrive, tint: 'gray' },
  { title: 'Help', icon: LifeBuoy, tint: 'blue' },
  { title: 'Shortcuts', icon: Keyboard, tint: 'purple' }
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
        <div className="mf-island divide-y divide-border/60 overflow-hidden rounded-xl border bg-accent/25">{children}</div>
      </section>
    </Query.Provider>
  )
}

const field = 'h-8 tabular-nums'

/**
 * A slider that holds its own value while it moves and saves a moment after:
 * read back from the saved settings, quick presses arrived before the last
 * save had, and each one started from the old value.
 */
function SettingSlider({ value, onSave, ...props }: { value: number; onSave: (value: number) => void; min: number; max: number; step: number; disabled?: boolean }): React.JSX.Element {
  const [held, setHeld] = useState<number | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  // Let go once the save has come back, so it never flicks to the old value.
  useEffect(() => void (held === value && setHeld(null)), [value, held])
  return (
    <Slider
      {...props}
      className="w-40"
      value={[held ?? value]}
      onValueChange={([next]) => {
        setHeld(next)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => onSave(next), 250)
      }}
      onValueCommit={() => chime('tap')}
    />
  )
}

/** A number box that saves a number, never the empty field you pass through on the way to one. */
function NumberSetting({ value, onSave }: { value: number; onSave: (value: number) => void }): React.JSX.Element {
  const [text, setText] = useState(String(value))
  // While you type, the box is yours; a save coming back must not undo a key.
  const typing = useRef(false)
  useEffect(() => void (!typing.current && setText(String(value))), [value])
  const valid = (raw: string): boolean => raw.trim() !== '' && Number.isFinite(Number(raw)) && Number(raw) >= 0
  return (
    <Input
      type="number"
      min={0}
      className={`${field} w-16`}
      value={text}
      onChange={(event) => {
        setText(event.target.value)
        if (valid(event.target.value)) onSave(Number(event.target.value))
      }}
      // Left empty, it goes back to what is saved.
      onFocus={() => void (typing.current = true)}
      onBlur={() => {
        typing.current = false
        if (!valid(text)) setText(String(value))
      }}
    />
  )
}

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
      // Only what you can see and reach: the hidden file input behind "Import a
      // theme…" would otherwise take the focus and keep it.
      const controls = [...(page.current?.querySelectorAll<HTMLElement>('button, [role="slider"], input') ?? [])].filter(
        (one) => one.tabIndex >= 0 && !one.matches(':disabled') && one.checkVisibility()
      )
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
              className={`group flex items-center justify-center gap-2.5 rounded-md p-1.5 text-left text-body transition-colors @[44rem]/page:justify-start @[44rem]/page:px-2 ${!searching && section === one.title ? 'bg-accent text-foreground' : 'text-foreground/80 hover:bg-accent/60'}`}
            >
              <one.icon
                className={`size-4 shrink-0 transition-colors ${!searching && section === one.title ? 'text-[var(--tint)]' : 'text-[color-mix(in_oklab,var(--tint)_55%,var(--muted-foreground))] group-hover:text-[var(--tint)]'}`}
                style={{ '--tint': `var(--tt-color-text-${one.tint})` } as CSSProperties}
              />
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
          <Setting title="Interface size" note="How big everything is: the lists, menus and notes together, in every window." keywords="zoom scale bigger smaller text ui">
            <span className="flex items-center gap-1">
              {(['small', 'medium', 'large'] as const).map((size, index) => (
                <button
                  key={size}
                  type="button"
                  aria-label={size[0].toUpperCase() + size.slice(1)}
                  aria-pressed={(settings.interfaceSize ?? 'medium') === size}
                  onClick={() => (set({ interfaceSize: size }), step(index))}
                  className={`flex h-8 min-w-9 items-center justify-center rounded-md px-2 font-medium transition-colors hover:bg-accent ${(settings.interfaceSize ?? 'medium') === size ? 'bg-accent text-foreground' : 'text-muted-foreground'}`}
                  style={{ fontSize: [12, 14, 17][index] }}
                >
                  Aa
                </button>
              ))}
            </span>
          </Setting>
          <Setting title="Blurring" note="Private words blurred in lists until you point at them, a window dimmed when you leave it, and words that arrive out of a soft blur. Off, everything is plain and sharp." keywords="blur private dim focus soft">
            <Switch checked={settings.blur !== false} onCheckedChange={(blur) => (set({ blur }), chime(blur ? 'on' : 'off'))} />
          </Setting>
          <Setting title="Postcards" note="Pictures in notes sit in a white border with rounded corners and a soft shadow, like a print laid on the desk." keywords="images pictures photos border frame white">
            <Switch checked={!!settings.postcards} onCheckedChange={(postcards) => (set({ postcards }), chime(postcards ? 'on' : 'off'))} />
          </Setting>
          <Setting title="Pictures in lists" note="A note with a picture in it shows the first one, small, at the end of its row and on its card.">
            <Switch checked={settings.thumbnails !== false} onCheckedChange={(thumbnails) => set({ thumbnails })} />
          </Setting>
        </Group>
        <Group section="Appearance" title="Text">
          <Setting title="Font" note="What the whole app is written in, notes, lists and menus: the Mac's own font to start, Fraunces, a few others, or any font on this Mac. OpenDyslexic is easier for some to read." below={<Sample />} keywords={`note font ${NOTE_FONTS.map((font) => font.label).join(' ')}`}>
            <FontPicker value={settings.noteFont} />
          </Setting>
          <Setting title="Heading font" note="Headings in a font of their own, in notes and on these pages: a characterful serif over plain text reads well, the way Dia pairs them. Or the same as the text." keywords={`headings titles ${NOTE_FONTS.map((font) => font.label).join(' ')}`}>
            <FontPicker value={settings.headingFont} setting="headingFont" same="Same as text" />
          </Setting>
          <Setting title="Notes only" note="On, the font above is used only for what you write, and the app's own lists, menus and labels stay in Fraunces.">
            <Switch checked={!!settings.fontNotesOnly} onCheckedChange={(fontNotesOnly) => (set({ fontNotesOnly }), chime(fontNotesOnly ? 'on' : 'off'))} />
          </Setting>
          <Setting title="Text size" note="How big the words in notes are. ⌘+ and ⌘− change it from any note, ⌘0 puts it back." below={<Sample />}>
            <TextSize value={settings.textSize} />
          </Setting>
        </Group>

        <Group section="Scenery" title="Pictures at rest">
          <Setting title="Scenery" note="Pictures from your own folders at the quiet moments: an empty inbox, a finished review, the top of today's page. Only where you rest, never behind your work." keywords="pictures images photos wallpaper background landscape scenes art">
            <Switch checked={settings.scenery} onCheckedChange={(scenery) => (set({ scenery }), chime(scenery ? 'on' : 'off'))} />
          </Setting>
          <SceneryFolders folders={settings.sceneryFolders} on={settings.scenery} onSave={(sceneryFolders) => set({ sceneryFolders })} />
          <Setting title="Show another" note="A different picture in every place at once. The ones you see stay put otherwise: one a day, the same all day." keywords="shuffle next change picture random">
            <Button variant="outline" size="sm" disabled={!settings.scenery} onClick={() => {
              const was = settings.sceneryShuffle ?? 0
              set({ sceneryShuffle: was + 1 })
              chime('scene')
              toast('Another set of pictures', () => set({ sceneryShuffle: was }))
            }}>Show another</Button>
          </Setting>
        </Group>
        <Group section="Scenery" title="Where they show">
          {([
            ['sceneryRest', 'When there is nothing to do', 'Inbox empty, review done, nothing due today, nothing rotting: a wide picture above the sentence that says so.', 'empty inbox zero review done'],
            ['sceneryToday', "Today's page", "A painted strip across the top of each day's page, the same picture all that day. With Postcards on, it sits in a white frame.", 'banner header day daily'],
            ['sceneryRecap', 'Recaps', 'Each page of a month or year recap over its own picture: morning light for the opening, night for the close.', 'wrapped month year'],
            ['sceneryFocus', 'Reading and Focus', 'Behind Read mode and ⇧⌘F Focus, dimmed far enough that the words read as well as on a plain page.', 'read mode focus backdrop']
          ] as const).map(([key, title, note, keywords]) => (
            <Setting key={key} title={title} note={note} keywords={`scenery pictures ${keywords}`}>
              <Switch disabled={!settings.scenery} checked={settings[key] !== false} onCheckedChange={(on) => (set({ [key]: on }), chime(on ? 'on' : 'off'))} />
            </Setting>
          ))}
        </Group>
        <Group section="Scenery" title="How they look">
          <Setting title="Match the time of day" note="Golden scenes in the morning and afternoon, dusk in the evening, night and candlelight after dark. Off, any picture at any hour." keywords="scenery morning evening night dusk golden hour mood">
            <Switch disabled={!settings.scenery} checked={settings.sceneryTime} onCheckedChange={(sceneryTime) => (set({ sceneryTime }), chime(sceneryTime ? 'on' : 'off'))} />
          </Setting>
          <Setting title="Dimness" note="How far the pictures fade toward the page colour. Wherever words sit over one, it is dimmed further still, so they always read clearly." keywords="scenery dim darken fade brightness opacity">
            <SettingSlider disabled={!settings.scenery} min={0} max={0.9} step={0.05} value={settings.sceneryDim} onSave={(sceneryDim) => set({ sceneryDim })} />
            <span className="w-10 text-right tabular-nums"><Rolling text={`${Math.round(settings.sceneryDim * 100)}%`} /></span>
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
            <SettingSlider disabled={!settings.sounds} min={0} max={1} step={0.05} value={settings.volume} onSave={(volume) => set({ volume })} />
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
            <SettingSlider min={0} max={0.5} step={0.05} value={settings.hintRate} onSave={(hintRate) => set({ hintRate })} />
            <span className="w-16 text-right tabular-nums"><Rolling text={settings.hintRate ? `1 in ${Math.round(1 / settings.hintRate)}` : 'never'} /></span>
          </Setting>
          <HintTuning />
          <Setting title="Rot cards" note="How many unhandled captures come back each time you open the prompt. A few, never the whole pile.">
            <SettingSlider min={0} max={6} step={1} value={settings.rotCount} onSave={(rotCount) => set({ rotCount })} />
            <span className="w-16 text-right tabular-nums"><Rolling text={settings.rotCount} /></span>
          </Setting>
          <Setting title="Memories" note="Some hints are memories, the way Photos brings them: a year ago today, this week in an earlier year, more from one source. Each says which it is.">
            <Switch checked={settings.memories} onCheckedChange={(memories) => set({ memories })} />
          </Setting>
          <Setting title="Questions come back" note="Now and then, a question you are holding comes back as a hint: still open, how long, how many clues, with a way to add one. Rare, never in quiet hours.">
            <Switch checked={settings.questionsBack} onCheckedChange={(questionsBack) => set({ questionsBack })} />
          </Setting>
          <Setting title="Questions in view" note="The questions you keep in view (up to twelve, from Holding) show small while you capture and tidy, so something new can go straight in as a clue.">
            <Switch checked={settings.pinnedQuestions !== false} onCheckedChange={(pinnedQuestions) => (set({ pinnedQuestions }), chime(pinnedQuestions ? 'on' : 'off'))} />
          </Setting>
          <Setting title="Recent reaches back" note="How many days the Recent panel lists, newest first, every kind of thing. ⇧⌘Y opens it beside any page.">
            <SettingSlider min={1} max={30} step={1} value={settings.recentDays ?? 7} onSave={(recentDays) => set({ recentDays })} />
            <span className="w-16 text-right tabular-nums"><Rolling text={(settings.recentDays ?? 7) === 1 ? '1 day' : `${settings.recentDays ?? 7} days`} /></span>
          </Setting>
        </Group>
        <Group section="What comes back to you" title="Every day">
          <Setting title="Daily tidy" note="Once a day the prompt offers a few minutes over the last days' captures: add tags, bold a line, fold a section, cross off what is done. Nothing is decided there. Never in quiet hours.">
            <Switch checked={settings.dailyTidy} onCheckedChange={(dailyTidy) => set({ dailyTidy })} />
          </Setting>
        </Group>
        <Group section="What comes back to you" title="Once a week">
          <Setting title="Weekly review" note="On the day you pick, the prompt offers the deciding pass: what you set aside to come back to, and what has waited longest, each with its exits. Rot cards only ask for a tidy; deciding happens here. Never in quiet hours.">
            {settings.weeklyReview && (
              <div className="flex rounded-md border p-0.5">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((letter, day) => (
                  <button
                    key={day}
                    type="button"
                    aria-label={weekdayName(day)}
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
            <SettingSlider min={0.8} max={0.97} step={0.01} value={settings.retention} onSave={(retention) => set({ retention })} />
            <span className="w-10 text-right tabular-nums"><Rolling text={`${Math.round(settings.retention * 100)}%`} /></span>
          </Setting>
          <Setting title="Daily limits" note="New items and reviews a day. A cap keeps the queue finishable; an uncapped one becomes a wall you stop opening.">
            <NumberSetting value={settings.newPerDay} onSave={(newPerDay) => set({ newPerDay })} /> new
            <NumberSetting value={settings.reviewsPerDay} onSave={(reviewsPerDay) => set({ reviewsPerDay })} /> reviews
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
            <ExportButton />
          </Setting>
          <Setting title="Import" note="Notes from an Obsidian vault; highlights from Readwise or Kindle; Markdown, bookmarks or Anki cards. The menu bar icon has the same.">
            <ImportButton what="vault">Obsidian…</ImportButton>
            <ImportButton what="files">Files…</ImportButton>
          </Setting>
          <Setting title="Backups" note="Every day a full copy of everything, private notes included, goes to the folder below, the last 30 kept: it is your own backup. With this on, each capture is also kept there as a plain Markdown file, never a private or discarded one. Off removes those files within the hour." below={<BackupPlace />} keywords="backup icloud markdown copies">
            <Switch checked={settings.markdownCopies !== false} onCheckedChange={(markdownCopies) => set({ markdownCopies })} />
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

/** Where the backups go: iCloud Drive when there is one, otherwise beside the app's data. */
function BackupPlace(): React.JSX.Element {
  const [where, setWhere] = useState('')
  useEffect(() => void vigil.backupsWhere().then(setWhere), [])
  return <p className="text-xs text-muted-foreground">Backups go to <span className="font-mono text-foreground/80">{where.includes('CloudDocs') ? 'iCloud Drive › mindflow' : where || '…'}</span></p>
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
          toast(`Imported ${made.name} and switched to it`, () => (made.undo(), refresh()))
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

/**
 * The folders Scenery takes its pictures from: each with a count of what is
 * ready in it, a way to take it out (undoable), and one to add another.
 */
function SceneryFolders({ folders, on, onSave }: { folders: string[]; on: boolean; onSave: (folders: string[]) => void }): React.JSX.Element {
  // Asked again every second or two while a scan runs, since nothing else
  // says when it is done: the count climbs and the orb goes when it ends.
  const [ask, setAsk] = useState(0)
  const found = useLive(() => (on && folders.length ? vigil.scenery(folders) : Promise.resolve(null)), null as Awaited<ReturnType<typeof vigil.scenery>> | null, [on, JSON.stringify(folders), ask])
  const ready = found?.scenes.length ?? 0
  useEffect(() => {
    if (!found?.scanning) return
    const timer = setTimeout(() => setAsk((n) => n + 1), 1500)
    return () => clearTimeout(timer)
  }, [found, ask])
  return (
    <Setting
      title="Folders"
      note={`Where the pictures come from. They stay where they are: Vigil keeps only smaller copies for itself, and looks for new ones every ten minutes or so.${on && found ? ` ${ready} ${ready === 1 ? 'picture' : 'pictures'} ready${found.scanning ? ', more on the way' : ''}.` : ''}`}
      keywords="scenery folder pictures images add remove choose"
      below={folders.length > 0 && (
        <div className="mt-2 flex flex-col gap-1">
          {folders.map((folder) => (
            <span key={folder} className="flex items-center gap-2 rounded-md border py-1 pr-1 pl-2.5 text-control">
              <span className="min-w-0 flex-1 truncate" title={folder}>{folder.split('/').slice(-2).join('/')}</span>
              <button type="button" aria-label={`Remove ${folder}`} className="rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => {
                onSave(folders.filter((one) => one !== folder))
                chime('away')
                toast(`Removed ${folder.split('/').pop()}`, () => onSave(folders))
              }}>
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    >
      {/* The first look through a folder makes its small copies: a real wait. */}
      {on && found?.scanning && <Orb state="searching" label="Making copies…" />}
      <Button variant="outline" size="sm" onClick={() => void vigil.sceneryFolder().then((folder) => {
        if (!folder) return
        if (folders.includes(folder)) return refuse('That folder is already in the list')
        onSave([...folders, folder])
        chime('settled')
        toast(`Added ${folder.split('/').pop()}`, () => onSave(folders))
      })}>
        <FolderPlus className="size-4" /> Add a folder…
      </Button>
    </Setting>
  )
}

/** Export, an orb saying so in its place for as long as it takes. */
function ExportButton(): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  if (busy) return <Orb label="Exporting…" />
  return (
    <Button variant="outline" size="sm" onClick={() => {
      setBusy(true)
      void vigil.exportAll().then((folder) => {
        if (!folder) return
        chime('send')
        toast(`Exported to ${folder.split('/').slice(-2).join('/')}`)
      }).finally(() => setBusy(false))
    }}>
      <AliveIcon icon={DownloadIcon} size={16} /> Export
    </Button>
  )
}

/** An import, an orb saying so in its button's place until the notes are in. */
function ImportButton({ what, children }: { what: 'vault' | 'files'; children: ReactNode }): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  if (busy) return <Orb state="weaving" label="Importing…" />
  return (
    <Button variant="outline" size="sm" onClick={() => {
      chime('open')
      setBusy(true)
      void window.api.importFrom(what).finally(() => setBusy(false))
    }}>
      <AliveIcon icon={UploadIcon} size={16} />{children}
    </Button>
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
