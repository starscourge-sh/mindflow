import { useEffect, useState } from 'react'
import { MindflowEditor } from '@/components/mindflow'

/**
 * One editor built, out of sight, while the window is idle just after it
 * opens, and taken down again. The first note you open then draws as fast as
 * every one after it: the editor's code is warmed up and what it works out
 * once per window (which emoji this screen draws) is already known.
 */
export function WarmEditor(): React.JSX.Element | null {
  const [phase, setPhase] = useState<'wait' | 'on' | 'done'>('wait')
  useEffect(() => {
    if (phase === 'wait') {
      const idle = requestIdleCallback(() => setPhase('on'), { timeout: 4000 })
      return () => cancelIdleCallback(idle)
    }
    if (phase === 'on') {
      const gone = setTimeout(() => setPhase('done'), 0)
      return () => clearTimeout(gone)
    }
    return undefined
  }, [phase])
  if (phase !== 'on') return null
  return (
    <div aria-hidden inert className="pointer-events-none fixed -left-[9999px] top-0 h-40 w-96 opacity-0">
      <MindflowEditor defaultContent={{ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Warm' }] }] }} readOnly toolbar={false} handles={false} slash={false} outline={false} search={false} autofocus={false} />
    </div>
  )
}
