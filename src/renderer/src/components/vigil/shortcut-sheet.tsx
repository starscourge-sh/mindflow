import { useEffect, useState, type ReactNode } from 'react'
import { chime, click } from '@/lib/sound'
import { findShortcuts, grouped, type Shortcut } from '@/lib/shortcuts'
import { Kbd, Typed, typing } from './ui'

/** What was searched for, marked where it appears in a label. */
export function Marked({ text, query }: { text: string; query: string }): ReactNode {
  const q = query.trim()
  if (!q) return text
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'i'))
  return parts.map((part, n) => (n % 2 ? <mark key={n} className="rounded-xs bg-[var(--tt-color-highlight-yellow)] text-inherit">{part}</mark> : part))
}

/** A shortcut's keys, one cap per key; keys pressed one after the other are spaced. */
export const Keys = ({ keys }: { keys: string }): React.JSX.Element => (
  <span className="flex shrink-0 items-center gap-1">{keys.split(' ').map((key, n) => <Kbd key={n}>{key}</Kbd>)}</span>
)

/** The shortcuts that match, in their groups: what Settings and the ? sheet both show. */
export function ShortcutList({ query, columns = false, quiet = false }: { query: string; columns?: boolean; quiet?: boolean }): React.JSX.Element | null {
  const found = findShortcuts(query)
  // Quiet: nothing at all, so a Settings search hides the whole island.
  if (!found.length && quiet) return null
  if (!found.length) return <p className="px-4 py-3 text-meta text-muted-foreground"><Typed text="No shortcut matches. Try what it does, like “search” or “task”." /></p>
  return (
    <div className={columns ? 'columns-1 gap-6 sm:columns-2' : ''}>
      {grouped(found).map(([group, list]) => (
        <section key={group} className="mb-4 break-inside-avoid">
          <h3 className="mb-1 px-1 text-meta font-medium text-muted-foreground">{group}</h3>
          {list.map((one: Shortcut) => (
            <div key={one.keys + one.does} data-setting className="flex items-center gap-3 rounded-md px-1 py-1 text-control">
              <span className="min-w-0 flex-1 text-foreground"><Marked text={one.does} query={query} /></span>
              <span className="hidden text-meta text-muted-foreground min-[28rem]:inline">{one.where}</span>
              <Keys keys={one.keys} />
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}

/**
 * ? anywhere you are not typing, or ⌘/ even while you are: every shortcut over the window, searchable,
 * gone again with Esc or another ?. The same list Settings shows.
 */
export function ShortcutSheet(): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      // ⌘/ works even while writing; ? when not, or in vim's normal mode,
      // where letters are commands rather than words.
      const command = event.metaKey && !event.ctrlKey && !event.altKey && (event.key === '/' || event.code === 'Slash')
      const vimAtRest = document.activeElement?.closest?.('[data-vim-mode]')?.getAttribute('data-vim-mode') === 'normal'
      const plain = event.key === '?' && !event.metaKey && !event.ctrlKey && !event.altKey && (!typing() || vimAtRest)
      if (!command && !plain) return
      event.preventDefault()
      chime('open')
      setOpen(true)
    }
    // The palette's "Keyboard shortcuts" asks for it by name.
    const onAsk = (): void => (chime('open'), setOpen(true))
    window.addEventListener('keydown', onKey)
    window.addEventListener('vigil:shortcuts', onAsk)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('vigil:shortcuts', onAsk)
    }
  }, [])
  const close = (): void => {
    chime('fold')
    setOpen(false)
    setQuery('')
  }
  // While open, Esc is the sheet's wherever focus is: caught first, on the
  // way down, so the box never hides its window with the sheet still up.
  useEffect(() => {
    if (!open) return
    const onEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      close()
    }
    window.addEventListener('keydown', onEscape, true)
    return () => window.removeEventListener('keydown', onEscape, true)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[8vh] animate-in fade-in-0 duration-150" onMouseDown={close}>
      <div
        role="dialog"
        aria-label="Keyboard shortcuts"
        className="flex max-h-[80vh] w-[min(44rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border bg-background shadow-(--mf-panel-shadow) animate-in zoom-in-95 duration-150"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <input
          autoFocus
          value={query}
          placeholder="Keyboard shortcuts: type to find one…"
          className="border-b bg-transparent px-4 py-3 text-heading outline-none"
          onChange={(event) => {
            click('soft')
            setQuery(event.target.value)
          }}
          onKeyDown={(event) => {
            if (event.key === '?' && !query) {
              event.preventDefault()
              event.stopPropagation()
              close()
            }
          }}
        />
        {/* Faded at an edge while there is more past it (mf-more). */}
        <div className="mf-more overflow-y-auto p-4">
          <ShortcutList query={query} columns />
        </div>
      </div>
    </div>
  )
}
