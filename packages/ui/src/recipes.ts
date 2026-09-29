import { cn } from './utils.js';
import type {
  Density,
  FeedbackStatus,
  ItemVariant,
  Shape,
  Size,
  StatusTone,
  SurfaceKind,
  Tone,
} from './tokens.js';

type ControlOptions = {
  tone?: Tone;
  size?: Size;
  shape?: Shape;
  outlined?: boolean;
  active?: boolean;
  pressed?: boolean;
  open?: boolean;
  destructive?: boolean;
  feedback?: FeedbackStatus;
  status?: StatusTone;
  subordinate?: boolean;
  joined?: 'start' | 'middle' | 'end';
};

type SurfaceOptions = {
  kind?: SurfaceKind;
  animated?: boolean;
};

type FieldOptions = {
  density?: Density;
  invalid?: boolean;
  appearance?: 'default' | 'quiet' | 'search';
};

type MenuItemOptions = {
  density?: Density;
  variant?: ItemVariant;
  selected?: boolean;
  feedback?: FeedbackStatus;
};

type SelectableItemOptions = {
  orientation?: 'horizontal' | 'vertical';
  selected?: boolean;
  muted?: boolean;
  status?: StatusTone;
};

type CollectionCardOptions = {
  selected?: boolean;
};

type SwatchButtonOptions = {
  selected?: boolean;
};

type TabTriggerOptions = {
  size?: 'default' | 'icon';
  active?: boolean;
};

const surface = ({ kind = 'embedded', animated = false }: SurfaceOptions = {}) =>
  cn(
    'rounded-surface border-0',
    kind === 'embedded' && 'bg-secondary/70 shadow-none ring-0',
    kind === 'floating' && 'bg-host-surface shadow-host ring-1 ring-surface-ring',
    kind === 'overlay' && 'bg-overlay-surface shadow-overlay ring-1 ring-surface-ring',
    kind === 'transparent' && 'bg-transparent shadow-none ring-0',
    animated &&
      'transition-[background-color,box-shadow] duration-[var(--motion-standard)] ease-out motion-reduce:transition-none'
  );
const dialogHeader = 'relative flex flex-col gap-1.5 text-left';
const focusRing =
  'outline-none focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:ring-inset';

const controlBase = cn(
  'inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-[color,background-color,opacity,box-shadow] duration-[var(--motion-fast)] select-none motion-reduce:transition-none disabled:pointer-events-none disabled:cursor-default disabled:opacity-50',
  focusRing,
  "data-[active=true]:focus-visible:ring-0 data-[pressed=true]:focus-visible:ring-0 data-[open=true]:focus-visible:ring-0 data-[drop-target=true]:bg-accent data-[drop-target=true]:text-accent-foreground data-[state=open]:focus-visible:ring-0 data-[state=on]:focus-visible:ring-0 data-[state=open]:bg-control-open-surface data-[state=open]:text-foreground data-[state=open]:hover:bg-control-open-surface data-[state=open]:hover:text-foreground data-[state=open]:focus:bg-control-open-surface data-[state=open]:focus:text-foreground data-[state=on]:bg-control-pressed-surface data-[state=on]:text-foreground data-[state=on]:hover:bg-control-pressed-surface data-[state=on]:hover:text-foreground data-[state=on]:focus:bg-control-pressed-surface data-[state=on]:focus:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
);

const controlTone: Record<Tone, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
  neutral: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  subtle: 'bg-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground',
  danger:
    'bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-invalid-ring',
  link: 'text-primary underline-offset-4 hover:underline bg-transparent',
};

const controlSize: Record<Size, string> = {
  xs: 'h-6 px-2 text-[11px]',
  sm: 'h-7 px-2.5 text-xs',
  md: 'h-8 px-3 text-[13px]',
  lg: 'h-9 px-4 text-sm',
};

const openControlSurface =
  'bg-control-open-surface hover:bg-control-open-surface focus:bg-control-open-surface data-[highlighted]:bg-control-open-surface';
const pressedControlSurface =
  'bg-control-pressed-surface hover:bg-control-pressed-surface focus:bg-control-pressed-surface data-[highlighted]:bg-control-pressed-surface data-[state=open]:bg-control-pressed-surface data-[state=open]:hover:bg-control-pressed-surface data-[state=open]:focus:bg-control-pressed-surface data-[state=open]:data-[highlighted]:bg-control-pressed-surface';
const activeControlSurface =
  'bg-control-active-surface hover:bg-control-active-surface focus:bg-control-active-surface data-[highlighted]:bg-control-active-surface data-[state=open]:bg-control-active-surface data-[state=open]:hover:bg-control-active-surface data-[state=open]:focus:bg-control-active-surface data-[state=open]:data-[highlighted]:bg-control-active-surface data-[state=on]:bg-control-active-surface data-[state=on]:hover:bg-control-active-surface data-[state=on]:focus:bg-control-active-surface data-[state=checked]:bg-control-active-surface data-[state=checked]:focus:bg-control-active-surface data-[state=checked]:data-[highlighted]:bg-control-active-surface';
const persistentControlText =
  'text-foreground hover:text-foreground focus:text-foreground data-[highlighted]:text-foreground data-[state=open]:text-foreground data-[state=open]:hover:text-foreground data-[state=open]:focus:text-foreground data-[state=open]:data-[highlighted]:text-foreground data-[state=on]:text-foreground data-[state=on]:hover:text-foreground data-[state=on]:focus:text-foreground data-[state=checked]:text-foreground data-[state=checked]:focus:text-foreground data-[state=checked]:data-[highlighted]:text-foreground';
const destructivePersistentText =
  'text-destructive hover:text-destructive focus:text-destructive data-[highlighted]:text-destructive data-[state=open]:text-destructive data-[state=open]:hover:text-destructive data-[state=open]:focus:text-destructive data-[state=open]:data-[highlighted]:text-destructive data-[state=on]:text-destructive data-[state=on]:hover:text-destructive data-[state=on]:focus:text-destructive data-[state=checked]:text-destructive data-[state=checked]:focus:text-destructive data-[state=checked]:data-[highlighted]:text-destructive';
const feedbackPersistentText: Record<FeedbackStatus, string> = {
  success:
    'text-success hover:text-success focus:text-success data-[highlighted]:text-success data-[state=open]:text-success data-[state=open]:hover:text-success data-[state=open]:focus:text-success data-[state=open]:data-[highlighted]:text-success data-[state=on]:text-success data-[state=on]:hover:text-success data-[state=on]:focus:text-success data-[state=checked]:text-success data-[state=checked]:focus:text-success data-[state=checked]:data-[highlighted]:text-success',
  warning:
    'text-warning hover:text-warning focus:text-warning data-[highlighted]:text-warning data-[state=open]:text-warning data-[state=open]:hover:text-warning data-[state=open]:focus:text-warning data-[state=open]:data-[highlighted]:text-warning data-[state=on]:text-warning data-[state=on]:hover:text-warning data-[state=on]:focus:text-warning data-[state=checked]:text-warning data-[state=checked]:focus:text-warning data-[state=checked]:data-[highlighted]:text-warning',
  error:
    'text-error hover:text-error focus:text-error data-[highlighted]:text-error data-[state=open]:text-error data-[state=open]:hover:text-error data-[state=open]:focus:text-error data-[state=open]:data-[highlighted]:text-error data-[state=on]:text-error data-[state=on]:hover:text-error data-[state=on]:focus:text-error data-[state=checked]:text-error data-[state=checked]:focus:text-error data-[state=checked]:data-[highlighted]:text-error',
};
const statusControlSurface: Record<StatusTone, string> = {
  neutral:
    'bg-control-active-surface hover:bg-control-active-surface focus:bg-control-active-surface data-[highlighted]:bg-control-active-surface data-[state=open]:bg-control-active-surface data-[state=open]:hover:bg-control-active-surface data-[state=open]:focus:bg-control-active-surface',
  success:
    'bg-success-muted hover:bg-success-muted focus:bg-success-muted data-[highlighted]:bg-success-muted data-[state=open]:bg-success-muted data-[state=open]:hover:bg-success-muted data-[state=open]:focus:bg-success-muted',
  warning:
    'bg-warning-muted hover:bg-warning-muted focus:bg-warning-muted data-[highlighted]:bg-warning-muted data-[state=open]:bg-warning-muted data-[state=open]:hover:bg-warning-muted data-[state=open]:focus:bg-warning-muted',
  error:
    'bg-error-muted hover:bg-error-muted focus:bg-error-muted data-[highlighted]:bg-error-muted data-[state=open]:bg-error-muted data-[state=open]:hover:bg-error-muted data-[state=open]:focus:bg-error-muted',
};
const selectableStatusSurface: Record<StatusTone, string> = {
  neutral:
    'bg-control-open-surface hover:bg-control-open-surface [&_[data-slot=button]]:hover:bg-control-open-surface',
  success:
    'bg-success-muted hover:bg-success-muted [&_[data-slot=button]]:hover:bg-success-muted',
  warning:
    'bg-warning-muted hover:bg-warning-muted [&_[data-slot=button]]:hover:bg-warning-muted',
  error:
    'bg-error-muted hover:bg-error-muted [&_[data-slot=button]]:hover:bg-error-muted',
};
const selectedSelectableStatusSurface: Record<StatusTone, string> = {
  neutral:
    'bg-control-active-surface hover:bg-control-active-surface [&_[data-slot=button]]:hover:bg-control-active-surface',
  success: 'bg-success/20 hover:bg-success/20 [&_[data-slot=button]]:hover:bg-success/20',
  warning: 'bg-warning/20 hover:bg-warning/20 [&_[data-slot=button]]:hover:bg-warning/20',
  error: 'bg-error/20 hover:bg-error/20 [&_[data-slot=button]]:hover:bg-error/20',
};
const statusText: Record<StatusTone, string> = {
  neutral: 'text-muted-foreground',
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-error',
};
const statusDot: Record<StatusTone, string> = {
  neutral: 'bg-foreground',
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-error',
};
const openControlState = cn(openControlSurface, persistentControlText);
const pressedControlState = cn(pressedControlSurface, persistentControlText);
const activeControlState = cn(activeControlSurface, persistentControlText);

const menuItemBase = cn(
  'relative flex cursor-pointer select-none items-center gap-2 rounded-item px-2 outline-none transition-colors duration-[var(--motion-fast)] motion-reduce:transition-none',
  'focus:bg-accent focus:text-accent-foreground data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground',
  'data-[state=open]:bg-control-open-surface data-[state=open]:text-foreground data-[state=open]:focus:bg-control-open-surface data-[state=open]:focus:text-foreground data-[state=open]:data-[highlighted]:bg-control-open-surface data-[state=open]:data-[highlighted]:text-foreground',
  'data-[state=checked]:bg-control-pressed-surface data-[state=checked]:text-foreground data-[state=checked]:focus:bg-control-pressed-surface data-[state=checked]:focus:text-foreground data-[state=checked]:data-[highlighted]:bg-control-pressed-surface data-[state=checked]:data-[highlighted]:text-foreground',
  'data-[disabled]:pointer-events-none data-[disabled]:cursor-default data-[disabled]:opacity-50',
  "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
);

const controlShape: Record<Shape, string> = {
  auto: 'rounded-control',
  square: 'rounded-control',
  pill: 'rounded-full',
};

export const rx = {
  focusRing: () => focusRing,
  checkbox: cn(
    "peer size-3.5 shrink-0 cursor-pointer rounded-[4px] border border-input bg-field-surface shadow-xs transition-[background-color,border-color,box-shadow] duration-[var(--motion-fast)] motion-reduce:transition-none",
    focusRing,
    "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground disabled:pointer-events-none disabled:cursor-default disabled:opacity-50 [&_svg]:size-3"
  ),
  dialogOverlay: cn(
    'fixed inset-0 z-(--layer-modal-backdrop) bg-dialog-overlay',
    'data-[state=open]:animate-in data-[state=closed]:animate-out',
    'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
    'duration-[var(--motion-slow)] motion-reduce:animate-none'
  ),
  dialogShell: cn(
    'fixed left-1/2 top-1/2 z-(--layer-modal) grid w-full max-w-[calc(100%-2rem)]',
    '-translate-x-1/2 -translate-y-1/2 gap-5 overflow-hidden rounded-surface border-0 bg-dialog-surface p-5 shadow-dialog ring-1 ring-surface-ring outline-none sm:max-w-lg',
    'data-[state=open]:animate-in data-[state=closed]:animate-out',
    'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
    'data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 duration-[var(--motion-slow)] motion-reduce:animate-none'
  ),
  dialogHeader,
  dialogHeaderWithClose: cn(dialogHeader, 'pr-12'),
  dialogBody: 'min-w-0',
  dialogFooter: cn('flex flex-col-reverse gap-2', 'sm:flex-row sm:justify-end'),
  surface,
  contentScrollArea: cn(
    'group/content-scroll-area',
    '[&_[data-slot=scroll-area-scrollbar]]:opacity-0',
    'hover:[&_[data-slot=scroll-area-scrollbar]]:opacity-100',
    'focus-within:[&_[data-slot=scroll-area-scrollbar]]:opacity-100',
    '[&_[data-slot=scroll-area-thumb]]:bg-muted-foreground/25'
  ),
  dropdownPanel: cn(
    surface({ kind: 'overlay' }),
    'min-w-32 overflow-hidden p-1 text-popover-foreground outline-none'
  ),
  dropdownSubPanel: cn(
    surface({ kind: 'overlay' }),
    'min-w-32 overflow-hidden p-1 text-popover-foreground outline-none'
  ),
  portalLayer: ({ modal = false }: { modal?: boolean } = {}) =>
    modal ? 'z-(--layer-modal-popover)' : 'z-(--layer-popover)',
  overlayContent: ({ density = 'compact' }: { density?: Density } = {}) =>
    density === 'compact' ? 'p-2' : 'p-4',
  overlayMotion: cn(
    'data-[state=open]:animate-in data-[state=closed]:animate-out',
    'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
    'duration-[var(--motion-standard)] motion-reduce:animate-none'
  ),
  menuItem: ({
    density = 'compact',
    variant = 'default',
    selected = false,
    feedback,
  }: MenuItemOptions = {}) =>
    cn(
      menuItemBase,
      density === 'compact' && 'min-h-7 py-1 text-xs',
      density === 'default' && 'min-h-8 py-1.5 text-[13px]',
      variant === 'destructive' &&
        'text-destructive focus:bg-destructive-muted focus:text-destructive data-[highlighted]:bg-destructive-muted data-[highlighted]:text-destructive [&_svg]:text-destructive',
      selected && activeControlState,
      selected && variant === 'destructive' && destructivePersistentText,
      feedback && feedbackPersistentText[feedback]
    ),
  menuSeparator: '-mx-1 my-1 h-0.5 rounded-full bg-separator',
  control: ({
    tone = 'primary',
    size = 'md',
    shape = 'auto',
    outlined = false,
    active = false,
    pressed = false,
    open = false,
    destructive = false,
    feedback,
    status,
    subordinate = false,
    joined,
  }: ControlOptions = {}) => {
    const persistentState = active
      ? activeControlState
      : pressed
        ? pressedControlState
        : open
          ? openControlState
          : undefined;

    return cn(
      controlBase,
      controlTone[tone],
      controlSize[size],
      controlShape[shape],
      shape === 'square' && size === 'sm' && 'size-7 px-0',
      shape === 'square' && size === 'xs' && "size-6 px-0 [&_svg:not([class*='size-'])]:size-3.5",
      shape === 'square' && size === 'md' && 'size-8 px-0',
      shape === 'square' && size === 'lg' && 'size-9 px-0',
      tone === 'link' && 'h-auto px-0',
      subordinate &&
        'opacity-40 hover:opacity-100 data-[active=true]:opacity-100 data-[pressed=true]:opacity-100 data-[open=true]:opacity-100',
      destructive && 'text-destructive hover:bg-destructive-muted hover:text-destructive',
      joined === 'start' && 'rounded-r-none',
      joined === 'middle' && 'rounded-none',
      joined === 'end' && 'rounded-l-none',
      outlined && 'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground',
      persistentState,
      persistentState && destructive && destructivePersistentText,
      feedback && feedbackPersistentText[feedback],
      status && statusControlSurface[status],
      status === 'neutral' && persistentControlText,
      status && status !== 'neutral' && feedbackPersistentText[status]
    );
  },

  statusText: ({ tone = 'neutral' }: { tone?: StatusTone } = {}) => statusText[tone],
  statusDot: ({ tone = 'neutral' }: { tone?: StatusTone } = {}) =>
    cn('size-1 shrink-0 rounded-full', statusDot[tone]),

  selectableItem: ({
    orientation = 'horizontal',
    selected = false,
    muted = false,
    status,
  }: SelectableItemOptions = {}) =>
    cn(
      'inline-flex min-w-0 cursor-pointer items-center rounded-item bg-transparent transition-colors duration-[var(--motion-fast)] motion-reduce:transition-none',
      focusRing,
      'hover:bg-accent hover:text-accent-foreground',
      'data-[selected=true]:focus-visible:ring-0',
      'disabled:pointer-events-none disabled:cursor-default disabled:opacity-50',
      'min-h-7 gap-1.5 px-2 text-xs leading-4',
      orientation === 'vertical' && 'flex-col items-stretch',
      muted ? 'text-muted-foreground' : 'text-foreground',
      selected && activeControlState,
      status &&
        (selected
          ? selectedSelectableStatusSurface[status]
          : selectableStatusSurface[status])
    ),

  collectionCard: ({ selected = false }: CollectionCardOptions = {}) =>
    cn(
      'flex min-w-0 flex-col gap-1 rounded-item bg-transparent p-1 transition-[background-color,box-shadow] duration-[var(--motion-fast)] motion-reduce:transition-none',
      'hover:bg-control-open-surface',
      selected && 'bg-control-active-surface hover:bg-control-active-surface'
    ),

  swatchButton: ({ selected = false }: SwatchButtonOptions = {}) =>
    cn(
      'inline-flex size-6 cursor-pointer items-center justify-center rounded-full bg-transparent',
      focusRing,
      'disabled:pointer-events-none disabled:cursor-default disabled:opacity-50',
      selected && 'ring-2 ring-primary'
    ),

  tabsList: ({ variant = 'default' }: { variant?: 'default' | 'line' } = {}) =>
    cn(
      'group/tabs-list inline-flex w-fit items-center justify-center rounded-surface p-1 text-muted-foreground',
      'group-data-[orientation=horizontal]/tabs:h-9 group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col',
      variant === 'default'
        ? 'bg-secondary/70 ring-1 ring-surface-ring'
        : 'gap-1 rounded-none bg-transparent ring-0'
    ),

  tabsTrigger: ({ size = 'default', active = false }: TabTriggerOptions = {}) =>
    cn(
      'relative inline-flex h-[calc(100%-1px)] flex-1 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-control border border-transparent px-2 py-1 text-[13px] font-medium text-muted-foreground transition-[color,background-color,box-shadow] duration-[var(--motion-fast)] motion-reduce:transition-none',
      focusRing,
      'hover:text-foreground focus-visible:border-ring',
      'data-[state=active]:focus-visible:ring-0',
      'disabled:pointer-events-none disabled:cursor-default disabled:opacity-50 group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start',
      'data-[state=active]:border-tab-active-border data-[state=active]:bg-control-active-surface data-[state=active]:text-foreground data-[state=active]:hover:bg-control-active-surface data-[state=active]:hover:text-foreground data-[state=active]:focus:bg-control-active-surface data-[state=active]:focus:text-foreground',
      'group-data-[variant=default]/tabs-list:data-[state=active]:shadow-sm group-data-[variant=line]/tabs-list:data-[state=active]:border-transparent group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:hover:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:focus:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:shadow-none',
      'after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-[orientation=horizontal]/tabs:after:inset-x-0 group-data-[orientation=horizontal]/tabs:after:bottom-[-5px] group-data-[orientation=horizontal]/tabs:after:h-0.5 group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=vertical]/tabs:after:-right-1 group-data-[orientation=vertical]/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100',
      "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
      size === 'icon' &&
        'size-7 flex-none justify-center rounded-control p-0 hover:bg-accent hover:text-accent-foreground focus-visible:border-transparent focus-visible:outline-0 group-data-[variant=default]/tabs-list:data-[state=active]:shadow-none',
      active && activeControlState
    ),

  field: ({ density = 'default', invalid = false, appearance = 'default' }: FieldOptions = {}) =>
    cn(
      'w-full min-w-0 rounded-control transition-colors duration-[var(--motion-fast)] motion-reduce:transition-none',
      focusRing,
      density === 'default' && 'h-8 px-2.5 py-1.5 text-[13px]',
      density === 'compact' && 'h-7 px-2 py-1 text-[11px]',
      appearance === 'default' && 'border border-input bg-field-surface shadow-xs',
      appearance === 'quiet' && 'border-0 bg-transparent shadow-none',
      appearance === 'search' && 'border-0 bg-search-surface shadow-none',
      invalid && 'border-error aria-invalid:border-error'
    ),

  panelText: () => 'text-[13px] leading-5',
  panelHeading: () => 'text-xs leading-4 font-semibold',
};
