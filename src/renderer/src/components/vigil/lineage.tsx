import { useEffect, useState } from 'react'
import { FileText, Gem, Inbox, ListTodo, Orbit } from 'lucide-react'

import { vigil } from '@/lib/vigil'
import { Island, Prop } from './ui'

const ICON = { capture: Inbox, nugget: Gem, article: FileText, task: ListTodo, question: Orbit }

/**
 * Where a thing came from, what it became, and what links to it. A promoted
 * capture stays as it was written, so its words before the nugget was edited
 * are always one click away, and the nugget one click back.
 */
export function Lineage({ id, onOpen }: { id: string; onOpen?: (type: string, id: string) => void }): React.JSX.Element | null {
  // Read when it opens and when you come back to the window, not on every
  // save: links change rarely, and each read scans every body for them.
  const [lineage, setLineage] = useState<Awaited<ReturnType<typeof vigil.lineage>> | null>(null)
  useEffect(() => {
    const load = (): void => void vigil.lineage(id).then(setLineage)
    load()
    // Again once things settle after a change (a capture lifted out of this
    // one, say), but not on every keystroke of an autosave.
    let timer: ReturnType<typeof setTimeout> | undefined
    // Its own autosaves change what it links to, never what links to it.
    const stop = window.api.captures.onChange((what) => {
      if (what?.every((one) => one.id === id)) return
      clearTimeout(timer)
      timer = setTimeout(load, 1500)
    })
    window.addEventListener('focus', load)
    return () => {
      clearTimeout(timer)
      stop()
      window.removeEventListener('focus', load)
    }
  }, [id])
  if (!lineage) return null
  const groups = [['Came from', lineage.from], ['Became', lineage.became], ['Linked from', lineage.linked]] as const
  return (
    <>
      {groups.map(([label, list]) =>
        list.length ? (
          <Island compact key={label} title={label}>
            {list.map((one) => (
              <Prop key={one.id} secret={!!one.private} icon={ICON[one.type as keyof typeof ICON] ?? Inbox} onClick={onOpen && (() => onOpen(one.type, one.id))}>
                {one.title || 'Untitled'}
              </Prop>
            ))}
          </Island>
        ) : null
      )}
    </>
  )
}
