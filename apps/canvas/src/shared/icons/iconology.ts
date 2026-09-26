import { GitHubMarkIcon } from './github-mark-icon';
import {
  ArrowRight,
  BookOpen,
  Bold,
  ChevronDown,
  Circle,
  Camera,
  CaseSensitive,
  ClipboardPaste,
  ChevronLeft,
  ChevronRight,
  Code2,
  Component,
  Compass,
  Contrast,
  Copy,
  Download,
  Eraser,
  CircleHelp,
  Focus,
  FolderOpen,
  Grid2X2,
  Italic,
  Hand,
  Highlighter,
  LayoutTemplate,
  Languages,
  Keyboard,
  LineSquiggle,
  Map,
  Menu,
  MonitorCog,
  Minus,
  MoreHorizontal,
  MousePointer2,
  Omega,
  Palette,
  Presentation,
  Sparkles,
  RotateCcw,
  PanelRightOpen,
  PaintbrushVertical,
  Plus,
  Pencil,
  Play,
  Scissors,
  Settings2,
  ShieldCheck,
  Smile,
  Square,
  SquareSplitHorizontal,
  SquareSplitVertical,
  Star,
  Strikethrough,
  Terminal,
  Trash2,
  Type,
  Underline,
  Upload,
  Undo2,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';

type IconMap<Key extends string> = Record<Key, LucideIcon>;

export const HOST_ICONOLOGY = {
  canvasMode: {
    freeform: Pencil,
    slide: Presentation,
    ai: Sparkles,
  } satisfies IconMap<'freeform' | 'slide' | 'ai'>,
  sourceKind: {
    blackboard: BookOpen,
  } satisfies IconMap<'blackboard'>,
  characterView: {
    essentials: CaseSensitive,
    nerd: Terminal,
    emoji: Smile,
    unicode: Omega,
  } satisfies IconMap<'essentials' | 'nerd' | 'emoji' | 'unicode'>,
  templateView: {
    template: LayoutTemplate,
    components: Component,
  } satisfies IconMap<'template' | 'components'>,
  editorAction: {
    copy: Copy,
    'copy-rich': Palette,
    'copy-ansi': Code2,
    cut: Scissors,
    paste: ClipboardPaste,
    'snapshot-png': Camera,
    'delete-selection': Trash2,
    duplicate: Copy,
  } satisfies IconMap<
    | 'copy'
    | 'copy-rich'
    | 'copy-ansi'
    | 'cut'
    | 'paste'
    | 'snapshot-png'
    | 'delete-selection'
    | 'duplicate'
  >,
  toolbarAction: {
    select: MousePointer2,
    text: Type,
    brush: Pencil,
    'shape-group': LineSquiggle,
    bg: Highlighter,
    fill: PaintbrushVertical,
    eraser: Eraser,
    undo: Undo2,
    pan: Hand,
  } satisfies IconMap<
    | 'select'
    | 'text'
    | 'brush'
    | 'shape-group'
    | 'bg'
    | 'fill'
    | 'eraser'
    | 'undo'
    | 'pan'
  >,
  zoomAction: {
    out: Minus,
    in: Plus,
  } satisfies IconMap<'out' | 'in'>,
  viewportAction: {
    grid: Grid2X2,
    minimap: Map,
    security: ShieldCheck,
  } satisfies IconMap<'grid' | 'minimap' | 'security'>,
  selectionAction: {
    bold: Bold,
    italic: Italic,
    underline: Underline,
    strike: Strikethrough,
    inverse: Contrast,
    color: Palette,
    'split-horizontal': SquareSplitVertical,
    'split-vertical': SquareSplitHorizontal,
    'delete-divider': Trash2,
  } satisfies IconMap<
    | 'bold'
    | 'italic'
    | 'underline'
    | 'strike'
    | 'inverse'
    | 'color'
    | 'split-horizontal'
    | 'split-vertical'
    | 'delete-divider'
  >,
  colorPalette: {
    ansi16: Grid2X2,
    presets: Palette,
    restoreDefault: RotateCcw,
  } satisfies IconMap<'ansi16' | 'presets' | 'restoreDefault'>,
  shapeTool: {
    box: Square,
    splitBox: SquareSplitVertical,
    circle: Circle,
    line: Minus,
    arrowLine: ArrowRight,
    stepline: LineSquiggle,
  } satisfies IconMap<'box' | 'splitBox' | 'circle' | 'line' | 'arrowLine' | 'stepline'>,
  appMenu: {
    trigger: Menu,
    splitView: SquareSplitHorizontal,
    zenMode: Focus,
    help: CircleHelp,
    guide: Compass,
    documentation: BookOpen,
    copy: Copy,
    github: GitHubMarkIcon,
    githubStar: Star,
    language: Languages,
    display: MonitorCog,
    shortcuts: Keyboard,
    settings: Settings2,
    clear: Trash2,
  } satisfies IconMap<
    | 'trigger'
    | 'splitView'
    | 'zenMode'
    | 'help'
    | 'guide'
    | 'documentation'
    | 'copy'
    | 'github'
    | 'githubStar'
    | 'language'
    | 'display'
    | 'shortcuts'
    | 'settings'
    | 'clear'
  >,
  slideAction: {
    play: Play,
    previous: ChevronLeft,
    next: ChevronRight,
    close: X,
    configure: Settings2,
  } satisfies IconMap<'play' | 'previous' | 'next' | 'close' | 'configure'>,
  sessionAction: {
    expand: ChevronDown,
    more: MoreHorizontal,
    rename: Pencil,
    create: Plus,
    import: Upload,
    importBlackboard: FolderOpen,
    export: Download,
    close: Trash2,
    collaboration: Users,
  } satisfies IconMap<
    | 'expand'
    | 'more'
    | 'rename'
    | 'create'
    | 'import'
    | 'importBlackboard'
    | 'export'
    | 'close'
    | 'collaboration'
  >,
  chrome: {
    'open-right-sidebar': PanelRightOpen,
    'toolbar-submenu': ChevronDown,
  } satisfies IconMap<'open-right-sidebar' | 'toolbar-submenu'>,
} as const;
