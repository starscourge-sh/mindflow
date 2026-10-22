import { Tag } from 'lucide-react'
import { tagHue } from '@/extensions/tokens'

/** A tag's colour as CSS for its icon and words: the one it was given, or the one its name picks (tagHue). */
export const tagTint = (tag: string, color?: string | null): string => `var(--tt-color-text-${tagHue(tag, color)})`

/**
 * A tag as a chip, the one way a tag is drawn as a thing of its own (a task's
 * tags, a note's): its colour's wash behind its colour's words. `children`
 * follow the name, as a chip's × does.
 */
export function TagChip({ tag, color, className = '', children }: { tag: string; color?: string | null; className?: string; children?: React.ReactNode }): React.JSX.Element {
  const hue = tagHue(tag, color)
  return (
    <span data-tag-chip={tag} className={`flex items-center gap-0.5 rounded-full py-0.5 pr-1 pl-2 ${className}`}
      style={{ background: `var(--tt-color-highlight-${hue})`, color: `var(--tt-color-text-${hue})` }}>
      #{tag}
      {children}
    </span>
  )
}

/**
 * A tag in a list: an outlined tag with its hole, in the tag's own colour, or
 * grey when it has none. `tint` is CSS when the colour is already worked out.
 */
export function TagIcon({ tag, color, tint, className = 'size-4' }: { tag: string; color?: string | null; tint?: string; className?: string }): React.JSX.Element {
  return <Tag aria-hidden className={`shrink-0 ${className}`} style={{ color: tint ?? tagTint(tag, color) }} />
}
