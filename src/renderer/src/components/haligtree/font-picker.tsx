import { useRef, useState } from 'react'
import { Type } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { NOTE_FONTS, familyOf, systemFonts } from '@/lib/editor-setup'
import { chime } from '@/lib/sound'
import { haligtree } from '@/lib/haligtree'
import { Rolling } from './ui'
import { ChevronDown } from '@/components/ui/icons'

/**
 * The font notes are written in: ours first, then every family on this Mac,
 * each shown in itself. The Mac's list is asked for the first time the button
 * is reached, since reading every font is not free.
 */
export function FontPicker({ value, setting = 'noteFont', same }: {
  value: string
  /** Which setting it changes: the text's font or the headings'. */
  setting?: 'noteFont' | 'headingFont'
  /** Offered first for headings: no font of their own, the text's instead. */
  same?: string
}): React.JSX.Element {
  const [mac, setMac] = useState<string[] | null>(null)
  // Asked for as the pointer or the keys reach the button, so the list is whole when it opens, the picked one in it.
  const asked = useRef(false)
  const ask = (): void => void (asked.current || ((asked.current = true), systemFonts().then(setMac)))
  const name = same && (!value || value === 'same') ? same : (NOTE_FONTS.find((one) => one.id === value)?.label ?? value)
  return (
    <DropdownMenu modal={false} onOpenChange={(open) => open && ask()}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="max-w-48" onPointerEnter={ask} onFocus={ask} style={{ fontFamily: same && (!value || value === 'same') ? undefined : familyOf(value) }}>
          <span className="truncate"><Rolling text={name} /></span> <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuRadioGroup value={value || 'same'} onValueChange={(font) => {
          chime('settled')
          void haligtree.setSettings({ [setting]: font })
        }}>
          {same && (
            <>
              <DropdownMenuRadioItem value="same"><Type aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />{same}</DropdownMenuRadioItem>
              <DropdownMenuSeparator />
            </>
          )}
          {NOTE_FONTS.map((one) => (
            <DropdownMenuRadioItem key={one.id} value={one.id} style={{ fontFamily: familyOf(one.id) }}><Type aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />{one.label}</DropdownMenuRadioItem>
          ))}
          {!!mac?.length && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-meta text-muted-foreground">On this Mac</DropdownMenuLabel>
              {mac.map((family) => (
                <DropdownMenuRadioItem key={family} value={family} style={{ fontFamily: `"${family}"` }}><Type aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />{family}</DropdownMenuRadioItem>
              ))}
            </>
          )}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
