import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ChevronDown, FlaskConical, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'

import { MindflowEditor, readMarkdown } from '@/components/mindflow'
import { AliveIcon } from '@/components/vigil/alive-icon'
import ArrowBackUpIcon from '@/components/ui/arrow-back-up-icon'
import RefreshIcon from '@/components/ui/refresh-icon'
import { Tip, toast } from '@/components/vigil/ui'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { HoldButton } from '@/components/vigil/hold-button'
import { ProgressBar } from '@/components/vigil/progress-bar'
import { applyTheme, currentTheme } from '@/lib/theme'
import { EASE, shift } from '@/lib/motion'
import { chime } from '@/lib/sound'
import { vigil } from '@/lib/vigil'
import { SANDBOX, enterSandbox, leaveSandbox, resetSandbox, sandboxState, startSandboxOver, type Carry, type Going as GoingTo } from '@/lib/sandbox'
import { builtInScenery, seedSandbox } from '@/lib/sandbox-seed'

/**
 * Everything that says "you are in the sandbox". One colour, the yellow hue on
 * a faint wash of itself, and one edge nothing else in Vigil uses: a dashed
 * line, like masking tape on a practice copy. Never a banner across the
 * window, which would fight the scenery; a strip of tape where your eye
 * already goes.
 */
const TAPE: CSSProperties = {
  // Mixed a little toward the text colour: deeper on a light theme, brighter on a dark one, legible on both.
  color: 'color-mix(in oklab, var(--tt-color-text-yellow) 78%, var(--foreground))',
  backgroundColor: 'color-mix(in srgb, var(--tt-color-text-yellow) 11%, transparent)',
  borderColor: 'color-mix(in srgb, var(--tt-color-text-yellow) 55%, transparent)'
}
const NO_DRAG = { WebkitAppRegion: 'no-drag' } as CSSProperties
const SAID = "You're in the sandbox: a peek into someone else's book. Try anything; your own notes are safe."

/** The sandbox's own small buttons: the tape's colour, a little stronger under the pointer, pressed in on click. */
const PART = 'flex h-full items-center gap-1.5 px-2.5 font-medium transition-[background-color,transform] duration-150 ease-out hover:bg-[color-mix(in_srgb,var(--tt-color-text-yellow)_14%,transparent)] active:scale-[0.97] focus-visible:outline-none focus-visible:bg-[color-mix(in_srgb,var(--tt-color-text-yellow)_18%,transparent)]'
const RULE = <span aria-hidden className="h-3.5 w-px shrink-0 bg-[color-mix(in_srgb,var(--tt-color-text-yellow)_40%,transparent)]" />

/**
 * In the main window's top bar, always, with nothing to dismiss: Sandbox,
 * Back to my notes, Reset. Reset asks once, in the pill itself, and Start
 * over is held, not clicked: nothing brings back what was there. ⌘K and the
 * menus ask here too (vigil:sandbox-reset).
 *
 * It gives way to the page's name as the bar narrows (the bar is the `bar`
 * container in home.tsx): first its sentence, then its buttons' words, and
 * in a cramped bar it is only the flask, which opens the same two choices
 * as a menu. The page's name is never squeezed to a letter.
 */
export function SandboxPill(): React.JSX.Element | null {
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const sure = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const onAsk = (): void => (chime('tap'), setAsking(true))
    window.addEventListener('vigil:sandbox-reset', onAsk)
    return () => window.removeEventListener('vigil:sandbox-reset', onAsk)
  }, [])
  useEffect(() => {
    if (!asking) return
    // A turn later, so a menu closing (⌘K, the Vigil menu) does not take focus back after.
    const later = setTimeout(() => sure.current?.focus(), 0)
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      chime('fold')
      setAsking(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => (clearTimeout(later), window.removeEventListener('keydown', onKey, true))
  }, [asking])
  if (!SANDBOX) return null
  const go = (run: () => Promise<void>): void => {
    if (busy) return
    setBusy(true)
    void run().catch(() => setBusy(false))
  }
  // The words swap in place, the old ones blurring out as the new ones arrive,
  // so the pill reads as one thing changing its mind rather than two swapping.
  const swap = { initial: { opacity: 0, filter: 'blur(3px)' }, animate: { opacity: 1, filter: 'blur(0px)' }, exit: { opacity: 0, filter: 'blur(3px)', transition: { duration: 0.1 } }, transition: { duration: 0.18, ease: EASE } }
  return (
    <span data-sandbox-pill role="group" aria-label="Sandbox" style={{ ...TAPE, ...NO_DRAG }}
      className="ml-2 flex h-7 shrink-0 items-center overflow-hidden rounded-full border border-dashed text-control">
      <Tip label={SAID}>
        {/* A label, not a button: a filled strip of tape in bold, so the
            two answers after it read as the only things to press. Only the flask once the bar is tight. */}
        <span tabIndex={0} className={`${asking ? 'hidden @min-[720px]/bar:flex' : 'hidden @min-[600px]/bar:flex'} h-full cursor-default items-center gap-1.5 bg-[color-mix(in_srgb,var(--tt-color-text-yellow)_16%,transparent)] pr-2.5 pl-2.5 font-semibold outline-none`}>
          <FlaskConical className="size-3 shrink-0" strokeWidth={2.25} />
          Sandbox
        </span>
      </Tip>
      {asking ? (
        <Tip label={SAID}>
          <span tabIndex={0} className="flex h-full cursor-default items-center bg-[color-mix(in_srgb,var(--tt-color-text-yellow)_16%,transparent)] px-2 outline-none @min-[720px]/bar:hidden">
            <FlaskConical className="size-3.5 shrink-0" strokeWidth={2.25} />
          </span>
        </Tip>
      ) : (
        // Cramped: the flask is the whole pill, and its two choices wait in a menu.
        <DropdownMenu modal={false}>
          <Tip label={`${SAID} Back to my notes, or reset it.`}>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="Sandbox" disabled={busy}
                className="flex h-full items-center gap-1 bg-[color-mix(in_srgb,var(--tt-color-text-yellow)_16%,transparent)] pr-2 pl-2.5 transition-colors outline-none hover:bg-[color-mix(in_srgb,var(--tt-color-text-yellow)_24%,transparent)] focus-visible:bg-[color-mix(in_srgb,var(--tt-color-text-yellow)_24%,transparent)] @min-[600px]/bar:hidden">
                <FlaskConical className="size-3.5 shrink-0" strokeWidth={2.25} />
                <ChevronDown className="size-3 shrink-0 opacity-70" strokeWidth={2.25} />
              </button>
            </DropdownMenuTrigger>
          </Tip>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onSelect={() => go(leaveSandbox)}>Back to my notes</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => (chime('tap'), setAsking(true))}>Reset the sandbox…</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <AnimatePresence mode="popLayout" initial={false}>
        {asking ? (
          <motion.span key="ask" {...swap} className="flex h-full items-center">
            {/* The answer that does something is the one in the tape's colour, and
                says on its face that it is held; Cancel is quiet. */}
            <HoldButton ref={sure} variant={null} hint="Every example back to how it began" done="Starting over…" disabled={busy} onHold={() => go(startSandboxOver)} className={`${PART} font-semibold`}>
              Hold to start over
            </HoldButton>
            {RULE}
            <Tip label="Cancel">
              <button type="button" onClick={() => (chime('fold'), setAsking(false))} className={`${PART} pr-3 text-foreground/70 hover:text-foreground`}>
                <span className="hidden @min-[640px]/bar:inline">Cancel</span>
                <X className="size-3.5 @min-[640px]/bar:hidden" strokeWidth={2.25} />
              </button>
            </Tip>
          </motion.span>
        ) : (
          <motion.span key="parts" {...swap} className="hidden h-full items-center @min-[600px]/bar:flex">
            <Tip label="Back to my notes: Vigil starts again on your own notes">
              <button type="button" disabled={busy} onClick={() => go(leaveSandbox)} className={PART}>
                <AliveIcon icon={ArrowBackUpIcon} size={14} />
                {/* Said in full where there is room; in a tighter bar, the short way, then only the arrow. */}
                <span className="hidden @min-[720px]/bar:inline @min-[1000px]/bar:hidden">My notes</span>
                <span className="hidden @min-[1000px]/bar:inline">Back to my notes</span>
              </button>
            </Tip>
            {RULE}
            <Tip label="Reset: their book back to how it began">
              <button type="button" disabled={busy} onClick={() => (chime('tap'), setAsking(true))} className={`${PART} pr-3`}>
                <AliveIcon icon={RefreshIcon} size={14} />
                <span className="hidden @min-[720px]/bar:inline">Reset</span>
              </button>
            </Tip>
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  )
}

/** In the box, beside Create: the same tape, small. */
export function SandboxChip(): React.JSX.Element | null {
  if (!SANDBOX) return null
  return (
    <Tip label={SAID}>
      <span tabIndex={0} style={TAPE} className="mr-2 flex h-6 items-center gap-1 rounded-full border border-dashed px-2 text-xs font-semibold outline-none">
        <FlaskConical className="size-3 shrink-0" strokeWidth={2.25} />
        Sandbox
      </span>
    </Tip>
  )
}

/**
 * On a sticky or a goal's beacon: a small label on its top edge, as if printed
 * on the tape. On glass the card fills its window and has no edge to spare, so
 * the stamp goes in the title row instead (`inline`), where it covers nothing.
 */
export function SandboxStamp({ inline = false }: { inline?: boolean }): React.JSX.Element | null {
  if (!SANDBOX) return null
  const glass = new URLSearchParams(location.search).has('glass')
  if (glass !== inline) return null
  return (
    <span aria-label="Sandbox" title={SAID}
      style={{ ...TAPE, backgroundColor: 'color-mix(in srgb, var(--tt-color-text-yellow) 14%, var(--popover))' }}
      className={`pointer-events-none ${inline ? 'relative shrink-0 self-center' : 'absolute -top-[7px] left-3 z-10'} rounded-[3px] border border-dashed px-1 py-px text-[10px] leading-none font-semibold opacity-80`}>
      Sandbox
    </span>
  )
}

// Once per page: React runs an effect twice while developing.
let started = false

/**
 * The way into (or out of) the sandbox, as a moment: the window goes quiet,
 * the words in the middle, and under them a blade lit (or put away) by
 * saberOn and saberOff in lib/sandbox.ts, which also play its sound and time
 * the two together. Always a blade, whatever bars you chose.
 */
// Arrived by that restart: the window opens on the blade as it was left (lit
// in the sandbox, put away back home), and lets it go.
const ARRIVED = new URLSearchParams(location.search).has('arrived')

function Going(): React.JSX.Element | null {
  const [going, setGoing] = useState<GoingTo | null>(ARRIVED ? { text: SANDBOX ? 'Opening the sandbox' : 'Back to your notes', up: SANDBOX, ms: 0 } : null)
  const motionOn = document.documentElement.dataset.motion !== 'off'
  useEffect(() => {
    const on = (event: Event): void => setGoing((event as CustomEvent<GoingTo>).detail)
    window.addEventListener('vigil:going', on)
    // Long enough to be seen as the same moment going on, then into the app.
    const off = ARRIVED ? setTimeout(() => setGoing(null), 700) : undefined
    return () => (window.removeEventListener('vigil:going', on), clearTimeout(off))
  }, [])
  return (
    <AnimatePresence>
      {going !== null && (
        <motion.div
          key="going"
          role="status"
          data-going={going.up ? 'on' : 'off'}
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-6 bg-background"
          initial={ARRIVED && going.ms === 0 ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.35, ease: EASE } }}
          transition={{ duration: 0.2, ease: EASE }}
        >
          <p className="font-heading text-[clamp(1.5rem,4vw,2.5rem)] font-medium tracking-[-0.02em] text-foreground">{going.text}</p>
          {/* At rest where it starts (put away to light, lit to put away); saber() moves it, on the sound's clock. With Motion off, none. */}
          {motionOn && <ProgressBar as="saber" value={going.ms === 0 ? (going.up ? 1 : 0) : going.up ? 0 : 1} label={going.text} thick={4} blade="var(--primary)" className="w-[min(26rem,70vw)]" />}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/**
 * Mounted once in the main window. In your own Vigil: the way into the sandbox
 * from the menu bar, and the offer to bring home anything caught there. In the
 * sandbox: on its first start, your look worn and the examples set out.
 */
/** Marks the sandbox's lightsaber bars as set; true the first time, so they are set only once. */
function sabersWorn(): boolean {
  try {
    if (localStorage.getItem('sandbox-sabers')) return false
    localStorage.setItem('sandbox-sabers', 'set')
    return true
  } catch {
    return false
  }
}

export function SandboxHost(): React.JSX.Element | null {
  const [seeding, setSeeding] = useState(false)
  const [stale, setStale] = useState<number | null>(null)

  useEffect(() => {
    // From the menu bar: the same ways in and out as everywhere else.
    const onEnter = (): void => void enterSandbox()
    const onLeave = (): void => void leaveSandbox()
    window.addEventListener('vigil:sandbox-enter', onEnter)
    window.addEventListener('vigil:sandbox-leave', onLeave)
    return () => (window.removeEventListener('vigil:sandbox-enter', onEnter), window.removeEventListener('vigil:sandbox-leave', onLeave))
  }, [])

  useEffect(() => {
    if (started) return
    started = true
    if (!SANDBOX) {
      // Scenery on with no folder of yours: Vigil's own landscapes, once, so a
      // first start is not a bare page. Your own folders, once chosen, replace them.
      void vigil.settings().then(async (settings) => {
        if (!settings.scenery || settings.sceneryFolders.length || localStorage.getItem('scenery-built-in')) return
        // Marked done only once the folder is really set: copying the pictures
        // takes a moment, and a reload (⌘R) in that moment, marked first, left
        // a first start with no pictures for good.
        await window.api.vigil('settings:set', { sceneryFolders: [await builtInScenery()] })
        localStorage.setItem('scenery-built-in', 'set')
      }).catch(() => undefined)
      // Anything caught for real while practising, offered once you are back.
      void (window.api.vigil('sandbox:carried') as Promise<{ title: string }[]>).then((carried) => {
        if (!carried.length) return
        const things = carried.length === 1 ? '1 thing' : `${carried.length} things`
        setTimeout(() => toast(`You caught ${things} in the sandbox. Bring ${carried.length === 1 ? 'it' : 'them'} into your notes?`, undefined, 'info', {
          label: carried.length === 1 ? 'Bring it' : 'Bring them', key: 'B',
          run: () => void (window.api.vigil('sandbox:carried:take', true) as Promise<number>).then((made) => (chime('send'), toast(made === 1 ? 'Brought into your Inbox' : `${made} brought into your Inbox`)))
        }), 1200)
      })
      return
    }
    // The old tour belongs to your own first run, not the practice copy.
    try {
      localStorage.setItem('tour', 'done')
    } catch {
      // Then it may show once; nothing worse.
    }
    // Said on arrival too, so the restart's own message never has to be caught in passing.
    // The arrival is said in a line docked under the top bar (PageHint), not a
    // toast: a toast sat over Home's own rows while it was read.
    void sandboxState().then(async (state) => {
      if (state.seeded) {
        // A sandbox set out before its bars were lightsabers gets them, once; changed there after, they stay changed.
        if (sabersWorn()) await window.api.vigil('settings:set', { progressBars: 'saber' })
        const days = state.seededOn ? Math.round((Date.now() - new Date(`${state.seededOn}T12:00`).getTime()) / 86_400_000) : 0
        if (days > 7) setStale(days)
        return
      }
      setSeeding(true)
      const carry = (await window.api.vigil('sandbox:carry')) as Carry | null
      for (const [key, value] of Object.entries(carry?.local ?? {})) {
        // The sandbox wears Paper: a practice copy that looks unlike your own book. Its theme is its own once changed there.
        if (key === 'theme') continue
        try {
          localStorage.setItem(key, value)
        } catch {
          // Worn for now, not remembered.
        }
      }
      try {
        if (!localStorage.getItem('sandbox-theme-chosen')) {
          localStorage.setItem('theme', 'paper')
          localStorage.setItem('sandbox-theme-chosen', 'paper')
        }
      } catch {
        // Worn for now, not remembered.
      }
      applyTheme(currentTheme(), false)
      // Its own pictures, whatever yours are: four public-domain landscapes for
      // Scenery and Vigil's own grain for covers; your celebrations come along.
      // Its bars are lightsabers whatever yours are: the book is someone else's, and they love Star Wars.
      const settings = { ...(carry?.settings ?? {}), progressBars: 'saber', scenery: true, sceneryFolders: [await builtInScenery()], coversFolder: '' }
      sabersWorn()
      // An editor on the page reads Markdown for the seed; wait for one, five seconds at most.
      for (let waited = 0; !readMarkdown('x') && waited < 5000; waited += 100) await new Promise((wait) => setTimeout(wait, 100))
      await seedSandbox(readMarkdown)
      await window.api.vigil('settings:set', { ...settings, celebrate: true, quietStart: '00:00', quietEnd: '00:00' })
      await window.api.vigil('sandbox:seeded')
      setSeeding(false)
      chime('scene')
    })
  }, [])

  if (!SANDBOX) return <Going />
  return (
    <>
      <Going />
      {seeding && (
        <div aria-hidden className="pointer-events-none fixed -left-[9999px] top-0 h-40 w-96 overflow-hidden opacity-0">
          <MindflowEditor defaultContent="" readOnly toolbar={false} handles={false} slash={false} outline={false} search={false} autofocus={false} />
        </div>
      )}
      <AnimatePresence>
        {(seeding || stale) && (
          <motion.div key={seeding ? 'seeding' : 'stale'} role="status"
            initial={{ opacity: 0, transform: shift('translateY(-4px)') }} animate={{ opacity: 1, transform: shift('translateY(0px)') }} exit={{ opacity: 0, transition: { duration: 0.14 } }}
            transition={{ duration: 0.2, ease: EASE }}
            style={TAPE}
            className="fixed inset-x-0 top-12 z-50 mx-auto flex w-fit items-center gap-2 rounded-full border border-dashed bg-background px-3 py-1 text-control shadow-(--mf-panel-shadow)">
            {seeding ? (
              <span className="text-foreground/85">Setting out the examples…</span>
            ) : (
              <>
                <span className="text-foreground/85">These examples are from {stale} days ago, so their dates have drifted.</span>
                <button type="button" onClick={() => (setStale(null), void resetSandbox())} className="font-semibold hover:underline">Freshen</button>
                <button type="button" aria-label="Not now" onClick={() => setStale(null)} className="text-muted-foreground hover:text-foreground">Not now</button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
