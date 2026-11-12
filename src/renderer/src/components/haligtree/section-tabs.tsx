import { useRef, type ComponentType, type CSSProperties } from 'react'
import { chime, click } from '@/lib/sound'
import { spring } from '@/lib/motion'
import { Search as SearchIcon } from '@/components/ui/icons'
import { Highlight, useChosen, useFluidHover, Weighted } from './glide'
import { Kbd, Tip } from './ui'

export type SectionTab = { title: string; icon: ComponentType<{ className?: string; style?: CSSProperties }>; tint: string }

/**
 * A page's sections down the left, the way Raycast's settings list them, one
 * on the right at a time: Settings and What Haligtree can do. Each icon is
 * drawn like the main sidebar's, the theme's own hue softened until it is the
 * one you are on. The light glides to the row nearest the pointer, and the
 * section on show is one fill that travels to the next. ↑ ↓ (or j k) move
 * between them. Under 44rem of page it folds to its icons.
 */
export function SectionTabs({ sections, section, pick, searching = false, label, className = '' }: {
  sections: SectionTab[]
  section: string
  pick: (title: string) => void
  /** A search shows every section's matches: none of them is the one on show. */
  searching?: boolean
  label: string
  className?: string
}): React.JSX.Element {
  const list = useRef<HTMLElement>(null)
  const hover = useFluidHover(list, { items: '[data-section]' })
  const chosen = useChosen(list, '[data-section][aria-current="page"]', `${section}:${searching}`)
  return (
    <nav
      ref={list}
      {...hover.handlers}
      data-sections
      aria-label={label}
      className={`relative isolate flex flex-col gap-px overflow-y-auto px-2 ${className}`}
      onKeyDown={(event) => {
        const by = { ArrowDown: 1, j: 1, ArrowUp: -1, k: -1 }[event.key]
        if (!by || event.metaKey || event.ctrlKey || event.altKey) return
        event.preventDefault()
        const at = sections.findIndex((one) => one.title === section)
        const next = sections[Math.max(0, Math.min(sections.length - 1, at + by))]
        pick(next.title)
        event.currentTarget.querySelector<HTMLElement>(`[data-section="${next.title}"]`)?.focus()
      }}
    >
      <Highlight chosen={chosen} travel={spring.moderate} className="bg-accent" />
      <Highlight light={hover.light} />
      {sections.map((one) => {
        const on = !searching && section === one.title
        return (
          <Tip key={one.title} label={one.title}>
            <button
              type="button"
              data-section={one.title}
              aria-current={on ? 'page' : undefined}
              onClick={() => pick(one.title)}
              className={`group flex items-center justify-center gap-2.5 rounded-md p-1.5 text-left text-body transition-colors duration-80 @[44rem]/page:justify-start @[44rem]/page:px-2 ${on ? 'text-foreground' : 'text-foreground/80'}`}
            >
              <one.icon
                className={`size-4 shrink-0 transition-colors duration-80 ${on ? 'text-[var(--tint)]' : 'text-[color-mix(in_oklab,var(--tint)_55%,var(--muted-foreground))] group-hover:text-[var(--tint)] group-data-[fluid-hover-active]:text-[var(--tint)]'}`}
                style={{ '--tint': `var(--tt-color-text-${one.tint})` } as CSSProperties}
              />
              <Weighted on={on} className="hidden @[44rem]/page:inline-grid">{one.title}</Weighted>
            </button>
          </Tip>
        )
      })}
    </nav>
  )
}

/** The search over a page's sections: rows that do not match go. Esc empties it. */
export function SectionSearch({ query, setQuery, className = '' }: { query: string; setQuery: (query: string) => void; className?: string }): React.JSX.Element {
  return (
    <label className={`flex items-center gap-2 rounded-lg border bg-accent/25 px-3 py-1.5 text-muted-foreground focus-within:border-foreground/25 ${className}`}>
      <SearchIcon className="size-4 shrink-0" />
      <input
        value={query}
        placeholder="Search…"
        className="min-w-0 flex-1 bg-transparent text-body text-foreground outline-none"
        onChange={(event) => {
          // One ping as a search starts, then a soft tick for each letter.
          if (!query && event.target.value) chime('search')
          else click('soft')
          setQuery(event.target.value)
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Escape' || !query) return
          event.preventDefault()
          chime('fold')
          setQuery('')
        }}
      />
      {query && <Kbd>Esc</Kbd>}
    </label>
  )
}
