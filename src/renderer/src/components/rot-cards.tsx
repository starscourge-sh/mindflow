import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { chime } from '@/lib/sound'
import type { JSONContent } from '@tiptap/core'

import { noteLinkText } from '@/lib/capture-links'
import { TagRow, decideDay, openPass } from './vigil/pass'
import { clueInto } from './vigil/pinned-questions'
import { wordsOf } from '../../../main/import'
import { AskWho, Rolling, Typed, pin, toast, Pressed } from './vigil/ui'
import { AnimatePresence, motion } from 'motion/react'
import { EASE, byKeys, shift } from '@/lib/motion'
import { useLive, vigil, type PinnedQuestion } from '@/lib/vigil'
import { RowMenu, copy } from './vigil/row-menu'
import { ageTint } from './capture-list'
import { Tip, quietly } from '@/components/vigil/ui'
import { Button } from '@/components/ui/button'
import { Rest } from './vigil/scenery'
import { ComingBack } from './vigil/coming-back'
import { GlossButton, GlossLine, openGloss } from './vigil/gloss-line'
import { ago, daysSince } from '../../../main/dates'
import { Signed } from './vigil/signature'
import { tagsIn } from '../../../main/tag-words'
import { quoted } from '../../../main/clip'
import { ChevronRight } from '@/components/ui/icons'
import { BOX_PINS, Pins } from './pins'
import { PassLinks } from './vigil/pass'

type Capture = Awaited<ReturnType<typeof window.api.captures.rot>>[number]

// The last count seen, kept across visits so the all-clear chord sounds when
// the last one goes, not each time the Inbox opens.
let was: number | null = null

/** A body's words, whether it arrived as Markdown or as the editor's JSON. */
export const textOf = (body: unknown): string => {
  // Markdown read as words: no list markers, links as their words, no marks.
  if (typeof body === 'string')
    return body
      .replace(/^\s*[-*]\s+/gm, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
      .replace(/\$(?=\S)([^$\n]*?\S)\$(?!\d)/g, '$1')
      .replace(/\*\*|__|`|==|~~/g, '')
  // Blocks on their own lines; inside one, its words as written, emoji and all.
  const walk = (node: JSONContent): string =>
    node.content?.some((child) => child.text !== undefined || child.type === 'emoji') ? wordsOf(node) : node.text ?? (node.content ?? []).map(walk).join('\n')
  return body ? walk(body as JSONContent) : ''
}

/**
 * What a card says: its words, once. The stored title is only shown over a
 * bare address, as a bookmark's page name, or when there are no words at all;
 * for anything else it is a cleaned copy of the first line, said twice.
 */
export const shown = (title: string, body: unknown): string => {
  const text = textOf(body).trim()
  return /^https?:\/\/\S+$/.test(text) && title && title !== text ? `${title}\n${text}` : text || title
}

/**
 * How many old cards the side panel shows, for the header's chip to say the
 * same: `shown` while the cards are on screen, `fit` (how many found room last
 * time) once they are not, so the chip never promises more than will show.
 */
const room = { shown: null as number | null, fit: null as number | null, tell: new Set<() => void>() }
const said = (shown: number | null, fit: number | null): void => {
  if (room.shown === shown && room.fit === fit) return
  Object.assign(room, { shown, fit })
  room.tell.forEach((one) => one())
}
export const useOldShown = (waiting: number): number => {
  const shown = useSyncExternalStore((on) => (room.tell.add(on), () => room.tell.delete(on)), () => room.shown)
  const fit = useSyncExternalStore((on) => (room.tell.add(on), () => room.tell.delete(on)), () => room.fit)
  return shown ?? Math.min(waiting, fit ?? waiting)
}

// About how tall a pinned row, a pinned chip row and an old card are, for
// deciding before anything is drawn (each card's own height is used once seen).
const PIN_ROW = 32
const CARD = 84
// The Inbox's heading, its kinds and three rows: what the list keeps first.
const LIST = 236

/**
 * What waits above the Inbox in quick capture's side panel: pinned notes, the
 * Tidy and Decide passes, and old captures. Together they keep to about 45% of
 * the tab, so the Inbox under them always has rows to see: short on room, the
 * pins fold to one row of chips and fewer old cards come up, never under one.
 */
export function Waiting({ onOpen, onOpenAny }: { onOpen: (id: string) => void; onOpenAny: (type: string, id: string) => void }): React.JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const top = useRef<HTMLDivElement>(null)
  const [tall, setTall] = useState({ body: 0, pins: 0 })
  useLayoutEffect(() => {
    const body = box.current?.parentElement
    if (!body) return
    const read = (): void => setTall((was) => {
      const next = { body: body.clientHeight, pins: top.current?.offsetHeight ?? 0 }
      return was.body === next.body && was.pins === next.pins ? was : next
    })
    const watch = new ResizeObserver(read)
    watch.observe(body)
    if (top.current) watch.observe(top.current)
    read()
    return () => watch.disconnect()
  }, [])
  const pins = Math.min(BOX_PINS, useLive(vigil.pins, [] as Awaited<ReturnType<typeof vigil.pins>>).length)
  const old = useLive(vigil.rotWaiting, 0)
  // At most 45% of the tab, and never so much that the Inbox loses its third row.
  const budget = Math.round(Math.min(tall.body * 0.45, tall.body - LIST))
  // Listed in full while they and one old card still fit; a row of chips once not.
  const compact = tall.body > 0 && pins > 0 && pins * PIN_ROW + 12 + (old ? CARD + 36 : 40) > budget
  return (
    <div ref={box} data-waiting-stack className="relative z-10 shrink-0 border-b border-border/70">
      <div ref={top}><Pins onOpen={onOpenAny} compact={compact} /></div>
      <RotCards onOpen={onOpen} room={tall.body ? budget - tall.pins : null}
        aside={<PassLinks className="px-1 pb-2 [&:not(:last-child)]:mb-3 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-border/50" />}
        inline={<PassLinks className="-my-1 ml-auto" />} />
    </div>
  )
}

/** Oldest first; a tie, as imports often have, by number. */
const byAge = (a: Capture, b: Capture): number => a.capturedAt.localeCompare(b.capturedAt) || a.number - b.number

/**
 * The rot sampler: three captures nobody has done anything with, leaning old.
 * A sample, never a queue - it does not empty, and nothing says it should.
 * It asks only for a tidy (a tag, a format, set aside for deciding day):
 * deciding what each becomes is the weekly pass's job, or the note's own,
 * not something to be asked every time the box opens.
 *
 * Drawn each time the window is brought up and after an exit, not on every
 * change elsewhere, or the cards would shuffle under you while you type.
 */
export function RotCards({ onOpen, room: space = null, aside = null, inline = null }: {
  onOpen: (id: string) => void
  /** The height the cards may take, heading and all; null for no limit. */
  room?: number | null
  /** Shown above the cards' area when there are none (the passes)... */
  aside?: ReactNode
  /** ...and beside their heading when there are. */
  inline?: ReactNode
}): React.JSX.Element | null {
  const [cards, setCards] = useState<Capture[]>([])
  // The card whose who is being asked, from its w key.
  const [asking, setAsking] = useState<string | null>(null)
  // A fresh deal arrives whole and still, oldest first: only a card you act on
  // moves. Keying the list by the deal keeps a reshuffle from animating as if
  // the cards were being reordered under you.
  const [deal, setDeal] = useState(0)
  // How many old captures are still open at all: none, and the area says so
  // with a chord, once, as the line arrives.
  const [left, setLeft] = useState<number | null>(null)
  // Cards turned off in Settings: no area, so no all-clear either.
  const settings = useLive(vigil.settings, null as Awaited<ReturnType<typeof vigil.settings>> | null)
  const off = settings?.rotCount === 0
  // The questions kept in view, offered in each card's menu: a row of them
  // on every card only pushed the cards apart.
  const pinned = useLive(vigil.pinnedQuestions, [] as PinnedQuestion[])
  const clues = settings?.pinnedQuestions === false ? [] : pinned
  const count = (): void =>
    void vigil.rotLeft().then((n) => {
      if (n === 0 && was !== 0 && !off) chime('clear')
      was = n
      setLeft(n)
    })
  const reload = (): void => {
    void window.api.captures.rot().then((next) => {
      setCards([...next].sort(byAge))
      setDeal((n) => n + 1)
    })
    count()
  }
  const drop = (id: string): void => setCards((all) => all.filter((one) => one.id !== id))
  useEffect(() => {
    reload()
    return window.api.onShown(reload)
  }, [])

  // The card whose tags are being changed, from its t key.
  const [tagging, setTagging] = useState<string | null>(null)
  const field = useRef<HTMLInputElement | null>(null)
  const day = decideDay(settings)
  // Brought back by an undo, a card is dealt again rather than slotted in: one
  // still on its way out would otherwise come back at the end.
  const putBack = (card: Capture): void => {
    setCards((all) => (all.some((one) => one.id === card.id) ? all : [...all, card].sort(byAge)))
    setDeal((n) => n + 1)
    count()
  }
  // Set aside for deciding day: the card goes, and it waits for that pass.
  // Worked by keyboard, the next card takes the focus, so j and k carry on.
  const setAside = (card: Capture): void => {
    const all = [...document.querySelectorAll<HTMLElement>('[data-card]')]
    const here = all.findIndex((one) => one.dataset.id === card.id)
    const after = document.activeElement === all[here] ? all[here + 1] ?? all[here - 1] : null
    chime('back')
    void vigil.comeBack(card.id, true).then(() => {
      drop(card.id)
      after?.focus({ focusVisible: true } as FocusOptions)
      toast(`Set aside for ${day}`, () => void vigil.comeBack(card.id, false).then(() => (chime('undo'), putBack(card))))
    })
  }
  // A tag on or off, in its words; the card shows them at once.
  const retag = (card: Capture, name: string, on: boolean, quiet = false): void =>
    void vigil.passTag(card.id, name, on).then((body) => {
      if (body === null) return chime('nope')
      setCards((all) => all.map((one) => (one.id === card.id ? { ...one, body } : one)))
      if (quiet) return
      chime(on ? 'tag' : 'untag')
      // Taken off and undone: the words as they were, the tag where it was written.
      quietly(on ? () => retag({ ...card, body }, name, false, true) : () =>
        void window.api.captures.save(card.id, { body: card.body }).then(() => setCards((all) => all.map((one) => (one.id === card.id ? { ...one, body: card.body } : one)))))
    })
  const tagsOf = (card: Capture): string[] => tagsIn(textOf(card.body))

  // As many cards as the room allows, oldest first, never under one: each
  // card's height as last drawn, so one hidden for room still counts its own.
  const section = useRef<HTMLElement>(null)
  const heights = useRef(new Map<string, number>())
  // Not even one fits: the cards fold to their heading's line, which says how
  // many and opens them in Tidy, one at a time, with the whole window to work in.
  const [fit, setFit] = useState(Infinity)
  useLayoutEffect(() => {
    const here = section.current
    if (!here) return
    here.querySelectorAll<HTMLElement>('[data-card]').forEach((one) => one.dataset.id && heights.current.set(one.dataset.id, one.offsetHeight))
    const head = (here.querySelector('[data-rot-head]') as HTMLElement | null)?.offsetHeight ?? 24
    // The section's own padding, margin and the rule under the stack.
    let used = head + 18
    let n = 0
    for (const card of cards) {
      const tall = heights.current.get(card.id) ?? CARD
      if (space !== null && used + tall > space) break
      used += tall
      n++
    }
    setFit(n)
  })
  const folded = fit === 0
  const dealt = folded ? cards : cards.slice(0, fit)
  useEffect(() => said(dealt.length, cards.length ? dealt.length : null))
  useEffect(() => () => said(null, room.fit), [])

  if (!cards.length)
    return left === 0 && !off ? (
      <>
        {aside}
        <Rest compact strip seed="rot">
          <p className="mb-2 px-2 py-1 text-xs text-muted-foreground">
            <Typed text="No old captures waiting: every one has been dealt with." step={28} delay={200} />
          </p>
        </Rest>
      </>
    ) : <>{aside}</>
  return (
    // Old captures in a panel of their own, tinted as the pinned note above is, so they read apart from the Inbox under them.
    <section ref={section} className={`rounded-xl bg-foreground/[0.045] px-1 ${folded ? 'mb-1.5 py-0.5' : 'mb-2 pt-1.5 pb-0.5'}`}>
      {/* The passes sit on the heading's line: a row of their own above it pushed the Inbox down. */}
      <div data-rot-head className={`flex min-h-6 items-center gap-1 px-2 ${folded ? '' : 'pb-1'}`}>
        {folded ? (
          <Tip label={`Tidy them one at a time: there is no room for the cards here. Deciding waits for ${day}.`}>
            <button type="button" data-rot-folded onClick={() => (chime('tap'), openPass('tidy', cards.map((one) => one.id)))}
              className="group/fold -mx-1 flex items-center gap-1 rounded-md px-1 py-0.5 text-sm text-foreground/85 transition-colors hover:bg-accent/60 hover:text-foreground">
              <Rolling text={cards.length} /> {cards.length === 1 ? 'old capture' : 'old captures'} to tidy
              <ChevronRight aria-hidden className="size-3.5 text-muted-foreground transition-transform group-hover/fold:translate-x-0.5" />
            </button>
          </Tip>
        ) : (
          <Tip label={`A fresh few old captures each time, not a list to clear. Deciding waits for ${day}.`}>
            <h3 className="w-fit text-xs text-muted-foreground">Old captures to tidy</h3>
          </Tip>
        )}
        {inline}
      </div>
      {/* A card that takes an exit leaves sideways, the way it was dealt with,
          and the next one fades into its place. */}
      <AnimatePresence key={deal} initial={false} mode="popLayout">
      {!folded && dealt.map((card) => (
        <motion.div
          key={card.id}
          data-id={card.id}
          data-private={card.private ? '' : undefined}
          layout="position"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          // Dealt with by a key, it simply goes; by a click it leaves sideways.
          variants={{ gone: () => (byKeys() ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, transform: shift('translateX(24px)'), transition: { duration: 0.16, ease: EASE } }) }}
          exit="gone"
          tabIndex={0}
          data-tone="knock"
          data-card
          className="group group/item border-b border-border/60 px-2 py-2 text-sm outline-none last:border-b-0 focus-visible:bg-accent/40"
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return
            // j and k move between the cards; past the last, on into the list.
            if (event.key === 'j' || event.key === 'ArrowDown' || event.key === 'k' || event.key === 'ArrowUp') {
              event.preventDefault()
              event.stopPropagation()
              const all = [...document.querySelectorAll<HTMLElement>('[data-card]')]
              const next = all[all.indexOf(event.currentTarget) + (event.key === 'j' || event.key === 'ArrowDown' ? 1 : -1)]
              if (next) next.focus()
              else if (event.key === 'j' || event.key === 'ArrowDown') event.currentTarget.blur()
              return
            }
            // A tidy, never an exit: a tag, a format, or set aside for deciding day.
            if (event.key === 't' || event.key === '#') {
              event.preventDefault()
              setTagging(card.id)
            }
            else if (event.key === 'c') setAside(card)
            // Taken, so the list's own F (Display) behind the cards does not open too.
            else if (event.key === 'f') (event.preventDefault(), openPass('tidy', [card.id]))
            else if (event.key === 'w') {
              event.preventDefault()
              setAsking(card.id)
            }
            else if (event.key === ';') {
              event.preventDefault()
              openGloss(card.id)
            }
          }}
        >
          <RowMenu items={[
            { label: 'Open', run: () => onOpen(card.id) },
            'separator',
            { label: 'Tag it', keys: 'T', run: () => setTagging(card.id) },
            { label: 'Tidy it', hint: 'Bold, fold, cross off', keys: 'F', run: () => openPass('tidy', [card.id]) },
            { label: `Come back ${day}`, keys: 'C', run: () => setAside(card) },
            { label: 'Say who said it', keys: 'W', run: () => setAsking(card.id) },
            { label: 'Add a thought', keys: ';', run: () => openGloss(card.id) },
            // A clue to one of the questions in view; undone, the card is back.
            clues.length > 0 && 'separator',
            ...clues.map((question) => ({ label: `A clue to ${quoted(question.title, 32)}`, run: () =>
              void clueInto(question, { captureId: card.id }, () => putBack(card)).then((ok) => ok && (drop(card.id), count())) })),
            'separator',
            { label: 'Pin to the sidebar', run: () => pin('captures', card.id, true) },
            { label: 'Copy link', hint: 'Paste it into any note to link here', run: () => copy(noteLinkText(card.id, card.title), 'Copied a link: paste it into any note') }
          ]}>
            {/* Blurred as a whole box: blur inside a clamped box was cut at its edges. */}
            <button type="button" data-row className="private-text -my-0.5 line-clamp-2 w-full py-0.5 whitespace-pre-line text-left [overflow-wrap:anywhere]" onClick={() => onOpen(card.id)}>
              {shown(card.title, card.body)}
            </button>
          </RowMenu>
          {/* Caught three times or more: unfinished, and it says so. */}
          {!card.private && <ComingBack id={card.id} className="mt-1" />}
          {/* A thought on it right here: the moment it stops you. Only there
              once it has one, or ; (or the button below) opens it. */}
          {asking !== card.id && <GlossLine id={card.id} quiet className="mt-0.5" />}
          {tagging === card.id ? (
            <div className="mt-1.5"><TagRow autoFocus tags={tagsOf(card)} field={field} onAdd={(name) => retag(card, name, true)} onRemove={(name) => retag(card, name, false)}
              onDone={() => {
                setTagging(null)
                document.querySelector<HTMLElement>(`[data-card][data-id="${CSS.escape(card.id)}"]`)?.focus({ focusVisible: true } as FocusOptions)
              }} /></div>
          ) : asking === card.id ? (
            <div className="mt-1"><AskWho id={card.id} initial={card.attribution ?? ''} onDone={(who) => {
              setAsking(null)
              if (who !== undefined) setCards((all) => all.map((one) => (one.id === card.id ? { ...one, attribution: who || null } : one)))
            }} /></div>
          ) : (
          <div className="mt-1 flex min-w-0 flex-nowrap items-center gap-1 overflow-hidden text-xs text-muted-foreground">
            {/* How long it has gone untouched, warming with age: the rot itself. Never cut short. */}
            <span className="mr-auto shrink-0 whitespace-nowrap">
              <span style={{ color: ageTint(card.capturedAt, card.importedAt) }}>{daysSince(card.capturedAt) < 1 ? 'from today' : `caught ${ago(card.capturedAt)}`}</span>
            </span>
            {/* Who said it matters for a quote, or once someone is named. Reached,
                the card's actions take its place on the same line, so the card never
                grows under the pointer; W still asks. */}
            {(card.kind === 'quote' || card.attribution) && (
            <Tip label={<span className="flex items-center gap-2">Say who said it: a quote needs one to be kept<Pressed keys="W" /></span>}>
            <Button variant="ghost" size="sm" className="min-w-0 text-muted-foreground group-hover:hidden group-focus-within:hidden group-focus-visible:hidden focus-visible:text-foreground" onClick={() => setAsking(card.id)}>
              {card.kind === 'quote' && card.attribution ? <Signed who={card.attribution} className="private-text max-w-56" /> : <Rolling text={card.attribution ?? 'Who?'} />}
            </Button>
            </Tip>
            )}
            <GlossButton className="static group-focus-visible:opacity-100" onClick={() => openGloss(card.id)} />
            {[
              { label: 'Tag', key: 'T', tint: 'blue', what: 'Add a tag, so it turns up on that tag\'s page', run: () => setTagging(card.id) },
              { label: 'Tidy', key: 'F', tint: 'green', what: 'Bold the line that matters, fold the rest, cross off what is done', run: () => openPass('tidy', [card.id]) },
              { label: 'Later', key: 'C', tint: 'orange', what: `Set it aside until deciding day, ${day}, and put it out of mind until then`, run: () => setAside(card) }
            ].map((one) => (
              <Tip key={one.key} label={<span className="flex items-center gap-2">{one.what}<Pressed keys={one.key} /></span>}>
              {/* Quiet at rest, their colour when you reach the card. */}
              <Button variant="ghost" size="sm"
                // Out of sight until you reach the card: three cards of three buttons
                // each was a wall of controls over the list. Taking no room until
                // then too, and then only the room Who? gives up, on the same line.
                className="hidden shrink-0 text-muted-foreground transition-[color] group-hover:inline-flex group-hover:text-[var(--tint)] group-focus-within:inline-flex group-focus-visible:inline-flex group-focus-visible:text-[var(--tint)] focus-visible:text-[var(--tint)]"
                style={{ '--tint': `var(--tt-color-text-${one.tint})` } as React.CSSProperties}
                onClick={one.run}
              >
                {/* Its key is in the tip: shown on the button, it widened the row
                    as the card was reached, and the buttons wrapped. */}
                {one.label}
              </Button>
              </Tip>
            ))}
          </div>
          )}
        </motion.div>
      ))}
      </AnimatePresence>
    </section>
  )
}
