import { ReviewToolbar, ToolbarSlot } from './review-toolbar'
import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { chime } from '@/lib/sound'
import { useStepped } from '@/lib/nav'
import { ReviewView } from './review-view'
import { CardBrowser } from './card-browser'
import { StudySection } from './study-stats'
import { DeckShelf } from './deck-shelf'
import { PictureCards } from './picture-cards'
import { Page } from './ui'

/** Review's own pages: the decks (first, as Anki opens), every card, and how remembering goes; 'today' is studying, from "Study now". */
export type ReviewTab = 'today' | 'cards' | 'decks' | 'stats'
const TABS: { id: ReviewTab; label: string }[] = [
  { id: 'decks', label: 'Decks' },
  { id: 'cards', label: 'All cards' },
  { id: 'stats', label: 'Stats' }
]

/**
 * Review, opening on the decks with "Study now" beside its tabs, on the
 * page's line on the right where per-page actions sit. `focus` is a tag to
 * study, ":today" to study at once, or ":decks", ":cards", ":stats", ":paste" (⌘K).
 * `onFocus` hears where Review is now, in the same words: ":decks", ":cards",
 * ":stats", ":today", or the tag of the deck being studied. Each is a step
 * Back and Forward can return to; a new `focus` coming in moves Review there.
 */
export function ReviewArea({ focus, onOpen, onFocus }: { focus?: string; onOpen: (type: string, id: string) => void; onFocus?: (focus: string) => void }): React.JSX.Element {
  // A deck or topic studied from the shelf: studied on its tag (and the tags under it).
  const [studying, setStudying] = useState<string | null>(focus && !focus.startsWith(':') ? focus : null)
  // Many cards at once, or one new card, aimed at a deck: from a deck's shelf, or ⌘K's "New card in" (":new:biology").
  const [aim, setAim] = useState<{ deck: string | null; one: boolean } | null>(focus === ':paste' ? { deck: null, one: false } : focus?.startsWith(':new:') ? { deck: focus.slice(5), one: true } : null)
  // Just the cards an import or "Add many at once" brought in, shown in All cards.
  const [only, setOnly] = useState<string[] | null>(null)
  // "Make cards from a picture", aimed at a deck or none: open over the Decks page.
  const [picture, setPicture] = useState<{ deck: string | null } | null>(null)
  // The toolbar's right end, where each tab draws its own controls.
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  // Just the cards an import made, from its "Show the new cards" (":newest:" and how many it made).
  const [newest, setNewest] = useState<number | null>(focus?.startsWith(':newest:') ? Number(focus.slice(8)) || null : null)
  const [tab, setTab] = useState<ReviewTab>(newest || focus === ':cards' || focus === ':paste' || focus?.startsWith(':new:') ? 'cards' : focus === ':stats' ? 'stats' : focus === ':today' || (focus && !focus.startsWith(':')) ? 'today' : 'decks')
  // Each tab, and studying one deck, is a step of the pane's trail: Back and Forward go between them.
  useStepped(studying !== null ? `study:${studying}` : tab, (to) => (to.startsWith('study:') ? setStudying(to.slice(6)) : (setStudying(null), setTab(to as ReviewTab))))
  // Where Review is, said as a focus string, each time it changes.
  const here = tab === 'today' && studying ? studying : `:${tab}`
  const told = useRef(onFocus)
  told.current = onFocus
  useEffect(() => told.current?.(here), [here])
  // A focus from outside (Back, Forward, ⌘K) after the first: Review goes there, unless it is there already.
  const came = useRef(focus)
  useEffect(() => {
    if (came.current === focus) return
    came.current = focus
    if (!focus || focus === here) return
    if (focus === ':decks' || focus === ':cards' || focus === ':stats' || focus === ':today') return void (setStudying(null), setAim(null), setOnly(null), setNewest(null), setTab(focus.slice(1) as ReviewTab))
    if (!focus.startsWith(':')) return void (setStudying(focus), setTab('today'))
  }, [focus]) // eslint-disable-line react-hooks/exhaustive-deps
  const go = (to: ReviewTab): void => void ((tab !== to || picture) && (chime(to === 'today' ? 'riffle' : 'tap'), setStudying(null), setAim(null), setOnly(null), setNewest(null), setPicture(null), setTab(to)))
  // The tabs on the left of the page's line, where they stay put; "Study now", the page's one filled button, on the right.
  const tabs = (
    <span role="tablist" data-review-tabs className="flex h-8 items-center max-sm:h-9 rounded-lg border border-foreground/10 bg-accent/40 p-0.5 text-control">
      {TABS.map((one) => (
        <button key={one.id} type="button" role="tab" aria-selected={tab === one.id} data-review-tab={one.id} onClick={() => go(one.id)}
          className={`relative h-7 cursor-pointer max-sm:h-8 rounded-md px-3 transition-colors ${tab === one.id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
          {tab === one.id && <motion.span layoutId="review-tab" className="absolute inset-0 -z-10 rounded-md border border-foreground/15 bg-background shadow-sm" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
          {one.label}
        </button>
      ))}
    </span>
  )
  // Today's cards, in place of the old Today tab: pressed while you study.
  const studyNow = (
    <button type="button" data-review-tab="today" data-study-now aria-pressed={tab === 'today'} onClick={() => go('today')}
      className={`h-8 cursor-pointer rounded-md border px-3 text-control font-medium max-sm:h-9 transition-colors ${tab === 'today' ? 'border-foreground/15 bg-background text-foreground shadow-sm' : 'border-transparent bg-primary text-primary-foreground hover:bg-primary/90'}`}>Study now</button>
  )
  const show = (ids: string[]): void => (chime('open'), setStudying(null), setAim(null), setPicture(null), setOnly(ids), setTab('cards'))
  const formOpen: 'make' | 'many' | 'picture' | null = picture ? 'picture' : tab === 'cards' && aim ? (aim.one ? 'make' : 'many') : null
  // A form opened from the toolbar: Make a card and Add many open in All cards, under the toolbar; pressed again, they close.
  const openForm = (one: boolean): void => {
    setPicture(null)
    if (tab === 'cards' && aim && aim.one === one) return setAim(null)
    setOnly(null)
    setNewest(null)
    setAim({ deck: null, one })
    setTab('cards')
  }
  if (tab === 'cards' || tab === 'decks' || tab === 'stats')
    return (
      <Page title="Review" lead={tabs} actions={studyNow}>
        <ToolbarSlot.Provider value={slot}>
          <div data-review-page className="page-sheet mx-auto w-full">
            {/* The toolbar, the same on every tab and whatever is open: forms open under it. */}
            <div className="px-5 pt-4"><ReviewToolbar open={formOpen} onSlot={setSlot} onMake={() => openForm(true)} onMany={() => openForm(false)} onPicture={() => picture ? (chime('fold'), setPicture(null)) : (chime('open'), setPicture({ deck: null }))} /></div>
            {picture && <div className="px-5 pt-4"><PictureCards deck={picture.deck} onClose={() => (chime('fold'), setPicture(null))} onShow={show} /></div>}
            {tab === 'cards' && <CardBrowser key={aim ? `${aim.deck}:${aim.one}` : only ? `only:${only.length}` : ''} onOpen={onOpen} aim={aim} only={only} newest={only ? null : newest} onAll={() => (chime('undo'), setOnly(null), setNewest(null))} onShow={show} onAimDone={() => setAim(null)} />}
            {tab === 'decks' && <DeckShelf onOpen={onOpen} onStudy={(tag) => (setStudying(tag), setTab('today'))} onPaste={(deck, one = false) => (setPicture(null), setAim({ deck, one }), setTab('cards'))} onPicture={(deck) => (chime('open'), setPicture({ deck }))} />}
            {tab === 'stats' && <div data-review-stats className="px-5 pt-4 pb-20"><StudySection example={false} /></div>}
          </div>
        </ToolbarSlot.Provider>
      </Page>
    )
  return <ReviewView key={studying ?? ''} tag={studying ?? (focus && !focus.startsWith(':') ? focus : undefined)} lead={tabs} actions={studyNow} />
}
