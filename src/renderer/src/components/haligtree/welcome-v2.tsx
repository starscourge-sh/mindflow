import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { Check } from 'lucide-react'
import { spring, still as motionOff } from '@/lib/motion'
import { chime } from '@/lib/sound'
import { onboarding, welcomeAsked } from '@/lib/onboarding'
import { SANDBOX, sandboxState, type Carry } from '@/lib/sandbox'
import { saidBy } from '@/lib/welcome-box'
import { haligtree } from '@/lib/haligtree'
import { keyFor, useKeyChanges } from '@/lib/keys'
import { when } from '@/lib/clock'
import { shownEditor } from '@/extensions/note-link'
import { readTask } from '../../../../main/task-words'
import { fittedTitle } from '../../../../main/clip'
import { APP_NAME } from '../../../../main/name'
import { ENTER, MOVE, Rise, seeded, typed, typeOf, useScript, type Beat } from './welcome-reel'
import { Action, Backdrop, BODY, dateline, DOCKED, FIGURES, HEADLINE_XL, InlineKeys, NextArrow, Primary, QUIET_BUTTON } from './welcome'
import { FIELD, useTypedHint } from './welcome-you'
import { toast } from './ui'

/**
 * The second welcome, beside the first (welcome.tsx) so both can be tried:
 * Settings › Welcome picks which one plays, and ⌘K "Show the welcome
 * (version 1 / version 2)" plays either in the sandbox. Its one idea: you
 * come here to write, so just start.
 *
 *   1 Start: the commonplace book in one line, then the field for your first
 *     thought, the caret already in it
 *   2 A quote: a line someone said, kept with who said it
 *   3 A task: something to do, put on your list for the day it names
 *   4 Write it out: your first thought is a page now, and ↵ opens it with
 *     the caret at its end
 *
 * Three kinds at most, each taught by typing one, never by reading a list.
 * Nothing is asked first. The same motion rules as the first welcome: words
 * rise into place, hint lines type themselves in, the one thing to do now
 * shines, and Motion off or Reduce motion shows every step settled.
 */

type Step = 1 | 2 | 3 | 4
const STEPS = ['Start', 'A quote', 'A task', 'Write it out']
type Kept = { kind: 'note' | 'quote' | 'todo'; id: string; text: string; lead: string; why: string; /** A task that was on your list already, joined rather than made. */ existed?: boolean }

/** The commonplace-book line, as the first welcome says it (welcome.tsx, BOOK), cut to its first half: the second half is what the steps do. */
const BOOK = `${APP_NAME} is a commonplace book, the kind writers have kept for centuries.`
const HEAD = 'Come here to write. So just start.'
const UNDER = 'Catch a thought, write it out, and it finds you again.'

/** Each step's words: its title, the line under it, what to do now (it shines), and the hint lines its field types in. */
const SAID: Record<1 | 2 | 3, { title: string; line: string; now: string; hints: string[]; rest: string; label: string }> = {
  1: {
    title: HEAD, line: UNDER, now: 'Your turn: what is on your mind?', label: 'Your first thought',
    hints: ['Why do old movies feel more real?', 'The bakery on Elm Street smells of cardamom at 7am.', 'Maybe the essay should start with its ending.'],
    rest: 'A thought, a question, anything'
  },
  2: {
    title: 'Now a line worth keeping.', line: 'Someone’s words in quote marks, then a dash and who said them.', now: 'Your turn: a line someone said', label: 'A line someone said',
    hints: ['“Not all those who wander are lost.” - Tolkien, The Fellowship of the Ring', '“Do or do not. There is no try.” - Yoda', '“The obstacle is the way.” - Marcus Aurelius, Meditations'],
    rest: '“Their words” - who said them'
  },
  3: {
    title: 'And something to do.', line: `Say when, and ${APP_NAME} puts it on your list for that day.`, now: 'Your turn: something to do, and when', label: 'Something to do',
    hints: ['Rewatch Casablanca on Saturday 8pm', 'Call Mum tomorrow 6pm', 'Return the library books by Friday'],
    rest: 'Something to do, and when'
  }
}

const paragraph = (text: string): { type: 'paragraph'; content?: { type: 'text'; text: string }[] } => (text ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'paragraph' })

/** A quote as typed: its words without the "- who, where" after the closing mark, and who and where. */
function quoteOf(line: string): { words: string; who: string; where: string } {
  const { who, where } = saidBy(line)
  const words = who ? line.replace(/\s*[-–—]\s*[^-–—”"']+$/, '').trim() : line.trim()
  // Written without quote marks: they are put round it, as a quote wears them.
  return { words: /^["“]/.test(words) ? words : `“${words}”`, who, where }
}

export function WelcomeTwo(): React.JSX.Element | null {
  const [at, setAt] = useState<Step | 0>(0)
  const [kept, setKept] = useState<Partial<Record<1 | 2 | 3, Kept>>>({})
  const [held, setHeld] = useState(false)
  // Opened again from a menu, or tried in the sandbox: the headline is simply there.
  const [replay, setReplay] = useState(false)
  // Which steps were seen: going back to one shows it settled.
  const [seen, setSeen] = useState<Set<number>>(new Set())
  const dialog = useRef<HTMLDivElement>(null)
  const quiet = motionOff()

  const open = (again: boolean): void => {
    setKept({})
    setSeen(new Set())
    setReplay(again)
    setAt(1)
    chime('read')
  }

  useEffect(() => {
    void onboarding.state().then((now) => now.firstRun && welcomeAsked(null, now) === 2 && open(false))
    const again = (event: Event): void => void onboarding.state().then((now) => welcomeAsked(event, now) === 2 && open(true))
    window.addEventListener('haligtree:welcome', again)
    window.addEventListener('haligtree:tour', again)
    return () => (window.removeEventListener('haligtree:welcome', again), window.removeEventListener('haligtree:tour', again))
  }, [])
  useCarriedWelcome()

  // While it runs, the app keeps quiet under it, as it does for the first welcome.
  useEffect(() => {
    if (at === 0) return
    void onboarding.set({ welcoming: true })
    document.documentElement.setAttribute('data-welcoming', '')
    return () => {
      void onboarding.set({ welcoming: false })
      document.documentElement.removeAttribute('data-welcoming')
    }
  }, [at === 0]) // eslint-disable-line react-hooks/exhaustive-deps

  // A key held back from the app while this runs (welcome.tsx, holdKeys), said for a moment.
  useEffect(() => {
    if (at === 0) return
    const say = (): void => (setHeld(true), void setTimeout(() => setHeld(false), 2600))
    const offHeld = window.api.onHeld(say)
    window.addEventListener('haligtree:held', say)
    return () => (offHeld(), window.removeEventListener('haligtree:held', say))
  }, [at === 0]) // eslint-disable-line react-hooks/exhaustive-deps

  const go = (to: Step): void => {
    setSeen((now) => new Set(now).add(at))
    chime('page')
    setAt(to)
  }
  const back = (): void => {
    if (at <= 1) return void chime('nope')
    go((at - 1) as Step)
  }
  const done = (): void => void onboarding.set({ welcomed: new Date().toISOString(), newsSeen: true, welcoming: false })

  /** Out to Home, for "Skip the welcome". Anything kept stays kept. */
  const skip = (): void => {
    done()
    setAt(0)
    chime('away')
    window.api.openInHome('view', 'home')
    toast(`The welcome is in the ${APP_NAME} menu and ⌘K whenever you want it again.`, undefined, 'info')
  }

  /**
   * The end: your first thought becomes a page in Pages, named by it (the
   * whole thought, when it is short enough to be a name; otherwise its start,
   * with the whole thought in the page), and the page opens with the caret on
   * the line under it. The note it was caught as goes, so it is one thing.
   */
  const finish = async (): Promise<void> => {
    const first = kept[1]
    done()
    setAt(0)
    chime('decided')
    if (!first) return void window.api.openInHome('view', 'home')
    let id: string
    try {
      id = await haligtree.newArticle()
      const short = fittedTitle(first.text)
      await haligtree.saveItem(id, { title: short ?? first.text, body: { type: 'doc', content: short ? [paragraph(first.text), paragraph('')] : [paragraph('')] } })
      await haligtree.unlift('capture', first.id).catch(() => false)
    } catch {
      // The thought stays a note in the Inbox: opened there instead.
      return void window.api.openInHome('capture', first.id)
    }
    window.api.openInHome('article', id)
    // The page's editor mounts a few frames after the page opens.
    let tries = 0
    const land = (): void => {
      const editor = shownEditor(`item-${id}`)
      if (editor && !editor.isDestroyed) return void editor.commands.focus('end')
      if (tries++ < 120) requestAnimationFrame(land)
    }
    requestAnimationFrame(land)
  }

  /** A step's words kept as what that step teaches: then on to the next. Kept again unchanged, it simply goes on. */
  const keep = async (step: 1 | 2 | 3, line: string): Promise<boolean> => {
    const text = line.trim()
    if (!text) return (chime('nope'), false)
    const was = kept[step]
    if (was && was.text === text) return (go((step + 1) as Step), true)
    try {
      let made: Kept
      if (step === 1) {
        const body = { type: 'doc', content: [paragraph(text)] }
        const id = was ? (await window.api.captures.save(was.id, { body }), was.id) : await window.api.captures.create({ kind: 'note', body })
        made = { kind: 'note', id, text, lead: 'Caught.', why: 'It becomes your first page at the end.' }
        chime('send')
      } else if (step === 2) {
        const { words, who, where } = quoteOf(text)
        const fields = { kind: 'quote' as const, body: { type: 'doc', content: [paragraph(words)] }, attribution: who, medium: where || undefined }
        const id = was ? (await window.api.captures.save(was.id, fields), was.id) : await window.api.captures.create(fields)
        made = { kind: 'quote', id, text, lead: 'Kept with its source.', why: who ? `${APP_NAME} read who said it${where ? ', and where' : ''}.` : 'Add who said it any time.' }
        chime('promote')
      } else {
        // A task made again is a new one: the one made before goes, so one line is one task.
        if (was) await haligtree.unmakeTask(was.id, !!was.existed, [], []).catch(() => undefined)
        const task = await haligtree.addTask(text)
        const read = readTask(text)
        made = { kind: 'todo', id: task.id, existed: task.existed, text, lead: 'Dated for you.', why: read.due ? `On your list for ${when(read.due, read.allDay)}.` : 'On your list of tasks.' }
        if (!read.due) made.lead = 'On your list.'
        chime('tag')
      }
      setKept((now) => ({ ...now, [step]: made }))
      setTimeout(() => go((step + 1) as Step), quiet ? 0 : 700)
      return true
    } catch {
      chime('nope')
      toast('That could not be kept just now. Try again, or skip this one.', undefined, 'warning')
      return false
    }
  }

  // The keys while it is up: ↵ does what the button says, ← goes back from outside a field; ⌘[ and ⌘] too.
  useEffect(() => {
    if (at === 0) return
    const onKey = (event: KeyboardEvent): void => {
      if (!event.isTrusted) return
      const target = event.target as HTMLElement | null
      if (event.key === 'Tab') {
        const all = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input') ?? [])].filter((one) => one.offsetParent)
        if (!all.length) return
        const i = all.indexOf(document.activeElement as HTMLElement)
        if (i < 0 || (event.shiftKey ? i === 0 : i === all.length - 1)) (event.preventDefault(), all[event.shiftKey ? all.length - 1 : 0].focus())
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (target?.closest?.('input, button')) return
      if (event.key === 'Enter' && at === 4) void finish()
      else if (event.key === 'ArrowLeft') back()
      else return
      event.preventDefault()
      event.stopPropagation()
    }
    const onStep = (event: Event): void => {
      if ((event as CustomEvent<number>).detail < 0) back()
      else if (at === 4) void finish()
      else if (kept[at as 1 | 2 | 3]) go((at + 1) as Step)
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('haligtree:welcome-step', onStep)
    return () => (window.removeEventListener('keydown', onKey, true), window.removeEventListener('haligtree:welcome-step', onStep))
  })

  if (at === 0) return null
  const play = !quiet && !seen.has(at)
  const field = at < 4 ? (at as 1 | 2 | 3) : null
  return (
    <MotionConfig reducedMotion={quiet ? 'always' : 'never'}>
      <div ref={dialog} tabIndex={-1} role="dialog" aria-modal aria-label={`Welcome to ${APP_NAME}`} data-welcome-version="2" onKeyDown={(event) => event.stopPropagation()}
        className="mf-welcome fixed inset-0 z-[70] flex flex-col overflow-hidden bg-background text-foreground outline-none [container-type:inline-size]">
        <Backdrop plain={at === 4} family={at === 4 ? 'ruled' : 'none'} />
        <div data-drag-strip="" className="relative h-11 shrink-0" style={{ WebkitAppRegion: 'drag' } as CSSProperties} />
        <div className="relative mx-auto flex min-h-0 w-full max-w-[84rem] flex-1 flex-col">
          <main className="relative min-h-0 flex-1">
            <AnimatePresence initial={false}>
              <motion.section key={at} data-step={at}
                className="mf-more absolute inset-0 flex flex-col justify-center overflow-x-hidden overflow-y-auto overscroll-contain px-[clamp(1.5rem,5vw,4rem)] pt-2 pb-4"
                initial={play ? { opacity: 0, scale: 0.97 } : false} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, ease: ENTER }}
                exit={{ opacity: 0, scale: 1.02, transition: { duration: 0.2, ease: MOVE } }}>
                {field ? (
                  <Ask step={field} play={play} first={field === 1 && !replay && play} kept={kept} onKeep={(line) => keep(field, line)} />
                ) : (
                  <End kept={kept} play={play} />
                )}
              </motion.section>
            </AnimatePresence>
          </main>
          <footer className="relative flex h-[clamp(4rem,9vmin,5.5rem)] shrink-0 items-center gap-3 px-[clamp(1.5rem,5vw,4rem)]">
            <div className="mr-auto flex min-w-0 items-center gap-[clamp(0.5rem,2vw,1.5rem)]">
              <Marks at={at} seen={seen} onBack={back} />
              {at === 4 ? null : at === 1 ? (
                <button type="button" data-skip onClick={skip} className={`${QUIET_BUTTON} whitespace-nowrap`}>Skip the welcome</button>
              ) : (
                <button type="button" data-skip onClick={() => go((at + 1) as Step)} className={`${QUIET_BUTTON} whitespace-nowrap`}>Skip this one</button>
              )}
            </div>
            <AnimatePresence>
              {held && (
                <motion.p role="status" className="absolute left-1/2 -translate-x-1/2 text-[0.875rem] whitespace-nowrap text-(--mf-wl-body)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: spring.fast.exit }}>
                  That waits until the welcome is done.
                </motion.p>
              )}
            </AnimatePresence>
            <NextArrow on={at === 4} page={at} quiet={quiet} />
            {at === 4
              ? <Primary onClick={() => void finish()}>{kept[1] ? 'Open my page' : 'Start'}</Primary>
              : <Primary onClick={() => document.querySelector<HTMLInputElement>('[data-welcome-field]')?.form?.requestSubmit()}>Keep it</Primary>}
          </footer>
        </div>
      </div>
    </MotionConfig>
  )
}

/** Where you are: Back, a short mark a step, the one you are on drawn longer, and its name. */
function Marks({ at, seen, onBack }: { at: number; seen: Set<number>; onBack: () => void }): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 text-[clamp(0.8125rem,1.8vmin,1rem)] text-(--mf-wl-quiet)">
      <span className="sr-only">{`Step ${at} of ${STEPS.length}: ${STEPS[at - 1]}`}</span>
      <button type="button" onClick={onBack} tabIndex={at > 1 ? 0 : -1} aria-hidden={at > 1 ? undefined : true}
        className={`-ml-3 flex h-[clamp(2rem,4.2vmin,2.5rem)] items-center rounded-[0.6rem] px-3 transition-colors hover:bg-foreground/[0.06] hover:text-foreground active:scale-[0.97] ${at > 1 ? '' : 'invisible'}`}>
        Back
      </button>
      <span aria-hidden className="flex items-center gap-1">
        {STEPS.map((_, i) => (
          <motion.span key={i} className="h-[3px] w-5 origin-left rounded-full bg-foreground" initial={false}
            animate={{ opacity: i + 1 === at ? 0.85 : seen.has(i + 1) ? 0.4 : 0.14, scaleX: i + 1 === at ? 1 : 0.55 }} transition={spring.moderate} />
        ))}
      </span>
      <span aria-hidden className="relative inline-flex h-[1.3em] min-w-[8rem] overflow-hidden text-foreground [@container(max-width:960px)]:hidden">{STEPS[at - 1]}</span>
    </div>
  )
}

/** The first line, typed in as a person would, the first time only; then the line under it. */
function headBeats(): Beat<{ typed: number }>[] {
  const run = typed<{ typed: number }>(HEAD, 300, (sofar) => ({ typed: sofar.length }), seeded(41), 0.9, 1600)
  return [{ at: 0, to: {} }, ...run.beats, { at: run.end + 200, to: {} }]
}

/**
 * One step: its words, then the field, the caret in it and a hint line
 * typing itself in, and what was kept so far beside it. ↵ keeps what you
 * wrote as this step's kind.
 */
function Ask({ step, play, first, kept, onKeep }: { step: 1 | 2 | 3; play: boolean; /** The very first screen of a first run: the headline types in. */ first: boolean; kept: Partial<Record<1 | 2 | 3, Kept>>; onKeep: (line: string) => Promise<boolean> }): React.JSX.Element {
  const said = SAID[step]
  const [text, setText] = useState(kept[step]?.text ?? '')
  const [busy, setBusy] = useState(false)
  const hint = useTypedHint(said.hints, !!text || !play, said.rest)
  const [beats] = useState(headBeats)
  const head = useScript<{ typed: number }>({ typed: first ? 0 : HEAD.length }, beats, first, 1)
  const typedTo = first && !head.done ? head.state.typed : HEAD.length
  const input = useRef<HTMLInputElement>(null)
  // The caret is in the field from the start: just start.
  useEffect(() => void setTimeout(() => input.current?.focus({ preventScroll: true }), play ? 260 : 0), []) // eslint-disable-line react-hooks/exhaustive-deps
  const list = ([1, 2, 3] as const).filter((one) => one !== step && kept[one]).map((one) => kept[one]!)
  return (
    <div className="flex w-full max-w-[60rem] flex-col gap-[clamp(0.75rem,2.4vh,1.5rem)]">
      {step === 1 && (
        <div className="flex flex-col gap-[clamp(0.5rem,1.6vh,1rem)]">
          <p className={FIGURES}>{dateline()}</p>
          <p data-book className="max-w-[46ch] text-[clamp(1.0625rem,min(1.9vw,2.7vh),1.3125rem)] font-semibold text-balance text-foreground">{BOOK}</p>
        </div>
      )}
      <h1 data-head data-typed={step === 1 ? typedTo : undefined} aria-label={said.title} className={step === 1 ? `${HEADLINE_XL} max-w-[16ch]` : DOCKED}>
        {step === 1 ? (
          <>
            <span aria-hidden>{HEAD.slice(0, typedTo)}</span>
            {first && !head.done && <span aria-hidden className="mf-caret mf-caret-typing" />}
            <span aria-hidden className="invisible">{HEAD.slice(typedTo)}</span>
          </>
        ) : <Rise text={said.title} still={!play} />}
      </h1>
      <motion.p className={`${BODY} max-w-[46ch]`} initial={play ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: 0.3, ease: ENTER, delay: 0.2 }}>{said.line}</motion.p>
      <form className="flex flex-col gap-3" onSubmit={(event) => {
        event.preventDefault()
        if (busy) return
        setBusy(true)
        void onKeep(text).finally(() => setBusy(false))
      }}>
        {kept[step]?.text === text.trim() && text.trim() ? <p data-kept-now className="flex items-center gap-2 font-heading text-[clamp(1.25rem,min(2.4vw,3.4vh),1.75rem)] leading-tight font-medium text-foreground"><Check className="size-5" strokeWidth={2.4} />{kept[step]!.lead}</p> : <Action>{said.now}</Action>}
        <input ref={input} data-welcome-field={step} aria-label={said.label} value={text} maxLength={400} placeholder={hint} autoComplete="off" spellCheck
          onChange={(event) => setText(event.target.value)}
          className={`${FIELD} h-14 w-full max-w-[44rem] px-4 font-heading text-[clamp(1.0625rem,min(1.9vw,2.7vh),1.375rem)] placeholder:text-(--mf-wl-quiet)`} />
        <p className="text-[0.9375rem] text-(--mf-wl-quiet)">Press <InlineKeys keys="↵" /> to keep it.</p>
      </form>
      {list.length > 0 && <KeptList list={list} play={play} />}
    </div>
  )
}

/** What was kept so far, each with its kind, its words, and what Haligtree did with it. */
function KeptList({ list, play }: { list: Kept[]; play: boolean }): React.JSX.Element {
  return (
    <ul data-kept className="flex max-w-[44rem] flex-col gap-2 pt-1">
      {list.map((one, i) => {
        const type = typeOf(one.kind)
        const Icon = type.icon
        return (
          <motion.li key={one.kind} data-kept-kind={one.kind} className="flex items-start gap-3 rounded-xl border border-foreground/10 bg-popover px-4 py-3 text-popover-foreground"
            initial={play ? { opacity: 0, y: 6 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: ENTER, delay: play ? 0.15 + i * 0.06 : 0 }}>
            <Icon className="mt-1 size-4 shrink-0" style={{ color: type.tint }} />
            <span className="min-w-0 flex-1 leading-snug">
              <span className="block truncate font-heading text-[1.0625rem] text-foreground">{one.text}</span>
              <span className="block text-[0.9375rem] text-(--mf-wl-body)"><strong className="font-semibold text-foreground">{one.lead}</strong> {one.why}</span>
            </span>
          </motion.li>
        )
      })}
    </ul>
  )
}

/** The last step: your first thought, already a page, and the way into it. */
function End({ kept, play }: { kept: Partial<Record<1 | 2 | 3, Kept>>; play: boolean }): React.JSX.Element {
  useKeyChanges()
  const first = kept[1]
  const rest = ([2, 3] as const).filter((one) => kept[one]).map((one) => kept[one]!)
  return (
    <div className="flex w-full max-w-[60rem] flex-col gap-[clamp(0.75rem,2.4vh,1.5rem)]">
      <h1 className={DOCKED}><Rise text={first ? 'Now write it out.' : 'Your commonplace book is ready.'} still={!play} /></h1>
      <motion.p className={`${BODY} max-w-[46ch]`} initial={play ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: 0.3, ease: ENTER, delay: 0.2 }}>
        {first ? 'Your first thought is a page now. Carry on from where it stops.' : `Write anything, and ${APP_NAME} keeps it.`}
      </motion.p>
      {first && (
        // The page, as it will open: the thought, and the caret on the line under it.
        <motion.div data-end-page className="w-full max-w-[44rem] rounded-xl border border-foreground/12 bg-popover px-6 py-5 text-popover-foreground shadow-(--mf-panel-shadow)"
          initial={play ? { opacity: 0, y: 10 } : false} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.moderate, delay: play ? 0.25 : 0 }}>
          <p className="font-heading text-[clamp(1.125rem,min(2.1vw,3vh),1.5rem)] leading-snug text-foreground">{first.text}</p>
          <p className="mt-2 h-[1.5em]"><span aria-hidden className="mf-caret mf-caret-typing" /></p>
        </motion.div>
      )}
      <Action>{first ? <>Press <InlineKeys keys="↵" /> to open your page</> : <>Press <InlineKeys keys="↵" /> to start</>}</Action>
      {rest.length > 0 && <p className="text-[0.9375rem] text-(--mf-wl-body)">{rest.map((one) => (one.kind === 'quote' ? 'The quote is in your Inbox' : 'the task is on your list')).join(', and ').replace(/^t/, 'T')}.</p>}
      <p className="text-[clamp(1rem,min(1.7vw,2.4vh),1.1875rem)] text-(--mf-wl-body)">From any app, <InlineKeys keys={keyFor('⌘.') || '⌘.'} /> catches the next one.</p>
    </div>
  )
}

/**
 * In the sandbox, a welcome asked for from your own book (lib/onboarding.ts,
 * tryWelcome) plays once on arrival, after the examples are set out. Each
 * ask plays once: a later start of the sandbox does not play it again.
 */
const PLAYED = 'welcome-carried-at'
function useCarriedWelcome(): void {
  useEffect(() => {
    if (!SANDBOX) return
    let gone = false
    void (async () => {
      const carry = await window.api.haligtree<Carry | null>('sandbox:carry').catch(() => null)
      const asked = carry?.welcome
      if (!asked) return
      try {
        if (localStorage.getItem(PLAYED) === String(asked.at)) return
        localStorage.setItem(PLAYED, String(asked.at))
      } catch {
        // Played anyway: once more is the worst of it.
      }
      // The examples are set out first, a minute at most, so the welcome never covers a half-made book.
      for (let waited = 0; !gone && waited < 60000; waited += 300) {
        if ((await sandboxState().catch(() => null))?.seeded) break
        await new Promise((wait) => setTimeout(wait, 300))
      }
      if (!gone) window.dispatchEvent(new CustomEvent('haligtree:welcome', { detail: { version: asked.version } }))
    })()
    return () => void (gone = true)
  }, [])
}
