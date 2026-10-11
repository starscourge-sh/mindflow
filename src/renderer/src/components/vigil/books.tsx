import { useEffect, useState } from 'react'
import { Check, FlaskConical, Plus } from 'lucide-react'

import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { HUES, askBook, copyToBook, followBookHue, hueName, hueVar, newBook, setBookColor, shelf, switchBook, useShelf, washTo, type BookRef, type Hue, type Shelf } from '@/lib/books'
import { SANDBOX } from '@/lib/sandbox'
import { chime } from '@/lib/sound'
import { applyTheme, currentTheme } from '@/lib/theme'
import { vigil } from '@/lib/vigil'
import { Tip, ask, refuse, toast } from './ui'

type Asked = { mode: 'switch' | 'copy' | 'import'; refs?: BookRef[]; what?: 'vault' | 'files' }

const TITLE: Record<Asked['mode'], string> = {
  switch: 'Switch to which book…',
  copy: 'Copy into which book…',
  import: 'Import into which book…'
}

/** Name a new book, then go into it. From the pickers, the Vigil menu, ⌘K and the menu bar. */
export async function askNewBook(): Promise<void> {
  if (SANDBOX) return refuse('Leave the sandbox first, then make a new book')
  const name = (await ask('Name the new book', 'e.g. Fresh start, or Notion test'))?.trim()
  if (name) await newBook(name)
}

/** A book's colour as a dot: filled with its hue, or a ring for none. */
export function HueDot({ hue, className = 'size-2.5' }: { hue: Hue | null; className?: string }): React.JSX.Element {
  return <span aria-hidden className={`shrink-0 rounded-full ${className}`} style={hue ? { background: hueVar(hue) } : { boxShadow: 'inset 0 0 0 1.5px var(--muted-foreground)' }} />
}

/**
 * A book's colour, picked from a row of dots: none (the theme's own) or one
 * of the theme's hues. The open book washes into it at once.
 */
export function HueDots({ id, value, onPicked }: { id: string; value: Hue | null; onPicked?: (hue: Hue | null) => void }): React.JSX.Element {
  const shelfNow = useShelf()
  const pick = (hue: Hue | null): void => {
    if (hue === value) return chime('nope')
    chime('tap')
    onPicked?.(hue)
    // The open book's colour washes across this window at once; the others follow quietly.
    if (!SANDBOX && shelfNow?.current === id) washTo(hue)
    void setBookColor(id, hue)
  }
  return (
    <span role="radiogroup" aria-label="Book colour" className="flex items-center gap-1">
      {[null, ...HUES].map((hue) => (
        <Tip key={hue ?? 'none'} label={hue ? hueName(hue) : 'No colour: the theme’s own'}>
          <button type="button" role="radio" aria-checked={hue === value} aria-label={hueName(hue)} data-hue={hue ?? 'none'} onClick={() => pick(hue)}
            className={`grid size-6 place-items-center rounded-full transition-[box-shadow,transform] duration-150 hover:scale-110 active:scale-95 ${hue === value ? 'shadow-[0_0_0_1.5px_var(--foreground)]' : ''}`}>
            <HueDot hue={hue} className="size-3.5" />
          </button>
        </Tip>
      ))}
    </span>
  )
}

/** What the main window wears as a book opens: your look as it came along, once. */
function useCarried(): void {
  useEffect(() => {
    if (SANDBOX || new URLSearchParams(location.search).get('view') !== 'home') return
    void (window.api.vigil('books:carry') as Promise<{ local?: Record<string, string>; settings?: Record<string, unknown> } | null>).then(async (carry) => {
      if (!carry) return
      for (const [key, value] of Object.entries(carry.local ?? {})) {
        try {
          localStorage.setItem(key, value)
        } catch {
          // Worn for now, not remembered.
        }
      }
      if (carry.local?.theme) applyTheme(currentTheme(), false)
      if (carry.settings && Object.keys(carry.settings).length) await vigil.setSettings(carry.settings)
    })
  }, [])
}

/**
 * The book picker over the page: type to narrow, Enter to choose. Switching
 * lists the Sandbox too; copying and importing offer a new book by the words typed.
 */
export function BookAsker(): React.JSX.Element | null {
  const [asked, setAsked] = useState<Asked | null>(null)
  const [typed, setTyped] = useState('')
  const [now, setNow] = useState<Shelf | null>(null)
  useCarried()
  useEffect(followBookHue, [])
  useEffect(() => {
    const onAsk = (event: Event): void => {
      chime('open')
      setTyped('')
      void shelf().then(setNow)
      setAsked((event as CustomEvent<Asked>).detail)
    }
    // From the menu bar, which has no page of its own to ask on.
    const onSwitch = (event: Event): void => void switchBook(String((event as CustomEvent).detail))
    const onNew = (): void => void askNewBook()
    const onImport = (): void => askBook('import')
    window.addEventListener('vigil:book-ask', onAsk)
    window.addEventListener('vigil:book-switch', onSwitch)
    window.addEventListener('vigil:book-new', onNew)
    window.addEventListener('vigil:book-import', onImport)
    return () => {
      window.removeEventListener('vigil:book-ask', onAsk)
      window.removeEventListener('vigil:book-switch', onSwitch)
      window.removeEventListener('vigil:book-new', onNew)
      window.removeEventListener('vigil:book-import', onImport)
    }
  }, [])
  if (!asked || !now) return null
  const close = (): void => setAsked(null)
  const pick = async (id: string): Promise<void> => {
    close()
    if (asked.mode === 'switch') return switchBook(id)
    const name = now.books.find((one) => one.id === id)?.name ?? 'the book'
    if (asked.mode === 'import') {
      if (id === now.current) return void window.api.importFrom(asked.what ?? 'vault')
      return switchBook(id, asked.what ?? 'vault')
    }
    const made = await copyToBook(asked.refs ?? [], id)
    if (!made) return refuse('Nothing was copied')
    chime('copy')
    toast(made === 1 ? `Copied one into ${name}, with its pictures and files. It shows there next time you open it` : `Copied ${made} into ${name}, with their pictures and files. They show there next time you open it`)
  }
  // A new book by the words typed: copied or imported into, then made.
  const fresh = async (): Promise<void> => {
    const name = typed.trim()
    close()
    if (asked.mode === 'switch' || !name) return void askNewBook()
    const id = (await window.api.vigil('books:create', name)) as string | null
    if (id) await pick(id).catch(() => undefined)
  }
  const listed = now.books.filter((one) => asked.mode !== 'copy' || !one.current)
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 pt-[22vh]" onMouseDown={close}>
      <div role="dialog" aria-modal="true" aria-label={TITLE[asked.mode]} className="w-[min(28rem,90vw)] overflow-hidden rounded-xl bg-popover shadow-(--mf-panel-shadow)" onMouseDown={(event) => event.stopPropagation()}
        // Escape from anywhere in it, a colour dot included.
        onKeyDown={(event) => event.key === 'Escape' && (event.stopPropagation(), close())}>
        <Command onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Escape') close()
        }}>
          <CommandInput autoFocus value={typed} onValueChange={setTyped} placeholder={TITLE[asked.mode]} />
          <CommandList>
            <CommandEmpty>No book by that name yet.</CommandEmpty>
            {listed.map((one) => (
              <CommandItem key={one.id} value={`${one.name} ${one.id}`} data-book={one.id} onSelect={() => void pick(one.id)}>
                <span className="grid size-4 shrink-0 place-items-center"><HueDot hue={one.color} /></span>
                <span className="min-w-0 flex-1 truncate">{one.name}</span>
                {one.current && <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"><Check className="size-3" />Open now</span>}
              </CommandItem>
            ))}
            {asked.mode === 'switch' && (
              <CommandItem value="sandbox practice examples peek someone" data-book="sandbox" onSelect={() => void pick('sandbox')}>
                <FlaskConical className="text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">Sandbox</span>
                <span className="shrink-0 text-xs text-muted-foreground">{SANDBOX ? 'Open now' : "Someone else's book"}</span>
              </CommandItem>
            )}
            {!SANDBOX && (
              <CommandItem value={`new book ${typed}`} forceMount onSelect={() => void fresh()}>
                <Plus className="text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{typed.trim() && asked.mode !== 'switch' ? `Into a new book: “${typed.trim()}”` : 'New book…'}</span>
              </CommandItem>
            )}
          </CommandList>
        </Command>
        {/* The open book's colour, Arc's way with its spaces: picked here, washed across the window at once. */}
        {asked.mode === 'switch' && !SANDBOX && (() => {
          const open = now.books.find((one) => one.current)
          return open && (
            <div data-book-colour className="flex items-center gap-3 border-t px-3 py-2.5">
              <span className="min-w-0 flex-1 truncate text-control text-foreground"><strong className="font-semibold">Colour</strong> <span className="text-muted-foreground">for {open.name}</span></span>
              <HueDots id={open.id} value={open.color} onPicked={(color) => setNow({ ...now, color, books: now.books.map((one) => (one.current ? { ...one, color } : one)) })} />
            </div>
          )
        })()}
      </div>
    </div>
  )
}

/** The open book's name, where the sidebar's foot says which Vigil this is. */
export function BookName(): React.JSX.Element {
  const [name, setName] = useState('')
  useEffect(() => {
    const load = (): void => void shelf().then((now) => setName(now.name))
    load()
    window.addEventListener('vigil:books-changed', load)
    return () => window.removeEventListener('vigil:books-changed', load)
  }, [])
  return <>{name || 'Vigil'}</>
}
