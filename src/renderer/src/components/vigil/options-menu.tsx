import { useState, type ComponentProps } from 'react'
import { chime, soundOn, step } from '@/lib/sound'
import { AliveIcon } from '@/components/ui/alive-icon'
import DotsHorizontalIcon from '@/components/ui/dots-horizontal-icon'

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
import { keyFor } from '@/lib/keys'

/** One setting the box can have switched on or off. */
export type Option = { label: string; /** What it means, as a tip on the line: the label stays a short name. */ hint?: string; on: boolean; keys?: string; set: (on: boolean) => void; icon?: ComponentProps<typeof AliveIcon>['icon'] }
/** Something to do rather than switch: a new box, a bigger window. */
export type Action = { label: string; hint?: string; keys?: string; run: () => void }
/**
 * One labelled part of a menu. 'sounds' and 'theme' are the app's own
 * switches, drawn where they stand in the list. Defined once, so the gear
 * menu and a right click on the note show the same items in the same words.
 */
export type Section = { label?: string; items: (Option | Action | More | 'sounds' | 'theme')[] }
/** Rarely changed items folded into one line that opens to the side, so the menu fits a short window. */
export type More = { label: string; more: (Option | Action)[] }

/** Closed, the keys go back to the writing, not to the button. */
const backToWriting = (event: Event): void => {
  event.preventDefault()
  document.querySelector<HTMLElement>('.tiptap.ProseMirror')?.focus()
}

/** Sounds on or off: set first, so turning sound on is heard and turning it off is not. */
function SoundsItem(): React.JSX.Element | null {
  const settings = useLive(vigil.settings, null as Settings | null)
  if (!settings) return null
  return (
    <DropdownMenuCheckboxItem checked={settings.sounds} onCheckedChange={(sounds) => {
      soundOn(sounds)
      void vigil.setSettings({ sounds })
    }} onSelect={(event) => event.preventDefault()}>
      Sounds
    </DropdownMenuCheckboxItem>
  )
}

/** Each theme is worn as you pass it, against your own note; leaving without picking puts back the one that was on. */
function ThemeItem(): React.JSX.Element {
  // Mounted as the menu opens, so it starts from the theme on now.
  const [theme, setTheme] = useState<Theme>(currentTheme())
  return (
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
  )
}

/** A line with more to say than its short name: the rest as a tip, to its right. */
const Hinted = ({ hint, children }: { hint?: string; children: React.ReactElement<{ 'aria-label'?: string; children?: React.ReactNode }> }): React.JSX.Element => (hint ? <Tip label={hint} side="right">{children}</Tip> : children)

/** One switch or action, as every part of the menu draws it, its hint as a tip. */
function Item({ one }: { one: Option | Action }): React.JSX.Element {
  return 'on' in one ? (
    <Hinted hint={one.hint}>
    <DropdownMenuCheckboxItem checked={one.on} onCheckedChange={one.set} onSelect={(event) => event.preventDefault()}>
      {/* Its own drawing in the menu's one icon place, at the line's start, as every menu has it. */}
      {one.icon && <AliveIcon key={String(one.on)} icon={one.icon} size={14} className="text-muted-foreground" />}
      {one.label}
      {one.keys && keyFor(one.keys) && <DropdownMenuShortcut>{keyFor(one.keys)}</DropdownMenuShortcut>}
    </DropdownMenuCheckboxItem>
    </Hinted>
  ) : (
    // Room on the right like the tickable rows, so every shortcut lines up.
    <Hinted hint={one.hint}>
    <DropdownMenuItem onSelect={one.run} className="pr-8">
      {one.label}
      {one.keys && keyFor(one.keys) && <DropdownMenuShortcut>{keyFor(one.keys)}</DropdownMenuShortcut>}
    </DropdownMenuItem>
    </Hinted>
  )
}

/** The sections, each under its heading, a rule between them. */
export function MenuSections({ sections }: { sections: Section[] }): React.JSX.Element {
  const shown = sections.filter((one) => one.items.length > 0)
  return (
    <>
      {shown.map((section, at) => (
        <div key={section.label ?? at} role="group" aria-label={section.label}>
          {at > 0 && <DropdownMenuSeparator />}
          {section.label && <DropdownMenuLabel className="pt-2 pb-1 text-meta font-medium">{section.label}</DropdownMenuLabel>}
          {section.items.map((one) =>
            one === 'sounds' ? <SoundsItem key="sounds" />
            : one === 'theme' ? <ThemeItem key="theme" />
            : 'more' in one ? (
              // How many are switched on, said beside it, so a change made in there is not out of sight.
              <DropdownMenuSub key={one.label}>
                <DropdownMenuSubTrigger>{one.label}{one.more.some((item) => 'on' in item && item.on) && <span className="flex-1 text-right text-muted-foreground">{one.more.filter((item) => 'on' in item && item.on).length} on</span>}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-72 text-control">
                  {one.more.map((item) => <Item key={item.label} one={item} />)}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )
            : <Item key={one.label} one={one} />
          )}
        </div>
      ))}
    </>
  )
}

/**
 * Everything about the box that is not the writing, behind one button: what
 * matters first (the words, their kind, Create) stays in view, the rest is a
 * click or its own key away. Each switch keeps its shortcut, shown here.
 */
export function OptionsMenu({ sections, options = [], actions = [], app = false, label = 'Options', icon = <AliveIcon icon={DotsHorizontalIcon} size={16} />, side = 'top', align = 'start', className = '' }: {
  /** The menu in labelled parts; or, for a short one, options then actions. */
  sections?: Section[]
  options?: Option[]
  actions?: Action[]
  /** The app's own settings (sounds, theme), not the note's. */
  app?: boolean
  label?: string
  icon?: React.ReactNode
  side?: 'top' | 'bottom'
  align?: 'start' | 'end'
  className?: string
}): React.JSX.Element {
  const parts = sections ?? [{ items: [...options, ...(app ? (['sounds', 'theme'] as const) : [])] }, { items: actions }]
  return (
    <DropdownMenu modal={false}>
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
      <DropdownMenuContent align={align} side={side} className="w-64 text-control" onCloseAutoFocus={backToWriting}>
        <MenuSections sections={parts} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The same sections, opened where the pointer is: a right click on the note. */
export function PointMenu({ at, onClose, sections }: { at: { x: number; y: number } | null; onClose: () => void; sections: Section[] }): React.JSX.Element {
  return (
    <DropdownMenu modal={false} open={!!at} onOpenChange={(open) => void (!open && onClose())}>
      <DropdownMenuTrigger asChild>
        <span aria-hidden className="pointer-events-none fixed size-0" style={{ left: at?.x ?? 0, top: at?.y ?? 0 }} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="bottom" sideOffset={0} className="w-64 text-control" onCloseAutoFocus={backToWriting}>
        <MenuSections sections={sections} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
