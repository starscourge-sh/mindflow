import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { seeTheBin } from '@/lib/to-bin'
import { binFlightFrom } from '@/lib/fly-home'
import { RowMenu } from './haligtree/row-menu'
import { AnimatePresence, motion } from 'motion/react'
import { EASE, shift } from '@/lib/motion'

import { shown } from './rot-cards'
import { chime, tear } from '@/lib/sound'
import { haligtree } from '@/lib/haligtree'
import { Rolling, quietly, refuse, toast } from './haligtree/ui'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { Input } from '@/components/ui/input'
import { QuestionBack } from './haligtree/questions-view'
import { KindBack, backLine, returningHint, type Returning } from './haligtree/kind-back'
import { GlossLine, useGlossKey } from './haligtree/gloss-line'
import { Postcarded, usePostcard } from './haligtree/memory-postcard'
import { keyFor } from '@/lib/keys'
import { ArrowUpRight, EyeOff, Pencil, ThumbsDown, ThumbsUp, Trash2, X } from '@/components/ui/icons'
import { RotateCcw } from 'lucide-react'

// A memory is a hint that says what it is: this day last year, one source's things.
type Hint = NonNullable<Awaited<ReturnType<typeof window.api.hints.next>>> & { memory?: string }

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
  // Picked while the box is away (below), a card rings as the box shows instead (onShown).
  useEffect(() => void (hint && !document.hidden && chime(hint.memory ? 'memory' : 'hint')), [hint?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  // The daily tidy, a quiet goal and an exam falling behind are not here: quick capture only catches, and they are a line at the top of the Inbox (inbox-lines.tsx).
  // A question you are holding, come back: "Still open: …".
  const [back, setBack] = useState<Awaited<ReturnType<typeof haligtree.questionBack>>>(null)
  // A clue kept on the card above and undone: the card back with its words.
  const [backWords, setBackWords] = useState('')
  useEffect(() => void (!back && setBackWords('')), [back])
  useEffect(() => void (back && !document.hidden && chime('memory')), [back?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  // A decision on its look-again day, an experiment past its run-until: you set the day, so it skips the dice.
  const [due, setDue] = useState<Returning | null>(null)
  // A finding written on the card above and undone: the card back with its words.
  const [dueWords, setDueWords] = useState('')
  useEffect(() => void (!due && setDueWords('')), [due])
  useEffect(() => void (due && !document.hidden && chime('memory')), [due?.id]) // eslint-disable-line react-hooks/exhaustive-deps
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
    const was = hint
    const save = (next: { title: string; body: unknown }): Promise<unknown> => hint.id === hint.captureId
      ? window.api.captures.save(hint.id, { body: next.body as never })
      : haligtree.saveItem(hint.id, { body: next.body as never, title: next.title })
    setHint({ ...hint, title: words, body })
    chime('noted')
    // The new words are on the card in front of you: no toast, but ⌘Z puts the old ones back.
    void save({ title: words, body }).then(() => quietly(() => void save(was).then(() => setHint((now) => (now?.id === was.id ? was : now)))))
  }

  // Most opens show nothing: the rate is a setting, a tenth by default. The next open's card (or none) is picked and
  // drawn while the box is away, so it is there from the box's first frame or not at all: picked as the box showed,
  // last open's card was taken away in the first frames and the new one came in after, a card flashing away (the
  // user, 22 Nov). Brought up again without having been away (kept open behind another window), it keeps its card.
  // A note's own window (no room round its card) is shown without being put away first: it picks as it shows, as before.
  const now = useRef({ hint, back, due })
  now.current = { hint, back, due }
  useEffect(() => {
    const boxed = !!window.api.room.left
    // Picked for the box while it is away; shown again meanwhile, the pick is dropped and its card kept as it is.
    const still = (): boolean => !boxed || document.hidden
    const pick = async (): Promise<void> => {
      const coming = await returningHint()
      if (!still()) return
      setDue(coming)
      if (coming) return setHint(null)
      const { rate } = await haligtree.hintRate()
      if (Math.random() >= rate) return setHint(null)
      // Now and then, a question still held instead: low weight, at most
      // once a day, gated and switched off in Settings by the main process.
      const question = Math.random() < 1 / 4 ? await haligtree.questionBack() : null
      if (!still()) return
      if (question) return (setHint(null), setBack(question))
      // A third of the time, a memory, when there is one to give.
      const next: Hint | null = (Math.random() < 1 / 3 ? await haligtree.memory() : null) ?? (await window.api.hints.next())
      if (still()) (setHint(next), (shownAt.current = Date.now()))
    }
    // Every card put away at once (none drawn on its way out) as the box goes, and the next open's picked.
    const away = (): void => void (document.hidden && (clearAll(), boxed && pick()))
    // The box's page is made while it is away: its first open's card is picked then.
    void (boxed && document.hidden && pick())
    document.addEventListener('visibilitychange', away)
    const offShown = window.api.onShown(() => {
      if (!boxed) return void (clearAll(), pick())
      setAsking(false)
      shownAt.current = Date.now()
      const { hint: shown, back: held, due: owed } = now.current
      if (shown) chime(shown.memory ? 'memory' : 'hint')
      else if (held || owed) chime('memory')
    })
    return () => (document.removeEventListener('visibilitychange', away), offShown())
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const [round, setRound] = useState(0)
  const clearAll = (): void => {
    setHint(null)
    setBack(null)
    setDue(null)
    setAsking(false)
    setRound((n) => n + 1)
  }
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
                { icon: ThumbsUp, tip: hint.id === hint.captureId ? 'Worth keeping: save it as a gem' : 'Worth knowing: test me on it in review', keys: '⌃⇧↑', run: () => react('up') },
                { icon: ThumbsDown, tip: 'Not this one: show it less often', keys: '⌃⇧↓', run: () => react('down') },
                { icon: X, tip: 'Not now', run: () => (chime('fold'), setHint(null)) },
                // Out of the way, but never destroyed: a capture goes to the
                // Bin and a nugget stops surfacing; both come back.
                // A bin only for the capture that goes to the Bin: a nugget
                // that stops surfacing is still kept, so it gets a closed eye.
                { icon: hint.id === hint.captureId ? Trash2 : EyeOff, tip: hint.id === hint.captureId ? 'Move to the Bin' : 'Stop showing it', run: () => {
                  const id = hint.id
                  const capture = id === hint.captureId
                  // A capture going to the Bin crumples and flies to the Bin, as it does from every list; by a key it simply goes.
                  const land = capture ? binFlightFrom(document.querySelector<HTMLElement>('[data-hint-card]')) : undefined
                  capture ? tear() : chime('away')
                  setHint(null)
                  land?.()
                  const was = hint
                  void (capture ? window.api.captures.save(id, { status: 'discarded', bin: true }) : haligtree.saveItem(id, { suspended: true })).then((saved) =>
                    // Undone: back to the status it had, and the card back where it was.
                    toast(capture ? 'Moved to the Bin' : 'It will not come up again', () =>
                      void (capture ? window.api.captures.save(id, { status: ((saved as { was?: string } | null)?.was ?? 'open') as 'open', bin: true }) : haligtree.saveItem(id, { suspended: false })).then(() => setHint(was)), 'success', capture ? seeTheBin : undefined))
                } }
]
  // A memory may be something already dealt with, so it is opened, fixed or
  // shown less, never kept or moved to the Bin from here.
  // Drawn while the box is away, a card is there as it shows, never fading in after (no entrance then).
  const enter = document.hidden ? false : { opacity: 0, transform: shift('translateY(-6px) scale(0.98)') }
  const offered = hint?.memory ? actions.filter(({ icon }) => icon !== ThumbsUp && icon !== Trash2 && icon !== EyeOff) : actions
  return (
    <AnimatePresence key={round}>
      {back && !hint && (
        <motion.div
          key={`back-${back.id}`}
          initial={enter}
          animate={{ opacity: 1, transform: shift('translateY(0px) scale(1)') }}
          exit={{ opacity: 0, transform: shift('translateY(-4px)'), transition: { duration: 0.16, ease: EASE } }}
          transition={{ duration: 0.24, ease: EASE }}
          // Grey, not the brand tint: held, never owed.
          data-hint-surface
          className="mt-2 mb-3 overflow-hidden rounded-lg border bg-[color-mix(in_srgb,var(--accent)_40%,var(--background))] px-3 py-2.5 text-sm"
        >
          <QuestionBack back={back} onOpen={onOpen} onDone={() => setBack(null)} again={backWords}
            onUndone={(words) => (setBackWords(words), setBack(back))} />
        </motion.div>
      )}
      {due && !hint && (
        <motion.div
          key={`due-${due.id}`}
          initial={enter}
          animate={{ opacity: 1, transform: shift('translateY(0px) scale(1)') }}
          exit={{ opacity: 0, transform: shift('translateY(-4px)'), transition: { duration: 0.16, ease: EASE } }}
          transition={{ duration: 0.24, ease: EASE }}
          data-hint-surface
          className="mt-2 mb-3 overflow-hidden rounded-lg border bg-[color-mix(in_srgb,var(--accent)_40%,var(--background))] px-3 py-2.5 text-sm"
        >
          <p className="text-xs text-muted-foreground">{backLine(due)}</p>
          <button type="button" onClick={() => (chime('open'), onOpen(due.type, due.id), setDue(null))} className="mb-1.5 block text-left text-sm text-foreground hover:underline">
            {/* A title, so written, not typed (lib/motion.ts). */}
            {due.title}
          </button>
          <KindBack one={due} onOpen={onOpen} onDone={() => setDue(null)} again={dueWords} onUndone={(words) => (setDueWords(words), setDue(due))} />
        </motion.div>
      )}
      {hint && (
        <motion.div
          key={hint.id}
          data-hint-card
          data-hint-surface={postcard ? undefined : ''}
          initial={enter}
          animate={{ opacity: 1, transform: shift('translateY(0px) scale(1)') }}
          exit={{ opacity: 0, transform: shift('translateY(-4px)'), transition: { duration: 0.16, ease: EASE } }}
          transition={{ duration: 0.24, ease: EASE }}
          className={postcard ? 'group/hint mt-2 mb-3 text-sm' : 'group/hint mt-2 mb-3 overflow-hidden rounded-lg border border-[color-mix(in_srgb,var(--foreground)_10%,transparent)] bg-background px-3 py-2.5 text-sm'}
        >
          {/* A memory, with Postcards on, comes as a postcard: the same card inside. */}
          <Postcarded on={postcard} at={(hint as { at?: string }).at} seed={hint.id}>
          {/* Why it is here, read first: on its own line above the words, in the text's own colour. The two votes
              sit at its right on hover, so no empty row is kept for them under the words. */}
          {!asking && (
            <div className="mb-1 flex min-h-6 items-center gap-1 text-[13px]">
              <span data-hint-mark className={`mr-auto inline-flex min-w-0 items-center gap-1.5 font-medium ${hint.memory ? 'text-[var(--tt-brand-color-400)]' : 'text-foreground'}`}>
                {!hint.memory && <RotateCcw aria-hidden className="size-3.5 shrink-0 text-[var(--tt-brand-color-400)]" />}
                <span className="truncate">{hint.memory ?? (hint.id === hint.captureId ? 'Still in your Inbox' : 'Came back')}</span>
              </span>
              {/* More of these, or fewer. Open, fix, not now and the Bin are in its right-click menu. */}
              {offered.filter(({ icon }) => icon === ThumbsUp || icon === ThumbsDown).map(({ icon, tip, keys, run }) => {
                const word = icon === ThumbsUp ? (hint.id === hint.captureId ? 'Keep it' : 'Keep it coming') : 'Less like this'
                return (
                  <Tooltip key={tip}>
                    <TooltipTrigger asChild>
                      <button type="button" data-hint-vote={icon === ThumbsUp ? 'up' : 'down'} onClick={run}
                        className="shrink-0 cursor-pointer whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs text-muted-foreground opacity-0 transition-[opacity,background-color,color] duration-150 group-hover/hint:opacity-100 focus-visible:opacity-100 hover:bg-accent hover:text-foreground active:scale-[0.97]">
                        {word}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {tip}
                      {keys && keyFor(keys) && <kbd className="ml-2 font-sans text-key text-muted-foreground">{keyFor(keys)}</kbd>}
                    </TooltipContent>
                  </Tooltip>
                )
              })}
            </div>
          )}
          {/* Being fixed, a right click in the words keeps their Cut, Copy and Paste too. */}
          <RowMenu writes={fixing !== null} onOpenChange={(open) => document.documentElement.toggleAttribute('data-hint-menu', open)} items={offered.map(({ tip, keys, run }) => ({ label: tip, keys, run, danger: tip === 'Move to the Bin' }))}>
            {fixing !== null ? (
              // Grows with the words and sits where they sat, so a two-line hint
              // stays two lines and the card does not jump.
              <textarea
                autoFocus
                rows={1}
                value={fixing}
                onChange={(event) => setFixing(event.target.value)}
                onBlur={(event) => !(event.relatedTarget as Element | null)?.closest?.('[role=menu]') && keep(fixing)}
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
                data-hint-words
                className={`cursor-pointer whitespace-pre-line font-sans text-sm leading-snug text-foreground ${whole ? 'max-h-40 overflow-y-auto' : 'line-clamp-3'}`}
                onClick={() => (said.length > 160 ? setWhole(!whole) : fix())}
              >
                {/* The words roll in when it arrives, a hint being dealt; a long one, which must wrap, comes whole at
                    once: typed in, its box stood empty with only the cut-off's "…" showing until the words caught up. */}
                {said.length <= 40 && !said.includes('\n') ? <Rolling by="word" text={said} /> : said}
              </div>
            )}
          </RowMenu>
          {/* A thought on it, the moment it stops you: no trip to its page. */}
          {fixing === null && !asking && <GlossLine id={hint.id} className="mt-1 text-xs text-muted-foreground" keys="⌘;" quiet />}
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
                  ? haligtree.promote(hint.id, line).then((result) => (result === 'needs-source' ? refuse('A quote needs to say who said it first') : result === 'not-open' ? refuse('That capture was already dealt with, so it is not saved again') : toast('Saved as a gem, with your line beside it', undefined, 'success', result ? { label: 'Open', key: 'O', run: () => window.api.openInHome('nugget', result) } : undefined)))
                  : haligtree.saveItem(hint.id, { prompt: line }).then(() => toast('Now tested: it will come up in review'))
                ).then(() => setHint(null))
              }}
              className="mt-2 w-full h-8"
            />
          ) : null}
          </Postcarded>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/**
 * Quick capture's hint, out of the card (main.css, [data-hint-room]): in the room above the card's top left edge,
 * its foot level with the round controls' foot and stopping short of the first of them, so it never covers one.
 * It rises into the room main keeps above the card (main's hint-room.ts), or, with no room above (the top middle of the
 * screen), sits beside the card on the side with room; with room nowhere it waits unseen. `away` hides it without letting it go: while a menu, ⌘K, a recording or the pill is up it
 * waits, and the first word typed sends it off. Nothing in the card moves when it comes or goes.
 */
export function HintRoom({ away, children }: { away: boolean; children: ReactNode }): React.JSX.Element {
  const room = useRef<HTMLDivElement>(null)
  const [right, setRight] = useState<number | null>(null)
  const [fits, setFits] = useState(true)
  useLayoutEffect(() => {
    const measure = (): void => {
      const controls = document.querySelector('.mf-top')?.getBoundingClientRect()
      // Above the card it stops short of the round controls; beside it, its width is the room's (main.css).
      setRight(controls?.width && document.documentElement.dataset.hintSide === 'above' ? Math.round(window.innerWidth - controls.left + 12) : null)
      const card = room.current?.firstElementChild?.firstElementChild?.getBoundingClientRect()
      setFits(!card || (card.top >= 6 && card.left >= 6 && card.right <= window.innerWidth - 6 && card.bottom <= window.innerHeight - 6))
    }
    const sizes = new ResizeObserver(measure)
    if (room.current) sizes.observe(room.current)
    const controls = document.querySelector('.mf-top')
    if (controls) sizes.observe(controls)
    // Main moves the room (above, or beside) while the box is away.
    const sides = new MutationObserver(measure)
    sides.observe(document.documentElement, { attributes: true, attributeFilter: ['data-hint-side', 'style'] })
    window.addEventListener('resize', measure)
    measure()
    return () => (sizes.disconnect(), sides.disconnect(), window.removeEventListener('resize', measure))
  }, [])
  return (
    <div ref={room} data-hint-room data-away={away || !fits || undefined} style={right === null ? undefined : { right }}>
      <div data-hint-in>{children}</div>
    </div>
  )
}
