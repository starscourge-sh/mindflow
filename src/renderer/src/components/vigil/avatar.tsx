import type { CSSProperties, ReactElement } from 'react'

import { hueOf, initials, pasteAvatar, pickAvatar, setAvatar, useAvatar } from '@/lib/people'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuTrigger } from '@/components/ui/context-menu'
import { toast } from './ui'
import './box-extras.css'

/**
 * A person's face, small and round with a hairline ring, wherever their name
 * is: the picture you gave them, or their initials in a soft circle tinted by
 * a colour that is always the same for that name.
 */
export function Avatar({ name, size = 16, className = '' }: { name: string; size?: number; className?: string }): React.JSX.Element | null {
  const avatar = useAvatar(name)
  const trimmed = name.trim()
  if (!trimmed) return null
  const style = { '--mf-avatar-size': `${size}px`, '--mf-avatar-hue': hueOf(trimmed) } as CSSProperties
  return (
    <span aria-hidden data-avatar={avatar ? 'picture' : 'initials'} className={`mf-avatar ${className}`} style={style}>
      {avatar ? <img src={avatar} alt="" draggable={false} /> : <span>{initials(trimmed)}</span>}
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
        <ContextMenuItem onSelect={() => void pickAvatar(who)}>{avatar ? 'Change the picture…' : 'Add a picture…'}</ContextMenuItem>
        <ContextMenuItem onSelect={() => void pasteAvatar(who).then((done) => done || toast('No picture on the clipboard', undefined, 'info'))}>Paste a picture</ContextMenuItem>
        {avatar && <ContextMenuItem variant="destructive" onSelect={() => void setAvatar(who, null)}>Remove the picture</ContextMenuItem>}
      </ContextMenuContent>
    </ContextMenu>
  )
}
