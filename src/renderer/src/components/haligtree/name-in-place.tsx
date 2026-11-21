import { useEffect, useRef } from 'react'
import { still } from '@/lib/motion'

/**
 * A name typed where the thing lives, as Finder names a new folder: the field
 * stands in the row or tile in that row's own type, its words picked so typing
 * replaces them. Enter keeps, a click away keeps, Esc leaves it as it was
 * (null). Answers once. Writing's folders and groups, the sidebar's folders,
 * Review's decks and Settings' books all name things with this one field.
 */
export function NameInPlace({ initial = '', suggested, placeholder, label, onDone, className, onInput, ...rest }: {
  initial?: string
  /** A better first name, arrived while the field is open: taken only if nothing has been typed; Esc still keeps `initial`. */
  suggested?: string | null
  placeholder: string
  label: string
  /** The words on Enter or a click away (maybe empty), null on Esc. */
  onDone: (words: string | null) => void
  className?: string
} & Omit<React.ComponentProps<'input'>, 'onBlur' | 'onKeyDown' | 'defaultValue' | 'onFocus'>): React.JSX.Element {
  const settled = useRef(false)
  const field = useRef<HTMLInputElement>(null)
  // A key pressed in the field: from then the words are yours, and a suggestion arriving late is dropped, even if what
  // you typed reads as `initial` again.
  const touched = useRef(false)
  useEffect(() => {
    const el = field.current
    if (!el || !suggested || touched.current || settled.current || el.value !== initial) return
    el.value = suggested
    el.select()
    if (!still()) el.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' })
  }, [suggested]) // eslint-disable-line react-hooks/exhaustive-deps
  const done = (words: string | null): void => {
    if (settled.current) return
    settled.current = true
    onDone(words)
  }
  return (
    <input
      ref={field}
      autoFocus
      data-name-in-place
      defaultValue={initial}
      aria-label={label}
      placeholder={placeholder}
      onFocus={(event) => event.currentTarget.select()}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onInput={(event) => ((touched.current = true), onInput?.(event))}
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
