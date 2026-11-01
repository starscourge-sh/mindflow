import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { chime } from '@/lib/sound'

/**
 * Review's one toolbar, the same on Decks, All cards and Stats: the four ways
 * cards come in on the left, in this order and this look, as Anki's "Create
 * Deck" and "Import File" always stand; what belongs to the tab alone (New
 * deck and Pockets or List, the search and Display) on the right.
 */
export function ReviewToolbar({ onMake, onMany, onPicture, make, many, right, deckTop = false }: {
  onMake: () => void; onMany: () => void; onPicture: () => void
  /** Extra marks on the two buttons a tab opens in place (All cards: pressed while its form is out). */
  make?: Record<string, unknown>; many?: Record<string, unknown>
  right?: ReactNode; /** The Decks tab's own name for the row, kept for its probes. */ deckTop?: boolean
}): React.JSX.Element {
  const button = 'h-8 cursor-pointer px-3 max-sm:h-9'
  return (
    <div data-review-toolbar {...(deckTop ? { 'data-deck-top': '' } : {})} className="flex min-h-9 flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" className={button} data-deck-make {...make} onClick={() => (chime('open'), onMake())}>Make a card</Button>
      <Button variant="outline" size="sm" className={button} data-deck-paste {...many} onClick={() => (chime('open'), onMany())}>Add many at once</Button>
      <Button variant="outline" size="sm" className={button} data-deck-picture onClick={onPicture}>From a picture</Button>
      <Button variant="outline" size="sm" className={button} data-deck-import onClick={() => (chime('open'), void window.api.importFrom('files'))}>Import<span className="font-normal text-muted-foreground">Anki or CSV</span></Button>
      <span className="flex-1" />
      {right}
    </div>
  )
}
