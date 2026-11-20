import { MENU_LINE } from '@/lib/float'
import { useState, type ComponentProps, type ReactNode } from 'react'
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
import { useLive, haligtree, type Settings } from '@/lib/haligtree'
import { MenuRows, Tip } from './ui'
import { cn } from '@/lib/cn'
import { Swatch } from '../theme/theme-picker'
import { keyFor } from '@/lib/keys'
import { MenuGlyph } from '@/components/ui/menu-icon'

/** One setting the box can have switched on or off. */
type Option = { label: string; /** What it means, as a tip on the line: the label stays a short name. */ hint?: string; on: boolean; keys?: string; set: (on: boolean) => void; icon?: ComponentProps<typeof AliveIcon>['icon'] }
/** Something to do rather than switch: a new box, a bigger window. */
export type Action = { label: string; hint?: string; keys?: string; run: () => void }
/**
 * One labelled part of a menu. 'sounds' and 'theme' are the app's own
 * switches, drawn where they stand in the list. Defined once, so the gear
 * menu and a right click on the note show the same items in the same words.
 */
export type Section = { label?: string; items: (Option | Action | More | Field | 'sounds' | 'theme')[] }
/** A control that lives in the menu itself (a number to drag or type), on a row with its name. Its keys stay its own. */
export type Field = { label: string; field: ReactNode }
/** Rarely changed items folded into one line that opens to the side, so the menu fits a short window. */
export type More = { label: string; more: (Option | Action)[] }

/** Closed, the keys go back to the writing, not to the button. */
const backToWriting = (event: Event): void => {
  event.preventDefault()
  document.querySelector<HTMLElement>('.tiptap.ProseMirror')?.focus()
}

/** Sounds on or off: set first, so turning sound on is heard and turning it off is not. */
function SoundsItem(): React.JSX.Element | null {
  const settings = useLive(haligtree.settings, null as Settings | null)
  if (!settings) return null
  return (
    <DropdownMenuCheckboxItem checked={settings.sounds} onCheckedChange={(sounds) => {
      soundOn(sounds)
      void haligtree.setSettings({ sounds })
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

/** A line with more to say than its short name: the rest on a quiet second line under it, never a tip (a menu row shows no floating surface). */
const Named = ({ label, hint }: { label: string; hint?: string }): React.JSX.Element =>
  hint ? <span className="flex min-w-0 flex-col"><span className={MENU_LINE}>{label}</span><span data-menu-hint className="max-w-64 text-xs leading-snug whitespace-normal text-muted-foreground">{hint}</span></span> : <span className={MENU_LINE}>{label}</span>

/** One switch or action, as every part of the menu draws it, its hint under its name. */
function Item({ one }: { one: Option | Action }): React.JSX.Element {
  return 'on' in one ? (
    <DropdownMenuCheckboxItem checked={one.on} onCheckedChange={one.set} onSelect={(event) => event.preventDefault()}>
      {/* Its own drawing in the menu's one icon place, at the line's start, as every menu has it. */}
      {one.icon ? <AliveIcon key={String(one.on)} icon={one.icon} size={14} className="text-muted-foreground" /> : <MenuGlyph label={one.label} small />}
      <Named label={one.label} hint={one.hint} />
      {one.keys && keyFor(one.keys) && <DropdownMenuShortcut>{keyFor(one.keys)}</DropdownMenuShortcut>}
    </DropdownMenuCheckboxItem>
  ) : (
    // Room on the right like the tickable rows, so every shortcut lines up.
    <DropdownMenuItem onSelect={one.run} className="pr-8">
      {/* Every line its drawing in the one icon place, as every menu row has it. */}
      <MenuGlyph label={one.label} small />
      <Named label={one.label} hint={one.hint} />
      {one.keys && keyFor(one.keys) && <DropdownMenuShortcut>{keyFor(one.keys)}</DropdownMenuShortcut>}
    </DropdownMenuItem>
  )
}

/** The sections, each under its heading, a rule between them. */
function MenuSections({ sections }: { sections: Section[] }): React.JSX.Element {
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
            : 'field' in one ? (
              <div key={one.label} data-menu-field className="flex items-center justify-between gap-3 px-2 py-1 text-control" onKeyDown={(event) => event.stopPropagation()}>
                <span>{one.label}</span>{one.field}
              </div>
            )
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
export function OptionsMenu({ sections, options = [], actions = [], app = false, label = 'Options', icon = <AliveIcon icon={DotsHorizontalIcon} size={16} />, side = 'top', align = 'start', className = '', tip = true, heading }: {
  /** A line at the menu's top naming what it is for, whole: a deck's full name when its tile cuts it short. */
  heading?: string
  /** False on a thing that is itself a surface (a deck tile): a menu button says what it is by opening, one hover one surface. */
  tip?: boolean
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
    <>
    {/* On a page's line that folds behind ⋯: its rows join that menu, never a menu behind a menu. */}
    <MenuRows group={label}><MenuSections sections={parts} /></MenuRows>
    <DropdownMenu modal={false}>
      <Tip label={tip ? label : ''}>
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
      <DropdownMenuContent align={align} side={side} collisionPadding={12} className="w-64 text-control" onCloseAutoFocus={backToWriting}>
        {heading && <DropdownMenuLabel data-menu-heading className="w-0 min-w-full px-2 pt-2 pb-1 text-control font-semibold whitespace-normal text-foreground hyphens-auto [overflow-wrap:break-word]">{heading}</DropdownMenuLabel>}
        <MenuSections sections={parts} />
      </DropdownMenuContent>
    </DropdownMenu>
    </>
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
