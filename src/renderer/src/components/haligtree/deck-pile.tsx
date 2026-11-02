import { num } from '../../../../main/dates'

/**
 * How many cards show behind a deck's top card: none for one card, then one
 * each for 2, 3, 5, 10 and 20 or more, so a small deck and a big one look
 * plainly different, and 5 at most.
 */
export const pileEdges = (cards: number): number => [2, 3, 5, 10, 20].filter((at) => cards >= at).length

/**
 * The cards of a deck drawn as a square pile, for a deck tile (a `.mf-pile`
 * holding these and its face, `.mf-pile-top`). Each card behind sits 3px
 * right and 4px down from the one before, whole, in the same satin with its
 * own hairline, so the pile shows along the right and the bottom. A deck with
 * cards due has one card standing up 7px above the others, with how many
 * are due on its tab. The tile keeps room for the biggest pile and the tab,
 * so every tile lines up and nothing moves as a deck grows. Pointed at, the
 * top card lifts 2px and the cards behind fan out a touch (main.css).
 */
export function PileEdges({ cards, due }: { cards: number; due: number }): React.JSX.Element {
  const edges = pileEdges(cards)
  return (
    <>
      {/* The room the pile stands in: a square face, with space for the cards behind and the tab above. */}
      <span aria-hidden className="mf-pile-room" />
      {Array.from({ length: edges }, (_, at) => (
        <span key={at} aria-hidden data-pile-edge className="mf-pile-card mf-pile-edge" style={{ '--n': at + 1 } as React.CSSProperties} />
      ))}
      {due > 0 && (
        <span data-pile-proud className="mf-pile-card mf-pile-proud">
          <span data-pile-due={due} className="mf-pile-tab tabular-nums">{num(due)} due</span>
        </span>
      )}
    </>
  )
}
