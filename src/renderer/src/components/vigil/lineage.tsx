import { useEffect, useState } from 'react'
import { alive } from '@/components/ui/alive-icon'
import FileDescriptionIcon from '@/components/ui/file-description-icon'
import LibraryIcon from '@/components/ui/library-icon'
import StackIcon from '@/components/ui/stack-icon'
import CheckedIcon from '@/components/ui/checked-icon'
import QuestionMarkIcon from '@/components/ui/question-mark'

import { vigil } from '@/lib/vigil'
import { Island, Prop } from './ui'

// itshover drawings in lucide's place, moving when their control is pointed at.
const FileText = alive(FileDescriptionIcon)
const Gem = alive(LibraryIcon)
const Inbox = alive(StackIcon)
const ListTodo = alive(CheckedIcon)
const Orbit = alive(QuestionMarkIcon)

const ICON = { capture: Inbox, nugget: Gem, article: FileText, task: ListTodo, question: Orbit }
const NAME: Record<string, string> = { capture: 'capture', nugget: 'nugget', article: 'article', task: 'task', question: 'question' }

function useLineage(id: string): Awaited<ReturnType<typeof vigil.lineage>> | null {
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
  return lineage
}

/** What a capture became, said under its status, so the new thing is one click from the old. */
export function Became({ id, onOpen }: { id: string; onOpen?: (type: string, id: string) => void }): React.JSX.Element | null {
  const lineage = useLineage(id)
  if (!lineage) return null
  // Named by what it is: its title is usually this capture's own, so the title alone read as a repeat.
  return <>{lineage.became.map((one) => <Row key={one.id} one={{ ...one, title: `Open the ${NAME[one.type] ?? 'note'}` }} onOpen={onOpen} />)}</>
}

type One = Awaited<ReturnType<typeof vigil.lineage>>['became'][number]
const Row = ({ one, onOpen }: { one: One; onOpen?: (type: string, id: string) => void }): React.JSX.Element => (
  <Prop secret={!!one.private} icon={ICON[one.type as keyof typeof ICON] ?? Inbox} onClick={onOpen && (() => onOpen(one.type, one.id))}>
    {one.title || 'Untitled'}
  </Prop>
)

/**
 * Where a thing came from, what it became, and what links to it. A promoted
 * capture stays as it was written, so its words before the nugget was edited
 * are always one click away, and the nugget one click back.
 */
export function Lineage({ id, onOpen, became = true }: { id: string; onOpen?: (type: string, id: string) => void; became?: boolean }): React.JSX.Element | null {
  const lineage = useLineage(id)
  if (!lineage) return null
  const groups = [['Came from', lineage.from], ['Became', became ? lineage.became : []], ['Linked from', lineage.linked]] as const
  return (
    <>
      {groups.map(([label, list]) =>
        list.length ? (
          <Island compact key={label} title={label}>
            {list.map((one) => <Row key={one.id} one={one} onOpen={onOpen} />)}
          </Island>
        ) : null
      )}
    </>
  )
}
