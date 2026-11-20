import { type Item } from '@/lib/haligtree'
import { useItemDisplay } from './items-view'
import { MoreRow, ThingRow } from './side-folder-section'

/** Writing's pages shown under its row in the sidebar. */
const SHOWN = 4

/** Of a list in order, the first few, the open one always among them: past them, it takes the last place, the gap implied. */
export const pagesShown = <T extends { id: string }>(all: T[], lit: string | undefined, n = SHOWN): T[] => {
  const at = lit ? all.findIndex((one) => one.id === lit) : -1
  return at < n ? all.slice(0, n) : [...all.slice(0, n - 1), all[at]]
}

/**
 * Writing's pages, unfolded under its row as a folder's are under it (FolderThings' rows): the first four in Writing's
 * own order (its Display's sort, newest first unless you chose another), the page open now always among them and lit,
 * then "See all", Writing itself.
 */
export function WritingPages({ pages, lit, onOpen, onAll }: { pages: Item[]; lit?: string; onOpen: (type: string, id: string) => void; onAll: () => void }): React.JSX.Element {
  const { groups } = useItemDisplay('article', pages, true)
  const all = groups.flatMap(([, list]) => list)
  return (
    <>
      {pagesShown(all, lit).map((one) => <ThingRow key={one.id} thing={{ type: 'article', id: one.id, title: one.title }} lit={lit === one.id} onOpen={onOpen} />)}
      {all.length > SHOWN && <MoreRow data-writing-all="" onClick={onAll}>See all</MoreRow>}
    </>
  )
}
