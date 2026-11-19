import { Orb } from './orb'
import { useEffect, useMemo, useRef, useState } from 'react'
import { hoverNote } from './note-preview'
import { ArrowUpRight, BookMarked, BookOpen, CalendarDays, ChevronRight, FileText, Library, Link2, PenLine, Plus, Quote, User } from 'lucide-react'
import { Camera, Fit } from '@/components/ui/icons'
import { openLook } from '@/components/image/image-look'

import { Button } from '@/components/ui/button'
import { kindOf } from '@/components/capture-kinds/capture-kind-picker'
import { chime } from '@/lib/sound'
import { heroOpen } from '@/lib/hero'
import { call, unloaded, useLive, haligtree } from '@/lib/haligtree'
import { UNATTRIBUTED, VOICE_TINT, askRename, openSource, pageRef, readFocus, sources, type SourceField, type SourceItem, type SourceSummary, type Voice } from '@/lib/sources'
import { Avatar } from './avatar'
import { ListSearch, NoteList, type Entry } from './note-list'
import { Example } from './example'
import { Display, useView } from './display'
import { Count, Empty, Page, Tip, ask, askSure, openTag, quietly, sayNow, toast, typing } from './ui'
import { RowMenu, type RowItem } from './row-menu'
import { IslandBox, useIslands } from './islands'
import { withoutTags } from '../../../../main/tag-words'
import { useReading } from '@/lib/reads-in'
import { addWork, cite, type Citer, type Work } from '@/lib/cite'
import { firstSentences, pageFor, useWiki } from '@/lib/wiki'
import { cn } from '@/lib/cn'
import { personKey } from '../../../../main/names'
import { useSelectAll } from '@/lib/select-all'
import { usePicking } from '@/lib/pick-range'
import { age, ago, num, plural } from '../../../../main/dates'

/** What a person's notes are, each counted once: "1 quote", "2 quotes · 1 other note". The quotes are among the notes, so "1 note · 1 quote" read as two. */
const tally = (one: { count: number; quotes: number }): string => {
  if (!one.count) return 'No notes yet'
  const rest = one.count - one.quotes
  return [one.quotes ? plural(one.quotes, 'quote') : '', rest ? plural(rest, one.quotes ? 'other note' : 'note') : ''].filter(Boolean).join(' · ')
}
import { avatarOf, isMe, setAvatar, pickAvatar, useAvatar, useMe } from '@/lib/people'
import { PersonMenu, markMe, turnCharacter } from './avatar'
import type { Character, SourceCard, SourceFacts, SourcePage } from '@/lib/sources'
import { notes, type NoteTable } from '@/lib/notes'
import { menuOpen } from '@/lib/menu-keys'
import { bookOf, pdfIn } from '@/lib/pdf-in'
import { openPdf } from '@/components/pdf/pdf-reader'
import { quoted } from '../../../../main/clip'

type PdfIn = ReturnType<typeof pdfIn>

const FIELD_SAID: Record<SourceField, { one: string; icon: typeof User }> = { attribution: { one: 'Person', icon: User }, medium: { one: 'Source', icon: BookOpen } }

/** Give a note a who, wherever it lives: a capture's field, or a gem's. */
const setSource = (item: { type: string; id: string }, field: SourceField, name: string | null): Promise<unknown> =>
  item.type === 'capture' ? haligtree.setCapture(item.id, field, name) : haligtree.saveItem(item.id, { [field]: name })

/**
 * The two ways out of "who said it?" besides answering: nobody knows (it stays a quote, its source
 * "Unattributed", never asked again), or it was never a quote (a note again, or a gem of yours). Each
 * with its notice and Undo. The Sources page's rows and a quote's own "No source yet" line offer both.
 */
export async function sourceUnknown(item: { type: string; id: string }): Promise<void> {
  await setSource(item, 'attribution', UNATTRIBUTED)
  chime('noted')
  toast('Source unknown: kept as a quote, and not asked about again', () => void setSource(item, 'attribution', null))
}
export async function notAQuote(item: { type: string; id: string }): Promise<void> {
  const table: NoteTable = item.type === 'capture' ? 'captures' : 'nuggets'
  const was = await call<{ kind: string; fields: string | null } | null>('notes:kind', table, item.id, 'note')
  if (!was) return
  chime('retag')
  toast(item.type === 'capture' ? 'Not a quote: kept as a note of yours' : 'Not a quote: kept as a gem of yours', () => void call('notes:kind:undo', table, item.id, was))
}

/** Under a note's who and where: a way to each one's page. */
function SourceLinks({ who, where, pdf }: { who?: string | null; where?: string | null; pdf?: PdfIn | null }): React.JSX.Element | null {
  const links = [who?.trim() && { field: 'attribution' as const, name: who.trim() }, where?.trim() && { field: 'medium' as const, name: where.trim() }].filter(Boolean) as { field: SourceField; name: string }[]
  if (!links.length && !pdf) return null
  // The book's name, read as its source is named; else the file's.
  const book = bookOf(where) || pdf?.name.replace(/\.pdf$/i, '') || 'The PDF'
  return (
    <div className="flex flex-wrap gap-1 px-1 py-1">
      {/* The page it came from, opened in the reader (⌥ beside), its pages previewed on hover. */}
      {pdf && (
        <button type="button" data-open-pdf-page={pdf.page} onClick={(event) => (chime('page'), openPdf(pdf.src, pdf.name, pdf.page, pdf.mark, event.altKey))}
          data-pdf-peek={pdf.src} data-pdf-peek-name={pdf.name} data-pdf-peek-page={pdf.page}
          className="flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-control text-foreground transition-colors hover:bg-accent">
          <FileText className="size-3.5 shrink-0" />
          <span className="truncate">{book}, p. {pdf.page}</span>
        </button>
      )}
      {links.map(({ field, name }) => {
        return (
          <button key={field} type="button" data-open-source={field} onClick={() => (chime('page'), openSource(field, name))}
            className="flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-control text-foreground transition-colors hover:bg-accent">
            {/* A shelf, not an open book: it opens what you kept from it, not the book to read. */}
            {field === 'attribution' ? <Avatar name={name} size={14} /> : <Library className="size-3.5 shrink-0" />}
            {/* Says what it opens: everything kept from them, never the book or PDF itself (its own link above opens that). */}
            <span className="truncate">{field === 'attribution' ? `Everything by ${name}` : `Everything from ${name}`}</span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Under a note's words: who and where it is from, each opening its page; or,
 * for a quote or a gem with neither, a plain line asking for one. A quote
 * with no source has drifted from whoever said it; a gem with none is only a
 * note of yours.
 */
export function SourceFoot({ who, where, quote = false, gem = false, cite, body }: { who?: string | null; where?: string | null; quote?: boolean; gem?: boolean; /** The note itself, for the page in its source it is from. */ cite?: { table: NoteTable; id: string; fields?: string | null }; /** Its words: a link into a kept PDF in them shows here as the page it came from. */ body?: unknown }): React.JSX.Element | null {
  const pdf = useMemo(() => pdfIn(body), [body])
  const sourced = !!(who?.trim() || where?.trim() || pdf)
  if (sourced) return (
    <div data-chrome className="page-narrow mx-auto w-full px-[4rem]">
      {cite && (quote || gem) && <PageNumber {...cite} />}
      <SourceLinks who={who} where={where} pdf={pdf} />
    </div>
  )
  if (!quote && !gem) return null
  const item = cite && { type: cite.table === 'captures' ? 'capture' : 'nugget', id: cite.id }
  return (
    <p data-chrome data-no-source className="page-narrow mx-auto mt-2 w-full px-[4.5rem] text-body text-foreground">
      {quote ? 'No source yet. Say who said it in the details, so this quote stays with them.' : 'No source yet, so this counts as a note of yours. Say who or where it is from in the details to keep it as their idea.'}
      {/* A quote whose source nobody knows, or that was never a quote, has its way out right here. */}
      {quote && item && <>
        {' '}<button type="button" data-source-unknown onClick={() => void sourceUnknown(item)} className="cursor-pointer text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground">Source unknown</button>
        {' · '}<button type="button" data-not-quote onClick={() => void notAQuote(item)} className="cursor-pointer text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground">Not a quote</button>
      </>}
    </p>
  )
}

/** Where in its source a quote is: the quote kind's own "Page or place" (kind-fields.ts). */
const PAGE_FIELD = 'location'

/** A bare number is a page, "p. 49"; anything else ("chapter 3") reads as it was written. */
const isPage = (value: string): boolean => /^\d+([–-]\d+)?$/.test(value)

/** The page it is on in its source, read from its properties. */
const pageOf = (fields: string | null | undefined): string => {
  try {
    const value = (JSON.parse(fields ?? 'null') ?? {})[PAGE_FIELD]
    return value == null ? '' : String(value)
  } catch {
    return ''
  }
}

/**
 * Under a quote or a gem from a source: the page it is on, "p. 49", typed
 * where it is shown. With none yet, a quiet place to give one.
 */
function PageNumber({ table, id, fields }: { table: NoteTable; id: string; fields?: string | null }): React.JSX.Element {
  const page = pageOf(fields)
  const save = (raw: string): void => {
    const bare = raw.replace(/^p(age|p?\.)?\s*/i, '').trim()
    const next = (isPage(bare) ? bare : raw.trim()).slice(0, 40)
    if (next === page) return
    void notes.setField(table, id, PAGE_FIELD, next || null).then(() => (chime('noted'),
      toast(next ? `Kept as ${isPage(next) ? `p. ${next}` : next}` : 'Page taken off', () => void notes.setField(table, id, PAGE_FIELD, page || null).then(() => chime('undo')))))
  }
  return (
    <p data-page-number className="flex items-baseline px-1.5 pt-1 text-body text-foreground">
      {isPage(page) && <span aria-hidden>p.</span>}
      {/* Esc puts back what was there, as a page's name does. */}
      <input aria-label="Page or place in its source" defaultValue={page} key={page} placeholder="Add the page it is on" maxLength={40}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') (event.preventDefault(), event.stopPropagation(), event.currentTarget.value = page, event.currentTarget.blur())
        }} onBlur={(event) => save(event.target.value)}
        className="min-w-[2ch] rounded-md bg-transparent px-1 py-0.5 text-body text-foreground tabular-nums outline-none [field-sizing:content] placeholder:text-muted-foreground hover:bg-accent focus:bg-accent" />
    </p>
  )
}

/**
 * The card in a note's margin, as on a commonplace spread: the source it
 * cites (its title opens its page), its year and kind, who wrote it, and
 * where it was found. Plain muted words with a thin rule on their right,
 * beside the title when the window has room for it, else one quiet line
 * under the title (main.css, .mf-margin-card).
 */
export function MarginCard({ who, where }: { who?: string | null; where?: string | null }): React.JSX.Element | null {
  const card = useLive(() => (who?.trim() || where?.trim() ? sources.card(who, where) : Promise.resolve(null)), null as SourceCard | null, [who, where])
  if (!card) return null
  const via = card.viaPage
  const line = [card.what, card.born && (card.died && card.field === 'attribution' ? `${card.born} to ${card.died}` : card.born)].filter(Boolean)
  return (
    <aside data-margin-card data-chrome contentEditable={false} className="mf-margin-card">
      <button type="button" data-margin-title onClick={() => (chime('page'), openSource(card.field, card.name))}
        className="mf-margin-title rounded text-foreground/85 hover:underline hover:underline-offset-2">{card.name}</button>
      {line.length > 0 && <span data-margin-line>{line.join(' · ')}</span>}
      {card.author && <span data-margin-author>{card.author}</span>}
      {card.via && (
        <span data-margin-via>via {via
          ? <button type="button" onClick={() => (chime('page'), openSource(via.field, via.name))} className="rounded hover:text-foreground hover:underline hover:underline-offset-2">{card.via}</button>
          : card.via}</span>
      )}
    </aside>
  )
}

/**
 * Rename a person or a source everywhere (their notes, page, photo and
 * @mentions), asking first when the new name is someone else's, then one
 * notice with Undo. Leaves their page open under the name it now has.
 */
async function renameSource(field: SourceField, from: string, to: string): Promise<boolean> {
  const name = to.trim()
  if (!name || name === from.trim()) return false
  let done = await sources.rename(field, from, name)
  if (done.merge) {
    if (!(await askSure(`Merge into ${done.merge.into}?`, done.merge.said, 'Merge'))) return false
    done = await sources.rename(field, from, name, true)
  }
  if (!done.token) return false
  const token = done.token
  chime('noted')
  openSource(field, done.name ?? name)
  toast(done.count ? `Renamed in ${plural(done.count, 'note')}` : `Renamed to ${done.name ?? name}`, () => void sources.unrename(token).then(() => openSource(field, from)))
  return true
}

/** A page's name, typed over in place: ↵ or leaving it renames everywhere, Esc puts it back. */
function SourceName({ field, name }: { field: SourceField; name: string }): React.JSX.Element {
  const box = useRef<HTMLHeadingElement>(null)
  const putBack = useRef(false)
  useEffect(() => {
    const onAsk = (event: Event): void => {
      const asked = (event as CustomEvent<string>).detail
      const el = box.current
      if (!el || asked.slice(0, asked.indexOf(':')) !== field || personKey(asked.slice(asked.indexOf(':') + 1)) !== personKey(name)) return
      el.focus()
      const range = document.createRange()
      range.selectNodeContents(el)
      window.getSelection()?.removeAllRanges()
      window.getSelection()?.addRange(range)
    }
    window.addEventListener('haligtree:rename-source', onAsk)
    return () => window.removeEventListener('haligtree:rename-source', onAsk)
  }, [field, name])
  return (
    <h2 data-source-name key={name} ref={box} contentEditable="plaintext-only" suppressContentEditableWarning spellCheck={false} aria-label={field === 'attribution' ? 'Their name' : 'Its name'}
      onKeyDown={(event) => {
        if (event.key === 'Enter') (event.preventDefault(), event.currentTarget.blur())
        if (event.key === 'Escape') (event.preventDefault(), event.stopPropagation(), putBack.current = true, event.currentTarget.blur())
      }}
      onBlur={(event) => {
        const el = event.currentTarget
        const typed = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
        if (putBack.current || !typed) return void (putBack.current = false, el.textContent = name)
        if (typed !== name) void renameSource(field, name, typed).then((done) => done || (el.textContent = name))
      }}
      className="-mx-1 w-fit max-w-full truncate rounded-md px-1 text-title font-semibold outline-none hover:bg-accent focus:overflow-visible focus:whitespace-normal focus:bg-accent">{name}</h2>
  )
}

/** A word in the line under a person's name, typed into where it is shown; sized to what it holds. */
function Fact({ value, placeholder, label, onSave }: { value: string; placeholder: string; label: string; onSave: (value: string) => void }): React.JSX.Element {
  return (
    <input data-fact={label} aria-label={label} defaultValue={value} key={value} placeholder={placeholder} maxLength={80}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        // Esc puts back what was there, as the page number does.
        if (event.key === 'Escape') (event.preventDefault(), event.stopPropagation(), event.currentTarget.value = value, event.currentTarget.blur())
      }}
      onBlur={(event) => event.target.value.trim() !== value && onSave(event.target.value.trim())}
      className="min-w-[2ch] rounded-md bg-transparent px-1 py-0.5 text-body text-foreground outline-none [field-sizing:content] placeholder:text-muted-foreground hover:bg-accent focus:bg-accent" />
  )
}

/**
 * A person's page head, like an artist's page: their photo (or their shape),
 * their name, and one plain line of what they did and when they lived. Every
 * part is changed where it is: click or drop on the photo, type in the line.
 */
function PersonHead({ page, name, close = false }: { page: SourcePage | null; name: string; /** Under the page's path: less room over it. */ close?: boolean }): React.JSX.Element {
  const photo = useAvatar(name)
  const [over, setOver] = useState(false)
  const facts = (patch: Partial<SourceFacts>): void => void sources.facts('attribution', name, patch).then(() => chime('noted'))
  return (
    <header data-person-head className={`px-5 ${close ? 'pt-4' : 'pt-8'}`}>
      <div className="flex items-start gap-5">
        <PersonMenu name={name} work={page?.character?.work ?? ''}>
          <div className="group/photo relative shrink-0"
            onDragOver={(event) => (event.preventDefault(), setOver(true))} onDragLeave={() => setOver(false)}
            onDrop={(event) => {
              event.preventDefault()
              setOver(false)
              const file = [...event.dataTransfer.files].find((one) => one.type.startsWith('image/'))
              if (file) void setAvatar(name, file)
            }}>
            {/* With a photo, the face opens it whole; with none, it asks for one. */}
            <button type="button" data-person-photo={photo ? 'picture' : 'shape'} aria-label={photo ? `See ${name}’s photo` : `Add a photo of ${name}`}
              onClick={(event) => void (photo ? (chime('open'), openLook(photo, event.currentTarget, name)) : pickAvatar(name))}
              className={`relative block rounded-full transition-shadow duration-150 focus-visible:ring-2 focus-visible:ring-ring ${over ? 'ring-2 ring-ring ring-offset-2 ring-offset-background' : ''}`}>
              <Avatar name={name} size={96} />
              {/* Said on the face itself while the pointer is on it (or a picture is carried over).
                  A photo only darkens a touch under a small expand mark, as a picture in a note opens. */}
              <span aria-hidden data-photo-hint className={`pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-full text-white transition-[opacity,background-color] duration-200 ease-[var(--mf-ease)] group-hover/photo:opacity-100 group-focus-visible/photo:opacity-100 ${photo && !over ? 'bg-black/25' : 'bg-black/50'} ${over ? 'opacity-100' : 'opacity-0'}`}>
                <span className={`flex flex-col items-center gap-1 transition-transform duration-200 ease-[var(--mf-ease)] motion-reduce:transition-none group-hover/photo:scale-100 ${over ? 'scale-100' : 'scale-90'}`}>
                  {over || !photo ? <Camera className="size-5" /> : <Fit className="size-[18px] text-white/90 drop-shadow-[0_1px_2px_rgb(0_0_0/0.4)]" />}
                  {(over || !photo) && <span className="text-meta font-medium">{over ? 'Drop it here' : 'Add a photo'}</span>}
                  {photo && !over && <span className="sr-only">See it</span>}
                </span>
              </span>
            </button>
            {/* Changing one that is there: its own small button on the face's edge, there while the pointer is. */}
            {photo && !over && (
              <Tip label="Change photo" side="right">
                <button type="button" data-photo-change aria-label={`Change ${name}’s photo`} onClick={() => void pickAvatar(name)}
                  className="absolute right-0 bottom-0 flex size-7 scale-90 items-center justify-center rounded-full shrink-0 border bg-popover text-muted-foreground opacity-0 shadow-sm transition-[opacity,scale,color,background-color] duration-200 ease-[var(--mf-ease)] hover:bg-accent hover:text-foreground focus-visible:scale-100 focus-visible:opacity-100 active:scale-95 motion-reduce:transition-[opacity] group-hover/photo:scale-100 group-hover/photo:opacity-100">
                  <Camera className="size-3.5" />
                </button>
              </Tip>
            )}
          </div>
        </PersonMenu>
        <div className="min-w-0 flex-1 pt-1">
          <p data-person-kind className="text-control text-muted-foreground">{page?.character ? 'Character' : 'Person'}</p>
          <SourceName field="attribution" name={name} />
          {/* A character: the work they belong to, opening its note (or its page), and who played or voiced them. Born and died do not apply. */}
          {page?.character ? <CharacterLine name={name} character={page.character} /> : (
          <p data-person-line className="-ml-1 mt-0.5 flex flex-wrap items-baseline text-body text-foreground">
            <Fact label="What they did" placeholder="What they did" value={page?.what ?? ''} onSave={(what) => facts({ what })} />
            <span aria-hidden className="px-0.5">·</span>
            <Fact label="Born" placeholder="Born" value={page?.born ?? ''} onSave={(born) => facts({ born })} />
            {/* Someone still living reads "1964 to now": "now" is only a hint, typed over once they have died. */}
            {(page?.born || page?.died) && <>
              {/* No room of its own: the years' own padding is the space, so "1870 to 1924" reads as one span of years. */}
              <span>to</span>
              <Fact label="Died" placeholder="now" value={page?.died ?? ''} onSave={(died) => facts({ died })} />
            </>}
          </p>
          )}
          {!page?.character && !isMe(name) && <ContactLine name={name} />}
        </div>
      </div>
    </header>
  )
}

type Contact = { id: string; name: string; org: string; email: string; photo: string }
type Linked = Omit<Contact, 'photo'>
/** What the Mac said when asked for Contacts, in plain words: each its own cause, checked. */
const CONTACT_WHY = {
  denied: 'Your Mac does not let Haligtree read Contacts. Turn it on in Privacy & Security, Contacts.',
  restricted: 'This Mac’s owner lets no app read Contacts, so there is none to link.'
} as const

/**
 * A person linked to a real contact in the Mac's Contacts (main/contacts.ts): where they work and an email, under
 * their line, and their photo for their page when they have none. macOS asks only when “Link a contact” is clicked.
 */
function ContactLine({ name }: { name: string }): React.JSX.Element {
  const [linked, setLinked] = useState<Linked | null | undefined>(undefined)
  const [found, setFound] = useState<Contact[] | null>(null)
  const [why, setWhy] = useState<string | null>(null)
  const [denied, setDenied] = useState(false)
  const [asking, setAsking] = useState(false)
  const avatar = useAvatar(name)
  useEffect(() => void call<Linked | null>('contacts:linked', name).then(setLinked), [name])
  const link = async (one: Contact): Promise<void> => {
    await call('contacts:link', name, one)
    // Their photo only where the page has none: a picture you chose stays yours.
    const photo = !!one.photo && !avatar
    if (photo) await setAvatar(name, new Blob([Uint8Array.from(atob(one.photo), (char) => char.charCodeAt(0))]))
    setFound(null)
    setLinked(one)
    chime('noted')
    toast(`Linked to your contact ${quoted(one.name, 60)}${photo ? ', with their photo' : ''}`, () => void call('contacts:unlink', name).then(async () => {
      if (photo) await setAvatar(name, null)
      setLinked(null)
    }))
  }
  const find = async (): Promise<void> => {
    chime('tap')
    setAsking(true)
    setWhy(null)
    const said = await call<{ status: 'on' | 'unasked' | 'denied' | 'restricted'; contacts?: Contact[] }>('contacts:find', name).catch(() => ({ status: 'denied' as const, contacts: [] }))
    setAsking(false)
    setDenied(said.status === 'denied')
    if (said.status === 'denied' || said.status === 'restricted') return setWhy(CONTACT_WHY[said.status])
    if (said.status !== 'on') return setWhy('Your Mac did not answer whether Haligtree may read Contacts. Try once more.')
    if (!said.contacts?.length) return setWhy(`No contact is named ${quoted(name, 60)} in your Contacts.`)
    if (said.contacts.length === 1) return void link(said.contacts[0])
    setFound(said.contacts)
  }
  const unlink = (): void => {
    const was = linked
    void call('contacts:unlink', name).then(() => {
      setLinked(null)
      chime('off')
      toast(`No longer linked to ${quoted(was?.name ?? name, 60)}`, () => void call('contacts:link', name, was).then(() => setLinked(was ?? null)))
    })
  }
  if (linked === undefined) return <p className="mt-1 min-h-7" />
  return (
    <div data-person-contact={linked ? 'linked' : 'none'} className="mt-1 flex min-h-7 flex-col items-start gap-1">
      {linked ? (
        <p className="flex flex-wrap items-center gap-x-1.5 text-control text-muted-foreground">
          <User className="size-3.5" />
          <span>In your Contacts as <span className="text-foreground">{linked.name}</span>{linked.org ? `, ${linked.org}` : ''}{linked.email ? ` · ${linked.email}` : ''}</span>
          <Button variant="ghost" size="sm" data-contact-unlink className="h-6 cursor-pointer px-1.5 text-control" onClick={unlink}>Unlink</Button>
        </p>
      ) : asking ? <Orb label="Looking in your Contacts…" /> : (
        <Button variant="ghost" size="sm" data-contact-link className="-ml-1.5 h-7 cursor-pointer gap-1.5 px-1.5 text-control text-muted-foreground hover:text-foreground" onClick={() => void find()}><User className="size-3.5" />Link a contact</Button>
      )}
      {why && (
        <p data-contact-why className="flex flex-wrap items-center gap-x-2 text-control text-foreground">
          {why}
          {denied && <Button variant="outline" size="sm" data-contact-privacy className="h-6 cursor-pointer px-2 text-control" onClick={() => (chime('open'), void call('contacts:privacy'))}>Open Privacy & Security</Button>}
        </p>
      )}
      {found && (
        <ul data-contact-choices className="flex flex-wrap gap-1.5">
          {found.map((one) => (
            <li key={one.id}>
              <button type="button" data-contact-choice={one.id} onClick={() => void link(one)} className="flex cursor-pointer items-center gap-1.5 rounded-full border bg-background py-0.5 pr-2.5 pl-0.5 text-control text-foreground hover:bg-accent">
                {one.photo ? <img alt="" src={`data:image/jpeg;base64,${one.photo}`} className="size-5 shrink-0 rounded-full object-cover" /> : <User className="ml-1 size-3.5 shrink-0 text-muted-foreground" />}
                {one.name}{one.org ? <span className="text-muted-foreground">· {one.org}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Under a character's name: "in Dune", the work opening its own note when one
 * is titled with it (else its page in Sources), then who played or voiced
 * them, typed where it is shown.
 */
function CharacterLine({ name, character }: { name: string; character: Character }): React.JSX.Element {
  const note = character.workNote
  return (
    <p data-character-line className="-ml-1 mt-0.5 flex flex-wrap items-baseline text-body text-foreground">
      <span className="px-1 text-muted-foreground">in</span>
      <button type="button" data-character-work-open {...(note ? hoverNote(note.type, note.id) : {})}
        onClick={() => (chime('page'), note ? window.api.openInHome(note.type, note.id) : openSource('medium', character.work))}
        // On the line's own baseline by its words, not by its icon: a row of words lines a chip up by the first thing
        // in it, and an icon's baseline is its bottom edge, so the work's name sat higher than "in" and "played by".
        className="flex max-w-full cursor-pointer items-baseline gap-1 rounded-md px-1 py-0.5 font-medium text-foreground hover:bg-accent">
        <BookOpen className="size-3.5 shrink-0 self-center text-muted-foreground" /><span className="truncate">{character.work}</span>
      </button>
      <span aria-hidden className="px-0.5">·</span>
      <span className="px-0.5 text-muted-foreground">played by</span>
      <Fact label="Played or voiced by" placeholder="anyone, if filmed or voiced" value={character.played} onSave={(played) => void sources.character(name, character.work, played).then(() => chime('noted'))} />
    </p>
  )
}

/** A data address as a picture, read here: the page may not fetch anything, a data address included. */
const blobOf = (data: string): Blob => {
  const [head, body] = data.split(',', 2)
  const bytes = Uint8Array.from(atob(body), (letter) => letter.charCodeAt(0))
  return new Blob([bytes], { type: /data:([^;]+)/.exec(head)?.[1] ?? 'image/jpeg' })
}

/**
 * A line or two about them, under the name. The first time the page opens it
 * is filled from Wikipedia's summary (its first two sentences, said "From
 * Wikipedia" with a link: CC BY-SA asks for the credit) and kept here, so it
 * reads offline. Typed over, your words replace it and the credit goes. Never
 * found (offline, or no article by that name): nothing, and a quiet way to write one.
 */
function Bio({ field, name, page }: { field: SourceField; name: string; page: SourcePage | null }): React.JSX.Element | null {
  const asked = !page || !!page.bioAt
  // A person whose line came from Wikipedia but who has no face yet is asked again (kept, so offline-quick) for the picture.
  // Never for the person who is you: they wear your photo, and a picture found for them would become it.
  const wantFace = !!page && field === 'attribution' && !!page.bioUrl && !avatarOf(name) && !isMe(name)
  const wiki = useWiki(asked && !wantFace ? null : name)
  useEffect(() => {
    if (!page || (wiki.state !== 'found' && wiki.state !== 'missing')) return
    if (page.bioAt) {
      if (wantFace && wiki.page?.picture && pageFor(wiki.page, name))
        void window.api.haligtree<string | null>('feed:picture', wiki.page.picture).then(async (data) => {
          if (data && !avatarOf(name)) await setAvatar(name, blobOf(data))
        })
      return
    }
    // Only the article by that very name: "Mum" is not the article about mothers.
    const fits = !!wiki.page && pageFor(wiki.page, name)
    void sources.bio(field, name, fits ? firstSentences(wiki.page!.extract) : '', fits ? wiki.page!.url : '')
    if (!fits) return
    // The article's one line ("Italian polymath") as what they did, when nothing is written there yet.
    if (!page.what && wiki.page!.description) void sources.facts(field, name, { what: wiki.page!.description[0].toUpperCase() + wiki.page!.description.slice(1) })
    // A person's lead picture as their face, when they have none: only a freely licensed one from Wikimedia Commons
    // (wiki.ts keeps no other). Fetched by the app, never by the page, and shrunk like any face you add.
    if (field === 'attribution' && wiki.page!.picture && !avatarOf(name) && !isMe(name))
      void window.api.haligtree<string | null>('feed:picture', wiki.page!.picture).then(async (data) => {
        if (data && !avatarOf(name)) await setAvatar(name, blobOf(data))
      })
  }, [wiki.state, wiki.page, page, field, name, wantFace])
  // The page waits only for its own read, never for Wikipedia: the first time, the line's room is kept at once (three
  // quiet lines), the words fade into it when they come, and nothing under it moves. Kept once fetched, so every
  // later visit has it at once, offline too. No answer in 4 seconds: the room closes, once, and its orb stops with it.
  // The moment the lookup ends, late or not, the line shows what came: its words, or "Add a line about them" when
  // nothing did. A closed room left in place read as a failed page, its orb still turning (Oscar Wilde, 1 Nov).
  useReading(!page)
  const asking = !!page && !page.bioAt && wiki.state !== 'offline' && wiki.state !== 'failed'
  // Asked on this visit: the words fade in when they come, the room kept for them.
  const [fresh] = useState(() => !page?.bioAt)
  const [late, setLate] = useState(false)
  useEffect(() => {
    if (!asking) return
    const wait = setTimeout(() => setLate(true), 4000)
    return () => clearTimeout(wait)
  }, [asking])
  const [text, setText] = useState(page?.bio ?? '')
  const [writing, setWriting] = useState(false)
  useEffect(() => setText(page?.bio ?? ''), [page?.bio])
  if (!page) return null
  if (asking && !writing) return (
    <div data-bio-room={late ? 'closed' : 'waiting'} aria-hidden className="grid px-5 transition-[grid-template-rows,opacity,margin] duration-300 ease-out motion-reduce:transition-none"
      style={{ gridTemplateRows: late ? '0fr' : '1fr', opacity: late ? 0 : 1, marginTop: late ? 0 : '1rem' }}>
      <div className="min-h-0 overflow-hidden">
        {/* The app's one way to say "a real wait": the orb and its shimmering words (main.css .mf-shimmer), never grey bars. Its room is the line's usual three lines, so nothing moves when the words come. */}
        <div className="py-1 text-heading leading-relaxed"><div className="flex h-[3lh] items-start">{!late && <Orb label={`Looking up ${name}…`} />}</div></div>
      </div>
    </div>
  )
  const save = (): void => {
    setWriting(false)
    const typed = text.replace(/\s+/g, ' ').trim()
    if (typed === page.bio.trim()) return
    const was = { bio: page.bio, url: page.bioUrl }
    void sources.bio(field, name, typed, '').then(() => (chime('noted'), quietly(() => void sources.bio(field, name, was.bio, was.url))))
  }
  if (!page.bio && !writing) return (
    <button type="button" data-bio-add onClick={() => (chime('tap'), setWriting(true))}
      className="mt-4 ml-4 rounded-md px-1 py-0.5 text-body text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
      {field === 'attribution' ? 'Add a line about them' : 'Add a line about it'}
    </button>
  )
  return (
    <div data-bio className={cn('mt-4 px-5', fresh && page.bio && 'min-h-[calc(3lh+0.5rem)] text-heading leading-relaxed [animation:mf-fade_300ms_ease-out] motion-reduce:[animation:none]')}>
      <textarea data-bio-text value={text} rows={1} autoFocus={writing} aria-label={field === 'attribution' ? 'About them' : 'About it'}
        placeholder={field === 'attribution' ? 'A line about them' : 'A line about it'}
        onChange={(event) => setText(event.target.value)} onBlur={save}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) (event.preventDefault(), event.currentTarget.blur())
          if (event.key === 'Escape') (event.preventDefault(), event.stopPropagation(), setText(page.bio), setWriting(false), event.currentTarget.blur())
        }}
        className="-mx-2 block w-[calc(100%+1rem)] resize-none rounded-md bg-transparent px-2 py-1 text-heading leading-relaxed text-pretty outline-none [field-sizing:content] placeholder:text-muted-foreground hover:bg-accent/50 focus:bg-accent/50" />
      {page.bioUrl && text === page.bio && (
        <a data-bio-credit href={page.bioUrl} target="_blank" rel="noopener noreferrer" title="Text from Wikipedia, CC BY-SA"
          className="-mx-1 inline-flex items-center gap-0.5 rounded-sm px-1 py-1 text-meta text-muted-foreground hover:text-foreground hover:underline hover:underline-offset-2">
          From Wikipedia <ArrowUpRight className="size-3" />
        </a>
      )}
    </div>
  )
}

/** A quote's words, without quotation marks of their own: the page sets its own. */
const bare = (text: string): string => withoutTags(text).replace(/\s+/g, ' ').trim().replace(/^["“”‘’']+|["“”‘’']+$/g, '').trim()

/** Words that say how sure a credit is, not where the words are from. */
const NOT_A_PLACE = /^((un|mis)?attributed( to)?|unknown|apocryphal|disputed)$/i

/**
 * One of their words as a row of its island, as the Inbox draws a quote: the
 * words in quotation marks over up to three lines, and where they are from
 * as the quiet line under them, "Frankenstein, chapter 10 (1831)".
 */
const quoteEntry = (field: SourceField, page: SourcePage, item: SourceItem): Entry => {
  // "attributed" or "unknown" says how sure the credit is, not where the words are from: never a place under a quote.
  const said = field === 'attribution' ? item.medium?.trim() : item.attribution?.trim()
  const from = said && !NOT_A_PLACE.test(said) ? said : ''
  const year = field === 'attribution' ? (item.medium ? page.years[personKey(item.medium)] : '') : page.born
  const ref = item.location ? (isPage(item.location) ? `p. ${item.location}` : item.location) : ''
  const place = [from, ref].filter(Boolean).join(', ')
  // A where that names its year already ("Frankenstein, chapter 4 (1831)") is not given it twice.
  const named = !!year && (!!place.match(/\d+/g)?.includes(year) || place.includes(`(${year})`))
  const under = place && year && !named ? `${place} (${year})` : place || year || ''
  return {
    id: item.id,
    type: item.type,
    title: `“${bare(item.label)}”`,
    tags: [],
    icon: kindOf('quote').icon,
    tint: kindOf('quote').tint,
    voice: item.voice,
    wrap: 3,
    sub: under ? <span data-quote-from>{under}</span> : undefined
  }
}

/** What you make of them, inside its island: a field once started; until then one quiet row that starts it. */
function Thoughts({ field, name, page }: { field: SourceField; name: string; page: SourcePage }): React.JSX.Element {
  const [text, setText] = useState(page.thoughts)
  const [writing, setWriting] = useState(false)
  useEffect(() => setText(page.thoughts), [page.thoughts])
  const asked = `What you make of ${field === 'attribution' ? 'them' : 'it'}, in your own words`
  if (!page.thoughts.trim() && !writing) return (
    <button type="button" data-thoughts-add onClick={() => (chime('tap'), setWriting(true))}
      className="block w-full rounded-md px-2 py-1.5 text-left text-body leading-relaxed text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground">
      {asked}
    </button>
  )
  return (
    <textarea data-thoughts value={text} rows={2} autoFocus={writing} placeholder={asked}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => (setWriting(false), text !== page.thoughts && void sources.set(field, name, text).then(() => chime('noted')))}
      onKeyDown={(event) => event.key === 'Escape' && (event.preventDefault(), event.stopPropagation(), setText(page.thoughts), event.currentTarget.blur())}
      className="block w-full resize-none rounded-md bg-transparent px-2 py-1.5 text-body leading-relaxed outline-none [field-sizing:content] placeholder:text-muted-foreground hover:bg-accent/50 focus:bg-accent/50" />
  )
}

type Near = Awaited<ReturnType<typeof sources.near>>

/** What connects to them, inside its island: the tags their notes carry, the other side's pages, and people quoted alongside them, each a line with its label on the left. */
function Connections({ field, page, near }: { field: SourceField; page: SourcePage; near: Near }): React.JSX.Element {
  // The labels one column on the island's left; narrow, that column gives up room before the chips do.
  const row = 'grid grid-cols-[minmax(5.5rem,8rem)_minmax(0,1fr)] items-baseline gap-3 px-2 py-1'
  const label = 'text-control text-muted-foreground'
  const chips = '-ml-1 flex min-w-0 flex-wrap gap-x-1 gap-y-0.5'
  return (
    <div className="flex flex-col py-0.5">
      {page.tags.length > 0 && (
        <div data-connect="tags" className={row}>
          <span className={label}>Tags</span>
          <span className={chips}>
            {page.tags.map((one) => (
              <button key={one.tag} type="button" data-connect-tag={one.tag} {...hoverNote('tag', one.tag)} onClick={(event) => (chime('page'), openTag(one.tag, event.altKey))}
                className="max-w-full truncate rounded-md px-1 py-0.5 text-body text-foreground hover:bg-accent">#{one.tag}</button>
            ))}
          </span>
        </div>
      )}
      {page.links.length > 0 && (
        <div data-connect={field === 'attribution' ? 'sources' : 'people'} className={row}>
          <span className={label}>{field === 'attribution' ? 'Found in' : 'People in it'}</span>
          <span className={chips}>
            {page.links.map((one) => (
              <button key={one.name} type="button" data-connect-page={one.name} onClick={() => (chime('page'), openSource(one.field, one.name))}
                className="flex max-w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-body text-foreground hover:bg-accent">
                {one.field === 'attribution' ? <Avatar name={one.name} size={16} /> : <Library className="size-3.5 shrink-0 text-muted-foreground" />}<span className="truncate">{one.name}</span>
              </button>
            ))}
          </span>
        </div>
      )}
      {near.length > 0 && (
        <div data-connect="alongside" className={row}>
          <span className={label}>Quoted alongside</span>
          <span className={chips}>
            {near.map((one) => (
              <button key={one.name} type="button" data-also-person={one.name} {...hoverNote('person', one.name)} onClick={() => (chime('page'), openSource('attribution', one.name))}
                className="flex max-w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-body text-foreground hover:bg-accent">
                <Avatar name={one.name} size={16} /><span className="truncate">{one.name}</span>
              </button>
            ))}
          </span>
        </div>
      )}
    </div>
  )
}

/** A note on a source page: its words, and its page reference, said in your voice. */
const entryOf = (item: SourceItem): Entry => {
  const kind = kindOf(item.kind)
  const ref = pageRef(item.location) ?? pageRef(item.label)
  return {
    id: item.id,
    type: item.type,
    title: item.label,
    tags: [],
    icon: item.type === 'article' ? FileText : kind.icon,
    tint: kind.tint,
    voice: item.voice,
    // How long ago, as the Inbox says it on every row.
    age: age(item.at),
    wrap: true,
    sub: [ref && (ref.direct ? `p. ${ref.page}, word for word` : `p. ${ref.page}, in your words`), item.status, item.rating ? '★'.repeat(item.rating) : null].filter(Boolean).join(' · ') || undefined
  }
}

/** "12 March 2024". */
const dayFull = (at: string): string => new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

/**
 * One person's or one source's page, as a portrait: who they are and a line
 * about them, their words as quotes, what you make of them, what connects to
 * them, and when you first met them. Said to you throughout.
 */
export function SourcePageView({ focus, onOpen, onSources }: { focus?: string; onOpen: (type: string, id: string) => void; /** To the Sources page, from the path over this one. */ onSources?: () => void }): React.JSX.Element {
  const which = readFocus(focus)
  const page = useLive(() => (which ? sources.page(which.field, which.name) : Promise.resolve(null)), null, [focus])
  // A work's details as its citations keep them, read before the page shows (its `waiting`): who wrote it came in a beat after the page, a line dropped in under its name.
  // Asked before the notes that cite it (a look through every note's words), so the page never waits for those.
  const workRead = useLive(() => (which?.field === 'medium' ? cite.works().then((all) => ({ one: all.find((one) => personKey(one.title) === personKey(page?.name ?? which.name)) ?? null })) : Promise.resolve({ one: null })), { one: null } as { one: Work | null }, [focus, page?.name])
  const work = workRead.one
  const near = useLive(() => (which?.field === 'attribution' ? sources.near(page?.name ?? which.name) : Promise.resolve([])), [] as Near, [focus, page?.name, page?.items.length])
  // A work's notes that cite it.
  const citers = useLive(() => (which?.field === 'medium' ? cite.citers(page?.name ?? which.name) : Promise.resolve([] as Citer[])), [] as Citer[], [focus, page?.name])
  const voices = useMemo(() => {
    const by: Record<Voice, SourceItem[]> = { theirs: [], understood: [], mine: [] }
    for (const item of page?.items ?? []) by[item.voice].push(item)
    return by
  }, [page])
  // Each section an island, as the Inbox draws its kinds: folded ones stay folded on every person's and source's page.
  const island = useIslands('source-page', true)
  if (!which) return <Page title="Source"><div className="page-column"><Empty title="No such page">Pick a person or a source from the Sources page.</Empty></div></Page>
  const name = page?.name ?? which.name
  const field = which.field
  const Icon = FIELD_SAID[field].icon
  const them = field === 'attribution' ? 'them' : 'it'
  const QuoteKind = kindOf('quote')
  const NoteKind = kindOf('note')
  const open = (item: SourceItem): void => (chime('open'), onOpen(item.type, item.id))
  const yours = [...voices.understood, ...voices.mine]
  const first = page?.items.reduce<SourceItem | null>((oldest, one) => (!oldest || one.at < oldest.at ? one : oldest), null)
  const linked = page ? [...page.tags, ...page.links, ...near] : []
  const said = {
    words: field === 'attribution' ? 'Their words' : 'Words from it',
    yours: `Your notes on ${them}`,
    thoughts: 'Your thoughts',
    connects: `What connects to ${them}`,
    found: 'Found through it',
    met: `When you first met ${them}`,
    cited: 'Notes citing it'
  }
  const { groups: showing, islands } = island<unknown>(page ? [
    [said.words, voices.theirs], [said.cited, citers], [said.yours, yours], [said.thoughts, [page.thoughts]], [said.connects, linked], [said.found, page.found], [said.met, first ? [first] : []]
  ] : [])
  /** What shows of a section: its first few, or all of it once opened past "Show more". */
  const shown = <T,>(title: string): T[] => (showing.find(([one]) => one === title)?.[1] ?? []) as T[]
  const takeOff = (item: SourceItem): void => sayNow(setSource(item, field, null), `No longer from ${name}`, () => void setSource(item, field, name))
  const menu = (item: SourceItem): RowItem[] => [{ label: 'Open', run: () => open(item) }, { label: `Take off ${quoted(name, 80)}`, run: () => takeOff(item) }]
  const pick = (list: SourceItem[]) => (id: string): void => open(list.find((one) => one.id === id)!)
  const box = (portrait: string, title: string, icon: React.ReactNode, children: React.ReactNode, count: number, uncounted = false): React.ReactNode => islands?.[title] && (
    <div data-portrait={portrait} className="mt-2 first:mt-0">
      <IslandBox name={title} island={islands[title]} shown={count} icon={icon} uncounted={uncounted}>{children}</IslandBox>
    </div>
  )
  const theirs = shown<SourceItem>(said.words)
  const mine = shown<SourceItem>(said.yours)
  const citing = shown<Citer>(said.cited)
  return (
    <Page title={name} count={page?.items.length ?? 0} unit={['note', 'notes']} waiting={unloaded(workRead)}>
      <div className="page-column pb-16" data-source-page={field}>
        {/* Where this page is: "Sources › Lord Henry", the way up one press away, as a folder's path is over Gems and
            Writing (items-view.tsx, the same parts). Reached from a name in the Feed or a note, a source's page had no way
            to the rest of them but the sidebar (asked 12 Nov: "why no easy jump to sources through breadcrumb"). */}
        {onSources && (
          <nav data-source-path aria-label="Sources path" className="flex min-w-0 items-center gap-0.5 px-5 pt-4 text-body">
            <Tip label="Sources  G J">
              <button type="button" data-source-back onClick={() => (chime('tuck'), onSources())} className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"><span>Sources</span></button>
            </Tip>
            <ChevronRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground/60" />
            <span aria-current="page" className="flex min-w-0 items-center gap-1.5 px-1.5 py-0.5 font-medium text-foreground"><span className="truncate">{name}</span></span>
          </nav>
        )}
        {field === 'attribution' ? <PersonHead page={page} name={name} close={!!onSources} /> : (
        <div className={`flex items-center gap-3 px-5 ${onSources ? 'pt-4' : 'pt-8'}`}>
          <Icon className="size-8 text-muted-foreground" />
          {/* The rest of the row, as a person's head has it: sized to its words, a short title was cut ("Pride and Prejudice, chapter…") with room to spare. */}
          <div className="min-w-0 flex-1">
            <p className="text-control text-muted-foreground">{FIELD_SAID[field].one}</p>
            <SourceName field={field} name={name} />
            <SourceLine page={page} name={name} />
            {work && (work.authors || work.publisher || work.doi || work.isbn) && <WorkLine work={work} />}
          </div>
        </div>
        )}
        <Bio key={`${field}:${name}`} field={field} name={name} page={page} />
        {page && !page.items.length && !citers.length && <p className="mt-8 px-5 text-body text-muted-foreground">{field === 'attribution' ? `Nothing from ${name} yet. A note that says ${name} said it shows here.` : `Nothing from ${name} yet. A note that says it came from here shows here.`}</p>}
        {page && (
          <div data-source-islands className="mx-3 mt-8">
            {box('words', said.words, <QuoteKind.icon aria-hidden className="size-4 shrink-0" style={{ color: QuoteKind.tint }} />,
              <NoteList groups={[['', theirs.map((item) => ({ ...quoteEntry(field, page, item), menu: menu(item) }))]]} density="list" table="nuggets" cursor={-1} onPick={pick(theirs)} />, theirs.length)}
            {box('cited', said.cited, <BookMarked aria-hidden className="size-4 shrink-0 text-muted-foreground" />,
              <NoteList groups={[['', citing.map((one) => ({ id: one.id, type: one.type, title: one.title, tags: [], icon: kindOf(one.kind).icon, tint: kindOf(one.kind).tint, menu: [{ label: 'Open', run: () => (chime('open'), onOpen(one.type, one.id)) }] }))]]}
                density="list" table="nuggets" cursor={-1} onPick={(id) => { const one = citing.find((each) => each.id === id); if (one) (chime('open'), onOpen(one.type, one.id)) }} />, citing.length)}
            {box('yours', said.yours, <NoteKind.icon aria-hidden className="size-4 shrink-0" style={{ color: NoteKind.tint }} />,
              <NoteList groups={[['', mine.map((item) => ({ ...entryOf(item), menu: menu(item) }))]]} density="list" table="nuggets" cursor={-1} onPick={pick(mine)} />, mine.length)}
            {box('thoughts', said.thoughts, <PenLine aria-hidden className="size-4 shrink-0 text-muted-foreground" />,
              <Thoughts key={`t:${field}:${name}`} field={field} name={name} page={page} />, 1, true)}
            {box('connects', said.connects, <Link2 aria-hidden className="size-4 shrink-0 text-muted-foreground" />,
              <Connections field={field} page={page} near={near} />, linked.length)}
            {box('found', said.found, <Library aria-hidden className="size-4 shrink-0 text-muted-foreground" />,
              <FoundThrough page={page} />, page.found.length)}
            {first && box('first-met', said.met, <CalendarDays aria-hidden className="size-4 shrink-0 text-muted-foreground" />,
              // The day, and the note you met them in: a press opens it.
              <div data-first-met>
                <NoteList groups={[['', [{ id: first.id, type: first.type, title: dayFull(first.at), tags: [], icon: CalendarDays, sub: `${ago(first.at)}, in ${quoted(bare(first.label) || 'New note', 60)}`, menu: [{ label: 'Open', run: () => open(first) }] }]]]}
                  density="list" table="nuggets" cursor={-1} onPick={() => open(first)} />
              </div>, 1, true)}
          </div>
        )}
      </div>
    </Page>
  )
}

/**
 * The plain line under a source's name, typed into where it is shown: what
 * kind it is, its year, and where it was found. A "via" that names another
 * page in the book opens it.
 */
function SourceLine({ page, name }: { page: SourcePage | null; name: string }): React.JSX.Element {
  const facts = (patch: Partial<SourceFacts>): void => void sources.facts('medium', name, patch).then(() => chime('noted'))
  const via = page?.viaPage
  return (
    <p data-source-line className="-ml-1 mt-0.5 flex flex-wrap items-baseline text-body text-foreground">
      <Fact label="Kind" placeholder="Book, podcast, film" value={page?.what ?? ''} onSave={(what) => facts({ what })} />
      <span aria-hidden className="px-0.5">·</span>
      <Fact label="Year" placeholder="Year" value={page?.born ?? ''} onSave={(born) => facts({ born })} />
      <span aria-hidden className="px-0.5">·</span>
      <span className="px-0.5 text-muted-foreground">via</span>
      <Fact label="Via" placeholder="where you found it" value={page?.via ?? ''} onSave={(next) => facts({ via: next })} />
      {via && (
        <button type="button" data-via-open onClick={() => (chime('page'), openSource(via.field, via.name))}
          className="ml-1 rounded-md px-1 py-0.5 text-control text-foreground hover:bg-accent">{via.field === 'attribution' ? `Everything by ${via.name}` : `Everything from ${via.name}`}</button>
      )}
    </p>
  )
}

/** A work's authors, publisher and DOI or ISBN, as its lookup or your own hand gave them: the DOI opens its page. */
function WorkLine({ work }: { work: Work }): React.JSX.Element {
  const link = work.doi ? `https://doi.org/${work.doi}` : ''
  return (
    <p data-work-line className="mt-1 flex flex-wrap items-baseline gap-x-1.5 text-body text-foreground">
      {work.authors && <span>{work.authors.split(';').map((one) => one.trim()).join(', ')}</span>}
      {work.authors && work.publisher && <span aria-hidden>·</span>}
      {work.publisher && <span>{work.publisher}</span>}
      {(work.authors || work.publisher) && (link || work.isbn) && <span aria-hidden>·</span>}
      {link ? <a href={link} target="_blank" rel="noreferrer" className="cursor-pointer text-primary underline-offset-2 hover:underline">doi:{work.doi}</a> : work.isbn && <span>ISBN {work.isbn}</span>}
    </p>
  )
}

/** Every page whose "via" names this one: what you found through it, as rows inside its island. */
function FoundThrough({ page }: { page: SourcePage }): React.JSX.Element {
  return (
    <ul data-found-through className="flex flex-col">
      {page.found.map((one) => {
        const Icon = FIELD_SAID[one.field].icon
        return (
          <li key={`${one.field}:${one.name}`}>
            <button type="button" onClick={() => (chime('page'), openSource(one.field, one.name))}
              className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-body text-foreground transition-colors hover:bg-accent/50">
              {one.field === 'attribution' ? <Avatar name={one.name} size={16} /> : <Icon className="size-4 shrink-0 text-muted-foreground" />}
              <span className="truncate">{one.name}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** Made-up people and sources for the empty page's example: a name, how many notes, how many quotes. */
const EXAMPLE_PEOPLE: [string, number, number][] = [['Jane Austen', 4, 3], ['Marcus Aurelius', 2, 2]]
const EXAMPLE_PLACES: [string, number, number][] = [['Frankenstein', 3, 1], ['The Matrix (1999)', 2, 0]]
const exampleEntry = (field: SourceField, name: string, count: number, quotes: number): Entry => ({
  id: `example:${field}:${name}`, type: 'source', title: name, tags: [], icon: FIELD_SAID[field].icon,
  sub: `${plural(count, "note")}${quotes ? ` · ${plural(quotes, 'quote')}` : ''}`
})

/** People as big round faces, like an artists' shelf: their photo or shape, the name, and how much is from them. */
/** The faces shown before “Show all”: six rows of five at the desktop width, so hundreds of people never make a wall. */
const FACES_SHOWN = 30

function FaceGrid({ people, title = 'People' }: { people: SourceSummary[]; title?: 'People' | 'Characters' }): React.JSX.Element {
  const [all, setAll] = useState(false)
  return (
    <section data-people-grid={title === 'People' ? '' : undefined} data-characters-grid={title === 'Characters' ? '' : undefined} className="mx-3 my-2">
      <h3 className="mb-2 flex items-center gap-2 px-2 text-heading font-semibold">{title} <Count n={people.length} className="text-control font-normal text-muted-foreground" /></h3>
      <div className="grid gap-x-2 gap-y-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(10rem, 1fr))' }}>
        {people.slice(0, all ? undefined : FACES_SHOWN).map((one) => (
          <PersonMenu key={one.name} name={one.name} work={one.work ?? ''}>
            <button type="button" data-face={one.name} onClick={(event) => (chime('page'), heroOpen(event, () => openSource('attribution', one.name)))}
              className="group flex min-w-0 flex-col items-center gap-2 rounded-xl p-3 text-center transition-colors duration-100 hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring">
              <Avatar name={one.name} size={128} className="transition-transform duration-200 ease-(--mf-ease) motion-safe:group-hover:scale-[1.03]" />
              <span {...hoverNote('person', one.name)} className="w-full truncate text-body font-semibold text-foreground">{one.name}</span>
              {/* A character says the work they are in; a person, how much is from them. */}
              <span className="-mt-1.5 w-full truncate text-control text-(--mf-muted-strong)">{one.work ? `in ${one.work}` : tally(one)}</span>
            </button>
          </PersonMenu>
        ))}
      </div>
      {people.length > FACES_SHOWN && (
        <Button variant="ghost" size="sm" className="mt-2" data-faces-more onClick={() => (chime(all ? 'fold' : 'slide'), setAll(!all))}>
          {all ? 'Show fewer' : `Show all ${num(people.length)}`}
        </Button>
      )}
    </section>
  )
}

/** Every person and source, each a page: the place to find them, and to make one before anything is from it. */
export function SourcesView({ onOpen }: { onOpen: (type: string, id: string) => void }): React.JSX.Element {
  const list = useLive(sources.list, [] as SourceSummary[])
  const missing = useLive(sources.missing, [] as Awaited<ReturnType<typeof sources.missing>>)
  // Who is you: a row's “This is me” reads again when it moves.
  const me = useMe()
  const make = async (field: SourceField): Promise<void> => {
    const name = (await ask(field === 'attribution' ? 'Name the person' : 'Name the source', field === 'attribution' ? 'e.g. Marcus Aurelius' : 'e.g. Meditations, or a podcast', { field, action: field === 'attribution' ? 'Add the person' : 'Add the source' }))?.trim()
    if (!name) return
    await sources.set(field, name)
    chime('page')
    openSource(field, name)
  }
  const give = async (item: { type: string; id: string; label: string }): Promise<void> => {
    // Not known: "Unattributed" is its source, and it is not asked about again.
    const said = await ask('Who said it? A quote is kept with its source.', 'e.g. Alan Kay', { field: 'attribution', skip: UNATTRIBUTED, instead: { label: 'Not a quote', run: () => void notAQuote(item) }, action: 'Keep the quote' })
    if (said === null) return
    const who = said.trim() || UNATTRIBUTED
    await setSource(item, 'attribution', who)
    chime('noted')
    toast(`Kept with ${who}`, () => void setSource(item, 'attribution', null))
  }
  const [view, setView] = useView('sources', { sort: 'recents', group: 'none' })
  // People as the grid of faces unless a list was chosen in Display (kept from then on).
  const asGrid = (view.density ?? 'grid') === 'grid'
  const ORDER: Record<string, (a: SourceSummary, b: SourceSummary) => number> = {
    recents: (a, b) => b.last.localeCompare(a.last),
    added: (a, b) => b.first.localeCompare(a.first),
    name: (a, b) => a.name.localeCompare(b.name),
    most: (a, b) => b.count - a.count || a.name.localeCompare(b.name)
  }
  const sorted = [...list].sort(ORDER[view.sort] ?? ORDER.recents)
  // "Unattributed" is a state, not a person: never a face among the people, but one quiet line, "Source unknown", with its count.
  const unknown = sorted.find((one) => one.field === 'attribution' && one.name === UNATTRIBUTED)
  // Characters (someone in a work) are kept apart from real People, in their own section.
  const summaries = (field: SourceField, characters = false): SourceSummary[] => sorted.filter((one) => one.field === field && !(field === 'attribution' && one.name === UNATTRIBUTED) && !!one.work === characters)
  // Found by its words as you type, the lists' own search field (note-list.tsx `ListSearch`), as the Bin is: a name, or the work its row names.
  const [typed, setTyped] = useState('')
  const words = typed.trim().toLowerCase()
  const entries = (field: SourceField, characters = false): Entry[] => summaries(field, characters).filter((one) => !words || one.name.toLowerCase().includes(words) || (one.work ?? '').toLowerCase().includes(words)).map((one) => ({
    id: `${field}:${one.name}`,
    type: 'source',
    title: one.name,
    tags: [],
    icon: FIELD_SAID[field].icon,
    // The same face the Feed gives them, so a person is recognisable on both.
    face: field === 'attribution' ? <Avatar name={one.name} size={36} /> : undefined,
    sub: one.work ? `in ${one.work} · ${tally(one)}` : tally(one),
    menu: [
      { label: 'Open the page', run: () => openSource(field, one.name) },
      { label: 'Rename…', run: () => askRename(field, one.name) },
      ...(field !== 'attribution' ? [] : one.work ? [{ label: 'Change the work…', run: () => void turnCharacter(one.name, 'character') }, { label: 'Make a real person', run: () => void turnCharacter(one.name, 'person') }] : [{ label: 'Make a character of a work…', run: () => void turnCharacter(one.name, 'character') }]),
      // You, among the people (avatar.tsx's markMe): the line reads as it would undo.
      ...(field !== 'attribution' || one.work ? [] : [{ label: me && isMe(one.name) ? 'This is not me' : 'This is me', run: () => void markMe(one.name) }]),
      ...(one.count ? [] : [{ label: 'Remove the page', run: () => void sources.dropAll([{ field, name: one.name }]).then((undo) => toast(`Removed ${one.name}’s page`, undo)) }])
    ]
  }))
  const people = entries('attribution')
  const characters = entries('attribution', true)
  const places = entries('medium')
  // ⌘A picks every page, Esc lets go, ⌫ removes the empty ones (a page with notes stays: its notes still name it).
  const [chosen, setChosen] = useState<string[]>([])
  const shown = [...people, ...characters, ...places].map((one) => one.id)
  const live = chosen.filter((id) => shown.includes(id))
  const summary = (id: string): SourceSummary | undefined => list.find((one) => `${one.field}:${one.name}` === id)
  const remove = (ids: string[]): void => {
    const empty = ids.map(summary).filter((one): one is SourceSummary => !!one && !one.count)
    if (!empty.length) return void (chime('nope'), toast(ids.length === 1 ? 'A page with notes stays while its notes name it' : 'Pages with notes stay while their notes name them', undefined, 'info'))
    void sources.dropAll(empty).then((undo) => {
      setChosen([])
      chime('off')
      toast(empty.length === 1 ? `Removed ${empty[0].name}’s page` : `Removed ${num(empty.length)} empty pages`, undo)
    })
  }
  useSelectAll(() => shown, live, setChosen, { onDelete: remove, deleteSaid: '⌫ removes the empty ones', titleOf: (id) => summary(id)?.name })
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || !count || typing() || menuOpen()) return
      event.preventDefault()
      event.stopPropagation()
      chime('off')
      setChosen([])
    }
    const count = live.length
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [live.length]) // eslint-disable-line react-hooks/exhaustive-deps
  // The quotes with no source: five, and the rest a press away, so a long list never pushes the page down.
  const [allMissing, setAllMissing] = useState(false)
  const picking = usePicking(shown, live, setChosen)
  const [looking, setLooking] = useState(false)
  return (
    // Waits for both its reads: drawn before, "No sources yet" showed for a beat, and the quotes with no source came in above the list.
    <Page title="Sources" search={!unloaded(list) && list.length > 0 && <ListSearch value={typed} onChange={setTyped} onDone={() => undefined} placeholder="Find a person or a source" />} waiting={unloaded(list) || unloaded(missing)} count={live.length || list.length} unit={live.length ? ['selected', 'selected'] : ['person or work', 'people and works']} actions={<>
      <Display view={view} onChange={setView} facets={[]} count={list.length} density={asGrid ? 'grid' : 'list'} onDensity={(density) => setView({ ...view, density })} densities={['list', 'grid']}
        sorts={[{ id: 'recents', label: 'Recents' }, { id: 'added', label: 'Recently added' }, { id: 'name', label: 'A to Z' }, { id: 'most', label: 'Most notes' }]} />
      <Button variant="outline" size="sm" className="h-7 cursor-pointer px-3" data-new-source="attribution" onClick={() => void make('attribution')}><Plus className="size-3.5" />New person</Button>
      <Button variant="outline" size="sm" className="h-7 cursor-pointer px-3" data-new-source="medium" onClick={() => void make('medium')}><Plus className="size-3.5" />New source</Button>
      <Button variant="outline" size="sm" className="h-7 cursor-pointer px-3" data-add-work aria-busy={looking || undefined} onClick={() => void addWork(setLooking)}><span className="-ml-1 grid size-5 place-items-center">{looking ? <Orb /> : <BookMarked className="size-3.5" />}</span>Add from DOI or ISBN</Button>
    </>}>
      <div className="page-column pb-16">
        {/* A quote with no source is the one thing here to put right: said first, in full size. */}
        {missing.length > 0 && (
          // One quiet island on the list's own edge: the heading on its line, a sentence, then each quote as a row whose
          // light wraps only its own words, its "Add who" beside them, never a band across the page.
          <section data-missing-source className="mf-island mx-3 mt-5 rounded-xl border bg-accent/25 px-3 py-3">
            <h3 className="flex items-center gap-2 text-heading font-semibold"><Quote className="size-4 shrink-0" style={{ color: VOICE_TINT.theirs }} />{missing.length === 1 ? 'A quote has no source' : `${num(missing.length)} quotes have no source`}</h3>
            <p className="mt-0.5 mb-2 text-control text-foreground/90 text-pretty">A quote is someone’s words: say whose, so it never drifts from them. Point at one for its choices.</p>
            <ul className="flex flex-col gap-1">
              {missing.slice(0, allMissing ? undefined : 5).map((item) => (
                // The three ways out show on the row pointed at (always, where nothing can point), in room kept for them, so nothing moves.
                // Narrow (a phone's width): the words keep the whole line, and the three ways come over its right end on an opaque band
                // when it is pointed at or tapped, each a full tap tall; rows never grow to two lines.
                <RowMenu key={item.id} items={[{ label: 'Open', run: () => onOpen(item.type, item.id) }, { label: 'Add who…', run: () => void give(item) }, { label: 'Source unknown', run: () => void sourceUnknown(item) }, { label: 'Not a quote', run: () => void notAQuote(item) }]}>
                <li data-missing-row={item.id} className="group/missing relative flex min-w-0 items-center gap-3 rounded-md hover:bg-accent/60 focus-within:bg-accent/60 max-sm:min-h-8">
                  <button type="button" title={item.label || undefined} className="min-w-0 flex-1 cursor-pointer truncate rounded-md px-1.5 py-0.5 text-left text-body" onClick={() => onOpen(item.type, item.id)}>{item.label || 'New note'}</button>
                  <span data-missing-ways className="flex shrink-0 items-center opacity-0 transition-opacity duration-150 group-hover/missing:opacity-100 group-focus-within/missing:opacity-100 [@media(hover:none)]:opacity-100 max-sm:absolute max-sm:inset-y-0 max-sm:right-0 max-sm:rounded-md max-sm:bg-accent max-sm:pl-2 max-sm:[&>button]:h-8">
                    <Button variant="ghost" size="sm" data-give-source={item.id} onClick={() => void give(item)}>Add who</Button>
                    <Button variant="ghost" size="sm" data-source-unknown={item.id} onClick={() => void sourceUnknown(item)}>Unknown</Button>
                    <Button variant="ghost" size="sm" data-not-quote={item.id} onClick={() => void notAQuote(item)}>Not a quote</Button>
                  </span>
                </li>
                </RowMenu>
              ))}
            </ul>
            {missing.length > 5 && (
              <Button variant="ghost" size="sm" className="-mx-2 mt-1" data-missing-more onClick={() => (chime(allMissing ? 'fold' : 'slide'), setAllMissing(!allMissing))}>
                {allMissing ? 'Show fewer' : `Show all ${num(missing.length)}`}
              </Button>
            )}
          </section>
        )}
        {unknown && (
          <button type="button" data-source-unknown-line onClick={() => (chime('page'), openSource('attribution', UNATTRIBUTED))}
            className="mx-5 mt-4 flex cursor-pointer items-center gap-2 rounded-md px-0 text-control text-(--mf-muted-strong) hover:text-foreground">
            <Quote className="size-3.5 shrink-0" style={{ color: VOICE_TINT.theirs }} />
            <span>Source unknown</span><Count n={unknown.count} className="text-control text-muted-foreground" />
          </button>
        )}
        {!list.length ? (
          unloaded(list) ? null : (
            // Nothing from anyone yet: the page as it will look, with a few made-up people and sources.
            <Example tryIt="give a note a who or a where (the person who said it, the book or show). It gets a page here, with everything from them.">
              <NoteList groups={[['People', EXAMPLE_PEOPLE.map((one) => exampleEntry('attribution', ...one))], ['Sources', EXAMPLE_PLACES.map((one) => exampleEntry('medium', ...one))]]}
                density="list" table="nuggets" cursor={-1} onPick={() => undefined} twoUp className="mx-3 my-2" />
            </Example>
          )
        ) : asGrid ? (
          <>
            {people.length > 0 && <FaceGrid people={summaries('attribution')} />}
            {characters.length > 0 && <FaceGrid title="Characters" people={summaries('attribution', true)} />}
            {places.length > 0 && <NoteList groups={[['Sources', places]]} density="list" table="nuggets" cursor={-1} chosen={live} picking={picking} twoUp onPick={(id) => (chime('page'), openSource('medium', id.slice(id.indexOf(':') + 1)))} className="mx-3 my-2" />}
          </>
        ) : (
          <NoteList groups={[...(people.length ? [['People', people] as [string, Entry[]]] : []), ...(characters.length ? [['Characters', characters] as [string, Entry[]]] : []), ...(places.length ? [['Sources', places] as [string, Entry[]]] : [])]}
            density="list" table="nuggets" cursor={-1} chosen={live} picking={picking} twoUp onPick={(id) => { const at = id.indexOf(':'); chime('page'); openSource(id.slice(0, at) as SourceField, id.slice(at + 1)) }} className="mx-3 my-2" />
        )}
      </div>
    </Page>
  )
}
