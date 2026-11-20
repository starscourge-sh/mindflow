import { type Item } from '@/lib/haligtree'
import { useItemDisplay } from './items-view'
import { MoreRow, TREE_SHOWN, ThingRow, pagesShown } from './side-folder-section'

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
      {all.length > TREE_SHOWN && <MoreRow data-writing-all="" onClick={onAll}>See all</MoreRow>}
    </>
  )
}
