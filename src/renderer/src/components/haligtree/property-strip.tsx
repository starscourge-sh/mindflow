import { useEffect, useRef, useState } from 'react'
import { useReading } from '@/lib/reads-in'
import { Plus, Star } from 'lucide-react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { chime, step } from '@/lib/sound'
import { notes, type NoteTable } from '@/lib/notes'
import { haligtree, useLive } from '@/lib/haligtree'
import { OLD_LABELS, SUPER_TAGS, type Field } from '../capture-kinds/kind-fields'
import { PROP_TYPES, readValue, type PropType } from '../../../../main/property-words'
import { dayMonth } from '../../../../main/dates'
import { tagsIn } from '../../../../main/tag-words'
import { Chips } from './display'
import { DatePicker } from './date-picker'
import { Kbd, Tip, toast } from './ui'
import { useSuperTags } from './note-extras'

type Value = string | number | boolean
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
export function PropertyStrip({ table, id, kind, fields, text }: {
  table: NoteTable
  id: string
  kind: string
  /** The note's properties and its words as the list already holds them: drawn in the first frame, read fresh after. */
  fields?: string | null
  text?: string
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
    toast(value === null || value === '' ? `${label}: cleared` : `${label}: ${said({ ...(all.find((one) => one.key === key) ?? { key, label, type: 'text', options: [], tag: null }), value })}`,
      () => void notes.setField(table, id, key, was).then(() => chime('undo')))
  }
  if (read.of !== `${table}:${id}`) return <div data-property-strip ref={strip} className="min-h-7" />
  return (
    <div data-property-strip ref={strip} className="flex min-h-7 flex-wrap items-center gap-x-0.5 gap-y-0.5 py-0.5 text-meta" onMouseDown={(event) => event.stopPropagation()}>
      {all.map((prop) => (
        <Popover key={`${prop.tag ?? ''}:${prop.key}`} open={open === prop.key} onOpenChange={(next) => setOpen(next ? prop.key : null)}>
          <PopoverTrigger asChild>
            <button type="button" data-property={prop.key} data-empty={prop.value === undefined || prop.value === '' ? '' : undefined}
              className="inline-flex h-6 max-w-[18rem] items-center gap-1.5 rounded-md px-1.5 text-left transition-colors hover:bg-accent data-[state=open]:bg-accent">
              <span className="shrink-0 text-muted-foreground">{prop.label}</span>
              {prop.value === undefined || prop.value === '' ? <span className="text-muted-foreground/60">Empty</span>
                : <span className="private-text truncate text-foreground">{prop.type === 'link' ? <LinkName link={String(prop.value)} /> : said(prop)}</span>}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-3" onOpenAutoFocus={(event) => prop.type === 'date' && event.preventDefault()}>
            <PropEditor prop={prop} tags={tags} onSave={(value) => void save(prop.key, value, prop.label).then(() => setOpen(null))}
              onRename={(to) => void notes.renameField(table, id, prop.key, to).then(() => (chime('retag'), setOpen(null), toast(`Renamed to “${to}”`, () => void notes.renameField(table, id, to, prop.key).then(() => chime('undo')))))}
              onType={(type) => void notes.setPropType(prop.key, type, prop.options).then(async () => {
                // Read again as the new type: words that do not read as it are kept as typed.
                if (prop.value !== undefined) await notes.setField(table, id, prop.key, readValue(String(prop.value), type).value)
                chime('tap')
              })}
              onSuper={(tag) => void addToTag(tag, prop).then(() => setOpen(null))} />
          </PopoverContent>
        </Popover>
      ))}
      <Popover open={open === '+'} onOpenChange={(next) => setOpen(next ? '+' : null)}>
        <Tip label="Add a property: a name and a value. Or type Name:: value on a line of its own (⌥⌘P)">
          <PopoverTrigger asChild>
            <button type="button" data-add-property aria-label="Add property" className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[state=open]:bg-accent">
              <Plus className="size-3.5" />{all.length ? null : <span>Add property</span>}
            </button>
          </PopoverTrigger>
        </Tip>
        <PopoverContent align="start" className="w-72 p-3">
          <AddProp names={names.map((one) => one.name).filter((name) => !(name in values))} onAdd={(name, raw) => {
            const read = readValue(raw, typeFor(name))
            void (async () => {
              if (!typeFor(name)) await notes.setPropType(name, read.type)
              await save(name, read.value, name)
              setOpen(null)
            })()
          }} />
        </PopoverContent>
      </Popover>
    </div>
  )
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

/** A new property: its name (one in use offered), then its value, read as a number, a date, yes or no, or words. */
function AddProp({ names, onAdd }: { names: string[]; onAdd: (name: string, value: string) => void }): React.JSX.Element {
  const [name, setName] = useState('')
  const value = useRef<HTMLInputElement | null>(null)
  const offered = names.filter((one) => !name || one.toLowerCase().startsWith(name.toLowerCase())).slice(0, 6)
  const done = (): void => void (name.trim() && onAdd(name.trim(), value.current?.value ?? ''))
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-foreground">Add a property</p>
      <input autoFocus value={name} onChange={(event) => setName(event.target.value.replace(/:/g, ''))} placeholder="Name, e.g. Author" aria-label="Name"
        onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), name.trim() && value.current?.focus())}
        className="h-8 rounded-md bg-foreground/[0.05] px-2.5 text-control text-foreground outline-none placeholder:text-foreground/60 focus-visible:ring-2 focus-visible:ring-ring/30" />
      {offered.length > 0 && <Chips options={offered.map((one) => ({ id: one, label: one }))} on={(one) => one === name} pick={(one) => (setName(one), value.current?.focus())} />}
      <input ref={value} placeholder="Value: words, a number, a date, yes or no" aria-label="Value" onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), done())}
        className="h-8 rounded-md bg-foreground/[0.05] px-2.5 text-control text-foreground outline-none placeholder:text-foreground/60 focus-visible:ring-2 focus-visible:ring-ring/30" />
      <p className="text-xs text-muted-foreground">Faster in the page: type <span className="font-mono text-foreground">Author:: Le Guin</span> on a line and press <Kbd>↵</Kbd></p>
      <Button size="sm" disabled={!name.trim()} onClick={done}>Add</Button>
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
