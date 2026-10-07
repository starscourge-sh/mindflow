import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { PACKS, chime, click, soundOn, step } from '@/lib/sound'
import { NOTE_FONTS } from '@/lib/editor-setup'
import { FolderPlus, Keyboard, Shuffle, type LucideIcon } from 'lucide-react'
import { alive } from '@/components/ui/alive-icon'
import BrainCircuitIcon from '@/components/ui/brain-circuit-icon'
import SaveIcon from '@/components/ui/save-icon'
import InfoCircleIcon from '@/components/ui/info-circle-icon'
import CheckedIcon from '@/components/ui/checked-icon'
import CameraIcon from '@/components/ui/camera-icon'
import PaintIcon from '@/components/ui/paint-icon'
import PenIcon from '@/components/ui/pen-icon'
import MagnifierIcon from '@/components/ui/magnifier-icon'
import SparklesIcon from '@/components/ui/sparkles-icon'
import Volume2Icon from '@/components/ui/volume-2-icon'
import XIcon from '@/components/ui/x-icon'
import ExternalLinkIcon from '@/components/ui/external-link-icon'
import { allThemes, applyTheme, customThemes, frosted, importTheme, removeTheme, restoreTheme, setFrosted, themeName } from '@/lib/theme'
import { KeysEditor, Marked } from './shortcut-sheet'
import { keyFor } from '@/lib/keys'
import { Swatch } from '../theme/theme-picker'

import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { ThemePicker } from '../theme/theme-picker'
import { Switch } from '@/components/ui/switch'
import { onboarding, playWelcome, useOnboarding } from '@/lib/onboarding'
import { useLive, vigil, type MomentKind, type Settings } from '@/lib/vigil'
import { Chips } from './display'
import { SoundPacks } from './sound-packs'
import { FontPicker, TextSize } from './font-picker'
import { BackToTop, Kbd, Rolling, Tip, refuse, toast, useSmooth } from './ui'
import { Button } from '@/components/ui/button'
import { Orb } from './orb'
import { tryCelebration } from './celebrate'
import { byKeys, useFirstVisit } from '@/lib/motion'
import { AliveIcon } from '@/components/ui/alive-icon'
import DownloadIcon from '@/components/ui/download-icon'
import UploadIcon from '@/components/ui/upload-icon'
import { weekdayName } from '../../../../main/dates'
import { BOX_TABS, SECTIONS as PLACES, ShowList } from './places'
import { SpellLanguages } from './spell-languages'
import { isMac } from '@/lib/tiptap-utils'
import { currentVim, onVimChange, setVim } from '@/lib/vim'
import { useStoredFlag } from '@/lib/use-stored-flag'
import { SANDBOX, enterSandbox, leaveSandbox, resetSandbox } from '@/lib/sandbox'

// itshover drawings in lucide's place, moving when their control is pointed at.
const Brain = alive(BrainCircuitIcon)
const HardDrive = alive(SaveIcon)
const LifeBuoy = alive(InfoCircleIcon)
const ListChecks = alive(CheckedIcon)
const Mountain = alive(CameraIcon)
const Palette = alive(PaintIcon)
const PenLine = alive(PenIcon)
const SearchIcon = alive(MagnifierIcon)
const Sparkles = alive(SparklesIcon)
const Volume2 = alive(Volume2Icon)
const X = alive(XIcon)

/**
 * What the search at the top asks for, and whether the island a row sits in
 * matched it by its own heading (then every row in it shows).
 */
const Query = createContext({ query: '', all: false })
const matches = (query: string, ...texts: string[]): boolean => !query.trim() || texts.join(' ').toLowerCase().includes(query.trim().toLowerCase())

/**
 * One setting, as a row in an island the way System Settings groups them: its
 * name and what it changes on the left, the control on the right. Where the
 * words would be squeezed narrower than a short line, the control drops under
 * them instead. Anything set under it (`below`) takes the full width.
 * Searched for and not matching, it is not there at all.
 */
function Setting({ title, children, note, below, keywords = '', under = false }: {
  title: string
  children?: ReactNode
  note: string
  below?: ReactNode
  /** More words it is found by: the names of what it offers, a theme's or a font's. */
  keywords?: string
  /** A choice within the row above it, set in a little under it. */
  under?: boolean
}): React.JSX.Element | null {
  const { query, all } = useContext(Query)
  if (!all && !matches(query, title, note, keywords)) return null
  const shown = all ? '' : query
  return (
    <div data-setting className={`py-3 pr-4 ${under ? 'pl-9' : 'pl-4'}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="min-w-0 flex-[1_1_13rem]">
          <div className="text-body font-medium text-foreground"><Marked text={title} query={shown} /></div>
          <p className="mt-0.5 max-w-md text-meta leading-relaxed text-muted-foreground"><Marked text={note} query={shown} /></p>
        </div>
        {children && <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2 text-control">{children}</div>}
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
    <section className={`mt-6 first:mt-0 [&:not(:has([data-setting]))]:hidden ${enter ? 'mf-rise' : ''}`}>
      {/* Searching, rows from every section show at once, so each island says whose it is. */}
      <h2 className="mb-2 px-1 text-body font-semibold text-foreground">{query.trim() && <span className="font-normal text-muted-foreground">{section} · </span>}<Marked text={title} query={query} /></h2>
      <div className="mf-island divide-y divide-border/60 overflow-hidden rounded-xl border bg-accent/25">{children}</div>
    </section>
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
      className="w-40 max-w-full min-w-20 shrink"
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
  // Vim keys live with the editors, not here, so the box's menu and this switch move together.
  const [vim, setVimOn] = useState(currentVim)
  useEffect(() => onVimChange(setVimOn), [])
  // Seen in screen recordings or not: the same flag as the box's menu and ⌘K, so all of them agree.
  const [recordable, setRecordableFlag] = useStoredFlag('recordable')
  const setRecordable = (on: boolean): void => {
    setRecordableFlag(on)
    void window.api.setRecordable(on)
  }
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
          <Setting title="Theme" note="The colours of every window: the box and this one change together. Point at one to try it, click to keep it." keywords={allThemes().map(themeName).join(' ')}>
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
            <Switch checked={settings.blur !== false} onCheckedChange={(blur) => set({ blur })} />
          </Setting>
          <Setting title="Postcards" note="Pictures in notes sit in a white border with rounded corners and a soft shadow, like a print laid on the desk." keywords="images pictures photos border frame white">
            <Switch checked={!!settings.postcards} onCheckedChange={(postcards) => set({ postcards })} />
          </Setting>
          <Setting title="Margin marks" note="A few marks drawn by hand: a tick when you finish, a circle round today, an arrow when there is nothing yet. Off keeps every line machine-straight." keywords="hand drawn handwritten sketch doodle pen ink circle tick strike arrow personal">
            <Switch checked={settings.marks !== false} onCheckedChange={(marks) => set({ marks })} />
          </Setting>
          <Setting title="Pictures in lists" note="A note with a picture in it shows the first one, small, at the end of its row and on its card.">
            <Switch checked={settings.thumbnails !== false} onCheckedChange={(thumbnails) => set({ thumbnails })} />
          </Setting>
        </Group>
        <Group section="Appearance" title="Window placement">
          <Setting title="Keep the box centred" note="Opening the side panel grows the box out on both sides, so it stays centred where it was. Off, it grows to the right. Either way it grows down from its top as you write or expand it, so the writing stays where your eyes are, never goes past the edge of the screen, and closing the panel puts it back where it was." keywords="box window centre center grow panel expand position place">
            <Switch checked={settings.boxCentred !== false} onCheckedChange={(boxCentred) => set({ boxCentred })} />
          </Setting>
          <Setting title="Where the box appears" note="When you summon it. Where you left it brings it back just where you put it; the others place it fresh each time, near the top like Spotlight or in the middle." keywords="box window summon open position place top middle centre last">
            <Chips className="shrink-0" options={[{ id: 'last', label: 'Where you left it' }, { id: 'top', label: 'Near the top' }, { id: 'centre', label: 'Middle' }]}
              on={(id) => id === (settings.boxPlace ?? 'last')} pick={(boxPlace) => set({ boxPlace: boxPlace as Settings['boxPlace'] })} />
          </Setting>
          <Setting title="Which screen" note="With more than one screen: the box comes to the screen the pointer is on, or stays on the one it was last on." keywords="box window display monitor screen pointer second">
            <Chips className="shrink-0" options={[{ id: 'pointer', label: 'Where the pointer is' }, { id: 'same', label: 'Where it was' }]}
              on={(id) => id === (settings.boxScreen ?? 'pointer')} pick={(boxScreen) => set({ boxScreen: boxScreen as Settings['boxScreen'] })} />
          </Setting>
        </Group>
        <Group section="Appearance" title="Sidebar and tabs">
          <Setting title="Sidebar" note="The sections the main window lists. The rest wait under More, and G with their letter still goes to them." keywords="customize sections menu more hide show" below={<div className="-mx-2 mt-2"><ShowList places={PLACES} setting="sidebarShown" /></div>} />
          <Setting title="Box tabs" note="The tabs beside the box. A hidden one is still a key away, ⌃ and its number, and shows while it is open." keywords="prompt panel inbox tasks review kept recent hide show" below={<div className="-mx-2 mt-2"><ShowList places={BOX_TABS} setting="boxTabs" /></div>} />
        </Group>
        <Group section="Appearance" title="Text">
          <Setting title="Text font" note="What notes are written in, and lists and menus too: the Mac's own font to start, Fraunces, a few others, or any font on this Mac. OpenDyslexic is easier for some to read." keywords={`note text body font ${NOTE_FONTS.map((font) => font.label).join(' ')}`}>
            <FontPicker value={settings.noteFont} />
          </Setting>
          <Setting title="Heading font" note="A note's headings in a font of their own, and the titles of pages here: Fraunces over the Mac's font to start, the way Dia pairs a characterful serif with plain text. Or the same as the text." below={<Sample />} keywords={`headings titles pairing ${NOTE_FONTS.map((font) => font.label).join(' ')}`}>
            <FontPicker value={settings.headingFont} setting="headingFont" same="Same as text" />
          </Setting>
          <Setting title="Notes only" note="On, the font above is used only for what you write, and the app's own lists, menus and labels stay in Fraunces.">
            <Switch checked={!!settings.fontNotesOnly} onCheckedChange={(fontNotesOnly) => set({ fontNotesOnly })} />
          </Setting>
          <Setting title="Text size" note="How big the words in notes are. ⌘+ and ⌘− change it from any note, ⌘0 puts it back." below={<Sample text />}>
            <TextSize value={settings.textSize} />
          </Setting>
        </Group>

        <Group section="Scenery" title="Pictures at rest">
          <Setting title="Scenery" note="Pictures from your own folders at the quiet moments: an empty inbox, a finished review, the top of today's page. Only where you rest, never behind your work." keywords="pictures images photos wallpaper background landscape scenes art">
            <Switch checked={settings.scenery} onCheckedChange={(scenery) => set({ scenery })} />
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
        <Group section="Scenery" title="Covers">
          <SceneryFolders
            use="covers"
            title="Covers folder"
            note="Soft, grainy pictures behind whatever has no picture of its own: a tag's page, a note of only words, a tile on Home. Each thing always gets the same one, tinted toward its colour. With no folder, plain colour tiles."
            folders={settings.coversFolder ? [settings.coversFolder] : []}
            on
            onSave={(folders) => set({ coversFolder: folders.at(-1) ?? '' })}
          />
        </Group>
        <Group section="Scenery" title="Celebrations">
          <Setting title="Celebrate milestones" note="A small card on the rare days worth marking: your 100th capture, an inbox emptied, a week of capturing in a row. Never for an everyday save or tick, and never more than one in ten minutes." keywords="celebrate celebration milestone gif meme party confetti fun">
            <Button variant="outline" size="sm" onClick={() => tryCelebration()}>Try a celebration</Button>
            <Switch checked={settings.celebrate !== false} onCheckedChange={(celebrate) => set({ celebrate })} />
          </Setting>
          <CelebrationsFolder folder={settings.celebrationsFolder ?? ''} on={settings.celebrate !== false} onSave={(celebrationsFolder) => set({ celebrationsFolder })} />
          <CelebrationPicks picks={settings.celebrationPicks ?? {}} on={settings.celebrate !== false} onSave={(celebrationPicks) => set({ celebrationPicks })} />
        </Group>
        <Group section="Scenery" title="Where they show">
          {([
            ['sceneryRest', 'When there is nothing to do', 'Inbox empty, review done, nothing due today, nothing rotting: a wide picture above the sentence that says so.', 'empty inbox zero review done'],
            ['sceneryToday', "Today's page", "A painted strip across the top of each day's page, the same picture all that day. With Postcards on, it sits in a white frame.", 'banner header day daily'],
            ['sceneryRecap', 'Recaps', 'Each page of a month or year recap over its own picture: morning light for the opening, night for the close.', 'wrapped month year'],
            ['sceneryFocus', 'Reading and Focus', 'Behind Read mode and ⇧⌘F Focus, dimmed far enough that the words read as well as on a plain page.', 'read mode focus backdrop']
          ] as const).map(([key, title, note, keywords]) => (
            <Setting key={key} title={title} note={note} keywords={`scenery pictures ${keywords}`}>
              <Switch disabled={!settings.scenery} checked={settings[key] !== false} onCheckedChange={(on) => set({ [key]: on })} />
            </Setting>
          ))}
        </Group>
        <Group section="Scenery" title="How they look">
          <Setting title="Match the time of day" note="Golden scenes in the morning and afternoon, dusk in the evening, night and candlelight after dark. Off, any picture at any hour." keywords="scenery morning evening night dusk golden hour mood">
            <Switch disabled={!settings.scenery} checked={settings.sceneryTime} onCheckedChange={(sceneryTime) => set({ sceneryTime })} />
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
          <Setting title="Fold headings" note="Point at a heading and click the arrow beside it to fold away everything under it, up to the next heading as big. Only how the note looks: nothing in it changes. ⌥⌘[ folds the one you are in." keywords="fold collapse heading section outline hide">
            <Switch checked={settings.foldHeadings !== false} onCheckedChange={(foldHeadings) => set({ foldHeadings })} />
          </Setting>
          <Setting title="Title in the top bar" note="Once a note's first line scrolls out of sight, it shows faintly at the top of the box, so you know what you are reading.">
            <Switch checked={settings.topTitle} onCheckedChange={(topTitle) => set({ topTitle })} />
          </Setting>
          <Setting title="Spellcheck" note={`Underline misspelt words as you write. Right-click one for what it might be.${isMac() ? ' The Mac picks the language from what you type.' : ' The gear picks the languages.'}`} keywords="spelling spell check dictionary language typo">
            {/* On a Mac the system checks in whatever language you type, and ignores a list. */}
            {!isMac() && <SpellLanguages picked={settings.spellLanguages ?? []} disabled={settings.spellcheck === false} />}
            <Switch checked={settings.spellcheck !== false} onCheckedChange={(spellcheck) => set({ spellcheck })} />
          </Setting>
          <Setting title="Vim keys" note="Move and edit with Vim's keys in every note." keywords="vim keys keyboard bindings modal normal insert">
            <Switch checked={vim} onCheckedChange={setVim} />
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
          <Setting title="Hints" note="How often the box shows you something you kept. Rare is the point: a hint every time is one you learn to ignore.">
            <SettingSlider min={0} max={0.5} step={0.05} value={settings.hintRate} onSave={(hintRate) => set({ hintRate })} />
            <span className="w-16 text-right tabular-nums"><Rolling text={settings.hintRate ? `1 in ${Math.round(1 / settings.hintRate)}` : 'never'} /></span>
          </Setting>
          <HintTuning />
          <Setting title="Rot cards" note="How many unhandled captures come back each time you open the box. A few, never the whole pile.">
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
            <Switch checked={settings.pinnedQuestions !== false} onCheckedChange={(pinnedQuestions) => set({ pinnedQuestions })} />
          </Setting>
          <Setting title="Recent reaches back" note="How many days the Recent panel lists, newest first, every kind of thing. ⇧⌘Y opens it beside any page.">
            <SettingSlider min={1} max={30} step={1} value={settings.recentDays ?? 7} onSave={(recentDays) => set({ recentDays })} />
            <span className="w-16 text-right tabular-nums"><Rolling text={(settings.recentDays ?? 7) === 1 ? '1 day' : `${settings.recentDays ?? 7} days`} /></span>
          </Setting>
        </Group>
        <Group section="What comes back to you" title="Goals">
          <Setting title="Goals at the top" note="Open goals show in a slim strip at the top of Home and Today's page: the days left, a line of the time gone, and when you last logged." keywords="goals strip home today countdown">
            <Switch checked={settings.goalStrip !== false} onCheckedChange={(goalStrip) => set({ goalStrip })} />
          </Setting>
          <Setting title="Time as dots" note="The menu bar's menu shows how far through the day, week, month and year you are. As dots, like a line of beads, or as plain bars." keywords="tempus menu bar day week month year dots bars progress">
            <Switch checked={settings.tempusDots === true} onCheckedChange={(tempusDots) => set({ tempusDots })} />
          </Setting>
          <Setting title="Goal on screen" note="Each goal's beacon, a small window on every Space with the days left, unless the goal says otherwise. Now and then: out when you first unlock or open Vigil each day and every few hours you are at the Mac, then tucked away after a minute. In the last week it stays." keywords="goals beacon on screen window always sometimes off">
            <Chips className="shrink-0" options={[{ id: 'always', label: 'Always' }, { id: 'sometimes', label: 'Now and then' }, { id: 'off', label: 'Off' }]}
              on={(id) => id === (settings.goalBeacon ?? 'sometimes')} pick={(goalBeacon) => set({ goalBeacon: goalBeacon as Settings['goalBeacon'] })} />
          </Setting>
          <Setting title="Goal nudges" note="A goal with no log for a week says so in the box, more often as the quiet goes on or the day comes near. Never in quiet hours." keywords="goals nudge reminder log">
            <Switch checked={settings.goalNudges !== false} onCheckedChange={(goalNudges) => set({ goalNudges })} />
          </Setting>
        </Group>
        <Group section="What comes back to you" title="Every day">
          <Setting title="Daily tidy" note="Once a day the box offers a few minutes over the last days' captures: add tags, bold a line, fold a section, cross off what is done. Nothing is decided there. Never in quiet hours.">
            <Switch checked={settings.dailyTidy} onCheckedChange={(dailyTidy) => set({ dailyTidy })} />
          </Setting>
        </Group>
        <Group section="What comes back to you" title="Once a week">
          <Setting title="Deciding day" note="On the day you pick, the box offers the deciding pass: what you set aside to come back to, and what has waited longest, each with its exits. Rot cards only ask for a tidy; deciding happens here. Never in quiet hours.">
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
            <Input type="time" className={`${field} w-28`} value={settings.quietStart} onChange={(event) => set({ quietStart: event.target.value })} />
            <span className="text-muted-foreground">to</span>
            <Input type="time" className={`${field} w-28`} value={settings.quietEnd} onChange={(event) => set({ quietEnd: event.target.value })} />
          </Setting>
          <Setting title="Safe mode" note="Nothing comes up unasked at all: no hints, rot cards or pins. For screen shares. ⌥⌘S from anywhere.">
            <Switch checked={settings.safeMode} onCheckedChange={(safeMode) => {
              set({ safeMode })
              toast(safeMode ? 'Safe mode: no hints, rot cards or pins come up' : 'Safe mode off')
            }} />
          </Setting>
          <Setting title="Open at login" note="Vigil starts with your Mac, quietly in the menu bar, so ⌘. works straight away and your sticky notes are back where you left them.">
            <Switch checked={settings.openAtLogin !== false} onCheckedChange={(openAtLogin) => set({ openAtLogin })} />
          </Setting>
          <Setting title="Show sticky notes" note="Every note stuck on the desktop, or all of them put away; they keep their places. ⌃⌥⌘N from anywhere.">
            <Switch checked={settings.stickiesShown} onCheckedChange={(stickiesShown) => set({ stickiesShown })} />
          </Setting>
          <Setting title="Frosted stickies" note="Your wallpaper, softly blurred behind each note. Off makes them plain paper." keywords="sticky notes frosted glass blur wallpaper desktop transparent paper">
            <Switch checked={settings.stickiesFrosted !== false} onCheckedChange={(stickiesFrosted) => set({ stickiesFrosted })} />
          </Setting>
          <Setting title="Show Vigil in screen recordings and shares" note="Off: every Vigil window, sticky notes included, shows as blank in a shared screen, a recording or a screenshot, while you still see it. On: they show, for a demo or a Loom. Also in ⌘K." keywords="record recording screen share sharing zoom loom demo screenshot capture hide sticky notes">
            <Switch checked={recordable} onCheckedChange={setRecordable} />
          </Setting>
          {/* Only a choice while Vigil shows: off, the stickies are hidden with everything else. */}
          {recordable && (
            <Setting under title="Except sticky notes" note="Sticky notes stay blank in shares and recordings even so; the rest of Vigil shows." keywords="record recording screen share sharing hide sticky notes">
              <Switch checked={settings.stickiesUnshared} onCheckedChange={(stickiesUnshared) => set({ stickiesUnshared })} />
            </Setting>
          )}
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
          <Setting title="Exam nudges" note="A tag with an exam date (set on its page in Tags) says so in the box when its cards fall behind, once a day at most, never in quiet hours.">
            <Switch checked={settings.examNudges} onCheckedChange={(examNudges) => set({ examNudges })} />
          </Setting>
        </Group>

        <Group section="Tasks" title="Reminders">
          <Setting title="When a task's time comes" note="Pull: it moves to the top of Today, and nothing else happens. Quiet: the menu bar shows how many are due, with no sound. Alerts: the menu bar count, and a notification with a sound once, at its time.">
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

        <Group section="Writing" title="With each capture">
          <Setting title="Weather" note="Each capture keeps the weather outside when you caught it, like 12°C, light rain. It asks wttr.in, which guesses your town from your connection: no account and no location permission. Left out when offline.">
            <Switch checked={settings.weather} onCheckedChange={(weather) => set({ weather })} />
          </Setting>
        </Group>

        <Group section="Help" title="Getting started">
          <Setting title="Welcome" note="The two-minute start: the one key, your first capture, and how things come back." keywords="tour welcome onboarding start intro replay">
            <Button variant="outline" size="sm" onClick={playWelcome}>Play it again</Button>
          </Setting>
          <Setting title="Sandbox" note={SANDBOX ? "You're in it now: a practice copy of Vigil, filled with examples to try. Your own notes stay exactly as they are." : 'A practice copy of Vigil, filled with examples to try. Your own notes stay exactly as they are.'} keywords="sandbox practice examples demo try sample playground">
            {SANDBOX ? (<>
              <Button variant="outline" size="sm" onClick={() => void leaveSandbox()}>Back to my notes</Button>
              <Button variant="outline" size="sm" onClick={() => void resetSandbox()}>Reset</Button>
            </>) : (
              <Button variant="outline" size="sm" onClick={() => void enterSandbox()}>Open the sandbox</Button>
            )}
          </Setting>
          <OnboardingRows />
          <Setting title="Shortcut sheet" note="Every shortcut over the window you are in, whenever you are not typing.">
            <Kbd>{keyFor('?') || 'None'}</Kbd>
          </Setting>
        </Group>

        <Group section="Import and backups" title="Import and export">
          <Setting title="Import" note="Notes from an Obsidian vault or a Notion export (as Markdown, unzipped); highlights from Readwise or Kindle; Markdown files, bookmarks or Anki cards." keywords="import obsidian vault notion export readwise kindle markdown bookmarks anki bring move">
            <ImportButton what="vault">Obsidian or Notion…</ImportButton>
            <ImportButton what="files">Files…</ImportButton>
          </Setting>
          <Setting title="Export everything" note="All of it as JSON and Markdown, in a folder you choose: yours to read without this app.">
            <ExportButton />
          </Setting>
          <Setting title="Unused pictures and files" note="Ones no note, old version or page points at any more. You see them first and keep any you like; the rest go to the Mac's Bin, never deleted outright." keywords="clear clean space disk images attachments trash bin">
            <Button variant="outline" size="sm" onClick={() => window.dispatchEvent(new CustomEvent('vigil:unused'))}>Find them</Button>
          </Setting>
        </Group>
        <Group section="Import and backups" title="Backups">
          {/* Always on: there is no switch, so the row says so and where the copies go. */}
          <Setting title="Daily backup" note="Always on, with nothing to set: every day a full copy of everything, private notes included, with every picture and file, goes to the folder below. The last 30 days are kept." below={<BackupPlace />} keywords="backup backups icloud copy daily database safe" />
          {!SANDBOX && <Setting title="Restore from a backup" note="Go back to one of those daily copies. What you have now is saved first, beside them, so a restore can be undone the same way. Vigil then starts again on the copy you chose. Also in ⌘K." keywords="restore backup undo go back copy recover">
            <Button variant="outline" size="sm" onClick={() => void window.api.restoreBackup()}>Restore…</Button>
          </Setting>}
          <Setting title="Markdown copies" note="Each capture also kept in that folder as a plain Markdown file, readable without Vigil; never a private or discarded one. Turning this off takes those files away within the hour. The daily backup goes on either way." keywords="backup markdown copies plain text files icloud">
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

/** Where the backups go: iCloud Drive when there is one, otherwise beside the app's data. */
function BackupPlace(): React.JSX.Element {
  const [where, setWhere] = useState('')
  useEffect(() => void vigil.backupsWhere().then(setWhere), [])
  return <p className="mt-1.5 text-xs text-muted-foreground">Backups go to <span className="font-mono break-all text-foreground/80">{where.includes('CloudDocs') ? 'iCloud Drive › mindflow' : where || '…'}</span></p>
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
          if (typeof made === 'string') return refuse(made, 'error')
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
      Only {tuning.stopped} of the last {tuning.shown} hints stopped you, so half as many are being shown: 1 in {Math.round(1 / tuning.rate)}. It goes back up when they start landing again.
    </p>
  )
}

/**
 * The folders Scenery takes its pictures from: each with a count of what is
 * ready in it, a way to take it out (undoable), and one to add another.
 */
function SceneryFolders({ folders, on, onSave, use = 'scenery', title = 'Folders', note = 'Where the pictures come from.' }: { folders: string[]; on: boolean; onSave: (folders: string[]) => void; use?: 'scenery' | 'covers'; title?: string; note?: string }): React.JSX.Element {
  // Asked again every second or two while a scan runs, since nothing else
  // says when it is done: the count climbs and the orb goes when it ends.
  const [ask, setAsk] = useState(0)
  const found = useLive(() => (on && folders.length ? vigil.scenery(folders, use) : Promise.resolve(null)), null as Awaited<ReturnType<typeof vigil.scenery>> | null, [on, JSON.stringify(folders), ask])
  const ready = found?.scenes.length ?? 0
  useEffect(() => {
    if (!found?.scanning) return
    const timer = setTimeout(() => setAsk((n) => n + 1), 1500)
    return () => clearTimeout(timer)
  }, [found, ask])
  return (
    <Setting
      title={title}
      note={`${note} They stay where they are: Vigil keeps only smaller copies for itself, and looks for new ones every ten minutes or so.${on && found ? ` ${ready} ${ready === 1 ? 'picture' : 'pictures'} ready${found.scanning ? ', more on the way' : ''}.` : ''}`}
      keywords={use === 'covers' ? 'covers grain gradients tiles folder pictures choose remove' : 'scenery folder pictures images add remove choose'}
      below={folders.length > 0 && (
        <div className="mt-2 flex flex-col gap-1">
          {folders.map((folder) => (
            <span key={folder} className="flex items-center gap-2 rounded-md border py-1 pr-1 pl-2.5 text-control">
              <span className="min-w-0 flex-1 truncate" title={folder}>{folder.split('/').slice(-2).join('/')}</span>
            <InFinder folder={folder} />
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
      {/* The first look through a folder makes its small copies: a real wait,
          said by the bare orb beside the button; the words are in the note. */}
      {on && found?.scanning && <Tip label="Making smaller copies of new pictures"><span role="status" aria-label="Making copies" className="flex size-7 items-center justify-center"><Orb state="searching" /></span></Tip>}
      <Button variant="outline" size="sm" onClick={() => void vigil.sceneryFolder().then((folder) => {
        if (!folder) return
        if (folders.includes(folder)) return refuse('That folder is already in the list')
        // Covers take one folder: a new one takes the old one's place.
        onSave([...folders, folder])
        chime('settled')
        toast(`Added ${folder.split('/').pop()}`, () => onSave(folders))
      })}>
        <FolderPlus className="size-4" /> {use === 'covers' && folders.length ? 'Choose another…' : use === 'covers' ? 'Choose a folder…' : 'Add a folder…'}
      </Button>
    </Setting>
  )
}

/** A folder's row: open it in Finder. */
function InFinder({ folder }: { folder: string }): React.JSX.Element {
  return (
    <Tip label="Show in Finder">
      <button type="button" className="rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => (chime('open'), window.api.showFolder(folder))}>
        <AliveIcon icon={ExternalLinkIcon} size={12} />
      </button>
    </Tip>
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
      title="Celebrations folder"
      note={`GIFs, pictures and short clips (under 25 MB and 20 seconds) to play on a milestone, one at random. They stay where they are and are never changed. One on a see-through background comes on by itself, without a card. With no folder, a soft grainy picture instead.${on && found ? ` ${found.length} ready.` : ''}`}
      keywords="celebrations celebrate folder gif memes videos clips pictures choose remove"
      below={folder && (
        <div className="mt-2 flex flex-col gap-1">
          <span className="flex items-center gap-2 rounded-md border py-1 pr-1 pl-2.5 text-control">
            <span className="min-w-0 flex-1 truncate" title={folder}>{folder.split('/').slice(-2).join('/')}</span>
            <InFinder folder={folder} />
            <button type="button" aria-label={`Remove ${folder}`} className="rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => {
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
      <Setting title="Page hints" note="One line the first time you reach a page, saying what it is for." keywords="hints tips help first time page">
        {state.hintsSeen.length > 0 && <Button variant="outline" size="sm" onClick={() => void onboarding.set({ hintsSeen: [], pageHints: true }).then(() => toast('Page hints will show again'))}>Show them again</Button>}
        <Switch checked={state.pageHints} onCheckedChange={(on) => void onboarding.set({ pageHints: on })} />
      </Setting>
      {!state.sandbox && state.welcomed && (
        <Setting title="Getting started" note="The checklist on Home: eight firsts that tick themselves as you do them." keywords="getting started checklist onboarding">
          {state.hidden ? <Button variant="outline" size="sm" onClick={() => void onboarding.set({ hidden: false }).then(() => toast('Getting started is back on Home'))}>Show it</Button> : <span className="text-control text-muted-foreground">On Home</span>}
        </Setting>
      )}
    </>
  )
}

const MOMENT_NAMES: [MomentKind, string][] = [
  ['kept', '100th capture and other counts'],
  ['streak', 'Days in a row'],
  ['inbox', 'Inbox empty'],
  ['tasks', "Today's tasks done"],
  ['year', 'A note from a year ago'],
  ['answered', 'A question answered'],
  ['goalHalf', 'A goal halfway'],
  ['goal30', 'A goal 30 days away'],
  ['goal7', 'A goal a week away'],
  ['goalDay', "A goal's day"],
  ['goalMade', 'A goal made'],
  ['stickyDone', "A sticky's list done"],
  ['started', 'Getting started, all done']
]

/**
 * Files of its own for each kind of milestone, one played at random: each
 * picture small (click it to see that celebration with it, its ✕ to take it
 * off, undoable), and a way to add more. With none, any from the folder.
 */
function CelebrationPicks({ picks, on, onSave }: { picks: Partial<Record<MomentKind, string[]>>; on: boolean; onSave: (picks: Partial<Record<MomentKind, string[]>>) => void }): React.JSX.Element {
  const found = useLive(() => vigil.celebrationPicks(), {} as Awaited<ReturnType<typeof vigil.celebrationPicks>>, [JSON.stringify(picks)])
  const thumb = 'relative size-9 shrink-0 overflow-hidden rounded-[5px] bg-muted text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50 enabled:hover:opacity-85'
  return (
    <Setting
      title="What plays for each"
      note="Files of its own for each kind of milestone, one at random in place of one from the folder, never the same twice running. Click a picture to see it. A file that has moved or gone is passed over."
      keywords="celebrations celebrate pick choose file gif meme clip per moment milestone"
      below={
        <div className="mt-2 flex flex-col gap-1">
          {MOMENT_NAMES.map(([kind, label]) => {
            const paths = picks[kind] ?? []
            const media = found[kind] ?? []
            const missing = paths.filter((path) => !media.some((one) => one.path === path)).length
            const note = !paths.length ? 'Any from the folder'
              : !media.length ? 'Not found, so any from the folder'
                : `${media.length === 1 ? media[0].name : `${media.length} files, one at random`}${missing ? `, ${missing} not found` : ''}`
            return (
              <div key={kind} className="flex items-center gap-2.5 rounded-md border py-1 pr-1 pl-2.5 text-control">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-foreground">{label}</span>
                  <span className="block truncate text-meta text-muted-foreground">{note}</span>
                </span>
                <div className="flex max-w-[60%] flex-wrap justify-end gap-1">
                  {!paths.length && (
                    <Tip label="See this one">
                      <button type="button" aria-label={`See ${label}`} disabled={!on} onClick={() => tryCelebration(kind)} className={thumb}>
                        <Shuffle className="absolute inset-0 m-auto size-3.5" />
                      </button>
                    </Tip>
                  )}
                  {paths.map((path) => {
                    const one = media.find((each) => each.path === path)
                    const name = path.split('/').pop()
                    return (
                      <span key={path} className="group/pick relative">
                        <Tip label={one ? one.name : `${name} not found`}>
                          <button type="button" aria-label={`See ${label} with ${name}`} disabled={!on || !one} onClick={() => one && tryCelebration(kind, one)} className={`${thumb} ${one ? '' : 'border border-dashed bg-transparent'}`}>
                            {one ? (
                              one.video ? (
                                <video src={`${one.url}#t=0.1`} muted playsInline preload="metadata" className="absolute inset-0 size-full object-cover" />
                              ) : (
                                // A sprite is shown whole, on the plain ground, never cropped.
                                <img src={one.url} alt="" draggable={false} className={`absolute inset-0 size-full ${one.sprite ? 'object-contain p-0.5' : 'object-cover'}`} />
                              )
                            ) : (
                              <span className="absolute inset-0 grid place-items-center text-meta">?</span>
                            )}
                          </button>
                        </Tip>
                        <button type="button" aria-label={`Remove ${name} from ${label}`} className="absolute -top-1 -right-1 grid size-4 place-items-center rounded-full border bg-background text-muted-foreground opacity-0 shadow-sm transition-opacity group-hover/pick:opacity-100 hover:text-foreground focus-visible:opacity-100" onClick={() => {
                          // An emptied kind is kept as empty, so it stays any from the folder.
                          onSave({ ...picks, [kind]: paths.filter((each) => each !== path) })
                          chime('away')
                          toast(`${label}: removed ${name}`, () => onSave(picks))
                        }}>
                          <X className="size-2.5" />
                        </button>
                      </span>
                    )
                  })}
                </div>
                <Button variant="outline" size="sm" disabled={!on} onClick={() => void vigil.celebrationFiles().then((chosen) => {
                  if (!chosen.length) return
                  const fresh = [...new Set(chosen)].filter((path) => !paths.includes(path))
                  if (!fresh.length) return refuse(chosen.length === 1 ? 'That file is already chosen' : 'Those files are already chosen')
                  onSave({ ...picks, [kind]: [...paths, ...fresh] })
                  chime('settled')
                  toast(`${label}: ${fresh.length === 1 ? `added ${fresh[0].split('/').pop()}` : `added ${fresh.length} files`}`, () => onSave(picks))
                })}>
                  Add…
                </Button>
              </div>
            )
          })}
        </div>
      }
    />
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
