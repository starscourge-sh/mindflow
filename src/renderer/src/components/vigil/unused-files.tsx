import { useEffect, useState } from 'react'
import { chime, click } from '@/lib/sound'
import { vigil } from '@/lib/vigil'
import { byKeys } from '@/lib/motion'
import { Button } from '@/components/ui/button'
import { dayMonth, num } from '../../../../main/dates'
import { Kbd, Rolling, Typed, refuse, toast, whyFailed } from './ui'
import { Orb } from './orb'
import { Check, FileText } from '@/components/ui/icons'
import { APP_NAME } from '../../../../main/name'

type Found = { name: string; size: number; image: boolean; at: number }

/** A size the way Finder writes one: 1.2 MB, counted in thousands. */
export const bytes = (n: number): string => {
  const [unit, by] = n >= 1e9 ? ['gigabyte', 1e9] : n >= 1e6 ? ['megabyte', 1e6] : n >= 1e3 ? ['kilobyte', 1e3] : ['byte', 1]
  return new Intl.NumberFormat(undefined, { style: 'unit', unit, unitDisplay: 'short', maximumFractionDigits: 1 }).format(n / (by as number))
}

/** Text only a window holds, like the box's unsent draft, so its pictures count as used. */
const held = (): string[] => {
  try {
    return Object.values(localStorage).filter((value) => value.includes('mindflow://'))
  } catch {
    return []
  }
}

/**
 * A stored file is named by a hash, and nothing remembers what it was called
 * (a note naming it would be using it), so a tile says what kind it is and
 * when it came in: "Picture, 14 Sep".
 */
const named = (one: Found): string => `${one.image ? 'Picture' : (one.name.split('.').pop() ?? '').toUpperCase()}, ${dayMonth(one.at)}`
/** Past this a picture is not drawn as a tile: decoding it would stall the window. */
const DRAWN = 30e6

/**
 * Pictures and files no note uses any more, Obsidian's "clear unused images"
 * the Vigil way: shown first, each one yours to keep with a click, then moved
 * to the Mac's Bin rather than deleted, so any of them can be put back.
 * Asked for by name (vigil:unused) from ⌘K and Settings.
 */
export function UnusedFiles(): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  // Asked for by Enter in ⌘K, it is simply there; by a click it fades and grows in.
  const [keyed, setKeyed] = useState(false)
  const [found, setFound] = useState<Found[] | { error: string } | null>(null)
  const [kept, setKept] = useState<Set<string>>(new Set())
  const [moving, setMoving] = useState(false)
  // Pictures that would not draw, shown by their kind instead.
  const [broken, setBroken] = useState<Set<string>>(new Set())

  useEffect(() => {
    const onAsk = (): void => {
      chime('open')
      setKeyed(byKeys())
      setOpen(true)
      setFound(null)
      setKept(new Set())
      setBroken(new Set())
      // Null is a look stopped or overtaken: the newer one fills the sheet.
      void vigil.unusedFind(held()).then((got) => got && setFound(got), (error: unknown) => setFound({ error: `${APP_NAME} couldn't look through your notes: ${whyFailed(error)}.` }))
    }
    window.addEventListener('vigil:unused', onAsk)
    return () => window.removeEventListener('vigil:unused', onAsk)
  }, [])

  const list = Array.isArray(found) ? found : []
  const chosen = list.filter((one) => !kept.has(one.name))
  const close = (): void => {
    chime('fold')
    // Still looking: the scan stops too, not left running for nobody.
    if (!found) void vigil.unusedStop()
    setOpen(false)
  }
  const move = (): void => {
    if (!chosen.length || moving) return
    setMoving(true)
    void vigil.unusedBin(chosen.map((one) => one.name), held()).then(({ moved, size }) => {
      setOpen(false)
      if (!moved) return refuse('Nothing was moved: a note may have taken them up since')
      chime('away')
      toast(`Moved ${num(moved)} to the Bin, ${bytes(size)} freed. Finder can put any back.`)
    }, (error: unknown) => refuse(`They weren't moved to the Bin: ${whyFailed(error)}.`, 'error')).finally(() => setMoving(false))
  }

  // Esc closes and ⌘↵ moves, wherever focus is, caught before the page sees them.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
      else if (event.key === 'Enter' && event.metaKey) move()
      else return
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null
  const total = chosen.reduce((sum, one) => sum + one.size, 0)
  return (
    <div className={`fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[8vh] ${keyed ? '' : 'animate-in fade-in-0 duration-150'}`} onMouseDown={close}>
      <div
        role="dialog"
        aria-label="Unused pictures and files"
        className={`flex max-h-[80vh] w-[min(44rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border bg-background shadow-(--mf-panel-shadow) ${keyed ? '' : 'animate-in zoom-in-95 duration-150'}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="border-b px-4 py-3">
          <h2 className="text-heading">Unused pictures and files</h2>
          <p className="text-meta text-muted-foreground">
            {Array.isArray(found) && found.length
              ? <><Rolling text={chosen.length} /> {chosen.length === 1 ? 'file' : 'files'} no note uses, <Rolling text={bytes(total)} />. Click one to keep it.</>
              : 'Ones no note, old version or page points at any more. Anything added in the last day is left alone.'}
          </p>
        </div>

        {/* Faded at an edge while there is more past it (mf-more). */}
        <div className="mf-more min-h-0 flex-1 overflow-y-auto p-4">
          {!found && <div className="flex justify-center py-6"><Orb state="searching" label="Looking through your notes…" /></div>}
          {found && !Array.isArray(found) && <p className="py-4 text-center text-control text-muted-foreground">{found.error} Nothing was moved.</p>}
          {Array.isArray(found) && !found.length && <p className="py-4 text-center text-control text-muted-foreground"><Typed text="Nothing unused: every picture and file is in a note." delay={200} /></p>}
          {list.length > 0 && (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-3">
              {list.map((one) => {
                const keep = kept.has(one.name)
                return (
                  <button
                    key={one.name}
                    type="button"
                    aria-pressed={!keep}
                    title={keep ? 'Keeping it: click to clear it after all' : 'Click to keep this one'}
                    onClick={() => {
                      click('soft')
                      setKept((was) => {
                        const next = new Set(was)
                        if (keep) next.delete(one.name)
                        else next.add(one.name)
                        return next
                      })
                    }}
                    className="group flex min-w-0 flex-col gap-1.5 rounded-lg p-1 text-left transition-colors hover:bg-accent/60"
                  >
                    <span className={`relative flex aspect-square items-center justify-center overflow-hidden rounded-md border bg-accent/30 transition-opacity ${keep ? 'opacity-40' : ''}`}>
                      {one.image && one.size < DRAWN && !broken.has(one.name)
                        ? <img src={`mindflow://assets/${one.name}`} alt="" loading="lazy" decoding="async" className="size-full object-cover"
                            onError={() => setBroken((was) => new Set(was).add(one.name))} />
                        : <span className="flex flex-col items-center gap-1 text-muted-foreground"><FileText className="size-6" /><span className="text-meta uppercase">{one.name.split('.').pop()}</span></span>}
                      <span className={`absolute top-1.5 right-1.5 flex size-4.5 items-center justify-center rounded-full border transition-colors ${keep ? 'border-foreground/30 bg-background' : 'border-transparent bg-primary text-primary-foreground'}`}>
                        {!keep && <Check className="size-3" strokeWidth={3} />}
                      </span>
                    </span>
                    <span className="flex min-w-0 flex-col px-0.5 text-meta leading-tight">
                      <span className="truncate text-foreground/80">{named(one)}</span>
                      <span className="text-muted-foreground tabular-nums">{keep ? 'Keeping' : bytes(one.size)}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t px-4 py-3">
          <p className="min-w-0 flex-1 text-control text-foreground/85"><strong className="font-semibold text-foreground">Nothing is deleted.</strong> They go to the Mac's Bin, so any can be put back.</p>
          <Button variant="ghost" size="sm" onClick={close}>Cancel <Kbd>Esc</Kbd></Button>
          {list.length > 0 && (
            <Button size="sm" disabled={!chosen.length || moving} onClick={move}>
              Move <Rolling text={chosen.length} /> to the Bin <Kbd className="border-primary-foreground/30 bg-transparent text-primary-foreground">⌘↵</Kbd>
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
