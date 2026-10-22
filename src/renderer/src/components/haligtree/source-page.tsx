import { useEffect, useMemo, useState } from 'react'
import { BookOpen, FileText, Quote, User } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { CAPTURE_TYPES } from '@/components/capture-kinds/capture-kind-picker'
import { chime } from '@/lib/sound'
import { unloaded, useLive, haligtree } from '@/lib/haligtree'
import { VOICE_SAID, VOICE_TINT, openSource, pageRef, readFocus, sources, type SourceField, type SourceItem, type SourceSummary, type Voice } from '@/lib/sources'
import { Avatar } from './avatar'
import { NoteList, type Entry } from './note-list'
import { Count, Empty, Page, Tip, ask, toast, typing } from './ui'
import { useSelectAll } from '@/lib/select-all'
import { usePicking } from '@/lib/pick-range'
import { num } from '../../../../main/dates'

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
        <div className="flex items-center gap-3 px-5 pt-8">
          {which.field === 'attribution' ? <Avatar name={name} size={36} /> : <Icon className="size-8 text-muted-foreground" />}
          <div className="min-w-0">
            <p className="text-control text-muted-foreground">{FIELD_SAID[which.field].one}</p>
            <h2 data-source-name className="truncate text-title font-semibold">{name}</h2>
          </div>
        </div>
        {section('theirs', 'No quotes from here yet. A quote with this as its who or where shows up here.')}
        {section('understood', 'Nothing yet. A gem from here, or words ending in a page in brackets like (p131), shows up here.')}
        {/* Your own words about the source, apart from theirs: the gloss. */}
        <section data-my-thoughts className="mt-6 px-5">
          <h3 className="mb-1 flex items-center gap-2 text-heading font-semibold">
            <span aria-hidden className="h-4 w-1 rounded-full" style={{ background: VOICE_TINT.mine }} />
            My thoughts
          </h3>
          <textarea data-thoughts value={thoughts} rows={3} placeholder={`What you make of ${name}, in your own words`}
            onChange={(event) => setThoughts(event.target.value)}
            onBlur={() => thoughts !== (page?.thoughts ?? '') && void sources.set(which.field, name, thoughts).then(() => chime('noted'))}
            className="block w-full resize-none rounded-md bg-accent/50 px-3 py-2 text-body outline-none [field-sizing:content] placeholder:text-foreground/60 focus:bg-accent" />
        </section>
        {voices.mine.length > 0 && section('mine', '')}
      </div>
    </Page>
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
  const entries = (field: SourceField): Entry[] => list.filter((one) => one.field === field).map((one) => ({
    id: `${field}:${one.name}`,
    type: 'source',
    title: one.name,
    tags: [],
    icon: FIELD_SAID[field].icon,
    sub: one.count ? `${one.count} ${one.count === 1 ? 'note' : 'notes'}${one.quotes ? ` · ${one.quotes} ${one.quotes === 1 ? 'quote' : 'quotes'}` : ''}` : 'No notes yet',
    menu: [
      { label: 'Open the page', run: () => openSource(field, one.name) },
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
          <Empty title="No sources yet">Give a note a who or a where (the person who said it, the book or show) and it gets a page here. Or make one now with “New person”.</Empty>
        ) : (
          <NoteList groups={[...(people.length ? [['People', people] as [string, Entry[]]] : []), ...(places.length ? [['Sources', places] as [string, Entry[]]] : [])]}
            density="list" table="nuggets" cursor={-1} chosen={live} picking={picking} onPick={(id) => { const at = id.indexOf(':'); chime('page'); openSource(id.slice(0, at) as SourceField, id.slice(at + 1)) }} className="mx-3 my-2" />
        )}
      </div>
    </Page>
  )
}
