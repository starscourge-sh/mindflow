import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlignLeft, Check, ChevronRight, Columns3, Link2, ListChecks, Lock, Plus, Split, Star, Tags, Type, X } from 'lucide-react'
import { AliveIcon } from '@/components/ui/alive-icon'
import ClockIcon from '@/components/ui/clock-icon'
import PenIcon from '@/components/ui/pen-icon'
import UnlinkIcon from '@/components/ui/unlink-icon'
import { AnimatePresence, motion } from 'motion/react'

import { CAPTURE_TYPES } from '../capture-kinds/capture-kind-picker'
import { KIND_FIELDS, type Field } from '../capture-kinds/kind-fields'
import { Search } from '../search'
import { Command, CommandInput, CommandItem, CommandList, CommandShortcut } from '@/components/ui/command'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { chime, step, type Cue } from '@/lib/sound'
import { notes, smallPicture, useThumb, type GraphNode, type NoteTable, type Version } from '@/lib/notes'
import { useLive, vigil } from '@/lib/vigil'
import { Chips } from './display'
import { copy, type MenuItem } from './row-menu'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import DotsHorizontalIcon from '@/components/ui/dots-horizontal-icon'
import BookIcon from '@/components/ui/book-icon'
import { ReadThrough } from './read-through'
import { Island, PropInput, Rolling, Tip, Typed, refuse, toast } from './ui'
import { age, dayKey, dayMonth, dayjs, moment, noon, num } from '../../../../main/dates'
import { keyFor } from '@/lib/keys'

// --- a note's first picture, small

/** A note's first picture, small, or nothing at all. Rows are only drawn in view, so this is lazy already. */
export function Thumb({ id, className = 'size-9' }: { id: string; className?: string }): React.JSX.Element | null {
  const src = useThumb(id)
  const [shown, setShown] = useState<string | null>(null)
  useEffect(() => {
    setShown(null)
    if (src) void smallPicture(src).then(setShown)
  }, [src])
  if (!src) return null
  return (
    // Blurred with the words when its row is private: a picture says as much.
    <span className={`private-text block shrink-0 overflow-hidden rounded-md border bg-accent/40 ${className}`}>
      {shown && <img src={shown} alt="" loading="lazy" decoding="async" draggable={false} className="size-full object-cover animate-in fade-in-0 duration-200" />}
    </span>
  )
}

// --- a new kind, asked for from a menu or ⌘K

/** The kinds as a short list over the page: arrows, a number, or the name, then Enter. */
export function KindAsker(): React.JSX.Element | null {
  const [asked, setAsked] = useState<{ current: string; answer: (kind: string | null) => void } | null>(null)
  const [row, setRow] = useState('')
  useEffect(() => {
    const onAsk = (event: Event): void => {
      const detail = (event as CustomEvent).detail
      chime('open')
      setRow(CAPTURE_TYPES.find((type) => type.id === detail.current)?.label ?? '')
      setAsked(detail)
    }
    window.addEventListener('vigil:pick-kind', onAsk)
    return () => window.removeEventListener('vigil:pick-kind', onAsk)
  }, [])
  if (!asked) return null
  const done = (kind: string | null): void => {
    asked.answer(kind)
    setAsked(null)
  }
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 pt-[22vh]" onMouseDown={() => done(null)}>
      <div role="dialog" aria-modal="true" aria-label="Change kind" className="w-72 overflow-hidden rounded-xl bg-popover shadow-(--mf-panel-shadow)" onMouseDown={(event) => event.stopPropagation()}>
        <Command
          value={row}
          onValueChange={(label) => {
            const at = CAPTURE_TYPES.findIndex((type) => type.label === label)
            if (at >= 0 && label !== row) step(at)
            setRow(label)
          }}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === 'Escape') return done(null)
            const picked = CAPTURE_TYPES[Number(event.key) - 1]
            if (!picked) return
            event.preventDefault()
            done(picked.id)
          }}
        >
          <CommandInput autoFocus placeholder="Change kind to…" />
          <CommandList>
            {CAPTURE_TYPES.map((type, index) => (
              <CommandItem key={type.id} value={type.label} onSelect={() => done(type.id)}>
                <type.icon style={{ color: type.tint }} />
                <span className="text-xs">{type.label}</span>
                {type.id === asked.current && <Check className="ml-auto size-4" />}
                <CommandShortcut className={type.id === asked.current ? 'ml-2' : ''}>{index + 1}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </div>
    </div>
  )
}

// --- the fields a kind asks for

/** A date the way a quiet line says it: "6 Oct", with the year once it is not this one. */
const dated = (iso: string): string => dayMonth(iso)

/** What a status says when it is picked, and how it sounds. */
const STATUS: Record<string, { said: string; cue: Cue }> = {
  Open: { said: 'Open: not decided yet', cue: 'tap' },
  Deciding: { said: 'Deciding: weigh it up under Working out', cue: 'weigh' },
  Decided: { said: "Decided. Don't reopen it without a new reason", cue: 'decided' },
  Running: { said: 'Running: say what came of it when it ends', cue: 'trial' },
  Finished: { said: 'Finished: write the outcome so it skims later', cue: 'finding' }
}

/**
 * The fields this note's kind asks for, in the properties column. Nothing for
 * a kind that asks for none, and nothing is ever required: a field is there
 * for when you want it. A decision folds its working out away and, once
 * decided, says so quietly; an experiment can start a decision from itself.
 */
export function KindFields({ table, id, kind, onOpen }: { table: NoteTable; id: string; kind: string; onOpen?: (type: string, id: string) => void }): React.JSX.Element | null {
  const fields = KIND_FIELDS[kind] ?? []
  // Tagged with the note they belong to: until this note's own have come in,
  // a field would start from nothing (or the last note's words) and a blur
  // would write that over what is kept.
  const read = useLive(() => notes.fields(table, id).then((values) => ({ of: `${table}:${id}`, values })), { of: '', values: {} as Record<string, string | number> }, [table, id])
  const values = read.values
  // The working out: open while deciding unless shut by hand, folded after.
  const [working, setWorking] = useState<boolean | null>(null)
  useEffect(() => setWorking(null), [id])
  // Properties a note came with that its kind does not ask for: an imported
  // note's frontmatter, every key of it, shown and editable as words.
  const others = Object.keys(values).filter((key) => !fields.some((field) => field.key === key))
  if ((!fields.length && !others.length) || read.of !== `${table}:${id}`) return null
  const save = (key: string, value: string | number | null): void => {
    if ((values[key] ?? null) === (value === '' ? null : value)) return
    void notes.setField(table, id, key, value === '' ? null : value).then(() => chime('noted'))
  }
  const saveAll = (patch: Record<string, string | number | null>): Promise<unknown> =>
    Promise.all(Object.entries(patch).map(([key, value]) => notes.setField(table, id, key, value)))
  // A status picked (or picked again, to clear it), dated when a decision is
  // made, and taken back whole by the undo.
  const pick = (key: string, option: string): void => {
    const next = values[key] === option ? null : option
    const dates = kind === 'decision' && key === 'state'
    const was = { [key]: values[key] ?? null, ...(dates ? { decidedAt: values.decidedAt ?? null } : {}) }
    const patch = { [key]: next, ...(dates ? { decidedAt: next === 'Decided' ? (values.decidedAt && values[key] === 'Decided' ? values.decidedAt : new Date().toISOString()) : null } : {}) }
    // Weighing it up opens the working out; deciding folds it away, kept.
    if (dates) setWorking(next === 'Deciding' ? true : next === 'Decided' ? false : null)
    void saveAll(patch).then(() => {
      chime(next ? STATUS[next]?.cue ?? 'tap' : 'off')
      toast(next ? STATUS[next]?.said ?? next : 'No status', () => void saveAll(was).then(() => chime('undo')))
    })
  }
  // An experiment's finding becomes a decision: made from it, so each shows
  // the other under Came from and Became.
  const decide = async (): Promise<void> => {
    const self = await vigil.linkTitle(table === 'captures' ? id : `nugget:${id}`)
    const outcome = String(values.outcome ?? '').split('\n')[0].trim()
    const text = outcome ? `Decide: ${outcome}` : `Decide, after: ${self?.title || 'the experiment'}`
    const made = await window.api.captures.create({ kind: 'decision', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }, origin: id })
    await notes.setField('captures', made, 'state', 'Open')
    chime('decided')
    toast('A decision, started from this experiment', () => void vigil.unmakeCapture(made, id).then(() => chime('undo')))
    onOpen?.('capture', made)
  }
  const properties = others.length ? (
    <Island compact title="Properties">
      {others.map((key) => (
        <div key={`${id}-${key}-${values[key]}`} className="flex items-center gap-1 pl-2">
          <span className="w-20 shrink-0 truncate text-meta" title={key}>{key}</span>
          <div className="min-w-0 flex-1">
            <PropInput icon={Type} value={String(values[key] ?? '')} placeholder={key} onSave={(text) => save(key, text)} />
          </div>
        </div>
      ))}
    </Island>
  ) : null
  if (!fields.length) return properties
  const state = String(values.state ?? '')
  const longField = (field: Field, value: string | number | undefined): React.JSX.Element => (
    <label key={`${id}-${field.key}-${value ?? ''}`} className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-accent focus-within:bg-accent">
      <AlignLeft className="mt-1 size-4 shrink-0" />
      <Textarea rows={2} defaultValue={String(value ?? '')} placeholder={field.placeholder ?? field.label} aria-label={field.label} onBlur={(event) => save(field.key, event.target.value.trim())}
        className="min-h-0 resize-none border-0 bg-transparent p-0 text-control text-foreground shadow-none focus-visible:ring-0" />
    </label>
  )
  return (
    <>
    {properties}
    <Island compact title={`${CAPTURE_TYPES.find((type) => type.id === kind)?.label ?? 'Kind'} details`}>
      {fields.map((field) => {
        const value = values[field.key]
        if (field.type === 'hidden') return null
        if (field.type === 'choice')
          return (
            <div key={field.key} className="px-2 py-1">
              <div className="flex items-center gap-2">
                <ListChecks className="size-4 shrink-0" />
                <Chips options={(field.options ?? []).map((option) => ({ id: option, label: option }))} on={(option) => value === option} pick={(option) => pick(field.key, option)} />
              </div>
              {/* Proof you already thought it through: quiet, and only once it is settled. */}
              {kind === 'decision' && value === 'Decided' && (
                <p className="flex items-center gap-1.5 pt-1 pb-0.5 pl-6 text-xs text-muted-foreground">
                  <Lock className="size-3 shrink-0" />
                  <Typed text={`Decided${values.decidedAt ? ` ${dated(String(values.decidedAt))}` : ''} — don't reopen without a reason`} step={24} delay={150} />
                </p>
              )}
            </div>
          )
        // The working out folds away: open while deciding, shut once decided,
        // and out of sight altogether until there is something to weigh.
        if (kind === 'decision' && field.key === 'working') {
          if (state !== 'Deciding' && !value) return null
          const open = working ?? state === 'Deciding'
          return (
            <div key={field.key}>
              <button type="button" aria-expanded={open} onClick={() => (chime(open ? 'fold' : 'slide'), setWorking(!open))}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-control hover:bg-accent">
                <ChevronRight className={`size-4 shrink-0 transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
                <span className="flex-1">{field.label}</span>
                {!open && value ? <span className="text-xs text-muted-foreground"><Rolling text={`${num(String(value).split(/\s+/).length)} words`} by="word" /></span> : null}
              </button>
              <AnimatePresence initial={false}>
                {open && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden">
                    <Textarea rows={4} defaultValue={String(value ?? '')} placeholder={field.placeholder} aria-label={field.label} onBlur={(event) => save(field.key, event.target.value.trim())}
                      className="min-h-0 resize-none rounded-none border-0 bg-transparent px-8 pt-0 pb-2 text-control text-foreground shadow-none focus-visible:ring-0" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        }
        if (field.type === 'link')
          return <LinkField key={field.key} label={field.label} placeholder={field.placeholder ?? field.label} value={value ? String(value) : null} onOpen={onOpen}
            onSave={(link) => {
              const was = value ?? null
              void notes.setField(table, id, field.key, link).then(() => {
                chime(link ? 'noted' : 'off')
                toast(link ? `${field.label}: linked` : 'Link taken off', () => void notes.setField(table, id, field.key, was).then(() => chime('undo')))
              })
            }} />
        if (field.type === 'rating')
          return (
            <div key={field.key} className="flex items-center gap-2 px-2 py-1.5" aria-label={`${field.label}: ${value ?? 'none'} of 5`}>
              <span className="w-12 text-meta">{field.label}</span>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" aria-label={`${n} of 5`} onClick={() => (step(n - 1), save(field.key, value === n ? null : n))} className="text-muted-foreground hover:text-foreground">
                  <Star className="size-4" style={Number(value) >= n ? { fill: 'var(--tt-color-text-yellow)', color: 'var(--tt-color-text-yellow)' } : undefined} />
                </button>
              ))}
            </div>
          )
        if (field.type === 'long') return longField(field, value)
        return <PropInput key={`${id}-${field.key}-${value ?? ''}`} icon={Type} value={String(value ?? '')} placeholder={field.placeholder ?? field.label} onSave={(text) => save(field.key, text)} />
      })}
      {kind === 'experiment' && (
        <Tip label="A decision note, each linked to the other">
          <button type="button" onClick={() => void decide()} className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-control hover:bg-accent hover:text-foreground">
            <Split className="size-4 shrink-0" style={{ color: 'var(--tt-color-text-red)' }} /> Decide from this
          </button>
        </Tip>
      )}
    </Island>
    </>
  )
}

/** A day's page, by its date: "Mon 5 Oct". */
const dayPage = (day: string): string => noon(day).format('ddd D MMM')

/**
 * A field that holds a link to another note or a day's page: its name, which
 * opens it, and search to pick or change it. Days are offered first, since a
 * day is what most often starts something.
 */
function LinkField({ label, placeholder, value, onSave, onOpen }: {
  label: string
  placeholder: string
  value: string | null
  onSave: (link: string | null) => void
  onOpen?: (type: string, id: string) => void
}): React.JSX.Element {
  const [picking, setPicking] = useState(false)
  const target = useLive(() => (value ? vigil.linkTitle(value) : Promise.resolve(null)), null as Awaited<ReturnType<typeof vigil.linkTitle>>, [value])
  const name = target ? (target.type === 'day' ? dayPage(target.id) : target.title || 'Untitled') : value ? 'Gone: pick again' : null
  const days = [0, 1, 2].map((back) => dayKey(dayjs().subtract(back, 'day')))
  return (
    <div className="group/link flex items-center gap-2 px-2 py-1.5 hover:bg-accent">
      <Link2 className="size-4 shrink-0" />
      <span className="w-16 shrink-0 truncate text-meta">{label}</span>
      {value ? (
        <button type="button" data-private={target?.private ? '' : undefined} onClick={() => target && onOpen && (chime('tap'), onOpen(target.type, target.id))}
          className="private-text min-w-0 flex-1 truncate text-left text-control text-foreground underline decoration-foreground/25 underline-offset-2 hover:decoration-foreground">
          {name}
        </button>
      ) : (
        <button type="button" onClick={() => (chime('open'), setPicking(true))} className="min-w-0 flex-1 truncate text-left text-control text-foreground/70 hover:text-foreground">{placeholder}</button>
      )}
      {value && (
        <span className="flex shrink-0 items-center opacity-0 transition-opacity group-hover/link:opacity-100 group-focus-within/link:opacity-100">
          <Tip label="Link something else">
            <button type="button" aria-label="Link something else" onClick={() => (chime('open'), setPicking(true))} className="rounded p-0.5 text-muted-foreground hover:text-foreground"><AliveIcon icon={PenIcon} size={14} /></button>
          </Tip>
          <Tip label="Take the link off">
            <button type="button" aria-label="Take the link off" onClick={() => onSave(null)} className="rounded p-0.5 text-muted-foreground hover:text-foreground"><AliveIcon icon={UnlinkIcon} size={14} /></button>
          </Tip>
        </span>
      )}
      {picking && createPortal(
        <Search
          placeholder="Link a day, a decision, an experiment, any note…"
          actions={days.map((day, back) => ({ label: back === 0 ? "Today's page" : back === 1 ? "Yesterday's page" : `${dayPage(day)}'s page`, run: () => onSave(`day:${day}`) }))}
          onClose={() => setPicking(false)}
          onOpen={(type, id) => {
            setPicking(false)
            if (type === 'task') return refuse('A task cannot start an experiment here. Pick a day or a note')
            onSave(type === 'capture' ? id : `${type}:${id}`)
          }}
        />,
        document.body
      )}
    </div>
  )
}

// --- other names

/**
 * Other names a note goes by: the word you think in, not the one you titled
 * it with. Search, ⌘K, @ links and [[links]] all find the note by them.
 */
export function Aliases({ table, id }: { table: NoteTable; id: string }): React.JSX.Element {
  const read = useLive(() => vigil.aliases(table, id).then((list) => ({ of: id, list })), { of: '', list: [] as string[] }, [table, id])
  const list = read.of === id ? read.list : []
  const set = (next: string[], said: string, cue: Cue): void =>
    void vigil.setAliases(table, id, next).then((was) => {
      if (!was) return refuse('That note no longer exists, so nothing was changed')
      chime(cue)
      toast(said, () => void vigil.setAliases(table, id, was).then(() => chime('undo')))
    })
  return (
    <Island compact title="Also called">
      {list.map((name) => (
        <div key={name} className="group/alias flex items-center gap-2 px-2 py-1.5">
          <Tags className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-control text-foreground">{name}</span>
          <Tip label="Forget this name">
            <button type="button" aria-label={`Forget the name ${name}`} onClick={() => set(list.filter((one) => one !== name), `No longer called “${name}”`, 'off')}
              className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover/alias:opacity-100 focus-visible:opacity-100 hover:text-foreground">
              <X className="size-3.5" />
            </button>
          </Tip>
        </div>
      ))}
      <label className="flex cursor-text items-center gap-2 px-2 py-1.5 hover:bg-accent focus-within:bg-accent">
        <Plus className="size-4 shrink-0" />
        <input
          key={`${id}-${list.length}`}
          placeholder={list.length ? 'Another name…' : 'Another name you might search for'}
          aria-label="Another name for this note"
          onKeyDown={(event) => {
            if (event.key === 'Escape') return event.currentTarget.blur()
            if (event.key !== 'Enter') return
            const name = event.currentTarget.value.trim()
            if (!name) return
            if (list.some((one) => one.toLowerCase() === name.toLowerCase())) return refuse(`Already called “${name}”`)
            set([...list, name], `Also called “${name}”: search finds it by that now`, 'alias')
          }}
          className="min-w-0 flex-1 bg-transparent text-control text-foreground outline-none placeholder:text-foreground/70"
        />
      </label>
    </Island>
  )
}

// --- versions

const whenSaved = (iso: string): string => moment(iso)

/**
 * The versions a note has been, on a slider: drag back through them, read
 * the one you are on in place of the note, and bring it back if you want it.
 * `onShow` gets the words to show (and a key for them), or null for now.
 */
export function Versions({ table, id, onShow, onRestored, trigger }: {
  /** `day`, with `day:` and its date as the id, for a day's page. */
  table: NoteTable | 'day'
  id: string
  onShow: (body: unknown | null, key?: string) => void
  onRestored: () => void
  /** What stands in for the Versions button, given the way to open them. */
  trigger?: (open: () => void) => React.ReactNode
}): React.JSX.Element {
  const [list, setList] = useState<Version[] | null>(null)
  const [at, setAt] = useState(0)
  const close = (): void => {
    setList(null)
    onShow(null)
  }
  // Back to now from looking back: the editor comes back, so it is given the
  // words as they are kept now, not the ones read when the note was opened,
  // which the next keystroke would save over the latest edits.
  const back = (): void => {
    close()
    onRestored()
  }
  const show = (versions: Version[], index: number): void => {
    setAt(index)
    void notes.version(versions[index].id).then((body) => onShow(body, `v${versions[index].id}`))
  }
  const open = (): void =>
    void notes.versions(id).then((found) => {
      if (!found.length) {
        chime('nope')
        return toast('No earlier versions yet: one is kept each time you come back to change it', undefined, 'info')
      }
      chime('open')
      setList(found)
      show(found, 0)
    })
  // ⌘K's "Version history" opens this one, when it is the note open.
  useEffect(() => {
    const onAsk = (event: Event): void => void ((event as CustomEvent).detail === id && open())
    window.addEventListener('vigil:versions', onAsk)
    return () => window.removeEventListener('vigil:versions', onAsk)
  })
  useEffect(() => close, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  // Escape is back to now, and only that: taken first, so the note stays open.
  useEffect(() => {
    if (!list) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      chime('fold')
      back()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })
  if (!list && trigger) return <>{trigger(open)}</>
  if (!list)
    return (
      <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={open}><AliveIcon icon={ClockIcon} size={14} /> Versions</Button>
    )
  const version = list[at]
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted-foreground">
      {/* Oldest on the left, as time reads; the newest version is where it starts. */}
      <Slider className="w-32 shrink-0" min={0} max={Math.max(1, list.length - 1)} step={1} disabled={list.length < 2}
        value={[list.length - 1 - at]} onValueChange={([value]) => {
          const index = list.length - 1 - value
          if (index === at) return
          chime('page')
          show(list, index)
        }} />
      <span className="truncate tabular-nums"><Rolling text={whenSaved(version.savedAt)} by="word" /></span>
      <Button variant="ghost" size="sm" onClick={() => void notes.restore(table, id, version.id).then((undo) => {
        if (undo === null) return
        chime('rewind')
        close()
        onRestored()
        toast(`Brought back the version from ${whenSaved(version.savedAt)}`, () => void notes.restore(table, id, undo).then(onRestored))
      })}>Restore</Button>
      <Tip label="Back to now  Esc">
        <Button variant="ghost" size="icon-sm" aria-label="Back to now" onClick={() => (chime('fold'), back())}><X className="size-3.5" /></Button>
      </Tip>
    </div>
  )
}

// --- a note's header

const TOOL = 'flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground [&_svg]:size-4'

/**
 * The row over an open note: where it sits in the list on the left; on the
 * right, quietly, when it last changed (a click goes back through its
 * versions), a book to read it, and everything else behind the dots. `looking` takes the right side while an older text is shown.
 */
export function NoteHeader({ left, type = 'capture', edited, captured, made = 'Captured', pinned, onPin, copyKey, menu, looking, board, tools, className = '', ...versions }: {
  left?: React.ReactNode
  /** What it is, for reading it: capture, nugget, article, question. */
  type?: string
  /** When its words last changed, or null if never since it was made. */
  edited: string | null
  captured: string
  made?: string
  pinned?: boolean
  onPin?: () => void
  /** Its short handle, MF-123, to copy. */
  copyKey?: string
  menu: MenuItem[]
  looking?: React.ReactNode
  /** The switch between the note and its board, for a note that reads as one. */
  board?: { on: boolean; toggle: () => void }
  /** A view's own tools, in the same row before the switch: the board's find, archive and new list. */
  tools?: React.ReactNode
  className?: string
} & Parameters<typeof Versions>[0]): React.JSX.Element {
  const at = edited && edited > captured ? edited : captured
  const old = age(at)
  const verb = edited && edited > captured ? 'Edited' : made
  const said = `${verb} ${old === '0m' ? 'just now' : `${old} ago`}`
  // In a narrow pane, "Edited 2m": shorter, never cut off mid-word.
  const short = `${verb} ${old === '0m' ? 'now' : old}`
  const items = menu.filter(Boolean) as Exclude<MenuItem, false | null | undefined>[]
  const [reading, setReading] = useState(false)
  return (
    <div className={`@container/head flex min-h-7 items-center justify-between gap-2 px-3 @[40rem]/page:px-[4.25rem] ${className}`}>
      {reading && <ReadThrough items={[{ type, id: versions.id }]} onClose={() => setReading(false)} />}
      {left ?? <span />}
      {looking ?? (
        <Versions {...versions} trigger={(open) => (
          // On the right even when there is no list position to its left.
          <div className="ml-auto flex min-w-0 items-center gap-0.5">
            <Tip label={moment(at, 'dddd')}>
              <button type="button" aria-label={said} onClick={open} className="mr-1 shrink-0 rounded-md px-1.5 py-1 text-xs whitespace-nowrap text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                <span className="hidden @[30rem]/head:inline">{said}</span>
                <span className="@[30rem]/head:hidden">{short}</span>
              </button>
            </Tip>
            {tools}
            {board && (
              <Tip label={board.on ? 'Note  ⌥⌘B' : 'Board  ⌥⌘B'}>
                <button type="button" aria-pressed={board.on} onClick={board.toggle} className={`${TOOL} ${board.on ? 'bg-accent text-foreground' : ''}`}><Columns3 /></button>
              </Tip>
            )}
            <Tip label="Read">
              <button type="button" aria-label="Read" onClick={() => (chime('open'), setReading(true))} className={TOOL}><AliveIcon icon={BookIcon} size={16} /></button>
            </Tip>
            <DropdownMenu modal={false}>
              <Tip label="More">
                <DropdownMenuTrigger asChild>
                  <button type="button" aria-label="More" className={TOOL}><AliveIcon icon={DotsHorizontalIcon} size={16} /></button>
                </DropdownMenuTrigger>
              </Tip>
              <DropdownMenuContent align="end" className="w-56">
                {onPin && <DropdownMenuItem onSelect={onPin}>{pinned ? 'Unpin' : 'Pin'}</DropdownMenuItem>}
                {copyKey && <DropdownMenuItem onSelect={() => copy(copyKey, `Copied ${copyKey}`)}>Copy {copyKey}</DropdownMenuItem>}
                <DropdownMenuItem onSelect={open}>Version history</DropdownMenuItem>
                {items.map((item, index) =>
                  item === 'separator' ? (
                    items[index - 1] !== 'separator' && index < items.length - 1 && <DropdownMenuSeparator key={`separator-${index}`} />
                  ) : (
                    <DropdownMenuItem key={item.label} variant={item.danger ? 'destructive' : 'default'} onSelect={item.run}>
                      {item.label}
                      {item.keys && keyFor(item.keys) && <DropdownMenuShortcut>{keyFor(item.keys)}</DropdownMenuShortcut>}
                    </DropdownMenuItem>
                  )
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )} />
      )}
    </div>
  )
}

// --- the map of a note's links

const W = 232
const H = 176
/**
 * The note in the middle, what it links to and what links to it around it:
 * one step each way, never the whole graph. Out to the right half, in to the
 * left, so the direction reads at a glance; a click opens one.
 */
export function LocalGraph({ id, title, onOpen }: { id: string; title: string; onOpen?: (type: string, id: string) => void }): React.JSX.Element | null {
  const [graph, setGraph] = useState<{ out: GraphNode[]; in: GraphNode[] } | null>(null)
  useEffect(() => {
    const load = (): void => void notes.graph(id).then(setGraph)
    load()
    // After things settle, not on every keystroke of an autosave: the links
    // are read from every note's words.
    let timer: ReturnType<typeof setTimeout> | undefined
    const stop = window.api.captures.onChange(() => {
      clearTimeout(timer)
      timer = setTimeout(load, 1500)
    })
    return () => {
      clearTimeout(timer)
      stop()
    }
  }, [id])
  if (!graph) return null
  const both = new Set(graph.out.filter((one) => graph.in.some((other) => other.id === one.id)).map((one) => one.id))
  const nodes = [
    ...graph.out.map((node) => ({ ...node, way: both.has(node.id) ? 'both' : 'out' })),
    ...graph.in.filter((node) => !both.has(node.id)).map((node) => ({ ...node, way: 'in' }))
  ]
  const more = Math.max(0, nodes.length - 10)
  const shown = nodes.slice(0, 10)
  const cx = W / 2
  const cy = H / 2
  // Out on the right, in on the left, each spread down its own half.
  const place = (way: string, index: number, count: number): [number, number] => {
    const angle = (way === 'in' ? Math.PI : 0) + (count === 1 ? 0 : ((index / (count - 1)) - 0.5) * Math.PI * 0.8) * (way === 'in' ? -1 : 1)
    return [cx + Math.cos(angle) * 72, cy + Math.sin(angle) * 62]
  }
  const sides = { in: shown.filter((node) => node.way === 'in'), out: shown.filter((node) => node.way !== 'in') }
  const short = (text: string): string => (text.length > 16 ? `${text.slice(0, 15)}…` : text) || 'Untitled'
  return (
    <Island compact title="Links">
      {!shown.length ? (
        <p className="px-2 py-1.5 text-xs text-muted-foreground"><Typed text="No links yet. Type @ in the note to link another, and it shows here." step={25} /></p>
      ) : (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="mx-auto block max-w-full overflow-visible" role="img" aria-label={`${graph.out.length} links out, ${graph.in.length} in`}>
          <defs>
            <marker id="mf-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M0,0 L6,3 L0,6 z" fill="currentColor" />
            </marker>
          </defs>
          {(['out', 'in'] as const).flatMap((side) =>
            sides[side].map((node, index) => {
              const [x, y] = place(side, index, sides[side].length)
              const out = node.way !== 'in'
              return (
                <motion.g key={node.id} data-private={node.private ? '' : undefined} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: index * 0.04, duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  style={{ transformOrigin: `${x}px ${y}px`, cursor: onOpen ? 'pointer' : undefined }}
                  onClick={() => onOpen && (chime('tap'), onOpen(node.type, node.id))}>
                  <title>{`${out ? (node.way === 'both' ? 'Links both ways: ' : 'Links to: ') : 'Linked from: '}${node.title || 'Untitled'}`}</title>
                  <line x1={out ? cx + 7 : x + 5} y1={out ? cy : y} x2={out ? x - 5 : cx - 7} y2={out ? y : cy}
                    className={out ? 'text-[var(--tt-brand-color-400)]' : 'text-muted-foreground'} stroke="currentColor" strokeWidth={1}
                    markerEnd="url(#mf-arrow)" markerStart={node.way === 'both' ? 'url(#mf-arrow)' : undefined} />
                  <circle cx={x} cy={y} r={4.5} className="fill-accent stroke-muted-foreground" strokeWidth={1} />
                  <text x={x} y={y + 15} textAnchor="middle" className={`fill-muted-foreground text-[10px] ${node.private ? 'private-text' : ''}`}>{short(node.title)}</text>
                </motion.g>
              )
            })
          )}
          <circle cx={cx} cy={cy} r={7} className="fill-[var(--tt-brand-color-400)]" />
          <text x={cx} y={cy - 12} textAnchor="middle" className="fill-foreground text-[10px] font-medium">{short(title)}</text>
        </svg>
      )}
      {more > 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">and <Rolling text={more} /> more, under Linked from</p>}
    </Island>
  )
}
