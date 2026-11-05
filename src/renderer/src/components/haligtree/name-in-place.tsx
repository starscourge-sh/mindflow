import { useRef } from 'react'

/**
 * A name typed where the thing lives, as Finder names a new folder: the field
 * stands in the row or tile in that row's own type, its words picked so typing
 * replaces them. Enter keeps, a click away keeps, Esc leaves it as it was
 * (null). Answers once. Writing's folders and groups, the sidebar's folders,
 * Review's decks and Settings' books all name things with this one field.
 */
export function NameInPlace({ initial = '', placeholder, label, onDone, className, ...rest }: {
  initial?: string
  placeholder: string
  label: string
  /** The words on Enter or a click away (maybe empty), null on Esc. */
  onDone: (words: string | null) => void
  className?: string
} & Omit<React.ComponentProps<'input'>, 'onBlur' | 'onKeyDown' | 'defaultValue' | 'onFocus'>): React.JSX.Element {
  const settled = useRef(false)
  const done = (words: string | null): void => {
    if (settled.current) return
    settled.current = true
    onDone(words)
  }
  return (
    <input
      autoFocus
      data-name-in-place
      defaultValue={initial}
      aria-label={label}
      placeholder={placeholder}
      onFocus={(event) => event.currentTarget.select()}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Enter') (event.preventDefault(), done(event.currentTarget.value.trim()))
        if (event.key === 'Escape') (event.preventDefault(), done(null))
      }}
      onBlur={(event) => done(event.target.value.trim())}
      className={className}
      {...rest}
    />
  )
}
