import type { AxisTransform } from './canvas-geometry.js';

/** Drawing subset shared by browser Canvas and native raster Hosts. */
export interface CharDeskCellCanvasContext {
  fillStyle: unknown;
  strokeStyle: unknown;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  save(): void;
  restore(): void;
  getTransform(): AxisTransform;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  measureText(
    text: string
  ): Pick<
    TextMetrics,
    | 'width'
    | 'actualBoundingBoxAscent'
    | 'actualBoundingBoxDescent'
    | 'actualBoundingBoxLeft'
    | 'actualBoundingBoxRight'
  >;
  fillText(text: string, x: number, y: number): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  beginPath(): void;
  closePath(): void;
  rect(x: number, y: number, width: number, height: number): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(
    x: number,
    y: number,
    radius: number,
    start: number,
    end: number,
    anticlockwise?: boolean
  ): void;
  ellipse(
    x: number,
    y: number,
    rx: number,
    ry: number,
    rotation: number,
    start: number,
    end: number,
    anticlockwise?: boolean
  ): void;
  bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): void;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  fill(rule?: CanvasFillRule): void;
  stroke(): void;
  clip(rule?: CanvasFillRule): void;
}
