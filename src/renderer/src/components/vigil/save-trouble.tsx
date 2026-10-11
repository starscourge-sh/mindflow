import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'

import { AliveIcon } from '@/components/ui/alive-icon'
import CheckedIcon from '@/components/ui/checked-icon'
import { EASE, shift, spring } from '@/lib/motion'
import { useSaveTrouble, type SaveTrouble } from '@/lib/save-trouble'
import { chime } from '@/lib/sound'
import { beam } from './beam'
import { Orb } from './orb'

/**
 * The one line that says your words have not reached the database yet: up
 * for as long as a save keeps failing, with the reason when there is one
 * worth saying, turning into "Saved" once the retry lands, then gone. Calm
 * on purpose: the words are safe in the editor, and Vigil keeps trying.
 */
export function SaveTroubleLine(): React.JSX.Element {
  const trouble = useSaveTrouble()
  // Heard once as it starts and once as it ends, never on each retry.
  const was = useRef<SaveTrouble>(null)
  useEffect(() => {
    const before = was.current?.state
    was.current = trouble
    if (trouble?.state === 'failing' && before !== 'failing') {
      chime('nope')
      beam('warning')
    }
    if (trouble?.state === 'saved' && before === 'failing') {
      chime('noted')
      beam('success')
    }
  }, [trouble])
  return (
    <AnimatePresence initial={false}>
      {trouble && (
        <motion.div
          key="save-trouble"
          layout
          role="status"
          aria-live="polite"
          data-save-trouble={trouble.state}
          initial={{ opacity: 0, transform: shift('translateY(8px)') }}
          animate={{ opacity: 1, transform: shift('translateY(0px)') }}
          exit={{ opacity: 0, transform: shift('translateY(8px)'), transition: { duration: 0.16, ease: EASE } }}
          transition={{ ...spring.slow, layout: spring.moderate }}
          className="pointer-events-auto mx-4 flex max-w-[min(34rem,calc(100%-2rem))] min-w-0 items-start gap-2.5 rounded-md border border-border bg-popover py-2 pr-4 pl-2.5 text-sm shadow-(--mf-panel-shadow)"
        >
          <motion.span layout="position" className="mt-px flex size-5 shrink-0 items-center justify-center">
            {trouble.state === 'failing' ? <Orb state="working" /> : <AliveIcon play icon={CheckedIcon} size={16} className="text-[var(--tt-color-text-green)]" />}
          </motion.span>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={trouble.state === 'failing' ? `failing-${trouble.reason}` : 'saved'}
              layout="position"
              initial={{ opacity: 0, filter: 'blur(2px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, filter: 'blur(2px)', transition: { duration: 0.1 } }}
              transition={{ duration: 0.2, ease: EASE }}
              className="min-w-0 text-pretty"
            >
              {trouble.state === 'failing' ? (
                <>
                  <b className="font-semibold">Not saved yet.</b> Your last words are safe here, and Vigil keeps trying.
                  {trouble.reason && <span className="mt-0.5 block font-medium text-[var(--tt-color-text-orange)]">{trouble.reason}</span>}
                </>
              ) : (
                <><b className="font-semibold">Saved.</b> Everything you wrote is in.</>
              )}
            </motion.span>
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
