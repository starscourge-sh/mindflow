import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Tip } from './ui'

/**
 * A ghost: the faint example an empty field shows until it is set, so you can
 * see what it is for before you use it. It is only ever a placeholder or a
 * span, never a value, so it can never be saved. Italic and lighter than any
 * real words, and gone the moment the field takes the caret.
 */
export const GHOST = 'placeholder:italic placeholder:text-muted-foreground/55 focus:placeholder:text-transparent motion-safe:placeholder:transition-colors'

/** Words that are an example, not data: faint and italic. */
export function GhostText({ children, className }: { children: ReactNode; className?: string }): React.JSX.Element {
  return <span data-ghost className={cn('italic text-muted-foreground/55', className)}>{children}</span>
}

/**
 * What an empty field does, in one line on hover, while it is empty. Once it
 * is set the tip goes: the value speaks for itself.
 */
export function Does({ does, set = false, children }: { does?: string; set?: boolean; children: React.ReactElement<{ 'aria-label'?: string; children?: ReactNode }> }): React.JSX.Element {
  if (!does || set) return children
  return <Tip label={does}>{children}</Tip>
}
