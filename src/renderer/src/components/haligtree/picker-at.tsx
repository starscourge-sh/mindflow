import { useMemo } from 'react'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'

/**
 * A picker that answers one question (which folder, which note) drawn beside what asked it, the way the app's other
 * popovers are: under the row right-clicked, the chip pressed, the row the cursor is on. Never a sheet over a dimmed
 * window (the gate's first rule). Where it is asked from is read as the press happens (`pressedAt`), since a menu's
 * line is gone by the time its choice runs.
 */
let pressed: { el: Element; box: DOMRect } | null = null
const note = (event: Event): void => {
  const el = (event.target as Element | null)?.closest?.('[data-row], [data-side-row], [data-place-chip], [data-folder-item], [data-all-folder], [data-folder-open], button, [role="button"]')
  // A line of a menu goes as its choice runs: what opened the menu stays the place.
  if (!el || el.closest('[role="menu"], [data-slot="dropdown-menu-content"], [data-slot="context-menu-content"]')) return
  pressed = { el, box: el.getBoundingClientRect() }
}
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', note, true)
  window.addEventListener('contextmenu', note, true)
}

/** Where a picker asked for now should stand: what was given, else what was last pressed, else the open page's place chip. */
export function placeFor(given?: Element | null): DOMRect {
  const el = given ?? (pressed?.el.isConnected ? pressed.el : null)
  if (el?.isConnected) return el.getBoundingClientRect()
  if (pressed) return pressed.box
  const chip = document.querySelector('[data-place-chip]')
  if (chip) return chip.getBoundingClientRect()
  return new DOMRect(innerWidth / 2 - 200, 96, 400, 1)
}

export function PickerAt({ at, label, onClose, children }: { at: DOMRect; label: string; onClose: () => void; children: React.ReactNode }): React.JSX.Element {
  const anchor = useMemo(() => ({ current: { getBoundingClientRect: () => at } }), [at])
  return (
    <Popover open onOpenChange={(open) => !open && onClose()}>
      <PopoverAnchor virtualRef={anchor} />
      <PopoverContent role="dialog" aria-label={label} align="start" className="w-[min(26rem,calc(100vw-24px))] gap-0 overflow-hidden p-0" onCloseAutoFocus={(event) => event.preventDefault()}>
        {children}
      </PopoverContent>
    </Popover>
  )
}
