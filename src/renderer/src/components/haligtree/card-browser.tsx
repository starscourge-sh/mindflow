import { useMemo, useState } from 'react'
import { chime } from '@/lib/sound'
import { call, haligtree, useLive } from '@/lib/haligtree'
import { num } from '../../../../main/dates'
import { Chips } from './display'
import { ListSearch } from './note-list'
import { usePickMixed } from './pick-mixed'
import { RowMenu } from './row-menu'
import { WithPictures } from './with-pictures'
import { PasteCards } from './paste-cards'
import { Empty, toast } from './ui'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

/** One card as the browser lists it (haligtree.ts `cards:all`). */
export type BrowsedCard = { id: string; prompt: string; title: string; answer: string; tags: string[]; dueAt: string | null; createdAt: string; paused: boolean; difficulty: number | null; reviews: number }

type Sort = 'due' | 'added' | 'hard'
const SORTS: { id: Sort; label: string }[] = [
  { id: 'due', label: 'Due soonest' },
  { id: 'added', label: 'Newest' },
  { id: 'hard', label: 'Hardest' }
]
const ORDER: Record<Sort, (a: BrowsedCard, b: BrowsedCard) => number> = {
  due: (a, b) => (a.dueAt ?? '9').localeCompare(b.dueAt ?? '9'),
  added: (a, b) => b.createdAt.localeCompare(a.createdAt),
  hard: (a, b) => (b.difficulty ?? -1) - (a.difficulty ?? -1)
}

/** When it is next asked, in words: "due now", "in 3 days", "new". */
function dueSaid(card: BrowsedCard): string {
  if (card.paused) return 'paused'
  if (!card.dueAt) return 'new'
  const days = Math.round((Date.parse(card.dueAt) - Date.now()) / 86400000)
  return days <= 0 ? 'due now' : days === 1 ? 'tomorrow' : `in ${num(days)} days`
}

/** A tag, and the tags under it: #biology takes in #biology-cells. */
const under = (tags: string[], tag: string): boolean => tags.some((one) => one === tag || one.startsWith(`${tag}-`))

/**
 * Every card in one list: found by words, narrowed to a tag (and the tags under
 * it), sorted by when it is due, when it was made, or how hard it has been. A
 * row opens to edit its question in place; picked rows (⇧-click, x, ⌘A) are
 * paused, tagged or untagged together, or sent to the Bin with ⌫, each with Undo.
 */
export function CardBrowser({ onOpen, pasting: pastingFirst = false }: { onOpen: (type: string, id: string) => void; /** Open with "Paste cards" out (⌘K). */ pasting?: boolean }): React.JSX.Element {
  const [pasting, setPasting] = useState(pastingFirst)
  const cards = useLive(() => call<BrowsedCard[]>('cards:all'), null as BrowsedCard[] | null, [], ['item'])
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const [sort, setSort] = useState<Sort>('due')
  const [editing, setEditing] = useState<string | null>(null)
  const [tagging, setTagging] = useState('')
  // The tags on cards, the most used first: the top ones as chips.
  const tags = useMemo(() => {
    const count = new Map<string, number>()
    for (const card of cards ?? []) for (const one of card.tags) count.set(one, (count.get(one) ?? 0) + 1)
    return [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12).map(([one]) => one)
  }, [cards])
  const words = query.trim().toLowerCase()
  const shown = (cards ?? [])
    .filter((card) => !tag || under(card.tags, tag))
    .filter((card) => !words || `${card.prompt} ${card.answer} ${card.tags.map((one) => `#${one}`).join(' ')}`.toLowerCase().includes(words))
    .sort(ORDER[sort])
  const several = usePickMixed(shown.map((card) => ({ type: 'nugget', id: card.id, title: card.prompt })))
  const picked = shown.filter((card) => several.picked({ type: 'nugget', id: card.id }))
  const pause = (ids: string[], on: boolean): void => void call('cards:pause', ids, on).then(() => {
    chime(on ? 'shelve' : 'unshelve')
    toast(`${on ? 'Paused' : 'Back in Review'}: ${num(ids.length)} ${ids.length === 1 ? 'card' : 'cards'}`, () => void call('cards:pause', ids, !on).then(() => chime('undo')))
  })
  const retag = (ids: string[], on: boolean): void => {
    const word = tagging.trim().replace(/^#/, '').toLowerCase()
    if (!word) return
    void call<{ id: string; body: string | null }[]>('cards:retag', ids, word, on).then((before) => {
      chime(on ? 'noted' : 'fold')
      setTagging('')
      toast(`#${word} ${on ? 'on' : 'off'} ${num(before.length)} ${before.length === 1 ? 'card' : 'cards'}`, () => void call('cards:retag:undo', before).then(() => chime('undo')))
    })
  }
  if (!cards) return <div />
  const paste = pasting ? <PasteCards onClose={() => (chime('fold'), setPasting(false))} /> : null
  if (!cards.length)
    return (
      <div className="flex flex-col gap-3 px-5 pt-5 pb-10">
        {paste ?? <Empty title="No cards yet" action={<Button size="sm" data-paste-open onClick={() => (chime('open'), setPasting(true))}>Paste cards</Button>}>Paste a list of cards, write the question a gem answers under “Review”, or import an Anki deck from File › Import.</Empty>}
      </div>
    )
  return (
    <div data-card-browser className="flex flex-col gap-3 px-5 pt-5 pb-10">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-56 flex-1"><ListSearch value={query} onChange={setQuery} onDone={() => {}} placeholder="Search cards" /></div>
        <Chips options={SORTS} on={(id) => id === sort} pick={(id) => setSort(id as Sort)} />
        <Button variant="ghost" size="sm" data-paste-open aria-expanded={pasting} onClick={() => (chime(pasting ? 'fold' : 'open'), setPasting(!pasting))}>Paste cards</Button>
      </div>
      {paste}
      <Chips options={[{ id: '', label: `All ${num(cards.length)}` }, ...tags.map((one) => ({ id: one, label: `#${one}` }))]} on={(id) => (tag ?? '') === id} pick={(id) => setTag(id || null)} />
      {several.count > 0 && (
        <div data-card-picked className="flex flex-wrap items-center gap-2 rounded-lg border bg-accent/30 px-3 py-2 text-sm">
          <span className="font-medium">{num(several.count)} picked</span>
          <Button variant="ghost" size="sm" data-cards-pause onClick={() => pause(picked.map((one) => one.id), !picked.every((one) => one.paused))}>
            {picked.every((one) => one.paused) ? 'Bring back' : 'Pause'}
          </Button>
          <Input value={tagging} onChange={(event) => setTagging(event.target.value)} placeholder="#tag" className="h-7 w-32 text-sm"
            onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), retag(picked.map((one) => one.id), true))} />
          <Button variant="ghost" size="sm" data-cards-tag onClick={() => retag(picked.map((one) => one.id), true)}>Add tag</Button>
          <Button variant="ghost" size="sm" data-cards-untag onClick={() => retag(picked.map((one) => one.id), false)}>Take tag off</Button>
          <span className="flex-1" />
          <span className="text-xs text-muted-foreground">⌫ to the Bin, Esc to let go</span>
        </div>
      )}
      {several.bar}
      <p className="text-xs text-muted-foreground">{num(shown.length)} of {num(cards.length)} cards</p>
      <ul className="flex flex-col">
        {shown.map((card) => {
          const on = several.picked({ type: 'nugget', id: card.id })
          return (
            <li key={card.id} data-card-row={card.id}>
              <RowMenu items={several.menu({ type: 'nugget', id: card.id }) ?? [
                { label: 'Edit the question', run: () => setEditing(card.id) },
                { label: 'Open the gem', run: () => onOpen('nugget', card.id) },
                { label: card.paused ? 'Bring back' : 'Pause', run: () => pause([card.id], !card.paused) },
                ...several.rowItems({ type: 'nugget', id: card.id })
              ]}>
                <div role="button" tabIndex={0} aria-selected={on}
                  onClick={(event) => several.click(event, { type: 'nugget', id: card.id }) || (chime('tap'), setEditing(editing === card.id ? null : card.id))}
                  className={`grid cursor-pointer grid-cols-[1fr_9rem] gap-x-4 gap-y-0.5 rounded-md px-3 py-2 transition-colors hover:bg-accent/50 ${on ? 'bg-accent' : ''} ${card.paused ? 'opacity-60' : ''}`}>
                  {editing === card.id ? (
                    <Input autoFocus defaultValue={card.prompt} data-card-edit onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') return (event.stopPropagation(), setEditing(null))
                        if (event.key !== 'Enter') return
                        event.preventDefault()
                        const prompt = event.currentTarget.value.trim()
                        if (prompt && prompt !== card.prompt) void haligtree.saveItem(card.id, { prompt }).then(() => (chime('noted'), toast('Question rewritten', () => void haligtree.saveItem(card.id, { prompt: card.prompt }).then(() => chime('undo')))))
                        setEditing(null)
                      }}
                      onBlur={() => setEditing(null)} className="h-8 text-sm" />
                  ) : (
                    <span className="min-w-0 truncate text-sm font-medium"><WithPictures text={card.prompt.replace(/!\[[^\]]*\]\([^)]*\)/g, '').trim() || card.prompt} small /></span>
                  )}
                  <span className={`text-right text-xs tabular-nums ${dueSaid(card) === 'due now' ? 'text-foreground' : 'text-muted-foreground'}`}>{dueSaid(card)}</span>
                  <span className="min-w-0 truncate text-xs text-muted-foreground">{card.answer || 'No answer yet'}</span>
                  <span className="truncate text-right text-xs text-muted-foreground">{card.tags.slice(0, 2).map((one) => `#${one}`).join(' ')}</span>
                </div>
              </RowMenu>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
