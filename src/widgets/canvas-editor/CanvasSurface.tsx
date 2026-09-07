import {
  forwardRef,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
  type RefObject,
  type TextareaHTMLAttributes,
} from 'react';
import { StructuredSplitToolbar } from './StructuredSplitToolbar';
import type { CanvasSurfaceGeometry } from './canvasSurfaceGeometry';
import { EditorWidget, type EditorViewportFrame } from '@/widgets/editor-chrome/public';

type CanvasSurfaceProps = HTMLAttributes<HTMLDivElement> & {
  containerRef: RefObject<HTMLDivElement | null>;
  contentCanvasRef: RefObject<HTMLCanvasElement | null>;
  interactionCanvasRef: RefObject<HTMLCanvasElement | null>;
  surfaceGeometry: CanvasSurfaceGeometry | undefined;
  containerSize: { width: number; height: number } | undefined;
  viewportFrame?: EditorViewportFrame;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  textareaKey?: string;
  textareaStyle: CSSProperties;
  textareaProps: TextareaHTMLAttributes<HTMLTextAreaElement>;
  children?: ReactNode;
  interactionUi?: boolean;
};

const assignRef = <T,>(ref: Ref<T> | undefined, value: T | null) => {
  if (typeof ref === 'function') ref(value);
  else if (ref) ref.current = value;
};

export const CanvasSurface = forwardRef<HTMLDivElement, CanvasSurfaceProps>(function CanvasSurface(
  {
    containerRef,
    contentCanvasRef,
    interactionCanvasRef,
    surfaceGeometry,
    containerSize,
    viewportFrame,
    textareaRef,
    textareaKey,
    textareaStyle,
    textareaProps,
    children,
    interactionUi = true,
    className,
    style,
    ...surfaceProps
  },
  forwardedRef
) {
  const canvasStyle: CSSProperties = surfaceGeometry
    ? {
        left: surfaceGeometry.left,
        top: surfaceGeometry.top,
        width: surfaceGeometry.width,
        height: surfaceGeometry.height,
      }
    : { inset: 0, width: '100%', height: '100%' };

  return (
    <div
      ref={(node) => {
        assignRef(containerRef, node);
        assignRef(forwardedRef, node);
      }}
      data-slot="canvas-surface"
      data-testid="canvas-editor-surface"
      data-onboarding-target="canvas"
      style={{ touchAction: 'none', ...style }}
      className={
        className ??
        'relative size-full overflow-hidden bg-background touch-none select-none'
      }
      {...surfaceProps}
    >
      <div
        data-testid="canvas-viewport-layer"
        className="absolute inset-0 pointer-events-none"
      >
        <canvas
          ref={contentCanvasRef}
          data-canvas-layer="content"
          className="absolute block pointer-events-none"
          style={canvasStyle}
        />
        <canvas
          ref={interactionCanvasRef}
          data-canvas-layer="interaction"
          className="absolute block pointer-events-none"
          style={canvasStyle}
        />
      </div>
      {children}
      {interactionUi && (
        <EditorWidget role="contextual">
          <StructuredSplitToolbar
            containerSize={containerSize}
            viewportFrame={viewportFrame}
          />
        </EditorWidget>
      )}
      <textarea
        key={textareaKey}
        ref={textareaRef}
        data-canvas-managed-input="true"
        style={textareaStyle}
        {...textareaProps}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />
    </div>
  );
});
