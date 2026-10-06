import { useEffect, useRef, useState } from 'react'
import { RowMenu } from './vigil/row-menu'
import { alive } from '@/components/ui/alive-icon'
import ExternalLinkIcon from '@/components/ui/external-link-icon'
import EyeOffIcon from '@/components/ui/eye-off-icon'
import PenIcon from '@/components/ui/pen-icon'
import LikeIcon from '@/components/ui/like-icon'
import XIcon from '@/components/ui/x-icon'
import { AnimatePresence, motion } from 'motion/react'
import { EASE, shift } from '@/lib/motion'

import { shown } from './rot-cards'
import { chime } from '@/lib/sound'
import { vigil } from '@/lib/vigil'
import { Rolling, refuse, toast, Typed } from './vigil/ui'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { QuestionBack } from './vigil/questions-view'
import { KindBack, backLine, returningHint, type Returning } from './vigil/kind-back'
import { GlossLine, useGlossKey } from './vigil/gloss-line'
import { openPass } from './vigil/pass'
import { Postcarded, usePostcard } from './vigil/memory-postcard'
import { AliveIcon } from '@/components/ui/alive-icon'
import TrashIcon from '@/components/ui/trash-icon'
import { keyFor } from '@/lib/keys'

// itshover drawings in lucide's place, moving when their control is pointed at.
const ArrowUpRight = alive(ExternalLinkIcon)
const EyeOff = alive(EyeOffIcon)
const Pencil = alive(PenIcon)
const ThumbsDown = alive(LikeIcon, '-scale-y-100')
const ThumbsUp = alive(LikeIcon)
const Trash2 = alive(TrashIcon)
const X = alive(XIcon)

// A memory is a hint that says what it is: this day last year, one source's things.
type Hint = NonNullable<Awaited<ReturnType<typeof window.api.hints.next>>> & { memory?: string }
type Nudge = NonNullable<Awaited<ReturnType<typeof vigil.nudge>>>


/**
 * A hint: one nugget you did not ask for, like a tip on a game's loading
 * screen. Up and down change how often it comes back; doing nothing is the
 * normal case and says nothing. It never grades and never schedules.
 */
export function HintCard({ onOpen }: { onOpen: (type: string, id: string) => void }): React.JSX.Element | null {
  const [hint, setHint] = useState<Hint | null>(null)
  const postcard = usePostcard(!!hint?.memory)
  // Two bells once, when a hint arrives: not on every animation the card
  // runs afterwards, which rang them again as the page moved around it.
  useEffect(() => void (hint && chime(hint.memory ? 'memory' : 'hint')), [hint?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  // A nudge: the weekly walk through the inbox, or an exam falling behind.
  const [nudge, setNudge] = useState<Nudge | null>(null)
  useEffect(() => void (nudge && chime('hint')), [nudge?.kind]) // eslint-disable-line react-hooks/exhaustive-deps
  // A question you are holding, come back: "Still open: …".
  const [back, setBack] = useState<Awaited<ReturnType<typeof vigil.questionBack>>>(null)
  useEffect(() => void (back && chime('memory')), [back?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  // A decision on its look-again day, an experiment past its run-until: you set the day, so it skips the dice.
  const [due, setDue] = useState<Returning | null>(null)
  useEffect(() => void (due && chime('memory')), [due?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const shownAt = useRef(0)
  // What the card says, set a beat after it arrives so the words roll in
  // from nothing rather than appearing already there.
  const [said, setSaid] = useState('')
  useEffect(() => {
    setSaid('')
    if (!hint) return
    const timer = setTimeout(() => setSaid(shown(hint.title, hint.body)), 120)
    return () => clearTimeout(timer)
  }, [hint?.id, hint?.title]) // eslint-disable-line react-hooks/exhaustive-deps
  // Fixing it where it stands: the words in a field, Enter keeps them.
  const [fixing, setFixing] = useState<string | null>(null)
  // A long hint shows three lines, never more of the box than that; a click
  // on it opens the rest, and another closes it. The pencil edits.
  const [whole, setWhole] = useState(false)
  useEffect(() => setWhole(false), [hint?.id])
  useEffect(() => setFixing(null), [hint?.id])
  const open = (): void => {
    if (!hint) return
    onOpen(hint.id === hint.captureId ? 'capture' : ((hint as { tier?: string }).tier ?? 'nugget'), hint.id)
    setHint(null)
  }
  // One plain paragraph can be fixed in place; anything richer opens whole,
  // so a list or a picture is never flattened into a line.
  const plain = (body: unknown): boolean => {
    const doc = body as { content?: { type?: string; content?: { type?: string }[] }[] } | null
    if (typeof body === 'string') return !body.includes('\n')
    return !!doc && (doc.content?.length ?? 0) <= 1 && (doc.content?.[0]?.type ?? 'paragraph') === 'paragraph' && (doc.content?.[0]?.content ?? []).every((one) => one.type === 'text')
  }
  const fix = (): void => {
    if (!hint) return
    if (!plain(hint.body)) return open()
    setFixing(shown(hint.title, hint.body))
  }
  const keep = (text: string): void => {
    if (!hint) return
    const words = text.trim()
    setFixing(null)
    if (!words || words === shown(hint.title, hint.body)) return
    const body = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: words }] }] }
    setHint({ ...hint, title: words, body })
    chime('noted')
    void (hint.id === hint.captureId
      ? window.api.captures.save(hint.id, { body })
      : vigil.saveItem(hint.id, { body, title: words })
    ).then(() => toast('Fixed'))
  }

  // Most opens show nothing: the rate is a setting, a tenth by default.
  useEffect(
    () =>
      window.api.onShown(async () => {
        setAsking(false)
        setBack(null)
        setDue(null)
        // A nudge comes at most once a day, so it skips the dice; never in
        // quiet hours or safe mode, which the main process checks.
        const nudging = await vigil.nudge()
        setNudge(nudging)
        if (nudging) return setHint(null)
        const coming = await returningHint()
        setDue(coming)
        if (coming) return setHint(null)
        const { rate } = await vigil.hintRate()
        if (Math.random() < rate) {
          // Now and then, a question still held instead: low weight, at most
          // once a day, gated and switched off in Settings by the main process.
          const question = Math.random() < 1 / 4 ? await vigil.questionBack() : null
          if (question) return (setHint(null), setBack(question))
          // A third of the time, a memory, when there is one to give.
          const next: Hint | null = (Math.random() < 1 / 3 ? await vigil.memory() : null) ?? (await window.api.hints.next())
          shownAt.current = Date.now()
          setHint(next)
        } else setHint(null)
      }),
    []
  )
  // Dwell: how long it was on screen before the window went. Every hint
  // produces one, where a vote is rare, so it is the signal that says most.
  useEffect(() => {
    if (!hint) return
    const onHide = (): void => {
      if (document.visibilityState === 'hidden') void window.api.hints.dwell(hint.event, Date.now() - shownAt.current)
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [hint])

  // After an up-vote, the card asks once whether it should be tested: the
  // moment a hint stops you is the only moment you will act on it.
  const [asking, setAsking] = useState(false)
  const react = (reaction: 'up' | 'down'): void => {
    if (!hint) return
    void window.api.hints.react(hint.event, hint.id, reaction)
    if (reaction === 'up') {
      chime('promote')
      // Attention it earned is evidence: a nugget is asked for a question, an
      // old capture whether to keep it, both one line, right there.
      setAsking(true)
    } else {
      chime('away')
      setHint(null)
    }
  }
  // Ctrl-U and Ctrl-D from anywhere in the prompt, so a vote needs no mouse.
  useEffect(() => {
    if (!hint || asking) return
    const onKey = (event: KeyboardEvent): void => {
      if (!event.ctrlKey || !event.shiftKey) return
      // A memory is not kept from here, as its card offers no thumbs up.
      if (event.code === 'ArrowUp') {
        if (hint.memory) return
        react('up')
      } else if (event.code === 'ArrowDown') react('down')
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ⌘; from the box, ; from anywhere else: a gloss on the hint in front of you.
  useGlossKey(hint && !asking && fixing === null ? hint.id : null)

  // What a hint offers, as buttons and as its right-click menu alike.
  const actions: { icon: typeof X; tip: string; keys?: string; run: () => void }[] = !hint ? [] : [
                // Opened right here in the prompt: the capture in the box, a
                // nugget or article in its place.
                { icon: ArrowUpRight, tip: 'Open it', run: open },
                { icon: Pencil, tip: 'Fix its words', run: fix },
                // Said for what the hint is: a capture is kept, a nugget gets a question.
                { icon: ThumbsUp, tip: hint.id === hint.captureId ? 'Worth keeping: make it a nugget' : 'Worth knowing: test me on it in review', keys: '⌃⇧↑', run: () => react('up') },
                { icon: ThumbsDown, tip: 'Not this one: show it less often', keys: '⌃⇧↓', run: () => react('down') },
                { icon: X, tip: 'Not now', run: () => (chime('fold'), setHint(null)) },
                // Gone for good, but never destroyed: a capture goes to
                // Discarded and a nugget stops surfacing; both come back.
                // A bin only for the capture that goes to Discarded: a nugget
                // that stops surfacing is still kept, so it gets a closed eye.
                { icon: hint.id === hint.captureId ? Trash2 : EyeOff, tip: hint.id === hint.captureId ? 'Discard it' : 'Stop showing it', run: () => {
                  const id = hint.id
                  const capture = id === hint.captureId
                  chime('away')
                  setHint(null)
                  void (capture ? window.api.captures.save(id, { status: 'discarded' }) : vigil.saveItem(id, { suspended: true })).then(() =>
                    toast(capture ? 'Discarded: it is in Discarded if you want it back' : 'It will not come up again', () =>
                      void (capture ? window.api.captures.save(id, { status: 'open' }) : vigil.saveItem(id, { suspended: false }))))
                } }
]
  // A memory may be something already dealt with, so it is opened, fixed or
  // shown less, never kept or discarded from here.
  const offered = hint?.memory ? actions.filter(({ icon }) => icon !== ThumbsUp && icon !== Trash2 && icon !== EyeOff) : actions
  const go = (): void => {
    if (!nudge) return
    chime('open')
    // The passes open right here in the box, where the day is spent.
    if (nudge.view === 'tidy' || nudge.view === 'decide') openPass(nudge.view)
    else window.api.openInHome('view', nudge.view)
    setNudge(null)
  }
  return (
    <AnimatePresence>
      {back && !nudge && !hint && (
        <motion.div
          key={`back-${back.id}`}
          initial={{ opacity: 0, transform: shift('translateY(-6px) scale(0.98)') }}
          animate={{ opacity: 1, transform: shift('translateY(0px) scale(1)') }}
          exit={{ opacity: 0, height: 0, marginBottom: 0, transition: { duration: 0.16, ease: EASE } }}
          transition={{ duration: 0.24, ease: EASE }}
          // Grey, not the brand tint: held, never owed.
          className="mt-2 mb-3 overflow-hidden rounded-lg border bg-accent/40 px-3 py-2.5 text-sm"
        >
          <QuestionBack back={back} onOpen={onOpen} onDone={() => setBack(null)} />
        </motion.div>
      )}
      {due && !nudge && !hint && (
        <motion.div
          key={`due-${due.id}`}
          initial={{ opacity: 0, transform: shift('translateY(-6px) scale(0.98)') }}
          animate={{ opacity: 1, transform: shift('translateY(0px) scale(1)') }}
          exit={{ opacity: 0, height: 0, marginBottom: 0, transition: { duration: 0.16, ease: EASE } }}
          transition={{ duration: 0.24, ease: EASE }}
          className="mt-2 mb-3 overflow-hidden rounded-lg border bg-accent/40 px-3 py-2.5 text-sm"
        >
          <p className="text-xs text-muted-foreground">{backLine(due)}</p>
          <button type="button" onClick={() => (chime('open'), onOpen(due.type, due.id), setDue(null))} className="mb-1.5 block text-left text-sm text-foreground hover:underline">
            <Typed text={due.title} step={28} delay={120} />
          </button>
          <KindBack one={due} onOpen={onOpen} onDone={() => setDue(null)} />
        </motion.div>
      )}
      {nudge && !hint && (
        <motion.div
          key={nudge.kind}
          initial={{ opacity: 0, transform: shift('translateY(-6px) scale(0.98)') }}
          animate={{ opacity: 1, transform: shift('translateY(0px) scale(1)') }}
          exit={{ opacity: 0, height: 0, marginBottom: 0, transition: { duration: 0.16, ease: EASE } }}
          transition={{ duration: 0.24, ease: EASE }}
          className="mt-2 mb-3 overflow-hidden rounded-lg border border-[color-mix(in_srgb,var(--tt-brand-color-400)_22%,transparent)] bg-[color-mix(in_srgb,var(--tt-brand-color-400)_10%,transparent)] px-3 py-2.5 text-sm"
        >
          <Typed text={nudge.text} step={28} delay={120} />
          <div className="mt-2 flex items-center gap-1 text-muted-foreground">
            <span className="mr-auto text-xs">{nudge.label}</span>
            <Button variant="ghost" size="sm" onClick={go}>{nudge.kind === 'weekly' ? 'Decide now' : nudge.kind === 'tidy' ? 'Tidy now' : 'Review now'}</Button>
            <Button variant="ghost" size="sm" onClick={() => (chime('fold'), setNudge(null))}>Not now</Button>
          </div>
        </motion.div>
      )}
      {hint && (
        <motion.div
          key={hint.id}
          initial={{ opacity: 0, transform: shift('translateY(-6px) scale(0.98)') }}
          animate={{ opacity: 1, transform: shift('translateY(0px) scale(1)') }}
          exit={{ opacity: 0, height: 0, marginBottom: 0, transition: { duration: 0.16, ease: EASE } }}
          transition={{ duration: 0.24, ease: EASE }}
          className={postcard ? 'mt-2 mb-3 text-sm' : 'mt-2 mb-3 overflow-hidden rounded-lg border border-[color-mix(in_srgb,var(--tt-brand-color-400)_22%,transparent)] bg-[color-mix(in_srgb,var(--tt-brand-color-400)_10%,transparent)] px-3 py-2.5 text-sm'}
        >
          {/* A memory, with Postcards on, comes as a postcard: the same card inside. */}
          <Postcarded on={postcard} at={(hint as { at?: string }).at} seed={hint.id}>
          <RowMenu items={offered.map(({ tip, keys, run }) => ({ label: tip, keys, run, danger: tip === 'Discard it' }))}>
            {fixing !== null ? (
              // Grows with the words and sits where they sat, so a two-line hint
              // stays two lines and the card does not jump.
              <textarea
                autoFocus
                rows={1}
                value={fixing}
                onChange={(event) => setFixing(event.target.value)}
                onBlur={() => keep(fixing)}
                onKeyDown={(event) => {
                  event.stopPropagation()
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    keep(fixing)
                  }
                  // Closes the field only, never the window behind it.
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    setFixing(null)
                  }
                }}
                className="block w-full resize-none bg-transparent outline-none [field-sizing:content]"
              />
            ) : (
              <div
                className={`cursor-pointer whitespace-pre-line ${whole ? 'max-h-40 overflow-y-auto' : 'line-clamp-3'}`}
                onClick={() => (said.length > 160 ? setWhole(!whole) : fix())}
              >
                {/* The words roll in when it arrives, a hint being dealt; a
                    long one, which must wrap, simply appears, since rolling
                    text keeps to one line. */}
                {said.length <= 40 && !said.includes('\n') ? <Rolling by="word" text={said} /> : <Typed text={said} step={28} />}
              </div>
            )}
          </RowMenu>
          {/* A thought on it, the moment it stops you: no trip to its page. */}
          {fixing === null && !asking && <GlossLine id={hint.id} className="mt-1.5" keys="⌘;" />}
          {asking ? (
            <Input
              autoFocus
              placeholder={hint.id === hint.captureId ? 'Keep it? Say why in a line and press Enter' : 'Worth testing? Write the question and press Enter'}
              onBlur={() => setHint(null)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  return setHint(null)
                }
                if (event.key !== 'Enter' || !event.currentTarget.value.trim()) return
                const line = event.currentTarget.value.trim()
                void (hint.id === hint.captureId
                  ? vigil.promote(hint.id, line).then((result) => (result === 'needs-source' ? refuse('A quote needs to say who said it first') : result === 'not-open' ? refuse('That capture already took an exit, so it is not kept again') : toast('Kept as a nugget, with your line beside it')))
                  : vigil.saveItem(hint.id, { prompt: line }).then(() => toast('Now tested: it will come up in review'))
                ).then(() => setHint(null))
              }}
              className="mt-2 w-full h-8"
            />
          ) : (
            <div className="mt-2 flex items-center gap-1 text-muted-foreground [&_svg]:size-3.5">
              <span className={`mr-auto text-xs ${hint.memory ? 'text-[var(--tt-brand-color-400)]' : ''}`}>{hint.memory ?? (hint.id === hint.captureId ? `From your inbox · a ${hint.kind} with no exit yet` : `Kept · a ${hint.kind} nugget`)}</span>
              {/* Open, or let it go: a hint asks nothing else of you. Each
                  button says what it does, since the icons alone do not. */}
              {offered.map(({ icon: Icon, tip, keys, run }) => (
                <Tooltip key={tip}>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={tip} onClick={run}>
                      {Icon === Trash2 ? <AliveIcon icon={TrashIcon} size={14} /> : <Icon />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {tip}
                    {keys && keyFor(keys) && <kbd className="ml-2 font-sans text-key opacity-70">{keyFor(keys)}</kbd>}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          )}
          </Postcarded>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
