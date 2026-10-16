import { forwardRef, memo, useCallback, useEffect, useId, useImperativeHandle, useRef, useState, type ComponentType, type CSSProperties, type ReactNode, type RefAttributes } from 'react'
import { motion, useAnimate, type DOMKeyframesDefinition } from 'motion/react'
import { Circle, Eraser, Hand, ImagePlus, Minus, MousePointer2, MoveUpRight, Plus, Scan, Slash, Square, type LucideIcon } from 'lucide-react'
import { Excalidraw, getSceneVersion } from '@excalidraw/excalidraw'
import type { AppState, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import drawingStyles from '@excalidraw/excalidraw/index.css?url'

import type { DiagramScene } from '@/extensions/excalidraw'
import { currentTheme, isLight } from '@/lib/theme'
import { chime, click, step } from '@/lib/sound'
import { spring } from '@/lib/motion'
import { Kbd, Rolling, Tip } from '@/components/vigil/ui'
import { AliveIcon } from '@/components/ui/alive-icon'
import type { AnimatedIconHandle, AnimatedIconProps } from '@/components/ui/types'
import ArrowBackUpIcon from '@/components/ui/arrow-back-up-icon'
import DotsHorizontalIcon from '@/components/ui/dots-horizontal-icon'
import DownloadIcon from '@/components/ui/download-icon'
import LetterTIcon from '@/components/ui/letter-t-icon'
import MagnifierIcon from '@/components/ui/magnifier-icon'
import PenIcon from '@/components/ui/pen-icon'
import PaintIcon from '@/components/ui/paint-icon'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'

// The drawing editor's own styles come with it, the first time a drawing is
// opened, rather than in the one style file every window reads: they are a
// large file only a drawing needs, and once in every window they were also in
// every check of the app's motion. Waited for, so it never shows unstyled.
if (!document.querySelector(`link[href="${drawingStyles}"]`)) {
  const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: drawingStyles })
  document.head.append(link)
  await new Promise((done) => {
    link.onload = done
    link.onerror = done
  })
}

type Drawing = ComponentType<AnimatedIconProps & RefAttributes<AnimatedIconHandle>>

/**
 * A lucide drawing given a move of its own, for the tools itshover has no
 * drawing of: it plays when the button is pointed at, as every icon here does.
 */
function moving(Icon: LucideIcon, move: DOMKeyframesDefinition): Drawing {
  const Moving = forwardRef<AnimatedIconHandle, AnimatedIconProps>(({ size = 16, strokeWidth = 2, className }, ref) => {
    const [scope, animate] = useAnimate()
    useImperativeHandle(ref, () => ({
      // One beat on the app's curve: tools are pointed at tens of times a day.
      startAnimation: () => void animate(scope.current, move, { duration: 0.25, ease: [0.16, 1, 0.3, 1] }),
      stopAnimation: () => void animate(scope.current, { x: 0, y: 0, rotate: 0, scale: 1, scaleX: 1 }, { duration: 0.15 })
    }))
    return (
      <motion.span ref={scope} className="inline-flex">
        <Icon size={size} strokeWidth={strokeWidth} className={className} />
      </motion.span>
    )
  })
  Moving.displayName = `Moving(${Icon.displayName ?? 'Icon'})`
  return Moving
}

// What a note's drawing is mostly made of, in the groups you reach for them:
// getting about, shapes, marks, and taking away. Diamond, frames and the
// library still answer their keys; they are rarely what a note needs.
const TOOLS = [
  [
    { type: 'selection', label: 'Select', keys: ['V', '1'], icon: moving(MousePointer2, { x: [0, -1.5, 0], y: [0, -1.5, 0], scale: [1, 0.88, 1] }) },
    { type: 'hand', label: 'Move the canvas', keys: ['H'], icon: moving(Hand, { rotate: [0, -14, 10, -6, 0] }) }
  ],
  [
    { type: 'rectangle', label: 'Box', keys: ['R', '2'], icon: moving(Square, { rotate: [0, 90], scale: [1, 0.85, 1] }) },
    { type: 'ellipse', label: 'Circle', keys: ['O', '4'], icon: moving(Circle, { scaleX: [1, 1.25, 0.9, 1] }) },
    { type: 'arrow', label: 'Arrow', keys: ['A', '5'], icon: moving(MoveUpRight, { x: [0, 3, 0], y: [0, -3, 0] }) },
    { type: 'line', label: 'Line', keys: ['L', '6'], icon: moving(Slash, { rotate: [0, 30, -10, 0] }) }
  ],
  [
    { type: 'freedraw', label: 'Pen', keys: ['P', '7'], icon: PenIcon },
    { type: 'text', label: 'Text', keys: ['T', '8'], icon: LetterTIcon },
    { type: 'image', label: 'Picture', keys: ['9'], icon: moving(ImagePlus, { y: [0, -2, 0], scale: [1, 1.1, 1] }) }
  ],
  [{ type: 'eraser', label: 'Eraser', keys: ['E', '0'], icon: moving(Eraser, { x: [0, -2.5, 2.5, -2.5, 0] }) }]
] as const

type Tool = (typeof TOOLS)[number][number]['type']
const SHAPES = new Set(['rectangle', 'diamond', 'ellipse', 'arrow', 'line', 'text', 'image'])

/** Behind the canvas on export: the page, or one of Excalidraw's own papers. */
const BACKGROUNDS = [
  { label: 'The page', color: 'transparent' },
  { label: 'White', color: '#ffffff' },
  { label: 'Cream', color: '#fffce8' },
  { label: 'Grey', color: '#f8f9fa' },
  { label: 'Blue', color: '#f5faff' }
]

/** Excalidraw's grid, in its own units: the dots sit where a shape snaps. */
const GRID = 20

const TOOL_BUTTON = 'flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-40'
const PILL = 'flex h-7 shrink-0 items-center overflow-hidden rounded-full border'
const NO_DRAG = { WebkitAppRegion: 'no-drag' } as CSSProperties

/** A name and its keys, the way every tip in the app shows them. */
const keyed = (label: string, keys: readonly string[]): ReactNode => (
  <span className="flex items-center gap-1.5">
    {label}
    {keys.map((key) => <Kbd key={key}>{key}</Kbd>)}
  </span>
)

/** What the bar reads off the editor, as it changes. */
type Seen = { tool: string; locked: boolean; zoom: number; grid: boolean; snap: boolean; background: string; undo: boolean; redo: boolean; styling: boolean | null }

/**
 * A drawing with the app's own controls over it: the tools, undo, zoom and a
 * menu in one bar along the top, the way the main window has its own, and
 * Excalidraw's floating islands put away (main.css). `start` is what the bar
 * opens with (a window's name), `end` what it closes with (a block's buttons).
 */
export default function ExcalidrawCanvas({ scene, onChange, start, end, header = false }: {
  scene: DiagramScene | null
  onChange: (scene: DiagramScene) => void
  start?: ReactNode
  end?: ReactNode
  /** The bar is the window's own top: something to drag it by, and room for its dots. */
  header?: boolean
}): React.JSX.Element {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const dots = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState<Seen>({ tool: 'selection', locked: false, zoom: 1, grid: false, snap: true, background: 'transparent', undo: false, redo: false, styling: null })
  const glide = useId()

  // Excalidraw's own undo buttons, put away but still there, with the history
  // behind them.
  const press = (selector: string): void => box.current?.querySelector<HTMLButtonElement>(selector)?.click()

  // Zoom about the middle of the view, in Excalidraw's own steps and limits.
  const zoomTo = (to: (now: number) => number): void => {
    if (!api) return
    const { zoom, scrollX, scrollY, width, height } = api.getAppState()
    const next = Math.min(30, Math.max(0.1, Math.round(to(zoom.value) * 10) / 10))
    set({
      zoom: { value: next as AppState['zoom']['value'] },
      scrollX: scrollX + width / 2 / next - width / 2 / zoom.value,
      scrollY: scrollY + height / 2 / next - height / 2 / zoom.value
    })
  }

  // Read a frame later, once Excalidraw's own undo button has caught up with
  // the change, and once a frame at most however fast the changes come.
  const latest = useRef<{ state: AppState; frame: number } | null>(null)
  const onState = useCallback((state: AppState) => {
    if (latest.current) return void (latest.current.state = state)
    latest.current = { state, frame: requestAnimationFrame(() => read()) }
  }, [])
  useEffect(() => () => cancelAnimationFrame(latest.current?.frame ?? 0), [])
  const read = (): void => {
    const state = latest.current?.state
    latest.current = null
    if (!state) return
    const undo = box.current?.querySelector<HTMLButtonElement>('[data-testid="button-undo"]')
    const redo = box.current?.querySelector<HTMLButtonElement>('[data-testid="button-redo"]')
    const next: Seen = {
      tool: state.activeTool.type,
      locked: state.activeTool.locked,
      zoom: Math.round(state.zoom.value * 100),
      grid: state.gridModeEnabled,
      snap: state.objectsSnapModeEnabled,
      background: state.viewBackgroundColor,
      undo: !!undo && !undo.disabled,
      redo: !!redo && !redo.disabled,
      // Narrow (a block in a note), Excalidraw keeps a shape's panel behind a
      // button of its own toolbar, which is put away: the bar offers it instead.
      styling: box.current?.querySelector('.excalidraw--mobile') && Object.keys(state.selectedElementIds).length ? state.openMenu === 'shape' : null
    }
    // Only a real change draws the bar again.
    setSeen((now) => ((Object.keys(next) as (keyof Seen)[]).every((key) => now[key] === next[key]) ? now : next))
  }

  // The dot grid follows the canvas as it moves and zooms, a dot every place
  // a shape would land, and thinned out when zoomed far enough out to blur.
  useEffect(() => {
    if (!api) return
    const place = (x: number, y: number, zoom: number): void => {
      const el = dots.current
      if (!el) return
      const gap = GRID * zoom * (zoom < 0.5 ? 4 : zoom < 1 ? 2 : 1)
      el.style.backgroundSize = `${gap}px ${gap}px`
      el.style.backgroundPosition = `${(x * zoom) % gap}px ${(y * zoom) % gap}px`
    }
    const now = api.getAppState()
    place(now.scrollX, now.scrollY, now.zoom.value)
    return api.onScrollChange((x, y, zoom) => place(x, y, zoom.value))
  }, [api])

  // Small sounds for drawing, one per stroke and never per point: a pen's
  // scratch as it touches down, the eraser's rub, a pop as a shape is set down.
  useEffect(() => {
    if (!api) return
    let before = 0
    const count = (): number => api.getSceneElements().length
    const down = api.onPointerDown((tool) => {
      before = count()
      if (tool.type === 'freedraw') click('scratch')
      if (tool.type === 'eraser') click('rub')
    })
    const up = api.onPointerUp((tool) => {
      if (SHAPES.has(tool.type) && count() > before) chime('pop')
    })
    return () => (down(), up())
  }, [api])

  // ⌘Z and ⇧⌘Z sound like the buttons do, when there is something to take back.
  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z' || event.repeat) return
    if (event.shiftKey ? seen.redo : seen.undo) chime(event.shiftKey ? 'redo' : 'undo')
  }

  const pick = (type: Tool): void => {
    if (!api) return
    click('tick')
    // Picture opens the file picker, as its key does.
    api.setActiveTool({ type })
  }
  const set = (appState: Partial<AppState>): void => api?.updateScene({ appState: appState as AppState })
  const light = isLight(currentTheme())

  return (
    <div className="drawing-surface @container flex h-full flex-col">
      <header
        className={`flex shrink-0 items-center gap-1 overflow-x-auto px-2 [scrollbar-width:none] ${header ? 'h-11 pl-[84px] [:root[data-fullscreen]_&]:pl-2' : 'h-10 border-b'}`}
        style={header ? ({ WebkitAppRegion: 'drag' } as CSSProperties) : undefined}
      >
        {start}
        <span className="min-w-2 flex-1" />

        <span className={`${PILL} mf-segs relative`} style={NO_DRAG} role="toolbar" aria-label="Tools">
          {TOOLS.map((group, n) => (
            <span key={n} className={`flex items-center ${n ? 'pl-[3px]' : ''}`}>
              {group.map(({ type, label, keys, icon }) => {
                const on = seen.tool === type
                return (
                  <Tip key={type} label={keyed(label, keys)}>
                    <button
                      type="button"
                      aria-label={label}
                      aria-pressed={on}
                      tabIndex={-1}
                      // The keys stay with the canvas: a click here leaves its focus where it was.
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => pick(type)}
                      className={`relative flex h-[22px] w-7 items-center justify-center rounded-full transition-colors ${on ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      {/* The picked tool's mark glides to the next one rather than blinking over. */}
                      {on && <motion.span layoutId={`tool-${glide}`} transition={spring.slow} className="absolute inset-0 rounded-full bg-accent" />}
                      <span className="relative"><AliveIcon icon={icon} size={15} /></span>
                    </button>
                  </Tip>
                )
              })}
            </span>
          ))}
        </span>

        <span className="min-w-2 flex-1" />

        {seen.styling !== null && (
          <Tip label="Colour and line">
            <button type="button" aria-label="Colour and line" aria-pressed={seen.styling} tabIndex={-1} style={NO_DRAG} onMouseDown={(event) => event.preventDefault()}
              onClick={() => (chime(seen.styling ? 'fold' : 'open'), set({ openMenu: seen.styling ? null : 'shape' }))}
              className={`${TOOL_BUTTON} aria-pressed:bg-accent aria-pressed:text-foreground`}>
              <AliveIcon icon={PaintIcon} size={16} />
            </button>
          </Tip>
        )}

        {/* Undo and redo as one pill, as back and forward are in the main window. */}
        <span className={`${PILL} mf-segs`} style={NO_DRAG}>
          {[
            { label: 'Undo', keys: ['⌘Z'], off: !seen.undo, run: () => (chime('undo'), press('[data-testid="button-undo"]')), flip: false },
            { label: 'Redo', keys: ['⇧⌘Z'], off: !seen.redo, run: () => (chime('redo'), press('[data-testid="button-redo"]')), flip: true }
          ].map(({ label, keys, off, run, flip }) => (
            <Tip key={label} label={keyed(label, keys)}>
              <button type="button" aria-label={label} disabled={off} tabIndex={-1} onMouseDown={(event) => event.preventDefault()} onClick={run}
                className="flex size-[22px] items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-40">
                <AliveIcon icon={ArrowBackUpIcon} size={15} className={flip ? '-scale-x-100' : ''} />
              </button>
            </Tip>
          ))}
        </span>

        {/* Zoom: out, how far (back to 100% on a click), in. Narrow, only its keys. */}
        <span className={`${PILL} mf-segs @max-[42rem]:hidden`} style={NO_DRAG}>
          <Tip label={keyed('Zoom out', ['⌘−'])}>
            <button type="button" aria-label="Zoom out" tabIndex={-1} onMouseDown={(event) => event.preventDefault()} onClick={() => (chime('zoomout'), zoomTo((now) => now - 0.1))}
              className="flex size-[22px] items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground">
              <Minus className="size-3.5" />
            </button>
          </Tip>
          <Tip label={keyed('Back to 100%', ['⇧0'])}>
            <button type="button" aria-label="Back to 100%" tabIndex={-1} onMouseDown={(event) => event.preventDefault()} onClick={() => (chime('tap'), zoomTo(() => 1))}
              className="flex h-[22px] min-w-12 items-center justify-center rounded-full px-1.5 text-meta tabular-nums text-foreground/80 transition-colors hover:bg-accent/60 hover:text-foreground">
              <Rolling text={`${seen.zoom}%`} />
            </button>
          </Tip>
          <Tip label={keyed('Zoom in', ['⌘+'])}>
            <button type="button" aria-label="Zoom in" tabIndex={-1} onMouseDown={(event) => event.preventDefault()} onClick={() => (chime('zoomin'), zoomTo((now) => now + 0.1))}
              className="flex size-[22px] items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground">
              <Plus className="size-3.5" />
            </button>
          </Tip>
        </span>
        <Tip label={keyed('Fit the drawing in view', ['⇧1'])}>
          <button type="button" aria-label="Fit the drawing in view" tabIndex={-1} style={NO_DRAG} onMouseDown={(event) => event.preventDefault()}
            onClick={() => (chime('look'), api?.scrollToContent(undefined, { fitToContent: true, animate: true }))} className={TOOL_BUTTON}>
            <Scan className="size-4" />
          </button>
        </Tip>

        <DropdownMenu modal={false} onOpenChange={(open) => open && chime('open')}>
          <Tip label="More">
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="More" tabIndex={-1} style={NO_DRAG} onMouseDown={(event) => event.preventDefault()}
                className={`${TOOL_BUTTON} data-[state=open]:bg-accent data-[state=open]:text-foreground`}>
                <AliveIcon icon={DotsHorizontalIcon} size={16} />
              </button>
            </DropdownMenuTrigger>
          </Tip>
          <DropdownMenuContent align="end" className="w-64 text-control" onCloseAutoFocus={(event) => event.preventDefault()}>
            <DropdownMenuItem onSelect={() => api?.toggleSidebar({ name: 'default', tab: 'search', force: true })}>
              <AliveIcon icon={MagnifierIcon} size={14} className="text-muted-foreground" />
              Find on the canvas
              <DropdownMenuShortcut>⌘F</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => (chime('open'), set({ openDialog: { name: 'imageExport' } }))}>
              <AliveIcon icon={DownloadIcon} size={14} className="text-muted-foreground" />
              Save as a picture
              <DropdownMenuShortcut>⇧⌘E</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-meta font-normal text-muted-foreground">Background</DropdownMenuLabel>
            <div className="flex gap-1.5 px-2 pb-1.5">
              {BACKGROUNDS.map(({ label, color }, n) => (
                <Tip key={color} label={label}>
                  <button type="button" aria-label={label} aria-pressed={seen.background === color}
                    onClick={() => (step(n), set({ viewBackgroundColor: color }))}
                    className={`size-6 rounded-full border transition-shadow ${seen.background === color ? 'ring-2 ring-foreground/60 ring-offset-1 ring-offset-popover' : 'hover:ring-1 hover:ring-foreground/30'}`}
                    // On a dark canvas a colour is drawn inverted; the swatch shows it as it will look.
                    style={{ background: color === 'transparent' ? 'var(--background)' : color, filter: light || color === 'transparent' ? undefined : 'invert(93%) hue-rotate(180deg)' }} />
                </Tip>
              ))}
            </div>
            <DropdownMenuSeparator />
            {[
              { label: 'Snap to the grid', keys: "⌘'", on: seen.grid, flip: () => set({ gridModeEnabled: !seen.grid }) },
              { label: 'Snap to other shapes', keys: '⌥S', on: seen.snap, flip: () => set({ objectsSnapModeEnabled: !seen.snap }) },
              { label: 'Keep the tool', hint: 'After drawing', keys: 'Q', on: seen.locked, flip: () => api?.setActiveTool({ type: seen.tool as Tool, locked: !seen.locked }) }
            ].map(({ label, keys, on, flip }) => (
              <DropdownMenuCheckboxItem key={label} checked={on} onSelect={(event) => event.preventDefault()} onCheckedChange={flip}>
                {label}
                <DropdownMenuShortcut>{keys}</DropdownMenuShortcut>
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {end}
      </header>

      <div ref={box} className="relative min-h-0 flex-1 [container-type:size]" onKeyDown={onKeyDown}>
        {/* Paper, not graph paper: a faint dot where each grid line would cross. Its lines come back with Snap to the grid. */}
        <div ref={dots} aria-hidden className={`drawing-dots absolute inset-0 ${seen.grid ? 'hidden' : ''}`} />
        <Editor scene={scene} onChange={onChange} onApi={setApi} onState={onState} />
      </div>
    </div>
  )
}

/**
 * The editor itself. Dragging the block's resize grip re-renders the view on
 * every pointer move, and the bar above on every change of tool or zoom; its
 * props are all stable, so this keeps a whole editor from re-rendering with them.
 */
const Editor = memo(function Editor({ scene, onChange, onApi, onState }: {
  scene: DiagramScene | null
  onChange: (scene: DiagramScene) => void
  onApi: (api: ExcalidrawImperativeAPI) => void
  onState: (state: AppState) => void
}): React.JSX.Element {
  // Excalidraw reports a change on mount and after every pointer move. The
  // version only moves when a shape does, so an idle canvas writes nothing.
  const version = useRef(getSceneVersion(scene?.elements ?? []))

  return (
    <Excalidraw
      // Dark, except under the app's light themes.
      theme={isLight(currentTheme()) ? 'light' : 'dark'}
      excalidrawAPI={onApi}
      initialData={{
        elements: scene?.elements ?? [],
        files: scene?.files,
        appState: {
          // The note's own background shows through, so a drawing reads as
          // part of the page rather than a white card dropped onto it.
          viewBackgroundColor: 'transparent',
          // The dot grid stands in for Excalidraw's lines, which read as graph
          // paper; snapping to other shapes is what lines boxes up by eye.
          gridModeEnabled: false,
          objectsSnapModeEnabled: true
        },
        scrollToContent: true
      }}
      onChange={(elements, appState, files) => {
        onState(appState)
        const next = getSceneVersion(elements)
        if (next === version.current) return
        version.current = next
        // Deleted shapes are kept only so undo can bring them back; they are
        // the editor's business, not the note's.
        onChange({ elements: elements.filter((element) => !element.isDeleted), files })
      }}
      UIOptions={{
        canvasActions: {
          // Themes, files and sharing all belong to the note, not the canvas.
          toggleTheme: false,
          loadScene: false,
          saveToActiveFile: false,
          export: false
        }
      }}
    />
  )
})
