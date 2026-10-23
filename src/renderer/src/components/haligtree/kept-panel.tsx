import { chime } from '@/lib/sound'
import { quoted } from '../../../../main/clip'
import { useEffect, useState } from 'react'
import { Plus, Trash, X } from 'lucide-react'
import type { Readable } from './read-through'

import { unloaded, useLive, haligtree, type Item } from '@/lib/haligtree'
import { exampleIdeas, exampleQuestions, exampleWriting } from '@/lib/examples'
import { Example } from './example'
import { makeTask, makeTasks } from '@/lib/tasks'
import { useSelectAll } from '@/lib/select-all'
import { usePicking } from '@/lib/pick-range'
import { binItem, moveToBin } from '@/lib/to-bin'
import { archive } from '@/lib/notes'
import { Chips } from './display'
import { copy, type MenuItem } from './row-menu'
import { Empty, ask, pin, toast, typing, useListKeys, useReadKey, Strip, Tip, startAt, Rolling } from './ui'
import { GlossButton, GlossLine } from './gloss-line'
import { Button } from '@/components/ui/button'
import { itemEntry, useItemDisplay } from './items-view'
import { NoteList, type Entry } from './note-list'
import BookIcon from '@/components/ui/book-icon'
import { AliveIcon } from '@/components/ui/alive-icon'
import { questionEntry, startQuestion } from './questions-view'
import { num } from '../../../../main/dates'
import { useHere } from '@/lib/split'

const TIERS = [{ id: 'nugget', label: 'Gems' }, { id: 'article', label: 'Pages' }, { id: 'question', label: 'Questions' }] as const

/**
 * What you kept, in the prompt: nuggets, articles and the questions you are
 * holding (open ones only; the settled wait in the main window), newest first, each one
 * opened right here. j and k move, Enter opens, and a right click has the rest.
 */
export function KeptPanel({ onOpen, open, onRead }: { onOpen: (type: string, id: string) => void; open?: string; onRead: (items: Readable[], start: number) => void }): React.JSX.Element {
  const [tier, setTier] = useState<'nugget' | 'article' | 'question'>('nugget')
  // Archived, or in the Bin, is out of sight here as in the main window.
  const all = useLive(() => haligtree.items(tier).then((list) => list.filter((one) => !one.archivedAt && (tier !== 'question' || !one.closedAt))), [] as Item[], [tier], ['item'])
  // The same filters as the main window's list, kept apart per tier.
  const { groups, display, chips, density } = useItemDisplay(`prompt:${tier}`, all)
  const items = groups.flatMap(([, list]) => list)
  const [cursor, setCursor] = useListKeys(items.length, { onOpen: (index) => onOpen(tier, items[index].id), opened: items.findIndex((one) => one.id === open), onExtend: (from, to) => picking.extend(items[from]?.id, items[to].id) })
  // x picks several nuggets, to start one article from them all.
  const [chosen, setChosen] = useState<string[]>([])
  useEffect(() => setChosen([]), [tier])
  // ⌘-click, ⇧-click, ⇧↑ and ⇧↓ pick as Finder does.
  const picking = usePicking(items.map((one) => one.id), chosen, setChosen)
  const choose = picking.toggle
  // The row a thought is being written under, from ; or its hover button.
  const [glossing, setGlossing] = useState<string | null>(null)
  // Split, only the pane in front answers keys.
  const here = useHere()
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!here()) return
      if (typing() || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      // ; a thought on the row under the cursor, written under it in place.
      if (event.key === ';' && items[cursor] && tier !== 'question') {
        event.preventDefault()
        chime('tap')
        return setGlossing(items[cursor].id)
      }
      if (event.key === 'Escape' && chosen.length && !document.querySelector('[role="menu"]')) {
        event.preventDefault()
        chime('off')
        return setChosen([])
      }
      const row = items[cursor]
      if (event.key === 'x' && row) choose(row.id)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })
  // ⌘A picks every gem on show; Escape lets them go.
  // ⌫ on what is picked (or the row under the cursor): to the Bin at once, with Undo.
  const binRefs = (ids: string[]): { type: string; id: string }[] => ids.map((id) => ({ type: tier, id }))
  const toBin = (ids: string[]): void => void moveToBin(binRefs(ids)).then((n) => n && setChosen([]))
  const selectAll = useSelectAll(() => items.map((one) => one.id), chosen, setChosen, { here, onDelete: toBin, current: () => items[cursor]?.id, titleOf: (id) => all.find((one) => one.id === id)?.title })
  // A Set, read once a row: with thousands picked, includes on every row froze the window.
  const chosenSet = new Set(chosen)
  const allPicked = items.length > 0 && items.every((one) => chosenSet.has(one.id))
  // A study task for each one picked, linked to it, as "Study this" makes one.
  const makeEach = (): void =>
    void makeTasks(chosen.flatMap((id) => {
      const item = all.find((one) => one.id === id)
      return item ? [{ id, title: item.title, private: !!item.private }] : []
    })).then((made) => made && setChosen([]))
  const read = (): void => void (items.length && onRead(items.map((one) => ({ type: tier, id: one.id })), startAt(items, open, cursor)))
  // ⇧⌘R reads through what is shown, from the row under the cursor.
  useReadKey(read, items.length)
  const article = (ids: string[]): void =>
    void haligtree.article(ids).then((id) => {
      chime('promote')
      setChosen([])
      toast(ids.length > 1 ? `A page, from ${num(ids.length)} gems` : 'A page, from this gem')
      onOpen('article', id)
    })
  // A question is held, not tested: its own short menu.
  const questionItems = (item: Item): MenuItem[] => [
    { label: 'Open', keys: '↵', run: () => onOpen('question', item.id) },
    { label: item.private ? 'Make it not private' : 'Make it private', run: () => void haligtree.setPrivate('nuggets', item.id, !item.private) },
    // Out of sight, not gone: the same way out as in the main window, undoable.
    { label: 'Archive', hint: 'Kept, out of sight', run: () => void archive('nuggets', [item.id], true) },
    binItem(binRefs([item.id])),
    { label: chosenSet.has(item.id) ? 'Unselect' : 'Select', keys: 'X', run: () => choose(item.id) },
    !allPicked && { label: 'Select all', keys: '⌘A', run: selectAll },
    'separator',
    { label: 'Copy the question', run: () => copy(item.title) }
  ]
  // The thought button sits in the row's own line, after its marks, so it
  // never lands on the title or on the private mark.
  const withThought = (entry: Entry): Entry => ({ ...entry, marks: <>{entry.marks}<GlossButton onClick={() => setGlossing(entry.id)} className="static opacity-0 group-hover/row:opacity-100 group-data-[cursor]/row:opacity-100" /></> })
  // Right-clicked among several picked: the menu speaks for all of them. Made once, not once a row.
  const manyMenu: MenuItem[] | null = chosen.length > 1 ? [
    { label: `Make ${num(chosen.length)} tasks`, run: makeEach },
    tier === 'nugget' && { label: 'Start a page', hint: 'From all of them', run: () => article(chosen) },
    'separator',
    { label: `Archive ${num(chosen.length)}`, hint: 'Kept, out of sight', run: () => void archive('nuggets', chosen, true).then(() => setChosen([])) },
    binItem(binRefs(chosen), () => setChosen([])),
    'separator',
    !allPicked && { label: 'Select all', keys: '⌘A', run: selectAll },
    { label: 'Clear the selection', keys: 'esc', run: () => (chime('off'), setChosen([])) }
  ] : null
  const menuFor = (item: Item): MenuItem[] => manyMenu && chosenSet.has(item.id) ? manyMenu : [
    { label: 'Open', keys: '↵', run: () => onOpen(tier, item.id) },
    { label: 'Add a thought', keys: ';', run: () => setGlossing(item.id) },
    { label: item.prompt ? 'Change the question' : 'Test me on this', run: () => void ask('The question it answers', item.prompt ?? 'A question this answers').then((prompt) => { if (prompt) void haligtree.saveItem(item.id, { prompt }).then(() => toast('Now tested: it will come up in review')) }) },
    ...(tier === 'nugget' ? [{ label: 'Start a page', run: () => article([item.id]) }] : []),
    { label: 'Study this', run: () => void ask('When will you study it?', 'e.g. read it again on Thursday').then((when) => { if (when) void makeTask({ item: item.id, text: `Study ${quoted(item.title, 200)} ${when}` }, 'A task, with this linked') }) },
    'separator',
    { label: item.pinnedAt ? 'Unpin' : 'Pin to the sidebar', run: () => pin('nuggets', item.id, !item.pinnedAt) },
    { label: item.private ? 'Make it not private' : 'Make it private', run: () => void haligtree.setPrivate('nuggets', item.id, !item.private) },
    { label: 'Archive', hint: 'Kept, out of sight', run: () => void archive('nuggets', [item.id], true) },
    binItem(binRefs([item.id])),
    'separator',
    { label: chosenSet.has(item.id) ? 'Unselect' : 'Select', keys: 'X', run: () => choose(item.id) },
    !allPicked && { label: 'Select all', keys: '⌘A', run: selectAll },
    'separator',
    { label: 'Copy title', run: () => copy(item.title) }
  ]
  return (
    <div className="flex flex-col gap-1 text-sm">
      <Strip className="@container/strip flex h-8 min-w-0 items-center gap-1 px-1">
        <Chips className="shrink-0" options={TIERS} on={(id) => id === tier} pick={(id) => setTier(id as 'nugget' | 'article' | 'question')} />
        {/* Read only when there is something to read. */}
        {all.length > 0 && <Tip label="One note at a time, full screen, from the highlighted one  ⇧⌘R"><Button variant="ghost" size="sm" className="ml-auto" aria-label="Read through" onClick={read}><AliveIcon icon={BookIcon} size={14} /> <span className="hidden @[27rem]/strip:inline">Read through</span></Button></Tip>}
        {tier !== 'question' && <span className={all.length ? '' : 'ml-auto'}>{display}</span>}
        {tier === 'article' && (
          <Button variant="ghost" size="sm" onClick={() => void haligtree.newArticle().then((id) => (chime('promote'), onOpen('article', id)))}><Plus className="size-3.5" /> New page</Button>
        )}
        {tier === 'question' && (
          <Tip label="New question"><Button variant="ghost" size="icon-sm" aria-label="New question" className={all.length ? '' : 'ml-auto'} onClick={() => void startQuestion(onOpen)}><Plus className="size-3.5" /></Button></Tip>
        )}
      </Strip>
      {chosen.length > 0 && (
        <div className="flex items-center gap-1 px-1 text-sm">
          <span className="mr-auto font-medium"><Rolling text={chosen.length} /> selected</span>
          <Tip label="A study task for each, linked to its note">
            <Button variant="ghost" size="sm" onClick={makeEach}>{chosen.length === 1 ? 'Make it a task' : `Make ${num(chosen.length)} tasks`}</Button>
          </Tip>
          {tier === 'nugget' && <Button variant="ghost" size="sm" onClick={() => article(chosen)}>Start a page from {chosen.length === 1 ? 'it' : 'these'}</Button>}
          <Tip label={`Move to the Bin, where ${chosen.length === 1 ? 'it' : 'they'} can come back  ⌫`}>
            <Button variant="ghost" size="sm" aria-label="Move to the Bin" onClick={() => toBin(chosen)}><Trash className="size-3.5" /> Bin</Button>
          </Tip>
          {!allPicked && <Tip label="Every one on show  ⌘A"><Button variant="ghost" size="sm" onClick={selectAll}>Select all</Button></Tip>}
          <Tip label="Clear the selection  Esc"><Button variant="ghost" size="icon-sm" aria-label="Clear the selection" onClick={() => (chime('off'), setChosen([]))}><X className="size-3.5" /></Button></Tip>
        </div>
      )}
      {tier !== 'question' && <div className="px-1 pb-3 empty:hidden">{chips}</div>}
      {items.length ? (
        <NoteList
          groups={groups.map(([name, list]) => [name, list.map((item) => (tier === 'question' ? questionEntry(item, false, questionItems(item)) : withThought(itemEntry(item, menuFor(item)))))] as [string, Entry[]])}
          density={tier === 'question' ? 'list' : density}
          table="nuggets"
          cursor={cursor}
          onCursor={setCursor}
          selected={open}
          chosen={chosen}
          onPick={(id) => onOpen(tier, id)}
          picking={picking}
          // A thought without opening it: on hover, beside the row, and written under it in place.
          after={tier === 'question' ? undefined : (entry) => (
            <>
              {glossing === entry.id && <GlossLine id={entry.id} open onDone={() => setGlossing(null)} className="px-2 pt-0.5 pb-1" />}
            </>
          )}
        />
      ) : unloaded(all) ? null : !all.length ? (
        // Nothing kept yet: the tab as it will look, with a few made-up ones.
        <Example compact tryIt={tier === 'nugget' ? 'pick a note in your Inbox list and press P. It lands here, ready to come back to you.' : tier === 'question' ? 'press H on a note in your Inbox. It is held here, gathering clues.' : 'press “New page” above, or start one from a gem.'}>
          <NoteList groups={[['', (tier === 'nugget' ? exampleIdeas() : tier === 'question' ? exampleQuestions().filter((one) => !one.closedAt) : exampleWriting()).map((one) => (tier === 'question' ? questionEntry(one) : itemEntry(one)))]]}
            density={tier === 'question' ? 'list' : density} table="nuggets" cursor={-1} onPick={() => undefined} />
        </Example>
      ) : (
        <Empty compact title={tier === 'nugget' ? 'No gems yet' : tier === 'question' ? 'No questions yet' : 'No pages yet'}>
          {tier === 'nugget' ? 'Keep one from your Inbox with P and it lands here, to come back to you.' : tier === 'question' ? 'For what you keep thinking about and cannot answer yet. Press H on a note in your Inbox to make it a question.' : 'Your own words on one idea. Start one with “New page”, or from one of your gems.'}
        </Empty>
      )}
    </div>
  )
}
