import type { CSSProperties } from 'react'

/**
 * The one drag handle every floating card wears, quick capture's (App.tsx, `data-grabber`): a 32x4 bar in muted
 * ink, centred just above the card's top edge, shown while the pointer is on the card, grown when pointed at or
 * held (main.css, `[data-grabber-card]`). Put inside the card (its `group`). `inside`: the window has no clear
 * room above the card (a glass sticky), so it sits just inside the top edge instead. `style` says how the window
 * is carried: a sticky's `--mf-drag` (main carries it, windows/sticky.tsx), or the system's drag region.
 */
export function Grabber({ label, inside = false, style }: { label: string; inside?: boolean; style?: CSSProperties }): React.JSX.Element {
  return (
    <div data-grabber data-grabber-card="" data-grabber-inside={inside ? '' : undefined} aria-label={label} style={style}>
      <span />
    </div>
  )
}
