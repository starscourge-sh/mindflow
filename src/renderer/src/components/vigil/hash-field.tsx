import { forwardRef, useState, type InputHTMLAttributes, type KeyboardEvent } from 'react'
import { chime } from '@/lib/sound'

/**
 * A tag typed in: the "#" is drawn in the field, fixed, before the caret, so
 * nobody wonders whether to type it. Whatever comes in becomes a tag as the
 * notes read one (`#` then a letter, then letters, numbers, - and _): a "#"
 * typed or pasted is dropped, a space turns into a dash, capitals go small.
 * Anything else that cannot be in a tag is left out, and the field says why.
 */

/** Text as a tag: no "#", lower case, spaces as dashes, only what a tag may hold. */
export const asTag = (text: string): string =>
  text.replace(/#/g, '').trimStart().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '').slice(0, 40)

/** Why `text` cannot be kept as it is, in plain words; null when it can. */
export const tagProblem = (text: string): string | null => {
  const raw = text.replace(/#/g, '').trim()
  if (!raw) return null
  const tag = asTag(raw)
  if (!tag) return 'Letters, numbers, - and _ only'
  if (!/^[a-z]/.test(tag)) return 'A tag starts with a letter'
  if (tag !== raw.toLowerCase().replace(/\s+/g, '-')) return 'Letters, numbers, - and _ only'
  return null
}

/** Whether `tag` reads as a tag in the notes. */
export const isTag = (tag: string): boolean => /^[a-z][\w-]*$/.test(tag)

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string
  /** Called with the tag as it now reads, no "#". */
  onChange: (tag: string) => void
  /** The frame round the "#" and the words; the field inside has none of its own. */
  className?: string
  inputClassName?: string
  /** Where the hint goes when something typed was left out: under the field (default) or nowhere. */
  hint?: boolean
}

export const HashField = forwardRef<HTMLInputElement, Props>(function HashField({ value, onChange, className = '', inputClassName = '', hint = true, placeholder = 'tag', ...rest }, ref) {
  const [why, setWhy] = useState<string | null>(null)
  return (
    <span className={`relative inline-flex items-center ${className}`}>
      {/* Drawn, never typed: the caret always sits after it. */}
      <span aria-hidden data-hash className="pointer-events-none shrink-0 select-none pr-px text-muted-foreground">#</span>
      <input ref={ref} {...rest} value={value} placeholder={placeholder} spellCheck={false} autoCapitalize="off" autoCorrect="off"
        className={`min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground ${inputClassName}`}
        onChange={(event) => {
          const raw = event.target.value
          setWhy(tagProblem(raw))
          onChange(asTag(raw))
        }} />
      {hint && why && (
        <span role="status" data-tag-hint className="absolute top-[calc(100%+4px)] left-0 z-10 rounded-md bg-popover px-2 py-1 text-[0.8125rem] font-medium whitespace-nowrap text-foreground shadow-(--mf-panel-shadow)">
          {why}
        </span>
      )}
    </span>
  )
})

/** The frame of the app's own Input (ui/input.tsx), worn round the "#" and the field. */
export const INPUT_FRAME = 'min-w-0 rounded-md border border-input bg-input/20 px-2 py-0.5 text-sm transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30 md:text-xs/relaxed dark:bg-input/30'

/**
 * A tag field that answers Enter: `onEnter` gets the tag as it reads (empty
 * when the field is), or a "nope" when it cannot be one.
 */
export function TagEntry({ initial = '', onEnter, onKeyDown, ...rest }: Omit<Props, 'value' | 'onChange'> & { initial?: string; onEnter: (tag: string, event: KeyboardEvent<HTMLInputElement>) => void }): React.JSX.Element {
  const [tag, setTag] = useState(() => asTag(initial))
  return (
    <HashField {...rest} value={tag} onChange={setTag}
      onKeyDown={(event) => {
        onKeyDown?.(event)
        if (event.key !== 'Enter') return
        const kept = tag.replace(/-+$/, '')
        if (kept && !isTag(kept)) return void chime('nope')
        onEnter(kept, event)
      }} />
  )
}
