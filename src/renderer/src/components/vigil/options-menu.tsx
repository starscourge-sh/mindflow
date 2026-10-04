import { useState } from 'react'
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
import { THEMES, applyTheme, currentTheme, themeName, type Theme } from '@/lib/theme'
import { useLive, vigil, type Settings } from '@/lib/vigil'
import { Tip } from './ui'
import { Swatch } from '../theme/theme-picker'

/** One setting the box can have switched on or off. */
export type Option = { label: string; on: boolean; keys?: string; set: (on: boolean) => void }

/**
 * Everything about the box that is not the writing, behind one button: what
 * matters first (the words, their kind, Create) stays in view, the rest is a
 * click or its own key away. Each switch keeps its shortcut, shown here.
 */
export function OptionsMenu({ options, actions }: {
  options: Option[]
  /** Things to do rather than switch: a new box, a bigger window. */
  actions: { label: string; keys?: string; run: () => void }[]
}): React.JSX.Element {
  const settings = useLive(vigil.settings, null as Settings | null)
  const [theme, setTheme] = useState<Theme>(currentTheme())
  return (
    <DropdownMenu modal={false}>
      <Tip label="Options">
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label="Options" className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground">
            <Ellipsis className="size-4" />
          </button>
        </DropdownMenuTrigger>
      </Tip>
      <DropdownMenuContent align="start" side="top" className="w-60 text-control">
        {options.map((one) => (
          <DropdownMenuCheckboxItem key={one.label} checked={one.on} onCheckedChange={one.set} onSelect={(event) => event.preventDefault()}>
            {one.label}
            {one.keys && <DropdownMenuShortcut>{one.keys}</DropdownMenuShortcut>}
          </DropdownMenuCheckboxItem>
        ))}
        {settings && (
          <DropdownMenuCheckboxItem checked={settings.sounds} onCheckedChange={(sounds) => void vigil.setSettings({ sounds })} onSelect={(event) => event.preventDefault()}>
            Sounds
          </DropdownMenuCheckboxItem>
        )}
        {/* Each theme is worn as you pass it, against your own note; leaving
            without picking puts back the one that was on. */}
        <DropdownMenuSub onOpenChange={(open) => void (!open && applyTheme(theme, false))}>
          <DropdownMenuSubTrigger>Theme <span className="ml-auto text-muted-foreground">{themeName(theme)}</span></DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="text-control" onPointerLeave={() => applyTheme(theme, false)}>
            <DropdownMenuRadioGroup
              value={theme}
              onValueChange={(next) => {
                applyTheme(next as Theme)
                setTheme(next as Theme)
              }}
            >
              {THEMES.map((one) => (
                <DropdownMenuRadioItem key={one} value={one} className="gap-2" onFocus={() => applyTheme(one, false)}>
                  <Swatch theme={one} />
                  {themeName(one)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {actions.length > 0 && <DropdownMenuSeparator />}
        {actions.map((one) => (
          <DropdownMenuItem key={one.label} onSelect={one.run}>
            {one.label}
            {one.keys && <DropdownMenuShortcut>{one.keys}</DropdownMenuShortcut>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
