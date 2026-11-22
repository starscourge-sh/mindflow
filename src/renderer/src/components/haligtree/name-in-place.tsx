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

/** On a menu while one of its rows is a name being typed: the rows under the pointer never take the focus from the name. */
export const NAMING_MENU = 'mf-naming-menu'

/**
 * A menu's "New …" row turned into the new thing's name where it was chosen, as Finder names a new folder: its mark,
 * then the field in the menu's own type. Enter or a click away makes it (`onMake`), Esc leaves it unmade; either way
 * `onDone` puts the row back. The menu holds open while it is typed: its content wears NAMING_MENU and keeps Esc for
 * the name (onEscapeKeyDown prevented). The sidebar's "New book…" and the deck picker's "New deck…" name things here,
 * never in a box with a title over a field.
 */
export function NameInMenu({ mark, placeholder, label, onMake, onDone, ...rest }: {
  mark: React.ReactNode
  placeholder: string
  label: string
  onMake: (words: string) => void
  onDone: () => void
} & React.ComponentProps<'span'>): React.JSX.Element {
  const made = useRef(false)
  const row = useRef<HTMLSpanElement>(null)
  const make = (words: string): void => {
    if (made.current || !words) return
    made.current = true
    onMake(words)
  }
  // The menu shut by a press outside it: what was typed is kept, as a click away keeps a name anywhere (a dev build's
  // practice unmount finds the field empty and makes nothing).
  useEffect(() => () => make(row.current?.querySelector('input')?.value.trim() ?? ''), []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <span ref={row} data-name-in-menu data-takes-keys className="flex items-center gap-2 rounded-sm px-2 py-1.5" {...rest}>
      {mark}
      <NameInPlace placeholder={placeholder} label={label}
        className="-mx-1 min-w-0 flex-1 rounded-[4px] bg-transparent px-1 text-control text-foreground outline-none ring-1 ring-ring/45 placeholder:text-muted-foreground"
        onDone={(words) => {
          // Esc (or nothing typed) is an answer too: the row going away after it makes nothing.
          if (words) make(words)
          else made.current = true
          onDone()
        }} />
    </span>
  )
}
