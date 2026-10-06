import { useEffect, useState, type ReactNode } from 'react'
import { CirclePlus, Keyboard, Lock, Search as SearchIcon, X } from 'lucide-react'
import { chime, click } from '@/lib/sound'
import { SHORTCUTS, findShortcuts, grouped, type Shortcut } from '@/lib/shortcuts'
import { clashes, comboOf, fixed, keyFor, listen, saveKeys, useKeyChanges } from '@/lib/keys'
import { Button } from '@/components/ui/button'
import { Kbd, Tip, Typed, toast, typing } from './ui'

/** What was searched for, marked where it appears in a label. */
export function Marked({ text, query }: { text: string; query: string }): ReactNode {
  const q = query.trim()
  if (!q) return text
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'i'))
  return parts.map((part, n) => (n % 2 ? <mark key={n} className="rounded-xs bg-[var(--tt-color-highlight-yellow)] text-inherit">{part}</mark> : part))
}

/** A shortcut's keys, one cap per key; keys pressed one after the other are spaced. */
export const Keys = ({ keys, className }: { keys: string; className?: string }): React.JSX.Element => (
  <span className="flex shrink-0 items-center gap-1">{keys.split(' ').map((key, n) => <Kbd key={n} className={className}>{key}</Kbd>)}</span>
)

/** The shortcuts that match, in their groups: what Settings and the ? sheet both show. */
export function ShortcutList({ query, columns = false, quiet = false }: { query: string; columns?: boolean; quiet?: boolean }): React.JSX.Element | null {
  useKeyChanges()
  // As you press them now; one you cleared is not a shortcut any more.
  const found = findShortcuts(query, keyFor).filter((one) => keyFor(one.keys))
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
              <Keys keys={keyFor(one.keys)} />
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}

/** Two shortcuts on the same keys: red where both work in the same place, so one can never be reached; amber where they only might meet. */
const TONE = { red: 'var(--tt-color-text-red)', orange: 'var(--tt-color-text-orange)' }

/**
 * Settings → Keys: every shortcut, and the keys it takes now, each one
 * changeable. Found by words or by pressing the keys; narrowed to the ones you
 * changed, the ones that clash, or the ones that stay as they are. Changing a
 * key changes it wherever that key works (J moves in every list at once).
 */
export function KeysEditor({ search = '' }: { search?: string }): React.JSX.Element | null {
  const changes = useKeyChanges()
  const [words, setWords] = useState('')
  // Finding by pressing: the keys pressed, '' until some are.
  const [finding, setFinding] = useState(false)
  const [pressed, setPressed] = useState('')
  const [only, setOnly] = useState<'all' | 'changed' | 'conflicts' | 'fixed'>('all')
  // The shortcut listening for new keys, and the first of two while it waits for a second.
  const [recording, setRecording] = useState<Shortcut | null>(null)
  const [half, setHalf] = useState('')

  const clash = clashes(changes)
  const toneOf = (one: Shortcut): keyof typeof TONE | null => {
    const others = clash.get(keyFor(one.keys))?.filter((keys) => keys !== one.keys)
    if (!others?.length) return null
    return SHORTCUTS.some((other) => others.includes(other.keys) && other.where === one.where) ? 'red' : 'orange'
  }
  const save = (made: string, now: string | null): void => {
    const next = { ...changes }
    if (now === made) delete next[made]
    else next[made] = now
    saveKeys(next)
    chime(now ? 'settled' : 'away')
  }

  // Listening: every key goes here first, so ⌘K is written down, not obeyed.
  useEffect(() => {
    if (!recording) return
    let first = ''
    let timer: ReturnType<typeof setTimeout> | undefined
    const done = (keys?: string | null): void => {
      clearTimeout(timer)
      setRecording(null)
      setHalf('')
      if (keys !== undefined) save(recording.keys, keys)
    }
    listen((event) => {
      const combo = comboOf(event)
      if (!combo) return
      if (combo === 'Esc') return (chime('fold'), done())
      if (combo === '⌫' && !first) return done(null)
      if (first) return done(`${first} ${combo}`)
      // A plain key may be the first of two, G then B: a moment for the second.
      if (!/[⌃⌥⌘]/.test(combo)) {
        first = combo
        setHalf(combo)
        timer = setTimeout(() => done(first), 1200)
        return
      }
      done(combo)
    })
    const away = (): void => done()
    window.addEventListener('mousedown', away)
    return () => (listen(null), clearTimeout(timer), window.removeEventListener('mousedown', away))
  }, [recording]) // eslint-disable-line react-hooks/exhaustive-deps

  // Finding by keys: what you press fills the filter instead of doing anything.
  useEffect(() => {
    if (!finding || recording) return
    listen((event) => {
      const combo = comboOf(event)
      if (!combo) return
      if (combo === 'Esc') return (chime('fold'), setFinding(false), setPressed(''))
      click('soft')
      setPressed(combo === '⌫' ? '' : combo)
    })
    return () => listen(null)
  }, [finding, recording])

  const query = search || (finding ? '' : words)
  const all = findShortcuts(query, keyFor)
  const counts = {
    changed: SHORTCUTS.filter((one) => one.keys in changes).length,
    conflicts: SHORTCUTS.filter((one) => toneOf(one)).length,
    fixed: SHORTCUTS.filter((one) => fixed(one.keys)).length
  }
  const list = all.filter((one) => {
    if (finding && pressed && !keyFor(one.keys).split(' ').includes(pressed)) return false
    if (only === 'changed') return one.keys in changes
    if (only === 'conflicts') return !!toneOf(one)
    if (only === 'fixed') return fixed(one.keys)
    return true
  })
  if (search && !list.length) return null
  const resetAll = (): void => {
    const was = changes
    saveKeys({})
    chime('away')
    toast('Every key is back as it came', () => saveKeys(was))
  }

  return (
    <div className="px-3 pt-3">
      {!search && (
        <div data-setting className="mb-3 flex flex-col gap-2 px-1">
          <div className="flex items-center gap-2 rounded-lg border bg-background/40 px-3 py-1.5 text-muted-foreground focus-within:border-ring">
            <SearchIcon className="size-4 shrink-0" />
            {finding ? (
              <span className="flex min-h-6 flex-1 items-center text-body">{pressed ? <Keys keys={pressed} /> : <Typed text="Press the keys to find…" step={25} delay={0} />}</span>
            ) : (
              <input
                value={words}
                placeholder="Filter…"
                className="min-h-6 min-w-0 flex-1 bg-transparent text-body text-foreground outline-none"
                onChange={(event) => (click('soft'), setWords(event.target.value))}
                onKeyDown={(event) => event.key === 'Escape' && words && (event.preventDefault(), event.stopPropagation(), chime('fold'), setWords(''))}
              />
            )}
            <Tip label={finding ? 'Find by words' : 'Find by pressing the keys'}>
              <button
                type="button"
                aria-pressed={finding}
                onClick={() => (chime(finding ? 'fold' : 'open'), setFinding(!finding), setPressed(''))}
                className={`rounded p-0.5 transition-colors hover:text-foreground ${finding ? 'bg-accent text-foreground' : ''}`}
              >
                <Keyboard className="size-4" />
              </button>
            </Tip>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border p-0.5 text-control">
              {([['all', 'All'], ['changed', 'Changed by you'], ['conflicts', 'Conflicts'], ['fixed', 'Fixed']] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={only === id}
                  onClick={() => (click('soft'), setOnly(id))}
                  className={`flex items-center gap-1.5 rounded-sm px-2.5 py-1 transition-colors ${only === id ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {label}
                  {id !== 'all' && counts[id] > 0 && (
                    <span className="tabular-nums" style={id === 'conflicts' ? { color: TONE.orange } : undefined}>{counts[id]}</span>
                  )}
                </button>
              ))}
            </div>
            <span className="flex-1" />
            {counts.changed > 0 && <Button variant="ghost" size="sm" onClick={resetAll}>Reset all</Button>}
          </div>
        </div>
      )}
      {!list.length && <p className="px-1 pb-3 text-meta text-muted-foreground"><Typed text={only === 'all' ? 'No shortcut matches. Try what it does, or press its keys.' : 'None here.'} /></p>}
      {grouped(list).map(([group, rows]) => (
        <section key={group} className="mb-4">
          <h3 className="mb-1 px-1 text-meta font-medium text-muted-foreground">{group}</h3>
          {rows.map((one) => {
            const now = keyFor(one.keys)
            const tone = toneOf(one)
            const others = tone ? SHORTCUTS.filter((other) => other.keys !== one.keys && keyFor(other.keys) === now) : []
            const record = (): void => (chime('open'), setRecording(one))
            return (
              <div key={one.keys + one.does} data-setting className="group/key flex min-h-9 items-center gap-3 rounded-md px-1 py-1 text-control">
                <span className="min-w-0 flex-1">
                  <span className="text-foreground"><Marked text={one.does} query={query} /></span>
                  {tone && <span className="block text-meta" style={{ color: TONE[tone] }}>Same keys as {others.map((other) => `${other.does} (${other.where})`).join(', ')}</span>}
                </span>
                <span className="hidden text-meta text-muted-foreground min-[28rem]:inline">{one.where}</span>
                {fixed(one.keys) ? (
                  <Tip label="Fixed: this key does its job by being the key">
                    <span className="flex items-center"><Keys keys={one.keys} /><span className="flex w-10 justify-end pr-1"><Lock className="size-3 text-muted-foreground" /></span></span>
                  </Tip>
                ) : recording === one ? (
                  <span className="mr-10 rounded-md border border-ring px-2 py-0.5 text-meta text-foreground">{half ? `${half} then…` : 'Press keys…'}</span>
                ) : (
                  <span className="flex items-center gap-1">
                    {one.keys in changes && (
                      <Tip label={`Back to ${one.keys}`}>
                        <button type="button" onClick={() => save(one.keys, one.keys)} className="rounded px-1 text-meta text-muted-foreground hover:text-foreground">Reset</button>
                      </Tip>
                    )}
                    {now ? (
                      <span className="flex items-center">
                        <button type="button" aria-label={`Change the keys for ${one.does}`} onClick={record} className="rounded">
                          <Keys keys={now} className={tone ? (tone === 'red' ? 'border-[var(--tt-color-text-red)] text-[var(--tt-color-text-red)]' : 'border-[var(--tt-color-text-orange)] text-[var(--tt-color-text-orange)]') : ''} />
                        </button>
                      </span>
                    ) : (
                      <button type="button" onClick={record} className="rounded px-1 text-meta text-muted-foreground hover:text-foreground">None</button>
                    )}
                    <span className="flex w-10 items-center justify-end gap-0.5">
                    {now && (
                      <Tip label="No keys">
                        <button type="button" onClick={() => save(one.keys, null)} className="rounded-full p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover/key:opacity-100 hover:text-foreground focus-visible:opacity-100">
                          <X className="size-3" />
                        </button>
                      </Tip>
                    )}
                    <Tip label="Press new keys">
                      <button type="button" onClick={record} className="rounded-full p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover/key:opacity-100 hover:text-foreground focus-visible:opacity-100">
                        <CirclePlus className="size-3.5" />
                      </button>
                    </Tip>
                    </span>
                  </span>
                )}
              </div>
            )
          })}
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
