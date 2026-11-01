import { createContext, useContext, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { chime } from '@/lib/sound'

/** Where a tab puts its own controls (Pockets or List, the search, Display): the toolbar's right end. */
export const ToolbarSlot = createContext<HTMLElement | null>(null)

/** A tab's own controls, drawn in the toolbar's right end; nothing while the toolbar is not there. */
export function TabControls({ children }: { children: ReactNode }): React.JSX.Element | null {
  const slot = useContext(ToolbarSlot)
  return slot ? createPortal(children, slot) : null
}

/**
 * Review's one toolbar, drawn once above Decks, All cards and Stats and
 * kept whatever is open: the four ways cards come in on the left, the one
 * whose form is open pressed; the tab's own controls in one slot on the
 * right of the same row. Narrow, the row slides sideways instead of
 * breaking into a second row.
 */
export function ReviewToolbar({ onMake, onMany, onPicture, open, onSlot }: {
  onMake: () => void; onMany: () => void; onPicture: () => void
  /** The form that is out under it, if any. */ open: 'make' | 'many' | 'picture' | null
  onSlot: (slot: HTMLElement | null) => void
}): React.JSX.Element {
  const button = 'h-8 shrink-0 cursor-pointer px-3 max-sm:h-9 aria-pressed:border-foreground/25 aria-pressed:bg-accent aria-pressed:text-foreground'
  return (
    <div data-review-toolbar data-deck-top className="flex min-h-9 flex-nowrap items-center gap-2 overflow-x-auto pr-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)]">
      <Button variant="outline" size="sm" className={button} data-deck-make data-make-open aria-pressed={open === 'make'} onClick={() => (chime(open === 'make' ? 'fold' : 'open'), onMake())}>Make a card</Button>
      <Button variant="outline" size="sm" className={button} data-deck-paste data-paste-open aria-pressed={open === 'many'} onClick={() => (chime(open === 'many' ? 'fold' : 'open'), onMany())}>Add many at once</Button>
      <Button variant="outline" size="sm" className={button} data-deck-picture aria-pressed={open === 'picture'} onClick={onPicture}>From a picture</Button>
      <Button variant="outline" size="sm" className={button} data-deck-import onClick={() => (chime('open'), void window.api.importFrom('files'))}>Import<span className="font-normal text-muted-foreground">Anki or CSV</span></Button>
      <span ref={onSlot} data-review-tab-controls className="ml-auto flex shrink-0 items-center gap-2 pl-2 [&>*]:shrink-0" />
    </div>
  )
}
