import { askRename, openSource } from '@/lib/sources'
import type { CSSProperties, ReactElement } from 'react'

import { hueOf, initials, pasteAvatar, pickAvatar, setAvatar, useAvatar } from '@/lib/people'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuTrigger } from '@/components/ui/context-menu'
import { toast } from './ui'
import { SHAPES, TINTS } from './coolshapes'
import './box-extras.css'

/** One number for a name, always the same: which shape, and which two tints. */
const hashOf = (name: string): number => {
  let hash = 2166136261
  for (const char of name.toLowerCase()) hash = Math.imul(hash ^ char.codePointAt(0)!, 16777619) >>> 0
  return hash
}

/**
 * A person's face, small, wherever their name is: the picture you gave them,
 * or else their initials over a shape from Coolshapes picked by their name,
 * so the same name always wears the same one. The shape is filled with two of
 * the theme's tag tints, soft enough that the letters read in every theme.
 * With “Avatars” set to “Initials” (the root's data-avatars), the initials sit
 * in a soft round tint instead.
 */
export function Avatar({ name, size = 16, className = '', look }: { name: string; size?: number; className?: string; /** Settings' sample: this look whatever the setting says. */ look?: 'shapes' | 'initials' }): React.JSX.Element | null {
  const avatar = useAvatar(name)
  const trimmed = name.trim()
  if (!trimmed) return null
  const hash = hashOf(trimmed)
  const shape = hash % SHAPES.length
  const from = (hash >>> 4) % TINTS.length
  const to = (from + 1 + ((hash >>> 9) % (TINTS.length - 1))) % TINTS.length
  const style = { '--mf-avatar-size': `${size}px`, '--mf-avatar-hue': hueOf(trimmed), '--mf-shape-from': `var(--tt-color-text-${TINTS[from]})`, '--mf-shape-to': `var(--tt-color-text-${TINTS[to]})` } as CSSProperties
  const id = `mf-shape-${hash.toString(36)}`
  return (
    <span aria-hidden data-avatar={avatar ? 'picture' : 'initials'} data-avatar-shape={avatar ? undefined : shape} data-look={look} className={`mf-avatar ${className}`} style={style}>
      {avatar ? <img src={avatar} alt="" draggable={false} /> : (
        <>
          <svg viewBox="0 0 200 200" className="mf-avatar-shape" aria-hidden>
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" style={{ stopColor: 'var(--mf-shape-a)' }} />
                <stop offset="1" style={{ stopColor: 'var(--mf-shape-b)' }} />
              </linearGradient>
            </defs>
            <path d={SHAPES[shape]} fill={`url(#${id})`} />
          </svg>
          <span>{initials(trimmed)}</span>
        </>
      )}
    </span>
  )
}

/**
 * What a right click on a person offers: a picture from a file or the
 * clipboard, or none. Always the same wrapper, so a field inside it keeps its
 * caret as the first letter of a name arrives; with no name it does nothing.
 */
export function PersonMenu({ name, children }: { name: string; children: ReactElement }): React.JSX.Element {
  const avatar = useAvatar(name)
  const who = name.trim()
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild disabled={!who}>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuLabel className="flex items-center gap-2"><Avatar name={who} size={18} /><span className="truncate">{who}</span></ContextMenuLabel>
        <ContextMenuItem onSelect={() => openSource('attribution', who)}>Open {who}’s page</ContextMenuItem>
        <ContextMenuItem data-person-rename onSelect={() => askRename('attribution', who)}>Rename…</ContextMenuItem>
        <ContextMenuItem onSelect={() => void pickAvatar(who)}>{avatar ? 'Change the picture…' : 'Add a picture…'}</ContextMenuItem>
        <ContextMenuItem onSelect={() => void pasteAvatar(who).then((done) => done || toast('No picture on the clipboard', undefined, 'info'))}>Paste a picture</ContextMenuItem>
        {avatar && <ContextMenuItem variant="destructive" onSelect={() => void setAvatar(who, null)}>Remove the picture</ContextMenuItem>}
      </ContextMenuContent>
    </ContextMenu>
  )
}
