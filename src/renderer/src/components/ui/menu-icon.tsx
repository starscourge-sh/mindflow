import { Children, type ReactNode } from 'react'
import { menuIcon } from './menu-icon-rules'
export { menuIcon }

/**
 * A menu line's children, its icon set in front: only when the line begins
 * with its words. A line that brings its own drawing (a theme's swatch, a
 * group's dot, an icon passed in) keeps it, and gets no second one.
 */
export function withMenuIcon(children: ReactNode): ReactNode {
  const parts = Children.toArray(children)
  let words = ''
  for (const part of parts) {
    if (typeof part !== 'string' && typeof part !== 'number') break
    words += String(part)
  }
  if (!words.trim()) return children
  const Icon = menuIcon(words)
  return [<Icon key="menu-icon" aria-hidden data-menu-icon="" className="size-3.5 shrink-0 text-muted-foreground" />, ...parts]
}

/** A menu line's drawing on its own, by its words, for a menu whose lines bring their own markup (the block menu). */
export function MenuGlyph({ label, small = false }: { label: string; /** At a menu row's size, beside a line that brings a hint under its words. */ small?: boolean }): React.JSX.Element {
  const Icon = menuIcon(label)
  return <Icon aria-hidden data-menu-icon="" className={`${small ? 'size-3.5' : 'size-4'} shrink-0 text-muted-foreground`} />
}
