/** How many card edges show behind a deck's top card: none for one card, 1 for 2, one more each time the deck doubles, 5 at most. */
export const pileEdges = (cards: number): number => (cards < 2 ? 0 : Math.min(5, 1 + Math.floor(Math.log2(cards / 2))))

/**
 * The cards behind a deck tile, drawn as a square pile: satin edges under the
 * top card, more as the deck grows, and one card standing a little proud when
 * some are due. Put inside the tile (a `.mf-pile`), before its face; the edges
 * sit outside its box, so they take no room and move nothing. Pointed at, the
 * top card lifts 2px and the edges fan a touch (main.css, `.mf-pile`).
 */
export function PileEdges({ cards, due }: { cards: number; due: number }): React.JSX.Element {
  const edges = pileEdges(cards)
  return (
    <>
      {Array.from({ length: edges }, (_, at) => (
        <span key={at} aria-hidden data-pile-edge className="mf-pile-edge" style={{ '--n': at + 1, '--side': at % 2 ? 1 : -1 } as React.CSSProperties} />
      ))}
      {due > 0 && cards > 1 && <span aria-hidden data-pile-proud className="mf-pile-proud" />}
    </>
  )
}
