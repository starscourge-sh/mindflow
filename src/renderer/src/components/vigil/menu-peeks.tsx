import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BookOpen, Check, FlaskConical, Keyboard, Lightbulb, Pin, RotateCcw, Settings2, Sparkles, Undo2, Upload } from 'lucide-react'
import { BesidePeek, MCard, MChip, MLabel, MRow, MTitle, PeekCard, carrying, tinted } from './peek'

/**
 * The Vigil menu's previews, at the foot of the sidebar: pointed at or
 * arrowed to, a row shows a card beside the menu saying what it does, the
 * same card as a sidebar entry's (page-peeks.tsx). A row says which card is
 * its own with `data-peek`.
 */

type MenuPeekEntry = { text: string; art: () => ReactNode; keys?: string; /** Drawn to fit, so not faded at its foot. */ whole?: boolean }

/** A small switch, drawn. */
const Toggle = ({ on }: { on: boolean }): React.JSX.Element => (
  <span className={`relative inline-block h-2.5 w-[18px] shrink-0 rounded-full ${on ? '' : 'bg-foreground/20'}`} style={on ? { backgroundColor: 'var(--tt-color-text-green)' } : undefined}>
    <span className={`absolute top-[1px] size-2 rounded-full bg-background ${on ? 'left-[9px]' : 'left-[1px]'}`} />
  </span>
)

/**
 * A little Home, with Safe mode off and on: off, a hint, an old capture and a
 * pinned note come up among the day; on, the same page with those three
 * simply not there. Every chip's words are short enough to end on a whole word.
 */
function SafeSide({ on }: { on: boolean }): React.JSX.Element {
  const chip = (icon: ReactNode, words: string): React.JSX.Element => (
    <div className="mb-0.5 flex items-center gap-1 rounded border px-1 text-[9.5px] leading-[13px] whitespace-nowrap" style={{ borderColor: 'color-mix(in oklab, var(--tt-color-text-orange) 35%, transparent)', backgroundColor: 'color-mix(in oklab, var(--tt-color-text-orange) 9%, transparent)' }}>
      {icon}{words}
    </div>
  )
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] leading-4 font-semibold">{on ? 'On' : 'Off'} <Toggle on={on} /></div>
      <div className="flex-1 overflow-hidden rounded-md border border-foreground/10 px-1.5 py-1">
        <div className="mb-0.5 text-[10px] leading-[13px] font-semibold">Home</div>
        {!on && (<>
          {chip(<Lightbulb className="size-2.5 shrink-0" style={tinted('yellow')} />, 'A hint')}
          {chip(<RotateCcw className="size-2.5 shrink-0 text-muted-foreground" />, 'Old capture')}
          {chip(<Pin className="size-2.5 shrink-0 text-muted-foreground" />, 'Pinned note')}
        </>)}
        <div className="flex items-center gap-1 py-px text-[9.5px]"><MCheckLite />Call Mum</div>
      </div>
    </div>
  )
}
const MCheckLite = (): React.JSX.Element => <span className="size-2 shrink-0 rounded-full border border-foreground/40" />

/** Three stickies, scattered, gliding into a column down the right (still with Reduce motion). */
function Stickies(): React.JSX.Element {
  const notes: [string, string, number, number, number][] = [
    // words, tint, scattered left %, top px, tilt
    ['Call Mum', 'yellow', 6, 8, -6],
    ['Act 3 by Thursday', 'pink', 34, 62, 5],
    ['Fear is the mind-killer', 'blue', 14, 92, -3]
  ]
  return (
    <div className="relative h-full">
      {/* The screen, with the right middle where they go. */}
      <div className="absolute inset-0 rounded border border-foreground/10" />
      {notes.map(([words, tint, left, top, tilt], n) => (
        <div key={words} className="mf-sticky-tidy absolute w-[5.5rem] rounded-sm px-1.5 py-1 text-[9px] leading-tight shadow-[0_2px_4px_-2px_rgb(0_0_0/0.4)]"
          style={{
            backgroundColor: `color-mix(in oklab, var(--tt-color-text-${tint}) 30%, var(--background))`,
            '--from-left': `${left}%`, '--from-top': `${top}px`, '--from-tilt': `${tilt}deg`,
            '--to-top': `${10 + n * 34}px`, animationDelay: `${n * 90}ms`
          } as React.CSSProperties}>
          {words}
        </div>
      ))}
    </div>
  )
}

const PEEKS: Record<string, MenuPeekEntry> = {
  settings: {
    text: '**Settings: how Vigil looks, sounds and behaves.** Every choice in one place, with a search.',
    keys: '⌘,',
    art: () => (<>
      <MTitle>Settings</MTitle>
      {[['Theme', 'Paper'], ['Sounds', true], ['Blurring', true], ['Quiet hours', '22:00 to 7:00'], ['Open at login', true]].map(([name, value]) => (
        <div key={name as string} className="flex items-center gap-1.5 border-b border-foreground/[0.06] py-[3px] last:border-b-0">
          <Settings2 className="size-3 text-muted-foreground" />
          <span className="flex-1">{name as string}</span>
          {typeof value === 'boolean' ? <Toggle on={value} /> : <span className="text-[9.5px] text-muted-foreground">{value as string}</span>}
        </div>
      ))}
    </>)
  },
  import: {
    text: '**Import: bring your notes in from Obsidian or Notion.** Pick the vault or the export, and its pages become notes here.',
    art: () => (
      <div className="flex h-full items-center justify-center gap-3">
        <MCard className="w-[5.5rem]"><div className="mb-1 text-[9.5px] font-semibold">My vault</div>{['Dune.md', 'Hamlet.md', 'Reading list.md'].map((one) => <div key={one} className="truncate text-[9px] text-muted-foreground">{one}</div>)}</MCard>
        <Upload className="size-4 rotate-90 text-muted-foreground" />
        <MCard className="w-[5.5rem]"><div className="mb-1 text-[9.5px] font-semibold">Vigil</div>{['Dune', 'Hamlet', 'Reading list'].map((one) => <div key={one} className="flex items-center gap-1 truncate text-[9px]"><Check className="size-2.5" style={tinted('green')} />{one}</div>)}</MCard>
      </div>
    )
  },
  safe: {
    text: '**Safe mode: nothing comes up on its own.** No hints, old captures coming back or pinned notes: for screen shares and quiet moments.',
    keys: '⌥⌘S',
    whole: true,
    art: () => <div className="flex h-full gap-2.5 pb-1"><SafeSide on={false} /><SafeSide on /></div>
  },
  blur: {
    text: '**Blurring: notes you mark “Private” stay blurred until you point at them.** A window you step away from dims, and new text fades in from a soft blur.',
    art: () => (<>
      <MTitle count={4}>Inbox</MTitle>
      <MRow meta="Note">Frankenstein began as a ghost story</MRow>
      <MRow meta="Private"><span className="blur-[3px]">Ask about the job in Bath</span></MRow>
      <MRow meta="Quote">To be, or not to be</MRow>
      <MRow meta="Private"><span className="blur-[3px]">What I really think of Mr Collins</span></MRow>
      <div className="mt-1.5 flex items-center gap-1.5 text-[9.5px] text-muted-foreground"><span className="inline-block h-3 w-5 rounded-sm border border-foreground/20 bg-foreground/10 opacity-60" />A window you leave dims</div>
    </>)
  },
  tidy: {
    text: '**Tidy stickies: every sticky note into a neat column down the right of its screen.** Put them back after, from the same menu.',
    keys: '⌃⌥⌘T',
    art: () => <Stickies />
  },
  shortcuts: {
    text: '**Keyboard shortcuts: every key Vigil knows, in one sheet.** Press ? anywhere in the window.',
    keys: '?',
    art: () => (<>
      <MTitle>Keyboard shortcuts</MTitle>
      {[['Capture from anywhere', '⌘.'], ['Search', '⌘K'], ['Go to Gems', 'G N'], ['Safe mode', '⌥⌘S'], ['Back', '⌘[']].map(([what, keys]) => (
        <div key={what} className="flex items-center gap-1.5 border-b border-foreground/[0.06] py-[3px] last:border-b-0">
          <Keyboard className="size-3 text-muted-foreground" /><span className="flex-1">{what}</span>
          <span className="flex gap-0.5">{keys.split(' ').map((key) => <span key={key} className="rounded border border-foreground/20 px-1 text-[9px]">{key}</span>)}</span>
        </div>
      ))}
    </>)
  },
  welcome: {
    text: '**Show the welcome again: the short tour from your first day.** What Vigil is for, in a minute.',
    art: () => (
      <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
        <Sparkles className="size-5" style={tinted('orange')} />
        <div className="font-serif text-[13px] font-semibold">Welcome to Vigil</div>
        <div className="text-[9.5px] text-muted-foreground">Catch a thought, keep what matters, and it comes back to you.</div>
        <div className="mt-1 flex gap-1">{[0, 1, 2, 3].map((n) => <span key={n} className={`size-1.5 rounded-full ${n ? 'bg-foreground/20' : 'bg-foreground/70'}`} />)}</div>
      </div>
    )
  },
  switch: {
    text: '**Switch book: open another of your books.** Each book is its own set of notes, kept apart from the others.',
    art: () => (<>
      <MTitle>Your books</MTitle>
      {[['Reading', 'brown', true], ['Work', 'blue', false], ['The Hamlet course', 'purple', false]].map(([name, tint, on]) => (
        <MRow key={name as string} icon={BookOpen} tint={tint as string} meta={on ? <MChip tint="green">Open</MChip> : ''}>{name as string}</MRow>
      ))}
    </>)
  },
  newbook: {
    text: '**New book: start a fresh set of notes.** Your other books stay as they are.',
    art: () => (<>
      <MTitle>New book</MTitle>
      <div className="rounded border border-foreground/15 px-1.5 py-1">The Hamlet course<span className="ml-px inline-block h-2.5 w-px translate-y-0.5 bg-foreground" /></div>
      <MLabel>Empty, ready for its first note</MLabel>
    </>)
  },
  sandbox: {
    text: "**Open the sandbox: a peek into someone else's book.** Their reading, films and goals, to try anything on; your own notes are never touched.",
    art: () => (<>
      <div className="mb-1.5 flex items-center gap-1"><MChip tint="yellow"><FlaskConical className="size-2.5" />Sandbox</MChip></div>
      <MRow meta="Quote">Fear is the mind-killer</MRow>
      <MRow meta="Question">Is Hamlet mad, or only pretending?</MRow>
      <MRow meta="Link">The Rosetta Stone, found in 1799</MRow>
    </>)
  },
  back: {
    text: '**Back to my notes: leave the sandbox.** Vigil restarts with your own book.',
    art: () => <div className="flex h-full items-center justify-center gap-2"><MChip tint="yellow"><FlaskConical className="size-2.5" />Sandbox</MChip><Undo2 className="size-4 text-muted-foreground" /><MChip tint="brown"><BookOpen className="size-2.5" />My notes</MChip></div>
  },
  reset: {
    text: "**Reset the sandbox: their book as it was at the start.** What you tried there goes.",
    art: () => <div className="flex h-full items-center justify-center gap-2"><RotateCcw className="size-5 text-muted-foreground" /><div className="text-[10px]">Fresh examples,<br />as on day one</div></div>
  },
  customize: {
    text: '**Customize sidebar: choose which pages it lists.** One switched off leaves the sidebar, still a G or ⌘K away.',
    art: () => (<>
      <MTitle>Customize sidebar</MTitle>
      {[['Inbox', true], ['Review', true], ['Matrix', false], ['Map', false]].map(([name, on]) => (
        <div key={name as string} className="flex items-center gap-1.5 border-b border-foreground/[0.06] py-[3px] last:border-b-0"><span className="flex-1">{name as string}</span><Toggle on={on as boolean} /></div>
      ))}
    </>)
  }
}

/**
 * Put inside a menu's content: shows the highlighted row's card once a row
 * has been highlighted a moment, then swaps at once as you move. Nothing
 * while something is being carried.
 */
export function MenuPeek(): React.JSX.Element {
  const probe = useRef<HTMLSpanElement>(null)
  const [id, setId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const seen = useRef(false)
  useEffect(() => {
    const menu = probe.current?.closest<HTMLElement>('[role="menu"]')
    if (!menu) return
    const read = (): void => setId(menu.querySelector('[data-highlighted][data-peek]')?.getAttribute('data-peek') ?? null)
    const watch = new MutationObserver(read)
    watch.observe(menu, { attributes: true, subtree: true, attributeFilter: ['data-highlighted'] })
    read()
    return () => watch.disconnect()
  }, [])
  useEffect(() => {
    if (!id || ready) return
    const timer = setTimeout(() => setReady(true), 450)
    return () => clearTimeout(timer)
  }, [id, ready])
  useEffect(() => void (ready && id && (seen.current = true)))
  const peek = ready && id && !carrying() ? PEEKS[id] : undefined
  return (<>
    <span ref={probe} hidden />
    {peek && (
      <BesidePeek menu={() => probe.current?.closest<HTMLElement>('[role="menu"]') ?? null} row={(menu) => menu.querySelector('[data-highlighted]')} fresh={!seen.current}>
        <PeekCard art={peek.art()} text={peek.text} keys={peek.keys} whole={peek.whole} />
      </BesidePeek>
    )}
  </>)
}
