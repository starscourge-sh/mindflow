import { useEmojiIcons } from '@/lib/icon-style'
import { Tag } from 'lucide-react'
import { tagHue } from '@/extensions/tokens'

/** A tag's colour as CSS for its icon and words: the one it was given, or the one its name picks (tagHue). */
export const tagTint = (tag: string, color?: string | null): string => `var(--tt-color-text-${tagHue(tag, color)})`

/**
 * A tag as a chip, the one way a tag is drawn as a thing of its own (a task's
 * tags, a note's): its colour's wash behind its colour's words, or with "Tag look:
 * Dot" an outline with its colour's dot before the name (main.css). `children`
 * follow the name, as a chip's × does.
 */
export function TagChip({ tag, color, className = '', children }: { tag: string; color?: string | null; className?: string; children?: React.ReactNode }): React.JSX.Element {
  const hue = tagHue(tag, color)
  return (
    <span data-tag-chip={tag} className={`flex items-center gap-0.5 rounded-full py-0.5 pr-1 pl-2 ${className}`}
      style={{ background: `var(--mf-chip-bg-${hue})`, color: `var(--mf-chip-ink-${hue})`, '--mf-tag-dot': `var(--tt-color-text-${hue})` } as React.CSSProperties}>
      #{tag}
      {children}
    </span>
  )
}

/**
 * A tag in a list: an outlined tag with its hole, in the tag's own colour, or
 * grey when it has none. `tint` is CSS when the colour is already worked out. One colour for all with
 * "Coloured icons" off (main.css).
 */
export function TagIcon({ tag, color, tint, className = 'size-4' }: { tag: string; color?: string | null; tint?: string; className?: string }): React.JSX.Element {
  // "Icons: Emoji": a label, the same for every tag (its name and chip still carry its colour).
  if (useEmojiIcons()) return <span aria-hidden className={`mf-emoji-icon flex shrink-0 items-center justify-center text-[0.8125rem] leading-none ${className}`}>🏷️</span>
  return <Tag aria-hidden className={`shrink-0 ${className}`} style={{ color: `var(--mf-icon-tint, ${tint ?? tagTint(tag, color)})` }} />
}
