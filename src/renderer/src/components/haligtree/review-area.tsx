import { ReviewToolbar, ToolbarCompact, ToolbarSlot } from './review-toolbar'
import { useEffect, useRef, useState } from 'react'
import { TabChips } from './tab-chips'
import { chime } from '@/lib/sound'
import { GraduationCap } from 'lucide-react'
import { useStepped } from '@/lib/nav'
import { ReviewView } from './review-view'
import { CardBrowser, cardFront } from './card-browser'
import { StudySection } from './study-stats'
import { DeckShelf, NO_PLACE, placeOf, placeWords, type DeckPlace } from './deck-shelf'
import { PictureCards } from './picture-cards'
import { FoldItem, MenuRows, Page } from './ui'
import { deckTitle } from './decks'
import { plural } from '../../../../main/dates'

/** The cards a "Show" picked (an import's, a picture's), by the word their step keeps: Back and Forward bring the same ones. */
const shownLists = new Map<string, string[]>()
const shownKey = new WeakMap<string[], string>()
/** Review's place in a step, in words for Back's and Forward's menus and swipe back: "All cards", "Studying Biology". */
export function reviewPlaceName(tab: string | undefined): string | null {
  if (!tab) return null
  if (tab.startsWith('study:')) return tab.length > 6 ? `Studying ${deckTitle(tab.slice(6))}` : 'Study now'
  const said = new URLSearchParams(tab.split('?')[1] ?? '')
  if (tab.startsWith('cards')) {
    const card = said.get('card')
    if (card) return cardFront(card) || 'A card'
    const just = shownLists.get(said.get('just') ?? '')?.length
    const newest = Number(said.get('newest'))
    return just ? plural(just, 'card') : newest ? plural(newest, 'newest card') : 'All cards'
  }
  if (tab.startsWith('decks')) {
    const { inside, pictures, links } = placeOf(tab)
    return pictures ? `${pictures}: pictures` : links ? `${links}: links` : inside.length ? `Decks › ${((one) => (/[A-Z ]/.test(one) ? one : deckTitle(one)))(inside[inside.length - 1])}` : 'Decks'
  }
  return tab === 'stats' ? 'Stats' : tab === 'today' ? 'Study now' : null
}

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
  const [compact, setCompact] = useState(false)
  // Just the cards an import made, from its "Show the new cards" (":newest:" and how many it made).
  const [newest, setNewest] = useState<number | null>(focus?.startsWith(':newest:') ? Number(focus.slice(8)) || null : null)
  const [tab, setTab] = useState<ReviewTab>(newest || focus === ':cards' || focus === ':paste' || focus?.startsWith(':new:') ? 'cards' : focus === ':stats' ? 'stats' : focus === ':today' || (focus && !focus.startsWith(':')) ? 'today' : 'decks')
  // What is open on the Decks tab: a deck's sub-decks, a shared deck's pictures or its links.
  const [place, setPlace] = useState<DeckPlace>(NO_PLACE)
  // The card open for editing in All cards: each one opened is a step too.
  const [card, setCard] = useState<string | null>(null)
  // Each tab, studying one deck, and each thing opened on the Decks tab is a step of the pane's trail:
  // Back and Forward go between them, and land on exactly what was on show.
  // All cards, and what is on show there: just the cards a "Show" picked (or an import's newest), the card open.
  const cardWords = (): string => {
    const words = new URLSearchParams()
    const just = only && shownKey.get(only)
    if (just) words.set('just', just)
    else if (newest) words.set('newest', String(newest))
    if (card) words.set('card', card)
    return words.size ? `cards?${words}` : 'cards'
  }
  useStepped(studying !== null ? `study:${studying}` : tab === 'decks' ? placeWords(place) : tab === 'cards' ? cardWords() : tab, (to) => {
    if (to.startsWith('study:')) return void (setStudying(to.slice(6)), setTab('today'))
    setStudying(null)
    if (to.startsWith('cards')) {
      const said = new URLSearchParams(to.split('?')[1] ?? '')
      // A "Show" from before a relaunch is not kept: all the cards, as its "Show all" would.
      return void (setPlace(NO_PLACE), setCard(said.get('card')), setOnly(shownLists.get(said.get('just') ?? '') ?? null), setNewest(Number(said.get('newest')) || null), setTab('cards'))
    }
    setCard(null)
    setOnly(null)
    setNewest(null)
    setPlace(to.startsWith('decks') ? placeOf(to) : NO_PLACE)
    setTab((to.startsWith('decks') ? 'decks' : to) as ReviewTab)
  })
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
  const go = (to: ReviewTab): void => void ((tab !== to || picture || studying) && (chime(to === 'today' ? 'riffle' : 'tap'), setStudying(null), setAim(null), setOnly(null), setNewest(null), setPicture(null), setPlace(NO_PLACE), setCard(null), setTab(to)))
  // The tabs on the left of the page's line, where they stay put; "Study now", the page's one filled button, on the right.
  const tabs = (
    // The one tab switch (tab-chips.tsx); go() hears every press, so a tab pressed again still shuts a form open over it.
    <span data-review-tabs className="flex">
      <TabChips name="review" data="review-tab" quiet tabs={TABS.map((one) => ({ value: one.id, label: one.label }))} value={tab} onChange={go} />
    </span>
  )
  // Today's cards, in place of the old Today tab: pressed while you study.
  const studyNow = (
    <>
    <MenuRows><FoldItem icon={GraduationCap} label="Study now" on={tab === 'today'} onSelect={() => go('today')} /></MenuRows>
    <button type="button" data-review-tab="today" data-study-now aria-pressed={tab === 'today'} onClick={() => go('today')}
      className={`h-8 cursor-pointer rounded-md border px-3 text-control font-medium transition-colors ${tab === 'today' ? 'border-foreground/15 bg-background text-foreground shadow-sm' : 'border-transparent bg-primary text-primary-foreground hover:bg-primary/90'}`}>Study now</button>
    </>
  )
  // Just these cards in All cards, as a step of its own: Back returns to where "Show" was pressed.
  const show = (ids: string[]): void => {
    const key = Date.now().toString(36)
    shownLists.set(key, ids)
    shownKey.set(ids, key)
    chime('open'), setStudying(null), setAim(null), setPicture(null), setCard(null), setOnly(ids), setTab('cards')
  }
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
        <ToolbarSlot.Provider value={slot}><ToolbarCompact.Provider value={compact}>
          <div data-review-page={tab} className="page-sheet mx-auto w-full">
            {/* The toolbar, the same on every tab and whatever is open: forms open under it. */}
            <div className="px-5 pt-4"><ReviewToolbar open={formOpen} onSlot={setSlot} onCompact={setCompact} onMake={() => openForm(true)} onMany={() => openForm(false)} onPicture={() => picture ? (chime('fold'), setPicture(null)) : (chime('open'), setAim(null), setPicture({ deck: null }))} /></div>
            {picture && <div className="px-5 pt-4"><PictureCards deck={picture.deck} onClose={() => (chime('fold'), setPicture(null))} onShow={show} /></div>}
            {/* One form at a time: "From a picture" opening shuts Make a card and Add many, even one opened from inside the list. */}
            {tab === 'cards' && <CardBrowser open={card} onOpenCard={setCard} key={(aim ? `${aim.deck}:${aim.one}` : only ? `only:${only.length}` : '') + (picture ? ':picture' : '')} onOpen={onOpen} aim={aim} only={only} newest={only ? null : newest} onAll={() => (chime('undo'), setOnly(null), setNewest(null))} onShow={show} onAimDone={() => setAim(null)} />}
            {tab === 'decks' && <DeckShelf place={place} onPlace={setPlace} onOpen={onOpen} onStudy={(tag) => (setStudying(tag), setTab('today'))} onPaste={(deck, one = false) => (setPicture(null), setAim({ deck, one }), setTab('cards'))} onPicture={(deck) => (chime('open'), setAim(null), setPicture({ deck }))} onShow={show} />}
            {tab === 'stats' && <div data-review-stats className="px-5 pt-4 pb-20"><StudySection /></div>}
          </div>
        </ToolbarCompact.Provider></ToolbarSlot.Provider>
      </Page>
    )
  // A deck's study is left for today's cards ("Back to today’s cards", at its end too) or, with Esc, for the decks it was
  // picked from: each a step, so Back returns to the deck.
  return <ReviewView key={studying ?? ''} tag={studying ?? undefined} lead={tabs} actions={studyNow}
    onLeave={studying !== null ? (to) => (setStudying(null), setTab(to)) : undefined} />
}
