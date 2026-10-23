import { useEffect, useRef, useState } from 'react'
import { layerOpen } from '@/lib/menu-keys'
import { createPortal } from 'react-dom'
import { AlignLeft, CalendarDays, Plus, Star } from 'lucide-react'
import { AliveIcon } from '@/components/ui/alive-icon'
import ClockIcon from '@/components/ui/clock-icon'
import PenIcon from '@/components/ui/pen-icon'
import UnlinkIcon from '@/components/ui/unlink-icon'

import { CAPTURE_TYPES } from '../capture-kinds/capture-kind-picker'
import { SUPER_TAGS, type Field } from '../capture-kinds/kind-fields'
import { Search } from '../search'
import { Command, CommandInput, CommandItem, CommandList, CommandShortcut } from '@/components/ui/command'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { chime, step, type Cue } from '@/lib/sound'
import { tintFor } from '@/lib/pictures'
import { notes, smallPicture, useThumb, type GraphNode, type MapEdge, type NoteTable, type Version } from '@/lib/notes'
import { useLive, haligtree } from '@/lib/haligtree'
import { Chips } from './display'
import { copy, flat, type MenuItem, type RowItem } from './row-menu'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import DotsHorizontalIcon from '@/components/ui/dots-horizontal-icon'
import BookIcon from '@/components/ui/book-icon'
import LayoutSidebarRightIcon from '@/components/ui/layout-sidebar-right-icon'
import { PAGE_WIDTHS, setPageWidth as setWidthEverywhere, showDetails, useDetailsShown, widthOf, type PageWidth } from '@/lib/reading'
import { canSplit, usePane, usePaneWidth } from '@/lib/split'
import { openApart } from '@/lib/apart'
import ExternalLinkIcon from '@/components/ui/external-link-icon'
import { ReadThrough } from './read-through'
import { Island, PropInput, Rolling, Tip, Typed, ask, refuse, toast, quietly } from './ui'
import { Does, GHOST, GhostText } from './ghost'
import { cn } from '@/lib/cn'
import ExpandIcon from '@/components/ui/expand-icon'
import { GraphCanvas, showOnMap, type Graph } from './graph-canvas'
import { age, dated as datedAs, dayKey, dayMonth, dayjs, daysFromToday, noon } from '../../../../main/dates'
import { moment, when } from '@/lib/clock'
import { DatePicker } from './date-picker'
import { keyFor } from '@/lib/keys'
import { Check, Link as Link2, ListTodo as ListChecks, Tag as Tags, Type, X } from '@/components/ui/icons'

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
    // Its colour until the small copy arrives (lib/pictures.ts).
    <span className={`private-text block shrink-0 overflow-hidden rounded-md border bg-accent/40 ${className}`} style={{ backgroundColor: shown ? undefined : tintFor(src) }}>
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
    window.addEventListener('haligtree:pick-kind', onAsk)
    return () => window.removeEventListener('haligtree:pick-kind', onAsk)
  }, [])
  if (!asked) return null
  const done = (kind: string | null): void => {
    asked.answer(kind)
    setAsked(null)
  }
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 pt-[22vh]" onMouseDown={() => done(null)}>
      <div role="dialog" aria-modal="true" aria-label="Change kind" className="w-80 overflow-hidden rounded-xl bg-popover shadow-(--mf-panel-shadow)" onMouseDown={(event) => event.stopPropagation()}>
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
          <CommandList className="max-h-[min(26rem,60vh)]">
            {CAPTURE_TYPES.map((type, index) => (
              <CommandItem key={type.id} value={type.label} onSelect={() => done(type.id)}>
                <type.icon style={{ color: type.tint }} />
                <span className="flex min-w-0 flex-col">
                  <span className="text-xs">{type.label}</span>
                  <span className="text-meta text-muted-foreground">{type.does}</span>
                </span>
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

/** What a status says when it is picked, and how it sounds. */
const STATUS: Record<string, { said: string; cue: Cue }> = {
  // A book's own.
  'book:Finished': { said: 'Finished: say what you will keep from it under “Takeaway”', cue: 'finding' }
}

/** The super tags a note carries: its kind's, then each #tag's (built in or given properties), each field once. */
let ownSeen: Record<string, Field[]> = {}
export function useSuperTags(table: NoteTable, id: string, kind: string, known?: string[]): [name: string, fields: Field[]][] {
  // `known`: the tags as the list already read them, so the first frame has them.
  const tags = useLive(() => notes.tags(table, id), known ?? ([] as string[]), [table, id])
  // The tags you gave properties, as last read: the next note opens with them already in hand.
  const own = useLive(() => notes.tagFields().then((all) => (ownSeen = all)), ownSeen, [])
  const seen = new Set<string>()
  const all: [string, Field[]][] = []
  for (const name of [kind, ...tags]) {
    if (all.some(([one]) => one === name)) continue
    const fields = (own[name] ?? SUPER_TAGS[name] ?? []).filter((field) => !seen.has(field.key))
    fields.forEach((field) => seen.add(field.key))
    if (fields.length) all.push([name, fields])
  }
  return all
}

/**
 * The fields this note's super tags bring (its kind's, a #book's), in the
 * properties column, with their own controls: stars, choices, a date.
 * Nothing is ever required: a field is there for when you want it. Every
 * other property is in the strip under the title (property-strip.tsx).
 */
export function KindFields({ table, id, kind, onOpen }: { table: NoteTable; id: string; kind: string; onOpen?: (type: string, id: string) => void }): React.JSX.Element | null {
  const groups = useSuperTags(table, id, kind)
  // Tagged with the note they belong to: until this note's own have come in,
  // a field would start from nothing (or the last note's words) and a blur
  // would write that over what is kept.
  const read = useLive(() => notes.fields(table, id).then((values) => ({ of: `${table}:${id}`, values })), { of: '', values: {} as Record<string, string | number> }, [table, id])
  const values = read.values
  if (!groups.length || read.of !== `${table}:${id}`) return null
  // `quiet`: the control already answered (a star's own note), so saving adds no second sound.
  const save = (key: string, value: string | number | null, quiet = false): void => {
    if ((values[key] ?? null) === (value === '' ? null : value)) return
    void notes.setField(table, id, key, value === '' ? null : value).then(() => quiet || chime('noted'))
  }
  // A status picked (or picked again, to clear it), taken back whole by the undo.
  const pick = (key: string, option: string, tag: string): void => {
    const next = values[key] === option ? null : option
    const was = values[key] ?? null
    void notes.setField(table, id, key, next).then(() => {
      const says = next ? STATUS[`${tag}:${next}`] : undefined
      chime(next ? says?.cue ?? 'tap' : 'off')
      toast(next ? says?.said ?? next : 'No status', () => void notes.setField(table, id, key, was).then(() => chime('undo')))
    })
  }
  const longBox = (field: Field, value: string | number | undefined): React.JSX.Element => (
    <label data-ghost-field={field.ghost && !value ? '' : undefined} key={`${id}-${field.key}-${value ?? ''}`} className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-accent focus-within:bg-accent">
      <AlignLeft className="mt-1 size-4 shrink-0" />
      <span className="flex min-w-0 flex-1 flex-col">
        {/* Once filled, the placeholder that said what it was is gone: the name stays above. */}
        {value || field.ghost ? <span className="text-meta">{field.label}</span> : null}
        <Textarea rows={2} defaultValue={String(value ?? '')} placeholder={field.ghost ?? field.placeholder ?? field.label} aria-label={field.label} onBlur={(event) => save(field.key, event.target.value.trim())}
          className={cn('min-h-0 resize-none border-0 bg-transparent p-0 text-control text-foreground shadow-none focus-visible:ring-0 dark:bg-transparent', field.ghost && GHOST)} />
      </span>
    </label>
  )
  const longField = (field: Field, value: string | number | undefined): React.JSX.Element => <Does key={`${id}-${field.key}-${value ?? ''}`} does={field.does} set={!!value}>{longBox(field, value)}</Does>
  // One island of fields: a super tag's (its name, so a book's Finished says its own thing).
  const island = (tag: string, title: string, fields: Field[]): React.JSX.Element | null => !fields.length ? null : (
    <Island key={tag} compact title={title}>
      {fields.map((field) => {
        const value = values[field.key]
        if (field.type === 'hidden') return null
        // Shown only once a status is picked: until then, a faint line says when it comes.
        if (field.when && values[field.when[0]] !== field.when[1] && !value)
          return (
            <Does key={field.key} does={field.does}>
              <p className="flex items-center gap-2 px-2 py-1.5 text-control"><AlignLeft className="size-4 shrink-0" /><GhostText>{field.label}: shows once you mark it {field.when[1]}</GhostText></p>
            </Does>
          )
        if (field.type === 'choice')
          return (
            <div key={field.key} className="px-2 py-1">
              <Does does={field.does} set={!!value}>
              <div className="flex items-center gap-2">
                <ListChecks className="size-4 shrink-0" />
                <Chips options={(field.options ?? []).map((option) => ({ id: option, label: option }))} on={(option) => value === option} pick={(option) => pick(field.key, option, tag)} />
              </div>
              </Does>
            </div>
          )
        if (field.type === 'date')
          return <DateField key={field.key} field={field} value={value}
            // Nothing comes back once it is answered after its day.
            settled={!!values.answeredAt && !!value && dayKey(String(values.answeredAt)) >= dayKey(String(value))} onSave={(iso) => {
            const was = value ?? null
            void notes.setField(table, id, field.key, iso).then(() => {
              chime(iso ? 'pin' : 'off')
              toast(iso ? `On ${dayMonth(iso)} it comes back and asks you` : `${field.label}: cleared`, () => void notes.setField(table, id, field.key, was).then(() => chime('undo')))
            })
          }} />
        if (field.type === 'link')
          return <LinkField key={field.key} label={field.label} placeholder={field.placeholder ?? field.label} ghost={field.ghost} does={field.does} value={value ? String(value) : null} onOpen={onOpen}
            onSave={(link) => {
              const was = value ?? null
              void notes.setField(table, id, field.key, link).then(() => {
                chime(link ? 'noted' : 'off')
                quietly(() => void notes.setField(table, id, field.key, was).then(() => chime('undo')))
              })
            }} />
        if (field.type === 'rating')
          return (
            <Does key={field.key} does={field.does} set={!!value}>
            <div data-ghost={value ? undefined : ''} className="group/stars flex items-center gap-2 px-2 py-1.5" role="group" aria-label={`${field.label}: ${value ?? 'none'} of 5`}>
              <span className="w-12 text-meta">{field.label}</span>
              {[1, 2, 3, 4, 5].map((n) => (
                // Unrated, five faint stars: there to be seen, plainly not a score.
                <button key={n} type="button" aria-label={`${n} of 5`} onClick={() => (step(n - 1), save(field.key, value === n ? null : n, true))} className={`text-muted-foreground hover:text-foreground ${value ? '' : 'opacity-45 group-hover/stars:opacity-100 motion-safe:transition-opacity'}`}>
                  <Star className="size-4" style={Number(value) >= n ? { fill: 'var(--tt-color-text-yellow)', color: 'var(--tt-color-text-yellow)' } : undefined} />
                </button>
              ))}
            </div>
            </Does>
          )
        if (field.type === 'long') return longField(field, value)
        return <PropInput key={`${id}-${field.key}-${value ?? ''}`} icon={Type} value={String(value ?? '')} placeholder={field.placeholder ?? field.label} ghost={field.ghost} does={field.does} onSave={(text) => save(field.key, text)} />
      })}
    </Island>
  )
  return (
    <>
    {groups.map(([tag, fields]) => island(tag, tag === kind ? `${CAPTURE_TYPES.find((type) => type.id === kind)?.label ?? 'Kind'} details` : `#${tag}`, fields))}
    </>
  )
}

/**
 * A link named after its page says what the page called itself, not what it
 * is about to you. Offered once, in place, while the two are the same: name
 * it after its topic. The page's own title stays as its source, in "Title".
 */
export function TopicName({ id }: { id: string }): React.JSX.Element | null {
  const read = useLive(() => Promise.all([window.api.captures.get(id), notes.fields('captures', id)]).then(([found, fields]) => ({ own: found?.title ?? '', source: String(fields.title ?? '') })), { own: '', source: '' }, [id])
  const { own, source } = read
  if (!source || own.trim() !== source.trim()) return null
  const name = async (): Promise<void> => {
    const text = (await ask('What is it about, in your words?', 'e.g. why sleep helps memory', undefined, ''))?.trim()
    if (!text || text === own) return
    await window.api.captures.save(id, { title: text })
    chime('noted')
    toast(`Named “${text}”. The page's own title stays as its source`, () => void window.api.captures.save(id, { title: own }).then(() => chime('undo')))
  }
  return (
    <button type="button" data-topic-name onClick={() => void name()} className="flex w-full items-start gap-2 px-2 py-1.5 text-left text-control text-foreground hover:bg-accent">
      <Type className="mt-0.5 size-4 shrink-0" />
      <span>Named after the page. <span className="font-medium underline">Name it after its topic</span></span>
    </button>
  )
}

/**
 * A day that brings the note back: said in words or picked, with its name
 * beside it like a link's. A date written as words before this was a date
 * shows as it was, until one is picked.
 */
export function DateField({ field, value, settled, onSave }: { field: Field; value: string | number | undefined; settled: boolean; onSave: (iso: string | null) => void }): React.JSX.Element {
  const iso = typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) ? value : null
  const due = !!iso && !settled && daysFromToday(iso) <= 0
  return (
    <Does does={field.does} set={!!value}>
    <div>
    <DatePicker value={iso} onChange={onSave} suggest={field.suggest} className="w-full rounded-none">
      <CalendarDays className="size-4 shrink-0" />
      <span className="w-16 shrink-0 truncate text-meta">{field.label}</span>
      <span className={`min-w-0 flex-1 truncate ${iso ? 'text-foreground' : 'text-foreground/70'}`}>
        {iso ? when(iso) : value ? String(value) : field.ghost ? <GhostText>{field.ghost}</GhostText> : field.placeholder}
      </span>
      {due && <span className="shrink-0 rounded-full px-1.5 text-xs" style={{ color: 'var(--tt-color-text-orange)', background: 'color-mix(in oklab, var(--tt-color-text-orange) 12%, transparent)' }}>Due</span>}
    </DatePicker>
    </div>
    </Does>
  )
}

/** A day's page, by its date: "Mon 5 Oct". */
const dayPage = (day: string): string => datedAs(noon(day), 'ddd D MMM')

/**
 * A field that holds a link to another note or a day's page: its name, which
 * opens it, and search to pick or change it. Days are offered first, since a
 * day is what most often starts something.
 */
export function LinkField({ label, placeholder, ghost, does, value, onSave, onOpen }: {
  label: string
  placeholder: string
  /** A faint example while nothing is linked: never saved. */
  ghost?: string
  does?: string
  value: string | null
  onSave: (link: string | null) => void
  onOpen?: (type: string, id: string) => void
}): React.JSX.Element {
  const [picking, setPicking] = useState(false)
  const target = useLive(() => (value ? haligtree.linkTitle(value) : Promise.resolve(null)), null as Awaited<ReturnType<typeof haligtree.linkTitle>>, [value])
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
        <Does does={does}>
          <button type="button" data-ghost-field={ghost ? '' : undefined} aria-label={placeholder} onClick={() => (chime('open'), setPicking(true))} className="min-w-0 flex-1 truncate text-left text-control text-foreground/70 hover:text-foreground">{ghost ? <GhostText>{ghost}</GhostText> : placeholder}</button>
        </Does>
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
          menus={false}
          placeholder="Link a day, a page, any note…"
          actions={days.map((day, back) => ({ label: back === 0 ? "Today's page" : back === 1 ? "Yesterday's page" : `${dayPage(day)}'s page`, run: () => onSave(`day:${day}`) }))}
          onClose={() => setPicking(false)}
          onOpen={(type, id) => {
            setPicking(false)
            if (type === 'task') return refuse('A task cannot be linked here. Pick a day or a note')
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
 * it with. Search, ⌘K and @ links all find the note by them.
 */
export function Aliases({ table, id }: { table: NoteTable; id: string }): React.JSX.Element {
  const read = useLive(() => haligtree.aliases(table, id).then((list) => ({ of: id, list })), { of: '', list: [] as string[] }, [table, id])
  const list = read.of === id ? read.list : []
  const set = (next: string[], said: string, cue: Cue): void =>
    void haligtree.setAliases(table, id, next).then((was) => {
      if (!was) return refuse('That note no longer exists, so nothing was changed')
      chime(cue)
      toast(said, () => void haligtree.setAliases(table, id, was).then(() => chime('undo')))
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
      <Does does="Other names for this note. Search, ⌘K and @ links find it by these too" set={list.length > 0}>
      <label data-ghost-field={list.length ? undefined : ''} className="flex cursor-text items-center gap-2 px-2 py-1.5 hover:bg-accent focus-within:bg-accent">
        <Plus className="size-4 shrink-0" />
        <input
          key={`${id}-${list.length}`}
          placeholder={list.length ? 'Another name…' : 'A nickname, or a short name'}
          aria-label="Another name for this note"
          onKeyDown={(event) => {
            if (event.key === 'Escape') return event.currentTarget.blur()
            if (event.key !== 'Enter') return
            const name = event.currentTarget.value.trim()
            if (!name) return
            if (list.some((one) => one.toLowerCase() === name.toLowerCase())) return refuse(`Already called “${name}”`)
            set([...list, name], `Also called “${name}”: search finds it by that now`, 'alias')
          }}
          className={cn('min-w-0 flex-1 bg-transparent text-control text-ellipsis text-foreground outline-none placeholder:text-foreground/70', !list.length && GHOST)}
        />
      </label>
      </Does>
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
    window.addEventListener('haligtree:versions', onAsk)
    return () => window.removeEventListener('haligtree:versions', onAsk)
  })
  useEffect(() => close, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  // Escape is back to now, and only that: taken first, so the note stays open.
  useEffect(() => {
    if (!list) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      // A menu, ⌘K or a dialog over it takes its own Escape first; the versions stay.
      if (layerOpen()) return
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
      <Slider aria-label="Version" className="w-32 shrink-0" min={0} max={Math.max(1, list.length - 1)} step={1} disabled={list.length < 2}
        value={[list.length - 1 - at]} onValueChange={([value]) => {
          const index = list.length - 1 - value
          if (index === at) return
          chime('page')
          show(list, index)
        }} />
      {/* Said in words, so typing into a page that will not change is never a puzzle. */}
      <span data-version-said className="truncate tabular-nums"><strong className="font-semibold text-foreground">{at === 0 ? 'The latest version' : 'An older version, to read'}</strong>, saved <Rolling text={whenSaved(version.savedAt)} by="word" /></span>
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

/** How much of the page a width takes, as the share of the glyph's middle the lines fill. */
const SPAN: Record<PageWidth, number> = { narrow: 0.35, wide: 0.68, full: 1 }

/**
 * A page drawn small: its edges, and three lines of writing as wide as the
 * page's words are. The lines stretch to the new width rather than swapping,
 * so the button shows what it just did.
 */
function WidthGlyph({ width }: { width: PageWidth }): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden className="size-4">
      <path d="M1.75 3v10M14.25 3v10" />
      <g style={{ transform: `scaleX(${SPAN[width]})`, transformOrigin: '8px 8px' }} className="transition-transform duration-200 ease-out motion-reduce:transition-none">
        <path d="M3.75 5h8.5M3.75 8h8.5M3.75 11h8.5" />
      </g>
    </svg>
  )
}

/**
 * Narrow, Wide or Full, in the note's ⋯ menu: a submenu with a tick on the
 * width now. The same choice as in Settings, kept for every note and every window.
 */
function PageWidthMenu({ width: everywhere }: { width: PageWidth }): React.JSX.Element {
  // Split, each pane keeps its own: a note read beside another can sit in a column while that one runs wide.
  const pane = usePaneWidth()
  const width = pane?.width ?? everywhere
  const setPageWidth = (next: PageWidth): void => (pane ? pane.set(next) : setWidthEverywhere(next))
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger data-page-width={width}>Page width</DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-40">
        <DropdownMenuRadioGroup value={width} onValueChange={(next) => next !== width && setPageWidth(next as PageWidth)}>
          {PAGE_WIDTHS.map((one) => (
            <DropdownMenuRadioItem key={one.id} value={one.id} className="gap-2">
              <span className="text-muted-foreground"><WidthGlyph width={one.id} /></span>
              {one.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

const TOOL = 'flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground [&_svg]:size-4'

/**
 * The row over an open note: where it sits in the list on the left; on the
 * right, quietly, when it last changed (a click goes back through its
 * versions), a book to read it, and everything else behind the dots. `looking` takes the right side while an older text is shown.
 */
export function NoteHeader({ left, type = 'capture', edited, captured, made = 'Captured', pinned, onPin, copyKey, menu, looking, board, tools, details = true, className = '', ...versions }: {
  left?: React.ReactNode
  /** What it is, for reading it: capture, nugget, article, question. */
  type?: string
  /** When its words last changed, or null if never since it was made. */
  edited: string | null
  captured: string
  made?: string
  pinned?: boolean
  onPin?: () => void
  /** A link to this note, as `noteLinkText` writes it. */
  copyKey?: string
  /** Its lines; one with `items` opens them beside it (Hide until…), as the row's menu does. */
  menu: (MenuItem | { label: string; items: RowItem[] })[]
  looking?: React.ReactNode
  /** The switch between the note and its board, for a note that reads as one. */
  board?: { on: boolean; toggle: () => void }
  /** A view's own tools, in the same row before the switch: the board's find, archive and new list. */
  tools?: React.ReactNode
  /** The button that brings out the note's details beside it, put away until asked for. */
  details?: boolean
  className?: string
} & Parameters<typeof Versions>[0]): React.JSX.Element {
  const at = edited && edited > captured ? edited : captured
  const old = age(at)
  const verb = edited && edited > captured ? 'Edited' : made
  const said = `${verb} ${old === 'now' ? 'just now' : `${old} ago`}`
  // In a narrow pane, "Edited 2m": shorter, never cut off mid-word.
  const short = `${verb} ${old === 'now' ? 'now' : old}`
  // The header's own lines are not said twice when the note's menu has them too.
  const OWN = ['Pin', 'Unpin', 'Pin to the sidebar', 'Copy link', 'Version history']
  const items = menu.filter((item) => item && (item === 'separator' || !OWN.includes(item.label))) as Exclude<MenuItem | { label: string; items: RowItem[] }, false | null | undefined>[]
  const [reading, setReading] = useState(false)
  const detailsOut = useDetailsShown()
  const inPane = usePane()
  const width = widthOf(useLive(haligtree.settings, null))
  return (
    <div data-note-head className={`@container/head flex min-h-7 items-center justify-between gap-2 px-3 @[40rem]/page:px-[clamp(0.75rem,10%,4.25rem)] ${className}`}>
      {reading && <ReadThrough items={[{ type, id: versions.id }]} onClose={() => setReading(false)} />}
      {left ?? <span />}
      {looking ?? (
        <Versions {...versions} trigger={(open) => (
          // On the right even when there is no list position to its left.
          <div className="ml-auto flex min-w-0 items-center gap-0.5">
            <Tip label={moment(at, 'dddd')}>
              <button type="button" aria-label={said} onClick={open} className="mr-1 hidden shrink-0 rounded-md @[26rem]/head:block px-1.5 py-1 text-xs whitespace-nowrap text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                <span className="hidden @[30rem]/head:inline">{said}</span>
                <span className="@[30rem]/head:hidden">{short}</span>
              </button>
            </Tip>
            {tools}
            <Tip label="Read">
              <button type="button" aria-label="Read" onClick={() => (chime('open'), setReading(true))} className={TOOL}><AliveIcon icon={BookIcon} size={16} /></button>
            </Tip>
            {/* Out to a small window of its own, as Arc's Little Arc; ⌘O there brings it back. Main window only. */}
            {canSplit() && type !== 'task' && type !== 'goal' && (
              <Tip label="Open in its own window  ⌘O">
                <button type="button" aria-label="Open in its own window" data-open-apart onClick={() => openApart(type, versions.id)} className={TOOL}><AliveIcon icon={ExternalLinkIcon} size={16} /></button>
              </Tip>
            )}
            {details && (
              <Tip label={detailsOut ? 'Hide details' : 'Details'}>
                {/* Named in words where there is room: guides and examples send you to “Details”, so it says so. */}
                <button type="button" aria-label="Details" aria-pressed={detailsOut} onClick={() => showDetails(!detailsOut, inPane)} className={`${TOOL} @[34rem]/head:w-auto @[34rem]/head:gap-1.5 @[34rem]/head:px-1.5 @[34rem]/head:text-xs ${detailsOut ? 'bg-accent text-foreground' : ''}`}><AliveIcon icon={LayoutSidebarRightIcon} size={16} /><span className="hidden @[34rem]/head:inline">Details</span></button>
              </Tip>
            )}
            <DropdownMenu modal={false}>
              <Tip label="More">
                <DropdownMenuTrigger asChild>
                  <button type="button" aria-label="More" className={TOOL}><AliveIcon icon={DotsHorizontalIcon} size={16} /></button>
                </DropdownMenuTrigger>
              </Tip>
              <DropdownMenuContent align="end" className="w-56">
                {onPin && <DropdownMenuItem onSelect={onPin}>{pinned ? 'Unpin' : 'Pin to the sidebar'}</DropdownMenuItem>}
                {copyKey && <DropdownMenuItem onSelect={() => copy(copyKey, 'Copied a link: paste it into any note')}>Copy link</DropdownMenuItem>}
                <DropdownMenuItem onSelect={open}>Version history</DropdownMenuItem>
                <DropdownMenuSeparator />
                {board && (
                  <DropdownMenuItem role="menuitemcheckbox" aria-checked={board.on} onSelect={board.toggle}>
                    Board view
                    <DropdownMenuShortcut>⌥⌘B</DropdownMenuShortcut>
                    <span className="flex w-3.5 justify-center">{board.on && <Check />}</span>
                  </DropdownMenuItem>
                )}
                <PageWidthMenu width={width} />
                {details && <DropdownMenuItem onSelect={() => showDetails(!detailsOut, inPane)}>{detailsOut ? 'Hide details' : 'Show details'}</DropdownMenuItem>}
                {items.map((item, index) =>
                  item === 'separator' ? (
                    items[index - 1] !== 'separator' && index < items.length - 1 && <DropdownMenuSeparator key={`separator-${index}`} />
                  ) : 'items' in item ? (
                    <DropdownMenuSub key={item.label}>
                      <DropdownMenuSubTrigger>{item.label}</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {flat(item.items).map((one, at) => one === 'separator' ? <DropdownMenuSeparator key={`separator-${at}`} /> : one && <DropdownMenuItem key={one.label} onSelect={one.run}>{one.label}</DropdownMenuItem>)}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
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

/**
 * A small live Map of one note: it in the middle, every note it links to or
 * is linked from around it, and the links between those, so neighbours that
 * belong together cluster. It and its busiest few are named; pointed at, a
 * dot names itself and lights up its links; clicked, it opens. Drag to move,
 * pinch or ⌘-scroll to zoom. The button opens the whole Map on this note.
 */
export function LocalGraph({ id, title, onOpen }: { id: string; title: string; onOpen?: (type: string, id: string) => void }): React.JSX.Element | null {
  const [graph, setGraph] = useState<(Graph & { out: number; in: number }) | null>(null)
  const fit = useRef<() => void>(() => undefined)
  const named = useRef(title)
  named.current = title
  useEffect(() => {
    let gone = false
    // Its own links, with each neighbour's kind, size and links to the others from the whole map.
    const load = (): void => void Promise.all([notes.graph(id), notes.map()]).then(([own, all]) => {
      if (gone) return
      const known = new Map(all.nodes.map((node) => [node.id, node]))
      const around = new Map<string, GraphNode>()
      for (const node of [...own.out, ...own.in]) around.set(node.id, node)
      // Each link weighed as on the Map, by how often the two link.
      const weight = new Map(all.edges.map(([a, b, times]) => [`${a} ${b}`, times ?? 1]))
      const edges: MapEdge[] = [...around.keys()].map((other) => [id, other, weight.get(id < other ? `${id} ${other}` : `${other} ${id}`) ?? 1])
      for (const [a, b, times] of all.edges) if (a !== id && b !== id && around.has(a) && around.has(b)) edges.push([a, b, times])
      const next = {
        nodes: [
          { type: 'capture', id, title: named.current, kind: known.get(id)?.kind ?? 'note', links: around.size, picture: known.get(id)?.picture },
          // With its tag's colour and its picture, as on the Map.
          ...[...around.values()].map((node) => ({ type: node.type, id: node.id, title: node.title, kind: known.get(node.id)?.kind ?? 'note', links: known.get(node.id)?.links ?? 1, private: !!node.private, tag: known.get(node.id)?.tag, tint: known.get(node.id)?.tint, picture: node.private ? undefined : known.get(node.id)?.picture }))
        ],
        edges, alone: 0, out: own.out.length, in: own.in.length
      }
      setGraph((last) => (JSON.stringify(last) === JSON.stringify(next) ? last : next))
    })
    load()
    // After things settle, not on every keystroke of an autosave: the links
    // are read from every note's words.
    let timer: ReturnType<typeof setTimeout> | undefined
    const stop = window.api.captures.onChange(() => {
      clearTimeout(timer)
      timer = setTimeout(load, 1500)
    })
    return () => {
      gone = true
      clearTimeout(timer)
      stop()
    }
  }, [id])
  if (!graph) return null
  const linked = graph.nodes.length - 1
  return (
    <Island compact title="Links">
      {!linked ? (
        <p className="px-2 py-1.5 text-xs text-muted-foreground"><Typed text="No links yet. Type @ in the note to link another, and it shows here." step={25} /></p>
      ) : (
        <div data-local-graph>
          <GraphCanvas map={graph} centre={id} fit={fit} onOpen={(type, to) => onOpen?.(type, to)} className="h-[248px]" />
          <div className="flex h-8 items-center gap-1 border-t border-border/60 pr-1 pl-2 text-xs text-muted-foreground">
            <span className="shrink-0 tabular-nums whitespace-nowrap"><Rolling text={graph.out} /> out · <Rolling text={graph.in} /> in</span>
            <Tip label="Fit">
              <button type="button" aria-label="Fit" onClick={() => (chime('tap'), fit.current())} className="ml-auto rounded-md p-1 transition-colors hover:bg-accent hover:text-foreground"><AliveIcon icon={ExpandIcon} size={14} /></button>
            </Tip>
            {onOpen && (
              <button type="button" onClick={() => (chime('open'), showOnMap(id), onOpen('view', 'map'))} className="min-w-0 truncate rounded-md px-1.5 py-1 whitespace-nowrap transition-colors hover:bg-accent hover:text-foreground">See on Map</button>
            )}
          </div>
        </div>
      )}
    </Island>
  )
}
