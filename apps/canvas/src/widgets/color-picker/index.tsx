'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pipette } from 'lucide-react';
import { HexColorPicker } from 'react-colorful';
import { useCanvasRuntime, useCanvasState } from '@/domains/canvas/public';
import type { CanvasColorPickerTarget } from '@/domains/canvas/public';
import { HOST_ICONOLOGY } from '@/shared/icons/iconology';
import { useUiI18n } from '@/shared/i18n';
import {
  cn,
  Button,
  ColorSwatch,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Surface,
  SwatchButton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipCreateHandle,
  TooltipPopup,
  TooltipTrigger,
  resolveColorPickerPalettes,
  type ColorPaletteAppearance,
} from '@chardesk/ui';









type ColorPickerPanelProps = {
  value: string;
  onPick: (color: string) => void;
  appearance: ColorPaletteAppearance;
  density?: 'default' | 'compact';
  defaultColor?: string;
  onReset?: () => void;
  showCustomInput?: boolean;
  showCanvasPicker?: boolean;
  onCanvasPickStarted?: () => void;
  className?: string;
  canvasPickDestination?: 'foreground' | 'background';
};

const normalizeHexColor = (value: string) => {
  const trimmed = value.trim().replace(/^#?/, '#').toLowerCase();

  if (/^#[0-9a-f]{3}$/.test(trimmed)) {
    return `#${trimmed
      .slice(1)
      .split('')
      .map((char) => `${char}${char}`)
      .join('')}`;
  }

  return /^#[0-9a-f]{6}$/.test(trimmed) ? trimmed : null;
};

function CanvasColorPickerAction({
  destination,
  onStarted,
  size,
}: {
  destination: 'foreground' | 'background';
  onStarted?: () => void;
  size: 'xs' | 'sm';
}) {
  const canvas = useCanvasRuntime();
  const { t } = useUiI18n();
  const canvasColorPickerTarget = useCanvasState((state) => state.interaction.canvasColorPickerTarget);
  const setCanvasColorPickerTarget = canvas.commands.interaction.setColorPickerTarget;
  const toggleCanvasColorPicker = () => {
    const target: CanvasColorPickerTarget =
      destination === 'background' ? 'auto-to-background' : 'auto';
    const nextTarget = canvasColorPickerTarget === target ? null : target;
    setCanvasColorPickerTarget(nextTarget);
    if (nextTarget) onStarted?.();
  };

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            tone="subtle"
            shape="square"
            size={size}
            aria-label={t('color.pickFromCanvas')}
            pressed={canvasColorPickerTarget !== null}
            className="shrink-0"
            onClick={toggleCanvasColorPicker}
          />
        }
      >
        <Pipette />
      </TooltipTrigger>
      <TooltipPopup side="bottom">{t('color.pickFromCanvas')}</TooltipPopup>
    </Tooltip>
  );
}

export function ColorPickerPanel({
  value,
  onPick,
  appearance,
  density = 'default',
  defaultColor,
  onReset,
  showCustomInput = true,
  showCanvasPicker = true,
  onCanvasPickStarted,
  className,
  canvasPickDestination = 'foreground',
}: ColorPickerPanelProps) {
  const { t } = useUiI18n();
  const [customColor, setCustomColor] = useState(value);
  const [hexPopoverOpen, setHexPopoverOpen] = useState(false);
  const [activePaletteTab, setActivePaletteTab] = useState<'ansi16' | 'presets'>('ansi16');
  const tooltipHandle = useMemo(() => TooltipCreateHandle<ReactNode>(), []);
  const panelRef = useRef<HTMLDivElement>(null);
  const colorToolRef = useRef<HTMLDivElement>(null);
  const hexInputRef = useRef<HTMLInputElement>(null);
  const hexCloseHandledRef = useRef(false);
  const normalizedCustomColor = normalizeHexColor(customColor);
  const normalizedValue = normalizeHexColor(value);
  const displayColor = normalizedCustomColor ?? normalizedValue ?? '#000000';
  const RestoreDefaultIcon = HOST_ICONOLOGY.colorPalette.restoreDefault;
  const headerActionSize = density === 'compact' ? 'xs' : 'sm';
  const palettes = resolveColorPickerPalettes(appearance);

  useEffect(() => {
    setCustomColor(value);
  }, [value]);

  const cancelCustomColor = () => {
    if (hexCloseHandledRef.current) return;
    hexCloseHandledRef.current = true;
    setCustomColor(value);
    setHexPopoverOpen(false);
  };

  const pickColor = (color: string) => {
    setCustomColor(color);
    setHexPopoverOpen(false);
    onPick(color);
  };

  const commitCustomColor = () => {
    if (hexCloseHandledRef.current) return;
    hexCloseHandledRef.current = true;
    if (!normalizedCustomColor) {
      setCustomColor(value);
      setHexPopoverOpen(false);
      return;
    }

    setCustomColor(normalizedCustomColor);
    setHexPopoverOpen(false);
    if (normalizedCustomColor !== normalizeHexColor(value)) {
      onPick(normalizedCustomColor);
    }
  };

  const paletteTabs = [
    {
      id: 'ansi16',
      label: t('color.ansi16'),
      icon: HOST_ICONOLOGY.colorPalette.ansi16,
      colors: palettes.ansi16,
      colorLabelKey: 'color.pickAnsi',
      gridClassName: 'grid-cols-4',
    },
    {
      id: 'presets',
      label: t('color.presets'),
      icon: HOST_ICONOLOGY.colorPalette.presets,
      colors: palettes.presets,
      colorLabelKey: 'color.pickPreset',
      gridClassName: 'grid-cols-5',
    },
  ] as const;

  return (
    <Tabs
      ref={panelRef}
      value={activePaletteTab}
      onValueChange={(tab) => {
        cancelCustomColor();
        setActivePaletteTab(tab as 'ansi16' | 'presets');
      }}
      orientation="horizontal"
      data-color-picker-panel="true"
      data-density={density}
      className={cn('w-40 gap-2 px-1 py-1.5', className)}
    >
      <div data-testid="color-picker-header" className="flex items-center justify-between gap-0.5">
        <Surface kind="embedded" asChild>
          <TabsList
            aria-label={t('color.paletteTabs')}
            className="h-fit w-fit shrink-0 flex-row gap-0.5 p-px"
          >
            {paletteTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <TooltipTrigger
                  key={tab.id}
                  handle={tooltipHandle}
                  payload={tab.label}
                  render={
                    <TabsTrigger
                      value={tab.id}
                      size="icon"
                      active={activePaletteTab === tab.id}
                      aria-label={tab.label}
                    />
                  }
                >
                  <Icon />
                </TooltipTrigger>
              );
            })}
          </TabsList>
        </Surface>

        {showCustomInput && (
          <div data-testid="color-picker-header-actions" className="flex items-center gap-0.5">
            <Popover
              open={hexPopoverOpen}
              onOpenChange={(open) => {
                if (open) {
                  hexCloseHandledRef.current = false;
                  setCustomColor(value);
                  setHexPopoverOpen(true);
                  return;
                }

                commitCustomColor();
              }}
            >
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  tone="subtle"
                  shape="square"
                  size={headerActionSize}
                  aria-label={`${t('color.hex')}: ${displayColor}`}
                  open={hexPopoverOpen}
                  className="shrink-0"
                >
                  <ColorSwatch
                    data-testid="color-value-icon"
                    aria-hidden="true"
                    color={displayColor}
                    shape="circle"
                    className="size-4"
                  />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                ref={colorToolRef}
                side="right"
                align="start"
                sideOffset={6}
                aria-label={t('color.hex')}
                className="flex w-40 flex-col gap-2"
                onOpenAutoFocus={(event) => {
                  event.preventDefault();
                  hexInputRef.current?.focus({ preventScroll: true });
                  hexInputRef.current?.select();
                }}
                onEscapeKeyDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  cancelCustomColor();
                }}
                onInteractOutside={(event) => {
                  if (event.target instanceof Node && panelRef.current?.contains(event.target)) {
                    cancelCustomColor();
                    return;
                  }
                  commitCustomColor();
                }}
              >
                <HexColorPicker
                  color={displayColor}
                  onChange={setCustomColor}
                  data-testid="visual-color-picker"
                  className={cn(
                    '!h-32 !w-full',
                    '[&_.react-colorful__saturation]:!rounded-md [&_.react-colorful__saturation]:!border-b-0',
                    '[&_.react-colorful__hue]:!mt-2 [&_.react-colorful__hue]:!h-2 [&_.react-colorful__hue]:!rounded-full',
                    '[&_.react-colorful__pointer]:!size-3.5 [&_.react-colorful__pointer]:!border-[1.5px]'
                  )}
                />
                <Input
                  ref={hexInputRef}
                  aria-label={t('color.hex')}
                  value={customColor}
                  onChange={(event) => setCustomColor(event.target.value)}
                  onBlur={(event) => {
                    if (
                      event.relatedTarget instanceof Node &&
                      colorToolRef.current?.contains(event.relatedTarget)
                    ) {
                      return;
                    }
                    if (
                      event.relatedTarget instanceof Node &&
                      panelRef.current?.contains(event.relatedTarget)
                    ) {
                      cancelCustomColor();
                      return;
                    }
                    commitCustomColor();
                  }}
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      commitCustomColor();
                    }
                  }}
                  onClick={(event) => event.stopPropagation()}
                  placeholder="#00ffcc"
                  maxLength={7}
                  appearance="search"
                  density="compact"
                  className="h-6 px-1.5 font-mono uppercase"
                />
              </PopoverContent>
            </Popover>

            {showCanvasPicker ? (
              <CanvasColorPickerAction
                destination={canvasPickDestination}
                onStarted={onCanvasPickStarted}
                size={headerActionSize}
              />
            ) : null}

            {(defaultColor || onReset) && (
              <TooltipTrigger
                handle={tooltipHandle}
                payload={t('color.restoreDefault')}
                render={
                  <Button
                    type="button"
                    tone="subtle"
                    shape="square"
                    size={headerActionSize}
                    aria-label={t('color.restoreDefault')}
                    className="shrink-0"
                    onClick={() => {
                      if (onReset) onReset();
                      else if (defaultColor) pickColor(defaultColor);
                    }}
                  />
                }
              >
                <RestoreDefaultIcon />
              </TooltipTrigger>
            )}
          </div>
        )}
      </div>

      <div data-testid="color-picker-content-frame" className="w-full min-w-0">
        {paletteTabs.map((tab) => (
          <TabsContent key={tab.id} value={tab.id} className="flex flex-col">
            <div
              data-testid="color-palette-grid"
              className={cn('grid justify-items-center gap-y-1', tab.gridClassName)}
            >
              {tab.colors.map((color) => (
                <SwatchButton
                  key={color}
                  color={color}
                  selected={normalizedValue === color}
                  aria-label={t(tab.colorLabelKey, { color })}
                  onClick={() => pickColor(color)}
                />
              ))}
            </div>
          </TabsContent>
        ))}
      </div>
      <Tooltip handle={tooltipHandle}>
        {({ payload }) => <TooltipPopup side="bottom">{payload}</TooltipPopup>}
      </Tooltip>
    </Tabs>
  );
}
