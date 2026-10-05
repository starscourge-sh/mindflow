import { useLive, vigil, type ItemFull, type TaskFull } from '@/lib/vigil'
import { TaskDetail } from './tasks-view'
import { ItemDetail } from './items-view'

/**
 * A task, nugget or article, open in the prompt itself: the same page the main
 * window shows, so reading or changing one never means switching apps.
 */
export function Reader({ type, id, onOpen, onClose }: {
  type: string
  id: string
  onOpen: (type: string, id: string) => void
  onClose: () => void
}): React.JSX.Element | null {
  const task = useLive(() => (type === 'task' ? vigil.task(id) : Promise.resolve(null)), null as TaskFull | null, [type, id])
  const item = useLive(() => (type === 'task' ? Promise.resolve(null) : vigil.item(id)), null as ItemFull | null, [type, id])
  // Only once the one asked for has loaded: the last one read lingers while
  // the next loads, and showing it under the new key opened the wrong note,
  // with its edits going to the wrong place.
  if (type === 'task') return task?.id === id ? <TaskDetail key={id} task={task} onClose={onClose} onOpen={onOpen} /> : null
  return item?.id === id ? <ItemDetail key={id} item={item} onOpen={onOpen} /> : null
}
