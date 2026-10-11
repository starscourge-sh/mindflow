import type { ReactNode } from 'react'
import { Archive, Bell, BookOpen, FileText, Flag, Gem, GripVertical, Hash, Lock, Repeat, Search, Sparkles, Trash2 } from 'lucide-react'
import { CAPTURE_TYPES } from '@/components/capture-kinds/capture-kind-picker'
import { exampleCard, exampleGoals, exampleIdeas, exampleInbox, exampleMonth, exampleQuestions, exampleTags, exampleTasks, exampleWriting } from '@/lib/examples'
import { MCard, MChip, MLabel, MLines, MRow, MTitle, Peek, tinted } from './peek'

/**
 * What each sidebar row's preview shows: a small picture of the page with
 * made-up rows from lib/examples.ts, and one line on what the page is for,
 * its name first. Kinds are `kind:quote` and so on, as the sidebar names them.
 */
export type PagePeek = { text: string; art: () => ReactNode }

const kindOf = (id: string): (typeof CAPTURE_TYPES)[number] => CAPTURE_TYPES.find((type) => type.id === id) ?? CAPTURE_TYPES[0]
const Capture = ({ kind, children, meta }: { kind: string; children: ReactNode; meta?: ReactNode }): React.JSX.Element => {
  const type = kindOf(kind)
  return <MRow icon={type.icon} tint={type.tint} meta={meta}>{children}</MRow>
}
const days = (at: string | null): number => (at ? Math.round((new Date(`${at.slice(0, 10)}T12:00`).getTime() - Date.now()) / 86_400_000) : 0)

const tasks = (): ReturnType<typeof exampleTasks> => exampleTasks()
const ideas = (): ReturnType<typeof exampleIdeas> => exampleIdeas()

/** Today's tasks, the way the Today page lists them. */
function TaskRows({ ids, metas }: { ids: number[]; metas: string[] }): React.JSX.Element {
  const all = tasks()
  return <>{ids.map((id, n) => {
    const task = all[id - 1]
    const tint = task.priority === 1 ? 'red' : task.priority === 2 ? 'orange' : task.priority === 3 ? 'blue' : 'gray'
    return <MRow key={id} check tint={tint} meta={metas[n]}>{task.title.replace(/\s#\w+/g, '')}</MRow>
  })}</>
}

/** Two rows of one kind, for the Types entries. */
const KIND_ROWS: Record<string, [string, string?][]> = {
  note: [['Frankenstein began as a ghost story, one wet summer by Lake Geneva'], ['Yoda never explains the Force. The best teachers show, then stop'], ['The Rosetta Stone holds one decree in three scripts']],
  todo: [['Return Frankenstein to the library', 'Today'], ['Book seats for Hamlet at the Globe', 'Fri'], ['Learn the Litany Against Fear by heart']],
  quote: [['It is a truth universally acknowledged…', 'Jane Austen'], ['To be, or not to be, that is the question', 'Shakespeare'], ['Fear is the mind-killer', 'Frank Herbert']],
  word: [['Soliloquy: speaking your thoughts aloud, alone'], ['Hubris: pride that invites a fall'], ['Palimpsest: a page written over, the old words showing']],
  link: [['The Rosetta Stone, found in 1799', 'britishmuseum.org'], ['How Mary Shelley wrote Frankenstein', 'bl.uk'], ['A map of Arrakis', 'dune.fandom.com']],
  decision: [['Read Dune before the film', 'Check in 2 weeks'], ['Mornings for writing, evenings for reading', 'Check Sun']],
  experiment: [["Hermione's method: read before the lecture", '9 days left'], ['No phone before 9', 'Ends Fri']]
}

const PEEKS: Record<string, PagePeek> = {
  home: {
    text: "**Home: what's coming back to you today.** Under it, shelves of what you kept.",
    art: () => (<>
      <MTitle>Good morning</MTitle>
      <MCard className="mb-2"><div className="mb-0.5 text-[9px] text-muted-foreground">Coming back today</div><div className="truncate font-medium">{ideas()[2].title}</div></MCard>
      <div className="grid grid-cols-3 gap-1.5">
        {[['Gems', 'pink', '18'], ['Questions', 'gray', '4'], ['Writing', 'brown', '3']].map(([name, tint, count]) => (
          <MCard key={name} className="px-1.5 py-1"><div className="text-[9.5px] font-medium" style={tinted(tint)}>{name}</div><div className="text-[13px] font-semibold tabular-nums">{count}</div></MCard>
        ))}
      </div>
    </>)
  },
  inbox: {
    text: '**Inbox: everything you catch lands here first.** Tidy it once a day: keep it, act on it, or let it go.',
    art: () => (<>
      <MTitle count={7}>Inbox</MTitle>
      {exampleInbox().slice(0, 5).map((one) => <Capture key={one.id} kind={one.kind}>{one.label.replace(/\s#\w+/g, '')}</Capture>)}
    </>)
  },
  review: {
    text: '**Review: cards come back just before you would forget them.** Turn one over, then say how well you knew it.',
    art: () => (<>
      <MTitle count="9 due">Review</MTitle>
      <MCard className="mb-1.5">
        <div className="font-medium">{exampleCard.prompt}</div>
        <div className="my-1 border-t border-dashed border-foreground/15" />
        <div className="line-clamp-2 text-muted-foreground">{exampleCard.answer}</div>
      </MCard>
      <div className="grid grid-cols-4 gap-1">
        {[['Again', 'red'], ['Hard', 'orange'], ['Good', 'green'], ['Easy', 'blue']].map(([word, tint], n) => (
          <span key={word} className="flex items-center justify-center gap-1 rounded border border-foreground/10 py-0.5 text-[9px]"><span style={tinted(tint)}>{n + 1}</span>{word}</span>
        ))}
      </div>
    </>)
  },
  day: {
    text: "**Today's page: one page for the day.** Write a line; what you caught, finished and reviewed gathers underneath.",
    art: () => (<>
      <MTitle>Saturday, 10 October</MTitle>
      <p className="mb-1 font-serif text-[11px]">Finished Frankenstein on the train. The creature is the one who reads Milton.</p>
      <MLabel>Caught</MLabel>
      <Capture kind="quote">It is a truth universally acknowledged…</Capture>
      <Capture kind="word">Soliloquy</Capture>
      <MLabel>Done</MLabel>
      <MRow check="done" tint="green" struck>Call Mum about Sunday lunch</MRow>
    </>)
  },
  weekpage: {
    text: "**Week's page: one page a week.** What matters this week, and how it went.",
    art: () => (<>
      <MTitle count="5 to 11 Oct">Week 41</MTitle>
      <MLabel>What matters</MLabel>
      <p className="font-serif text-[11px]">Finish the Frankenstein essay. Read Act 3 before Thursday.</p>
      <MLabel>How it went</MLabel>
      <p className="font-serif text-[11px] text-muted-foreground">Slow start, strong finish. The essay found its ending.</p>
      <div className="mt-1.5 flex gap-1">{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, n) => <span key={n} className={`grid size-4 place-items-center rounded text-[8px] ${n < 5 ? 'bg-foreground/10' : 'border border-foreground/10'}`}>{day}</span>)}</div>
    </>)
  },
  monthpage: {
    text: "**Month's page: one page a month.** What to aim for, and a name for it looking back.",
    art: () => (<>
      <MTitle>October</MTitle>
      <MLabel>This month was</MLabel>
      <p className="font-serif text-[11.5px] italic">{exampleMonth.season}</p>
      <MLabel>Aiming for</MLabel>
      <p className="font-serif text-[11px]">{exampleMonth.focus}</p>
    </>)
  },
  today: {
    text: "**Today: the tasks for today.** Type one the way you would say it, like 'call Mum friday 6pm'.",
    art: () => (<>
      <MTitle count={3}>Today</MTitle>
      <div className="mb-1.5 rounded border border-foreground/10 px-1.5 py-0.5 text-muted-foreground">Call Mum <span className="rounded bg-[color-mix(in_oklab,var(--tt-color-text-blue)_16%,transparent)] px-0.5" style={tinted('blue')}>friday 6pm</span></div>
      <TaskRows ids={[1, 2, 3]} metas={['Yesterday', '18:00', '1 of 3']} />
    </>)
  },
  week: {
    text: "**This week's tasks: the next seven days, side by side.** Drag a task to another day to move it.",
    art: () => (
      <div className="grid grid-cols-3 gap-1.5">
        {[['Today', [2, 3]], ['Mon', [4, 9]], ['Tue', [5]]].map(([day, ids]) => (
          <div key={day as string} className="min-w-0">
            <div className="mb-1 text-[10px] font-semibold">{day as string}</div>
            {(ids as number[]).map((id) => <MCard key={id} className="mb-1 px-1.5 py-1 text-[9.5px] leading-tight"><span className="line-clamp-2">{tasks()[id - 1].title.replace(/\s#\w+/g, '')}</span></MCard>)}
          </div>
        ))}
      </div>
    )
  },
  upcoming: {
    text: '**Upcoming: every task after today, day by day.** Then the ones with no date at all.',
    art: () => (<>
      <MTitle>Upcoming</MTitle>
      <MLabel>Tomorrow</MLabel>
      <TaskRows ids={[8]} metas={['every 3 days']} />
      <MLabel>Monday</MLabel>
      <TaskRows ids={[4, 9]} metas={['12:00', '19:00']} />
      <MLabel>No date</MLabel>
      <TaskRows ids={[6]} metas={['']} />
    </>)
  },
  matrix: {
    text: '**Matrix: your tasks by urgent and important.** Drag one to another square to change it.',
    art: () => (
      <div className="grid h-full grid-cols-2 grid-rows-2 gap-1">
        {[['Do first', 'red', 1], ['Plan', 'blue', 14], ['Hand off', 'orange', 2], ['Later', 'gray', 6]].map(([name, tint, id]) => (
          <div key={name as string} className="rounded-md border border-foreground/10 p-1" style={{ backgroundColor: `color-mix(in oklab, var(--tt-color-text-${tint}) 7%, transparent)` }}>
            <div className="mb-0.5 text-[9px] font-semibold" style={tinted(tint as string)}>{name as string}</div>
            <div className="line-clamp-2 text-[9.5px] leading-tight">{tasks()[(id as number) - 1].title}</div>
          </div>
        ))}
      </div>
    )
  },
  routines: {
    text: "**Routines: what you do again and again.** Type 'every week' as you write a task, and it comes round.",
    art: () => (<>
      <MTitle count={3}>Routines</MTitle>
      {[[8, 'Every 3 days'], [9, 'Every Monday'], [10, 'Every Friday']].map(([id, when]) => (
        <MRow key={id} icon={Repeat} tint="yellow" meta={when}>{tasks()[(id as number) - 1].title}</MRow>
      ))}
    </>)
  },
  later: {
    text: "**Later: tasks with no day yet.** Say 'this month', 'this year' or 'someday' as you type, and it waits here.",
    art: () => (<>
      <MTitle>Later</MTitle>
      <MLabel>This month</MLabel><TaskRows ids={[11]} metas={['']} />
      <MLabel>This year</MLabel><TaskRows ids={[12]} metas={['']} />
      <MLabel>Someday</MLabel><TaskRows ids={[13]} metas={['']} />
    </>)
  },
  nuggets: {
    // One gem, read top to bottom as a story: your words, the question Review
    // asks you about them, and when it comes back. Nothing to decode.
    text: '**Gems: the ideas you want to keep, in your own words.** Give one a question, and Review asks it just before you would forget.',
    art: () => (<>
      <MTitle count={18}>Gems</MTitle>
      <MCard className="flex flex-col gap-1">
        <div className="flex items-start gap-1.5">
          <Gem className="mt-[2px] size-3 shrink-0" style={tinted('pink')} strokeWidth={2.2} />
          <span className="line-clamp-2 font-serif text-[11px] leading-snug">Soliloquy: a speech made alone, so we hear what a character really thinks.</span>
        </div>
        <div className="border-t border-dashed border-foreground/15" />
        <div className="flex items-baseline gap-1.5">
          <span className="shrink-0 text-[9px] font-semibold" style={tinted('purple')}>Review asks</span>
          <span className="min-w-0 truncate font-medium">What is a soliloquy?</span>
        </div>
        <div className="flex items-center gap-1.5 text-[9.5px] text-muted-foreground">
          <MChip tint="blue">Back in 3 days</MChip>
          <span>then less often, as it sticks</span>
        </div>
      </MCard>
      <MRow icon={Gem} tint="pink" meta="no question: a hint">Fear is the mind-killer</MRow>
    </>)
  },
  articles: {
    text: '**Writing: your long-form pieces.** Each one starts from a few gems and grows in your own words.',
    art: () => (<>
      <MTitle count={3}>Writing</MTitle>
      {exampleWriting().map((one) => <MRow key={one.id} icon={FileText} tint="brown" meta={one.attribution ?? ''}>{one.title}</MRow>)}
      <MCard className="mt-2"><div className="mb-1 font-serif text-[11.5px] font-semibold">Why Hamlet waits</div><MLines widths={[95, 88, 70]} /></MCard>
    </>)
  },
  questions: {
    text: "**Questions: things you're still working out, with clues.** Add a clue as it turns up; nothing needs settling.",
    art: () => (<>
      <MTitle count={4}>Questions</MTitle>
      {exampleQuestions().slice(0, 4).map((one) => <MRow key={one.id} icon={Search} tint="gray" meta={one.clues ? `${one.clues} clue${one.clues === 1 ? '' : 's'}` : 'new'}>{one.title}</MRow>)}
    </>)
  },
  goals: {
    text: "**Goals: a day you're aiming for, and the road there.** Log what you did, and the days count down.",
    art: () => (<>
      <MTitle count={3}>Goals</MTitle>
      {exampleGoals().slice(0, 3).map((one) => {
        const total = Math.max(1, days(one.goalAt) - days(one.goalFrom))
        const gone = Math.min(1, Math.max(0, -days(one.goalFrom) / total))
        return (
          <div key={one.id} className="mb-1.5">
            <div className="flex items-center gap-1.5"><Flag className="size-3 shrink-0" style={tinted('orange')} /><span className="min-w-0 flex-1 truncate">{one.title}</span><span className="text-[9.5px] text-muted-foreground">in {days(one.goalAt)} days</span></div>
            <div className="mt-0.5 ml-[18px] h-1 overflow-hidden rounded-full bg-foreground/10"><div className="h-full rounded-full" style={{ width: `${gone * 100}%`, backgroundColor: 'var(--tt-color-text-orange)' }} /></div>
          </div>
        )
      })}
    </>)
  },
  queue: {
    text: '**Queue: what you mean to read or watch next, in order.** Drag a link or a note onto it to add it.',
    art: () => (<>
      <MTitle count={4}>Queue</MTitle>
      {[['The Rosetta Stone, found in 1799', 'Website', '6 min'], ['Dune, chapter 1', 'Book', '40 min'], ['Hamlet at the Globe', 'Video', '2 h'], ['How Mary Shelley wrote Frankenstein', 'Website', '9 min']].map(([title, medium, time], n) => (
        <div key={title} className="flex items-center gap-1.5 border-b border-foreground/[0.06] py-[3px] last:border-b-0">
          <GripVertical className="size-3 text-muted-foreground/60" />
          <span className="w-2.5 text-[9.5px] text-muted-foreground tabular-nums">{n + 1}</span>
          <span className="min-w-0 flex-1 truncate">{title}</span>
          <span className="text-[9.5px] text-muted-foreground">{medium}, {time}</span>
        </div>
      ))}
    </>)
  },
  tags: {
    text: '**Tags: every #tag has its own page.** Give one a colour, or a date to be ready by.',
    art: () => (<>
      <MTitle count={7}>Tags</MTitle>
      <div className="flex flex-wrap gap-1">
        {exampleTags().map((one) => <MChip key={one.tag} tint={one.color ?? 'gray'} className="text-[10px]"><Hash className="size-2.5" />{one.tag}<span className="ml-0.5 opacity-70">{one.count}</span></MChip>)}
      </div>
      <MCard className="mt-2"><div className="mb-0.5 font-medium" style={tinted('brown')}>#book</div><MLines widths={[90, 72]} /></MCard>
    </>)
  },
  stats: {
    text: "**Stats: how you've been using Vigil, in sentences.** Your month and your year, played back.",
    art: () => (<>
      <MTitle>Stats</MTitle>
      <div className="flex items-baseline gap-1.5"><span className="text-[22px] leading-none font-semibold tabular-nums">23</span><span className="text-muted-foreground">things captured this week, 4 more than last</span></div>
      <div className="mt-2 flex h-12 items-end gap-[3px]">
        {[2, 4, 3, 6, 5, 7, 3, 2, 5, 8, 6, 4, 7, 9].map((height, n) => <span key={n} className="flex-1 rounded-sm" style={{ height: `${height * 10}%`, backgroundColor: `color-mix(in oklab, var(--tt-color-text-blue) ${n === 13 ? 90 : 45}%, transparent)` }} />)}
      </div>
      <div className="mt-1 text-[9.5px] text-muted-foreground">You remember 86% of what comes back.</div>
    </>)
  },
  map: {
    text: '**Map: every note you linked, as dots joined by lines.** Type @ in a note to link it.',
    art: () => {
      const dots: [number, number, string, number, string?][] = [[40, 40, 'brown', 9, 'Austen'], [92, 22, 'pink', 6], [78, 70, 'brown', 6], [150, 48, 'purple', 9, 'Hamlet'], [200, 24, 'purple', 5], [196, 82, 'gray', 5], [118, 100, 'orange', 7, 'Dune'], [60, 104, 'pink', 5], [168, 112, 'blue', 5]]
      const links = [[0, 1], [0, 2], [1, 2], [1, 3], [3, 4], [3, 5], [2, 6], [6, 7], [6, 8], [5, 8]]
      return (
        <svg viewBox="0 0 240 124" className="h-full w-full">
          {links.map(([a, b]) => <line key={`${a}-${b}`} x1={dots[a][0]} y1={dots[a][1]} x2={dots[b][0]} y2={dots[b][1]} stroke="currentColor" strokeOpacity={0.18} strokeWidth={1.2} />)}
          {dots.map(([x, y, tint, r, name], n) => (
            <g key={n}>
              <circle cx={x} cy={y} r={r} fill={`var(--tt-color-text-${tint})`} fillOpacity={0.85} stroke="var(--background)" strokeWidth={1.5} />
              {name && <text x={x} y={y + r + 9} textAnchor="middle" fontSize={9} fill="currentColor" fillOpacity={0.75}>{name}</text>}
            </g>
          ))}
        </svg>
      )
    }
  },
  all: {
    text: '**All captures: everything you ever caught, in one list.** Open, dealt with and let go alike.',
    art: () => (<>
      <MTitle count={65}>All captures</MTitle>
      {exampleInbox().slice(1, 6).map((one, n) => <Capture key={one.id} kind={one.kind} meta={['Open', 'Kept', 'Done', 'Open', 'Kept'][n]}>{one.label}</Capture>)}
    </>)
  },
  discarded: {
    text: '**Bin: everything you let go.** Still here if you want one back.',
    art: () => (<>
      <MTitle count={3}>Bin</MTitle>
      {[["A long black coat, like Neo's?", '2 h ago'], ['Rename the cat Mr Darcy?', 'Yesterday'], ['Ten facts about sandworms', 'Mon']].map(([title, when]) => <MRow key={title} icon={Trash2} meta={when} faded struck>{title}</MRow>)}
    </>)
  },
  archived: {
    text: '**Archived: out of sight, never let go.** Bring one back any time.',
    art: () => (<>
      <MTitle count={2}>Archived</MTitle>
      <MRow icon={Archive} meta="Spring">Reading notes from the Hamlet course</MRow>
      <MRow icon={Archive} meta="Last year">To be, or not to be, that is the question</MRow>
    </>)
  },
  powers: {
    text: '**What Vigil can do: every quiet power, a card each.** Try one right there on its card.',
    art: () => (
      <div className="grid grid-cols-2 gap-1.5">
        {[[Sparkles, 'green', 'Hints', 'An old gem, as you write'], [Lock, 'purple', 'Private', 'Blurred until you look'], [Bell, 'orange', 'Reminders', "'in 2 hours' just works"], [BookOpen, 'blue', 'Reader', 'Read a link without the clutter']].map(([Icon, tint, name, line]) => {
          const Drawn = Icon as typeof Sparkles
          return <MCard key={name as string} className="px-1.5 py-1"><Drawn className="mb-0.5 size-3.5" style={tinted(tint as string)} /><div className="text-[10px] font-semibold">{name as string}</div><div className="text-[9px] leading-tight text-muted-foreground">{line as string}</div></MCard>
        })}
      </div>
    )
  }
}

for (const type of CAPTURE_TYPES) {
  const plural = type.id === 'todo' ? 'Todos' : `${type.label}s`
  PEEKS[`kind:${type.id}`] = {
    text: `**${plural}: ${type.does.charAt(0).toLowerCase()}${type.does.slice(1)}.** Every one you caught, wherever it went.`,
    art: () => (<>
      <MTitle count={KIND_ROWS[type.id].length}>{plural}</MTitle>
      {KIND_ROWS[type.id].map(([title, meta]) => type.id === 'todo'
        ? <MRow key={title} check tint="orange" meta={meta}>{title}</MRow>
        : <Capture key={title} kind={type.id} meta={meta}>{title}</Capture>)}
    </>)
  }
}


/** A sidebar row with its page's preview, and its keys folded into it. */
export function SidePeek({ id, keys, children }: { id: string; keys?: string; children: React.ReactElement }): React.JSX.Element {
  const peek = PEEKS[id]
  return peek ? <Peek art={peek.art} text={peek.text} keys={keys}>{children}</Peek> : children
}
