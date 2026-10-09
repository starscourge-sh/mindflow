import { chime, step } from '@/lib/sound'
import { useState } from 'react'
import { toast, VirtualList, refuse } from './ui'
import { RowMenu, copy } from './row-menu'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'

const COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'] as const
import { alive } from '@/components/ui/alive-icon'
import ArrowNarrowLeftIcon from '@/components/ui/arrow-narrow-left-icon'
import FileDescriptionIcon from '@/components/ui/file-description-icon'
import LibraryIcon from '@/components/ui/library-icon'
import StackIcon from '@/components/ui/stack-icon'
import CheckedIcon from '@/components/ui/checked-icon'
import HashtagIcon from '@/components/ui/hashtag-icon'

import { splitTags, unloaded, useLive, vigil } from '@/lib/vigil'
import { useKept, useOpened } from '@/lib/nav'
import { Empty, Page, useListKeys } from './ui'
import { Input } from '@/components/ui/input'
import { Tip } from '@/components/vigil/ui'
import { DatePicker } from './date-picker'
import { Readiness } from './review-view'
import { openWindow } from '@/lib/notes'
import { TagStream } from './tag-read'
import { motion } from 'motion/react'
import { dayMonth } from '../../../../main/dates'
import { TAG_DOES } from '../capture-kinds/kind-fields'

// itshover drawings in lucide's place, moving when their control is pointed at.
const ArrowLeft = alive(ArrowNarrowLeftIcon)
const FileText = alive(FileDescriptionIcon)
const Gem = alive(LibraryIcon)
const Inbox = alive(StackIcon)
const ListTodo = alive(CheckedIcon)
const Tag = alive(HashtagIcon)

const ICON = { capture: Inbox, nugget: Gem, article: FileText, task: ListTodo }

/** What a tag does, if anything: a word for its row and a line for its tooltip. */
const does = (tag: string, action: boolean): { short: string; long: string } | null =>
  TAG_DOES[tag] ? { short: tag === 'bit' ? 'private' : 'a book', long: TAG_DOES[tag] }
    : action ? { short: 'makes a task', long: 'Makes a task: anything tagged with it goes to your tasks' } : null

/**
 * Every `#tag` in use, with how often: the retrospective index the plan asks
 * for, kept from the words themselves so it can never disagree with them. How
 * often a tag comes up is shown, never acted on: no threshold, no nagging.
 */
export function TagsView({ onOpen, focus }: { onOpen: (type: string, id: string) => void; focus?: string }): React.JSX.Element {
  const tags = useLive(vigil.tags, [] as Awaited<ReturnType<typeof vigil.tags>>)
  const [chosen, setChosen] = useState<string | null>(focus ?? null)
  // A tag opens to be read; looking after it (colour, alias, exam date) is the other tab.
  const [tab, setTab] = useState<'read' | 'manage'>('read')
  // A tag picked is a step Back returns from; Read or Manage is kept in it.
  useOpened(chosen ?? undefined, focus, setChosen, () => setChosen(null))
  useKept('tab', tab, setTab, 'read')
  const items = useLive(() => (chosen ? vigil.tag(chosen) : Promise.resolve([])), [], [chosen])
  const [cursor] = useListKeys(tags.length, { onOpen: (index) => setChosen(tags[index].tag) })
  const top = tags[0]?.count ?? 1
  const current = tags.find((one) => one.tag === chosen)
  // How ready each tag with an exam date is, for the open tag's bar.
  const exams = useLive(vigil.exams, [] as Awaited<ReturnType<typeof vigil.exams>>)
  const exam = exams.find((one) => one.tag === chosen)
  // An exam date set, moved or cleared, with the way back.
  const examOn = (tag: string, at: string | null, was: string | null): void => {
    if (at) chime('pin')
    void vigil.setTag(tag, { examAt: at }).then(() =>
      toast(at ? `#${tag}: review now paces it to be ready by ${dayMonth(at, 'never')}` : `#${tag} has no exam date now`,
        () => void vigil.setTag(tag, { examAt: was }).then(() => chime('undo'))))
  }

  return (
    <>
      {/* With a tag open, the list narrows to a column and the tag takes the rest. */}
      {/* Narrow, the tag being read takes the whole page; the list is a step back. */}
      <div className={chosen ? 'hidden w-72 shrink-0 border-r @[56rem]/page:flex' : 'contents'}>
      <Page title="Tags" count={tags.length} unit={['tag', 'tags']}>
        {/* The tags that do something, said before you need them: they work from the first time you write one. */}
        {!chosen && (
          <p className="mx-5 mt-3 text-xs text-muted-foreground">
            Some tags do something. <span className="text-foreground">#bit</span> keeps a note private, <span className="text-foreground">#book</span> adds a reading status, a rating and a takeaway, and a tag set to Makes a task (#bug, #fix) sends it to your tasks.
          </p>
        )}
        {tags.length ? (
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
                className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left transition-colors hover:bg-accent/50 ${chosen === tag ? 'bg-accent' : index === cursor ? 'bg-accent/50' : ''}`}
              >
                <Tag className="size-4" style={{ color: color ? `var(--tt-color-text-${color})` : undefined }} />
                <span className={chosen ? 'min-w-0 flex-1 truncate' : 'w-40 truncate'}>{tag}</span>
                {/* A tag that does something says what, quietly. */}
                {does(tag, !!action) && !chosen && (
                  <Tip label={does(tag, !!action)!.long}><span className="shrink-0 text-xs text-muted-foreground">{does(tag, !!action)!.short}</span></Tip>
                )}
                {!chosen && (
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-border/50">
                    <span className="block h-full rounded-full bg-muted-foreground/40" style={{ width: `${(count / top) * 100}%` }} />
                  </span>
                )}
                <span className="w-8 text-right text-xs text-muted-foreground tabular-nums">{count}</span>
              </button>
              </RowMenu>
            )}
          </VirtualList>
        ) : unloaded(tags) ? null : (
          <Empty shape={['polygon', 3]} title="No tags yet">
            Write a <span className="text-foreground">#word</span> anywhere in a capture, an idea or a task and it shows up here, counted. The ones that keep coming up are the ones worth a home of their own.
          </Empty>
        )}
      </Page>
      </div>
      {chosen && (
        // Reading, the band under it names the tag and counts; the bar keeps only the way back and the tabs.
        <Page title={tab === 'read' ? 'Tag' : `#${chosen}`} count={tab === 'read' ? undefined : current?.count ?? items.length} actions={
          // Reading the tag, or looking after it: two jobs, a tab each.
          <span className="flex items-center gap-1">
          <Tip label="All tags">
            <Button variant="ghost" size="icon-sm" aria-label="All tags" className="@[56rem]/page:hidden" onClick={() => (chime('tap'), setChosen(null))}><ArrowLeft className="size-3.5" /></Button>
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
          {tab === 'read' ? <TagStream tag={chosen} color={current?.color} onOpen={onOpen} onTag={setChosen} onManage={() => (chime('tap'), setTab('manage'))} /> : (<>
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
                  onClick={() => void vigil.setTag(chosen, { color: one }).then(() => chime('settled'))}
                  className={`size-3.5 rounded-full ${current?.color === one ? 'ring-2 ring-foreground/60 ring-offset-1 ring-offset-background' : ''}`}
                  style={{ background: `var(--tt-color-text-${one})` }}
                />
                </Tip>
              ))}
            </span>
            <label className="flex items-center gap-1.5 text-xs">
              <Switch checked={!!current?.action} onCheckedChange={(action) => void vigil.setTag(chosen, { action }).then(() => toast(action ? `#${chosen} now makes a task` : `#${chosen} is only a label`))} />
              <span className="whitespace-nowrap">Makes a task</span>
            </label>
            {TAG_DOES[chosen] && <span className="text-xs text-muted-foreground">#{chosen}: {TAG_DOES[chosen]}</span>}
            {/* An exam or deadline: everything with this tag is paced to be ready by then. */}
            <DatePicker key={`exam-${chosen}`} value={current?.examAt ?? null} placeholder="Exam date" onChange={(at) => examOn(chosen, at, current?.examAt ?? null)} />
            {/* An alias: this tag counts as another without the words changing. */}
            <Input
              key={`alias-${chosen}`}
              placeholder="Counts as #…"
              className="w-32 text-control h-8"
              onKeyDown={(event) => {
                const to = event.currentTarget.value.trim()
                if (event.key !== 'Enter') return
                void vigil.setTag(chosen, { aliasOf: to || null }).then(() => {
                  toast(to ? `#${chosen} now counts as #${to.replace(/^#/, '')}` : `#${chosen} counts as itself again`)
                  if (to) setChosen(to.replace(/^#/, '').toLowerCase())
                })
              }}
            />
            {/* Rename everywhere at once; renaming onto a tag that exists merges them. */}
            <Input
              key={chosen}
              placeholder="Rename or merge into…"
              className="w-44 text-control h-8"
              onKeyDown={(event) => {
                const to = event.currentTarget.value.trim()
                if (event.key !== 'Enter' || !to) return
                void vigil.renameTag(chosen, to).then((done) => {
                  if (!done) return refuse('Not renamed: a tag starts with a letter and uses only letters, numbers, dashes and underscores')
                  chime('retag')
                  toast(`#${chosen} is now #${done} everywhere`)
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
                  <span className="text-xs text-muted-foreground capitalize">{item.type}</span>
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
