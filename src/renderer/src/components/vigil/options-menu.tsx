import { useState } from 'react'
import { chime, soundOn, step } from '@/lib/sound'
import { Ellipsis } from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { allThemes, applyTheme, currentTheme, themeName, type Theme } from '@/lib/theme'
import { useLive, vigil, type Settings } from '@/lib/vigil'
import { Tip } from './ui'
import { cn } from '@/lib/cn'
import { Swatch } from '../theme/theme-picker'

/** One setting the box can have switched on or off. */
export type Option = { label: string; on: boolean; keys?: string; set: (on: boolean) => void }

/**
 * Everything about the box that is not the writing, behind one button: what
 * matters first (the words, their kind, Create) stays in view, the rest is a
 * click or its own key away. Each switch keeps its shortcut, shown here.
 */
export function OptionsMenu({ options, actions, app = false, label = 'Options', icon = <Ellipsis className="size-4" />, side = 'top', align = 'start', className = '' }: {
  options: Option[]
  /** Things to do rather than switch: a new box, a bigger window. */
  actions: { label: string; keys?: string; run: () => void }[]
  /** The app's own settings (sounds, theme), not the note's. */
  app?: boolean
  label?: string
  icon?: React.ReactNode
  side?: 'top' | 'bottom'
  align?: 'start' | 'end'
  className?: string
}): React.JSX.Element {
  const settings = useLive(vigil.settings, null as Settings | null)
  const [theme, setTheme] = useState<Theme>(currentTheme())
  return (
    <DropdownMenu modal={false} onOpenChange={(open) => void (open && setTheme(currentTheme()))}>
      <Tip label={label}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={label}
            // A window control, not part of the note: out of the tab order, and
            // a click on it leaves the caret where it was.
            tabIndex={-1}
            onMouseDown={(event) => event.preventDefault()}
            className={cn('flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground', className)}>
            {icon}
          </button>
        </DropdownMenuTrigger>
      </Tip>
      <DropdownMenuContent
        align={align}
        side={side}
        className="w-60 text-control"
        // Closed, the keys go back to the writing, not to this button.
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          document.querySelector<HTMLElement>('.tiptap.ProseMirror')?.focus()
        }}
      >
        {options.map((one) => (
          <DropdownMenuCheckboxItem key={one.label} checked={one.on} onCheckedChange={one.set} onSelect={(event) => event.preventDefault()}>
            {one.label}
            {one.keys && <DropdownMenuShortcut>{one.keys}</DropdownMenuShortcut>}
          </DropdownMenuCheckboxItem>
        ))}
        {app && settings && (
          <DropdownMenuCheckboxItem checked={settings.sounds} onCheckedChange={(sounds) => {
            // Set first, so turning sound on is heard and turning it off is not.
            soundOn(sounds)
            void vigil.setSettings({ sounds })
          }} onSelect={(event) => event.preventDefault()}>
            Sounds
          </DropdownMenuCheckboxItem>
        )}
        {/* Each theme is worn as you pass it, against your own note; leaving
            without picking puts back the one that was on. */}
        {app && (
        <DropdownMenuSub onOpenChange={(open) => void (!open && applyTheme(theme, false))}>
          <DropdownMenuSubTrigger>Theme <span className="flex-1 text-right text-muted-foreground">{themeName(theme)}</span></DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="text-control" onPointerLeave={() => applyTheme(theme, false)}>
            <DropdownMenuRadioGroup
              value={theme}
              onValueChange={(next) => {
                chime('settled')
                applyTheme(next as Theme)
                setTheme(next as Theme)
              }}
            >
              {allThemes().map((one) => (
                <DropdownMenuRadioItem key={one} value={one} className="gap-2" onFocus={() => {
                  // Each theme has its own note, so passing through them is a scale.
                  step(allThemes().indexOf(one))
                  applyTheme(one, false)
                }}>
                  <Swatch theme={one} />
                  {themeName(one)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        )}
        {actions.length > 0 && <DropdownMenuSeparator />}
        {/* Room on the right like the tickable rows, so every shortcut lines up. */}
        {actions.map((one) => (
          <DropdownMenuItem key={one.label} onSelect={one.run} className="pr-8">
            {one.label}
            {one.keys && <DropdownMenuShortcut>{one.keys}</DropdownMenuShortcut>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
