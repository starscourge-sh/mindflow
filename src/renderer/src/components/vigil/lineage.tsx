import { Fragment } from 'react'
import { FileText, Gem, Inbox } from 'lucide-react'

import { useLive, vigil } from '@/lib/vigil'
import { Prop, PropLabel } from './ui'

const ICON = { capture: Inbox, nugget: Gem, article: FileText }

/**
 * Where a thing came from, what it became, and what links to it. A promoted
 * capture stays as it was written, so its words before the nugget was edited
 * are always one click away, and the nugget one click back.
 */
export function Lineage({ id, onOpen }: { id: string; onOpen?: (type: string, id: string) => void }): React.JSX.Element | null {
  const lineage = useLive(() => vigil.lineage(id), null, [id])
  if (!lineage) return null
  const groups = [['Came from', lineage.from], ['Became', lineage.became], ['Linked from', lineage.linked]] as const
  return (
    <>
      {groups.map(([label, list]) =>
        list.length ? (
          <Fragment key={label}>
            <PropLabel>{label}</PropLabel>
            {list.map((one) => (
              <Prop key={one.id} icon={ICON[one.type as keyof typeof ICON] ?? Inbox} onClick={onOpen && (() => onOpen(one.type, one.id))}>
                {one.title || 'Untitled'}
              </Prop>
            ))}
          </Fragment>
        ) : null
      )}
    </>
  )
}
