import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { hoverNote } from './note-preview'
import { BookOpen, FileText, Quote, User } from 'lucide-react'
import { Camera, Fit } from '@/components/ui/icons'
import { openLook } from '@/components/image/image-look'

import { Button } from '@/components/ui/button'
import { CAPTURE_TYPES } from '@/components/capture-kinds/capture-kind-picker'
import { chime } from '@/lib/sound'
import { unloaded, useLive, haligtree } from '@/lib/haligtree'
import { VOICE_SAID, VOICE_TINT, askRename, openSource, pageRef, readFocus, sources, type SourceField, type SourceItem, type SourceSummary, type Voice } from '@/lib/sources'
import { Avatar } from './avatar'
import { NoteList, type Entry } from './note-list'
import { Example } from './example'
import { Display, useView } from './display'
import { Count, Empty, Page, Tip, ask, askSure, toast, typing } from './ui'
import { personKey } from '../../../../main/names'
import { useSelectAll } from '@/lib/select-all'
import { usePicking } from '@/lib/pick-range'
import { ago, num, plural } from '../../../../main/dates'

/** What a person's notes are, each counted once: "1 quote", "2 quotes · 1 other note". The quotes are among the notes, so "1 note · 1 quote" read as two. */
const tally = (one: { count: number; quotes: number }): string => {
  if (!one.count) return 'No notes yet'
  const rest = one.count - one.quotes
  return [one.quotes ? plural(one.quotes, 'quote') : '', rest ? plural(rest, one.quotes ? 'other note' : 'note') : ''].filter(Boolean).join(' · ')
}
import { setAvatar, pickAvatar, useAvatar } from '@/lib/people'
import { PersonMenu } from './avatar'
import type { SourceFacts, SourcePage } from '@/lib/sources'

const kindOf = (id: string): (typeof CAPTURE_TYPES)[number] => CAPTURE_TYPES.find((type) => type.id === id) ?? CAPTURE_TYPES[0]
const FIELD_SAID: Record<SourceField, { one: string; icon: typeof User }> = { attribution: { one: 'Person', icon: User }, medium: { one: 'Source', icon: BookOpen } }

/** Give a note a who, wherever it lives: a capture's field, or a gem's. */
const setSource = (item: { type: string; id: string }, field: SourceField, name: string | null): Promise<unknown> =>
  item.type === 'capture' ? haligtree.setCapture(item.id, field, name) : haligtree.saveItem(item.id, { [field]: name })

/** Under a note's who and where: a way to each one's page. */
function SourceLinks({ who, where }: { who?: string | null; where?: string | null }): React.JSX.Element | null {
  const links = [who?.trim() && { field: 'attribution' as const, name: who.trim() }, where?.trim() && { field: 'medium' as const, name: where.trim() }].filter(Boolean) as { field: SourceField; name: string }[]
  if (!links.length) return null
  return (
    <div className="flex flex-wrap gap-1 px-1 py-1">
      {links.map(({ field, name }) => {
        const Icon = FIELD_SAID[field].icon
        return (
          <button key={field} type="button" data-open-source={field} onClick={() => (chime('page'), openSource(field, name))}
            className="flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-control text-foreground transition-colors hover:bg-accent">
            {field === 'attribution' ? <Avatar name={name} size={14} /> : <Icon className="size-3.5 shrink-0" />}
            <span className="truncate">Open {name}’s page</span>
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
export function SourceFoot({ who, where, quote = false, gem = false }: { who?: string | null; where?: string | null; quote?: boolean; gem?: boolean }): React.JSX.Element | null {
  const sourced = !!(who?.trim() || where?.trim())
  if (sourced) return <div data-chrome className="page-narrow mx-auto w-full px-[4rem]"><SourceLinks who={who} where={where} /></div>
  if (!quote && !gem) return null
  return (
    <p data-chrome data-no-source className="page-narrow mx-auto mt-2 w-full px-[4.5rem] text-body text-foreground">
      {quote ? 'No source yet. Say who said it in the details, so this quote stays with them.' : 'No source yet, so this counts as a note of yours. Say who or where it is from in the details to keep it as their idea.'}
    </p>
  )
}

/**
 * Rename a person or a source everywhere (their notes, page, photo and
 * @mentions), asking first when the new name is someone else's, then one
 * notice with Undo. Leaves their page open under the name it now has.
 */
export async function renameSource(field: SourceField, from: string, to: string): Promise<boolean> {
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
  toast(done.count ? `Renamed in ${num(done.count)} ${done.count === 1 ? 'note' : 'notes'}` : `Renamed to ${done.name ?? name}`, () => void sources.unrename(token).then(() => openSource(field, from)))
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
      onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
      onBlur={(event) => event.target.value.trim() !== value && onSave(event.target.value.trim())}
      className="min-w-[2ch] rounded-md bg-transparent px-1 py-0.5 text-body text-foreground outline-none [field-sizing:content] placeholder:text-foreground/55 hover:bg-accent focus:bg-accent" />
  )
}

/**
 * A person's page head, like an artist's page: their photo (or their shape),
 * their name, one plain line of what they did and when they lived, and what
 * you wrote about them as the bio, three lines until “Read more”. Every part
 * is changed where it is: click or drop on the photo, type in the line or the bio.
 */
function PersonHead({ page, name, thoughts, setThoughts, onOpenPerson }: { page: SourcePage | null; name: string; thoughts: string; setThoughts: (text: string) => void; onOpenPerson: (name: string) => void }): React.JSX.Element {
  const photo = useAvatar(name)
  const [open, setOpen] = useState(false)
  const [long, setLong] = useState(false)
  const [over, setOver] = useState(false)
  const near = useLive(() => sources.near(name), [] as Awaited<ReturnType<typeof sources.near>>, [name, page?.items.length])
  const facts = (patch: Partial<SourceFacts>): void => void sources.facts('attribution', name, patch).then(() => chime('noted'))
  const items = page?.items ?? []
  const theirs = items.filter((one) => one.voice === 'theirs').length
  const cite = items.length - theirs
  const last = items.reduce<string | null>((latest, one) => (!latest || one.at > latest ? one.at : latest), null)
  const counts = [theirs && `${plural(theirs, 'of their words', 'of their words')}`, cite && `${plural(cite, 'note cites them', 'notes cite them')}`, last && `last added ${ago(last)}`].filter(Boolean)
  const bioBox = useRef<HTMLTextAreaElement>(null)
  // Cut only when it runs past three lines; measured while cut, so opening it keeps “Show less”.
  useLayoutEffect(() => {
    const box = bioBox.current
    if (!box || open) return
    // Its whole height, for a moment, against the three lines it is cut to (a sized-to-fit field reports no overflow).
    const cut = box.clientHeight
    box.style.maxHeight = 'none'
    const whole = box.clientHeight
    box.style.maxHeight = ''
    setLong(whole > cut + 2)
  }, [thoughts, open])
  return (
    <header data-person-head className="px-5 pt-8">
      <div className="flex items-start gap-5">
        <PersonMenu name={name}>
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
                  className="absolute right-0 bottom-0 flex size-7 scale-90 items-center justify-center rounded-full border bg-popover text-muted-foreground opacity-0 shadow-sm transition-[opacity,scale,color,background-color] duration-200 ease-[var(--mf-ease)] hover:bg-accent hover:text-foreground focus-visible:scale-100 focus-visible:opacity-100 active:scale-95 motion-reduce:transition-[opacity] group-hover/photo:scale-100 group-hover/photo:opacity-100">
                  <Camera className="size-3.5" />
                </button>
              </Tip>
            )}
          </div>
        </PersonMenu>
        <div className="min-w-0 flex-1 pt-1">
          <p className="text-control text-muted-foreground">Person</p>
          <SourceName field="attribution" name={name} />
          <p data-person-line className="-ml-1 mt-0.5 flex flex-wrap items-baseline text-body text-foreground">
            <Fact label="What they did" placeholder="What they did" value={page?.what ?? ''} onSave={(what) => facts({ what })} />
            <span aria-hidden className="px-0.5">·</span>
            <Fact label="Born" placeholder="Born" value={page?.born ?? ''} onSave={(born) => facts({ born })} />
            {/* Someone still living reads "1964 to now": "now" is only a hint, typed over once they have died. */}
            {(page?.born || page?.died) && <>
              <span className="px-0.5">to</span>
              <Fact label="Died" placeholder="now" value={page?.died ?? ''} onSave={(died) => facts({ died })} />
            </>}
          </p>
        </div>
      </div>
      <div className="relative mt-4">
        <textarea data-thoughts value={thoughts} rows={1} placeholder={`What you make of ${name}, in your own words`} ref={bioBox}
          onChange={(event) => setThoughts(event.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => thoughts !== (page?.thoughts ?? '') && void sources.set('attribution', name, thoughts).then(() => chime('noted'))}
          style={{ maskImage: !open && long ? 'linear-gradient(to bottom, black 45%, transparent calc(100% - 0.5rem))' : undefined }}
          className={`block w-full resize-none overflow-hidden rounded-md bg-transparent px-2 py-2 -mx-2 ${open ? '' : 'max-h-[calc(3lh+1rem)]'} text-body leading-relaxed outline-none [field-sizing:content] placeholder:text-foreground/60 hover:bg-accent/50 focus:bg-accent/50`} />
        {(long || open) && thoughts.trim() && (
          <button type="button" data-read-more onClick={() => (chime(open ? 'fold' : 'open'), setOpen(!open))} className="-ml-1 mt-0.5 rounded-md px-1 py-0.5 text-body font-medium text-foreground hover:bg-accent">
            {open ? 'Show less' : 'Read more'}
          </button>
        )}
      </div>
      {counts.length > 0 && <p data-person-counts className="mt-3 text-body text-foreground">{counts.join(' · ')}</p>}
      {near.length > 0 && (
        <section data-also-in className="mt-5">
          <h3 className="mb-2 text-heading font-semibold">Also in your book</h3>
          <div className="flex flex-wrap gap-4">
            {near.map((one) => (
              <button key={one.name} type="button" data-also-person={one.name} onClick={() => (chime('page'), onOpenPerson(one.name))}
                className="group flex w-20 flex-col items-center gap-1.5 rounded-lg p-1 text-center focus-visible:ring-2 focus-visible:ring-ring">
                <Avatar name={one.name} size={56} className="transition-transform duration-150 group-hover:scale-105" />
                <span {...hoverNote('person', one.name)} className="line-clamp-2 text-control text-foreground">{one.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </header>
  )
}

/** A note on a source page: its words, coloured by whose words they are, and its page reference. */
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
    wrap: true,
    sub: [ref && (ref.direct ? `p${ref.page}, word for word` : `(p${ref.page}), in my words`), item.status, item.rating ? '★'.repeat(item.rating) : null].filter(Boolean).join(' · ') || undefined
  }
}

/**
 * One person's or one source's page: everything with that who or where,
 * the source's own words apart from yours. Quotes first, grouped; then what
 * you understood they said; then your own thoughts, kept in their own section.
 */
export function SourcePageView({ focus, onOpen }: { focus?: string; onOpen: (type: string, id: string) => void }): React.JSX.Element {
  const which = readFocus(focus)
  const page = useLive(() => (which ? sources.page(which.field, which.name) : Promise.resolve(null)), null, [focus])
  const [thoughts, setThoughts] = useState('')
  useEffect(() => setThoughts(page?.thoughts ?? ''), [page?.name, page?.thoughts])
  const voices = useMemo(() => {
    const by: Record<Voice, SourceItem[]> = { theirs: [], understood: [], mine: [] }
    for (const item of page?.items ?? []) by[item.voice].push(item)
    return by
  }, [page])
  if (!which) return <Page title="Source"><div className="page-column"><Empty title="No such page">Pick a person or a source from the Sources page.</Empty></div></Page>
  const name = page?.name ?? which.name
  const Icon = FIELD_SAID[which.field].icon
  const open = (item: SourceItem): void => (chime('open'), onOpen(item.type, item.id))
  const section = (voice: Voice, empty: string): React.JSX.Element => (
    <section data-voice-section={voice} className="mt-6">
      <h3 className="mb-1 flex items-center gap-2 px-5 text-heading font-semibold">
        <span aria-hidden className="h-4 w-1 rounded-full" style={{ background: VOICE_TINT[voice] }} />
        {voice === 'theirs' ? 'Their words' : voice === 'understood' ? 'What I understood' : VOICE_SAID.mine}
        {voices[voice].length > 0 && <Count n={voices[voice].length} className="text-control font-normal text-muted-foreground" />}
      </h3>
      {voices[voice].length ? (
        <NoteList groups={[['', voices[voice].map((item) => ({ ...entryOf(item), menu: [{ label: 'Open', run: () => open(item) }, { label: `Take off “${name}”`, run: () => void setSource(item, which.field, null).then(() => toast(`No longer from ${name}`, () => void setSource(item, which.field, name))) }] }))]]}
          density="list" table="nuggets" cursor={-1} onPick={(id) => open(voices[voice].find((one) => one.id === id)!)} className="mx-3" />
      ) : <p className="px-5 py-1 text-control text-muted-foreground">{empty}</p>}
    </section>
  )
  return (
    <Page title={name} count={page?.items.length ?? 0} unit={['note', 'notes']}>
      <div className="page-column pb-16" data-source-page={which.field}>
        {which.field === 'attribution' ? <PersonHead page={page} name={name} thoughts={thoughts} setThoughts={setThoughts} onOpenPerson={(other) => openSource('attribution', other)} /> : (
        <div className="flex items-center gap-3 px-5 pt-8">
          <Icon className="size-8 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-control text-muted-foreground">{FIELD_SAID[which.field].one}</p>
            <SourceName field={which.field} name={name} />
          </div>
        </div>
        )}
        {section('theirs', 'No quotes from here yet. A quote with this as its who or where shows up here.')}
        {section('understood', 'Nothing yet. A gem from here, or words ending in a page in brackets like (p131), shows up here.')}
        {/* Your own words about the source, apart from theirs: the gloss. */}
        {which.field === 'medium' && <section data-my-thoughts className="mt-6 px-5">
          <h3 className="mb-1 flex items-center gap-2 text-heading font-semibold">
            <span aria-hidden className="h-4 w-1 rounded-full" style={{ background: VOICE_TINT.mine }} />
            My thoughts
          </h3>
          <textarea data-thoughts value={thoughts} rows={3} placeholder={`What you make of ${name}, in your own words`}
            onChange={(event) => setThoughts(event.target.value)}
            onBlur={() => thoughts !== (page?.thoughts ?? '') && void sources.set(which.field, name, thoughts).then(() => chime('noted'))}
            className="block w-full resize-none rounded-md bg-accent/50 px-3 py-2 text-body outline-none [field-sizing:content] placeholder:text-foreground/60 focus:bg-accent" />
        </section>}
        {voices.mine.length > 0 && section('mine', '')}
      </div>
    </Page>
  )
}

/** Made-up people and sources for the empty page's example: a name, how many notes, how many quotes. */
const EXAMPLE_PEOPLE: [string, number, number][] = [['Jane Austen', 4, 3], ['Marcus Aurelius', 2, 2]]
const EXAMPLE_PLACES: [string, number, number][] = [['Frankenstein', 3, 1], ['The Matrix (1999)', 2, 0]]
const exampleEntry = (field: SourceField, name: string, count: number, quotes: number): Entry => ({
  id: `example:${field}:${name}`, type: 'source', title: name, tags: [], icon: FIELD_SAID[field].icon,
  sub: `${count} notes${quotes ? ` · ${quotes} ${quotes === 1 ? 'quote' : 'quotes'}` : ''}`
})

/** People as big round faces, like an artists' shelf: their photo or shape, the name, and how much is from them. */
function FaceGrid({ people }: { people: SourceSummary[] }): React.JSX.Element {
  return (
    <section data-people-grid className="mx-3 my-2">
      <h3 className="mb-2 flex items-center gap-2 px-2 text-heading font-semibold">People <Count n={people.length} className="text-control font-normal text-muted-foreground" /></h3>
      <div className="grid gap-x-2 gap-y-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(10rem, 1fr))' }}>
        {people.map((one) => (
          <PersonMenu key={one.name} name={one.name}>
            <button type="button" data-face={one.name} onClick={() => (chime('page'), openSource('attribution', one.name))}
              className="group flex min-w-0 flex-col items-center gap-2 rounded-xl p-3 text-center transition-colors duration-100 hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring">
              <Avatar name={one.name} size={128} className="transition-transform duration-200 group-hover:scale-[1.03]" />
              <span {...hoverNote('person', one.name)} className="w-full truncate text-body font-semibold text-foreground">{one.name}</span>
              <span className="-mt-1.5 w-full truncate text-control text-foreground/80">{tally(one)}</span>
            </button>
          </PersonMenu>
        ))}
      </div>
    </section>
  )
}

/** Every person and source, each a page: the place to find them, and to make one before anything is from it. */
export function SourcesView({ onOpen }: { onOpen: (type: string, id: string) => void }): React.JSX.Element {
  const list = useLive(sources.list, [] as SourceSummary[])
  const missing = useLive(sources.missing, [] as Awaited<ReturnType<typeof sources.missing>>)
  const make = async (field: SourceField): Promise<void> => {
    const name = (await ask(field === 'attribution' ? 'Name the person' : 'Name the source', field === 'attribution' ? 'e.g. Marcus Aurelius' : 'e.g. Meditations, or a podcast', field))?.trim()
    if (!name) return
    await sources.set(field, name)
    chime('page')
    openSource(field, name)
  }
  const give = async (item: { type: string; id: string; label: string }): Promise<void> => {
    const who = (await ask('Who said it? A quote is kept with its source.', 'e.g. Alan Kay', 'attribution'))?.trim()
    if (!who) return
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
  const entries = (field: SourceField): Entry[] => sorted.filter((one) => one.field === field).map((one) => ({
    id: `${field}:${one.name}`,
    type: 'source',
    title: one.name,
    tags: [],
    icon: FIELD_SAID[field].icon,
    // The same face the Feed gives them, so a person is recognisable on both.
    face: field === 'attribution' ? <Avatar name={one.name} size={36} /> : undefined,
    sub: tally(one),
    menu: [
      { label: 'Open the page', run: () => openSource(field, one.name) },
      { label: 'Rename…', run: () => askRename(field, one.name) },
      ...(one.count ? [] : [{ label: 'Remove the page', run: () => void sources.dropAll([{ field, name: one.name }]).then((undo) => toast(`Removed ${one.name}’s page`, undo)) }])
    ]
  }))
  const people = entries('attribution')
  const places = entries('medium')
  // ⌘A picks every page, Esc lets go, ⌫ removes the empty ones (a page with notes stays: its notes still name it).
  const [chosen, setChosen] = useState<string[]>([])
  const shown = [...people, ...places].map((one) => one.id)
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
      if (event.key !== 'Escape' || !count || typing() || document.querySelector('[role="menu"]')) return
      event.preventDefault()
      event.stopPropagation()
      chime('off')
      setChosen([])
    }
    const count = live.length
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [live.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const picking = usePicking(shown, live, setChosen)
  return (
    // Waits for both its reads: drawn before, "No sources yet" showed for a beat, and the quotes with no source came in above the list.
    <Page title="Sources" waiting={unloaded(list) || unloaded(missing)} count={live.length || list.length} unit={live.length ? ['selected', 'selected'] : ['page', 'pages']} actions={<>
      <Display view={view} onChange={setView} facets={[]} count={list.length} density={asGrid ? 'grid' : 'list'} onDensity={(density) => setView({ ...view, density })} densities={['list', 'grid']}
        sorts={[{ id: 'recents', label: 'Recents' }, { id: 'added', label: 'Recently added' }, { id: 'name', label: 'A to Z' }, { id: 'most', label: 'Most notes' }]} />
      <Button variant="ghost" size="sm" data-new-source="attribution" onClick={() => void make('attribution')}>New person</Button>
      <Button variant="ghost" size="sm" data-new-source="medium" onClick={() => void make('medium')}>New source</Button>
    </>}>
      <div className="page-column pb-16">
        {/* A quote with no source is the one thing here to put right: said first, in full size. */}
        {missing.length > 0 && (
          <section data-missing-source className="mx-5 mt-5 rounded-lg border px-3 py-2">
            <h3 className="flex items-center gap-2 font-semibold"><Quote className="size-4" style={{ color: VOICE_TINT.theirs }} />{missing.length === 1 ? 'A quote has no source' : `${num(missing.length)} quotes have no source`}</h3>
            <p className="mb-1 text-control">A quote is someone’s words: say whose, so it never drifts away from them.</p>
            <ul>
              {missing.slice(0, 8).map((item) => (
                <li key={item.id} className="flex items-center gap-2 py-0.5">
                  <button type="button" className="min-w-0 flex-1 truncate rounded px-1 text-left hover:bg-accent" onClick={() => onOpen(item.type, item.id)}>{item.label || 'Untitled'}</button>
                  <Tip label="Say who said it"><Button variant="outline" size="sm" data-give-source={item.id} onClick={() => void give(item)}>Add who</Button></Tip>
                </li>
              ))}
            </ul>
          </section>
        )}
        {!list.length ? (
          unloaded(list) ? null : (
            // Nothing from anyone yet: the page as it will look, with a few made-up people and sources.
            <Example tryIt="give a note a who or a where (the person who said it, the book or show). It gets a page here, with everything from them.">
              <NoteList groups={[['People', EXAMPLE_PEOPLE.map((one) => exampleEntry('attribution', ...one))], ['Sources', EXAMPLE_PLACES.map((one) => exampleEntry('medium', ...one))]]}
                density="list" table="nuggets" cursor={-1} onPick={() => undefined} className="mx-3 my-2" />
            </Example>
          )
        ) : asGrid ? (
          <>
            {people.length > 0 && <FaceGrid people={sorted.filter((one) => one.field === 'attribution')} />}
            {places.length > 0 && <NoteList groups={[['Sources', places]]} density="list" table="nuggets" cursor={-1} chosen={live} picking={picking} onPick={(id) => (chime('page'), openSource('medium', id.slice(id.indexOf(':') + 1)))} className="mx-3 my-2" />}
          </>
        ) : (
          <NoteList groups={[...(people.length ? [['People', people] as [string, Entry[]]] : []), ...(places.length ? [['Sources', places] as [string, Entry[]]] : [])]}
            density="list" table="nuggets" cursor={-1} chosen={live} picking={picking} onPick={(id) => { const at = id.indexOf(':'); chime('page'); openSource(id.slice(0, at) as SourceField, id.slice(at + 1)) }} className="mx-3 my-2" />
        )}
      </div>
    </Page>
  )
}
