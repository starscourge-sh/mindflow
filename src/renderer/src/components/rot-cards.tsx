import { useEffect, useRef, useState } from 'react'
import { chime } from '@/lib/sound'
import type { JSONContent } from '@tiptap/core'

import { EXITS, captureKey, exit as exitWith, toTask } from '@/lib/capture-links'
import { wordsOf } from '../../../main/import'
import { AskWho, Rolling, pin, toast, typing } from './vigil/ui'
import { AnimatePresence, motion } from 'motion/react'
import { taskSaid } from '@/lib/vigil'
import { RowMenu, copy } from './vigil/row-menu'
import { age, ageTint } from './capture-list'
import { Kbd, Tip } from '@/components/vigil/ui'
import { Button } from '@/components/ui/button'

type Capture = Awaited<ReturnType<typeof window.api.captures.rot>>[number]

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
 * The rot sampler: three captures nobody has done anything with, leaning old,
 * each with its three exits right there. A sample, never a queue - it does not
 * empty, and nothing says it should.
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
  const reload = (): void =>
    void window.api.captures.rot().then((next) => {
      setCards([...next].sort(byAge))
      setDeal((n) => n + 1)
    })
  const drop = (id: string): void => setCards((all) => all.filter((one) => one.id !== id))
  useEffect(() => {
    reload()
    return window.api.onShown(reload)
  }, [])

  const exit = (id: string, status: string): void => {
    // Only that card goes: the others stay put, and a fresh three comes the
    // next time the prompt opens.
    // Undone, it comes back to its place among the cards.
    const card = cards.find((one) => one.id === id)
    // Dealt again rather than slotted in: a card still on its way out would
    // otherwise come back at the end.
    const back = (): void => {
      if (!card) return
      setCards((all) => (all.some((one) => one.id === id) ? all : [...all, card].sort(byAge)))
      setDeal((n) => n + 1)
    }
    void exitWith(id, status, back).then(() => window.api.captures.get(id)).then((now) => now?.status !== 'open' && drop(id))
  }

  // The card under the pointer takes P, R, D and W, as the focused one does:
  // point and press, no click first. Not while you are writing, where those
  // letters are words. Taken before the list's own keys see them.
  const pointed = useRef<string | null>(null)
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const id = pointed.current
      if (!id || typing() || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      if ((event.target as Element | null)?.closest?.('[data-tone="knock"]')) return
      const picked = EXITS.find((one) => one.key === event.key)
      if (!picked && event.key !== 'w') return
      event.preventDefault()
      if (picked) exit(id, picked.status)
      else setAsking(id)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  if (!cards.length) return null
  return (
    <section className="mb-2">
      <Tip label="Three old captures with no exit yet, a new three each time you open this. A sample, not a list to clear. Click one to read or edit it.">
        <h3 className="w-fit px-2 pb-1 text-xs text-muted-foreground">Waiting on you</h3>
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
          onPointerEnter={() => void (pointed.current = card.id)}
          onPointerLeave={() => void (pointed.current === card.id && (pointed.current = null))}
          data-tone="knock"
          className="group border-b border-border/60 px-2 py-2 text-sm outline-none last:border-b-0 focus-visible:bg-accent/40"
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return
            const picked = EXITS.find((one) => one.key === event.key)
            if (picked) exit(card.id, picked.status)
            else if (event.key === 'w') {
              event.preventDefault()
              setAsking(card.id)
            }
          }}
        >
          <RowMenu items={[
            { label: 'Open', run: () => onOpen(card.id) },
            'separator',
            ...EXITS.map((one) => ({ label: one.label, keys: one.key.toUpperCase(), danger: one.status === 'discarded', run: () => exit(card.id, one.status) })),
            { label: 'Make it a task', run: () => void toTask(card.id).then((made) => { if (!made) return; chime(made.existed ? 'nope' : 'noted'); toast(taskSaid(made, 'Now a task')); drop(card.id) }) },
            { label: 'Say who said it', keys: 'W', run: () => setAsking(card.id) },
            'separator',
            { label: 'Pin to the prompt', run: () => pin('captures', card.id, true) },
            { label: `Copy ${captureKey(card.number)}`, run: () => copy(captureKey(card.number)) }
          ]}>
            {/* Blurred as a whole box: blur inside a clamped box was cut at its edges. */}
            <button type="button" data-row className="private-text line-clamp-2 w-full whitespace-pre-line text-left" onClick={() => onOpen(card.id)}>
              {shown(card.title, card.body)}
            </button>
          </RowMenu>
          {asking === card.id ? (
            <div className="mt-1"><AskWho id={card.id} initial={card.attribution ?? ''} onDone={(who) => {
              setAsking(null)
              if (who !== undefined) setCards((all) => all.map((one) => (one.id === card.id ? { ...one, attribution: who || null } : one)))
            }} /></div>
          ) : (
          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            {/* How long it has gone untouched, warming with age: the rot itself. */}
            <span className="mr-auto truncate">
              <span style={{ color: ageTint(card.capturedAt) }}>{Date.now() - new Date(card.capturedAt).getTime() < 86400000 ? 'from today' : `untouched ${age(card.capturedAt)}`}</span>
            </span>
            {EXITS.map((one) => (
              <Tip key={one.key} label={<span className="flex items-center gap-2">{one.what}<Kbd>{one.key.toUpperCase()}</Kbd><span className="text-muted-foreground">pointing at the card</span></span>}>
              {/* Quiet at rest, their colour when you reach the card. */}
              <Button variant="ghost" size="sm"
                // Out of sight until you reach the card: three cards of three buttons
                // each was a wall of controls over the list.
                className="text-muted-foreground opacity-0 transition-[color,opacity] group-hover:text-[var(--tint)] group-hover:opacity-100 group-focus-visible:text-[var(--tint)] group-focus-visible:opacity-100 focus-visible:text-[var(--tint)] focus-visible:opacity-100"
                style={{ '--tint': `var(--tt-color-text-${one.tint})` } as React.CSSProperties}
                onClick={() => exit(card.id, one.status)}
              >
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
          </div>
          )}
        </motion.div>
      ))}
      </AnimatePresence>
    </section>
  )
}
