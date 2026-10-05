import { useState } from 'react'
import { ChevronDown, Minus, Plus } from 'lucide-react'

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
import { NOTE_FONTS, TEXT_SIZES, systemFonts } from '@/lib/editor-setup'
import { chime, step } from '@/lib/sound'
import { vigil } from '@/lib/vigil'
import { Kbd, Rolling } from './ui'

const familyOf = (font: string): string => NOTE_FONTS.find((one) => one.id === font)?.family || (font === 'default' ? '"Fraunces Variable", Georgia, serif' : `"${font}"`)

/**
 * The font notes are written in: ours first, then every family on this Mac,
 * each shown in itself. The Mac's list is asked for the first time the menu
 * opens, since reading every font is not free.
 */
export function FontPicker({ value }: { value: string }): React.JSX.Element {
  const [mac, setMac] = useState<string[] | null>(null)
  const name = NOTE_FONTS.find((one) => one.id === value)?.label ?? value
  return (
    <DropdownMenu modal={false} onOpenChange={(open) => void (open && mac === null && systemFonts().then(setMac))}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="max-w-48" style={{ fontFamily: familyOf(value) }}>
          <span className="truncate"><Rolling text={name} /></span> <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 w-56 overflow-y-auto">
        <DropdownMenuRadioGroup value={value} onValueChange={(noteFont) => {
          chime('settled')
          void vigil.setSettings({ noteFont })
        }}>
          {NOTE_FONTS.map((one) => (
            <DropdownMenuRadioItem key={one.id} value={one.id} style={{ fontFamily: familyOf(one.id) }}>{one.label}</DropdownMenuRadioItem>
          ))}
          {!!mac?.length && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-meta text-muted-foreground">On this Mac</DropdownMenuLabel>
              {mac.map((family) => (
                <DropdownMenuRadioItem key={family} value={family} style={{ fontFamily: `"${family}"` }}>{family}</DropdownMenuRadioItem>
              ))}
            </>
          )}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Smaller, the size now, bigger: the same steps ⌘− and ⌘+ take. */
export function TextSize({ value }: { value: number }): React.JSX.Element {
  const at = TEXT_SIZES.reduce((best, size, index) => (Math.abs(size - value) < Math.abs(TEXT_SIZES[best] - value) ? index : best), 0)
  const go = (to: number): void => {
    step(to)
    void vigil.setSettings({ textSize: TEXT_SIZES[to] })
  }
  return (
    <>
      <Kbd>⌘−</Kbd>
      <Button variant="ghost" size="icon-sm" aria-label="Smaller text" disabled={at <= 0} onClick={() => go(at - 1)}><Minus /></Button>
      <span className="w-10 text-center tabular-nums"><Rolling text={`${Math.round(value * 100)}%`} /></span>
      <Button variant="ghost" size="icon-sm" aria-label="Bigger text" disabled={at >= TEXT_SIZES.length - 1} onClick={() => go(at + 1)}><Plus /></Button>
      <Kbd>⌘+</Kbd>
    </>
  )
}
