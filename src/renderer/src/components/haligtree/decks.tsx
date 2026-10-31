import { useMemo } from 'react'
import { chime } from '@/lib/sound'
import { call, haligtree, useLive } from '@/lib/haligtree'
import { num } from '../../../../main/dates'
import { ask, toast } from './ui'
import type { BrowsedCard } from './card-browser'

/**
 * Your own decks. In Haligtree a deck is a tag your cards share: there is no
 * second system. In Review a tag that holds cards is called a deck; a deck
 * made by hand (New deck) is one before it holds a card. "Biology/Cells" (or
 * "Biology::Cells") is #biology-cells, a deck inside #biology.
 */

/** A deck's name as its #tag: "Biology/Cells", "Spanish::Verbs" or "spanish verbs" become #biology-cells, #spanish-verbs. */
export const deckTagOf = (words: string): string =>
  words.trim().toLowerCase().replace(/^#/, '').split(/::|\//).map((part) => part.replace(/[^\p{L}\p{M}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '')).filter(Boolean).join('-')

/** Under a deck: the deck itself, or one inside it. */
export const inDeck = (tags: string[], deck: string): boolean => tags.some((one) => one === deck || one.startsWith(`${deck}-`))

/**
 * Ask for a new deck's name in place, make it, and say so with Undo.
 * Resolves to its tag, or null when let go. `inside` names it under a deck.
 */
export async function makeDeck(inside?: string): Promise<string | null> {
  const words = await ask(inside ? `A deck inside #${inside}` : 'Name the new deck', inside ? 'Cells' : 'Biology, or Biology/Cells for one inside it')
  const tag = words && deckTagOf(inside ? `${inside}/${words}` : words)
  if (!tag) return null
  await haligtree.setTag(tag, { deck: true })
  chime('noted')
  toast(`Deck #${tag} made`, () => void haligtree.setTag(tag, { deck: false }).then(() => chime('undo')))
  return tag
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

export const cardsSaid = (n: number): string => `${num(n)} ${n === 1 ? 'card' : 'cards'}`
