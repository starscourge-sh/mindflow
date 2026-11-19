import { useLive } from '@/lib/haligtree'
import { useReading } from '@/lib/reads-in'
import { chime } from '@/lib/sound'
import { N, Section } from './stats-view'
import { dayMonth, num, plural } from '../../../../main/dates'

type Read = { href: string; title: string; site: string; words: number; activeMs: number; endAt: string | null; lastAt: string; finished: boolean; minutes: number; needs: number }
type Turned = { href: string; title: string; highlights: number; gems: number; cards: number }
type Reads = { since: string; rows: Read[]; turned: Turned[] }

const open = (href: string): void => (chime('open'), window.api.openInHome('web', href))
/** "3 of 12 min read", or "the end not reached" said with it: why it is not finished, in its own words. */
const whyLeft = (one: Read): string => {
  const time = `${one.minutes < 1 ? 'under a minute' : `${num(one.minutes)} min`} of its ${num(Math.max(1, one.needs))} min read`
  return one.endAt ? `${time}: its end reached, but read too quickly to count` : `${time}, its end not reached`
}

/**
 * Articles read in the reader, told by what really happened (main/read-time.ts): a read is finished only when its
 * end was reached and at least half its reading time was spent on it, counted from the day the counting began
 * (never guessed for the reads before it); the rest are left part way, with a list to pick back up. Then what each
 * read turned into: its highlights, the gems made from it, and the cards among them. `from`: Wrapped's month or year.
 */
export function ReadingSections({ from }: { from?: string }): React.JSX.Element | null {
  const reads = useLive(() => window.api.haligtree('read:stats', from) as Promise<Reads>, null as Reads | null, [from])
  useReading(!reads)
  if (!reads) return null
  const since = dayMonth(reads.since)
  const done = reads.rows.filter((one) => one.finished)
  const left = reads.rows.filter((one) => !one.finished)
  const kept = reads.turned.filter((one) => one.highlights || one.gems || one.cards)
  const sum = (key: 'highlights' | 'gems' | 'cards'): number => kept.reduce((all, one) => all + one[key], 0)
  const rule = <p data-read-rule className="text-meta text-(--mf-muted-strong)">A read counts as finished when you reached its end and spent at least half its reading time on it, counted while the reader was in front and you scrolled, typed or pointed in the last minute. Counted since {since}.</p>
  return (
    <>
      <Section title="Finished or left part way" big={reads.rows.length ? { value: `${num(done.length)} of ${num(reads.rows.length)}`, label: 'articles finished' } : undefined}>
        {reads.rows.length ? (
          <p data-read-said>You finished <N>{plural(done.length, 'article')}</N> of the <N>{num(reads.rows.length)}</N> you opened in the reader, and left <N>{num(left.length)}</N> part way.</p>
        ) : <p data-read-said>Nothing read in the reader since <N>{since}</N>, when this began to be counted. Reads from before then are not guessed at.</p>}
        {rule}
        {left.length > 0 && (
          <div data-pick-up>
            <p className="mb-1 font-semibold text-foreground">Pick back up</p>
            <ul className="flex flex-col">
              {left.slice(0, 8).map((one) => (
                <li key={one.href}>
                  <button type="button" data-pick-up-row onClick={() => open(one.href)} className="flex w-full cursor-pointer flex-col items-start rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/60">
                    <span className="max-w-full truncate text-foreground">{one.title}</span>
                    <span className="text-meta text-muted-foreground">{whyLeft(one)}</span>
                  </button>
                </li>
              ))}
            </ul>
            {left.length > 8 && <p className="text-meta text-muted-foreground">And {plural(left.length - 8, 'more')}.</p>}
          </div>
        )}
      </Section>
      <Section title="What reading turned into" big={kept.length ? { value: num(sum('gems')), label: sum('gems') === 1 ? 'gem from what you read' : 'gems from what you read' } : undefined}>
        {kept.length ? (
          <>
            <p data-turned-said>From <N>{plural(kept.length, 'article')}</N> you kept <N>{plural(sum('highlights'), 'highlight')}</N>, made <N>{plural(sum('gems'), 'gem')}</N>, and <N>{plural(sum('cards'), 'card')}</N> of them Review asks you.</p>
            <ul data-turned className="flex flex-col">
              {kept.slice(0, 8).map((one) => (
                <li key={one.href}>
                  <button type="button" onClick={() => open(one.href)} className="flex w-full cursor-pointer flex-col items-start rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/60">
                    <span className="max-w-full truncate text-foreground">{one.title}</span>
                    <span className="text-meta text-muted-foreground">{[plural(one.highlights, 'highlight'), plural(one.gems, 'gem'), plural(one.cards, 'card')].join(' · ')}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : <p data-turned-said>{reads.rows.length ? 'Nothing kept yet from what you read: no highlight, gem or card.' : `Nothing read in the reader since ${since}, so nothing kept from it yet.`}</p>}
      </Section>
    </>
  )
}
