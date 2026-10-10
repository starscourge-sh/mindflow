import { Tag } from 'lucide-react'
import { tagColors } from '@/extensions/tokens'

/** A tag's colour as CSS for its icon: the one it was given, or grey when none. */
export const tagTint = (tag: string, color?: string | null): string => {
  const own = color ?? tagColors.get(tag.toLowerCase())
  return own ? `var(--tt-color-text-${own})` : 'var(--muted-foreground)'
}

/**
 * A tag in a list: an outlined tag with its hole, in the tag's own colour, or
 * grey when it has none. `tint` is CSS when the colour is already worked out.
 */
export function TagIcon({ tag, color, tint, className = 'size-4' }: { tag: string; color?: string | null; tint?: string; className?: string }): React.JSX.Element {
  return <Tag aria-hidden className={`shrink-0 ${className}`} style={{ color: tint ?? tagTint(tag, color) }} />
}
