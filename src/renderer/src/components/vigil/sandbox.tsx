import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { FlaskConical } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'

import { MindflowEditor, readMarkdown } from '@/components/mindflow'
import { AliveIcon } from '@/components/vigil/alive-icon'
import ArrowBackUpIcon from '@/components/ui/arrow-back-up-icon'
import RefreshIcon from '@/components/ui/refresh-icon'
import { Tip, toast } from '@/components/vigil/ui'
import { ProgressBar } from '@/components/vigil/progress-bar'
import { applyTheme, currentTheme } from '@/lib/theme'
import { EASE, shift } from '@/lib/motion'
import { chime } from '@/lib/sound'
import { GOING_MS, SANDBOX, enterSandbox, leaveSandbox, resetSandbox, sandboxState, type Carry } from '@/lib/sandbox'
import { sandboxScenery, seedSandbox } from '@/lib/sandbox-seed'

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
const SAID = "You're in the sandbox: a practice copy. Your notes are safe and untouched."

/** The sandbox's own small buttons: the tape's colour, a little stronger under the pointer, pressed in on click. */
const PART = 'flex h-full items-center gap-1.5 px-2.5 font-medium transition-[background-color,transform] duration-150 ease-out hover:bg-[color-mix(in_srgb,var(--tt-color-text-yellow)_14%,transparent)] active:scale-[0.97] focus-visible:outline-none focus-visible:bg-[color-mix(in_srgb,var(--tt-color-text-yellow)_18%,transparent)]'
const RULE = <span aria-hidden className="h-3.5 w-px shrink-0 bg-[color-mix(in_srgb,var(--tt-color-text-yellow)_40%,transparent)]" />

/**
 * In the main window's top bar, always, with nothing to dismiss: Sandbox,
 * Back to my notes, Reset. Reset asks once, in the pill itself.
 */
export function SandboxPill({ narrow = false }: { narrow?: boolean }): React.JSX.Element | null {
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const sure = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!asking) return
    sure.current?.focus()
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      chime('fold')
      setAsking(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
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
        {/* A label, not a button: a filled strip of tape with small capitals, so the
            two answers after it read as the only things to press. */}
        <span tabIndex={0} className="flex h-full cursor-default items-center gap-1.5 bg-[color-mix(in_srgb,var(--tt-color-text-yellow)_16%,transparent)] pr-2.5 pl-2.5 text-[0.6875rem] font-semibold tracking-[0.1em] uppercase outline-none">
          <FlaskConical className="size-3 shrink-0" strokeWidth={2.25} />
          Sandbox
        </span>
      </Tip>
      <AnimatePresence mode="popLayout" initial={false}>
        {asking ? (
          <motion.span key="ask" {...swap} className="flex h-full items-center">
            {!narrow && <span className="truncate px-2.5 text-foreground/85">Start over, as it began?</span>}
            {/* The answer that does something is the one in the tape's colour; Cancel is quiet. */}
            <button ref={sure} type="button" disabled={busy} onClick={() => go(resetSandbox)} className={`${PART} font-semibold`}>
              Start over
            </button>
            {RULE}
            <button type="button" onClick={() => (chime('fold'), setAsking(false))} className={`${PART} pr-3 text-foreground/70 hover:text-foreground`}>
              Cancel
            </button>
          </motion.span>
        ) : (
          <motion.span key="parts" {...swap} className="flex h-full items-center">
            <Tip label={narrow ? 'Back to my notes' : 'Vigil starts again on your own notes'}>
              <button type="button" disabled={busy} onClick={() => go(leaveSandbox)} className={PART}>
                <AliveIcon icon={ArrowBackUpIcon} size={14} />
                {/* Said in full where there is room; in a compact window, the short way. */}
                {!narrow && <><span className="max-[1199px]:hidden">Back to my notes</span><span className="min-[1200px]:hidden">My notes</span></>}
              </button>
            </Tip>
            {RULE}
            <Tip label={narrow ? 'Reset the sandbox' : 'Every example back to how it began'}>
              <button type="button" disabled={busy} onClick={() => (chime('tap'), setAsking(true))} className={`${PART} pr-3`}>
                <AliveIcon icon={RefreshIcon} size={14} />
                {!narrow && 'Reset'}
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

/** On a sticky or a goal's beacon: a small label on its top edge, as if printed on the tape. */
export function SandboxStamp(): React.JSX.Element | null {
  if (!SANDBOX) return null
  // Over the top edge on paper and frost, which have room round the card; on
  // glass the card fills its window, so the stamp sits inside its foot instead.
  const glass = new URLSearchParams(location.search).has('glass')
  return (
    <span aria-label="Sandbox" title={SAID}
      style={{ ...TAPE, backgroundColor: 'color-mix(in srgb, var(--tt-color-text-yellow) 14%, var(--popover))' }}
      className={`pointer-events-none absolute ${glass ? 'bottom-1 left-2' : '-top-[7px] left-3'} z-10 rounded-[3px] border border-dashed px-1 py-px text-[9px] leading-none font-semibold tracking-[0.14em] uppercase opacity-80`}>
      Sandbox
    </span>
  )
}

// Once per page: React runs an effect twice while developing.
let started = false

/**
 * The way into (or out of) the sandbox, as a moment: the window goes quiet,
 * the words in the middle, and a blade lights across under them as Vigil
 * gets ready, until it starts again. Always a blade, whatever bars you chose.
 */
function Going(): React.JSX.Element | null {
  const [text, setText] = useState<string | null>(null)
  const [lit, setLit] = useState(0)
  useEffect(() => {
    const on = (event: Event): void => setText((event as CustomEvent<string>).detail)
    window.addEventListener('vigil:going', on)
    return () => window.removeEventListener('vigil:going', on)
  }, [])
  // In small steps, each a quick slide, so it reads as one steady burn.
  useEffect(() => {
    if (text === null) return
    const start = performance.now()
    const timer = setInterval(() => setLit(Math.min(1, (performance.now() - start) / (GOING_MS - 200))), 90)
    return () => clearInterval(timer)
  }, [text])
  return (
    <AnimatePresence>
      {text !== null && (
        <motion.div
          key="going"
          role="status"
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-6 bg-background"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, ease: EASE }}
        >
          <p className="font-heading text-[clamp(1.5rem,4vw,2.5rem)] font-medium tracking-[-0.02em] text-foreground">{text}</p>
          <ProgressBar as="saber" value={lit} label={text} thick={4} blade="var(--primary)" ignite className="w-[min(26rem,70vw)]" />
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
export function SandboxHost(): React.JSX.Element | null {
  const [seeding, setSeeding] = useState(false)
  const [stale, setStale] = useState<number | null>(null)

  useEffect(() => {
    const onEnter = (): void => void enterSandbox()
    window.addEventListener('vigil:sandbox-enter', onEnter)
    return () => window.removeEventListener('vigil:sandbox-enter', onEnter)
  }, [])

  useEffect(() => {
    if (started) return
    started = true
    if (!SANDBOX) {
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
    setTimeout(() => toast("You're in the sandbox: a practice Vigil. Your own notes are safe; Back to my notes is up top.", undefined, 'info'), 900)
    void sandboxState().then(async (state) => {
      if (state.seeded) {
        const days = state.seededOn ? Math.round((Date.now() - new Date(`${state.seededOn}T12:00`).getTime()) / 86_400_000) : 0
        if (days > 7) setStale(days)
        return
      }
      setSeeding(true)
      const carry = (await window.api.vigil('sandbox:carry')) as Carry | null
      for (const [key, value] of Object.entries(carry?.local ?? {})) {
        try {
          localStorage.setItem(key, value)
        } catch {
          // Worn for now, not remembered.
        }
      }
      if (carry?.local?.theme) applyTheme(currentTheme(), false)
      // Its own pictures, whatever yours are: four public-domain landscapes for
      // Scenery and Vigil's own grain for covers; your celebrations come along.
      const settings = { progressBars: 'saber', ...(carry?.settings ?? {}), scenery: true, sceneryFolders: [await sandboxScenery()], coversFolder: '' }
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
                <button type="button" onClick={() => void resetSandbox()} className="font-semibold hover:underline">Freshen</button>
                <button type="button" aria-label="Not now" onClick={() => setStale(null)} className="text-muted-foreground hover:text-foreground">Not now</button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
