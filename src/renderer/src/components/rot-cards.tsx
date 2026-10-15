import { useEffect, useRef, useState } from 'react'
import { chime } from '@/lib/sound'
import type { JSONContent } from '@tiptap/core'

import { noteLinkText } from '@/lib/capture-links'
import { TagRow, decideDay, openPass } from './vigil/pass'
import { clueInto } from './vigil/pinned-questions'
import { wordsOf } from '../../../main/import'
import { AskWho, Rolling, Typed, pin, toast, Pressed } from './vigil/ui'
import { AnimatePresence, motion } from 'motion/react'
import { EASE } from '@/lib/motion'
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
      chime(on ? 'tag' : 'untag')
      // Taken off and undone: the words as they were, the tag where it was written.
      quietly(on ? () => retag({ ...card, body }, name, false, true) : () =>
        void window.api.captures.save(card.id, { body: card.body }).then(() => setCards((all) => all.map((one) => (one.id === card.id ? { ...one, body: card.body } : one)))))
    })
  const tagsOf = (card: Capture): string[] => tagsIn(textOf(card.body))

  if (!cards.length)
    return left === 0 && !off ? (
      <Rest compact strip seed="rot">
        <p className="mb-2 px-2 py-1 text-xs text-muted-foreground">
          <Typed text="No old captures waiting: every one has been dealt with." step={28} delay={200} />
        </p>
      </Rest>
    ) : null
  return (
    // Old captures in a panel of their own, tinted as the pinned note above is, so they read apart from the Inbox under them.
    <section className="mb-2 rounded-xl bg-foreground/[0.045] px-1 pt-1.5 pb-0.5">
      <Tip label={`A fresh few old captures each time, not a list to clear. Deciding waits for ${day}.`}>
        <h3 className="w-fit px-2 pb-1 text-xs text-muted-foreground">Old captures to tidy</h3>
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
          exit={{ opacity: 0, x: 24, transition: { duration: 0.16, ease: EASE } }}
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
            <button type="button" data-row className="private-text line-clamp-2 w-full whitespace-pre-line text-left [overflow-wrap:anywhere]" onClick={() => onOpen(card.id)}>
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
