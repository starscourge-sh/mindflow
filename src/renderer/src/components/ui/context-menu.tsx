import * as React from "react"
import { FLOAT } from '@/lib/float'
import { quietClose } from "@/lib/quiet-focus"
import { cn } from "@/lib/cn"
import { openCue } from "@/lib/sound"
import { blinkThen } from "./menu-blink"
import { byKeys, markKeyed } from "@/lib/motion"
import { Highlight, spotOf, type Spot } from "@/components/vigil/glide"
import { ContextMenu as ContextMenuPrimitive } from "radix-ui"
import { onlyRealMoves } from "@/lib/real-move"
import { withMenuIcon } from "./menu-icon"
import { ChevronRightIcon } from '@/components/ui/icons'

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

function ContextMenuSub({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Sub>) {
  return <ContextMenuPrimitive.Sub data-slot="context-menu-sub" {...props} />
}

// It grows in from where it was opened in 80ms and fades going away quicker
// still: a menu is used all day, so it never makes you wait.
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
        // taller than the room it has: only a menu that cannot fit scrolls.
        collisionPadding={12}
        className={cn("z-50 flex max-h-(--radix-context-menu-content-available-height) min-w-32 origin-(--radix-context-menu-content-transform-origin) flex-col overflow-hidden rounded-lg", FLOAT, " data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-60", className , "min-w-fit")}
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
 *
 * The rows share one light, which glides to the row the pointer or the
 * arrows reach (an arrow moves it at once, as keys do everywhere). Between
 * rows, over a divider or the padding, the nearest row stays lit and a click
 * there picks it: what is lit is what a click lands on.
 */
export function MenuScroll({ children }: { children: React.ReactNode }): React.JSX.Element {
  const box = React.useRef<HTMLDivElement>(null)
  const [lit, setLit] = React.useState<{ spot: Spot; snap: boolean; danger: boolean; session: number } | null>(null)
  const litRow = React.useRef<HTMLElement | null>(null)
  React.useEffect(() => {
    const el = box.current
    if (!el) return
    let sessions = 0
    const rowOf = (node: EventTarget | null): HTMLElement | null => (node instanceof Element ? node.closest<HTMLElement>('[role^="menuitem"]') : null)
    // A submenu open from here keeps its row lit, wherever the pointer goes on its way there.
    const held = (): boolean => !!el.querySelector('[role^="menuitem"][data-state="open"]')
    const show = (row: HTMLElement, snap: boolean): void => {
      litRow.current = row
      setLit((was) => ({ spot: spotOf(row, el), snap: snap && !!was, danger: row.dataset.variant === "destructive", session: was ? was.session : ++sessions }))
    }
    const focused = (event: FocusEvent): void => {
      const row = rowOf(event.target)
      if (row && el.contains(row)) show(row, byKeys())
    }
    const moved = (event: PointerEvent): void => {
      if (rowOf(event.target) || held() || !el.contains(event.target as Node)) return
      const at = el.getBoundingClientRect()
      const y = event.clientY - at.top + el.scrollTop
      let nearest: HTMLElement | null = null
      let best = Infinity
      for (const row of el.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([data-disabled])')) {
        const spot = spotOf(row, el)
        const far = Math.abs(y - (spot.top + spot.height / 2))
        if (far < best) (best = far), (nearest = row)
      }
      // Focused, the menu itself lights it: Enter then picks the row that is lit.
      if (nearest && document.activeElement !== nearest) nearest.focus()
    }
    const left = (): void => {
      if (held()) return
      litRow.current = null
      setLit(null)
    }
    const clicked = (event: MouseEvent): void => {
      const row = litRow.current
      if (row && !rowOf(event.target) && el.contains(event.target as Node) && row.isConnected) row.click()
    }
    el.addEventListener("focusin", focused)
    el.addEventListener("pointermove", moved)
    el.addEventListener("pointerleave", left)
    el.addEventListener("click", clicked)
    return () => {
      el.removeEventListener("focusin", focused)
      el.removeEventListener("pointermove", moved)
      el.removeEventListener("pointerleave", left)
      el.removeEventListener("click", clicked)
    }
  }, [])
  return (
    <div ref={box} data-menu-scroll className="mf-more relative isolate min-h-0 scroll-py-8 overflow-x-hidden overflow-y-auto overscroll-contain p-1">
      <Highlight spot={lit?.spot ?? null} session={lit?.session} snap={lit?.snap} className={lit?.danger ? "bg-destructive/10 dark:bg-destructive/20" : "bg-accent"} />
      {children}
    </div>
  )
}

function ContextMenuItem({
  className,
  inset,
  variant = "default",
  onSelect,
  children,
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
        "group/context-menu-item relative flex min-h-7 whitespace-nowrap cursor-default items-center gap-2 rounded-md px-2 py-1 text-control outline-hidden select-none focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-7.5 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:text-destructive data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5 data-[variant=destructive]:*:[svg]:text-destructive",
        className
      )}
      {...props}
      onPointerMove={onlyRealMoves(props.onPointerMove)}
    >
      {props.asChild ? children : withMenuIcon(children)}
    </ContextMenuPrimitive.Item>
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
        "flex min-h-7 cursor-default items-center gap-2 rounded-md px-2 py-1 whitespace-nowrap text-control outline-hidden select-none focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-7.5 data-[state=open]:bg-accent data-[state=open]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        className
      )}
      {...props}
      onPointerMove={onlyRealMoves(props.onPointerMove)}
    >
      {withMenuIcon(children)}
      <ChevronRightIcon className="ml-auto size-3.5 text-muted-foreground" />
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
      ref={markKeyed}
      collisionPadding={12}
      data-slot="context-menu-sub-content"
      className={cn("z-50 flex max-h-(--radix-context-menu-content-available-height) min-w-32 origin-(--radix-context-menu-content-transform-origin) flex-col overflow-hidden rounded-lg", FLOAT, " data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-60", className , "min-w-fit")}
      {...props}
    >
      <MenuScroll>{children}</MenuScroll>
    </ContextMenuPrimitive.SubContent>
    </ContextMenuPrimitive.Portal>
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
        "ml-auto shrink-0 pl-3 whitespace-nowrap text-key tracking-widest text-muted-foreground group-focus/context-menu-item:text-accent-foreground",
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
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
}
