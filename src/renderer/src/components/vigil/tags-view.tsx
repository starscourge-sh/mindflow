import { chime, step } from '@/lib/sound'
import { useMemo, useState } from 'react'
import { toast, VirtualList, refuse, quietly } from './ui'
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
import { alive } from '@/components/ui/alive-icon'
import ArrowNarrowLeftIcon from '@/components/ui/arrow-narrow-left-icon'
import FileDescriptionIcon from '@/components/ui/file-description-icon'
import LibraryIcon from '@/components/ui/library-icon'
import StackIcon from '@/components/ui/stack-icon'
import CheckedIcon from '@/components/ui/checked-icon'

import { splitTags, unloaded, useLive, vigil } from '@/lib/vigil'
import { useKept, useOpened } from '@/lib/nav'
import { typeSaid } from '@/lib/capture-links'
import { Empty, Page, useListKeys } from './ui'
import { Tip } from '@/components/vigil/ui'
import { DatePicker } from './date-picker'
import { INPUT_FRAME, TagEntry } from './hash-field'
import { Readiness } from './review-view'
import { openWindow } from '@/lib/notes'
import { TagStream, prefetchTag, useLiveFor } from './tag-read'
import { TagIcon, tagTint } from './tag-icon'
import { tagColors } from '@/extensions/tokens'
import { BookOpen, EyeOff, SquareCheck } from 'lucide-react'
import { motion } from 'motion/react'
import { dayMonth } from '../../../../main/dates'
import { TAG_DOES } from '../capture-kinds/kind-fields'
import { Blurt } from './study'
import { PractiseTag } from './learn-mode'
import { Chips } from './display'
import { exampleTags } from '@/lib/examples'
import { Example } from './example'

// itshover drawings in lucide's place, moving when their control is pointed at.
const ArrowLeft = alive(ArrowNarrowLeftIcon)
const FileText = alive(FileDescriptionIcon)
const Gem = alive(LibraryIcon)
const Inbox = alive(StackIcon)
const ListTodo = alive(CheckedIcon)

const ICON = { capture: Inbox, nugget: Gem, article: FileText, task: ListTodo }

/** What a tag does, if anything: an icon and a word for its row, and a line for its tooltip. */
const does = (tag: string, action: boolean): { icon: typeof EyeOff; short: string; long: string } | null =>
  TAG_DOES[tag] ? { icon: tag === 'bit' ? EyeOff : BookOpen, short: tag === 'bit' ? 'Private' : 'Book', long: TAG_DOES[tag] }
    : action ? { icon: SquareCheck, short: 'Makes a task', long: 'Makes a task: anything tagged with it goes to your tasks' } : null

/** What a tag does, as a chip in the tag's own colour beside its name: seen at a glance, not read in small grey. */
function DoesChip({ tag, color, action }: { tag: string; color?: string | null; action: boolean }): React.JSX.Element | null {
  const what = does(tag, action)
  if (!what) return null
  const tint = (color ?? tagColors.get(tag.toLowerCase())) ? tagTint(tag, color) : 'var(--foreground)'
  const Icon = what.icon
  return (
    <Tip label={what.long}>
      <span className="flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-medium whitespace-nowrap"
        style={{ color: tint, background: `color-mix(in oklab, ${tint} 13%, transparent)` }}>
        <Icon className="size-3" strokeWidth={2.2} />{what.short}
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
  const real = useLive(vigil.tags, [] as Awaited<ReturnType<typeof vigil.tags>>)
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
  // A tag picked is a step Back returns from; Read or Manage is kept in it.
  useOpened(chosen ?? undefined, focus, setChosen, () => setChosen(null))
  useKept('tab', tab, setTab, 'read')
  // The open tag's notes, for Manage; never the tag before's while the next is read.
  const items = useLiveFor(chosen ?? '', () => (chosen ? vigil.tag(chosen) : Promise.resolve([]))) ?? []
  const [cursor] = useListKeys(example ? 0 : tags.length, { onOpen: (index) => setChosen(tags[index].tag) })
  const top = tags[0]?.count ?? 1
  const current = tags.find((one) => one.tag === chosen)
  // How ready each tag with an exam date is, for the open tag's bar.
  const exams = useLive(vigil.exams, [] as Awaited<ReturnType<typeof vigil.exams>>)
  const exam = exams.find((one) => one.tag === chosen)
  // An exam date set, moved or cleared, with the way back.
  const examOn = (tag: string, at: string | null, was: string | null): void => {
    if (at) chime('pin')
    void vigil.setTag(tag, { examAt: at }).then(() =>
      toast(at ? `#${tag}: review now paces it to be ready by ${dayMonth(at)}` : `#${tag} has no exam date now`,
        () => void vigil.setTag(tag, { examAt: was }).then(() => chime('undo'))))
  }

  return (
    <>
      {/* With a tag open, the list narrows to a column and the tag takes the rest. */}
      {/* Narrow, the tag being read takes the whole page; the list is a step back. */}
      <div className={chosen ? 'hidden w-72 shrink-0 border-r @[56rem]/page:flex' : 'contents'}>
      <Page title="Tags" count={example ? undefined : tags.length} unit={['tag', 'tags']}>
        {/* The tags that do something, said before you need them: they work from the first time you write one. */}
        {!chosen && (
          <p className="mx-5 mt-3 text-control text-muted-foreground">
            <strong className="text-foreground">Some tags do something.</strong> #bit keeps a note private; #book adds a reading status and a rating.
          </p>
        )}
        {tags.length ? (
          <Example on={example} tryIt={<><strong>write a #word anywhere in a note, a gem or a task.</strong> It shows up here, counted, with a page of its own.</>}>
          <VirtualList items={tags} keyOf={(one) => one.tag} cursor={cursor} estimate={36} className="mx-3 my-2">
            {({ tag, count, color, examAt, action }, index) => (
              <RowMenu items={[
                { label: 'Open', keys: '↵', run: () => setChosen(tag) },
                // The date itself is picked in the open tag's bar.
                examAt ? { label: 'Clear the exam date', run: () => examOn(tag, null, examAt) } : { label: 'Set an exam date…', run: () => setChosen(tag) },
                { label: `Copy #${tag}`, run: () => copy(`#${tag}`, `Copied #${tag}`) }
              ]}>
              <button
                type="button"
                data-row
                data-cursor={index === cursor || undefined}
                onClick={() => setChosen(tag)}
                onPointerEnter={() => prefetchTag(tag)}
                className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left transition-colors hover:bg-accent/50 ${chosen === tag ? 'bg-accent' : index === cursor ? 'bg-accent/50' : ''}`}
              >
                <TagIcon tag={tag} color={color} />
                <span className={chosen ? 'min-w-0 flex-1 truncate' : 'w-40 truncate'}>{tag}</span>
                {/* A tag that does something says what, in its own colour. */}
                {!chosen && <DoesChip tag={tag} color={color} action={!!action} />}
                {!chosen && (
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-border/50">
                    <span className="block h-full rounded-full bg-muted-foreground/40" style={{ width: `${(count / top) * 100}%` }} />
                  </span>
                )}
                <span className="w-8 text-right text-sm font-semibold text-foreground tabular-nums">{count}</span>
              </button>
              </RowMenu>
            )}
          </VirtualList>
          </Example>
        ) : unloaded(tags) ? null : (
          <Empty title="No tags yet">
            Write a <span className="text-foreground">#word</span> anywhere in a capture, a gem or a task and it shows up here, counted. The ones that keep coming up are the ones worth a home of their own.
          </Empty>
        )}
      </Page>
      </div>
      {chosen && (
        // Reading, the band under it names the tag and counts; the bar keeps only the way back and the tabs.
        <Page title={tab === 'read' ? 'Tag' : `#${chosen}`} count={tab === 'read' ? undefined : current?.count ?? items.length} unit={['note', 'notes']} actions={
          // Reading the tag, or looking after it: two jobs, a tab each.
          <span className="flex items-center gap-1">
          <Tip label="All tags">
            <Button variant="ghost" size="icon-sm" aria-label="All tags" className="@[56rem]/page:hidden" onClick={() => (chime('tap'), setChosen(null))}><ArrowLeft className="size-3.5" /></Button>
          </Tip>
          <Tip label="Write everything you remember about it, then see what you left out">
            <Button variant="ghost" size="sm" data-blurt-open onClick={() => (chime('open'), setPractising(null), setBlurting(chosen))}>Blurt</Button>
          </Tip>
          <Tip label="Go through its cards, nothing counted or scheduled">
            <Button variant="ghost" size="sm" data-practise-open onClick={() => (chime('open'), setBlurting(null), setPractising(chosen))}>Practise</Button>
          </Tip>
          <span role="tablist" className="flex rounded-lg border border-foreground/10 bg-accent/40 p-0.5 text-control">
            {(['read', 'manage'] as const).map((one) => (
              <button key={one} type="button" role="tab" aria-selected={tab === one}
                onClick={() => void (tab !== one && (chime('tap'), setTab(one)))}
                className={`relative rounded-md px-2.5 py-0.5 transition-colors ${tab === one ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                {tab === one && <motion.span layoutId="tag-tab" className="absolute inset-0 -z-10 rounded-md border border-foreground/15 bg-background shadow-sm" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                {one === 'read' ? 'Read' : 'Manage'}
              </button>
            ))}
          </span>
          </span>
        }>
          {practising === chosen ? <PractiseTag key={chosen} tag={chosen} onClose={() => (chime('fold'), setPractising(null))} /> : blurting === chosen ? <Blurt key={chosen} tag={chosen} onClose={() => (chime('fold'), setBlurting(null))} /> : tab === 'read' ? <TagStream key={chosen} tag={chosen} color={current?.color} onOpen={onOpen} onTag={setChosen} onManage={() => (chime('tap'), setTab('manage'))} /> : (<>
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
                  onClick={() => { const was = current?.color ?? null; const next = was === one ? null : one; void vigil.setTag(chosen, { color: next }).then(() => (chime('settled'), quietly(() => void vigil.setTag(chosen, { color: was })))) }}
                  className={`size-3.5 rounded-full ${current?.color === one ? 'ring-2 ring-foreground/60 ring-offset-1 ring-offset-background' : ''}`}
                  style={{ background: `var(--tt-color-text-${one})` }}
                />
                </Tip>
              ))}
            </span>
            <label className="flex items-center gap-1.5 text-xs">
              <Switch checked={!!current?.action} onCheckedChange={(action) => void vigil.setTag(chosen, { action }).then(() => toast(action ? `Anything tagged #${chosen} now becomes a task` : `#${chosen} is only a label`, () => void vigil.setTag(chosen, { action: !action })))} />
              <span className="whitespace-nowrap">Tagged notes become tasks</span>
            </label>
            {/* Where those tasks land: no date (as always), or a day from now. A date written with it wins. */}
            {current?.action && (
              <span data-tag-lands className="flex items-center gap-1.5 text-xs">
                <span className="whitespace-nowrap text-muted-foreground">Scheduled</span>
                <Chips options={LANDS.map(({ id, label }) => ({ id, label }))}
                  on={(id) => id === (('lands' in current ? current.lands : null) ?? 'none')}
                  pick={(id) => void vigil.setTag(chosen, { lands: id === 'none' ? null : id }).then(() => toast(`#${chosen} tasks now land ${LANDS.find((one) => one.id === id)?.said}`))} />
              </span>
            )}
            {TAG_DOES[chosen] && <span className="text-xs text-muted-foreground">#{chosen}: {TAG_DOES[chosen]}</span>}
            {/* An exam or deadline: everything with this tag is paced to be ready by then. */}
            <DatePicker key={`exam-${chosen}`} value={current?.examAt ?? null} placeholder="Exam date" onChange={(at) => examOn(chosen, at, current?.examAt ?? null)} />
            {/* How Review treats its cards: learning new ones, keeping what you know, or resting all of it. */}
            <span data-tag-priority className="flex items-center gap-1.5 text-xs">
              <Chips options={[
                { id: 'learning', label: 'Learning', tip: 'New cards with this tag start in Review, a few a day' },
                { id: 'maintaining', label: 'Maintaining', tip: 'Cards you have started keep coming back; no new ones start' },
                { id: 'paused', label: 'Paused', tip: 'None of its cards come up in Review until you choose again' }
              ]}
                on={(id) => id === ((current && 'priority' in current ? current.priority : null) ?? 'learning')}
                pick={(id) => { const was = (current && 'priority' in current ? current.priority : null) ?? null; void vigil.setTag(chosen, { priority: id === 'learning' ? null : (id as 'maintaining' | 'paused') }).then(() =>
                  toast(id === 'paused' ? `#${chosen} is paused: none of its cards come up in Review` : id === 'maintaining' ? `#${chosen} is maintained: its cards come back, no new ones start` : `#${chosen} is learning: new cards start as usual`, () => void vigil.setTag(chosen, { priority: was as 'maintaining' | 'paused' | null })))}} />
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
                void vigil.setTag(chosen, { aliasOf: to || null }).then(() => {
                  toast(to ? `#${chosen} now counts as #${to}` : `#${chosen} counts as itself again`, () => void vigil.setTag(self, { aliasOf: was }).then(() => setChosen(self)))
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
              onEnter={(to) => {
                if (!to) return
                // Onto a tag that is there already it is a merge, which cannot be pulled apart again: only a plain rename has an Undo.
                const merging = tags.some((one) => one.tag === to)
                const was = chosen
                void vigil.renameTag(chosen, to).then((done) => {
                  if (!done) return refuse('Not renamed: a tag starts with a letter and uses only letters, numbers, dashes and underscores')
                  chime('retag')
                  toast(merging ? `#${chosen} is merged into #${done} everywhere` : `#${chosen} is now #${done} everywhere`, merging ? undefined : () => void vigil.renameTag(done, was).then(() => setChosen(was)))
                  setChosen(done)
                })
              }}
            />
            </div>
          {exam && <div className="border-b px-5 py-3"><Readiness exam={exam} named={false} /></div>}
          <VirtualList items={items} keyOf={(item) => `${item.type}-${item.id}`} estimate={36} className="mx-3 my-2">
            {(item) => {
              const Icon = ICON[item.type as keyof typeof ICON] ?? Inbox
              return (
                <button
                  type="button"
                  // ⌘-click: a note in a window of its own; a task opens where tasks live.
                  onClick={(event) => (event.metaKey && item.type !== 'task' ? openWindow(item.type, item.id) : onOpen(item.type, item.id))}
                  data-private={item.private ? '' : undefined}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-accent/60"
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="private-text flex-1 truncate">{splitTags(item.title).text || 'Untitled'}</span>
                  <span className="text-xs text-muted-foreground">{typeSaid(item.type)}</span>
                </button>
              )
            }}
          </VirtualList>
          </>)}
        </Page>
      )}
    </>
  )
}
