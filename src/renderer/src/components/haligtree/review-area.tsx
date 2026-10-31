import { useState } from 'react'
import { motion } from 'motion/react'
import { chime } from '@/lib/sound'
import { ReviewView } from './review-view'
import { CardBrowser } from './card-browser'
import { StudySection } from './study-stats'
import { DeckShelf } from './deck-shelf'
import { Page } from './ui'

/** Review's own pages: today's cards, every card, the shared decks on their shelf, and how remembering goes. */
export type ReviewTab = 'today' | 'cards' | 'decks' | 'stats'
const TABS: { id: ReviewTab; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'cards', label: 'All cards' },
  { id: 'decks', label: 'Decks' },
  { id: 'stats', label: 'Stats' }
]

/**
 * Review, with a tab for each of its pages on the page's line, on the right
 * where per-page actions sit: today's cards, or the browser of every card.
 * `focus` is a tag to study, or ":cards" to open on the browser (⌘K).
 */
export function ReviewArea({ focus, onOpen }: { focus?: string; onOpen: (type: string, id: string) => void }): React.JSX.Element {
  const [tab, setTab] = useState<ReviewTab>(focus === ':cards' || focus === ':paste' ? 'cards' : focus === ':stats' ? 'stats' : focus === ':decks' ? 'decks' : 'today')
  const tabs = (
    <span role="tablist" data-review-tabs className="flex h-8 items-center rounded-lg border border-foreground/10 bg-accent/40 p-0.5 text-control">
      {TABS.map((one) => (
        <button key={one.id} type="button" role="tab" aria-selected={tab === one.id} data-review-tab={one.id}
          onClick={() => void (tab !== one.id && (chime('tap'), setTab(one.id)))}
          className={`relative h-7 cursor-pointer rounded-md px-3 transition-colors ${tab === one.id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
          {tab === one.id && <motion.span layoutId="review-tab" className="absolute inset-0 -z-10 rounded-md border border-foreground/15 bg-background shadow-sm" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
          {one.label}
        </button>
      ))}
    </span>
  )
  if (tab === 'cards')
    return (
      <Page title="Review" actions={tabs}>
        <div className="page-sheet mx-auto w-full"><CardBrowser onOpen={onOpen} pasting={focus === ':paste'} /></div>
      </Page>
    )
  if (tab === 'decks')
    return (
      <Page title="Review" actions={tabs}>
        <div className="page-sheet mx-auto w-full"><DeckShelf onOpen={onOpen} /></div>
      </Page>
    )
  if (tab === 'stats')
    return (
      <Page title="Review" actions={tabs}>
        <div data-review-stats className="max-w-[calc(62ch+2.5rem)] px-5 pb-20"><StudySection example={false} /></div>
      </Page>
    )
  return <ReviewView tag={focus && !focus.startsWith(':') ? focus : undefined} actions={tabs} />
}
