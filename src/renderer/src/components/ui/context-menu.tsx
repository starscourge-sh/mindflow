import * as React from "react"
import { quietClose } from "@/lib/quiet-focus"
import { cn } from "@/lib/cn"
import { chime } from "@/lib/sound"
import { blinkThen } from "./menu-blink"

// Unfolding makes its own small sound, once, when the panel appears: the
// wrapper is mounted with every row that has a menu, the panel only on open.
// Closing is silent, like putting a thing down. It opens at once and only
// fades going away: a menu is used all day, so it never makes you wait.
const openCue = (node: HTMLElement | null): void => void (node && chime("open"))
import { ContextMenu as ContextMenuPrimitive } from "radix-ui"
import { ChevronRightIcon, CheckIcon } from "lucide-react"

function ContextMenu({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Root>) {
  return <ContextMenuPrimitive.Root data-slot="context-menu" {...props} />
}

function ContextMenuTrigger({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Trigger>) {
  return (
    <ContextMenuPrimitive.Trigger
      data-slot="context-menu-trigger"
      className={cn("select-none", className)}
      {...props}
    />
  )
}

function ContextMenuGroup({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Group>) {
  return (
    <ContextMenuPrimitive.Group data-slot="context-menu-group" {...props} />
  )
}

function ContextMenuPortal({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Portal>) {
  return (
    <ContextMenuPrimitive.Portal data-slot="context-menu-portal" {...props} />
  )
}

function ContextMenuSub({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Sub>) {
  return <ContextMenuPrimitive.Sub data-slot="context-menu-sub" {...props} />
}

function ContextMenuRadioGroup({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.RadioGroup>) {
  return (
    <ContextMenuPrimitive.RadioGroup
      data-slot="context-menu-radio-group"
      {...props}
    />
  )
}

function ContextMenuContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left"
}) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content
        ref={openCue}
        data-slot="context-menu-content"
        // Kept clear of the window's edges, never touching them, and never
        // taller than most of the window: a long menu scrolls instead.
        collisionPadding={12}
        className={cn("z-50 flex max-h-[min(var(--radix-context-menu-content-available-height),80vh)] min-w-32 origin-(--radix-context-menu-content-transform-origin) flex-col overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-(--mf-panel-shadow) ring-1 ring-foreground/10 duration-150 data-closed:animate-out data-closed:fade-out-0", className )}
        {...props}
        onCloseAutoFocus={quietClose(props.onCloseAutoFocus)}
      >
        <MenuScroll>{children}</MenuScroll>
      </ContextMenuPrimitive.Content>
    </ContextMenuPrimitive.Portal>
  )
}

/**
 * The rows scroll inside the panel, not the panel itself, so the fade that
 * says there is more (mf-more) dims the rows while the panel's edge and
 * shadow stay whole. The scroll padding keeps a row reached by the arrows
 * clear of that fade.
 */
export const MenuScroll = ({ children }: { children: React.ReactNode }): React.JSX.Element => (
  <div className="mf-more min-h-0 scroll-py-8 overflow-x-hidden overflow-y-auto overscroll-contain p-1">{children}</div>
)

function ContextMenuItem({
  className,
  inset,
  variant = "default",
  onSelect,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Item> & {
  inset?: boolean
  variant?: "default" | "destructive"
}) {
  return (
    <ContextMenuPrimitive.Item
      data-slot="context-menu-item"
      data-inset={inset}
      data-variant={variant}
      onSelect={blinkThen(onSelect)}
      className={cn(
        "group/context-menu-item relative flex min-h-7 cursor-default items-center gap-2 rounded-md px-2 py-1 text-control outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-7.5 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5 data-[variant=destructive]:*:[svg]:text-destructive",
        className
      )}
      {...props}
    />
  )
}

function ContextMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubTrigger> & {
  inset?: boolean
}) {
  return (
    <ContextMenuPrimitive.SubTrigger
      data-slot="context-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        "flex min-h-7 cursor-default items-center gap-2 rounded-md px-2 py-1 text-control outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-7.5 data-open:bg-accent data-open:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        className
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto" />
    </ContextMenuPrimitive.SubTrigger>
  )
}

function ContextMenuSubContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubContent>) {
  // In a portal, so the menu's own clipping never cuts it off.
  return (
    <ContextMenuPrimitive.Portal>
    <ContextMenuPrimitive.SubContent
      collisionPadding={12}
      data-slot="context-menu-sub-content"
      className={cn("z-50 flex max-h-[min(var(--radix-context-menu-content-available-height),80vh)] min-w-32 origin-(--radix-context-menu-content-transform-origin) flex-col overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-(--mf-panel-shadow) ring-1 ring-foreground/10 duration-150 data-closed:animate-out data-closed:fade-out-0", className )}
      {...props}
    >
      <MenuScroll>{children}</MenuScroll>
    </ContextMenuPrimitive.SubContent>
    </ContextMenuPrimitive.Portal>
  )
}

function ContextMenuCheckboxItem({
  className,
  children,
  checked,
  inset,
  onCheckedChange,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.CheckboxItem> & {
  inset?: boolean
}) {
  return (
    <ContextMenuPrimitive.CheckboxItem
      data-slot="context-menu-checkbox-item"
      data-inset={inset}
      className={cn(
        "relative flex min-h-7 cursor-default items-center gap-2 rounded-md py-1.5 pr-8 pl-2 text-control outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-7.5 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
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
    >
      <span className="pointer-events-none absolute right-2 flex items-center justify-center">
        <ContextMenuPrimitive.ItemIndicator>
          <CheckIcon
          />
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </ContextMenuPrimitive.CheckboxItem>
  )
}

function ContextMenuRadioItem({
  className,
  children,
  inset,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.RadioItem> & {
  inset?: boolean
}) {
  return (
    <ContextMenuPrimitive.RadioItem
      data-slot="context-menu-radio-item"
      data-inset={inset}
      className={cn(
        "relative flex min-h-7 cursor-default items-center gap-2 rounded-md py-1.5 pr-8 pl-2 text-control outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-7.5 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        className
      )}
      {...props}
    >
      <span className="pointer-events-none absolute right-2 flex items-center justify-center">
        <ContextMenuPrimitive.ItemIndicator>
          <CheckIcon
          />
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </ContextMenuPrimitive.RadioItem>
  )
}

function ContextMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Label> & {
  inset?: boolean
}) {
  return (
    <ContextMenuPrimitive.Label
      data-slot="context-menu-label"
      data-inset={inset}
      className={cn(
        "px-2 py-1.5 text-xs text-muted-foreground data-inset:pl-7.5",
        className
      )}
      {...props}
    />
  )
}

function ContextMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Separator>) {
  return (
    <ContextMenuPrimitive.Separator
      data-slot="context-menu-separator"
      className={cn("-mx-1 my-1 h-px bg-border/50", className)}
      {...props}
    />
  )
}

function ContextMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="context-menu-shortcut"
      className={cn(
        "ml-auto text-key tracking-widest text-muted-foreground group-focus/context-menu-item:text-accent-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuRadioItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuGroup,
  ContextMenuPortal,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuRadioGroup,
}
