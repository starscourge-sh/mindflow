import { useEffect, useRef, useState } from 'react'
import { useReading } from '@/lib/reads-in'
import { AlignLeft, Calendar, ChevronRight, Clock, Hash, Link2, List, Plus, SquareCheck, Star, Tags, Text, X, type LucideIcon } from 'lucide-react'
import type { Editor } from '@tiptap/react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { chime, step } from '@/lib/sound'
import { notes, type NoteTable } from '@/lib/notes'
import { haligtree, useLive } from '@/lib/haligtree'
import { propSaid } from '@/lib/property-sorts'
import { OLD_LABELS, SUPER_TAGS, type Field } from '../capture-kinds/kind-fields'
import { PROP_TYPES, readValue, type PropType } from '../../../../main/property-words'
import { dayMonth } from '../../../../main/dates'
import { tagsIn } from '../../../../main/tag-words'
import { Chips } from './display'
import { DatePicker } from './date-picker'
import { Kbd, Tip, openTag, toast } from './ui'
import { hoverNote } from './note-preview'
import { FLOAT } from '@/lib/float'
import { useSuperTags } from './note-extras'
import { tagTint } from './tag-icon'

type Value = string | number | boolean
const SHUT = 'propertiesShut'
/** Every property name in use, as last read: the next note opens with them in hand. */
let namesSeen: Awaited<ReturnType<typeof notes.propNames>> = []
/** One property as the strip shows it: a super tag's field, or one of the note's own. */
type Prop = { key: string; label: string; type: PropType | 'rating' | 'long'; options: string[]; tag: string | null; field?: Field; value: Value | undefined }

/** A field's type in the strip's words: a super tag's kinds of field read as a property's. */
const typeOf = (field: Field): Prop['type'] =>
  field.type === 'rating' ? 'rating' : field.type === 'long' ? 'long' : field.type === 'choice' ? 'choice' : field.type === 'date' ? 'date' : field.type === 'link' ? 'link' : 'text'

/** Keys the app keeps for itself, never shown: when a thing was decided or answered. */
const KEPT = new Set(['_kept', 'decidedAt', 'heldAt', 'answeredAt'])

/** A value, said short: "3 Nov", "Yes", "★★★★". */
function said(prop: Prop): string {
  const { value } = prop
  if (value === undefined || value === '') return ''
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (prop.type === 'rating') return '★'.repeat(Math.max(0, Math.min(5, Number(value) || 0)))
  // A date says itself as one, whatever the property is typed as.
  if (typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value)) return dayMonth(value)
  const text = String(value)
  return text.length > 48 ? `${text.slice(0, 47)}…` : text
}

/** A linked note's name, once looked up. */
function LinkName({ link }: { link: string }): React.JSX.Element {
  const target = useLive(() => haligtree.linkTitle(/^(capture|nugget|article|question|day):/.test(link) ? link : link), null as Awaited<ReturnType<typeof haligtree.linkTitle>>, [link])
  return <>{target?.title || link}</>
}

/**
 * A note's properties, in a quiet strip under its title: each a name and a
 * value, pressed to change. What its super tags bring (a #book's Status, a
 * Check back's day) shows even while empty, faint, so you see what it asks
 * for; "Add property" (⌥⌘P) is always at the end, in the same place.
 */
export function PropertyStrip({ table, id, kind, fields, text, created, updated }: {
  table: NoteTable
  id: string
  kind: string
  /** The note's properties and its words as the list already holds them: drawn in the first frame, read fresh after. */
  fields?: string | null
  text?: string
  /** When it was made and last changed: shown, read-only. */
  created?: string | null
  updated?: string | null
}): React.JSX.Element | null {
  const known = text === undefined ? undefined : tagsIn(text)
  const groups = useSuperTags(table, id, kind, known)
  const first = (): { of: string; values: Record<string, Value> } => {
    if (fields === undefined) return { of: '', values: {} }
    try { return { of: `${table}:${id}`, values: JSON.parse(fields ?? 'null') ?? {} } } catch { return { of: `${table}:${id}`, values: {} } }
  }
  const read = useLive(() => notes.fields(table, id).then((values) => ({ of: `${table}:${id}`, values: values as Record<string, Value> })), first(), [table, id])
  const names = useLive(() => notes.propNames().then((all) => (namesSeen = all)), namesSeen, [])
  const tags = useLive(() => notes.tags(table, id), known ?? ([] as string[]), [table, id])
  const [open, setOpen] = useState<string | null>(null)
  // Folded shut or open, the same for every note, remembered.
  const [shut, setShutState] = useState(() => { try { return localStorage.getItem(SHUT) === '1' } catch { return false } })
  const setShut = (next: boolean): void => { setShutState(next); try { localStorage.setItem(SHUT, next ? '1' : '0') } catch { /* kept for now only */ } }
  const strip = useRef<HTMLDivElement | null>(null)
  const values = read.of === `${table}:${id}` ? read.values : {}
  // The page waits for the strip's values, so it never pops in after the words.
  useReading(read.of !== `${table}:${id}`)
  const typeFor = (name: string): PropType | null => (names.find((one) => one.name.toLowerCase() === name.toLowerCase())?.type as PropType | null) ?? null
  const optionsFor = (name: string): string[] => names.find((one) => one.name.toLowerCase() === name.toLowerCase())?.options ?? []
  const fromTags: Prop[] = groups.flatMap(([tag, fields]) => fields.filter((field) => field.type !== 'hidden').map((field) => ({ key: field.key, label: field.label, type: typeOf(field), options: field.options ?? [], tag, field, value: values[field.key] })))
  const own: Prop[] = Object.keys(values).filter((key) => !KEPT.has(key) && !fromTags.some((prop) => prop.key === key)).map((key) => {
    const value = values[key]
    const guessed: PropType = typeof value === 'boolean' ? 'bool' : typeof value === 'number' ? 'number' : typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) ? 'date' : 'text'
    return { key, label: OLD_LABELS[key] ?? key, type: typeFor(key) ?? guessed, options: optionsFor(key), tag: null, value }
  })
  const all = [...fromTags, ...own]

  // ⌥⌘P adds one, in the page the keys are in (or the only one open).
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!event.metaKey || !event.altKey || event.code !== 'KeyP') return
      const here = strip.current?.closest('.note-pane, [data-note-page], main') ?? null
      const strips = document.querySelectorAll('[data-property-strip]')
      if (strips.length > 1 && !(here && document.activeElement && here.contains(document.activeElement))) return
      event.preventDefault()
      // Before ⌘P's search hears it: caught on the way down.
      event.stopImmediatePropagation()
      chime('open')
      setShut(false)
      setOpen('+')
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const save = async (key: string, value: Value | null, label = key): Promise<void> => {
    const was = values[key] ?? null
    if (was === value) return
    await notes.setField(table, id, key, value === '' ? null : value)
    chime(value === null || value === '' ? 'off' : 'noted')
    toast(value === null || value === '' ? `${propSaid(label)}: cleared` : `${propSaid(label)}: ${said({ ...(all.find((one) => one.key === key) ?? { key, label, type: 'text', options: [], tag: null }), value })}`,
      () => void notes.setField(table, id, key, was).then(() => chime('undo')))
  }
  // A kind changed: words that do not read as the new one are kept as typed.
  const setType = (prop: Prop, type: PropType): void => void notes.setPropType(prop.key, type, prop.options).then(async () => {
    if (prop.value !== undefined && prop.value !== '') await notes.setField(table, id, prop.key, readValue(String(prop.value), type).value)
    chime('tap')
  })
  // A name set on the new row: kept with nothing in it yet, then its row's own editor opens, as any row's does.
  const named = async (typed: string): Promise<void> => {
    const key = names.find((one) => one.name.toLowerCase() === typed.toLowerCase())?.name ?? typed
    if (!all.some((prop) => prop.key === key)) {
      if (!typeFor(key)) await notes.setPropType(key, 'text')
      await notes.setField(table, id, key, '', true)
      chime('noted')
    }
    setOpen(key)
  }
  if (read.of !== `${table}:${id}`) return <div data-property-strip ref={strip} className="min-h-7" />
  // Nothing yet: only the quiet way to add one, in the place the block will open.
  const empty = !all.length && !tags.length && open !== '+'
  const addButton = (
    <Tip label="Add property, or type Name:: value on a line of its own (⌥⌘P)">
      <button type="button" data-add-property aria-label="Add property" onClick={() => (chime('open'), setShut(false), setOpen('+'))}
        className="inline-flex h-7 w-fit items-center gap-1.5 rounded-md px-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
        <Plus className="size-3.5" /><span>Add property</span>
      </button>
    </Tip>
  )
  // In a narrow pane each value goes under its name, so long ones (dates) never run into the row below.
  const row = 'grid grid-cols-1 items-start gap-x-2 @max-[24rem]/props:[&>:nth-child(2)]:ml-[1.375rem] @min-[24rem]/props:grid-cols-[minmax(7rem,9.5rem)_minmax(0,1fr)]'
  const nameCell = (Icon: LucideIcon, label: string, prop?: Prop): React.JSX.Element => (
    <span className="flex h-7 min-w-0 items-center gap-2 px-1.5 text-muted-foreground">
      {prop && !prop.tag ? (
        // The icon says the kind of value, and is where it changes.
        <Popover open={open === `kind:${prop.key}`} onOpenChange={(next) => setOpen(next ? `kind:${prop.key}` : null)}>
          <Tip label="Kind of value">
            <PopoverTrigger asChild>
              <button type="button" data-property-kind={prop.key} aria-label="Kind of value" className="-mx-1 grid size-6 shrink-0 place-items-center rounded-md transition-colors hover:bg-accent hover:text-foreground data-[state=open]:bg-accent"><Icon className="size-3.5" /></button>
            </PopoverTrigger>
          </Tip>
          <PopoverContent align="start" className="w-auto gap-0 p-1">
            {PROP_TYPES.map((one) => {
              const KindIcon = ICONS[one.id] ?? Text
              return (
                <button key={one.id} type="button" data-kind={one.id} data-on={one.id === prop.type ? '' : undefined} onClick={() => (setType(prop, one.id), setOpen(null))}
                  className="flex h-7 items-center gap-2 rounded-md px-2 text-left text-foreground transition-colors hover:bg-accent data-[on]:font-medium">
                  <KindIcon className="size-3.5 text-muted-foreground" />{one.label}
                </button>
              )
            })}
          </PopoverContent>
        </Popover>
      ) : <Icon className="size-3.5 shrink-0" />}
      <span className="truncate">{propSaid(label)}</span>
    </span>
  )
  return (
    <div data-property-strip data-properties-open={shut ? undefined : ''} ref={strip} className="@container/props flex flex-col py-1 text-meta" onMouseDown={(event) => event.stopPropagation()}>
      {empty ? addButton : (
        <>
          <button type="button" data-properties-head aria-expanded={!shut} onClick={() => (chime(shut ? 'open' : 'fold'), setShut(!shut))}
            className="inline-flex h-7 w-fit items-center gap-1 rounded-md px-1.5 font-medium text-foreground transition-colors hover:bg-accent">
            <ChevronRight className={`size-3.5 text-muted-foreground transition-transform duration-150 ${shut ? '' : 'rotate-90'}`} />Properties
            {shut && <span className="ml-1 font-normal text-muted-foreground">{all.length + (tags.length ? 1 : 0)}</span>}
          </button>
          {!shut && (
            <div className="flex flex-col">
              {tags.length > 0 && (
                <div className={row} data-property="tags">
                  {nameCell(Tags, 'tags')}
                  <div className="flex min-h-7 flex-wrap items-center gap-1 py-0.5">
                    {tags.map((tag) => (
                      <span key={tag} data-tag-chip={tag} className="inline-flex h-6 items-center gap-0.5 rounded-full bg-foreground/[0.06] pr-1 pl-2.5" style={{ color: tagTint(tag) }}>
                        {/* The tag is a way to its page, as everywhere (⌥-click beside); the × only takes it off. */}
                        <button type="button" data-tag-open={tag} {...hoverNote('tag', tag)} onClick={(event) => openTag(tag, event.altKey)} className="rounded-sm hover:underline">{tag}</button>
                        <Tip label={`Take #${tag} off this note`}>
                          <button type="button" aria-label={`Remove #${tag}`} className="grid size-4 place-items-center rounded-full opacity-70 hover:bg-foreground/10 hover:opacity-100" onClick={() => untag(tag, strip.current)}><X className="size-3" /></button>
                        </Tip>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {all.map((prop) => (
                <div key={`${prop.tag ?? ''}:${prop.key}`} className={row}>
                  {nameCell(ICONS[prop.type] ?? Text, prop.label, prop)}
                  <Popover open={open === prop.key} onOpenChange={(next) => setOpen(next ? prop.key : null)}>
                    <PopoverTrigger asChild>
                      <button type="button" data-property={prop.key} data-empty={prop.value === undefined || prop.value === '' ? '' : undefined}
                        className="inline-flex h-7 min-w-0 items-center rounded-md px-1.5 text-left transition-colors hover:bg-accent data-[state=open]:bg-accent">
                        {prop.value === undefined || prop.value === '' ? <span className="text-muted-foreground/60">Empty</span>
                          : <span className="private-text truncate text-foreground">{prop.type === 'link' ? <LinkName link={String(prop.value)} /> : said(prop)}</span>}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-72 p-3" onOpenAutoFocus={(event) => prop.type === 'date' && event.preventDefault()}>
                      <PropEditor prop={prop} tags={tags} onSave={(value) => void save(prop.key, value, prop.label).then(() => setOpen(null))}
                        onRename={(to) => void notes.renameField(table, id, prop.key, to).then(() => (chime('retag'), setOpen(null), toast(`Renamed to “${to}”`, () => void notes.renameField(table, id, to, prop.key).then(() => chime('undo')))))}
                        onType={(type) => setType(prop, type)}
                        onSuper={(tag) => void addToTag(tag, prop).then(() => setOpen(null))} />
                    </PopoverContent>
                  </Popover>
                </div>
              ))}
              {open === '+' && (
                <NewProp className={row} names={names.filter((one) => !all.some((prop) => prop.key.toLowerCase() === one.name.toLowerCase()))}
                  onName={(name) => void named(name)} onCancel={() => setOpen(null)} />
              )}
              {/* Kept by the app, not typed: shown, never changed here. */}
              {created && <div className={row} data-property="created">{nameCell(Clock, 'created')}<span className="flex min-h-7 items-center px-1.5 text-foreground/80">{stamp(created)}</span></div>}
              {/* Never changed since: updated is when it was made. */}
              {(updated ?? created) && <div className={row} data-property="updated">{nameCell(Clock, 'updated')}<span className="flex min-h-7 items-center px-1.5 text-foreground/80">{stamp((updated ?? created) as string)}</span></div>}
              {addButton}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/** Each kind of value's icon, beside its name, as Obsidian draws them. */
const ICONS: Partial<Record<Prop['type'], LucideIcon>> = { text: Text, long: AlignLeft, number: Hash, date: Calendar, bool: SquareCheck, choice: List, link: Link2, rating: Star }

/** "6 May 2026, 15:26": when, said in full. */
const stamp = (iso: string): string => {
  const at = new Date(iso)
  return Number.isNaN(at.getTime()) ? iso : at.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** The editor the block sits in: tiptap keeps itself on its page's element. */
const editorOf = (node: HTMLElement | null): Editor | null => ((node?.closest('.ProseMirror') as (HTMLElement & { editor?: Editor }) | null)?.editor ?? null)

/** A tag taken off: every #tag in the words goes, in one step ⌘Z or the toast brings back. */
function untag(tag: string, node: HTMLElement | null): void {
  const editor = editorOf(node)
  if (!editor) return
  const found = new RegExp(`(^|\\s)#${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}_/-])`, 'giu')
  const cuts: { from: number; to: number }[] = []
  editor.state.doc.descendants((child, pos) => {
    if (!child.isText || !child.text) return
    for (const hit of child.text.matchAll(found)) cuts.push({ from: pos + (hit.index ?? 0) + hit[1].length, to: pos + (hit.index ?? 0) + hit[0].length })
  })
  if (!cuts.length) return
  const tr = editor.state.tr
  for (const cut of cuts.reverse()) tr.delete(cut.from, cut.to)
  editor.view.dispatch(tr)
  chime('off')
  toast(`#${tag} taken off`, () => (editor.commands.undo(), chime('undo')))
}

/**
 * A tag that brings properties: this one is added to the tag's own list, so
 * every note tagged with it shows it. Undoable.
 */
async function addToTag(tag: string, prop: Prop): Promise<void> {
  const own = await notes.tagFields()
  const was = own[tag] ?? null
  const fields: Field[] = [...(was ?? SUPER_TAGS[tag] ?? []), { key: prop.key, label: prop.label, type: prop.type === 'number' || prop.type === 'bool' ? 'text' : prop.type === 'rating' ? 'rating' : (prop.type as Field['type']), ...(prop.options.length ? { options: prop.options } : {}) }]
    .filter((field, at, list) => list.findIndex((one) => one.key === field.key) === at)
  await notes.setTagFields(tag, fields)
  chime('promote')
  toast(`Every note tagged #${tag} now has “${prop.label}”`, () => void notes.setTagFields(tag, was ?? []).then(() => chime('undo')))
}

/**
 * The new row, as Obsidian adds one: in the block, laid out as the others,
 * its name typed with the names this book already uses offered under it.
 * Enter or a click sets it; Esc, or leaving it with no name, takes the row away.
 */
function NewProp({ className, names, onName, onCancel }: {
  className: string
  names: { name: string; type: string | null }[]
  onName: (name: string) => void
  onCancel: () => void
}): React.JSX.Element {
  const [name, setName] = useState('')
  // Nothing marked until the arrows move: Enter on a new name keeps it as typed.
  const [at, setAt] = useState(-1)
  const typed = name.trim().toLowerCase()
  const starts = (one: { name: string }): number => Number(!one.name.toLowerCase().startsWith(typed))
  const offered = names.filter((one) => one.name.toLowerCase().includes(typed)).sort((a, b) => starts(a) - starts(b)).slice(0, 8)
  const Icon = ICONS[(names.find((one) => one.name.toLowerCase() === typed)?.type ?? 'text') as Prop['type']] ?? Text
  const pick = (one: string): void => (one.trim() ? onName(one.trim()) : onCancel())
  return (
    <div className={className} data-new-property>
      <span className="relative flex h-7 min-w-0 items-center gap-2 px-1.5 text-muted-foreground">
        <Icon className="size-3.5 shrink-0" />
        <input autoFocus value={name} placeholder="Name" aria-label="Property name" role="combobox" aria-expanded={offered.length > 0}
          onChange={(event) => (setName(event.target.value.replace(/:/g, '')), setAt(-1))}
          onBlur={() => pick(name)}
          onKeyDown={(event) => {
            // The page's own keys never hear it.
            event.stopPropagation()
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              if (offered.length) setAt((was) => (event.key === 'ArrowDown' ? (was + 1) % offered.length : was <= 0 ? offered.length - 1 : was - 1))
            } else if (event.key === 'Enter') {
              event.preventDefault()
              pick(offered[at]?.name ?? name)
            } else if (event.key === 'Escape') {
              event.preventDefault()
              onCancel()
            }
          }}
          className="h-7 min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground/60" />
        {offered.length > 0 && (
          <div role="listbox" data-name-options className={`${FLOAT} absolute top-full left-0 z-50 mt-1 flex max-h-64 w-56 flex-col overflow-y-auto rounded-lg p-1 duration-150 animate-in fade-in-0 slide-in-from-top-1`}>
            {offered.map((one, index) => {
              const KindIcon = ICONS[(one.type ?? 'text') as Prop['type']] ?? Text
              return (
                <button key={one.name} type="button" role="option" aria-selected={index === at} data-name-option={one.name} data-kind={one.type ?? 'text'}
                  // Down, not click: the name box keeps its focus, so this is never taken as leaving it.
                  onMouseDown={(event) => (event.preventDefault(), pick(one.name))} onMouseEnter={() => setAt(index)}
                  className="flex h-7 shrink-0 items-center gap-2 rounded-md px-2 text-left text-foreground aria-selected:bg-accent">
                  <KindIcon className="size-3.5 shrink-0 text-muted-foreground" /><span className="truncate">{propSaid(one.name)}</span>
                </button>
              )
            })}
          </div>
        )}
      </span>
      <span className="flex h-7 items-center px-1.5 text-muted-foreground/60">Empty</span>
    </div>
  )
}

/** One property's editor: its value in its own control, its type, its name, and the way to take it off. */
function PropEditor({ prop, tags, onSave, onRename, onType, onSuper }: {
  prop: Prop
  tags: string[]
  onSave: (value: Value | null) => void
  onRename: (to: string) => void
  onType: (type: PropType) => void
  onSuper: (tag: string) => void
}): React.JSX.Element {
  const [name, setName] = useState(prop.label)
  const text = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  const commit = (): void => {
    const raw = text.current?.value ?? ''
    onSave(raw.trim() ? readValue(raw, prop.type === 'long' || prop.type === 'rating' ? 'text' : prop.type).value : null)
  }
  const field = 'h-8 w-full rounded-md bg-foreground/[0.05] px-2.5 text-control text-foreground outline-none placeholder:text-foreground/60 focus-visible:ring-2 focus-visible:ring-ring/30'
  const control = (() => {
    if (prop.type === 'bool') return <Chips options={[{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }]} on={(one) => (one === 'yes' ? prop.value === true : prop.value === false)} pick={(one) => onSave(prop.value === (one === 'yes') ? null : one === 'yes')} />
    if (prop.type === 'choice')
      return (
        <div className="flex flex-col gap-1.5">
          {prop.options.length > 0 && <Chips options={prop.options.map((one) => ({ id: one, label: one }))} on={(one) => prop.value === one} pick={(one) => onSave(prop.value === one ? null : one)} />}
          {!prop.field && <input ref={(node) => void (text.current = node)} placeholder="Or type one" aria-label="Value" onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), commit())} className={field} />}
        </div>
      )
    if (prop.type === 'rating')
      return (
        <div className="flex items-center gap-1" role="group" aria-label={`${prop.label}: ${prop.value ?? 'none'} of 5`}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" aria-label={`${n} of 5`} onClick={() => (step(n - 1), onSave(prop.value === n ? null : n))} className="text-muted-foreground hover:text-foreground">
              <Star className="size-4" style={Number(prop.value) >= n ? { fill: 'var(--tt-color-text-yellow)', color: 'var(--tt-color-text-yellow)' } : undefined} />
            </button>
          ))}
        </div>
      )
    if (prop.type === 'date')
      return <DatePicker value={typeof prop.value === 'string' && /^\d{4}-\d\d-\d\dT/.test(prop.value) ? prop.value : null} onChange={(iso) => onSave(iso)} suggest={prop.field?.suggest ?? ['tomorrow', 'in a week', 'in a month']} className="w-full" />
    if (prop.type === 'long')
      return <textarea ref={(node) => void (text.current = node)} autoFocus rows={3} defaultValue={String(prop.value ?? '')} placeholder={prop.field?.ghost ?? prop.field?.placeholder ?? prop.label} aria-label={prop.label}
        onKeyDown={(event) => event.key === 'Enter' && (event.metaKey || !event.shiftKey) && (event.preventDefault(), commit())} className={`${field} h-auto resize-none py-1.5 [field-sizing:content]`} />
    return <input ref={(node) => void (text.current = node)} autoFocus defaultValue={prop.value === undefined ? '' : String(prop.value)} placeholder={prop.field?.ghost ?? prop.field?.placeholder ?? (prop.type === 'link' ? 'A note, as [[Its name]]' : prop.type === 'number' ? 'A number' : prop.label)} aria-label={prop.label}
      onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), commit())} className={field} />
  })()
  return (
    <div className="flex flex-col gap-2.5" onKeyDown={(event) => event.stopPropagation()}>
      {prop.tag ? (
        <p className="text-xs"><span className="font-medium text-foreground">{prop.label}</span> <span className="text-muted-foreground">from #{prop.tag}</span></p>
      ) : (
        <input value={name} onChange={(event) => setName(event.target.value.replace(/:/g, ''))} aria-label="Name" onBlur={() => name.trim() && name.trim() !== prop.key && onRename(name.trim())}
          onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), (event.target as HTMLInputElement).blur())}
          className="h-7 w-full rounded-md bg-transparent px-1 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:bg-accent" />
      )}
      {prop.field?.does && <p className="text-xs leading-relaxed text-muted-foreground">{prop.field.does}</p>}
      {control}
      {!prop.tag && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Kind of value</span>
          <Chips options={PROP_TYPES.map((one) => ({ id: one.id, label: one.label }))} on={(one) => one === prop.type} pick={(one) => onType(one as PropType)} />
        </div>
      )}
      {!prop.tag && tags.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Give it to every note tagged</span>
          <Chips options={tags.slice(0, 6).map((tag) => ({ id: tag, label: `#${tag}` }))} on={() => false} pick={onSuper} />
        </div>
      )}
      <div className="flex items-center justify-between">
        {prop.type !== 'bool' && prop.type !== 'choice' && prop.type !== 'rating' && prop.type !== 'date' ? <Button size="sm" variant="ghost" onClick={commit}>Save <Kbd>↵</Kbd></Button> : <span />}
        <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => onSave(null)}>{prop.tag ? 'Clear' : 'Remove'}</Button>
      </div>
    </div>
  )
}

/**
 * What a `Name:: value` line does in a note's page: kept as its property
 * (read as its type when the name has one), said in a toast with its undo.
 */
export const keepPropertyLine = (table: NoteTable, id: string) => (name: string, raw: string): boolean => {
  void (async () => {
    const known = (await notes.propNames()).find((one) => one.name.toLowerCase() === name.toLowerCase())
    const key = known?.name ?? name
    const read = readValue(raw, (known?.type as PropType | null) ?? null)
    const was = ((await notes.fields(table, id)) as Record<string, Value>)[key] ?? null
    if (!known?.type) await notes.setPropType(key, read.type)
    await notes.setField(table, id, key, read.value === '' ? null : read.value)
    chime('noted')
    toast(`${key}: kept as a property`, () => void notes.setField(table, id, key, was).then(() => chime('undo')))
  })()
  return true
}
