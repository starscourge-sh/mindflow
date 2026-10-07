import { useEffect, useRef } from 'react'
import { motion } from 'motion/react'
import { Check } from 'lucide-react'
import { chime } from '@/lib/sound'
import { EASE } from '@/lib/motion'
import { keyFor, useKeyChanges } from '@/lib/keys'
import { onboarding, useOnboarding } from '@/lib/onboarding'
import { useLive, vigil } from '@/lib/vigil'
import { useCaptures } from '@/components/capture-list'
import { MenuButton } from './collection-header'
import { stickOnDesktop } from './sticky-note'
import { Kbd, Rolling, toast } from './ui'

/**
 * Getting started: a shelf at the top of Home after the welcome, eight firsts
 * that tick themselves from what is really there (the main process reads the
 * data; tags are read here). Each row does its step, or takes you to where it
 * is done. All eight, and it celebrates once, then says Done and goes three
 * days later. Hidden from its ··· menu; back from Settings.
 */
type Step = { id: 'catch' | 'tag' | 'keep' | 'review' | 'task' | 'hold' | 'stick' | 'search'; label: string; keys?: string }
const STEPS: Step[] = [
  { id: 'catch', label: 'Catch a thought', keys: '⌘.' },
  { id: 'tag', label: 'Give something a #tag' },
  { id: 'keep', label: 'Keep one from the Inbox', keys: 'P' },
  { id: 'review', label: 'Review a card' },
  { id: 'task', label: 'Add a task' },
  { id: 'hold', label: 'Hold a question, or set a goal' },
  { id: 'stick', label: 'Stick a note to your desktop' },
  { id: 'search', label: 'Find anything', keys: '⌘K' }
]
const LINGER = 3 * 86400000

export function GettingStarted({ onOpen, onView }: { onOpen: (type: string, id: string) => void; onView: (id: string, focus?: string) => void }): React.JSX.Element | null {
  useKeyChanges()
  const state = useOnboarding()
  const tags = useLive(vigil.tags, [] as Awaited<ReturnType<typeof vigil.tags>>)
  const captures = useCaptures()
  const done: Record<Step['id'], boolean> = { ...(state?.steps ?? { catch: false, keep: false, review: false, task: false, hold: false, stick: false, search: false }), tag: tags.length > 0 }
  const count = STEPS.filter((step) => done[step.id]).length
  const all = count === STEPS.length

  // A step newly done while the shelf is on screen: its sound.
  const was = useRef<Record<string, boolean> | null>(null)
  useEffect(() => {
    if (!state) return
    const before = was.current
    was.current = done
    if (before && STEPS.some((step) => done[step.id] && !before[step.id])) chime('mark')
  })
  // Every step: celebrated once, on the milestones' own terms, and written down.
  const ready = !!state && !state.sandbox && !!state.welcomed
  const name = useRef('')
  name.current = state?.name ?? ''
  useEffect(() => {
    if (!ready || !all) return
    // Held back (another card just played, or quiet hours): asked again a few times while the shelf is here.
    let tries = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const ask = (): void => void onboarding.finish(name.current).then((moment) => {
      if (moment === false) return
      if (!moment) return void (++tries < 8 && (timer = setTimeout(ask, 15000)))
      const keys = keyFor('⌘.') || '⌘.'
      const said = moment as { line?: string }
      window.dispatchEvent(new CustomEvent('vigil:celebrate', { detail: { ...said, line: said.line?.replace('⌘.', keys) } }))
    })
    ask()
    return () => clearTimeout(timer)
  }, [ready, all])

  if (!state || state.sandbox || !state.welcomed || state.hidden) return null
  if (state.doneAt && Date.now() - new Date(state.doneAt).getTime() > LINGER) return null

  const newest = captures.find((one) => one.status !== 'discarded')
  const run = (step: Step): void => {
    chime('tap')
    if (step.id === 'catch') return window.api.showPrompt()
    if (step.id === 'tag') return newest ? (onOpen('capture', newest.id), toast('Type # and a word anywhere in it, like #ideas', undefined, 'info')) : window.api.showPrompt()
    if (step.id === 'keep') return (onView('inbox'), toast('Pick one and press P to keep it', undefined, 'info'))
    if (step.id === 'review') return onView('review')
    if (step.id === 'task') return onView('today')
    if (step.id === 'hold') return onView('questions')
    if (step.id === 'stick') return newest ? stickOnDesktop('capture', newest.id) : window.api.showPrompt()
    // ⌘K, pressed for you: the palette opens as it would.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', metaKey: true, bubbles: true }))
  }
  const hide = (): void => {
    chime('fold')
    void onboarding.set({ hidden: true })
    toast('Getting started is hidden. Settings, under Help, brings it back.', () => void onboarding.set({ hidden: false }), 'info')
  }

  return (
    <section data-tour="started" aria-label="Getting started" className="relative mx-5 flex flex-col gap-3 rounded-2xl border bg-[color-mix(in_oklab,var(--foreground)_2.5%,transparent)] px-4 pt-3.5 pb-3 @[44rem]/page:mx-8">
      <header className="flex items-center gap-3">
        <h2 className="font-heading text-heading font-semibold tracking-[-0.01em] text-foreground">{all ? 'Done.' : 'Getting started'}</h2>
        <span className="text-control text-muted-foreground tabular-nums"><Rolling text={count} /> of {STEPS.length}</span>
        {/* The bar: a thin line of the accent, filling as the steps tick. */}
        <span aria-hidden className="relative h-[3px] min-w-12 flex-1 overflow-hidden rounded-full bg-foreground/[0.08]">
          <motion.span className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-primary"
            initial={false} animate={{ transform: `scaleX(${count / STEPS.length})` }} transition={{ duration: 0.5, ease: EASE }} />
        </span>
        {all
          ? <button type="button" onClick={hide} className="rounded-full px-2.5 py-1 text-control font-medium text-foreground transition-colors hover:bg-foreground/[0.07]">Hide this</button>
          : <MenuButton small items={[{ label: 'Hide Getting started', run: hide }]} />}
      </header>
      {all ? (
        <p className="text-control text-muted-foreground">Every first is behind you. Press <span className="inline-flex translate-y-[-1px] gap-0.5 align-middle">{(keyFor('⌘.') || '⌘.').match(/[⌃⌥⇧⌘]|[^⌃⌥⇧⌘]+/g)?.map((key, i) => <Kbd key={i}>{key}</Kbd>)}</span> whenever something crosses your mind.</p>
      ) : (
        <ol className="grid gap-x-4 gap-y-0.5 @[40rem]/page:grid-cols-2">
          {STEPS.map((step) => {
            const ticked = done[step.id]
            return (
              <li key={step.id}>
                <button type="button" onClick={() => run(step)} disabled={ticked}
                  className="group flex h-9 w-full items-center gap-3 rounded-lg px-2 text-left text-control transition-colors enabled:hover:bg-foreground/[0.05] disabled:cursor-default">
                  <span className={`relative flex size-[18px] shrink-0 items-center justify-center rounded-full border transition-colors duration-200 ${ticked ? 'border-primary bg-primary text-primary-foreground' : 'border-foreground/25'}`}>
                    {ticked && (
                      <motion.span initial={{ opacity: 0, transform: 'scale(0.6)' }} animate={{ opacity: 1, transform: 'scale(1)' }} transition={{ type: 'spring', duration: 0.32, bounce: 0.4 }}>
                        <Check className="size-3" strokeWidth={3} />
                      </motion.span>
                    )}
                  </span>
                  <span className={`min-w-0 flex-1 truncate ${ticked ? 'text-muted-foreground line-through decoration-foreground/25' : 'text-foreground'}`}>{step.label}</span>
                  {step.keys && keyFor(step.keys) && !ticked && <span className="flex gap-0.5">{(keyFor(step.keys).match(/[⌃⌥⇧⌘]|[^⌃⌥⇧⌘]+/g) ?? []).map((key, i) => <Kbd key={i}>{key}</Kbd>)}</span>}
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
