import * as React from "react"
import { FLOAT } from '@/lib/float'
import { quietClose } from "@/lib/quiet-focus"
import { cn } from "@/lib/cn"
import { chime, openCue } from "@/lib/sound"
import { markKeyed } from "@/lib/motion"
import { blinkThen } from "./menu-blink"
import { MenuScroll } from "./context-menu"
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui"
import { onlyRealMoves } from "@/lib/real-move"
import { withMenuIcon } from "./menu-icon"
import { Check as CheckIcon, ChevronRight as ChevronRightIcon } from '@/components/ui/icons'

/** Clear of the window's edges, and of the title bar at the top, where the window's own buttons sit. */
const MENU_ROOM = { top: 52, right: 12, bottom: 12, left: 12 }

function DropdownMenu({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />
}

function DropdownMenuTrigger({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return (
    <DropdownMenuPrimitive.Trigger
      data-slot="dropdown-menu-trigger"
      {...props}
    />
  )
}

// It grows in from where it was opened in 80ms and fades going away quicker
// still: a menu is used all day, so it never makes you wait.
function DropdownMenuContent({
  className,
  children,
  align = "start",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        ref={openCue}
        data-slot="dropdown-menu-content"
        // Kept clear of the window's edges (sliding off its opening point if it must, so it never
        // covers the window's own buttons), never touching them, and never
        // taller than the room it has: only a menu that cannot fit scrolls.
        collisionPadding={MENU_ROOM}
        sticky="always"
        sideOffset={sideOffset}
        align={align}
        className={cn("z-50 flex max-h-(--radix-dropdown-menu-content-available-height) w-(--radix-dropdown-menu-trigger-width) min-w-32 origin-(--radix-dropdown-menu-content-transform-origin) flex-col overflow-hidden rounded-lg", FLOAT, " data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-60", className , "min-w-fit")}
        {...props}
        onCloseAutoFocus={quietClose(props.onCloseAutoFocus)}
      >
        <MenuScroll>{children}</MenuScroll>
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Portal>
  )
}

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  onSelect,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  inset?: boolean
  variant?: "default" | "destructive"
}) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      onSelect={blinkThen(onSelect)}
      className={cn(
        "group/dropdown-menu-item relative flex min-h-7 whitespace-nowrap cursor-default items-center gap-2 rounded-md px-2 py-1 text-control outline-hidden select-none focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-7.5 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:text-destructive data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5 data-[variant=destructive]:*:[svg]:text-destructive",
        className
      )}
      {...props}
      onPointerMove={onlyRealMoves(props.onPointerMove)}
    >
      {props.asChild ? children : withMenuIcon(children)}
    </DropdownMenuPrimitive.Item>
  )
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  inset,
  onCheckedChange,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem> & {
  inset?: boolean
}) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      data-inset={inset}
      className={cn(
        "relative flex min-h-7 cursor-default items-center gap-2 rounded-md py-1.5 pr-8 pl-2 text-control outline-hidden select-none focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-7.5 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        className
      )}
      checked={checked}
      // A switch sounds its direction: up for on, down for off.
      onCheckedChange={(on) => {
        // The change first, then its sound: turning sound on is then heard.
        onCheckedChange?.(on)
        chime(on ? "on" : "off")
      }}
      {...props}
      onPointerMove={onlyRealMoves(props.onPointerMove)}
    >
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-checkbox-item-indicator"
      >
        <DropdownMenuPrimitive.ItemIndicator>
          <CheckIcon
          />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {withMenuIcon(children)}
    </DropdownMenuPrimitive.CheckboxItem>
  )
}

function DropdownMenuRadioGroup({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>) {
  return (
    <DropdownMenuPrimitive.RadioGroup
      data-slot="dropdown-menu-radio-group"
      {...props}
    />
  )
}

function DropdownMenuRadioItem({
  className,
  children,
  inset,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem> & {
  inset?: boolean
}) {
  return (
    <DropdownMenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      data-inset={inset}
      className={cn(
        "relative flex min-h-7 cursor-default items-center gap-2 rounded-md py-1.5 pr-8 pl-2 text-control outline-hidden select-none focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-7.5 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        className
      )}
      {...props}
      onPointerMove={onlyRealMoves(props.onPointerMove)}
    >
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-radio-item-indicator"
      >
        <DropdownMenuPrimitive.ItemIndicator>
          <CheckIcon
          />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  )
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label> & {
  inset?: boolean
}) {
  return (
    <DropdownMenuPrimitive.Label
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(
        "px-2 py-1.5 text-control text-muted-foreground data-inset:pl-7.5",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("-mx-1 my-1 h-px bg-border/50", className)}
      {...props}
    />
  )
}

function DropdownMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(
        "ml-auto shrink-0 pl-3 whitespace-nowrap text-key tracking-widest text-muted-foreground group-focus/dropdown-menu-item:text-accent-foreground",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuSub({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Sub>) {
  return <DropdownMenuPrimitive.Sub data-slot="dropdown-menu-sub" {...props} />
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger> & {
  inset?: boolean
}) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        "flex min-h-7 cursor-default items-center gap-2 rounded-md px-2 py-1 whitespace-nowrap text-control outline-hidden select-none focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-7.5 data-[state=open]:bg-accent data-[state=open]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        className
      )}
      {...props}
      onPointerMove={onlyRealMoves(props.onPointerMove)}
    >
      {withMenuIcon(children)}
      <ChevronRightIcon className="ml-auto size-3.5 text-muted-foreground" />
    </DropdownMenuPrimitive.SubTrigger>
  )
}

function DropdownMenuSubContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
  // In a portal, like the menu it opens from: inside it, the menu's own
  // clipping cut the submenu off at the menu's edge.
  return (
    <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.SubContent
      ref={markKeyed}
      collisionPadding={MENU_ROOM}
      sticky="always"
      data-slot="dropdown-menu-sub-content"
      className={cn("z-50 flex max-h-(--radix-dropdown-menu-content-available-height) min-w-32 origin-(--radix-dropdown-menu-content-transform-origin) flex-col overflow-hidden rounded-lg", FLOAT, " data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-60", className , "min-w-fit")}
      {...props}
    >
      <MenuScroll>{children}</MenuScroll>
    </DropdownMenuPrimitive.SubContent>
    </DropdownMenuPrimitive.Portal>
  )
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
}
