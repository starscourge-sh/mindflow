// Vigil's icon vocabulary, written once: each name is a moving drawing in
// lucide's shape (alive), one name per drawing. A file that means something
// else by it names it so on import: `import { Bookmark as Pin }`.
// Each is marked pure so a window's code keeps only the icons it shows.
import { alive } from '@/components/ui/alive-icon'
import ArrowBackUpIconDrawing from '@/components/ui/arrow-back-up-icon'
import ArrowNarrowDownIconDrawing from '@/components/ui/arrow-narrow-down-icon'
import ArrowNarrowLeftIconDrawing from '@/components/ui/arrow-narrow-left-icon'
import ArrowNarrowRightIconDrawing from '@/components/ui/arrow-narrow-right-icon'
import ArrowNarrowUpIconDrawing from '@/components/ui/arrow-narrow-up-icon'
import BookIconDrawing from '@/components/ui/book-icon'
import BookmarkIconDrawing from '@/components/ui/bookmark-icon'
import BrainCircuitIconDrawing from '@/components/ui/brain-circuit-icon'
import BrightnessDownIconDrawing from '@/components/ui/brightness-down-icon'
import BulbSvgDrawing from '@/components/ui/bulb-svg'
import CameraIconDrawing from '@/components/ui/camera-icon'
import ChartBarIconDrawing from '@/components/ui/chart-bar-icon'
import CheckedIconDrawing from '@/components/ui/checked-icon'
import ClockIconDrawing from '@/components/ui/clock-icon'
import Cloud2IconDrawing from '@/components/ui/cloud-2-icon'
import CopyIconDrawing from '@/components/ui/copy-icon'
import CpuIconDrawing from '@/components/ui/cpu-icon'
import DotsVerticalIconDrawing from '@/components/ui/dots-vertical-icon'
import DoubleCheckIconDrawing from '@/components/ui/double-check-icon'
import DownChevronDrawing from '@/components/ui/down-chevron'
import DownloadIconDrawing from '@/components/ui/download-icon'
import ExpandIconDrawing from '@/components/ui/expand-icon'
import ExternalLinkIconDrawing from '@/components/ui/external-link-icon'
import EyeIconDrawing from '@/components/ui/eye-icon'
import EyeOffIconDrawing from '@/components/ui/eye-off-icon'
import FileDescriptionIconDrawing from '@/components/ui/file-description-icon'
import FilledBellIconDrawing from '@/components/ui/filled-bell-icon'
import HashtagIconDrawing from '@/components/ui/hashtag-icon'
import HistoryCircleIconDrawing from '@/components/ui/history-circle-icon'
import HomeIconDrawing from '@/components/ui/home-icon'
import InfoCircleIconDrawing from '@/components/ui/info-circle-icon'
import LayersIconDrawing from '@/components/ui/layers-icon'
import LayoutDashboardIconDrawing from '@/components/ui/layout-dashboard-icon'
import LayoutSidebarRightCollapseIconDrawing from '@/components/ui/layout-sidebar-right-collapse-icon'
import LayoutSidebarRightIconDrawing from '@/components/ui/layout-sidebar-right-icon'
import LetterTIconDrawing from '@/components/ui/letter-t-icon'
import LibraryIconDrawing from '@/components/ui/library-icon'
import LikeIconDrawing from '@/components/ui/like-icon'
import LinkIconDrawing from '@/components/ui/link-icon'
import LockIconDrawing from '@/components/ui/lock-icon'
import MagnifierIconDrawing from '@/components/ui/magnifier-icon'
import MessageCircleIconDrawing from '@/components/ui/message-circle-icon'
import NoteIconDrawing from '@/components/ui/note-icon'
import PaintIconDrawing from '@/components/ui/paint-icon'
import PenIconDrawing from '@/components/ui/pen-icon'
import PlayerIconDrawing from '@/components/ui/player-icon'
import QuestionMarkDrawing from '@/components/ui/question-mark'
import RefreshIconDrawing from '@/components/ui/refresh-icon'
import RightChevronDrawing from '@/components/ui/right-chevron'
import SaveIconDrawing from '@/components/ui/save-icon'
import ScreenshotIconDrawing from '@/components/ui/screenshot-icon'
import SimpleCheckedIconDrawing from '@/components/ui/simple-checked-icon'
import SparklesIconDrawing from '@/components/ui/sparkles-icon'
import StackIconDrawing from '@/components/ui/stack-icon'
import TrashIconDrawing from '@/components/ui/trash-icon'
import TriangleAlertIconDrawing from '@/components/ui/triangle-alert-icon'
import UnlinkIconDrawing from '@/components/ui/unlink-icon'
import UnorderedListIconDrawing from '@/components/ui/unordered-list-icon'
import Volume2IconDrawing from '@/components/ui/volume-2-icon'
import VolumeXIconDrawing from '@/components/ui/volume-x-icon'
import XIconDrawing from '@/components/ui/x-icon'

export const ArchiveRestore = /* @__PURE__ */ alive(ArrowBackUpIconDrawing)
export const ArrowDown = /* @__PURE__ */ alive(ArrowNarrowDownIconDrawing)
export const ArrowLeft = /* @__PURE__ */ alive(ArrowNarrowLeftIconDrawing)
export const ArrowRight = /* @__PURE__ */ alive(ArrowNarrowRightIconDrawing)
export const ArrowUp = /* @__PURE__ */ alive(ArrowNarrowUpIconDrawing)
export const ArrowUpRight = /* @__PURE__ */ alive(ExternalLinkIconDrawing)
export const FileText = /* @__PURE__ */ alive(FileDescriptionIconDrawing)
export const BarChart3 = /* @__PURE__ */ alive(ChartBarIconDrawing)
export const Bell = /* @__PURE__ */ alive(FilledBellIconDrawing)
export const Bookmark = /* @__PURE__ */ alive(BookmarkIconDrawing)
export const BookOpen = /* @__PURE__ */ alive(BookIconDrawing)
export const Brain = /* @__PURE__ */ alive(BrainCircuitIconDrawing)
export const Brush = /* @__PURE__ */ alive(PaintIconDrawing)
export const Timer = /* @__PURE__ */ alive(ClockIconDrawing)
export const CalloutIcon = /* @__PURE__ */ alive(BulbSvgDrawing)
export const Camera = /* @__PURE__ */ alive(CameraIconDrawing)
export const X = /* @__PURE__ */ alive(XIconDrawing)
export const Check = /* @__PURE__ */ alive(SimpleCheckedIconDrawing)
export const CheckCircle2 = /* @__PURE__ */ alive(DoubleCheckIconDrawing)
export const ListTodo = /* @__PURE__ */ alive(CheckedIconDrawing)
export const ChevronRight = /* @__PURE__ */ alive(RightChevronDrawing)
export const ChevronDown = /* @__PURE__ */ alive(DownChevronDrawing)
export const ChevronLeft = /* @__PURE__ */ alive(RightChevronDrawing, 'rotate-180')
export const ChevronUp = /* @__PURE__ */ alive(DownChevronDrawing, 'rotate-180')
export const CircleHelp = /* @__PURE__ */ alive(InfoCircleIconDrawing)
export const CloudSun = /* @__PURE__ */ alive(Cloud2IconDrawing)
export const Copy = /* @__PURE__ */ alive(CopyIconDrawing)
export const Download = /* @__PURE__ */ alive(DownloadIconDrawing)
export const Pencil = /* @__PURE__ */ alive(PenIconDrawing)
export const Eye =/* @__PURE__ */ alive(EyeIconDrawing)
export const EyeOff = /* @__PURE__ */ alive(EyeOffIconDrawing)
export const Fit = /* @__PURE__ */ alive(ExpandIconDrawing)
export const Gem = /* @__PURE__ */ alive(LibraryIconDrawing)
export const GripVertical = /* @__PURE__ */ alive(DotsVerticalIconDrawing)
export const HardDrive = /* @__PURE__ */ alive(SaveIconDrawing)
export const Tag = /* @__PURE__ */ alive(HashtagIconDrawing)
export const History = /* @__PURE__ */ alive(HistoryCircleIconDrawing)
export const House = /* @__PURE__ */ alive(HomeIconDrawing)
export const Inbox = /* @__PURE__ */ alive(StackIconDrawing)
export const Laptop = /* @__PURE__ */ alive(CpuIconDrawing)
export const Layers = /* @__PURE__ */ alive(LayersIconDrawing)
export const LayoutGrid = /* @__PURE__ */ alive(LayoutDashboardIconDrawing)
export const List = /* @__PURE__ */ alive(UnorderedListIconDrawing)
export const Link = /* @__PURE__ */ alive(LinkIconDrawing)
export const Lock = /* @__PURE__ */ alive(LockIconDrawing)
export const Quote = /* @__PURE__ */ alive(MessageCircleIconDrawing)
export const NotebookText = /* @__PURE__ */ alive(NoteIconDrawing)
export const Orbit = /* @__PURE__ */ alive(QuestionMarkDrawing)
export const PanelLeftClose = /* @__PURE__ */ alive(LayoutSidebarRightCollapseIconDrawing, '-scale-x-100')
export const PanelLeftOpen = /* @__PURE__ */ alive(LayoutSidebarRightIconDrawing, '-scale-x-100')
export const Play = /* @__PURE__ */ alive(PlayerIconDrawing)
export const Repeat = /* @__PURE__ */ alive(RefreshIconDrawing)
export const Screenshot = /* @__PURE__ */ alive(ScreenshotIconDrawing)
export const Search = /* @__PURE__ */ alive(MagnifierIconDrawing)
export const Sparkles = /* @__PURE__ */ alive(SparklesIconDrawing)
export const Sun = /* @__PURE__ */ alive(BrightnessDownIconDrawing)
export const Type = /* @__PURE__ */ alive(LetterTIconDrawing)
export const ThumbsDown = /* @__PURE__ */ alive(LikeIconDrawing, '-scale-y-100')
export const ThumbsUp = /* @__PURE__ */ alive(LikeIconDrawing)
export const Trash2 = /* @__PURE__ */ alive(TrashIconDrawing)
export const TriangleAlert = /* @__PURE__ */ alive(TriangleAlertIconDrawing)
export const Unlink = /* @__PURE__ */ alive(UnlinkIconDrawing)
export const Volume2 = /* @__PURE__ */ alive(Volume2IconDrawing)
export const VolumeX = /* @__PURE__ */ alive(VolumeXIconDrawing)
