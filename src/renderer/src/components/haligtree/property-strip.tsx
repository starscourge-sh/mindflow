import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useReading } from '@/lib/reads-in'
import { AlignLeft, Calendar, Check, ChevronRight, Clock, Hash, Link2, List, Plus, SquareCheck, Star, Tags, Text, X, type LucideIcon } from 'lucide-react'
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
import { TAGS_KEY, cleanTag, tagsKept } from '../../../../main/property-tags'
import { tagsIn } from '../../../../main/tag-words'
import { Chips } from './display'
import { DatePicker } from './date-picker'
import { AskKey, Grows, Island, PANEL_FIELD, PanelRow, POP_ISLANDS, Tip, openTag, toast } from './ui'
import { cn } from '@/lib/cn'
import { hoverNote } from './note-preview'
import { FLOAT } from '@/lib/float'
import { useSuperTags } from './note-extras'
import { tagTint } from './tag-icon'
import { quoted } from '../../../../main/clip'
import { num } from '../../../../main/dates'

type Value = string | number | boolean
const SHUT = 'propertiesShut'
/** Every property name in use, as last read: the next note opens with them in hand. */
let namesSeen: Awaited<ReturnType<typeof notes.propNames>> = []
/** One property as the strip shows it: a super tag's field, or one of the note's own. */
type Prop = { key: string; label: string; type: PropType | 'rating' | 'long'; options: string[]; tag: string | null; field?: Field; value: Value | undefined }

/** A field's type in the strip's words: a super tag's kinds of field read as a property's. */
const typeOf = (field: Field): Prop['type'] =>
  field.type === 'rating' ? 'rating' : field.type === 'long' ? 'long' : field.type === 'choice' ? 'choice' : field.type === 'date' ? 'date' : field.type === 'link' ? 'link' : 'text'

/** Keys the app keeps for itself, never shown: when a thing was decided or answered, a deck card's own Anki fields. */
const KEPT = new Set(['_kept', 'decidedAt', 'heldAt', 'answeredAt', '_anki', '_meaningRead', TAGS_KEY])

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
export function PropertyStrip({ table, id, kind, fields, text, created, updated, panel = false, sourced = false, cited = false }: {
  /** From a source: its page in it shows under its words as "p. 49" (source-page.tsx), so it is not a property too. */
  sourced?: boolean
  /** Names where it is from: its year is that source's (signature.tsx), so the quote's own Year is not offered too. */
  cited?: boolean
  table: NoteTable
  id: string
  kind: string
  /** The note's properties and its words as the list already holds them: drawn in the first frame, read fresh after. */
  fields?: string | null
  text?: string
  /** When it was made and last changed: shown, read-only. */
  created?: string | null
  updated?: string | null
  /**
   * At the top of the note's details beside it, the way Linear lists an
   * issue's properties: roomier rows, a heading like the groups under it.
   * Drawn there, the block under the title steps aside (main.css), and comes
   * back whenever the details are put away or have no room beside the page.
   */
  panel?: boolean
}): React.JSX.Element | null {
  const known = text === undefined ? undefined : tagsIn(text)
  const groups = useSuperTags(table, id, kind, known)
  const first = (): { of: string; values: Record<string, Value> } => {
    if (fields === undefined) return { of: '', values: {} }
    try { return { of: `${table}:${id}`, values: JSON.parse(fields ?? 'null') ?? {} } } catch { return { of: `${table}:${id}`, values: {} } }
  }
  const read = useLive(() => notes.fields(table, id).then((values) => ({ of: `${table}:${id}`, values: values as Record<string, Value> })), first(), [table, id])
  const names = useLive(() => notes.propNames().then((all) => (namesSeen = all)), namesSeen, [])
  // Its tags as read for this note; till then the ones its words name (a gem's tags are not all in its words).
  const tagsRead = useLive(() => notes.tags(table, id).then((all) => ({ of: `${table}:${id}`, all })), null as { of: string; all: string[] } | null, [table, id])
  const tags = tagsRead?.of === `${table}:${id}` ? tagsRead.all : (known ?? [])
  const [open, setOpen] = useState<string | null>(null)
  // Folded shut or open, the same for every note, remembered.
  const [shut, setShutState] = useState(() => { try { return localStorage.getItem(SHUT) === '1' } catch { return false } })
  const setShut = (next: boolean): void => { setShutState(next); try { localStorage.setItem(SHUT, next ? '1' : '0') } catch { /* kept for now only */ } }
  const strip = useRef<HTMLDivElement | null>(null)
  const values = read.of === `${table}:${id}` ? read.values : {}
  // The page waits for the strip's values and tags, so it never pops in after the words (a gem's #tag row pushed Add property down).
  useReading(read.of !== `${table}:${id}` || tagsRead?.of !== `${table}:${id}`)
  const typeFor = (name: string): PropType | null => (names.find((one) => one.name.toLowerCase() === name.toLowerCase())?.type as PropType | null) ?? null
  const optionsFor = (name: string): string[] => names.find((one) => one.name.toLowerCase() === name.toLowerCase())?.options ?? []
  const fromTags: Prop[] = groups.flatMap(([tag, fields]) => fields.filter((field) => field.type !== 'hidden' && !(sourced && field.key === 'location') && !(cited && field.key === 'year')).map((field) => ({ key: field.key, label: field.label, type: typeOf(field), options: field.options ?? [], tag, field, value: values[field.key] })))
  const own: Prop[] = Object.keys(values).filter((key) => !KEPT.has(key) && !(sourced && key === 'location') && !(cited && key === 'year') && !fromTags.some((prop) => prop.key === key)).map((key) => {
    const value = values[key]
    const guessed: PropType = typeof value === 'boolean' ? 'bool' : typeof value === 'number' ? 'number' : typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) ? 'date' : 'text'
    return { key, label: OLD_LABELS[key] ?? key, type: typeFor(key) ?? guessed, options: optionsFor(key), tag: null, value }
  })
  const all = [...fromTags, ...own]
  // A field brought in by "Add property" on this note: shown, empty or not, until you leave the note, so it never goes from under the caret.
  const [added, setAdded] = useState<{ of: string; keys: string[] }>({ of: '', keys: [] })
  const addedHere = added.of === `${table}:${id}` ? added.keys : []
  // A kind's or a shipped tag's own field shows once it has words, or when it is the point of its kind (`always`, kind-fields.ts);
  // the rest wait under "Add property". A tag you gave fields yourself shows them all, as you asked.
  const waits = (prop: Prop): boolean => !!prop.tag && !!prop.field && !prop.field.always && !!SUPER_TAGS[prop.tag]?.includes(prop.field)
    && (prop.value === undefined || prop.value === '') && !addedHere.includes(prop.key) && open !== prop.key
  const waiting = fromTags.filter(waits)
  const shown = all.filter((prop) => !waits(prop))
  const bring = (key: string): void => {
    setAdded({ of: `${table}:${id}`, keys: [...addedHere, key] })
    chime('noted')
    setOpen(key)
  }

  // Drawn in the details beside the page, the block under the title steps aside (main.css, `data-props-beside`). The
  // page is marked from here, where it is known, before the frame is drawn. Asked of the browser instead (a `:has()`
  // with nothing before it), each strip coming or going had it restyle every box above the strip and 424 more in the
  // note: 53 to 80 ms in a long note. The details' `fold` changing makes the strip anew, so this is read again then.
  useLayoutEffect(() => {
    const page = panel ? strip.current?.closest('.mf-details')?.parentElement : null
    if (!page) return
    beside.set(page, (beside.get(page) ?? 0) + 1)
    page.setAttribute('data-props-beside', '')
    return () => {
      const left = (beside.get(page) ?? 1) - 1
      beside.set(page, left)
      if (!left) page.removeAttribute('data-props-beside')
    }
  }, [panel])

  // ⌥⌘P adds one, in the page the keys are in (or the only one open).
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!event.metaKey || !event.altKey || event.code !== 'KeyP') return
      // Only a block you can see: the one under the title steps aside while the details hold it.
      if (!strip.current || strip.current.offsetParent === null) return
      const here = strip.current.closest('.note-pane, [data-note-page], main') ?? null
      const strips = [...document.querySelectorAll<HTMLElement>('[data-property-strip]')].filter((one) => one.offsetParent !== null)
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
    const field = waiting.find((one) => one.key.toLowerCase() === typed.toLowerCase() || one.label.toLowerCase() === typed.toLowerCase())
    if (field) return bring(field.key)
    const key = names.find((one) => one.name.toLowerCase() === typed.toLowerCase())?.name ?? typed
    if (!all.some((prop) => prop.key === key)) {
      if (!typeFor(key)) await notes.setPropType(key, 'text')
      await notes.setField(table, id, key, '', true)
      chime('noted')
    }
    setOpen(key)
  }
  // In the details, each row as tall and as far in as the details' own rows; under the title, quieter.
  const size = panel ? { h: 'h-8', minH: 'min-h-8', pad: 'px-2', icon: 'size-4' } : { h: 'h-7', minH: 'min-h-7', pad: 'px-1.5', icon: 'size-3.5' }
  if (read.of !== `${table}:${id}`) return <div data-property-strip data-in-panel={panel ? '' : undefined} ref={strip} className={size.minH} />
  // Nothing yet: only the quiet way to add one, in the place the block will open. The details keep their heading.
  const kept = tagsKept(values)
  // The Tags row is there whenever the note already has properties, or this is the details panel: it ends in "+", and a tag added there is kept on the note, not written into its words.
  const showTags = panel || tags.length > 0 || shown.length > 0
  const propCount = shown.length + (showTags ? 1 : 0)
  const takeOff = (tag: string): void => {
    const had = kept.includes(tag)
    const editor = editorOf(strip.current)
    const found = new RegExp(`(^|\\s)#${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}_/-])`, 'giu')
    const cuts: { from: number; to: number }[] = []
    editor?.state.doc.descendants((child, pos) => {
      if (!child.isText || !child.text) return
      for (const hit of child.text.matchAll(found)) cuts.push({ from: pos + (hit.index ?? 0) + hit[1].length, to: pos + (hit.index ?? 0) + hit[0].length })
    })
    if (!had && !cuts.length) return
    const left = kept.filter((one) => one !== tag)
    if (had) void notes.setField(table, id, TAGS_KEY, left)
    if (cuts.length && editor) {
      const tr = editor.state.tr
      for (const cut of cuts.reverse()) tr.delete(cut.from, cut.to)
      editor.view.dispatch(tr)
    }
    chime('off')
    toast(`#${tag} taken off`, () => {
      if (had) void notes.setField(table, id, TAGS_KEY, kept)
      if (cuts.length && editor) editor.commands.undo()
      chime('undo')
    })
  }
  const empty = !panel && !shown.length && !tags.length && open !== '+'
  const addButton = (
    <Tip side="bottom" label="Add property, or type Name:: value on a line of its own (⌥⌘P)">
      <button type="button" data-add-property aria-label="Add property" onClick={() => (chime('open'), setShut(false), setOpen('+'))}
        className={`inline-flex ${size.h} items-center rounded-md ${size.pad} text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${panel ? 'col-span-2 w-full gap-2' : 'w-fit gap-1.5'}`}>
        <Plus className={size.icon} /><span>Add property</span>
      </button>
    </Tip>
  )
  // In the details every row shares one name column, as wide as the longest name allows, so the values line up; in a narrow pane each value goes under its name, so long ones (dates) never run into the row below.
  const row = panel ? 'col-span-2 grid grid-cols-subgrid items-start' : 'grid grid-cols-1 items-start gap-x-2 @max-[24rem]/props:[&>:last-child]:ml-[1.375rem] @min-[24rem]/props:grid-cols-[minmax(7rem,9.5rem)_minmax(0,1fr)]'
  const nameCell = (Icon: LucideIcon, label: string, prop?: Prop): React.JSX.Element => (
    <span className={`flex ${size.h} min-w-0 items-center gap-2 ${size.pad} text-muted-foreground`}>
      {prop && !prop.tag ? (
        // The icon says the kind of value, and is where it changes.
        <Popover open={open === `kind:${prop.key}`} onOpenChange={(next) => setOpen(next ? `kind:${prop.key}` : null)}>
          <Tip label="Kind of value">
            <PopoverTrigger asChild>
              <button type="button" data-property-kind={prop.key} aria-label="Kind of value" className="-mx-1 grid size-6 shrink-0 place-items-center rounded-md transition-colors hover:bg-accent hover:text-foreground data-[state=open]:bg-accent"><Icon className={size.icon} /></button>
            </PopoverTrigger>
          </Tip>
          {/* The list's Sort / View popover's anatomy (display.tsx): a small heading over the choices in an island. */}
          <PopoverContent align="start" className={`w-52 gap-0 p-2 text-control ${POP_ISLANDS}`}>
            <Island compact title="Kind of value">
              <div className="flex flex-col p-1">
                {PROP_TYPES.map((one) => {
                  const KindIcon = ICONS[one.id] ?? Text
                  return (
                    <button key={one.id} type="button" data-kind={one.id} data-on={one.id === prop.type ? '' : undefined} onClick={() => (setType(prop, one.id), setOpen(null))}
                      className="flex h-7 items-center gap-2 rounded-sm px-2 text-left text-foreground transition-colors hover:bg-accent data-[on]:font-medium">
                      <KindIcon className="size-3.5 text-muted-foreground" />{one.label}
                      {one.id === prop.type && <Check aria-hidden className="ml-auto size-3.5" />}
                    </button>
                  )
                })}
              </div>
            </Island>
          </PopoverContent>
        </Popover>
      ) : <Icon className={`${size.icon} shrink-0`} />}
      <span className="truncate">{propSaid(label)}</span>
    </span>
  )
  return (
    <div data-property-strip data-in-panel={panel ? '' : undefined} data-properties-open={shut ? undefined : ''} ref={strip}
      className={panel ? 'mb-2 flex flex-col border-b border-border/60 pb-2 text-control' : '@container/props flex flex-col pt-1 pb-5 text-meta'} onMouseDown={(event) => event.stopPropagation()}>
      {empty ? addButton : (
        <>
          {panel ? (
            // As the details' other groups head themselves: a chevron, the name, folded by a click.
            <div className="group/fold flex items-center gap-1 px-1">
              <button type="button" data-properties-head aria-expanded={!shut} onClick={() => (chime(shut ? 'open' : 'fold'), setShut(!shut))}
                className="-mx-1 flex min-w-0 flex-1 items-center gap-1 rounded-md px-1 py-1 text-left text-foreground hover:bg-accent/60">
                <ChevronRight aria-hidden className={`size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ease-[var(--mf-ease)] motion-reduce:transition-none group-hover/fold:text-foreground ${shut ? '' : 'rotate-90'}`} />
                <h2 className="min-w-0 truncate text-meta font-semibold">Properties</h2>
                {shut && <span className="ml-1 text-meta text-muted-foreground">{propCount}</span>}
              </button>
            </div>
          ) : (
          <button type="button" data-properties-head aria-expanded={!shut} onClick={() => (chime(shut ? 'open' : 'fold'), setShut(!shut))}
            className="inline-flex h-7 w-fit items-center gap-1 rounded-md px-1.5 font-medium text-foreground transition-colors hover:bg-accent">
            <ChevronRight className={`size-3.5 text-muted-foreground transition-transform duration-150 ${shut ? '' : 'rotate-90'}`} />Properties
            {shut && <span className="ml-1 font-normal text-muted-foreground">{propCount}</span>}
          </button>
          )}
          {!shut && (
            <div className={panel ? 'mt-1 grid grid-cols-[fit-content(8rem)_minmax(0,1fr)] gap-x-1 gap-y-px' : 'flex flex-col'}>
              {showTags && (
                <div className={row} data-property="tags">
                  {nameCell(Tags, 'tags')}
                  <TagChips tags={tags} onTake={takeOff} className={`flex ${size.minH} flex-wrap items-center gap-1 py-0.5`}>
                    <AddTag table={table} id={id} tags={tags} kept={kept} />
                  </TagChips>
                </div>
              )}
              {shown.map((prop) => (
                <div key={`${prop.tag ?? ''}:${prop.key}`} className={row}>
                  {nameCell(ICONS[prop.type] ?? Text, prop.label, prop)}
                  <Popover open={open === prop.key} onOpenChange={(next) => setOpen(next ? prop.key : null)}>
                    <PopoverTrigger asChild>
                      <button type="button" data-property={prop.key} data-empty={prop.value === undefined || prop.value === '' ? '' : undefined}
                        className={`inline-flex ${panel ? 'min-h-8 py-1.5' : 'h-7'} min-w-0 items-center rounded-md ${size.pad} text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none data-[state=open]:bg-accent`}>
                        {prop.value === undefined || prop.value === '' ? <span className="text-muted-foreground">Empty</span>
                          : <span className={`private-text text-foreground ${panel ? 'line-clamp-2 hyphens-auto [overflow-wrap:break-word]' : 'truncate'}`}>{prop.type === 'link' ? <LinkName link={String(prop.value)} /> : said(prop)}</span>}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className={`w-80 gap-0 p-2 text-control ${POP_ISLANDS}`} onOpenAutoFocus={(event) => prop.type === 'date' && event.preventDefault()}>
                      <PropEditor prop={prop} tags={tags} onSave={(value) => void save(prop.key, value, prop.label).then(() => setOpen(null))}
                        onRename={(to) => void notes.renameField(table, id, prop.key, to).then(() => (chime('retag'), setOpen(null), toast(`Renamed to ${quoted(to, 80)}`, () => void notes.renameField(table, id, to, prop.key).then(() => chime('undo')))))}
                        onType={(type) => setType(prop, type)}
                        onSuper={(tag) => void addToTag(tag, prop).then(() => setOpen(null))} />
                    </PopoverContent>
                  </Popover>
                </div>
              ))}
              {open === '+' && (
                <NewProp className={row} size={size} names={names.filter((one) => !all.some((prop) => prop.key.toLowerCase() === one.name.toLowerCase()))}
                  waiting={waiting} onField={bring} onName={(name) => void named(name)} onCancel={() => setOpen(null)} />
              )}
              {/* Kept by the app, not typed: shown, never changed here. Under the title the page head says it already ("Started 3d ago"), so only the details panel lists them. */}
              {created && panel && <div className={row} data-property="created">{nameCell(Clock, 'created')}<span className={`flex ${panel ? 'min-h-8 py-1.5' : 'h-7'} items-center ${size.pad} text-(--mf-muted-strong)`}>{stamp(created, panel)}</span></div>}
              {/* Never changed since: updated is when it was made. */}
              {(updated ?? created) && panel && <div className={row} data-property="updated">{nameCell(Clock, 'updated')}<span className={`flex ${panel ? 'min-h-8 py-1.5' : 'h-7'} items-center ${size.pad} text-(--mf-muted-strong)`}>{stamp((updated ?? created) as string, panel)}</span></div>}
              {addButton}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/** How many strips each page has in its details now: the page is marked while there is one. */
const beside = new WeakMap<Element, number>()

/** Each kind of value's icon, beside its name, as Obsidian draws them. */
const ICONS: Partial<Record<Prop['type'], LucideIcon>> = { text: Text, long: AlignLeft, number: Hash, date: Calendar, bool: SquareCheck, choice: List, link: Link2, rating: Star }

/** "6 May 2026, 15:26": when, said in full; `short`, this year's day leaves the year out ("6 May, 15:26"), to fit the details' narrow column. */
const stamp = (iso: string, short = false): string => {
  const at = new Date(iso)
  const year = short && at.getFullYear() === new Date().getFullYear() ? undefined : 'numeric'
  return Number.isNaN(at.getTime()) ? iso : at.toLocaleString(undefined, { day: 'numeric', month: 'short', year, hour: '2-digit', minute: '2-digit' })
}

/** The editor the block sits in, or in the details, the page beside them: tiptap keeps itself on its page's element. */
const editorOf = (node: HTMLElement | null): Editor | null =>
  (((node?.closest('.ProseMirror') ?? node?.closest('.mf-details')?.parentElement?.querySelector('.ProseMirror')) as (HTMLElement & { editor?: Editor }) | null | undefined)?.editor ?? null)

/**
 * A tag put into a note's words, as the offer under a note takes one and quick capture's box does: written as a #tag
 * after the last one there. With none yet, on a line of its own at the end, never in the note's name (its first line);
 * `inWords`, the box, puts it where the caret rests, and the box's send moves it off the name (main/tags-off-name.ts).
 * One step ⌘Z takes back. The Properties row does not use this: a tag added there stays in Properties.
 */
export function putTag(editor: Editor, tag: string | string[], inWords = false): boolean {
  // Several at once (an offer's ticked tags) go in together, one edit that one ⌘Z takes back.
  const name = [tag].flat().map((one) => one.trim().replace(/^#+/, '').replace(/\s+/g, '-')).filter(Boolean).join(' #')
  if (!name) return false
  let at = -1
  editor.state.doc.descendants((child, pos) => {
    if (!child.isText || !child.text) return
    for (const hit of child.text.matchAll(/(^|\s)#[\p{L}\p{N}_/-]+/gu)) at = pos + (hit.index ?? 0) + hit[0].length
  })
  if (at < 0 && !inWords) {
    const { doc, schema } = editor.state
    editor.view.dispatch(editor.state.tr.insert(doc.content.size, schema.nodes.paragraph.create(null, schema.text(`#${name}`))))
    return true
  }
  if (at < 0) {
    const first = editor.state.doc.firstChild
    at = first?.isTextblock ? first.nodeSize - 1 : editor.state.doc.content.size
  }
  const before = editor.state.doc.textBetween(Math.max(0, at - 1), at)
  // Put where the caret rests (the end of words being typed, in quick capture): a space after it, so the caret stands
  // past the tag, not at its end, where the tag menu would open over the writing as if "#baking" were being typed.
  const { selection } = editor.state
  const after = selection.empty && selection.from === at ? ' ' : ''
  editor.view.dispatch(editor.state.tr.insertText(`${before && !/\s/.test(before) ? ' ' : ''}#${name}${after}`, at))
  return true
}

/**
 * The note's tags, two rows of them at most: past that a "+N more" chip
 * opens the rest in place, and "Fewer" folds them back. 500 tags filled
 * the strip with about 167 rows before.
 */
function TagChips({ tags, className, onTake, children }: { tags: string[]; className: string; onTake: (tag: string) => void; children: React.ReactNode }): React.JSX.Element {
  const [all, setAll] = useState(false)
  // How many chips fit in two rows with the "+N more" chip after them; null until measured.
  const [fit, setFit] = useState<number | null>(null)
  const box = useRef<HTMLDivElement | null>(null)
  const now = useRef({ all, fit })
  const measureRef = useRef<() => void>(() => undefined)
  now.current = { all, fit }
  const said = tags.join('\n')
  // Measured afresh when the tags change.
  useLayoutEffect(() => setFit(null), [said])
  // Read in the frame, never forcing a layout in the middle of drawing the
  // page: read while a long note was being drawn, it cost two thirds of a
  // second. Again whenever the row changes size (a narrower window).
  useEffect(() => {
    const row = box.current
    if (!row) return
    let width = row.clientWidth
    const measure = (): void => {
      const { all, fit } = now.current
      const chips = row.querySelectorAll<HTMLElement>('[data-tag-chip]')
      if (all || !chips.length) return
      if (fit !== null && row.clientWidth !== width) return void ((width = row.clientWidth), setFit(null))
      const top = chips[0].offsetTop
      const step = chips[0].offsetHeight + 4
      const row3 = (el: Element | null): boolean => el instanceof HTMLElement && el.offsetTop >= top + 2 * step - 2
      if (fit === null) {
        const over = [...chips].findIndex(row3)
        setFit(over >= 0 ? Math.max(1, over - 1) : chips.length)
        return
      }
      // The "+N more" chip itself went to a third row: one chip fewer.
      if (fit > 1 && row3(row.querySelector('[data-tag-more]'))) setFit(fit - 1)
    }
    measureRef.current = measure
    const seen = new ResizeObserver(measure)
    seen.observe(row)
    return () => seen.disconnect()
  }, [])
  useEffect(() => {
    if (fit !== null || all) return
    const frame = requestAnimationFrame(() => measureRef.current())
    return () => cancelAnimationFrame(frame)
  }, [fit, all, said])
  const shown = all || fit === null ? tags : tags.slice(0, fit)
  const left = tags.length - shown.length
  // Until measured, held to two rows (3.5rem, measured to be the height the two rows settle at) so 500 tags never flash down the page and nothing below moves. No chips yet: the "+" is the whole row, and nothing is clipped.
  const held = !all && fit === null && tags.length ? { maxHeight: '3.5rem', overflow: 'hidden' } : undefined
  return (
    <div ref={box} className={className} style={held}>
      {shown.map((tag) => (
        <span key={tag} data-tag-chip={tag} className="inline-flex h-6 items-center gap-1 rounded-full bg-foreground/[0.06] pr-0.5 pl-2.5" style={{ color: tagTint(tag), '--mf-tag-dot': tagTint(tag) } as React.CSSProperties}>
          {/* The tag is a way to its page, as everywhere (⌥-click beside); the × only takes it off. */}
          <button type="button" data-tag-open={tag} {...hoverNote('tag', tag)} onClick={(event) => openTag(tag, event.altKey)} className="mf-hit relative rounded-sm hover:underline">{tag}</button>
          <Tip label={`Take #${tag} off this note`}>
            <button type="button" aria-label={`Remove #${tag}`} className="mf-hit relative grid size-4 place-items-center rounded-full shrink-0 opacity-70 hover:bg-foreground/10 hover:opacity-100" onClick={() => onTake(tag)}><X className="size-3" /></button>
          </Tip>
        </span>
      ))}
      {left > 0 && (
        <button type="button" data-tag-more className="inline-flex h-6 items-center rounded-full bg-foreground/[0.06] px-2.5 text-foreground hover:bg-foreground/10" onClick={() => setAll(true)}>
          +{num(left)} more
        </button>
      )}
      {all && fit !== null && fit < tags.length && (
        <button type="button" data-tag-fewer className="inline-flex h-6 items-center rounded-full bg-foreground/[0.06] px-2.5 text-foreground hover:bg-foreground/10" onClick={() => setAll(false)}>
          Fewer
        </button>
      )}
      {children}
    </div>
  )
}

/**
 * "+" after the tag chips: quiet until clicked, then a field. Enter, a comma or a space keeps the tag on the note's
 * properties (never written into its words). Esc puts the field away.
 */
function AddTag({ table, id, tags, kept }: { table: NoteTable; id: string; tags: string[]; kept: string[] }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  // Enter then blur would otherwise keep the same tag twice.
  const sent = useRef(false)
  const put = (): void => {
    if (sent.current || !text.trim()) return
    const name = cleanTag(text)
    if (!name) return void chime('nope')
    sent.current = true
    setText('')
    // Back to the quiet "+". Another tag is another click.
    setOpen(false)
    if (tags.includes(name)) return
    const next = [...kept, name]
    void notes.setField(table, id, TAGS_KEY, next).then((ok) => {
      if (!ok) return
      chime('on')
      toast(`Tagged #${name}`, () => void notes.setField(table, id, TAGS_KEY, kept.length ? kept : null).then(() => chime('undo')))
    })
  }
  if (!open) return (
    <Tip label="Add a tag">
      <button type="button" data-tag-add aria-label="Add a tag" onClick={() => (chime('tap'), setOpen(true))}
        className="grid size-6 place-items-center rounded-full shrink-0 text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"><Plus className="size-3.5" /></button>
    </Tip>
  )
  return (
    <input data-tag-input autoFocus value={text} placeholder="tag" aria-label="New tag" spellCheck={false}
      onChange={(event) => { sent.current = false; setText(event.target.value) }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ',' || (event.key === ' ' && text.trim())) (event.preventDefault(), put())
        else if (event.key === 'Escape') (event.preventDefault(), event.stopPropagation(), setText(''), setOpen(false))
      }}
      onBlur={() => (put(), setOpen(false))}
      className="h-6 w-24 rounded-full bg-foreground/[0.06] px-2.5 text-foreground outline-none placeholder:text-muted-foreground" />
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
  toast(`Every note tagged #${tag} now has ${quoted(prop.label, 80)}`, () => void notes.setTagFields(tag, was ?? []).then(() => chime('undo')))
}

/**
 * The new row, as Obsidian adds one: in the block, laid out as the others,
 * its name typed with the names this book already uses offered under it.
 * Enter or a click sets it; Esc, or leaving it with no name, takes the row away.
 */
function NewProp({ className, size, names, waiting, onField, onName, onCancel }: {
  className: string
  /** Its row's height, inset and icon, as the rows around it have them. */
  size: { h: string; pad: string; icon: string }
  names: { name: string; type: string | null }[]
  /** The note's kind's own fields not shown yet: offered first, by their own names, with what each does. */
  waiting: Prop[]
  onField: (key: string) => void
  onName: (name: string) => void
  onCancel: () => void
}): React.JSX.Element {
  const [name, setName] = useState('')
  // Nothing marked until the arrows move: Enter on a new name keeps it as typed.
  const [at, setAt] = useState(-1)
  const typed = name.trim().toLowerCase()
  const starts = (one: { name: string }): number => Number(!one.name.toLowerCase().startsWith(typed))
  const fields = waiting.filter((one) => one.label.toLowerCase().includes(typed))
  const offered = names.filter((one) => one.name.toLowerCase().includes(typed)).sort((a, b) => starts(a) - starts(b)).slice(0, 8)
  const Icon = ICONS[(names.find((one) => one.name.toLowerCase() === typed)?.type ?? 'text') as Prop['type']] ?? Text
  const pick = (one: string): void => (one.trim() ? onName(one.trim()) : onCancel())
  // The arrows run down the kind's fields, then the names in use.
  const choose = (index: number): void => (index < fields.length ? onField(fields[index].key) : pick(offered[index - fields.length]?.name ?? name))
  const count = fields.length + offered.length
  // The names hang under the field while they fit above the page's "Add a thought…" bar, or the window's foot; else
  // over it, on the roomier side, never taller than that room (the slash menu's rule, suggestion-renderer.ts): in a
  // short window they ran under the bar, cut off (16 Nov, shot 03-c). Read as the list opens, as its rows change, and
  // as the window changes size under it (a small window grows while a list is open, lib/fit-box.ts).
  const list = useRef<HTMLDivElement>(null)
  const [room, setRoom] = useState<{ up: boolean; tall: number } | null>(null)
  useLayoutEffect(() => {
    const box = list.current
    if (!box) return
    const place = (): void => {
      const field = box.parentElement?.getBoundingClientRect()
      if (!field) return
      let foot = window.innerHeight - 12
      for (const bar of document.querySelectorAll<HTMLElement>('[data-composer]')) {
        const at = bar.getBoundingClientRect()
        if (at.height && at.top >= field.bottom) foot = Math.min(foot, at.top - 8)
      }
      const below = foot - field.bottom - 4
      // Clear of the title bar, as every menu keeps (MENU_ROOM in the menus), and of the fade at the top of the page
      // it scrolls in (main.css, 1.5rem), where its first rows went dim.
      let page = box.parentElement
      while (page && !/auto|scroll/.test(getComputedStyle(page).overflowY)) page = page.parentElement
      const above = field.top - Math.max(52, (page?.getBoundingClientRect().top ?? 0) + 26) - 4
      const up = below < Math.min(box.scrollHeight, 320) && above > below
      setRoom({ up, tall: Math.max(72, Math.min(320, Math.floor(up ? above : below))) })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [count])
  return (
    <div className={className} data-new-property>
      <span className={`relative flex ${size.h} min-w-0 items-center gap-2 ${size.pad} text-muted-foreground`}>
        <Icon className={`${size.icon} shrink-0`} />
        <input autoFocus value={name} placeholder="Name" aria-label="Property name" role="combobox" aria-expanded={count > 0}
          onChange={(event) => (setName(event.target.value.replace(/:/g, '')), setAt(-1))}
          onBlur={() => pick(name)}
          onKeyDown={(event) => {
            // The page's own keys never hear it.
            event.stopPropagation()
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              if (count) setAt((was) => (event.key === 'ArrowDown' ? (was + 1) % count : was <= 0 ? count - 1 : was - 1))
            } else if (event.key === 'Enter') {
              event.preventDefault()
              if (at >= 0) choose(at)
              else pick(name)
            } else if (event.key === 'Escape') {
              event.preventDefault()
              onCancel()
            }
          }}
          className="h-7 min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground" />
        {count > 0 && (
          // In by `mf-pop` (main.css), as a popover is: grown down from the field by a clip, never faded (it is frosted).
          <div ref={list} role="listbox" data-name-options data-state="open" data-side={room?.up ? 'top' : 'bottom'} style={room ? { maxHeight: room.tall } : undefined}
            className={`${FLOAT} mf-pop absolute left-0 z-50 flex max-h-80 ${room?.up ? 'bottom-full mb-1' : 'top-full mt-1'} ${fields.length ? 'w-72' : 'w-56'} flex-col overflow-y-auto rounded-float p-1`}>
            {fields.map((one, index) => {
              const KindIcon = ICONS[one.type] ?? Text
              return (
                <button key={`field:${one.key}`} type="button" role="option" aria-selected={index === at} data-field-option={one.key}
                  onMouseDown={(event) => (event.preventDefault(), onField(one.key))} onMouseEnter={() => setAt(index)}
                  className="flex shrink-0 cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-left text-foreground aria-selected:bg-accent">
                  <KindIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{one.label}</span>
                    {one.field?.does && <span className="text-xs leading-snug text-muted-foreground">{one.field.does}</span>}
                  </span>
                </button>
              )
            })}
            {fields.length > 0 && offered.length > 0 && <div aria-hidden className="mx-2 my-1 h-px shrink-0 bg-border/60" />}
            {offered.map((one, i) => {
              const index = i + fields.length
              const KindIcon = ICONS[(one.type ?? 'text') as Prop['type']] ?? Text
              return (
                <button key={one.name} type="button" role="option" aria-selected={index === at} data-name-option={one.name} data-kind={one.type ?? 'text'}
                  // Down, not click: the name box keeps its focus, so this is never taken as leaving it.
                  onMouseDown={(event) => (event.preventDefault(), pick(one.name))} onMouseEnter={() => setAt(index)}
                  className="flex h-7 shrink-0 cursor-pointer items-center gap-2 rounded-md px-2 text-left text-foreground aria-selected:bg-accent">
                  <KindIcon className="size-3.5 shrink-0 text-muted-foreground" /><span className="truncate">{propSaid(one.name)}</span>
                </button>
              )
            })}
          </div>
        )}
      </span>
      <span className={`flex ${size.h} items-center ${size.pad} text-muted-foreground`}>Empty</span>
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
  // A panel row's field, as the Calendar's Place and the marked day's note are (PANEL_FIELD).
  const field = cn(PANEL_FIELD, 'bg-transparent text-foreground outline-none placeholder:text-muted-foreground hover:bg-accent/50 focus-visible:border-ring')
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
      return <DatePicker value={typeof prop.value === 'string' && /^\d{4}-\d\d-\d\dT/.test(prop.value) ? prop.value : null} onChange={(iso) => onSave(iso)} suggest={prop.field?.suggest ?? ['tomorrow', 'in a week', 'in a month']}
        className={cn(PANEL_FIELD, 'justify-start py-1 text-foreground hover:bg-accent/50 data-[state=open]:border-ring')} />
    if (prop.type === 'long')
      return <textarea ref={(node) => void (text.current = node)} autoFocus rows={3} defaultValue={String(prop.value ?? '')} placeholder={prop.field?.ghost ?? prop.field?.placeholder ?? prop.label} aria-label={prop.label}
        onKeyDown={(event) => event.key === 'Enter' && (event.metaKey || !event.shiftKey) && (event.preventDefault(), commit())} className={`${field} resize-none py-1 [field-sizing:content]`} />
    return <input ref={(node) => void (text.current = node)} autoFocus defaultValue={prop.value === undefined ? '' : String(prop.value)} placeholder={prop.field?.ghost ?? prop.field?.placeholder ?? (prop.type === 'link' ? 'A note, as [[Its name]]' : prop.type === 'number' ? 'A number' : prop.label)} aria-label={prop.label}
      onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), commit())} className={field} />
  })()
  // Typed, not picked: kept by Enter or Save. A pick (a chip, a star, a day) is kept as it is made.
  const typed = prop.type !== 'bool' && prop.type !== 'choice' && prop.type !== 'rating' && prop.type !== 'date'
  // The list's Sort / View popover's anatomy (display.tsx), as the Calendar's event popover has it: each group a small
  // heading over an island of its rows, the one way to take it off quietly on the left of the foot, Save on the right.
  return (
    <div className="flex flex-col" onKeyDown={(event) => event.stopPropagation()}>
      <Island compact title={prop.tag ? <>{prop.label} <span className="font-normal text-(--mf-muted-strong)">from #{prop.tag}</span></> : 'Property'}>
        {!prop.tag && (
          <PanelRow label="Name">
            <input value={name} onChange={(event) => setName(event.target.value.replace(/:/g, ''))} aria-label="Name" onBlur={() => name.trim() && name.trim() !== prop.key && onRename(name.trim())}
              onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), (event.target as HTMLInputElement).blur())}
              className={field} />
          </PanelRow>
        )}
        {/* A new kind of value brings its own control: the island's height glides to it. */}
        <Grows>
          <PanelRow label="Value" className={prop.type === 'long' || prop.type === 'choice' ? 'items-start [&>:first-child]:pt-1' : undefined}>{control}</PanelRow>
        </Grows>
        {prop.field?.does && <p className="px-2 py-1.5 text-meta leading-relaxed text-(--mf-muted-strong)">{prop.field.does}</p>}
      </Island>
      {!prop.tag && (
        <Island compact title="Kind of value">
          {/* Tiles, as Display's "View as": each kind its picture and its name under it. */}
          <div role="group" aria-label="Kind of value" className="grid grid-cols-3 gap-1 p-1">
            {PROP_TYPES.map((one) => {
              const KindIcon = ICONS[one.id] ?? Text
              const on = one.id === prop.type
              return (
                <button key={one.id} type="button" aria-label={one.label} aria-pressed={on} onClick={() => !on && onType(one.id)}
                  className={`flex flex-col items-center justify-center gap-1 rounded-md px-0.5 pt-1.5 pb-1 transition-colors ${on ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}`}>
                  <KindIcon className="size-4" />
                  <span className="text-[11px] leading-none whitespace-nowrap">{one.label}</span>
                </button>
              )
            })}
          </div>
        </Island>
      )}
      {!prop.tag && tags.length > 0 && (
        <Island compact title="Give it to every note tagged">
          <Chips className="p-1.5" options={tags.slice(0, 6).map((tag) => ({ id: tag, label: `#${tag}` }))} on={() => false} pick={onSuper} />
        </Island>
      )}
      <div className="mt-3 flex items-center gap-1">
        <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => onSave(null)}>{prop.tag ? 'Clear' : 'Remove'}</Button>
        <span className="flex-1" />
        {typed && <Button size="sm" className="hover:bg-primary hover:brightness-110" onClick={commit}>Save<AskKey label="Return">↵</AskKey></Button>}
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
