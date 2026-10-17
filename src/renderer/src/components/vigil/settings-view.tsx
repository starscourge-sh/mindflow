import { calendar } from '@/lib/mac-calendar'
import { WRAP_SETTING, monthToWrap, openWrap } from './wrap-story'
import iconBronze from '@/assets/app-icon/bronze.png'
import iconGold from '@/assets/app-icon/gold.png'
import iconLights from '@/assets/app-icon/lights.png'
import iconGoldLights from '@/assets/app-icon/gold-lights.png'
import { WorkdaySample } from './week-fit'
import { lengthSaid } from '../../../../main/day-load'
import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { PACKS, TICKS, chime, click, setVolume, soundOn, step, tickSample, type PackName, type TickSound } from '@/lib/sound'
import { NOTE_FONTS } from '@/lib/editor-setup'
import { CalendarDays, Check, FolderPlus, Image as ImageIcon, Keyboard, Pin, Play, Shuffle, Star, type LucideIcon } from 'lucide-react'
import { SecondZoneSetting } from './calendar-events'
import InfoCircleIcon from '@/components/ui/info-circle-icon'
import CameraIcon from '@/components/ui/camera-icon'
import CameraOffIcon from '@/components/ui/camera-off-icon'
import { allThemes, applyTheme, customThemes, importTheme, removeTheme, restoreTheme, themeName } from '@/lib/theme'
import { KeysEditor, Marked } from './shortcut-sheet'
import { keyFor } from '@/lib/keys'
import { Swatch } from '../theme/theme-picker'
import { StylePicker } from '../theme/style-picker'

import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { Switch as PlainSwitch } from '@/components/ui/switch'
import { FitToMe } from './study'
import { onboarding, playWelcome, useOnboarding } from '@/lib/onboarding'
import { call, useLive, vigil, type GiphyMedia, type GiphyPin, type MomentKind, type Settings } from '@/lib/vigil'
import { Chips } from './display'
import { setPageWidth, widthOf, type PageWidth } from '@/lib/reading'
import { SoundPacks } from './sound-packs'
import { FontPicker, TextSize } from './font-picker'
import { BackToTop, Kbd, Rolling, Tip, ask, quietly, refuse, toast, useSmooth } from './ui'
import { working } from './beam'
import { Term } from './term'
import { Button } from '@/components/ui/button'
import { Orb } from './orb'
import { LINGER } from './getting-started'
import { tryCelebration } from './celebrate'
import { drawingFor } from './grain'
import { SettingsContents } from './settings-contents'
import { CoverChoice, DimPreview, FolderStrips, InFinder } from './settings-looks'
import { sourceOf } from '../../../../main/moment-source'
import { byKeys, spring, still, useFirstVisit } from '@/lib/motion'
import { Highlight, useChosen, useFluidHover, Weighted } from './glide'
import { detent, falloff } from '@/lib/proximity'
import { AliveIcon } from '@/components/ui/alive-icon'
import DownloadIcon from '@/components/ui/download-icon'
import UploadIcon from '@/components/ui/upload-icon'
import { dayjs, num, weekdayName } from '../../../../main/dates'
import { TomorrowPreview } from './tomorrow-lines'
import { BOX_TABS, SECTIONS as PLACES, ShowList } from './places'
import { RecentShowRow } from './open-today'
import { SpellLanguages } from './spell-languages'
import { isMac } from '@/lib/tiptap-utils'
import { currentVim, onVimChange, setVim } from '@/lib/vim'
import { useStoredFlag } from '@/lib/use-stored-flag'
import { RECORDING_KINDS } from '@/lib/recordings'
import { SANDBOX, enterSandbox, leaveSandbox, startSandboxOver } from '@/lib/sandbox'
import { HoldButton } from './hold-button'
import { SiteBlockField, openAutomation, useBlockRefused } from './site-block-field'
import { askBook, deleteBook, renameBook, revealBook, switchBook, useShelf } from '@/lib/books'
import { HueDots, askNewBook } from './books'
import { useHere } from '@/lib/split'
import { Lead, plain } from './lead'
import { backedUpAgo, chooseBackupFolder } from '@/lib/backups'
import { ThemeDial } from './theme-dial'
import { TimeField } from './time-field'
import { BlurSample, CentredSample, Choices, CountSample, ListPictureSample, MarksSample, MiniBubble, MotionSample, PictureSample, POSTCARD_BORDERS, StirSample, TempusSample, ThemeFileGuide, ThemeTiles, barChoices, boxPlaceChoices, boxScreenChoices, bubbleChoices, linkChoices, meaningChoices, pillSitsChoices, postcardChoices, saveStarterTheme, stickyChoices, timerShowsChoices, widthChoices } from './settings-show'
import { Brain, HardDrive, CircleHelp as LifeBuoy, ListTodo as ListChecks, Camera as Mountain, Brush as Palette, Pencil as PenLine, Search as SearchIcon, Sparkles, Volume2, X } from '@/components/ui/icons'

/**
 * What the search at the top asks for, and whether the island a row sits in
 * matched it by its own heading (then every row in it shows).
 */
const Query = createContext({ query: '', all: false })
/** The title of the setting a control sits in: its name for VoiceOver, unless it is given its own. */
const SettingName = createContext<string | undefined>(undefined)
function Switch(props: React.ComponentProps<typeof PlainSwitch>): React.JSX.Element {
  const name = useContext(SettingName)
  return <PlainSwitch aria-label={name} {...props} />
}
const matches = (query: string, ...texts: string[]): boolean => !query.trim() || texts.join(' ').toLowerCase().includes(query.trim().toLowerCase())

/**
 * One setting, as a row in an island the way System Settings groups them: its
 * name and what it changes on the left, the control on the right. Where the
 * words would be squeezed narrower than a short line, the control drops under
 * them instead. Anything set under it (`below`) takes the full width.
 * Searched for and not matching, it is not there at all.
 */
function Setting({ title, aka, children, note, more, below, keywords = '', under = false, off }: {
  title: string
  /** What the one-line note had no room for, behind a “?” beside the title. Searched too. */
  more?: string
  /** Why its control is greyed out now, or why it has no effect yet, said under it in plain words (“Turn “Sounds” on to change this”). */
  off?: ReactNode
  /** Vigil's own word for it, after the plain name: clicked, it opens what the word means. */
  aka?: string
  children?: ReactNode
  note: string
  below?: ReactNode
  /** More words it is found by: the names of what it offers, a theme's or a font's. */
  keywords?: string
  /** A choice within the row above it, set in a little under it. */
  under?: boolean
}): React.JSX.Element | null {
  const { query, all } = useContext(Query)
  if (!all && !matches(query, title, plain(note), `${keywords} ${aka ?? ''} ${more ?? ''}`)) return null
  const shown = all ? '' : query
  return (
    <div data-setting data-setting-title={title} className={`py-3 pr-4 ${under ? 'pl-9' : 'pl-4'}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="min-w-0 flex-[1_1_13rem]">
          <div className="text-body font-medium text-foreground"><Marked text={title} query={shown} />{aka && <span className="ml-1.5 font-normal text-muted-foreground">(<Term>{aka}</Term>)</span>}
            {more && (
              <Tip label={more}>
                <button type="button" data-setting-more aria-label={`More about “${title}”`} className="relative after:absolute after:-inset-1 after:rounded-full ml-1.5 inline-grid size-4 translate-y-[-1px] place-items-center rounded-full border border-border align-middle text-[0.625rem] leading-none font-semibold text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">?</button>
              </Tip>
            )}
          </div>
          {/* Dia's way: the lead-in in bold says it, the rest is there for whoever wants it. */}
          <p className="mf-prose mt-1 max-w-md text-[0.8125rem] text-muted-foreground [&_strong]:font-medium [&_strong]:text-foreground/80"><Lead text={note} show={(words) => <Marked text={words} query={shown} />} /></p>
          {off && <p data-setting-off className="mt-1 text-[0.8125rem] font-medium text-foreground/80">{off}</p>}
        </div>
        {children && <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2 text-control"><SettingName.Provider value={title}>{children}</SettingName.Provider></div>}
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
  { title: 'Writing', icon: PenLine, tint: 'orange' },
  { title: 'What comes back to you', icon: Sparkles, tint: 'yellow' },
  { title: 'Review', icon: Brain, tint: 'pink' },
  { title: 'Tasks', icon: ListChecks, tint: 'green' },
  { title: 'Calendar', icon: CalendarDays, tint: 'blue' },
  { title: 'Scenery', icon: Mountain, tint: 'green' },
  { title: 'Sound', icon: Volume2, tint: 'red' },
  { title: 'Import and backups', icon: HardDrive, tint: 'gray' },
  { title: 'Keys', icon: Keyboard, tint: 'purple' },
  { title: 'Help', icon: LifeBuoy, tint: 'blue' }
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
      <GroupIsland title={title} section={section} query={query}>{children}</GroupIsland>
    </Query.Provider>
  )
}

/** A group as it appears: a section picked with a click brings its groups in one after another; one reached by keys or a search is simply there. */
function GroupIsland({ title, section, query, children }: { title: string; section: string; query: string; children: ReactNode }): React.JSX.Element {
  const first = useFirstVisit(`settings:${section}`)
  const [enter] = useState(() => first && !byKeys())
  return (
    <section data-group={title} className={`mt-6 first:mt-0 [&:not(:has([data-setting]))]:hidden ${enter ? 'mf-rise' : ''}`}>
      {/* Searching, rows from every section show at once, so each island says whose it is. */}
      <h3 className="mb-2 px-1 text-body font-semibold text-foreground">{query.trim() && <span className="font-normal text-muted-foreground">{section} · </span>}<Marked text={title} query={query} /></h3>
      <div className="mf-island divide-y divide-border/60 overflow-hidden rounded-xl border bg-accent/25">{children}</div>
    </section>
  )
}

const field = 'h-8 tabular-nums'

/**
 * A slider that holds its own value while it moves and saves a moment after:
 * read back from the saved settings, quick presses arrived before the last
 * save had, and each one started from the old value.
 *
 * `rest`, the value it comes set to, is a small mark on the track that grows
 * clearer as the thumb comes near. A drag is drawn into it from a little
 * further than the steps either side of it, and a soft tick says it has
 * landed, so the default is easy to find again. The steps beside it can still
 * be reached by hand, and keys step past it like any other value.
 */
function SettingSlider({ value, onSave, onLive, rest, sample, ...props }: { value: number; onSave: (value: number) => void; /** Heard on letting go, at the new value: a sound setting plays itself. */ sample?: (value: number) => void; /** Told each value as the thumb moves, for a preview that follows it. */ onLive?: (value: number) => void; min: number; max: number; step: number; disabled?: boolean; rest?: number }): React.JSX.Element {
  const [held, setHeld] = useState<number | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  // Let go once the save has come back, so it never flicks to the old value.
  useEffect(() => void (held === value && setHeld(null)), [value, held])
  const shown = held ?? value
  const { min, max, step } = props
  const span = max - min
  // Only a slider of many steps pulls: with a handful, each step is already a detent.
  // One that pulls is tracked in quarter steps underneath, so the pull can be wider than half a step.
  const pulls = rest !== undefined && span / step >= 10
  const fine = pulls ? step / 4 : step
  const snap = (one: number): number => Math.min(max, Math.max(min, Number((min + Math.round((one - min) / step) * step).toFixed(6))))
  const at = (one: number): boolean => rest !== undefined && Math.abs(one - rest) < step / 100
  const place = rest === undefined ? 0 : ((rest - min) / span) * 100
  const near = rest === undefined ? 0 : falloff(shown - rest, span / 4)
  const name = useContext(SettingName)
  return (
    <span className="relative flex w-40 max-w-full min-w-20 shrink items-center">
      {rest !== undefined && (
        // Where the thumb's middle sits at this value: Radix keeps the thumb inside the track, 6px in at either end.
        <span aria-hidden className="pointer-events-none absolute top-1/2 left-0 h-2 w-0.5 rounded-full bg-foreground"
          style={{ left: `calc(${place}% + ${6 - 0.12 * place}px)`, opacity: (0.22 + 0.5 * near) * (props.disabled ? 0.5 : 1), transform: `translate(-50%, -50%) scaleY(${1 + 0.35 * near})` }} />
      )}
      <Slider
        aria-label={name}
        {...props}
        step={fine}
        className="w-full"
        value={[shown]}
        onValueChange={([raw]) => {
          const keyed = byKeys()
          // A key moves a whole step (the quarter steps are only for the hand).
          const next = keyed
            ? snap(Math.abs(raw - shown) < step ? shown + Math.sign(raw - shown) * step : raw)
            : pulls ? snap(detent(raw, rest!, step * 0.75)) : snap(raw)
          if (next === shown) return
          if (!keyed && at(next)) click('tick')
          setHeld(next)
          onLive?.(next)
          clearTimeout(timer.current)
          timer.current = setTimeout(() => onSave(next), 250)
        }}
        onValueCommit={([raw]) => (sample ? sample(snap(raw)) : chime('tap'))}
      />
    </span>
  )
}

/** A number box that saves a number, never the empty field you pass through on the way to one. */
function NumberSetting({ value, onSave, label }: { value: number; onSave: (value: number) => void; label: string }): React.JSX.Element {
  const [text, setText] = useState(String(value))
  // While you type, the box is yours; a save coming back must not undo a key.
  const typing = useRef(false)
  useEffect(() => void (!typing.current && setText(String(value))), [value])
  const valid = (raw: string): boolean => raw.trim() !== '' && Number.isFinite(Number(raw)) && Number(raw) >= 0
  return (
    <Input
      type="number"
      min={0}
      aria-label={label}
      // Vigil's own field: no system spin arrows (the arrow keys still step it).
      className={`${field} w-16 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
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

/** Said on a bubble setting while the session timer shows in the note alone: it has no bubble to change until it does. */
function BubbleOff({ set }: { set: (patch: Partial<Settings>) => void }): React.JSX.Element {
  return (
    <span data-bubble-off className="flex flex-wrap items-center gap-x-2 gap-y-1">
      Shows when “Session timer shows in” is “The bubble” or “Both”.
      <Button variant="outline" size="sm" className="h-6 px-2 text-xs" onClick={() => (chime('settled'), set({ focusShows: 'both' }))}>Show both</Button>
    </span>
  )
}

/**
 * The settings. Each one is a value read in one place, and each says what it
 * changes in a sentence, so a setting never needs looking up.
 */
/** The pages Vigil can open to, Home first. */
const START_PAGES = ['home', 'inbox', 'today', 'day', 'all', 'review', 'map', 'goals']

/** A small window with its sidebar on one side, for the side's tiles. */
function SideSample({ side }: { side: 'left' | 'right' }): React.JSX.Element {
  return (
    <span className={`absolute inset-2 flex gap-1 ${side === 'right' ? 'flex-row-reverse' : ''}`}>
      <span className="w-1/4 rounded-sm bg-[var(--tt-brand-color-400)]/70" />
      <span className="flex flex-1 flex-col gap-1 rounded-sm border border-border p-1"><span className="h-1 w-3/4 rounded-full bg-foreground/40" /><span className="h-1 w-1/2 rounded-full bg-foreground/25" /></span>
    </span>
  )
}

/** A small window whose hidden sidebar slides out while its edge is pointed at, as the real one does. */
function PeekSample({ side, on }: { side: 'left' | 'right'; on: boolean }): React.JSX.Element {
  return (
    <span data-peek-sample className="group/peek relative flex h-9 w-20 overflow-hidden rounded-md border border-border bg-background">
      <span className="m-1 flex flex-1 flex-col gap-1 p-0.5"><span className="h-1 w-3/4 rounded-full bg-foreground/40" /><span className="h-1 w-1/2 rounded-full bg-foreground/25" /></span>
      {on && <span className={`absolute inset-y-1 w-5 rounded-sm bg-[var(--tt-brand-color-400)] transition-transform duration-200 ease-out motion-reduce:transition-none ${side === 'right' ? 'right-1 translate-x-7 group-hover/peek:translate-x-0' : 'left-1 -translate-x-7 group-hover/peek:translate-x-0'}`} />}
    </span>
  )
}

export function SettingsView(): React.JSX.Element {
  const settings = useLive(vigil.settings, null as Settings | null)
  // The search at the top: rows that do not match go, and the words are marked.
  const [query, setQuery] = useState('')
  // Vim keys here too: j and k move between the controls, h and l turn a
  // slider down and up, and Enter or Space presses what has the focus.
  const page = useRef<HTMLDivElement | null>(null)
  // The column, for the contents beside it to read.
  const [column, setColumn] = useState<HTMLDivElement | null>(null)
  const holdColumn = useRef((element: HTMLDivElement | null) => {
    page.current = element
    setColumn(element)
  }).current
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
  // Split, only the pane in front answers keys.
  const here = useHere()
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!here()) return
      const active = document.activeElement as HTMLElement | null
      // In the section list, j and k move between sections instead.
      if (event.metaKey || event.ctrlKey || event.altKey || ['INPUT', 'TEXTAREA'].includes(active?.tagName ?? '') || active?.closest('[data-sections]')) return
      // Only what you can see and reach: the hidden file input behind "Import a
      // theme…" would otherwise take the focus and keep it.
      const controls = [...(page.current?.querySelectorAll<HTMLElement>('button, [role="slider"], input') ?? [])].filter(
        (one) => one.tabIndex >= 0 && !one.matches(':disabled') && one.checkVisibility() && !one.matches('input:not([type]), input[type="text"], input[type="search"]')
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
  // Vim keys live with the editors, not here, so the box's menu and this switch move together.
  const [vim, setVimOn] = useState(currentVim)
  useEffect(() => onVimChange(setVimOn), [])
  // The section list's light glides to the row nearest the pointer, and the
  // section on show is one fill that travels to the next.
  const sectionList = useRef<HTMLElement>(null)
  const sectionHover = useFluidHover(sectionList, { items: '[data-section]' })
  const sectionChosen = useChosen(sectionList, '[data-section][aria-current="page"]', `${section}:${!!query.trim()}`)
  // The interface sizes, the same way along a line.
  const sizeRow = useRef<HTMLSpanElement>(null)
  const sizeHover = useFluidHover(sizeRow, { items: ':scope > button', axis: 'x' })
  const sizeChosen = useChosen(sizeRow, ':scope > button[aria-pressed="true"]', settings?.interfaceSize)
  // The app icons: one light glides between them, as along the size row.
  const iconRow = useRef<HTMLDivElement>(null)
  const iconHover = useFluidHover(iconRow, { items: ':scope > button', axis: 'x' })
  const iconChosen = useChosen(iconRow, ':scope > button[aria-checked="true"]', settings?.appIcon ?? 'bronze')
  const [typewriter, setTypewriter] = useStoredFlag('typewriter')
  if (!settings) return <section className="flex-1" />
  const set = (patch: Partial<Settings>): void => void vigil.setSettings(patch)
  // Which windows show in screen recordings, each kind on its own; ⌘K turns them all at once.
  const recorded = settings.inRecordings
  const searching = !!query.trim()

  // The section list and the search over it on the left, the section on the
  // right. Under 34rem of page (a window under about 850px) the list folds to its tiles, like the main
  // sidebar, and the search moves over the settings. Not in the page column,
  // so Full width changes nothing here.
  return (
    <section className={`grid min-h-0 min-w-0 flex-1 grid-cols-[3.5rem_1fr] grid-rows-[auto_1fr] @[34rem]/page:grid-cols-[12.5rem_1fr] @[52rem]/page:grid-cols-[14rem_1fr]`}>
      <nav
        ref={sectionList}
        {...sectionHover.handlers}
        data-sections
        aria-label="Settings sections"
        className={`relative isolate col-start-1 row-span-2 row-start-1 flex flex-col gap-px overflow-y-auto px-2 pt-4 pb-4 @[34rem]/page:row-span-1 @[34rem]/page:row-start-2 @[34rem]/page:pt-0`}
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
        <Highlight spot={sectionChosen.spot} snap={sectionChosen.snap} travel={spring.moderate} className="bg-accent" />
        <Highlight spot={sectionHover.spot} session={sectionHover.session} snap={sectionHover.snap} from={sectionChosen.spot} />
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
              className={`group flex items-center justify-center gap-2.5 rounded-md p-1.5 text-left text-body transition-colors duration-80 @[34rem]/page:justify-start @[34rem]/page:px-2 ${!searching && section === one.title ? 'text-foreground' : 'text-foreground/80'}`}
            >
              <one.icon
                className={`size-4 shrink-0 transition-colors duration-80 ${!searching && section === one.title ? 'text-[var(--tint)]' : 'text-[color-mix(in_oklab,var(--tint)_55%,var(--muted-foreground))] group-hover:text-[var(--tint)] group-data-[fluid-hover-active]:text-[var(--tint)]'}`}
                style={{ '--tint': `var(--tt-color-text-${one.tint})` } as CSSProperties}
              />
              <Weighted on={!searching && section === one.title} className="hidden @[34rem]/page:inline-grid">{one.title}</Weighted>
            </button>
          </Tip>
        ))}
      </nav>
      <label className={`col-start-2 row-start-1 mx-5 mt-4 mb-2 flex items-center gap-2 rounded-lg border bg-accent/25 px-3 py-1.5 text-muted-foreground focus-within:border-ring @[34rem]/page:col-start-1 @[34rem]/page:mx-2`}>
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
      <div className={`relative col-start-2 row-start-2 flex min-h-0 min-w-0 flex-col @[34rem]/page:row-span-2 @[34rem]/page:row-start-1`}>
      <SettingsContents page={column} scroller={scroller} />
      <div ref={setScroller} className="min-h-0 flex-1 overflow-y-auto">
      <Query.Provider value={{ query, all: false }}>
      <Shown.Provider value={section}>
      <div ref={holdColumn} className="w-full max-w-2xl px-6 pt-4 pb-16 [&:has([data-setting])>[data-none]]:hidden">
        {!searching && <h2 className="px-1 text-lg font-semibold text-foreground"><Term>{section}</Term></h2>}
        <p data-none className="px-1 text-body text-muted-foreground">Nothing here matches “{query}”. Try fewer letters, or what it changes.</p>
        <Group section="Appearance" title="Colours">
          <Setting title="Theme" note="Point at one to try it on, click to keep it." below={<ThemeTiles />} keywords={allThemes().map(themeName).join(' ')} />
          <Setting under title="Turn the dial" note="The same themes on a dial: drag it, scroll over it, or use ← and →." more="The one at the top is kept when you stop." below={<ThemeDialRow />} keywords={allThemes().map(themeName).join(' ') + ' theme dial turn wheel'} />
          <Setting title="Style" note="How things are drawn in any theme: soft and rounded, or square and outlined." more="“Soft” is rounded and lifted on soft shadows. “Brutal” is square, outlined in the theme's ink, and stands on hard shadows." keywords="style brutal soft neobrutalism square corners outline hard shadow">
            <StylePicker className="-mr-1" />
          </Setting>
          <Setting title="App icon" note="The icon Vigil shows in the Dock." more="“Leaves” and “Gold leaves” are a gathering of leaves, as a commonplace book gathers the best lines; “Lights” and “Gold lights” are a gathering of lamps, as for a night's watch." keywords="app icon dock logo mark gold leaves lights lamps">
            <div ref={iconRow} {...iconHover.handlers} role="radiogroup" aria-label="App icon" className="relative isolate -mr-1 flex gap-2">
              <Highlight spot={iconChosen.spot} snap={iconChosen.snap} travel={spring.moderate} className="rounded-lg bg-accent" />
              <Highlight spot={iconHover.spot} session={iconHover.session} snap={iconHover.snap} from={iconChosen.spot} className="rounded-lg" />
              {([['bronze', 'Leaves', iconBronze], ['gold', 'Gold leaves', iconGold], ['lights', 'Lights', iconLights], ['gold-lights', 'Gold lights', iconGoldLights]] as const).map(([id, label, src]) => {
                const on = (settings.appIcon ?? 'bronze') === id
                return (
                  <button key={id} type="button" role="radio" aria-checked={on} aria-label={label} onClick={() => set({ appIcon: id })}
                    className={`flex flex-col items-center gap-1 rounded-lg p-1.5 text-control transition-colors duration-80 ${on ? 'text-foreground' : 'text-muted-foreground hover:text-foreground data-[fluid-hover-active]:text-foreground'}`}>
                    <img src={src} alt="" draggable={false} className="size-11" />
                    {/* Bolder when chosen without growing, so its neighbours never shift. */}
                    <Weighted on={on}>{label}</Weighted>
                  </button>
                )
              })}
            </div>
          </Setting>
          <ImportedThemes />
        </Group>
        <Group section="Appearance" title="Layout">
          <Setting title="Page width" note="How wide notes and pages are, also set from a note's ⋯ menu." keywords="full width wide narrow column page layout"
            below={<Choices label="Page width" options={widthChoices} on={(id) => id === widthOf(settings)} pick={(id) => setPageWidth(id as PageWidth)} />} />
          <Setting title="Motion" note="Things ease in and out; point at these cards to see." more="Off, everything appears at once.">
            <MotionSample on={settings.motion} />
            <Switch checked={settings.motion} onCheckedChange={(motion) => set({ motion })} />
          </Setting>
          <Setting title="Interface size" note="How big lists, menus and notes are, in every window." keywords="zoom scale bigger smaller text ui">
            <span ref={sizeRow} {...sizeHover.handlers} className="relative isolate flex items-center gap-1">
              <Highlight spot={sizeChosen.spot} snap={sizeChosen.snap} travel={spring.moderate} className="bg-accent" />
              <Highlight spot={sizeHover.spot} session={sizeHover.session} snap={sizeHover.snap} from={sizeChosen.spot} />
              {(['small', 'medium', 'large'] as const).map((size, index) => (
                <button
                  key={size}
                  type="button"
                  aria-label={size[0].toUpperCase() + size.slice(1)}
                  aria-pressed={(settings.interfaceSize ?? 'medium') === size}
                  onClick={() => (set({ interfaceSize: size }), step(index))}
                  className={`flex h-8 min-w-9 items-center justify-center rounded-md px-2 font-medium transition-colors duration-80 ${(settings.interfaceSize ?? 'medium') === size ? 'text-foreground' : 'text-muted-foreground hover:text-foreground data-[fluid-hover-active]:text-foreground'}`}
                  style={{ fontSize: [12, 14, 17][index] }}
                >
                  Aa
                </button>
              ))}
            </span>
          </Setting>
          <Setting title="Blurring" note="Private notes stay blurred in lists until you point at them." more="A window you leave dims, and new words fade in from a blur. Off, all is sharp." keywords="blur private dim focus soft">
            <BlurSample />
            <Switch checked={settings.blur !== false} onCheckedChange={(blur) => set({ blur })} />
          </Setting>
          <Setting title="Postcards" note="Pictures in notes, and memories on Home, get a border and a soft shadow, like a print on a desk." more="Videos and the pictures on a day's page too." keywords="images pictures photos border frame white memories memory">
            <PictureSample caption={null} frame={settings.postcards ? POSTCARD_BORDERS[settings.postcardBorder ?? 'auto']() : undefined} />
            <Switch checked={!!settings.postcards} onCheckedChange={(postcards) => set({ postcards })} />
          </Setting>
          <Setting under off={!settings.postcards && 'Shows once “Postcards” is on.'} title="Postcard border" note="The border's colour, where “Auto” follows your theme." keywords="postcard border frame colour color white cream black accent paper print"
            below={<Choices label="Postcard border" min="5.5rem" options={postcardChoices()} on={(id) => id === (settings.postcardBorder ?? 'auto')} pick={(postcardBorder) => set({ postcardBorder: postcardBorder as Settings['postcardBorder'] })} />} />
          <Setting title="Tilt pictures in notes" note="A picture leans toward the pointer; point at this one to see." more="In Focus and full screen, pictures always tilt." keywords="tilt picture image photo hover move 3d motion">
            <PictureSample tilt={!!settings.tiltPictures} caption={null} />
            <Switch checked={!!settings.tiltPictures} onCheckedChange={(tiltPictures) => set({ tiltPictures })} />
          </Setting>
          <Setting title="Caption follows the pointer" note="A picture's caption rides beside the pointer instead of under it." keywords="caption picture image label follow pointer cursor hover">
            <PictureSample follow={settings.captionFollows !== false} />
            <Switch checked={settings.captionFollows !== false} onCheckedChange={(captionFollows) => set({ captionFollows })} />
          </Setting>
          <Setting title="Link pictures" note="The picture on a link card: “Fill” crops it, “Whole” shows all of it." keywords="bookmark link card youtube video thumbnail image picture crop cover contain fit"
            below={<Choices label="Link pictures" options={linkChoices} on={(id) => id === (settings.linkPictures ?? 'fill')} pick={(linkPictures) => set({ linkPictures: linkPictures as Settings['linkPictures'] })} />} />
          <Setting title="Margin marks" note="A few marks drawn by hand, like a line through a finished task." more="A circle round today, too. Off, every line is straight." keywords="hand drawn handwritten sketch doodle pen ink circle tick strike arrow personal">
            <MarksSample on={settings.marks !== false} />
            <Switch checked={settings.marks !== false} onCheckedChange={(marks) => set({ marks })} />
          </Setting>
          <Setting title="Progress bars" note="How every bar that fills is drawn, from goals to Getting started." keywords="progress bar lightsaber saber dino dinosaur run fun playful style"
            below={<Choices label="Progress bars" options={barChoices} on={(id) => id === (settings.progressBars ?? 'plain')} pick={(progressBars) => set({ progressBars: progressBars as Settings['progressBars'] })} />} />
          <Setting off={settings.focusShows === 'note' && <BubbleOff set={set} />} title="Session bubble" note="The bubble that floats while you focus, its circle filling as time goes." more="The dinosaur can run beside it, or along a line that ends with the time." keywords="focus session pill bubble timer circle ring dino dinosaur runner run progress fun playful"
            below={<Choices label="Session bubble" min="10rem" options={bubbleChoices} on={(id) => id === (settings.focusBubble ?? 'circle')} pick={(focusBubble) => set({ focusBubble: focusBubble as Settings['focusBubble'] })} />} />
          <Setting title="Session timer shows in" note="Where a focus session's time shows." more="In the note, it is a quiet line at its foot: time left, dots that light up, words written. With the note alone, there is no bubble and no count in." keywords="focus session timer footer note foot dots words count bubble pill where"
            below={<Choices label="Session timer shows in" options={timerShowsChoices} on={(id) => id === (settings.focusShows ?? 'bubble')} pick={(focusShows) => set({ focusShows: focusShows as Settings['focusShows'] })} />} />
          <Setting title="Count in a session" note="A session counts down from 5, a tick each, before its clock starts." more="Off, it starts at once." keywords="five second rule count countdown 5 4 3 2 1 start session focus tick launch" below={<CountSample on={settings.countIn !== false} />}>
            <Switch checked={settings.countIn !== false} onCheckedChange={(countIn) => set({ countIn })} />
          </Setting>
          {/* With the time in the note alone there is no bubble to place, but it stays here to find and set, saying so. */}
          <Setting off={settings.focusShows === 'note' && <BubbleOff set={set} />} title="Bubble sits" note="On a Mac with a notch, the bubble can wrap round it as a slim black band." more="It opens when you point at it." keywords="focus session pill bubble notch island menu bar top dynamic where place"
            below={<Choices label="Bubble sits" options={pillSitsChoices} on={(id) => id === (settings.pillSits ?? 'free')} pick={(pillSits) => set({ pillSits: pillSits as Settings['pillSits'] })} />} />
          <Setting title="Pictures in lists" note="A note's first picture, small, at the end of its row and on its card.">
            <ListPictureSample on={settings.thumbnails !== false} />
            <Switch checked={settings.thumbnails !== false} onCheckedChange={(thumbnails) => set({ thumbnails })} />
          </Setting>
          <Setting title="Covers" note="What a note with no picture of its own wears on its card and row." more="Each is tinted to the note's colour." keywords="covers cover drawings paper sketch gradients tiles thumbnails grid cards placeholder folder grain" below={<CoverChoice settings={settings} set={set} />} />
        </Group>
        <Group section="Appearance" title="Window placement">
          <Setting title="Keep quick capture centred" note="Quick capture grows on both sides when its panel opens, so it stays centred." more="Off, it grows to the right." keywords="box window centre center grow panel expand position place">
            <CentredSample on={settings.boxCentred !== false} />
            <Switch checked={settings.boxCentred !== false} onCheckedChange={(boxCentred) => set({ boxCentred })} />
          </Setting>
          <Setting title="Auto-close quick capture" note="Quick capture puts itself away when you click into another app." more="Like Raycast. What you wrote is kept. Off to start, so it stays up beside what you are reading until Esc or the key again." keywords="close when you click away box window close hide blur focus click away raycast auto">
            <Switch checked={settings.boxAutoHide === true} onCheckedChange={(boxAutoHide) => set({ boxAutoHide })} />
          </Setting>
          <Setting title="Dim quick capture" note="Quick capture fades to half strength when you click into another app." more="So the window you are in is clear. Off, it stays as bright as when you write in it." off={settings.blur === false && '“Blurring” is off, so no window dims for now.'} keywords="dim when you click away box window dim fade faded transparent opacity blur focus click away lose">
            <span aria-hidden className="flex h-7 w-16 items-center gap-1 rounded-md border border-border bg-popover px-2 transition-opacity duration-200" style={{ opacity: settings.boxDim !== false && settings.blur !== false ? 0.55 : 1 }}><span className="h-1 flex-1 rounded-full bg-foreground/50" /><span className="h-1 w-3 rounded-full bg-foreground/30" /></span>
            <Switch disabled={settings.blur === false} checked={settings.boxDim !== false} onCheckedChange={(boxDim) => set({ boxDim })} />
          </Setting>
          <Setting title="Hide capture buttons" note="Quick capture's buttons stay hidden until you point at them." more="⌥⌘, switches it from quick capture. Either way, they fade while you type." keywords="hide buttons in quick capture box window hide buttons zen quiet minimal clean distraction free chrome toolbar footer format raycast">
            {/* The sample: a line of words, and the button beside it fading away when on. */}
            <span aria-hidden className="flex h-7 w-16 items-center gap-1 rounded-md border border-border bg-popover px-2"><span className="h-1 flex-1 rounded-full bg-foreground/50" /><span className="h-3 w-3 rounded-sm border border-foreground/40 transition-opacity duration-200" style={{ opacity: settings.boxHideButtons ? 0.12 : 1 }} /></span>
            <Switch checked={settings.boxHideButtons === true} onCheckedChange={(boxHideButtons) => set({ boxHideButtons })} />
          </Setting>
          <Setting title="Where quick capture appears" note="Where quick capture opens when you call it up." more="⌃⌘C puts it in the middle of the screen whenever it is up." keywords="box window summon open position place top middle centre center last shortcut"
            below={<Choices label="Where quick capture appears" options={boxPlaceChoices} on={(id) => id === (settings.boxPlace ?? 'last')} pick={(boxPlace) => set({ boxPlace: boxPlace as Settings['boxPlace'] })} />} />
          <Setting title="Which screen" note="With two or more screens: the one the pointer is on, or the last one." keywords="box window display monitor screen pointer second"
            below={<Choices label="Which screen" options={boxScreenChoices} on={(id) => id === (settings.boxScreen ?? 'pointer')} pick={(boxScreen) => set({ boxScreen: boxScreen as Settings['boxScreen'] })} />} />
        </Group>
        <Group section="Appearance" title="Sidebar and tabs">
          <Setting title="Open Vigil to" note="The page the main window shows when Vigil starts." more="Any other page is a G and its letter, or ⌘K, away." keywords="start page open first launch home today inbox map default landing"
            below={<div data-start-page><Chips options={START_PAGES.map((id) => ({ id, label: PLACES.find((one) => one.id === id)?.label ?? id }))} on={(id) => id === (settings.startPage || 'home')} pick={(startPage) => (chime('tap'), set({ startPage }))} className="mt-3 flex-wrap" /></div>} />
          <Setting title="Sidebar side" note="Which side of the main window the sidebar sits on." keywords="sidebar left right side swap flip mirror position"
            below={<Choices label="Sidebar side" min="6rem" options={(['left', 'right'] as const).map((side) => ({ id: side, label: side === 'left' ? 'Left' : 'Right', show: <SideSample side={side} /> }))} on={(id) => id === (settings.sidebarSide ?? 'left')} pick={(sidebarSide) => set({ sidebarSide: sidebarSide as Settings['sidebarSide'] })} />} />
          <Setting title="Peek the hidden sidebar" note="With the sidebar hidden (⌘B), point at its edge of the window and it slides out; move away and it slides back." more="Point at the edge of this sample to see it." keywords="peek sidebar hover edge slide out reveal hidden dia arc auto hide">
            <PeekSample side={settings.sidebarSide ?? 'left'} on={settings.sidebarPeek !== false} />
            <Switch checked={settings.sidebarPeek !== false} onCheckedChange={(sidebarPeek) => set({ sidebarPeek })} />
          </Setting>
          <Setting title="Sidebar" note="The sections in the main window's sidebar; drag one to move it." more="One switched off leaves the sidebar; G with its letter, or ⌘K, still opens it." keywords="customize sections menu more hide show order reorder move drag" below={<div className="-mx-2 mt-2"><ShowList places={PLACES} setting="sidebarShown" /></div>} />
          <Setting title="Recent in the sidebar" note="The last five notes you opened, under “Pinned”." more="“Show all” at the end of its heading, or ⇧⌘Y, opens the Recent panel beside the page. Switched off, ⇧⌘Y still opens it." keywords="recent opened notes sidebar open opened today before arc tabs history last show all hide" below={<div className="-mx-2 mt-2"><RecentShowRow /></div>} />
          <Setting title="Quick capture tabs" note="The tabs beside quick capture; drag one to move it." more="A hidden one is still ⌃ and its number away, and shows while it is open." keywords="prompt panel inbox tasks review kept recent hide show order reorder move drag" below={<div className="-mx-2 mt-2"><ShowList places={BOX_TABS} setting="boxTabs" /></div>} />
        </Group>
        <Group section="Appearance" title="Text">
          <Setting title="Text font" note="What notes, lists and menus are written in." more="The Mac's own font to start, Fraunces, a few others or any font on this Mac; OpenDyslexic is easier for some to read." keywords={`note text body font ${NOTE_FONTS.map((font) => font.label).join(' ')}`}>
            <FontPicker value={settings.noteFont} />
          </Setting>
          <Setting title="Heading font" note="A font of its own for headings and page titles." more="Fraunces over the Mac's font to start, the way Dia pairs a characterful serif with plain text, or the same as the text. With the “Brutal” style, titles and note headings are in Archivo Black instead." below={<Sample />} keywords={`headings titles pairing ${NOTE_FONTS.map((font) => font.label).join(' ')}`}>
            <FontPicker value={settings.headingFont} setting="headingFont" same="Same as text" />
          </Setting>
          <Setting title="Notes only" note="The font above is only for your writing; the app's own words stay in Fraunces.">
            <Switch checked={!!settings.fontNotesOnly} onCheckedChange={(fontNotesOnly) => set({ fontNotesOnly })} />
          </Setting>
          <Setting title="Text size" note="How big the words in notes are; ⌘+ and ⌘− change it from any note." more="⌘0 puts it back." below={<Sample text />}>
            <TextSize value={settings.textSize} />
          </Setting>
        </Group>

        <Group section="Scenery" title="Pictures at rest">
          <Setting title="Scenery" note="Pictures from your own folders, in the places where you rest." more="An empty Inbox, a finished review, the top of today's page, and dimmed behind Focus if you let it." keywords="pictures images photos wallpaper background landscape scenes art">
            <Switch checked={settings.scenery} onCheckedChange={(scenery) => set({ scenery })} />
          </Setting>
          <SceneryFolders folders={settings.sceneryFolders} on={settings.scenery} onSave={(sceneryFolders) => set({ sceneryFolders })} />
          <Setting off={!settings.scenery && 'Turn “Scenery” on to change this.'} title="Show another" note="A different picture in every place at once." more="Otherwise they stay put: one a day, the same all day." keywords="shuffle next change picture random">
            <Button variant="outline" size="sm" disabled={!settings.scenery} onClick={() => {
              const was = settings.sceneryShuffle ?? 0
              set({ sceneryShuffle: was + 1 })
              chime('scene')
              toast('Another set of pictures', () => set({ sceneryShuffle: was }))
            }}>Show another</Button>
          </Setting>
        </Group>
        <Group section="Scenery" title="Celebrations">
          <Setting title="Celebrate milestones" note="A small card on the rare days worth marking, like your 100th capture." more="The Inbox emptied, a week in a row; never for an everyday tick, at most one in ten minutes, and a sticky's finished list gets its own." keywords="celebrate celebration milestone gif meme party confetti fun">
            <Button variant="outline" size="sm" onClick={() => tryCelebration()}>Try a celebration</Button>
            <Switch checked={settings.celebrate !== false} onCheckedChange={(celebrate) => set({ celebrate })} />
          </Setting>
          <CelebrationsFolder folder={settings.celebrationsFolder ?? ''} on={settings.celebrate !== false} onSave={(celebrationsFolder) => set({ celebrationsFolder })} />
          <CelebrationPicks settings={settings} on={settings.celebrate !== false} set={set} />
          <GiphySettings settings={settings} on={settings.celebrate !== false} set={set} />
        </Group>
        <Group section="Scenery" title="Where they show">
          {([
            ['sceneryRest', 'When there is nothing to do', 'A wide picture when the Inbox is empty, review is done and nothing is due.', 'empty inbox zero review done'],
            ['sceneryToday', "Today's page", "A painted picture at the top of each day's, week's and month's page.", 'banner header day daily'],
            ['sceneryRecap', 'Recaps', 'Each page of a month or year recap over its own picture.', 'wrapped month year'],
            ['sceneryFocus', 'Focus', 'Behind ⇧⌘F Focus, dimmed so the words read as well as on a plain page.', 'read mode focus backdrop']
          ] as const).map(([key, title, note, keywords]) => (
            <Setting key={key} off={!settings.scenery && 'Turn “Scenery” on to change this.'} title={title} note={note} keywords={`scenery pictures ${keywords}`}>
              <Switch disabled={!settings.scenery} checked={settings[key] !== false} onCheckedChange={(on) => set({ [key]: on })} />
            </Setting>
          ))}
        </Group>
        <Group section="Scenery" title="How they look">
          <Setting off={!settings.scenery && 'Turn “Scenery” on to change this.'} title="Match the hour" note="Pictures follow the hour: golden by day, dusk in the evening, candlelight after dark." more="Where you rest and behind Focus. Off, any picture at any hour. Today's page keeps one picture all day, and recaps pick their own." keywords="match the time of day scenery morning evening night dusk golden hour mood">
            <Switch disabled={!settings.scenery} checked={settings.sceneryTime} onCheckedChange={(sceneryTime) => set({ sceneryTime })} />
          </Setting>
          <DimSetting settings={settings} set={set} />
        </Group>

        <Group section="Writing" title="As you write">
          <Setting title="Math as you type" note="End a line with = to see its answer, and Tab writes it in." more="lunch = 25 names a number for the lines below, and units and money work too: 5 km in mi, $40 * 3 in EUR.">
            <Switch checked={settings.calc} onCheckedChange={(calc) => set({ calc })} />
          </Setting>
          <Setting title="Fold headings" note="Click the arrow beside a heading to fold away what is under it." more="Up to the next heading as big, and nothing in the note changes; ⌥⌘[ folds the one you are in." keywords="fold collapse heading section outline hide">
            <Switch checked={settings.foldHeadings !== false} onCheckedChange={(foldHeadings) => set({ foldHeadings })} />
          </Setting>
          <Setting title="Title at the top" note="A note's first line shows faintly at the top once it scrolls away." keywords="title in the top bar">
            <Switch checked={settings.topTitle} onCheckedChange={(topTitle) => set({ topTitle })} />
          </Setting>
          <Setting title="Spellcheck" note="Underline misspelt words; right-click one for what it might be." more={isMac() ? 'The Mac picks the language from what you type.' : 'The gear picks the languages.'} keywords="spelling spell check dictionary language typo">
            {/* On a Mac the system checks in whatever language you type, and ignores a list. */}
            {!isMac() && <SpellLanguages picked={settings.spellLanguages ?? []} disabled={settings.spellcheck === false} />}
            <Switch checked={settings.spellcheck !== false} onCheckedChange={(spellcheck) => set({ spellcheck })} />
          </Setting>
          <Setting title="Word meanings" note="Write one word in quick capture and pause to see its meaning under it." more="From your Mac's own Dictionary, so it works offline. Nothing moves and nothing is saved unless you press Tab. Esc hides it for that word. “Only for Word” waits until you pick the Word kind." keywords="define definition dictionary meaning look up lookup word vocabulary pronunciation quick capture box"
            below={<Choices label="Word meanings" options={meaningChoices} on={(id) => id === (settings.wordMeanings ?? 'one-word')} pick={(wordMeanings) => set({ wordMeanings: wordMeanings as Settings['wordMeanings'] })} />} />
          <Setting title="Vim keys" note="Move and edit with Vim's keys as you write." more="Not in reading mode, while you tidy or decide, or in a board's cards." keywords="vim keys keyboard bindings modal normal insert">
            <Switch checked={vim} onCheckedChange={setVim} />
          </Setting>
          <Setting title="Typewriter scrolling" note="The line you type on stays near the middle, and the page moves instead." more="Clicking, selecting and scrolling leave it alone; not in quick capture, and also in ⌘K." keywords="typewriter scroll scrolling center centre caret cursor line focus writing">
            <Switch checked={typewriter} onCheckedChange={setTypewriter} />
          </Setting>
        </Group>

        <Group section="Sound" title="What you hear">
          <Setting title="Sounds" note="A soft click as you point and scroll, and a sound for each thing you do.">
            <Switch checked={settings.sounds} onCheckedChange={(sounds) => {
              soundOn(sounds)
              if (sounds) chime('on')
              set({ sounds })
            }} />
          </Setting>
          {/* Shown with sounds off too, greyed, so a search still finds them. */}
          <Setting off={!settings.sounds && 'Turn “Sounds” on to change this.'} title="Volume" note="How loud every sound is; let go of the slider to hear it.">
            <SettingSlider disabled={!settings.sounds} min={0} max={1} step={0.05} value={settings.volume} onSave={(volume) => set({ volume })} sample={(volume) => (setVolume(volume), chime('tap'))} />
          </Setting>
          <Setting off={!settings.sounds && 'Turn “Sounds” on to change this.'} title="Session ticking" note="A clock ticks quietly while you focus." more="A little tenser in the last ten seconds. The alarm rings at the end either way. Also in the bubble's right-click menu." keywords="tick while a session runs tick ticking clock focus session timer countdown alarm">
            <Switch disabled={!settings.sounds} checked={settings.sessionTick === true} onCheckedChange={(sessionTick) => {
              if (sessionTick) tickSample(settings.sessionTickSound ?? 'wall', settings.sessionTickVolume ?? 0.5)
              set({ sessionTick })
            }} />
          </Setting>
          <Setting under off={!settings.sounds ? 'Turn “Sounds” on to change this.' : !settings.sessionTick && 'Turn on “Session ticking” to change this.'} title="Ticking volume" note="How loud the ticking is; let go to hear it.">
            <SettingSlider disabled={!settings.sounds || !settings.sessionTick} min={0} max={1} step={0.05} value={settings.sessionTickVolume ?? 0.5} onSave={(sessionTickVolume) => set({ sessionTickVolume })} sample={(level) => tickSample(settings.sessionTickSound ?? 'wall', level)} />
          </Setting>
          <Setting under off={!settings.sounds ? 'Turn “Sounds” on to change this.' : !settings.sessionTick && 'Turn on “Session ticking” to change this.'} title="Ticking sound" note="Which clock ticks; pick one to hear it." keywords="tick ticking clock sound watch wall desk focus session">
            <div inert={!settings.sounds || !settings.sessionTick} className={settings.sounds && settings.sessionTick ? '' : 'opacity-50'}>
              <Chips className="shrink-0" options={TICKS} on={(id) => id === (settings.sessionTickSound ?? 'wall')} pick={(id) => {
                const sessionTickSound = id as TickSound
                tickSample(sessionTickSound, settings.sessionTickVolume ?? 0.5)
                set({ sessionTickSound })
              }} />
            </div>
          </Setting>
          <Setting off={settings.focusShows === 'note' && <BubbleOff set={set} />} title="Gleam on the bubble" note="Now and then a light glides across the bubble, so you don't forget it." more="About every 45 seconds, faster near the end. With “Motion” off, a soft glow instead." keywords="gleam on the session bubble gleam shine reflection sweep glint focus session bubble pill timer attention remind">
            <MiniBubble gleam={settings.sessionGleam !== false} goal="Essay" className="w-44" />
            <Switch checked={settings.sessionGleam !== false} onCheckedChange={(sessionGleam) => set({ sessionGleam })} />
          </Setting>
          <Setting off={settings.focusShows === 'note' && <BubbleOff set={set} />} title="Smoke in the bubble" note="A faint smoke drifts inside the bubble all session; point at this one." more="Stronger under the pointer. Off, only at the start and the end." keywords="smoke on the session bubble smoke glow breathe beam focus session bubble pill timer attention remind">
            <MiniBubble smoke={settings.sessionSmoke !== false} goal="Essay" className="w-44" />
            <Switch checked={settings.sessionSmoke !== false} onCheckedChange={(sessionSmoke) => set({ sessionSmoke })} />
          </Setting>
          <Setting
            off={!settings.sounds && 'Turn “Sounds” on to change this.'}
            title="Sound pack"
            note="Nine characters for the same sounds; point at one to hear it." more="Click to make it yours; the pieces on the right play the one you have."
            keywords={Object.values(PACKS).map((one) => `${one.label} ${one.feel}`).join(' ')}
            below={<div inert={!settings.sounds} className={settings.sounds ? '' : 'opacity-50'}><SoundPacks chosen={settings.soundPack as PackName} /></div>}
          />
        </Group>

        <Group section="What comes back to you" title="Hints and cards">
          <Setting title="Hints" note="How often quick capture shows you something you kept." more="Rare is the point: a hint every time is one you learn to ignore.">
            <SettingSlider min={0} max={0.5} step={0.05} rest={0.1} value={settings.hintRate} onSave={(hintRate) => set({ hintRate })} />
            <span className="w-16 text-right tabular-nums"><Rolling text={settings.hintRate ? `1 in ${Math.round(1 / settings.hintRate)}` : 'never'} /></span>
          </Setting>
          <HintTuning />
          <Setting title="Captures that come back" note="How many captures you never dealt with come back when quick capture opens." more="As cards: a few, never the whole pile." keywords="old captures that come back rot cards">
            <SettingSlider min={0} max={6} step={1} rest={2} value={settings.rotCount} onSave={(rotCount) => set({ rotCount })} />
            <span className="w-16 text-right tabular-nums"><Rolling text={settings.rotCount} /></span>
          </Setting>
          {/* Both come as hints: with hints set to never, they say so and rest. */}
          <Setting off={!settings.hintRate && 'Memories come as hints, and “Hints” is set to never. Move it up to change this.'} title="Memories" note="Some hints are memories, the way Photos brings them back." more="A year ago today, this week in an earlier year, more from one source, each saying which.">
            <Switch disabled={!settings.hintRate} checked={settings.memories} onCheckedChange={(memories) => set({ memories })} />
          </Setting>
          <Setting off={!settings.hintRate && 'Questions come back as hints, and “Hints” is set to never. Move it up to change this.'} title="Questions come back" note="Now and then a question you hold comes back as a hint." more="How long it has been open and how many clues, with a way to add one; rare, never in quiet hours.">
            <Switch disabled={!settings.hintRate} checked={settings.questionsBack} onCheckedChange={(questionsBack) => set({ questionsBack })} />
          </Setting>
          <Setting title="Questions in view" note="Questions you keep in view show small while you capture, ready for a clue." more="Up to twelve, from Questions; also while you tidy.">
            <Switch checked={settings.pinnedQuestions !== false} onCheckedChange={(pinnedQuestions) => set({ pinnedQuestions })} />
          </Setting>
          <Setting title="Recent reaches back" note="How many days the Recent panel lists." more="Newest first, every kind of thing; ⇧⌘Y opens it beside any page.">
            <SettingSlider min={1} max={30} step={1} rest={7} value={settings.recentDays ?? 7} onSave={(recentDays) => set({ recentDays })} />
            <span className="w-16 text-right tabular-nums"><Rolling text={(settings.recentDays ?? 7) === 1 ? '1 day' : `${settings.recentDays ?? 7} days`} /></span>
          </Setting>
        </Group>
        <Group section="What comes back to you" title="Goals">
          <Setting title="Goals at the top" note="Open goals in a slim strip on Home and Today's page." more="The days left, a line of the time gone, and when you last logged." keywords="goals strip home today countdown">
            <Switch checked={settings.goalStrip !== false} onCheckedChange={(goalStrip) => set({ goalStrip })} />
          </Setting>
          <Setting title="Time as dots" note="How far through the day, week, month and year you are, in the menu bar." more="As beads, or as plain bars." keywords="tempus menu bar day week month year dots bars progress">
            <TempusSample dots={settings.tempusDots === true} />
            <Switch checked={settings.tempusDots === true} onCheckedChange={(tempusDots) => set({ tempusDots })} />
          </Setting>
          <Setting title="Marked days" note="The next three marked days in the menu bar's menu, with the days to go." more="A day is marked from its page, a right-click on any day, or !milestone in quick capture." keywords="marked days in the menu bar milestones marked days exam launch birthday menu bar countdown">
            <Switch checked={settings.milestonesInMenu !== false} onCheckedChange={(milestonesInMenu) => set({ milestonesInMenu })} />
          </Setting>
          <Setting title="Goal on screen" note="A small card on your desktop with the days left to each goal." more="“Now and then” shows it once a day and every few hours, for a minute; in a goal's last week it stays. A goal can choose its own." keywords="goals beacon on screen window stack cards always sometimes off">
            <Chips className="shrink-0" options={[{ id: 'always', label: 'Always' }, { id: 'sometimes', label: 'Now and then' }, { id: 'off', label: 'Off' }]}
              on={(id) => id === (settings.goalBeacon ?? 'sometimes')} pick={(goalBeacon) => set({ goalBeacon: goalBeacon as Settings['goalBeacon'] })} />
          </Setting>
          <Setting title="Goal nudges" note="A goal with no progress logged for a week says so in quick capture." more="More often as the quiet goes on or the day comes near; never in quiet hours." keywords="goals nudge reminder log">
            <Switch checked={settings.goalNudges !== false} onCheckedChange={(goalNudges) => set({ goalNudges })} />
          </Setting>
        </Group>
        <Group section="What comes back to you" title="Every day">
          <Setting title="Close the day" note="After this time each evening, Vigil offers to close the day." more="What got done, where each open task goes, anything on your mind for tomorrow, a line for today's page and tomorrow's first task. ⌘K has it any time." keywords="evening close day shutdown wrap up review plan tomorrow frog first task">
            {(settings.closeDay !== false || settings.tomorrowBox !== false) && <TimeField label="Offer it after" value={settings.closeDayAt ?? '18:00'} onChange={(closeDayAt) => set({ closeDayAt })} />}
            <Switch checked={settings.closeDay !== false} onCheckedChange={(closeDay) => set({ closeDay })} />
          </Setting>
          <Setting under title="For tomorrow, at night" note="After that time, Today ends with a “For tomorrow” box for what is on your mind." more="Until 4 in the morning, on Today and Today's page; each line becomes a task for tomorrow. Writing it down helps you sleep." keywords="tomorrow bedtime worry list night evening sleep to-do brain dump"
            below={<TomorrowPreview at={settings.closeDayAt ?? '18:00'} on={settings.tomorrowBox !== false} />}>
            <Switch checked={settings.tomorrowBox !== false} onCheckedChange={(tomorrowBox) => set({ tomorrowBox })} />
          </Setting>
          <MacCalendarSetting on={!!settings.macCalendar} set={(macCalendar) => set({ macCalendar })} />
          <Setting title="Weekly digest" note="On Sundays, Home sums up your week." more="What you caught, kept, reviewed and finished, with the week's page a click away. From 6 in the evening a Mac notification says it too, never in quiet hours; nothing leaves this Mac." keywords="weekly digest sunday summary week review caught kept reviewed finished">
            <Switch checked={settings.weeklyDigest !== false} onCheckedChange={(weeklyDigest) => set({ weeklyDigest })} />
          </Setting>
          {/* Seen as it is, from here: last month's cards a click away. */}
          <Setting title={WRAP_SETTING.title} note={WRAP_SETTING.note} more={WRAP_SETTING.more} keywords="wrapped month recap story spotify review cards end of month offer"
            below={<Button size="sm" variant="ghost" className="h-7 px-2 text-control" onClick={() => openWrap(monthToWrap())}>Show it now</Button>}>
            <Switch checked={settings.wrapOffer !== false} onCheckedChange={(wrapOffer) => set({ wrapOffer })} />
          </Setting>
          <Setting title="Days you opened Vigil" note="Home's month calendar marks each day you opened Vigil, greener on busier days." more="The same as “Days opened” above the calendar." keywords="days opened heat map heatmap streak calendar month home marks">
            <Switch checked={settings.monthOpened === true} onCheckedChange={(monthOpened) => set({ monthOpened })} />
          </Setting>
          <Setting title="Captures each day" note="The same calendar marks how much you captured each day, bluer on fuller days, and outlines the days with none." more="The same as “Captures” above the calendar. Both marks can show at once." keywords="captures heat map heatmap gaps calendar month home marks per day">
            <Switch checked={settings.monthCaptures === true} onCheckedChange={(monthCaptures) => set({ monthCaptures })} />
          </Setting>
          <Setting title="Morning sort" note="Each morning, Home offers about ten minutes sorting your Inbox." more="“Sort this out” over the Inbox, a line a capture, with a gentle ten-minute timer. Stop any time: what is left waits. ⌘K has it any time." keywords="morning sort inbox ten minutes triage process daily timer">
            <Switch checked={settings.morningSort !== false} onCheckedChange={(morningSort) => set({ morningSort })} />
          </Setting>
          <Setting title="Put old captures away" note="Untouched captures move to Archived after this long, **except pinned ones and ones with a reminder**." more="At the start of a day, as Arc tidies old tabs. The Inbox says how many went, with Undo, and Archived keeps them all; archived ones no longer come back as hints or memories." keywords="archive auto old captures inbox tidy put away stale untouched">
            <Chips className="shrink-0" options={[{ id: '14', label: '14 days' }, { id: '30', label: '30 days' }, { id: '0', label: 'Never' }]}
              on={(id) => Number(id) === (settings.autoArchive ?? 0)} pick={(days) => (set({ autoArchive: Number(days) }), setTimeout(() => void window.api.vigil('putaway:now'), 400))} />
          </Setting>
          <PutAwayBefore />
          <Setting title="Day ends at" note="Today counts the hours left until then, beside the hours your tasks will take." more="Write ~30m or ~1h on a task to give it a length." keywords="day end evening hours left planned estimate length time budget">
            <TimeField label="Day ends at" value={settings.dayEnd ?? '22:00'} onChange={(dayEnd) => set({ dayEnd })} />
          </Setting>
          <WorkHoursSetting hours={settings.workHours ?? 8} set={(workHours) => set({ workHours })} />
          <Setting title="Back after a while" note="Away this long, Vigil opens with only capture and Today, so coming back is not a wall of everything." more="The rest stays out of sight until the next start, and “Show everything”, at the foot of the sidebar or in ⌘K, brings it back at once." keywords="return away gap long break holiday quiet calm come back fresh">
            <SettingSlider min={2} max={30} step={1} rest={7} value={settings.gapDays ?? 7} onSave={(gapDays) => set({ gapDays })} />
            <span className="w-16 text-right tabular-nums"><Rolling text={`${settings.gapDays ?? 7} days`} /></span>
          </Setting>
          <Setting title="Daily tidy" note="Once a day, a few minutes tidying your latest captures, deciding nothing." more="Add tags, bold a line, fold a section, cross off what is done; never in quiet hours.">
            <Switch checked={settings.dailyTidy} onCheckedChange={(dailyTidy) => set({ dailyTidy })} />
          </Setting>
        </Group>
        <Group section="What comes back to you" title="Once a week">
          <Setting title="Habits and goals at once" note="Past this many routines and goals going at once, the week's and month's pages say so, softly." more="Each habit and goal is asked “Keep or drop” once: daily habits on the week's page, the rest on the month's. Nothing is ever stopped." keywords="cap limit active habits routines goals areas keep drop review too many">
            <Chips className="shrink-0" options={[{ id: '5', label: '5' }, { id: '7', label: '7' }, { id: '10', label: '10' }, { id: '0', label: 'No limit' }]}
              on={(id) => Number(id) === (settings.activeCap ?? 7)} pick={(cap) => set({ activeCap: Number(cap) })} />
          </Setting>
          <Setting title="Deciding day" note="On the day you pick, choose what waited: keep it, finish it or move it to the Bin." more="What you set aside and what has waited longest. Old captures that come back only ask for a tidy, and never in quiet hours.">
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
          <Setting title="Quiet hours" note="No private notes, old captures, nudges or alerts come up unasked." more="Goal cards wait to come out, unless set to “Always” or in their last week; other pins stay, and search and lists still show everything.">
            <TimeField label="Quiet hours start" value={settings.quietStart} onChange={(quietStart) => set({ quietStart })} />
            <span className="text-muted-foreground">to</span>
            <TimeField label="Quiet hours end" value={settings.quietEnd} onChange={(quietEnd) => set({ quietEnd })} />
          </Setting>
          <Setting title="Safe mode" note="Nothing comes up unasked at all, for screen shares; ⌥⌘S from anywhere." more="No hints, old captures coming back or pins on Home, and sticky notes, goal cards, the session bubble and notes in their own windows hide.">
            <Switch checked={settings.safeMode} onCheckedChange={(safeMode) => {
              set({ safeMode })
              // The switch and its note say it; ⌥⌘S from anywhere keeps its toast.
              quietly(() => set({ safeMode: !safeMode }))
            }} />
          </Setting>
          <Setting title="Open at login" note="Vigil starts quietly with your Mac, in the Dock and the menu bar." more="No window opens. ⌘. works straight away, and your sticky notes are back where you left them. Opening Vigil yourself, or clicking it in the Dock, shows the main window.">
            <Switch checked={settings.openAtLogin !== false} onCheckedChange={(openAtLogin) => set({ openAtLogin })} />
          </Setting>
          <Setting title="Show sticky notes" note="Every sticky note out, or all put away where they were." more="Goal cards go with them. ⌃⌥⌘N from anywhere.">
            <Switch checked={settings.stickiesShown} onCheckedChange={(stickiesShown) => set({ stickiesShown })} />
          </Setting>
          <Setting title="Sticky note material" note="What sticky notes and goal cards look like on the desktop." keywords="sticky notes are made of paper frost glass sticky notes frosted glass blur wallpaper desktop transparent paper vibrancy"
            below={<Choices label="Sticky note material" options={stickyChoices} on={(id) => id === (settings.stickiesFrosted === false ? 'paper' : settings.stickiesGlass ? 'glass' : 'frost')}
              pick={(id) => set({ stickiesFrosted: id !== 'paper', stickiesGlass: id === 'glass' })} />} />
          <Setting title="Stickies stir" note="Every half hour or so, one sticky lifts a little, so your eye finds it." more="Like paper in a draught. Never while you write in it." keywords="stickies stir now and then sticky notes stir move motion wiggle attention banner blindness notice">
            <StirSample on={settings.stickiesStir !== false} />
            <Switch checked={settings.stickiesStir !== false} onCheckedChange={(stickiesStir) => set({ stickiesStir })} />
          </Setting>
          <Setting title="Hide from recordings" note="A hidden window is blank in shares, recordings and screenshots, while you still see it." more="All are hidden to start; turn one off for a demo or a Loom. ⌘K shows or hides them all at once." keywords="hide from screen recordings and shares record recording screen share sharing zoom loom demo screenshot capture hide show main window quick capture sticky notes goal cards session bubble">
            {/* What the windows are now: all seen, or some blank to a camera. */}
            <AliveIcon icon={RECORDING_KINDS.some((kind) => !recorded[kind]) ? CameraOffIcon : CameraIcon} size={16} className="text-muted-foreground" />
          </Setting>
          {([
            ['main', 'The main window', 'Notes and drawings in windows of their own too.'],
            ['box', 'Quick capture', 'The box you write in, from ⌘. or the menu bar.'],
            ['stickies', 'Sticky notes and goal cards', 'And a picture opened from a sticky.'],
            ['bubble', 'The session bubble', 'And the glow round the screen when a session ends.']
          ] as const).map(([kind, title, note]) => (
            <Setting key={kind} under title={title} note={note} keywords="record recording screen share sharing hide show blank zoom loom demo">
              <Switch data-recording={kind} checked={!recorded[kind]} onCheckedChange={(hide) => set({ inRecordings: { ...recorded, [kind]: !hide } })} />
            </Setting>
          ))}
        </Group>

        <Group section="Review" title="Remembering">
          <Setting title="How much to remember" note="How much you want to still know when a card comes back." more="Higher means more reviews; 90% is where most land.">
            <SettingSlider min={0.8} max={0.97} step={0.01} rest={0.9} value={settings.retention} onSave={(retention) => set({ retention })} />
            <span className="w-10 text-right tabular-nums"><Rolling text={`${Math.round(settings.retention * 100)}%`} /></span>
          </Setting>
          <Setting title="Daily limits" note="New cards and reviews a day, so each day's reviews stay finishable." more="An uncapped day becomes a wall you stop opening. Cards for a tag with an exam date are paced by the date instead.">
            <NumberSetting label="New cards a day" value={settings.newPerDay} onSave={(newPerDay) => set({ newPerDay })} /> new
            <NumberSetting label="Reviews a day" value={settings.reviewsPerDay} onSave={(reviewsPerDay) => set({ reviewsPerDay })} /> reviews
          </Setting>
          <CapTuning />
          <Setting title="Review reminder" note="A reminder at the time you pick, when cards are due." more="A small card in the corner, like “12 cards, about 6 minutes” (a Mac notification when the screen is locked). Clicking it opens Review. Once a day, never in quiet hours or safe mode. Miss a day and nothing is owed: the cards wait." keywords="review reminder notification study time daily">
            {settings.reviewReminder && (
              <TimeField label="Reminder time" value={settings.reviewReminder} onChange={(reviewReminder) => set({ reviewReminder })} />
            )}
            <Switch aria-label="Review reminder" checked={!!settings.reviewReminder} onCheckedChange={(on) => set({ reviewReminder: on ? '09:00' : null })} />
          </Setting>
          <Setting title="Fit to my memory" note="After a thousand reviews, Vigil can learn how long cards last for you." more="From whether you remembered each one next time, after each first grade. Put back to the defaults whenever you like." keywords="fit to how I remember fsrs optimise optimize fit parameters scheduler memory">
            <FitToMe />
          </Setting>
        </Group>
        <Group section="Review" title="Exams">
          <Setting title="Exam nudges" note="A tag with an exam date says so in quick capture when its cards fall behind." more="Set the date on its page in Tags; once a day at most for each tag, never in quiet hours.">
            <Switch checked={settings.examNudges} onCheckedChange={(examNudges) => set({ examNudges })} />
          </Setting>
        </Group>

        <Group section="Tasks" title="Today">
          <Setting title="A short Today" note="Today holds one big thing and this many more before it says the day is full." more="Only a nudge: past it, Today says how many over, and you can still add as many as you like." keywords="today cap limit few tasks one big thing short day too many">
            <SettingSlider min={3} max={6} step={1} rest={3} value={settings.todayCap ?? 3} onSave={(todayCap) => set({ todayCap })} />
            <span className="w-28 text-right tabular-nums"><Rolling text={`1 + ${settings.todayCap ?? 3} tasks`} /></span>
          </Setting>
          <Setting title="Carried over too often" note="After a task is carried over this many times, it asks: pick a date, drop it, or move it to Someday." more="Each day a task is left undone past its day counts once, and so does each time it is moved later. Its row shows the count." keywords="carry over rollover rolled moved again postponed reschedule someday drop">
            <SettingSlider min={2} max={10} step={1} rest={5} value={settings.carryAsk ?? 5} onSave={(carryAsk) => set({ carryAsk })} />
            <span className="w-20 text-right tabular-nums"><Rolling text={`${settings.carryAsk ?? 5} times`} /></span>
          </Setting>
        </Group>

        <Group section="Tasks" title="Reminders">
          <Setting title="At a task's time" note="What happens when a task's time comes." more="“Pull” moves the task to the top of Today. “Quiet” counts it in the menu bar, silently. “Alerts” also sends a notification at its time. A task can choose its own; nothing comes in quiet hours." keywords="when a task's time comes">
            <Chips className="shrink-0" options={[{ id: 'pull', label: 'Pull' }, { id: 'quiet', label: 'Quiet' }, { id: 'alerts', label: 'Alerts' }]}
              on={(id) => id === settings.notify} pick={(notify) => set({ notify: notify as Settings['notify'] })} />
          </Setting>
        </Group>
        <SiteBlockGroup settings={settings} set={set} />

        <Group section="Calendar" title="Time zones">
          <Setting title="Show a second time zone" note="The Calendar's day and week get a second column of hours, for another place's time." more="Labelled with the zone's short name, like EDT or CEST, in quieter ink beside your own hours. Pick it by city." keywords="time zone timezone second clock world abroad travel utc gmt hours column calendar">
            <SecondZoneSetting value={settings.secondZone ?? null} set={(zone) => set({ secondZone: zone ?? '' })} />
          </Setting>
        </Group>

        <Group section="Tasks" title="Breaks and sleep">
          <Setting title="Start the next round by itself" note="When a break ends, the session before it starts again, with no click." more="Off, the bubble asks with “Go again”. On, it still asks if nobody has touched the Mac for two minutes as the break ends. Rounds set as “4x25” go on by themselves the same way, and ask the same way when nobody is there." keywords="auto start next round session after break pomodoro automatic again focus continue">
            <Switch checked={settings.autoNextRound === true} onCheckedChange={(autoNextRound) => set({ autoNextRound })} />
          </Setting>
          <Setting title="When the Mac sleeps" note="What happens to a focus session if the Mac goes to sleep during it." more="“Finish” counts it up to the moment the Mac slept. “Abandon” keeps it in the log but counts it nowhere. “Do nothing” keeps the timer on real time, so a lid closed overnight counts the night. Vigil says which once the Mac wakes." keywords="sleep mac lid close suspend wake focus session timer abandon finish end">
            <Chips className="shrink-0" options={[{ id: 'finish', label: 'Finish the session' }, { id: 'abandon', label: 'Abandon the session' }, { id: 'nothing', label: 'Do nothing' }]}
              on={(id) => id === (settings.sessionSleep ?? 'finish')} pick={(sessionSleep) => set({ sessionSleep: sessionSleep as Settings['sessionSleep'] })} />
          </Setting>
        </Group>

        <Group section="Writing" title="With each capture">
          <Setting title="Weather" note="Each capture keeps the weather when you caught it, like 12°C, light rain." more="Today's brief shows it now. It asks wttr.in, which guesses your town from your connection with no account or location permission; left out when offline.">
            <Switch checked={settings.weather} onCheckedChange={(weather) => set({ weather })} />
          </Setting>
        </Group>

        <Group section="Help" title="Getting started">
          <Setting title="Welcome" note="The two-minute start: the one key, your first capture, and how things come back." keywords="tour welcome onboarding start intro replay">
            <Button variant="outline" size="sm" onClick={playWelcome}>Show it again</Button>
          </Setting>
          <Setting title="Tour" note="Five places to know, each lit up in turn." more="The Inbox, Review, quick capture, search and Getting started." keywords="tour coach marks show me around where things are">
            <Button variant="outline" size="sm" onClick={() => window.dispatchEvent(new CustomEvent('vigil:tour-stops'))}>Show me around</Button>
          </Setting>
          <Setting title="Sandbox" note={SANDBOX ? "You're in it now: a peek into someone else's book." : "A peek into someone else's book, to try anything on."} more="Their reading, films, questions and goals. Your own notes stay exactly as they are." keywords="sandbox practice examples demo try sample playground peek someone">
            {SANDBOX ? (<>
              <Button variant="outline" size="sm" onClick={() => void leaveSandbox()}>Back to my notes</Button>
              <HoldButton hint="Every example back to how it began" done="Resetting…" onHold={() => void startSandboxOver()}>Hold to reset</HoldButton>
            </>) : (
              <Button variant="outline" size="sm" onClick={() => void enterSandbox()}>Open the sandbox</Button>
            )}
          </Setting>
          <OnboardingRows />
          <Setting title="Shortcut sheet" note="Every shortcut over the window you are in, whenever you are not typing.">
            <Kbd>{keyFor('?') || 'None'}</Kbd>
          </Setting>
        </Group>

        <Group section="Import and backups" title="Books">
          <BookRows />
        </Group>
        <Group section="Import and backups" title="Import and export">
          <Setting title="Import" note="Notes from Obsidian or Notion, highlights and cards." more="A vault or an unzipped Markdown export, Readwise or Kindle highlights, Markdown files, bookmarks or Anki cards." keywords="import obsidian vault notion export readwise kindle markdown bookmarks anki bring move">
            <ImportButton what="vault">Obsidian or Notion…</ImportButton>
            <ImportButton what="files">Files…</ImportButton>
            {!SANDBOX && <Button variant="outline" size="sm" onClick={() => askBook('import')}>Into another book…</Button>}
          </Setting>
          <Setting title="Export everything" note="All of it as JSON and Markdown, in a folder you choose." more="Yours to read without this app.">
            <ExportButton />
          </Setting>
          <Setting title="Unused pictures and files" note="Pictures and files no note points at any more, to move to the Bin." more="Nor any old version or page. You see them first and keep any you like; the rest go to the Bin, never deleted outright." keywords="clear clean space disk images attachments trash bin">
            <Button variant="outline" size="sm" onClick={() => window.dispatchEvent(new CustomEvent('vigil:unused'))}>Find them</Button>
          </Setting>
        </Group>
        <Group section="Import and backups" title="Backups">
          {/* Always on: there is no switch, so the row says so and where the copies go. */}
          <Setting title="Daily backup" note="Every day, a full copy of everything goes to the folder below." more="Always on, private notes, pictures and files included; the last 30 daily copies are kept, and pictures and files are never removed." below={<BackupPlace />} keywords="backup backups icloud copy daily database safe" />
          {!SANDBOX && <Setting title="Restore from a backup" note="Go back to one of those daily copies. What you have now is saved first, **then Vigil starts again** on the copy you chose." more="So a restore can be undone the same way. Also in ⌘K." keywords="restore backup undo go back copy recover">
            <Button variant="outline" size="sm" onClick={() => void window.api.restoreBackup()}>Restore…</Button>
          </Setting>}
          <Setting title="Markdown copies" note="Each capture is also kept there as a plain Markdown file, **removed within the hour if you turn this off**." more="Never a private one or one in the Bin; the daily backup goes on either way." keywords="backup markdown copies plain text files icloud">
            <Switch checked={settings.markdownCopies !== false} onCheckedChange={(markdownCopies) => set({ markdownCopies })} />
          </Setting>
        </Group>

        <Group section="Keys" title="Every key">
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

/**
 * Each book: its name to change, its folder to see, and, for any but My book
 * and the one open, deleting it, held, with a whole copy kept first.
 */
function BookRows(): React.JSX.Element {
  const shelf = useShelf()
  const rename = async (id: string, name: string): Promise<void> => {
    const now = (await ask('Rename the book', name, undefined, name))?.trim()
    if (now && now !== name) void renameBook(id, now).then((ok) => ok && (chime('settled'), toast(`Now called ${now}`)))
  }
  const remove = async (id: string, name: string): Promise<void> => {
    const kept = await deleteBook(id).catch(() => null)
    // Nothing goes until its whole copy is safe with the backups: that is the one way it fails.
    if (!kept) return refuse(`${name} wasn't deleted: its copy couldn't be made with your backups, so it was left as it was. Check the backup folder below, then try again`, 'error')
    chime('away')
    toast(`${name} is deleted. A whole copy of it is kept with your backups, under deleted books`, undefined, 'info')
  }
  return (
    <>
      <Setting title="Books" note="Each book is a Vigil of its own, with its own notes and settings." more="Its own pictures and Getting started; your look comes along, and every book's notes are backed up each day they change. Give each a colour to tell them apart at a glance." keywords="books book vault vaults switch new another scratch library workspace">
        {!SANDBOX && <Button variant="outline" size="sm" onClick={() => void askNewBook()}>New book…</Button>}
        <Button variant="outline" size="sm" onClick={() => askBook('switch')}>Switch…</Button>
      </Setting>
      {shelf?.books.map((book) => (
        <Setting key={book.id} under title={book.name}
          note={book.id === 'default' ? `Your first book, which cannot be deleted${book.current ? ', open now' : ''}.` : `Made ${book.createdAt ? new Date(book.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'here'}${book.current ? ', open now' : ''}.${!SANDBOX && book.id !== 'default' && !book.current ? ' **Deleting it deletes everything in it, for good.**' : ''}`}
          more={book.id === 'default' ? 'Where Vigil has always kept your notes.' : book.current ? 'Switch to another book to delete this one.' : undefined}
          keywords="book rename reveal finder delete colour color accent tint space arc"
          below={SANDBOX ? undefined : <div className="mt-2 -ml-1"><HueDots id={book.id} value={book.color} /></div>}>
          {!SANDBOX && <Button variant="ghost" size="sm" onClick={() => void rename(book.id, book.name)}>Rename</Button>}
          <Button variant="ghost" size="sm" onClick={() => void revealBook(book.id)}>Show in Finder</Button>
          {!book.current && <Button variant="ghost" size="sm" onClick={() => void switchBook(book.id)}>Open</Button>}
          {!SANDBOX && book.id !== 'default' && !book.current && (
            <HoldButton hint={`${book.name} and everything in it, for good`} done="Deleting…" onHold={() => void remove(book.id, book.name)}>Hold to delete</HoldButton>
          )}
        </Setting>
      ))}
    </>
  )
}

/**
 * The welcome's theme dial, here too: drag it round, scroll over it, or ← and
 * → once it is picked; each theme is worn as it comes to the top, with a tick
 * per detent, and kept once the dial rests for half a second.
 */
function ThemeDialRow(): React.JSX.Element {
  const keep = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(keep.current), [])
  return (
    <div data-theme-dial className="mt-2 flex justify-center py-3">
      <ThemeDial calm size={168} onPick={(theme) => {
        clearTimeout(keep.current)
        keep.current = setTimeout(() => {
          applyTheme(theme)
          // The picker beside it, and the other windows, follow.
          window.dispatchEvent(new StorageEvent('storage', { key: 'theme' }))
        }, 500)
      }} />
    </div>
  )
}

/**
 * Where the backups go (iCloud Drive when there is one, otherwise beside the
 * app's data, or a folder you chose), when the last one was made, and, when
 * they are failing, why, on a line of its own you cannot miss.
 */
function BackupPlace(): React.JSX.Element {
  const [where, setWhere] = useState('')
  const [status, setStatus] = useState<{ at: number | null; failing: string | null; chosen: boolean } | null>(null)
  // Read again when a backup is chosen elsewhere or main says how they are going, and each minute for the "ago".
  const [, setTick] = useState(0)
  useEffect(() => {
    const read = (): void => {
      void vigil.backupsWhere().then(setWhere)
      void vigil.backupStatus().then(setStatus)
    }
    read()
    const minute = setInterval(() => setTick((n) => n + 1), 60000)
    window.addEventListener('vigil:backups', read)
    return () => (clearInterval(minute), window.removeEventListener('vigil:backups', read))
  }, [])
  const choose = async (usual = false): Promise<void> => {
    const next = await chooseBackupFolder(usual)
    if (next) setStatus(next)
  }
  return (
    <div className="mt-1.5 space-y-1.5" data-backup-status={status?.failing ? 'failing' : status?.at ? 'ok' : 'none'}>
      {status?.failing && (
        <p className="flex items-start gap-1.5 text-sm font-medium text-[var(--tt-color-text-red)]">
          <AliveIcon play icon={InfoCircleIcon} size={16} className="mt-px shrink-0" />
          <span><b className="font-semibold">Backups have stopped:</b> {status.failing}.{status.at ? ` The last good one was ${backedUpAgo(status.at)}.` : ''}</span>
        </p>
      )}
      {!status?.failing && (
        <p className="text-sm text-foreground">{status?.at ? <><b className="font-semibold">Last backup {backedUpAgo(status.at)}.</b> </> : status ? <b className="font-semibold">No backup yet. The first one is on its way. </b> : null}</p>
      )}
      <p className="text-xs text-muted-foreground">Backups go to <span className="font-mono break-all text-foreground/80">{where.includes('CloudDocs') ? 'iCloud Drive › mindflow' : where || '…'}</span></p>
      {!SANDBOX && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          <Button variant="outline" size="sm" data-backup-now onClick={() => void working(vigil.backupNow()).then((next) => { setStatus(next); if (next.failing) refuse(`That backup did not work: ${next.failing}`); else chime('done') })}>Back up now</Button>
          <Button variant="ghost" size="sm" onClick={() => void vigil.showBackups()}>Show in Finder</Button>
          <Button variant="outline" size="sm" onClick={() => void choose()}>Choose another folder…</Button>
          {status?.chosen && <Button variant="ghost" size="sm" onClick={() => void choose(true)}>Use the usual place</Button>}
        </div>
      )}
    </div>
  )
}

/** The keys, as an island, each changeable: those matching the search, or all of them with their own filter. */
function ShortcutRows(): React.JSX.Element | null {
  const { query, all } = useContext(Query)
  return <KeysEditor search={all ? '' : query} />
}

/**
 * Themes from a file: JSON of the colours (bg, ink, accent and the nine hues,
 * or CSS variables by name) or a CSS file of variables. Each joins the theme
 * list, and can be taken out again here.
 */
function ImportedThemes(): React.JSX.Element {
  const [themes, setThemes] = useState(customThemes)
  const file = useRef<HTMLInputElement>(null)
  // The theme tiles above read the list again too.
  const refresh = (): void => {
    setThemes(customThemes())
    window.dispatchEvent(new StorageEvent('storage', { key: 'custom-themes' }))
  }
  return (
    <Setting
      title="Colours from a file"
      keywords="imported themes json css bg ink accent"
      note="Make your own theme in a small JSON or CSS file and load it here." more="It joins the themes above."
      below={<>
        <ThemeFileGuide />
        {themes.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
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
      </>}
    >
      <input ref={file} type="file" accept=".json,.css,application/json,text/css" className="hidden" onChange={(event) => {
        const picked = event.target.files?.[0]
        event.target.value = ''
        if (!picked) return
        void picked.text().then((text) => {
          const made = importTheme(picked.name, text)
          if (typeof made === 'string') return refuse(made, 'error')
          refresh()
          applyTheme(made.id)
          chime('settled')
          toast(`Imported ${made.name} and switched to it`, () => (made.undo(), refresh()))
        })
      }} />
      <Button variant="ghost" size="sm" onClick={saveStarterTheme}>Get a starter file…</Button>
      <Button variant="outline" size="sm" onClick={() => file.current?.click()}>Load a theme file…</Button>
    </Setting>
  )
}

/**
 * A heading over a line of text, set the way a note sets them, under the font
 * settings (the line alone under the size): they mostly change notes, so
 * without it a pick would show little here.
 */
function Sample({ text = false }: { text?: boolean }): React.JSX.Element {
  return (
    // A small page of its own, set apart from the words about it: the sample
    // reads as a sample, not as more of the setting's description.
    <div className="mt-3 mb-1 rounded-lg border border-border/60 bg-background/60 px-4 py-3 text-foreground" style={{ fontSize: 'calc(1rem * var(--mf-text-scale, 1))' }}>
      {!text && <p className="truncate text-[1.4375em] leading-tight font-semibold tracking-[-0.018em] [font-variation-settings:'SOFT'_50,'WONK'_1]" style={{ fontFamily: 'var(--mf-heading-font, var(--mf-font))' }}>How the system holds up</p>}
      <p className={`truncate ${text ? '' : 'mt-1.5'}`} style={{ fontFamily: 'var(--mf-font, "Fraunces Variable", Georgia, serif)' }}>The quick brown fox jumps over the lazy dog.</p>
    </div>
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
      Only {tuning.stopped} of the {tuning.shown} hints this past month stopped you, so half as many are being shown: 1 in {Math.round(1 / tuning.rate)}. It goes back up when they start landing again.
    </p>
  )
}

/**
 * The folders Scenery takes its pictures from, each shown with how many are
 * ready and a strip of a few of them, and a way to add another.
 */
function SceneryFolders({ folders, on, onSave }: { folders: string[]; on: boolean; onSave: (folders: string[]) => void }): React.JSX.Element {
  // Asked again every second or two while a scan runs, since nothing else
  // says when it is done: the count climbs and the orb goes when it ends.
  const [ask, setAsk] = useState(0)
  const found = useLive(() => (on && folders.length ? vigil.scenery(folders) : Promise.resolve(null)), null as Awaited<ReturnType<typeof vigil.scenery>> | null, [on, JSON.stringify(folders), ask])
  useEffect(() => {
    if (!found?.scanning) return
    const timer = setTimeout(() => setAsk((n) => n + 1), 1500)
    return () => clearTimeout(timer)
  }, [found, ask])
  return (
    <Setting
      title="Folders"
      note="Where the pictures come from; they stay where they are." more="Vigil keeps small copies and spots new ones on its own."
      keywords="scenery folder pictures images add remove choose"
      below={<FolderStrips folders={folders} scenes={found?.scenes ?? []} scanning={!!found?.scanning} onSave={onSave} />}
    >
      {/* The first look through a folder makes its small copies: a real wait,
          said by the bare orb beside the button. */}
      {on && found?.scanning && <Tip label="Making smaller copies of new pictures"><span role="status" aria-label="Making copies" className="flex size-7 items-center justify-center"><Orb state="searching" /></span></Tip>}
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

/** Dimness, with a strip of a real picture under it that dims as the slider moves. */
function DimSetting({ settings, set }: { settings: Settings; set: (patch: Partial<Settings>) => void }): React.JSX.Element {
  const [live, setLive] = useState<number | null>(null)
  useEffect(() => setLive(null), [settings.sceneryDim])
  const dim = live ?? settings.sceneryDim
  return (
    <Setting off={!settings.scenery && 'Turn “Scenery” on to change this.'} title="Dimness" note="How far the pictures fade toward the page colour." more="Under words they fade further, as below." keywords="scenery dim darken fade brightness opacity preview"
      below={<DimPreview dim={dim} on={settings.scenery} folders={settings.sceneryFolders} />}>
      <SettingSlider disabled={!settings.scenery} min={0} max={0.9} step={0.05} rest={0.5} value={settings.sceneryDim} onLive={setLive} onSave={(sceneryDim) => set({ sceneryDim })} />
      <span className="w-10 text-right tabular-nums"><Rolling text={`${Math.round(dim * 100)}%`} /></span>
    </Setting>
  )
}

/**
 * The folder celebrations play from. Unlike Scenery and Covers nothing is
 * copied: the files are played as they are, so a GIF keeps moving.
 */
function CelebrationsFolder({ folder, on, onSave }: { folder: string; on: boolean; onSave: (folder: string) => void }): React.JSX.Element {
  const found = useLive(() => (on && folder ? vigil.celebrations(folder) : Promise.resolve(null)), null as Awaited<ReturnType<typeof vigil.celebrations>> | null, [on, folder])
  return (
    <Setting
      off={!on && 'Turn “Celebrate milestones” on to change this.'}
      title="Celebrations folder"
      note={`GIFs, pictures and short clips for a moment set to “Your file”${on && found ? `, ${found.length} ready` : ''}.`}
      more="One at random, for a moment with no file of its own, and when Giphy cannot be reached. Under 25 MB and 20 seconds, left where they are, unchanged; a see-through one comes without a card."
      keywords="celebrations celebrate folder gif memes videos clips pictures choose remove"
      below={folder && (
        <div className="mt-2 flex flex-col gap-1">
          <span className="flex items-center gap-2 rounded-md border py-1 pr-1 pl-2.5 text-control">
            <span className="min-w-0 flex-1 truncate" title={folder}>{folder.split('/').slice(-2).join('/')}</span>
            <InFinder folder={folder} />
            <button type="button" disabled={!on} aria-label={`Remove ${folder}`} className="rounded-full disabled:pointer-events-none disabled:opacity-50 p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => {
              onSave('')
              chime('away')
              toast(`Removed ${folder.split('/').pop()}`, () => onSave(folder))
            }}>
              <X className="size-3" />
            </button>
          </span>
        </div>
      )}
    >
      <Button variant="outline" size="sm" disabled={!on} onClick={() => void vigil.sceneryFolder().then((chosen) => {
        if (!chosen) return
        if (chosen === folder) return refuse('That folder is already chosen')
        onSave(chosen)
        chime('settled')
        toast(`Celebrating with ${chosen.split('/').pop()}`, () => onSave(folder))
      })}>
        <FolderPlus className="size-4" /> {folder ? 'Choose another…' : 'Choose a folder…'}
      </Button>
    </Setting>
  )
}

/** Page hints and Getting started, with what the main process says of them. */
function OnboardingRows(): React.JSX.Element | null {
  const state = useOnboarding()
  if (!state) return null
  return (
    <>
      <Setting title="What pages are for" note="One line the first time you reach most pages, saying what it is for." keywords="page hints tips help first time page introductions">
        {state.hintsSeen.length > 0 && <Button variant="outline" size="sm" onClick={() => void onboarding.set({ hintsSeen: [], pageHints: true }).then(() => toast('Each page will say what it is for again'))}>Show them again</Button>}
        <Switch checked={state.pageHints} onCheckedChange={(on) => void onboarding.set({ pageHints: on })} />
      </Setting>
      {!state.sandbox && state.welcomed && !(state.doneAt && Date.now() - new Date(state.doneAt).getTime() > LINGER) && (
        <Setting title="Getting started" note="A short list of first steps on Home that tick themselves as you go." more="The list goes a few days after the last." keywords="getting started checklist onboarding">
          {state.hidden ? <Button variant="outline" size="sm" onClick={() => void onboarding.set({ hidden: false }).then(() => toast('Getting started is back on Home'))}>Show it</Button> : <span className="text-control text-muted-foreground">On Home</span>}
        </Setting>
      )}
    </>
  )
}

const MOMENT_NAMES: [MomentKind, string][] = [
  ['taskDone', 'A task done'],
  ['stickyDone', "A sticky's list done"],
  ['tasks', "Today's tasks done"],
  ['inbox', 'Inbox empty'],
  ['kept', '100th capture and other counts'],
  ['streak', 'Days in a row'],
  ['year', 'A note from a year ago'],
  ['answered', 'A question answered'],
  ['goalHalf', 'A goal halfway'],
  ['goal30', 'A goal 30 days away'],
  ['goal7', 'A goal a week away'],
  ['goalDay', "A goal's day"],
  ['goalMade', 'A goal made'],
  ['started', 'Getting started, all done']
]
/** What a moment's Giphy search starts with, before you type your own words. */
const MOMENT_WORDS: Record<MomentKind, string> = {
  taskDone: 'nailed it', stickyDone: 'all done', tasks: 'done for the day', inbox: 'clean sweep', kept: 'celebrate',
  streak: 'on fire', year: 'throwback', answered: 'eureka', goalHalf: 'halfway there', goal30: 'countdown',
  goal7: 'almost there', goalDay: 'its time', goalMade: 'we did it', started: 'lets go'
}
type Picks = Partial<Record<MomentKind, string[]>>
type Pins = Settings['giphyPins']
type Source = 'drawing' | 'file' | 'giphy'
type Shown = { url: string; video: boolean; name: string; sprite?: boolean; still?: string }
/** Motion off or Reduce motion on: pictures hold still. */

/**
 * What plays for each kind of moment, chosen in its row: Vigil's paper
 * drawing, your own files (one at random), or Giphy (the GIF you pin, else a
 * random one for your search words). The small picture at the start of the
 * row is what will play, moving; “Preview” plays exactly that, in a card.
 * Files and a pinned GIF are kept when another choice is made, so going back
 * finds them again.
 */
function CelebrationPicks({ settings, on, set }: { settings: Settings; on: boolean; set: (patch: Partial<Settings>) => void }): React.JSX.Element {
  const picks: Picks = settings.celebrationPicks ?? {}
  const pins: Pins = settings.giphyPins ?? {}
  const sources = settings.celebrationSources ?? {}
  const found = useLive(() => vigil.celebrationPicks(), {} as Awaited<ReturnType<typeof vigil.celebrationPicks>>, [JSON.stringify(picks)])
  // Each pinned GIF ready to show: from the cache, downloaded again if it went missing.
  const pinned = useLive(async () => Object.fromEntries(await Promise.all((Object.keys(pins) as MomentKind[]).map(async (kind) => [kind, await vigil.giphyPinned(kind).catch(() => null)] as const))),
    {} as Partial<Record<MomentKind, GiphyMedia | null>>, [JSON.stringify(pins)])
  const folder = useLive(() => (settings.celebrationsFolder ? vigil.celebrations() : Promise.resolve([])), [] as Awaited<ReturnType<typeof vigil.celebrations>>, [settings.celebrationsFolder])
  // A moment playing a random GIF shows one of today's, so its picture is a real one.
  const anyRandom = MOMENT_NAMES.some(([kind]) => sourceOf(kind, settings) === 'giphy' && !pins[kind])
  const today = useLive(() => (on && anyRandom ? vigil.giphyList() : Promise.resolve(null)), null as Awaited<ReturnType<typeof vigil.giphyList>> | null, [on, anyRandom, settings.giphyWords])
  // The one row searching Giphy, if any.
  const [searching, setSearching] = useState<MomentKind | null>(null)
  const was = { celebrationPicks: picks, giphyPins: pins, celebrationSources: sources }
  const words = settings.giphyWords?.trim() || 'ed edd n eddy celebrate'
  const tile = 'relative size-9 shrink-0 overflow-hidden rounded-sm bg-muted text-muted-foreground'
    return (
    <Setting
      off={!on && 'Turn “Celebrate milestones” on to change this.'}
      title="What plays for each"
      note="Vigil's paper drawing, a file of your own, or a GIF from Giphy." more="Giphy plays the GIF you pin, or a random one for your search words below. The picture at the start of each row is what comes; “Preview” plays it. A task done gets just its tick unless you choose otherwise."
      keywords="celebrations celebrate pick choose file gif giphy pin preview drawing meme clip per moment milestone task done sticky"
      below={
        <div data-celebration-picks className="mt-2 flex flex-col gap-1">
          {MOMENT_NAMES.map(([kind, label]) => {
            const source = sourceOf(kind, settings) as Source
            const paths = picks[kind] ?? []
            const media = found[kind] ?? []
            const pin = pins[kind]
            const missing = paths.filter((path) => !media.some((one) => one.path === path)).length
            const tick = kind === 'taskDone' && source === 'drawing'
            const choose = (next: Source, says: string): void => {
              if (next !== source) {
                set({ celebrationSources: { ...sources, [kind]: next } })
                toast(`${label}: ${says}`, () => set(was))
              }
            }
            const addFiles = (): void => void vigil.celebrationFiles().then((chosen) => {
              if (!chosen.length) return
              const fresh = [...new Set(chosen)].filter((path) => !paths.includes(path))
              if (!fresh.length) return refuse(chosen.length === 1 ? 'That file is already chosen' : 'Those files are already chosen')
              set({ celebrationPicks: { ...picks, [kind]: [...paths, ...fresh] }, celebrationSources: { ...sources, [kind]: 'file' } })
              chime('settled')
              toast(`${label}: ${fresh.length === 1 ? `plays ${fresh[0].split('/').pop()}` : `plays one of ${paths.length + fresh.length} files`}`, () => set(was))
            })
            // What comes, as a picture and in words.
            const random = today?.gifs[MOMENT_NAMES.findIndex(([one]) => one === kind) % Math.max(1, today?.gifs.length ?? 1)]
            const shown: Shown | null = source === 'file' ? media[0] ?? folder[0] ?? null
              : source === 'giphy' ? pinned[kind] ?? (random ? { url: random.still, video: false, name: random.title } : null) : null
            const status = tick ? 'Just the tick, no card'
              : source === 'drawing' ? 'Vigil’s paper drawing'
                : source === 'file'
                  ? media.length ? `${media.length === 1 ? media[0].name : `${media.length} files, one at random`}${missing ? `, ${missing} not found` : ''}`
                    : folder.length ? 'Any from your Celebrations folder' : paths.length ? 'Not found, so Vigil’s drawing' : 'No file yet, so Vigil’s drawing'
                  : pin ? `“${pin.title || 'A GIF'}”, pinned from Giphy` : `A random GIF for “${words}”`
            return (
              <div key={kind} data-moment={kind} data-source={source} className="rounded-md border text-control">
                <div className="flex items-center gap-3 py-2 pr-2 pl-2">
                  {/* What comes: moving, as it will in the card. */}
                  <span data-moment-thumb className={`${tile} size-16 rounded-md`}>
                    {tick ? <Check className="absolute inset-0 m-auto size-7" strokeWidth={2.5} style={{ color: 'var(--tt-color-text-green)' }} />
                      : shown ? (
                        <FileThumb media={shown} moving />
                      ) : <img src={drawingFor(kind).url} alt="" draggable={false} className="absolute inset-0 size-full scale-110 object-cover opacity-90" />}
                    {/* A hairline round it, so a pale picture still reads as a picture. */}
                    <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-foreground/10 ring-inset" />
                    {source === 'giphy' && !pin && shown && (
                      <Tip label="A different one each time">
                        <span className="absolute right-1 bottom-1 grid size-5 place-items-center rounded-full bg-neutral-900 text-white"><Shuffle className="size-3" /></span>
                      </Tip>
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-foreground">{label}</span>
                    <span data-moment-status className="block truncate text-meta text-muted-foreground">{status}</span>
                    <div className={`-ml-2 mt-1 ${on ? '' : 'pointer-events-none opacity-50'}`} aria-disabled={!on}>
                      <Chips className="shrink-0 flex-nowrap" options={[{ id: 'drawing', label: kind === 'taskDone' ? 'Just the tick' : 'Vigil’s drawing' }, { id: 'file', label: 'Your file' }, { id: 'giphy', label: 'Giphy' }]}
                      on={(id) => id === source}
                      pick={(id) => {
                        if (id === 'drawing') return (setSearching(null), choose('drawing', kind === 'taskDone' ? 'just the tick' : 'Vigil’s drawing'))
                        if (id === 'file') {
                          setSearching(null)
                          // Nothing to play yet: straight to choosing one.
                          if (!paths.length && !folder.length) return addFiles()
                          return choose('file', 'your file')
                        }
                        setSearching((now) => (now === kind && source === 'giphy' ? null : kind))
                        choose('giphy', pin ? `“${pin.title || 'the pinned GIF'}”` : 'a random GIF from Giphy')
                      }} />
                    </div>
                  </div>
                  <Button variant="outline" size="sm" disabled={!on} aria-label={`Preview ${label}`} className="shrink-0 gap-1 px-2"
                    onClick={() => (tick ? chime('done') : tryCelebration(kind))}>
                    <Play className="size-3" fill="currentColor" /> Preview
                  </Button>
                </div>
                {source === 'file' && on && (
                  <div data-moment-files className="flex flex-wrap items-center gap-1.5 border-t px-2.5 py-2">
                    {/* Each file by name, with its own small picture, to see or take off. */}
                    {paths.map((path) => {
                      const one = media.find((each) => each.path === path)
                      const name = path.split('/').pop() ?? path
                      return (
                        <span key={path} data-moment-file className="flex h-7 max-w-56 items-center gap-1.5 rounded-md border bg-background pr-0.5 pl-0.5">
                          <Tip label={one ? `See it: ${one.name}` : `${name} not found`}>
                            <button type="button" aria-label={`See ${label} with ${name}`} disabled={!one} onClick={() => one && tryCelebration(kind, one)}
                              className="flex min-w-0 items-center gap-1.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 enabled:hover:text-foreground">
                              <span className="relative size-6 shrink-0 overflow-hidden rounded-sm bg-muted text-muted-foreground">
                                {one ? <FileThumb media={one} /> : <FileKind name={name} missing />}
                              </span>
                              <span className={`truncate ${one ? 'text-foreground' : 'text-muted-foreground line-through'}`}>{name}</span>
                            </button>
                          </Tip>
                          <button type="button" aria-label={`Remove ${name} from ${label}`} className="relative after:absolute after:-inset-0.5 after:rounded-full grid size-5 shrink-0 place-items-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => {
                            set({ celebrationPicks: { ...picks, [kind]: paths.filter((each) => each !== path) } })
                            chime('away')
                            toast(`${label}: removed ${name}`, () => set(was))
                          }}>
                            <X className="size-3" />
                          </button>
                        </span>
                      )
                    })}
                    <Button variant="outline" size="sm" onClick={addFiles}>{paths.length ? 'Add more…' : 'Choose files…'}</Button>
                  </div>
                )}
                {searching === kind && source === 'giphy' && on && (
                  <GiphySearch label={label} kind={kind} pin={pin} words={words} onClose={() => setSearching(null)}
                    onRandom={() => {
                      const { [kind]: _, ...rest } = pins
                      set({ giphyPins: rest })
                      chime('away')
                      toast(`${label}: a random GIF each time`, () => set(was))
                    }}
                    onPin={(next, title) => {
                      set({ giphyPins: { ...pins, [kind]: next }, celebrationSources: { ...sources, [kind]: 'giphy' } })
                      chime('settled')
                      toast(`${label}: plays “${title}”`, () => set(was))
                    }} />
                )}
              </div>
            )
          })}
        </div>
      }
    />
  )
}

/**
 * A file's own picture, small: a GIF or a picture as itself, a clip's first
 * frame (or the clip, moving, where `moving`). One that cannot be read shows
 * what kind of file it is instead, never an empty box.
 */
function FileThumb({ media, moving = false }: { media: Shown; moving?: boolean }): React.JSX.Element {
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [media.url])
  if (broken) return <FileKind name={media.name || media.url} />
  return media.video
    ? <video src={moving ? media.url : `${media.url}#t=0.1`} autoPlay={moving && !still()} loop={moving} muted playsInline preload="metadata" onError={() => setBroken(true)} className="absolute inset-0 size-full object-cover" />
    : <img src={media.url} alt="" draggable={false} onError={() => setBroken(true)} className={`absolute inset-0 size-full ${media.sprite ? 'object-contain p-0.5' : 'object-cover'}`} />
}

/** In place of a picture that cannot be shown: the kind of file, as a word (GIF, MP4), or a question mark for one not found. */
function FileKind({ name, missing = false }: { name: string; missing?: boolean }): React.JSX.Element {
  const kind = /\.([a-z0-9]{2,4})$/i.exec(name)?.[1]?.toUpperCase()
  return (
    <span data-file-kind className={`absolute inset-0 grid place-items-center text-[0.5625rem] font-semibold tracking-wide ${missing ? 'border border-dashed' : ''}`}>
      {missing ? '?' : kind ?? <ImageIcon className="size-3.5" />}
    </span>
  )
}

/**
 * Giphy searched right in a moment's row: its own words to start, a small
 * grid of what came back, each to see in a card or pin for this moment.
 */
function GiphySearch({ label, kind, pin, words: random, onPin, onRandom, onClose }: { label: string; kind: MomentKind; pin?: GiphyPin; words: string; onPin: (pin: GiphyPin, title: string) => void; onRandom: () => void; onClose: () => void }): React.JSX.Element {
  const pinnedId = pin?.id
  const [words, setWords] = useState(MOMENT_WORDS[kind])
  const [list, setList] = useState<Awaited<ReturnType<typeof vigil.giphySearch>> | null>(null)
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState<string | null>(null)
  const asked = useRef(0)
  const search = (text: string): void => {
    const ask = ++asked.current
    setBusy(true)
    void vigil.giphySearch(text).then((found) => ask === asked.current && setList(found), () => ask === asked.current && setList({ gifs: [], why: 'offline' }))
      .finally(() => ask === asked.current && setBusy(false))
  }
  // The moment's own words, looked for as it opens; then as you type, after a short pause.
  useEffect(() => search(words), []) // eslint-disable-line react-hooks/exhaustive-deps
  const typed = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(typed.current), [])
  const why = list?.why === 'key' ? 'Giphy needs a key: add yours under “Giphy key” below.'
    : list?.why === 'offline' ? 'Giphy could not be reached. Try again when you are online.'
      : list?.why === 'none' ? `Nothing found for “${words.trim()}”. Try other words.` : ''
  const get = (id: string): Promise<{ pin: GiphyPin; media: GiphyMedia } | null> => {
    setPicking(id)
    return vigil.giphyPick(id).finally(() => setPicking(null))
  }
  return (
    <div data-giphy-search className="border-t px-2.5 pt-2 pb-2.5">
      {/* What plays now, plainly, and the way back to a random one. */}
      <p className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-control text-muted-foreground">
        {pin ? <><span><strong className="font-medium text-foreground">Pinned:</strong> “{pin.title || 'a GIF'}”, every time.</span>
          <Button variant="outline" size="sm" className="h-6 px-2" onClick={onRandom}>Use a random one</Button></>
          : <span><strong className="font-medium text-foreground">A random GIF for “{random}”</strong> each time. Pin one below to keep it.</span>}
      </p>
      <div className="flex items-center gap-2">
        <Input autoFocus value={words} spellCheck={false} autoComplete="off" aria-label={`Search Giphy for ${label}`} placeholder="Search Giphy" className="h-7 min-w-0 flex-1"
          onChange={(event) => {
            const text = event.target.value
            setWords(text)
            clearTimeout(typed.current)
            typed.current = setTimeout(() => search(text), 450)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') (clearTimeout(typed.current), search(words))
            if (event.key === 'Escape') (event.preventDefault(), event.stopPropagation(), onClose())
          }} />
        {busy && <Orb label="Looking…" />}
        <Button variant="ghost" size="sm" onClick={onClose}>Done</Button>
      </div>
      {why ? <p className="mt-2 text-control text-muted-foreground">{why}</p> : list && list.gifs.length > 0 && (
        <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-1.5">
          {list.gifs.map((gif) => {
            const isPinned = gif.id === pinnedId
            return (
              <span key={gif.id} className="group/gif relative">
                <button type="button" aria-label={`See ${gif.title || 'this GIF'}`} title={gif.title} className={`block aspect-[4/3] w-full overflow-hidden rounded-sm bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring/50 hover:opacity-85 ${isPinned ? 'ring-2 ring-ring' : ''}`}
                  onClick={() => void get(gif.id).then((one) => one && tryCelebration(kind, one.media))}>
                  <img src={gif.still} alt="" draggable={false} className="size-full object-cover" />
                </button>
                <Tip label={isPinned ? 'Pinned' : `Pin for ${label}`}>
                  <button type="button" data-giphy-pin={gif.id} aria-pressed={isPinned} aria-label={isPinned ? 'Pinned' : `Pin for ${label}`} disabled={!!picking}
                    className={`absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-neutral-900 text-white transition-opacity hover:bg-black ${isPinned || picking === gif.id ? '' : 'opacity-0 group-hover/gif:opacity-100 focus-visible:opacity-100'}`}
                    onClick={() => {
                      if (isPinned) return
                      void get(gif.id).then((one) => (one ? onPin(one.pin, gif.title || 'a GIF') : refuse('That GIF could not be downloaded')))
                    }}>
                    <Pin className="size-3.5" style={isPinned ? { fill: 'currentColor' } : undefined} />
                  </button>
                </Tip>
              </span>
            )
          })}
        </div>
      )}
      <p className="mt-1.5 text-meta font-semibold text-muted-foreground">Powered by GIPHY</p>
    </div>
  )
}

/** A line of text that saves as you type, and never has a save coming back undo a key. */
function TextSetting({ value, onSave, ...rest }: { value: string; onSave: (value: string) => void } & Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange'>): React.JSX.Element {
  const [text, setText] = useState(value)
  const typing = useRef(false)
  useEffect(() => void (!typing.current && setText(value)), [value])
  return (
    <Input {...rest} value={text} spellCheck={false} autoComplete="off"
      onChange={(event) => (setText(event.target.value), onSave(event.target.value))}
      onFocus={() => void (typing.current = true)}
      onBlur={() => void (typing.current = false)} />
  )
}

/**
 * Giphy, for the moments set to “Giphy” with no GIF pinned: the words it
 * searches with, your own key if you would rather (kept in your settings on
 * this Mac, nowhere else), and the day's results to star the ones you like
 * best. No switch of its own: each moment's row says whether it plays Giphy.
 */
function GiphySettings({ settings, on, set }: { settings: Settings; on: boolean; set: (patch: Partial<Settings>) => void }): React.JSX.Element {
  // Each row says why it rests: celebrations off, or no moment set to Giphy.
  const used = MOMENT_NAMES.some(([kind]) => sourceOf(kind, settings) === 'giphy')
  const off = !on ? 'Turn “Celebrate milestones” on to change this.' : !used && 'No moment uses Giphy now. Choose “Giphy” for one above and these apply.'
  return (
    <>
      <Setting off={off} title="Giphy search words" note="What “Giphy” looks for when a moment has no GIF pinned." more="One of the day's results plays at random; a new list comes once a day." keywords="giphy gif search words query random meme ed edd eddy">
        <TextSetting placeholder="ed edd n eddy celebrate" className="h-8 w-56" disabled={!on} value={settings.giphyWords ?? ''} onSave={(giphyWords) => set({ giphyWords })} />
      </Setting>
      {/* Its own row, not under the search words: a key is not a kind of search. */}
      <Setting off={off} title="Giphy key" note="Optional: paste your own key to use instead of Vigil's built-in one." more="Free from developers.giphy.com, kept in your settings and their backups and sent only to Giphy." keywords="giphy key api token">
        <TextSetting type="password" placeholder="Optional: your own key" className="h-8 w-56" disabled={!on} value={settings.giphyKey ?? ''} onSave={(giphyKey) => set({ giphyKey: giphyKey.trim() })} />
      </Setting>
      <GiphyFavourites stars={settings.giphyStars ?? []} live={on} onSave={(giphyStars) => set({ giphyStars })} />
    </>
  )
}

/** The day's results, small, each with a star: starred ones play more often. Click one to see it in a card. */
function GiphyFavourites({ stars, live, onSave }: { stars: string[]; live: boolean; onSave: (stars: string[]) => void }): React.JSX.Element {
  const [list, setList] = useState<Awaited<ReturnType<typeof vigil.giphyList>> | null>(null)
  const [busy, setBusy] = useState(false)
  const load = (): void => {
    setBusy(true)
    void vigil.giphyList().then(setList, () => setList({ gifs: [], why: 'offline' })).finally(() => setBusy(false))
  }
  const why = list?.why === 'key' ? 'Add a key first.' : list?.why === 'offline' ? 'Giphy could not be reached; try again later.' : ''
  return (
    <Setting
      under
      title="Pick favourites"
      note={`Star the ones you like and they come up most${stars.length ? `; ${stars.length} starred` : ''}.`}
      more="The rest still play now and then."
      keywords="giphy favourites favorites star pick gif"
      below={list && (
        <div data-giphy-picker className="mt-2">
          {why ? <p className="text-control text-muted-foreground">{why}</p> : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-1.5">
              {list.gifs.map((gif) => {
                const starred = stars.includes(gif.id)
                return (
                  <span key={gif.id} className="group/gif relative">
                    <button type="button" aria-label={`See ${gif.title || 'this GIF'}`} title={gif.title} className="block aspect-[4/3] w-full overflow-hidden rounded-sm bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring/50 hover:opacity-85"
                      onClick={() => void vigil.giphyOne(gif.id).then((one) => one && tryCelebration('kept', one))}>
                      <img src={gif.still} alt="" draggable={false} className="size-full object-cover" />
                    </button>
                    <button type="button" data-giphy-star={gif.id} aria-pressed={starred} aria-label={starred ? 'Unstar' : 'Star'}
                      className={`absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-neutral-900 text-white transition-opacity hover:bg-black ${starred ? '' : 'opacity-0 group-hover/gif:opacity-100 focus-visible:opacity-100'}`}
                      onClick={() => {
                        onSave(starred ? stars.filter((id) => id !== gif.id) : [...stars, gif.id])
                        chime(starred ? 'away' : 'settled')
                      }}>
                      <Star className="size-3.5" style={starred ? { fill: 'var(--tt-color-text-yellow)', color: 'var(--tt-color-text-yellow)' } : undefined} />
                    </button>
                  </span>
                )
              })}
            </div>
          )}
          <p className="mt-1.5 text-meta font-semibold text-muted-foreground">Powered by GIPHY</p>
        </div>
      )}
    >
      {busy ? <Orb label="Looking…" /> : (
        <Button variant="outline" size="sm" disabled={!live} onClick={load}>{list ? 'Look again' : 'Show them'}</Button>
      )}
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
      void vigil.exportAll().then((done) => {
        if (!done) return
        const folder = typeof done === 'string' ? done : done.folder
        const where = folder.split('/').slice(-2).join('/')
        if (typeof done !== 'string') return refuse(`Exported to ${where}, but the pictures and files could not be copied`)
        chime('send')
        toast(`Exported to ${where}`)
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

/** A working day's length, for whether a day fits; the sample day beside it shows free or over as it moves. */
function WorkHoursSetting({ hours, set }: { hours: number; set: (hours: number) => void }): React.JSX.Element {
  const [live, setLive] = useState<number | null>(null)
  const shown = live ?? hours
  return (
    <Setting title="A working day" note="About how many hours a day holds, meetings and tasks together." more="The week and “Close the week” weigh each day against it and say when one is over-full." keywords="working day hours work length fit over full meetings calendar capacity week">
      <WorkdaySample hours={shown} />
      <SettingSlider min={2} max={14} step={0.5} rest={8} value={hours} onLive={setLive} onSave={(next) => (setLive(null), set(next))} />
      <span className="w-16 text-right tabular-nums"><Rolling text={lengthSaid(shown * 60)} /></span>
    </Setting>
  )
}

/**
 * Your Mac's calendar on Today and the week, read only. Turned on, macOS asks
 * once, in its own words; refused, the row says so and offers the way to
 * Privacy settings.
 */
function MacCalendarSetting({ on, set }: { on: boolean; set: (on: boolean) => void }): React.JSX.Element {
  const [status, setStatus] = useState<string | null>(null)
  const span = (): [string, string] => [new Date().toISOString(), new Date(Date.now() + 86400000).toISOString()]
  useEffect(() => {
    if (on) void calendar.events(...span()).then((said) => setStatus(said.status))
  }, [on])
  const turn = (next: boolean): void => {
    set(next)
    if (!next) return setStatus(null)
    setStatus('asking')
    void calendar.ask(...span()).then((said) => (setStatus(said.status), chime(said.status === 'on' ? 'on' : 'nope')))
  }
  const line = status === 'asking' ? 'Waiting for macOS to ask you…' : status === 'denied' ? 'macOS has not let Vigil read your calendar.' : status === 'on' ? 'Reading your calendar: today’s events show in the brief and the week.' : null
  return (
    <Setting title="Your Mac's calendar" note="Your calendar's events on Today's brief and the week, read only." more="macOS asks once before Vigil can see them; nothing is ever changed or sent." keywords="calendar mac apple ical events meetings eventkit today week">
      <span className="flex items-center gap-2">
        {on && line && <span data-calendar-status className="text-control text-muted-foreground">{line}</span>}
        {on && status === 'denied' && <Button size="sm" variant="outline" onClick={() => void window.api.vigil('calendar:privacy')}>Open Privacy settings</Button>}
        <Switch checked={on} onCheckedChange={turn} />
      </span>
    </Setting>
  )
}

/**
 * Websites blocked in a focus session (site-block.ts): the switch, the sites
 * as chips, and, when the Mac refused, which browser and the way to the
 * Privacy pane that allows it. Firefox is said in the “?”: it cannot be read.
 */
const said = (names: string[]): string => new Intl.ListFormat('en', { type: 'conjunction' }).format(names)
function SiteBlockGroup({ settings, set }: { settings: Settings; set: (patch: Partial<Settings>) => void }): React.JSX.Element {
  const refused = useBlockRefused()
  const on = settings.siteBlock
  const none = !settings.blockSites.some((one) => !one.startsWith('-'))
  return (
    <Group section="Tasks" title="Blocking websites">
      <Setting title="Block websites in focus sessions" note="While a round runs, a blocked site's tab goes blank and the bubble says why; on breaks they open again."
        more="It works in Safari, Chrome, Arc, Dia, Brave, Edge, Vivaldi, Opera and Chromium. Not in Firefox: it does not let other apps read its address. The first time, your Mac asks whether Vigil may read that browser's address."
        off={(!on && 'Off, every site stays open in sessions.') || (none && 'Add a site below to start.') || undefined}
        keywords="website blocker block sites social media distraction focus session browser safari chrome arc firefox youtube x twitter instagram reddit tiktok">
        <Switch checked={on} onCheckedChange={(siteBlock) => set({ siteBlock })} />
      </Setting>
      <Setting under title="Sites to block" note="Type a site and press Return, or add “Social media” in one click."
        keywords="website blocker block sites social media list add remove youtube x instagram" below={<SiteBlockField settings={settings} />} />
      {refused.length > 0 && (
        <Setting title="Browser access" note={`**Your Mac did not let Vigil read ${said(refused)}.** Sites stay open there.`}
          off={`Turn on Vigil for ${said(refused)} in Privacy & Security, under Automation.`} keywords="permission automation privacy apple events browser access">
          <Button variant="outline" size="sm" onClick={openAutomation}>Open Privacy settings</Button>
        </Setting>
      )}
    </Group>
  )
}

/**
 * Put away everything before a day: every open capture from before it goes,
 * unsorted, into one folder in Archived named for that day. Still found by
 * search, never deleted; the toast's Undo brings the whole folder back.
 */
function PutAwayBefore(): React.JSX.Element {
  const choices = [1, 3, 12].map((months) => dayjs().subtract(months, 'month').format('YYYY-MM-DD'))
  const [day, setDay] = useState(choices[0])
  const go = (): void =>
    void call<{ at: string; moved: number; folder: string }>('putaway:before', day).then(({ at, moved, folder }) => {
      if (!moved) return void (chime('nope'), toast(`Nothing open from before ${dayjs(day).format('D MMMM YYYY')}`))
      chime('away')
      toast(`${moved === 1 ? '1 capture' : `${num(moved)} captures`} put away in “${folder}”, in Archived`, () => void call('putaway:undo', at).then(() => chime('unshelve')))
    })
  return (
    <Setting title="Put away everything before" note="Every open capture from before this day goes into one dated folder in Archived, unsorted." more="Pinned ones and ones with a reminder stay. Search still finds them, nothing is deleted, and Undo brings them all back." keywords="archive old captures backlog bankruptcy folder dated put away before inbox">
      <Chips className="shrink-0" options={choices.map((id) => ({ id, label: dayjs(id).format(dayjs(id).year() === dayjs().year() ? 'D MMM' : 'D MMM YYYY') }))} on={(id) => id === day} pick={setDay} />
      <Button variant="secondary" size="sm" onClick={go}>Put away</Button>
    </Setting>
  )
}
