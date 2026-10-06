import { useEffect, useRef, useState } from 'react'
import { chime } from '@/lib/sound'
import type { JSONContent } from '@tiptap/core'

import { captureKey } from '@/lib/capture-links'
import { TagRow, decideDay, openPass } from './vigil/pass'
import { clueInto } from './vigil/pinned-questions'
import { wordsOf } from '../../../main/import'
import { AskWho, Rolling, Typed, pin, toast } from './vigil/ui'
import { AnimatePresence, motion } from 'motion/react'
import { useLive, vigil, type PinnedQuestion } from '@/lib/vigil'
import { RowMenu, copy } from './vigil/row-menu'
import { age, ageTint } from './capture-list'
import { Kbd, Tip } from '@/components/vigil/ui'
import { Button } from '@/components/ui/button'
import { Rest } from './vigil/scenery'
import { ComingBack } from './vigil/coming-back'
import { GlossButton, GlossLine, openGloss } from './vigil/gloss-line'
import { daysSince } from '../../../main/dates'

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
 * The rot sampler: three captures nobody has done anything with, leaning old.
 * A sample, never a queue - it does not empty, and nothing says it should.
 * It asks only for a tidy (a tag, a format, set aside for deciding day):
 * deciding what each becomes is the weekly pass's job, or the note's own,
 * not something to be asked every time the box opens.
 *
 * Drawn each time the window is brought up and after an exit, not on every
 * change elsewhere, or the cards would shuffle under you while you type.
 */
/** Oldest first; a tie, as imports often have, by number. */
const byAge = (a: Capture, b: Capture): number => a.capturedAt.localeCompare(b.capturedAt) || a.number - b.number

export function RotCards({ onOpen }: { onOpen: (id: string) => void }): React.JSX.Element | null {
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
      chime(on ? 'retag' : 'off')
      toast(on ? `Tagged #${name}` : `#${name} taken off`, () => retag({ ...card, body }, name, !on, true))
    })
  const tagsOf = (card: Capture): string[] => [...new Set([...textOf(card.body).matchAll(/(?:^|\s)#([a-z][\w-]*)/gi)].map((match) => match[1].toLowerCase()))]

  if (!cards.length)
    return left === 0 && !off ? (
      <Rest compact strip seed="rot">
        <p className="mb-2 px-2 py-1 text-xs text-muted-foreground">
          <Typed text="Nothing rotting: every old capture has taken an exit." step={28} delay={200} />
        </p>
      </Rest>
    ) : null
  return (
    <section className="mb-2">
      <Tip label={`A few old captures, a fresh few each time you open this. A sample, not a list to clear: tag one, tidy it, or set it aside for ${day}. Deciding what each becomes waits for that day.`}>
        <h3 className="w-fit px-2 pb-1 text-xs text-muted-foreground">Worth a tidy</h3>
      </Tip>
      {/* A card that takes an exit leaves sideways, the way it was dealt with,
          and the next one fades into its place. */}
      <AnimatePresence key={deal} initial={false} mode="popLayout">
      {cards.map((card) => (
        <motion.div
          key={card.id}
          data-id={card.id}
          data-private={card.private ? '' : undefined}
          layout
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, x: 24, transition: { duration: 0.18 } }}
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
            else if (event.key === 'f') openPass('tidy', [card.id])
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
            { label: 'Tidy it: bold, fold, cross off', keys: 'F', run: () => openPass('tidy', [card.id]) },
            { label: `Come back to it on ${day}`, keys: 'C', run: () => setAside(card) },
            { label: 'Say who said it', keys: 'W', run: () => setAsking(card.id) },
            { label: 'Add a thought', keys: ';', run: () => openGloss(card.id) },
            // A clue to one of the questions in view; undone, the card is back.
            clues.length > 0 && 'separator',
            ...clues.map((question) => ({ label: `A clue to “${question.title.length > 32 ? `${question.title.slice(0, 32)}…` : question.title}”`, run: () =>
              void clueInto(question, { captureId: card.id }, () => putBack(card)).then((ok) => ok && (drop(card.id), count())) })),
            'separator',
            { label: 'Pin to the prompt', run: () => pin('captures', card.id, true) },
            { label: `Copy ${captureKey(card.number)}`, run: () => copy(captureKey(card.number)) }
          ]}>
            {/* Blurred as a whole box: blur inside a clamped box was cut at its edges. */}
            <button type="button" data-row className="private-text line-clamp-2 w-full whitespace-pre-line text-left" onClick={() => onOpen(card.id)}>
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
          <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            {/* How long it has gone untouched, warming with age: the rot itself.
                Never cut short: in a narrow panel the buttons wrap under it instead. */}
            <span className="mr-auto shrink-0 whitespace-nowrap">
              <span style={{ color: ageTint(card.capturedAt, card.importedAt) }}>{daysSince(card.capturedAt) < 1 ? 'from today' : `untouched ${age(card.capturedAt)}`}</span>
            </span>
            {[
              { label: 'Tag', key: 'T', tint: 'blue', what: 'Add a tag, so it turns up on that tag\'s page', run: () => setTagging(card.id) },
              { label: 'Tidy', key: 'F', tint: 'green', what: 'Bold the line that matters, fold the rest, cross off what is done', run: () => openPass('tidy', [card.id]) },
              { label: `Come back ${day}`, key: 'C', tint: 'orange', what: `Set it aside for ${day}'s deciding pass, and let it go until then`, run: () => setAside(card) }
            ].map((one) => (
              <Tip key={one.key} label={<span className="flex items-center gap-2">{one.what}<Kbd>{one.key}</Kbd></span>}>
              {/* Quiet at rest, their colour when you reach the card. */}
              <Button variant="ghost" size="sm"
                // Out of sight until you reach the card: three cards of three buttons
                // each was a wall of controls over the list.
                className="text-muted-foreground opacity-0 transition-[color,opacity] group-hover:text-[var(--tint)] group-hover:opacity-100 group-focus-visible:text-[var(--tint)] group-focus-visible:opacity-100 focus-visible:text-[var(--tint)] focus-visible:opacity-100"
                style={{ '--tint': `var(--tt-color-text-${one.tint})` } as React.CSSProperties}
                onClick={one.run}
              >
                {/* Its key is in the tip: shown on the button, it widened the row
                    as the card was reached, and the buttons wrapped. */}
                {one.label}
              </Button>
              </Tip>
            ))}
            {/* Who said it matters for a quote, or once someone is named. */}
            {(card.kind === 'quote' || card.attribution) && (
            <Tip label={<span className="flex items-center gap-2">Say who said it: a quote needs one to be kept<Kbd>W</Kbd></span>}>
            <Button variant="ghost" size="sm" className="text-muted-foreground transition-colors group-hover:text-foreground focus-visible:text-foreground" onClick={() => setAsking(card.id)}>
              <Rolling text={card.attribution ?? 'Who?'} />
            </Button>
            </Tip>
            )}
            <GlossButton className="static group-focus-visible:opacity-100" onClick={() => openGloss(card.id)} />
          </div>
          )}
        </motion.div>
      ))}
      </AnimatePresence>
    </section>
  )
}
