import { useMemo, useRef } from 'react'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { PEEK_SURFACE } from './peek'

/**
 * A picker that answers one question (which folder, which note), drawn as the sidebar's own cards are (peek.tsx: the
 * same width, corners, padding and material, beside what it is about): to the right of what asked it, its top level
 * with that row, flipped to the left only where there is no room. Never a sheet over a dimmed window (the gate's
 * first rule), never a wide box under a row (the user, 19 Nov: "does not feel like same app"). Where it is asked
 * from is read as the press happens (`pressedAt`), since a menu's line is gone by the time its choice runs.
 */
let pressed: { el: Element; box: DOMRect; x: number | null } | null = null
const note = (event: Event): void => {
  const el = (event.target as Element | null)?.closest?.('[data-row], [data-side-row], [data-place-chip], [data-folder-item], [data-all-folder], [data-folder-open], button, [role="button"]')
  // A line of a menu goes as its choice runs: what opened the menu stays the place.
  if (!el || el.closest('[role="menu"], [data-slot="dropdown-menu-content"], [data-slot="context-menu-content"]')) return
  pressed = { el, box: el.getBoundingClientRect(), x: event instanceof MouseEvent ? event.clientX : null }
}
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', note, true)
  window.addEventListener('contextmenu', note, true)
}

/** A wide row (a list's, the whole page across) is stood beside where it was pressed, or beside its first words. */
const besideOf = (box: DOMRect, x: number | null): DOMRect =>
  box.width <= 360 ? box : new DOMRect(x ?? box.left + 280, box.top, 1, box.height)

/** Where a picker asked for now should stand: what was given, else what was last pressed, else the open page's place chip. */
export function placeFor(given?: Element | null): DOMRect {
  const el = given ?? (pressed?.el.isConnected ? pressed.el : null)
  const x = el && el === pressed?.el ? pressed.x : null
  if (el?.isConnected) return besideOf(el.getBoundingClientRect(), x)
  if (pressed) return besideOf(pressed.box, pressed.x)
  const chip = document.querySelector('[data-place-chip]')
  if (chip) return chip.getBoundingClientRect()
  return new DOMRect(innerWidth / 2 - 136, 96, 1, 1)
}

export function PickerAt({ at, label, onClose, children }: { at: DOMRect; label: string; onClose: () => void; children: React.ReactNode }): React.JSX.Element {
  const anchor = useMemo(() => ({ current: { getBoundingClientRect: () => at } }), [at])
  const box = useRef<HTMLDivElement>(null)
  return (
    <Popover open onOpenChange={(open) => !open && onClose()}>
      <PopoverAnchor virtualRef={anchor} />
      {/* The sidebar card's own placing too (peek.tsx `Peek`): to the right, 10px off, clear of the title bar. */}
      <PopoverContent ref={box} role="dialog" aria-label={label} side="right" align="start" sideOffset={10} className={`${PEEK_SURFACE} gap-0 overflow-hidden`} onCloseAutoFocus={(event) => event.preventDefault()}
        // The menu it was chosen from hands the keys back to its row as it shuts, after the picker took them: that is
        // no leaving (a press outside still is), so the keys come straight back to the picker's own field.
        onFocusOutside={(event) => (event.preventDefault(), box.current?.querySelector<HTMLElement>('input')?.focus({ preventScroll: true }))}>
        {children}
      </PopoverContent>
    </Popover>
  )
}
