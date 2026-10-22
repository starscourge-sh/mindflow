import { CAPTURE_TYPES } from '../capture-kinds/capture-kind-picker'
import { useLive } from '@/lib/haligtree'
import { usage, WAY_NAMES, type Usage, type Via } from '@/lib/usage'
import { SECTIONS } from './places'
import { Count } from './ui'
import { N, Section } from './stats-view'
import { num } from '../../../../main/dates'

// The pages that are not in the sidebar, named as the top bar names them.
const OTHER_PAGES: Record<string, string> = { settings: 'Settings', whatsnew: "What's new", practices: 'Practices', yearpage: 'Year', source: 'A source' }
const pageName = (id: string): string =>
  SECTIONS.find((one) => one.id === id)?.label ?? CAPTURE_TYPES.find((one) => `kind:${one.id}` === id)?.label ?? OTHER_PAGES[id] ?? id
const share = (n: number, total: number): string => (total ? `${Math.round((n / total) * 100)}%` : '0%')

/** One row: the name, a bar for its share, the count and the share in percent. */
function Row({ name, n, total, most }: { name: string; n: number; total: number; most: number }): React.JSX.Element {
  return (
    <div data-usage-row={name} className="flex items-center gap-3 text-sm">
      <span className="w-52 shrink-0 truncate text-foreground">{name}</span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-border/60">
        <span className="block h-full rounded-full bg-muted-foreground/45" style={{ width: most ? `${(n / most) * 100}%` : 0 }} />
      </span>
      <span className="min-w-10 shrink-0 text-right font-semibold text-foreground"><Count n={n} /></span>
      <span className="w-10 shrink-0 text-right tabular-nums">{share(n, total)}</span>
    </div>
  )
}

/**
 * Which pages you open and how you find things again, the last 30 days,
 * counted on this Mac only (main/usage.ts). Every sidebar page is listed,
 * even at zero, so a page you never open says so plainly.
 */
export function UsageSections(): React.JSX.Element {
  const counts = useLive(usage, null as Usage | null)
  const pages = counts?.pages ?? []
  const ways = counts?.ways ?? []
  const pageRows = [...SECTIONS.map(({ id }) => id), ...pages.map(({ what }) => what).filter((id) => !SECTIONS.some((one) => one.id === id))]
    .map((id) => ({ id, name: pageName(id), n: pages.find((one) => one.what === id)?.n ?? 0 }))
    .sort((a, b) => b.n - a.n)
  const wayRows = (Object.keys(WAY_NAMES) as Via[]).map((way) => ({ way, n: ways.find((one) => one.what === way)?.n ?? 0 })).filter((row) => row.n > 0 || row.way !== 'other').sort((a, b) => b.n - a.n)
  const opened = pageRows.reduce((sum, row) => sum + row.n, 0)
  const found = wayRows.reduce((sum, row) => sum + row.n, 0)
  const never = pageRows.filter((row) => row.n === 0 && SECTIONS.some((one) => one.id === row.id)).length
  return (
    <>
      <Section title="Pages you open most" big={{ value: num(opened), label: opened === 1 ? 'page opened in the last 30 days' : 'pages opened in the last 30 days' }}>
        <p>
          Each time you went to a page, counted on this Mac only and never sent anywhere.{' '}
          {never ? <><N>{never}</N> of the <N>{SECTIONS.length}</N> sidebar pages were not opened at all.</> : 'Every sidebar page was opened at least once.'}
        </p>
        <div className="space-y-2">
          {pageRows.map((row) => <Row key={row.id} name={row.name} n={row.n} total={opened} most={pageRows[0]?.n ?? 0} />)}
        </div>
      </Section>
      <Section title="How you find things" big={{ value: num(found), label: found === 1 ? 'thing found again in the last 30 days' : 'things found again in the last 30 days' }}>
        <p>How you got to each page or note you opened: a page, or another note on the one you were on.</p>
        <div className="space-y-2">
          {wayRows.map((row) => <Row key={row.way} name={WAY_NAMES[row.way]} n={row.n} total={found} most={wayRows[0]?.n ?? 0} />)}
        </div>
      </Section>
    </>
  )
}
