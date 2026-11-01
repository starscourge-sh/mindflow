/**
 * The example deck a beginner can try from Review's empty Decks page: about
 * ten cards that teach spaced repetition by doing it. Its cards are scheduled
 * for real, but their reviews are never logged (review:grade skips them), so
 * nothing they do shows in your streak, heatmap or stats, and one click takes
 * the whole deck away. Every claim here is true of Review today: Again comes
 * back in ten minutes (main/haligtree.ts learning steps), grades are 1 to 4,
 * Space turns the card.
 */
export { EXAMPLE_TAG } from './name'

/** The picture card's drawing: how fast a memory fades, and how each review lifts it and slows the fall. Drawn here, ours to sell. */
export const FORGETTING_CURVE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 280" width="480" height="280" font-family="-apple-system, Helvetica, sans-serif" font-size="13">
<rect width="480" height="280" fill="#f6f1e7"/>
<g stroke="#8a7f72" stroke-width="1.5" fill="none">
<path d="M48 24 V236 H456"/>
</g>
<g fill="#5c544a">
<text x="40" y="34" text-anchor="end">all</text>
<text x="40" y="236" text-anchor="end">none</text>
<text x="252" y="262" text-anchor="middle">days since you learnt it</text>
<text x="14" y="130" transform="rotate(-90 14 130)" text-anchor="middle">how much you remember</text>
</g>
<path d="M48 28 C80 150 140 205 456 222" stroke="#b9ad9c" stroke-width="2" stroke-dasharray="5 5" fill="none"/>
<text x="452" y="212" fill="#8a7f72" text-anchor="end">never reviewed</text>
<path d="M48 28 C64 80 80 100 96 108 L96 28 C124 70 150 86 176 92 L176 28 C224 54 268 64 312 68 L312 28 C370 42 420 48 456 50" stroke="#a0522d" stroke-width="2.5" fill="none" stroke-linejoin="round"/>
<g fill="#a0522d"><circle cx="96" cy="28" r="4"/><circle cx="176" cy="28" r="4"/><circle cx="312" cy="28" r="4"/></g>
<text x="312" y="18" fill="#a0522d" text-anchor="middle">each dot is a review</text>
</svg>
`

/** The cards, asked in this order: what the deck is, then the ideas, then where your own cards come from. `picture` puts the drawing under the question. */
export const EXAMPLE_DECK: { question: string; answer: string; picture?: true }[] = [
  { question: 'What is this deck for?', answer: 'To show how Review works by doing it. Try to answer in your head, press Space to turn the card, then say how it went. It never counts in your own streak or stats.' },
  { question: 'Why answer in your head before you turn the card?', answer: 'Pulling an answer out of memory is what makes it stick. Reading the answer straight away feels like learning, but it is mostly recognising.' },
  { question: 'You knew a card well. When does it come back?', answer: 'Later: in a few days, then weeks, then months. Each right answer pushes the next one further out, so your time goes on what you are about to forget.' },
  { question: 'What does “Again” do?', answer: 'It brings the card back in about ten minutes, then tomorrow. Forgetting is not failing: it tells the app to ask you sooner.' },
  { question: 'Which grade do you press: Again, Hard, Good or Easy?', answer: 'Again: you could not recall it. Hard: you got it, barely. Good: normal effort. Easy: it came at once. The keys are 1, 2, 3 and 4.' },
  { question: 'What does this drawing show?', answer: 'Without review, a memory fades fast (the dotted line). Each review lifts it back up, and after each one it fades more slowly, so the gaps between reviews can grow.', picture: true },
  { question: 'Why do ten minutes a day beat an hour once a week?', answer: 'A short look each day catches each card just before it slips. Cramming once a week lets most of it fade first, and you spend the hour learning it again.' },
  { question: 'How much should one card ask?', answer: 'One thing. A card that asks for six things is hard to grade and easy to forget: make it six small cards.' },
  { question: 'You missed a day. What now?', answer: 'Nothing is lost. Study what is due today: the cards you missed are waiting there too.' },
  { question: 'Where do your own cards come from?', answer: '“Make a card” on Review’s Decks page, “Add many at once” for a list or a spreadsheet, or “Import” for a deck from Anki. Then take this deck away with “Remove the example deck”.' }
]
