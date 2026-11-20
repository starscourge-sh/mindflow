import { chime, step } from '@/lib/sound'
import { sideTagLine, toggleSideTag } from '@/lib/side-tags'
import { SCRUB, ScrubField } from '../pdf/scrub-field'
import { TagColourPick } from './tag-colour-pick'
import { ReadsIn } from '@/lib/reads-in'
import { useLayoutEffect, useMemo, useState } from 'react'
import { Count, toast, VirtualList, quietly } from './ui'
import { RowMenu, copy } from './row-menu'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'

const COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'] as const
/** Where a tag's tasks land: no date (the default), or that many days from today. */
const LANDS = [
  { id: 'none', label: 'No date', said: 'with no date' },
  { id: '0', label: 'Today', said: 'in Today' },
  { id: '1', label: 'Tomorrow', said: 'tomorrow' },
  { id: '7', label: 'In a week', said: 'a week from the day' }
] as const

import { unloaded, useLive, haligtree, type Pin, type Task } from '@/lib/haligtree'
import { taskName } from '@/lib/tasks'
import { useHere } from '@/lib/split'
import { PICKED_MARK, usePickMixed } from './pick-mixed'
import { sideMenu, useFullMenu } from './side-menu'
import { useTaskNow } from './tasks-view'
import { DOT_IN_MARGIN, SessionDot, SpentTip, useTaskTime } from './task-time'
import { useOpened, useStepped } from '@/lib/nav'
import { typeSaid } from '@/lib/capture-links'
import { Empty, Kbd, Page, Tags, useListKeys } from './ui'
import { recordMeeting } from '@/lib/meeting'
import { Tip } from '@/components/haligtree/ui'
import { DatePicker } from './date-picker'
import { INPUT_FRAME, TagEntry } from './hash-field'
import { Readiness } from './review-view'
import { openApart } from '@/lib/apart'
import { TagStream, prefetchTag, renameTag, useLiveFor } from './tag-read'
import { tagTint } from './tag-icon'
import { BookOpen, EyeOff, Star, SquareCheck } from 'lucide-react'
import { ago, dayMonth, num } from '../../../../main/dates'
import { TAG_DOES } from '../capture-kinds/kind-fields'
import { Blurt } from './study'
import { PractiseTag } from './learn-mode'
import { LANGUAGES, preview } from '@/lib/read-aloud'
import { Chips } from './display'
import { exampleTags } from '@/lib/examples'
import { ListSearch } from './note-list'
import { tagFound } from '../../../../main/tag-words'
import { Example } from './example'
import { ArrowLeft, FileText, Gem, Inbox, ListTodo } from '@/components/ui/icons'
import { quoted } from '../../../../main/clip'

const ICON = { capture: Inbox, nugget: Gem, article: FileText, task: ListTodo }

/** The orders Tags offers: what someone comes to the page to see. */
const ORDERS = [
  { id: 'count', label: 'Most used', tip: 'The tags you write most, first' },
  { id: 'recent', label: 'Lately', tip: 'The tags you wrote into most recently, first' },
  { id: 'name', label: 'A to Z' }
] as const
type Order = (typeof ORDERS)[number]['id']
/** How wide the list must be to take two tags side by side, each keeping its name, its mark and its counts. */
const TWO_UP = 560

/** What a tag does, if anything: an icon and a word for its row, and a line for its tooltip. */
const does = (tag: string, action: boolean): { icon: typeof EyeOff; short: string; long: string } | null =>
  TAG_DOES[tag] ? { icon: tag === 'bit' ? EyeOff : BookOpen, short: tag === 'bit' ? 'Private' : 'Book', long: TAG_DOES[tag] }
    : action ? { icon: SquareCheck, short: 'Makes a task', long: 'Makes a task: anything tagged with it goes to your tasks' } : null

/** What a tag does, as a small mark in the tag's own colour beside its name, its words in the tip. */
function DoesChip({ tag, color, action }: { tag: string; color?: string | null; action: boolean }): React.JSX.Element | null {
  const what = does(tag, action)
  if (!what) return null
  const tint = tagTint(tag, color)
  const Icon = what.icon
  return (
    <Tip label={what.long}>
      <span data-does={what.short} role="img" aria-label={what.long} className="grid size-5 shrink-0 place-items-center rounded-full"
        style={{ color: tint, background: `color-mix(in oklab, ${tint} 13%, transparent)` }}>
        <Icon className="size-3" strokeWidth={2.2} />
      </span>
    </Tip>
  )
}

/**
 * Every `#tag` in use, with how often: the retrospective index the plan asks
 * for, kept from the words themselves so it can never disagree with them. How
 * often a tag comes up is shown, never acted on: no threshold, no nagging.
 */
export function TagsView({ onOpen, focus }: { onOpen: (type: string, id: string) => void; focus?: string }): React.JSX.Element {
  const real = useLive(haligtree.tags, [] as Awaited<ReturnType<typeof haligtree.tags>>)
  const sideSaved = useLive(haligtree.settings, null)?.sideTags
  // No tags yet: a few made-up ones show what the list holds, dimmed and out of reach.
  const example = !unloaded(real) && !real.length
  const examples = useMemo(exampleTags, [])
  const tags = example ? examples : real
  const [chosen, setChosen] = useState<string | null>(focus ?? null)
  // A tag opens to be read; looking after it (colour, alias, exam date) is the other tab.
  const [tab, setTab] = useState<'read' | 'manage'>('read')
  // A blurt on the open tag: a blank page in place of its notes, until done.
  const [blurting, setBlurting] = useState<string | null>(null)
  // Its cards gone through without counting, in place of its notes.
  const [practising, setPractising] = useState<string | null>(null)
  // A tag picked is a step Back returns from, and so is Read or Manage: ⌘[ from Manage comes back to Read.
  useOpened(chosen ?? undefined, focus, setChosen, () => setChosen(null))
  useStepped(tab, setTab)
  // The open tag's notes, for Manage; never the tag before's while the next is read.
  const loaded = useLiveFor(chosen ?? '', () => (chosen ? haligtree.tag(chosen) : Promise.resolve([]))).value
  const items = loaded ?? []
  // Manage's rows answer as every list does: the row's own menu, ⇧-click, x, ⌘A, ⌫ to the Bin, Esc.
  const allTasks = useLive(haligtree.tasks, [] as Task[])
  const pins = useLive(haligtree.pins, [] as Pin[])
  const fullMenu = useFullMenu()
  const taskNow = useTaskNow()
  // The time on the tasks a tag holds and the session running on one (task-time.tsx).
  const taskTime = useTaskTime()
  const managing = !!chosen && tab !== 'read'
  const several = usePickMixed(managing ? items.map((item) => ({ type: item.type, id: item.id, title: item.title, private: item.private, status: item.type === 'task' ? allTasks.find((task) => task.id === item.id)?.status : undefined })) : [], { here: useHere(), keys: managing })
  // A long list can be narrowed by typing: inside words and across hyphens.
  const [query, setQuery] = useState('')
  // In the order you come for: the biggest, the ones written into lately, or by name. Kept for next time.
  const [order, setOrder] = useState<Order>(() => (ORDERS.some((one) => one.id === localStorage.getItem('tags:order')) ? localStorage.getItem('tags:order') as Order : 'count'))
  const found = query ? tags.filter((one) => tagFound(one.tag, query)) : tags
  const topics = order === 'count' ? found : [...found].sort(order === 'name' ? (a, b) => a.tag.localeCompare(b.tag) : (a, b) => (b.last ?? '').localeCompare(a.last ?? '') || b.count - a.count)
  // Two side by side where the page is wide enough, as Sources lays its short rows; one under another beside an open tag or on a phone.
  const [wide, setWide] = useState(0)
  const [box, setBox] = useState<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    if (!box) return
    const fit = (): void => setWide(box.clientWidth)
    fit()
    const watch = new ResizeObserver(fit)
    watch.observe(box)
    return () => watch.disconnect()
  }, [box])
  const across = !chosen && wide >= TWO_UP ? 2 : 1
  const lines = useMemo(() => Array.from({ length: Math.ceil(topics.length / across) }, (_, at) => topics.slice(at * across, at * across + across)), [topics, across])
  // A tag open to read has the keys for its own notes (↑ ↓ ↵, tag-read.tsx); the list of tags is clicked meanwhile.
  const [cursor, setCursor] = useListKeys(example ? 0 : topics.length, { onOpen: (index) => setChosen(topics[index].tag), across, enabled: !(chosen && tab === 'read') })
  const speaking = useLive(haligtree.tagSpeak, {} as Record<string, string>, [], ['item'])
  const study = useLive(haligtree.tagStudy, { sides: {}, timer: {}, place: {}, typed: {}, newPerDay: {}, retention: {} } as Awaited<ReturnType<typeof haligtree.tagStudy>>, [], ['item'])
  const current = tags.find((one) => one.tag === chosen)
  // How ready each tag with an exam date is, for the open tag's bar.
  const exams = useLive(haligtree.exams, [] as Awaited<ReturnType<typeof haligtree.exams>>)
  const exam = exams.find((one) => one.tag === chosen)
  // An exam date set, moved or cleared, with the way back.
  const examOn = (tag: string, at: string | null, was: string | null): void => {
    if (at) chime('pin')
    void haligtree.setTag(tag, { examAt: at }).then(() =>
      toast(at ? `#${tag}: review now paces it to be ready by ${dayMonth(at)}` : `#${tag} has no exam date now`,
        () => void haligtree.setTag(tag, { examAt: was }).then(() => chime('undo'))))
  }

  return (
    // The list of tags and the tag open beside it come in together, once both are read (lib/reads-in.tsx).
    <ReadsIn className="contents">
      {/* With a tag open, the list narrows to a column and the tag takes the rest. */}
      {/* Narrow, the tag being read takes the whole page; the list is a step back. */}
      <div className={chosen ? 'hidden w-72 shrink-0 border-r @[56rem]/page:flex' : 'contents'}>
      <Page title="Tags" count={example ? undefined : tags.length} unit={['tag', 'tags']}>
        {/* The tags that do something, said before you need them: they work from the first time you write one. */}
        {!chosen && (
          <p className="mx-5 mt-8 text-control text-muted-foreground">
            <strong className="text-foreground">Some tags do something.</strong> #bit keeps a note private; #book adds a reading status and a rating; one marked <SquareCheck role="img" aria-label="with a tick" className="inline size-3.5 -translate-y-px" /> makes a task.
          </p>
        )}
        {/* What you come to Tags for, on one line: find one, and see them by size, by what is growing, or by name. */}
        {!example && tags.length > 1 && (
          <div data-tags-bar className="mx-5 mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
            {tags.length > 12 && (
              <div data-tags-find className="min-w-0 flex-1 basis-56">
                <ListSearch value={query} placeholder="Find a tag" className="w-full"
                  onChange={(to) => (setQuery(to), setCursor(to ? 0 : -1))}
                  onStep={(by) => setCursor(Math.max(0, Math.min(topics.length - 1, cursor + by * across)))}
                  onDone={() => topics[Math.max(0, cursor)] && setChosen(topics[Math.max(0, cursor)].tag)} />
              </div>
            )}
            <Chips className="ml-auto shrink-0" options={ORDERS} on={(id) => id === order} pick={(id) => (setOrder(id as Order), localStorage.setItem('tags:order', id))} />
          </div>
        )}
        {topics.length ? (
          <Example on={example} tryIt={<><strong>write a #word anywhere in a note, a gem or a task.</strong> It shows up here, counted, with a page of its own.</>}>
          <div ref={setBox} data-tags-list={across} className="mx-3 my-2">
          <VirtualList items={lines} keyOf={(line) => line.map((one) => one.tag).join(' ')} holds={(line, id) => line.some((one) => one.tag === id)} cursor={cursor < 0 ? -1 : Math.floor(cursor / across)} estimate={36}>
            {(line, row) => (
              <div className={across > 1 ? 'grid grid-cols-2 gap-x-6' : undefined}>
              {line.map(({ tag, count, color, examAt, action, recent, last }, at) => {
                const index = row * across + at
                return (
              <RowMenu key={tag} items={[
                { label: 'Open', keys: '↵', run: () => setChosen(tag) },
                // The date itself is picked in the open tag's bar.
                examAt ? { label: 'Clear the exam date', run: () => examOn(tag, null, examAt) } : { label: 'Set an exam date…', run: () => setChosen(tag) },
                { label: 'Rename or merge…', run: () => void renameTag(tag, (now) => chosen === tag && setChosen(now)) },
                sideTagLine(tag, sideSaved, real.map((one) => one.tag)),
                { label: `Copy #${tag}`, run: () => copy(`#${tag}`, `Copied #${tag}`) }
              ]}>
              <button
                type="button"
                data-row
                data-tag-row={tag}
                data-cursor={index === cursor || undefined}
                onClick={() => setChosen(tag)}
                onPointerEnter={() => prefetchTag(tag)}
                className={`group/tagrow flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/50 ${chosen === tag ? 'bg-accent' : index === cursor ? 'bg-accent/50' : ''}`}
              >
                <TagColourPick tag={tag} color={color} />
                {/* A tag that does something wears its mark beside its name, in its own colour, its words in the tip. */}
                <span className="flex min-w-0 flex-1 items-center gap-1.5">
                  <span className="min-w-0 truncate">{tag}</span>
                  <DoesChip tag={tag} color={color} action={!!action} />
                </span>
                {/* Growing: how many of it came in the last 30 days, when that is not all of it (a tag all new says nothing
                    by it); else, in "Lately", when it was last written. */}
                {!chosen && (recent > 0 && recent < count ? <span data-tag-recent className="shrink-0 text-xs text-muted-foreground tabular-nums">+{num(recent)} this month</span>
                  : order === 'recent' && last ? <span className="shrink-0 text-xs text-muted-foreground">{ago(last)}</span> : null)}
                {/* A star, on pointing, to star it (kept in the sidebar); a starred one keeps it filled. */}
                {!example && (() => {
                  const fav = (sideSaved ?? []).includes(tag)
                  // Reached by Tab too, shown while it or its row has the keys; Enter or Space stars it, not the row under it.
                  return (
                    <Tip label={fav ? 'Unstar this tag' : 'Star this tag, in the sidebar'}>
                      <span role="button" tabIndex={0} aria-label={fav ? `Unstar #${tag}` : `Star #${tag}, in the sidebar`} aria-pressed={fav} data-tag-fav={tag}
                        onClick={(event) => (event.stopPropagation(), void toggleSideTag(tag, real.map((one) => one.tag)))}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' && event.key !== ' ') return
                          event.preventDefault()
                          event.stopPropagation()
                          void toggleSideTag(tag, real.map((one) => one.tag))
                        }}
                        className={`flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground transition-[opacity,color,scale] duration-80 hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 active:scale-[0.9] ${fav ? '' : 'opacity-0 group-hover/tagrow:opacity-100 group-focus-visible/tagrow:opacity-100 focus-visible:opacity-100'}`}>
                        <Star className={`size-3.5 ${fav ? 'fill-current' : ''}`} />
                      </span>
                    </Tip>
                  )
                })()}
                <span data-tag-count className="min-w-8 shrink-0 text-right text-sm font-semibold text-foreground tabular-nums"><Count n={count} /></span>
              </button>
              </RowMenu>
                )
              })}
              </div>
            )}
          </VirtualList>
          </div>
          </Example>
        ) : unloaded(tags) ? null : query ? (
          <p className="mx-5 my-4 text-control text-muted-foreground">No tag has {quoted(query, 80)} in it.</p>
        ) : (
          <Empty title="No tags yet">
            Write a <span className="text-foreground">#word</span> anywhere in a capture, a gem or a task and it shows up here, counted. The ones that keep coming up are the ones worth a home of their own.
          </Empty>
        )}
      </Page>
      </div>
      {chosen && (
        // Reading, the band under it names the tag and counts; the bar keeps only the way back and the tabs.
        // The bar: the way back on a narrow window, and the tag's two tabs on the left, where they stay put. Everything
        // done to the tag lives in the band under it (Read through, Study, ⋯), so each action has one home.
        <Page title={tab === 'read' ? 'Tag' : `#${chosen}`} count={tab === 'read' ? undefined : current?.count ?? items.length} unit={['note', 'notes']} lead={
          <div data-list-tabs className="flex shrink-0 items-center gap-1" style={{ marginLeft: 'calc(var(--list-edge) - var(--list-ink))' }}>
            <Tip label="All tags">
              <Button variant="ghost" size="icon-sm" aria-label="All tags" className="cursor-pointer @[56rem]/page:hidden" onClick={() => (chime('tap'), setChosen(null))}><ArrowLeft className="size-3.5" /></Button>
            </Tip>
            <Chips className="shrink-0" options={[{ id: 'read', label: 'Read', tip: 'Its notes, to read' }, { id: 'manage', label: 'Manage', tip: 'Its colour, alias, exam date and how Review treats its cards; its notes as rows to tidy' }]}
              on={(id) => id === tab && !blurting && !practising} pick={(id) => (setBlurting(null), setPractising(null), setTab(id as 'read' | 'manage'))} />
          </div>
        }>
          {practising === chosen ? <PractiseTag key={chosen} tag={chosen} onClose={() => (chime('fold'), setPractising(null))} /> : blurting === chosen ? <Blurt key={chosen} tag={chosen} onClose={() => (chime('fold'), setBlurting(null))} /> : tab === 'read' && chosen === 'meeting' && loaded && !loaded.length ? (
            // Calls and lectures are every note tagged #recording: before the first, what they are for and the way to make one.
            <Empty title="No calls or lectures yet" action={<Button size="sm" data-meeting-first onClick={() => void recordMeeting()}>Record a call or lecture</Button>}>
              Record a call, in an app or the browser, or a lecture: your microphone and the sound from this Mac, the words as they are said, who said what, and what to take from it after. It stays on this Mac. <Kbd>⌃⌥⌘M</Kbd> from anywhere.
            </Empty>
          ) : tab === 'read' ? <TagStream key={chosen} tag={chosen} color={current?.color} onOpen={onOpen} onTag={setChosen} onStudy={(how) => how === 'review' ? onOpen('study', chosen) : how === 'blurt' ? (setPractising(null), setBlurting(chosen)) : (setBlurting(null), setPractising(chosen))} /> : (<>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-5 py-3">
            {/* A colour, and whether writing this tag makes a task, the way
                #bug does. Labels, not kinds: a colour and one behaviour. */}
            <span className="flex items-center gap-1">
              {COLORS.map((one, index) => (
                <Tip key={one} label={one}>
                <button
                  type="button"
                
                  // Each colour its own note, like the themes; picking lands with the chord.
                  onMouseEnter={() => step(index)}
                  // Picked again, the colour comes off: a tag can go back to plain.
                  onClick={() => { const was = current?.color ?? null; const next = was === one ? null : one; void haligtree.setTag(chosen, { color: next }).then(() => (chime('settled'), quietly(() => void haligtree.setTag(chosen, { color: was })))) }}
                  className={`size-3.5 rounded-full ${current?.color === one ? 'ring-2 ring-foreground/60 ring-offset-1 ring-offset-background' : ''}`}
                  style={{ background: `var(--tt-color-text-${one})` }}
                />
                </Tip>
              ))}
            </span>
            {/* The switch and the day its tasks land on, one unit that wraps whole: the day never strays from the switch it belongs to. */}
            <span data-tag-becomes className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <label className="flex items-center gap-1.5 text-xs">
              <Switch checked={!!current?.action} onCheckedChange={(action) => void haligtree.setTag(chosen, { action }).then(() => quietly(() => void haligtree.setTag(chosen, { action: !action })))} />
              <span className="whitespace-nowrap">Tagged notes become tasks</span>
            </label>
            {/* Where those tasks land: no date (as always), or a day from now. A date written with it wins. */}
            {current?.action && (
              <span data-tag-lands className="flex items-center gap-1.5 text-xs">
                <span className="whitespace-nowrap font-medium text-foreground">dated:</span>
                <Chips options={LANDS.map(({ id, label }) => ({ id, label }))}
                  on={(id) => id === (('lands' in current ? current.lands : null) ?? 'none')}
                  pick={(id) => { const was = (('lands' in current ? current.lands : null) ?? null) as string | null; void haligtree.setTag(chosen, { lands: id === 'none' ? null : id }).then(() => (chime('settled'), quietly(() => void haligtree.setTag(chosen, { lands: was })))) }} />
              </span>
            )}
            </span>
            {TAG_DOES[chosen] && <span className="text-xs text-muted-foreground">#{chosen}: {TAG_DOES[chosen]}</span>}
            {/* An exam or deadline: everything with this tag is paced to be ready by then. */}
            <DatePicker key={`exam-${chosen}`} value={current?.examAt ?? null} placeholder="Exam date" onChange={(at) => examOn(chosen, at, current?.examAt ?? null)} />
            {/* How Review treats its cards: learning new ones, keeping what you know, or resting all of it. */}
            <span data-tag-priority className="flex items-center gap-1.5 text-xs">
              {/* Named, so the three read as what Review does with its cards, not as a state of the tag. */}
              <span className="whitespace-nowrap font-medium text-foreground">In Review:</span>
              <Chips options={[
                { id: 'learning', label: 'Learning', tip: 'New cards with this tag start in Review, a few a day' },
                { id: 'maintaining', label: 'Maintaining', tip: 'Cards you have started keep coming back; no new ones start' },
                { id: 'paused', label: 'Paused', tip: 'None of its cards come up in Review until you choose again' }
              ]}
                on={(id) => id === ((current && 'priority' in current ? current.priority : null) ?? 'learning')}
                pick={(id) => { const was = (current && 'priority' in current ? current.priority : null) ?? null; void haligtree.setTag(chosen, { priority: id === 'learning' ? null : (id as 'maintaining' | 'paused') }).then(() =>
                  (chime('settled'), quietly(() => void haligtree.setTag(chosen, { priority: was as 'maintaining' | 'paused' | null }))))}} />
            </span>
            {/* Its answers read aloud as they show in Review, by the Mac's own voice for the language: choosing one says a line in it. */}
            <span data-tag-speak className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="whitespace-nowrap font-medium text-foreground">Read the back aloud:</span>
              <Chips options={LANGUAGES} on={(id) => id === (speaking[chosen] ?? '')}
                pick={(id) => { const was = speaking[chosen] ?? null; void haligtree.setTag(chosen, { speak: id || null }).then(() => (id && preview(id), quietly(() => void haligtree.setTag(chosen, { speak: was })))) }} />
            </span>
            {/* How its typed answers are checked in Review: the test should ask for exactly what you will need. */}
            <span data-tag-typed className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="whitespace-nowrap font-medium text-foreground">Typed answers:</span>
              <Chips options={[
                { id: '', label: 'Usual', tip: 'The answer word for word counts at once, capitals and stops aside; anything else you grade, or this Mac judges its meaning' },
                { id: 'exact', label: 'Exact', tip: 'Only every mark the same, capitals too, counts at once: formulas, symbols, case names' }
              ]}
                on={(id) => id === (study.typed[chosen] ?? '')}
                pick={(id) => { const was = study.typed[chosen] ?? null; void haligtree.setTag(chosen, { typed: (id || null) as 'exact' | 'meaning' | null }).then(() => (chime('settled'), quietly(() => void haligtree.setTag(chosen, { typed: was })))) }} />
            </span>
            {/* Its own new cards a day, under the book's: a big deck under one tag never crowds out the rest. */}
            <span data-tag-new className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="whitespace-nowrap font-medium text-foreground">New cards a day:</span>
              {/* As in Settings, or its own number: dragged sideways, typed, or a sum (+5, 20*2). */}
              <Chips options={[{ id: '', label: 'As in Settings' }, { id: 'own', label: 'Its own' }]}
                on={(id) => (id === 'own') === (study.newPerDay[chosen] !== undefined)}
                pick={(id) => { const was = study.newPerDay[chosen] ?? null; void haligtree.setTag(chosen, { newPerDay: id === '' ? null : (was ?? 10) }).then(() => (chime('settled'), quietly(() => void haligtree.setTag(chosen, { newPerDay: was })))) }} />
              {study.newPerDay[chosen] !== undefined && (
                <ScrubField label={`New cards a day for #${chosen}`} min={0} max={999} value={study.newPerDay[chosen]} className={SCRUB}
                  onChange={(n) => void haligtree.setTag(chosen, { newPerDay: n })} />
              )}
            </span>
            {/* How much of it to remember, its own, as Anki's desired retention per deck: the same as its deck menu. */}
            <span data-tag-keep className="flex basis-full flex-wrap items-center gap-1.5 text-xs">
              <span className="whitespace-nowrap font-medium text-foreground">How much to remember:</span>
              <Chips options={[{ id: '', label: 'As in Settings' }, { id: 'own', label: 'Its own', tip: 'Higher brings its cards back sooner and more often' }]}
                on={(id) => (id === 'own') === (study.retention?.[chosen] !== undefined)}
                pick={(id) => { const was = study.retention?.[chosen] ?? null; void haligtree.setTag(chosen, { retention: id === '' ? null : (was ?? 0.9) }).then(() => (chime('settled'), quietly(() => void haligtree.setTag(chosen, { retention: was })))) }} />
              {study.retention?.[chosen] !== undefined && (
                <span className="flex items-center gap-0.5"><ScrubField label={`How much to remember of #${chosen}`} min={70} max={99} value={Math.round(study.retention[chosen] * 100)} className={SCRUB}
                  onChange={(n) => void haligtree.setTag(chosen, { retention: n / 100 })} />%</span>
              )}
            </span>
            {/* An alias: this tag counts as another without the words changing. */}
            <TagEntry
              key={`alias-${chosen}`}
              placeholder="counts as…"
              aria-label="Counts as another tag"
              className={`${INPUT_FRAME} h-8 w-32 text-control`}
              onEnter={(to) => {
                const was = ((current && 'aliasOf' in current ? current.aliasOf : null) as string | null | undefined) ?? null
                const self = chosen
                void haligtree.setTag(chosen, { aliasOf: to || null }).then(() => {
                  toast(to ? `#${chosen} now counts as #${to}` : `#${chosen} counts as itself again`, () => void haligtree.setTag(self, { aliasOf: was }).then(() => setChosen(self)))
                  if (to) setChosen(to)
                })
              }}
            />
            {/* Rename everywhere at once; renaming onto a tag that exists merges them. */}
            <TagEntry
              key={chosen}
              placeholder="rename or merge into…"
              aria-label="Rename or merge into"
              className={`${INPUT_FRAME} h-8 w-44 text-control`}
              onEnter={(to) => void (to && renameTag(chosen, setChosen, to))}
            />
            </div>
          {exam && <div className="border-b px-5 py-3"><Readiness exam={exam} named={false} /></div>}
          {several.bar && <div data-pick-bar className="flex min-h-11 items-center border-b px-5 py-1.5">{several.bar}</div>}
          <VirtualList items={items} keyOf={(item) => `${item.type}-${item.id}`} estimate={36} className="mx-3 my-2">
            {(item) => {
              const Icon = ICON[item.type as keyof typeof ICON] ?? Inbox
              const task = item.type === 'task' ? allTasks.find((one) => one.id === item.id) : undefined
              // The shared title: words without tags, then the other tags small and coloured (this tag goes without saying).
              const name = taskName(item.title)
              return (
                <RowMenu items={() => several.menu(item) ?? [...(item.type === 'task' && !task ? [{ label: 'Open', run: () => onOpen(item.type, item.id) }] : fullMenu(item.type, item.id, () => onOpen(item.type, item.id)) ?? sideMenu(item.type, item.id, name.text, { onOpen, pinned: pins.some((one) => one.id === item.id), task, now: taskNow })), ...several.rowItems(item)]}>
                <button
                  type="button"
                  data-pick={`${item.type}:${item.id}`}
                  data-picked={several.picked(item) || undefined}
                  // ⌘-click and ⇧-click pick as Finder does; ⌥⌘-click: a note in a window of its own; a task opens where tasks live.
                  onClick={(event) => (event.metaKey && event.altKey && item.type !== 'task' ? openApart(item.type, item.id) : several.click(event, item) || onOpen(item.type, item.id))}
                  data-private={item.private ? '' : undefined}
                  className={`relative flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent/60 ${PICKED_MARK}`}
                >
                  {/* A task in a focus session: the dot in the page's margin; its time in its name's tip, the row being one line. */}
                  {item.type === 'task' && <SessionDot id={item.id} time={taskTime} className={`${DOT_IN_MARGIN} inset-y-0`} />}
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    {item.type === 'task'
                      ? <SpentTip task={{ id: item.id, estimate: task?.estimate ?? null, status: task?.status ?? 'open' }} time={taskTime}><span className="private-text truncate">{name.text || 'New note'}</span></SpentTip>
                      : <span className="private-text truncate">{name.text || 'New note'}</span>}
                    <Tags tags={name.tags.filter((one) => one !== chosen)} />
                  </span>
                  <span className="text-xs text-muted-foreground">{typeSaid(item.type)}</span>
                </button>
                </RowMenu>
              )
            }}
          </VirtualList>
          </>)}
        </Page>
      )}
    </ReadsIn>
  )
}
