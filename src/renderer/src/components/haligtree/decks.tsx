import { useEffect, useMemo, useRef, useState } from 'react'
import { NAMING_MENU, NameInMenu } from './name-in-place'
import { chime } from '@/lib/sound'
import { call, haligtree, useLive } from '@/lib/haligtree'
import { plural } from '../../../../main/dates'
import { toast } from './ui'
import type { BrowsedCard } from './card-browser'
import { ChevronDown, Layers } from 'lucide-react'
import { EXAMPLE_TAG } from '../../../../main/name'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

/**
 * Your own decks. In Haligtree a deck is a tag your cards share: there is no
 * second system. In Review a tag that holds cards is called a deck; a deck
 * made by hand (New deck) is one before it holds a card. "Biology/Cells" (or
 * "Biology::Cells") is #biology-cells, a deck inside #biology.
 */

/** A deck's name as its #tag: "Biology/Cells", "Spanish::Verbs" or "spanish verbs" become #biology-cells, #spanish-verbs. */
export const deckTagOf = (words: string): string =>
  words.trim().toLowerCase().replace(/^#/, '').split(/::|\//).map((part) => part.replace(/[^\p{L}\p{M}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '')).filter(Boolean).join('-')

/** A part of a deck's name as a person reads it: "psychology-cognition" is "Psychology cognition". */
export const sayDeck = (words: string): string => { const plain = words.replace(/-+/g, ' ').trim(); return plain.charAt(0).toUpperCase() + plain.slice(1) }

/**
 * A deck's name as Review shows it, never as a #tag: its words with a capital,
 * and when it sits inside another deck (one of `known`), the path to it:
 * #biology-cells under #biology is "Biology / Cells". The example deck by its name.
 */
export function deckTitle(tag: string, known: string[] = []): string {
  if (tag === EXAMPLE_TAG) return 'How remembering works'
  const ups = known.filter((one) => tag.startsWith(`${one}-`)).sort((a, b) => a.length - b.length)
  let prev = ''
  return [...ups, tag].map((one) => { const part = prev ? one.slice(prev.length + 1) : one; prev = one; return sayDeck(part) }).join(' / ')
}

/**
 * A deck name's size on its tile (an @container): the title size, or smaller
 * when its longest word would not fit the line (a serif letter is about 0.56
 * of its size wide), so a word is never broken; `room` is what the line gives up (the ⋯).
 */
/** A very long word (over 14 letters) given soft hyphens every few letters: if it must break, it breaks there, with a real hyphen, never mid-letter-pair at random. */
export const softBreaks = (name: string): string =>
  name.split(' ').map((word) => (word.length > 14 ? word.replace(/(\p{L}{6})(?=\p{L}{4})/gu, '$1\u00AD') : word)).join(' ')

export const nameFit = (name: string, room = '0rem'): React.CSSProperties => {
  const longest = Math.max(4, ...name.split(/\s+/).map((word) => word.length))
  return { fontSize: `max(0.8125rem, min(1.125rem, calc((100cqw - ${room}) / ${(longest * 0.56).toFixed(2)})))` }
}

/** Under a deck: the deck itself, or one inside it. */
export const inDeck = (tags: string[], deck: string): boolean => tags.some((one) => one === deck || one.startsWith(`${deck}-`))

/**
 * A deck named `words` made (under `inside`), said with Undo. Resolves to its
 * tag, or null when the words make no deck. Review's grid names it in place
 * first, and so do the deck picker's own row and a card's "Move to deck" menu (NameInMenu).
 */
export async function madeDeck(words: string | null, inside?: string): Promise<string | null> {
  const tag = words && deckTagOf(inside ? `${inside}/${words}` : words)
  if (!tag) return null
  await haligtree.setTag(tag, { deck: true })
  chime('noted')
  toast(`The deck ${deckTitle(tag)} is made`, () => void haligtree.setTag(tag, { deck: false }).then(() => chime('undo')))
  return tag
}

/**
 * "New deck" from ⌘K: Review's Decks shows a new deck in its grid, its name
 * field ready, as its own "New deck" button does. Kept until the Decks tab
 * is there to take it, then taken once.
 */
let newAsked = false
export const nameNewDeck = (): void => void ((newAsked = true), window.dispatchEvent(new Event('haligtree:new-deck')))
export function useNewDeckAsked(take: () => void): void {
  const latest = useRef(take)
  latest.current = take
  useEffect(() => {
    const taken = (): void => void (newAsked && ((newAsked = false), latest.current()))
    taken()
    window.addEventListener('haligtree:new-deck', taken)
    return () => window.removeEventListener('haligtree:new-deck', taken)
  }, [])
}

export type OwnDeck = { tag: string; /** Made as a deck (New deck), not only a tag that holds cards. */ made: boolean; /** Its cards that come up in Review: not paused. */ active: number; /** The last part of its name, said under its parent. */ label: string; depth: number; cards: number; fresh: number; due: number; sample: string }

/**
 * Your own decks as a tree, a parent before the decks inside it: every tag on
 * a card of yours (not a shared deck's) and every deck made by hand.
 */
export function ownDecks(cards: BrowsedCard[], made: string[]): OwnDeck[] {
  const mine = cards.filter((card) => card.made !== 'deck')
  const tags = [...new Set([...mine.flatMap((card) => card.tags), ...made])].sort()
  const parentOf = (tag: string): string | undefined => tags.filter((one) => tag.startsWith(`${one}-`)).sort((a, b) => b.length - a.length)[0]
  const depthOf = (tag: string): number => { const up = parentOf(tag); return up ? depthOf(up) + 1 : 0 }
  const now = Date.now()
  return tags.map((tag) => {
    const held = mine.filter((card) => inDeck(card.tags, tag))
    const up = parentOf(tag)
    return {
      tag, made: made.includes(tag), active: held.filter((one) => !one.paused).length, label: up ? tag.slice(up.length + 1) : tag, depth: depthOf(tag), cards: held.length,
      fresh: held.filter((one) => one.stage === 'new' && !one.paused).length,
      due: held.filter((one) => !one.paused && one.dueAt && Date.parse(one.dueAt) <= now).length,
      sample: held[0]?.prompt.replace(/!\[[^\]]*\]\([^)]*\)/g, '').trim() ?? ''
    }
  })
}

/** Your own decks, live. */
export function useOwnDecks(): OwnDeck[] | null {
  const cards = useLive(() => call<BrowsedCard[]>('cards:all'), null as BrowsedCard[] | null, [], ['item'])
  const made = useLive(haligtree.madeDecks, null as string[] | null, [], ['item'])
  return useMemo(() => (cards && made ? ownDecks(cards, made) : null), [cards, made])
}

/** The decks made by hand, live: what ⌘K and the pockets add to the tags that hold cards. */
export const useMadeDecks = (): string[] => useLive(haligtree.madeDecks, [] as string[], [], ['item'])

export const cardsSaid = (n: number): string => `${plural(n, 'card')}`

/**
 * Which deck a new card goes in, as a real control: a quiet button naming
 * the deck ("No deck" when none) that opens your decks as a tree, the one in
 * use ticked, and "New deck…" at the end, which turns into the new deck's name in place (NameInMenu): Enter makes it
 * and picks it, Esc leaves it unmade.
 */
export function DeckPick({ value, onChange }: { value: string; onChange: (tag: string) => void }): React.JSX.Element {
  const decks = useOwnDecks() ?? []
  const tag = deckTagOf(value)
  const [naming, setNaming] = useState(false)
  return (
    <DropdownMenu modal={false} onOpenChange={(open) => !open && setNaming(false)}>
      <DropdownMenuTrigger asChild>
        <button type="button" data-deck-pick={tag || 'none'}
          className="flex h-8 max-w-56 cursor-pointer items-center gap-1.5 rounded-md border border-foreground/10 px-2.5 text-control outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring max-sm:h-9">
          <span className="text-muted-foreground">Deck</span>
          <span className={`truncate ${tag ? 'text-foreground' : 'text-muted-foreground'}`}>{tag ? deckTitle(tag, decks.map((one) => one.tag)) : 'No deck'}</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className={`max-h-80 w-64 ${naming ? NAMING_MENU : ''}`} onEscapeKeyDown={(event) => naming && event.preventDefault()}>
        <DropdownMenuRadioGroup value={tag} onValueChange={(to) => (chime('tap'), onChange(to))}>
          <DropdownMenuRadioItem value="" data-deck-pick-to="none" className="cursor-pointer">No deck</DropdownMenuRadioItem>
          {decks.filter((deck) => deck.tag !== EXAMPLE_TAG).map((deck) => (
            <DropdownMenuRadioItem key={deck.tag} value={deck.tag} data-deck-pick-to={deck.tag} className="cursor-pointer" style={{ paddingLeft: `${2 + deck.depth * 0.75}rem` }}>
              <Layers aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{sayDeck(deck.label)}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        {naming ? (
          <NameInMenu data-deck-pick-naming mark={<Layers aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />} placeholder="Name the new deck" label="New deck name"
            onDone={() => setNaming(false)} onMake={(words) => void madeDeck(words).then((made) => made && onChange(made))} />
        ) : (
          <DropdownMenuItem data-deck-pick-new className="cursor-pointer" onSelect={(event) => (event.preventDefault(), chime('open'), setNaming(true))}>New deck…</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
