/**
 * @license MIT
 * Box/Block subset of xterm.js, copyright (c) 2021 The xterm.js authors.
 * Pinned source: c58ea3637f3968e0e6e79cd92cf9aace7ef89ee2
 * addons/addon-webgl/src/customGlyphs/CustomGlyphDefinitions.ts
 *
 * Copyright (c) 2017-2019, The xterm.js authors (https://github.com/xtermjs/xterm.js)
 * Copyright (c) 2014-2016, SourceLair Private Company (https://www.sourcelair.com)
 * Copyright (c) 2012-2013, Christopher Jeffrey (https://github.com/chjj/)
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

const CustomGlyphDefinitionType = { PATH_FUNCTION: 0, SOLID_OCTANT_BLOCK_VECTOR: 1, BLOCK_PATTERN: 2, ROUND_CORNER: 3 } as const;
export type CellGraphicPart =
  | { type: typeof CustomGlyphDefinitionType.PATH_FUNCTION; data: string | ((xp: number, yp: number) => string); strokeWidth: number }
  | { type: typeof CustomGlyphDefinitionType.SOLID_OCTANT_BLOCK_VECTOR; data: { x: number; y: number; w: number; h: number }[] }
  | { type: typeof CustomGlyphDefinitionType.BLOCK_PATTERN; data: number[][] }
  | { type: typeof CustomGlyphDefinitionType.ROUND_CORNER; x: -1 | 1; y: -1 | 1; strokeWidth: number };
export { CustomGlyphDefinitionType };

const Shapes = {
  /** │ */ TOP_TO_BOTTOM: 'M.5,0 L.5,1',
  /** ─ */ LEFT_TO_RIGHT: 'M0,.5 L1,.5',

  /** └ */ TOP_TO_RIGHT: 'M.5,0 L.5,.5 L1,.5',
  /** ┘ */ TOP_TO_LEFT: 'M.5,0 L.5,.5 L0,.5',
  /** ┐ */ LEFT_TO_BOTTOM: 'M0,.5 L.5,.5 L.5,1',
  /** ┌ */ RIGHT_TO_BOTTOM: 'M0.5,1 L.5,.5 L1,.5',

  /** ╵ */ MIDDLE_TO_TOP: 'M.5,.5 L.5,0',
  /** ╴ */ MIDDLE_TO_LEFT: 'M.5,.5 L0,.5',
  /** ╶ */ MIDDLE_TO_RIGHT: 'M.5,.5 L1,.5',
  /** ╷ */ MIDDLE_TO_BOTTOM: 'M.5,.5 L.5,1',

  /** ┴ */ T_TOP: 'M0,.5 L1,.5 M.5,.5 L.5,0',
  /** ┤ */ T_LEFT: 'M.5,0 L.5,1 M.5,.5 L0,.5',
  /** ├ */ T_RIGHT: 'M.5,0 L.5,1 M.5,.5 L1,.5',
  /** ┬ */ T_BOTTOM: 'M0,.5 L1,.5 M.5,.5 L.5,1',

  /** ┼ */ CROSS: 'M0,.5 L1,.5 M.5,0 L.5,1',

  /** ╌ */ TWO_DASHES_HORIZONTAL: 'M.1,.5 L.4,.5 M.6,.5 L.9,.5', // .2 empty, .3 filled
  /** ┄ */ THREE_DASHES_HORIZONTAL: 'M.0667,.5 L.2667,.5 M.4,.5 L.6,.5 M.7333,.5 L.9333,.5', // .1333 empty, .2 filled
  /** ┉ */ FOUR_DASHES_HORIZONTAL: 'M.05,.5 L.2,.5 M.3,.5 L.45,.5 M.55,.5 L.7,.5 M.8,.5 L.95,.5', // .1 empty, .15 filled
  /** ╎ */ TWO_DASHES_VERTICAL: 'M.5,.1 L.5,.4 M.5,.6 L.5,.9',
  /** ┆ */ THREE_DASHES_VERTICAL: 'M.5,.0667 L.5,.2667 M.5,.4 L.5,.6 M.5,.7333 L.5,.9333',
  /** ┊ */ FOUR_DASHES_VERTICAL: 'M.5,.05 L.5,.2 M.5,.3 L.5,.45 L.5,.55 M.5,.7 L.5,.95',
}


export const cellGraphicDefinitions: Record<string, CellGraphicPart | CellGraphicPart[]> = {
// #region Box Drawing (2500-257F)

  // https://www.unicode.org/charts/PDF/U2500.pdf

  // Light and heavy solid lines (2500-2503)
  '─': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.LEFT_TO_RIGHT, strokeWidth: 1 },
  '━': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.LEFT_TO_RIGHT, strokeWidth: 3 },
  '│': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.TOP_TO_BOTTOM, strokeWidth: 1 },
  '┃': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.TOP_TO_BOTTOM, strokeWidth: 3 },

  // Light and heavy dashed lines (2504-250B)
  '┄': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.THREE_DASHES_HORIZONTAL, strokeWidth: 1 },
  '┅': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.THREE_DASHES_HORIZONTAL, strokeWidth: 3 },
  '┆': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.THREE_DASHES_VERTICAL, strokeWidth: 1 },
  '┇': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.THREE_DASHES_VERTICAL, strokeWidth: 3 },
  '┈': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.FOUR_DASHES_HORIZONTAL, strokeWidth: 1 },
  '┉': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.FOUR_DASHES_HORIZONTAL, strokeWidth: 3 },
  '┊': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.FOUR_DASHES_VERTICAL, strokeWidth: 1 },
  '┋': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.FOUR_DASHES_VERTICAL, strokeWidth: 3 },

  // Light and heavy line box components (250C-254B)
  '┌': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.RIGHT_TO_BOTTOM, strokeWidth: 1 },
  '┍': [{ type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_BOTTOM, strokeWidth: 1 }, { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_RIGHT, strokeWidth: 3 }],
  '┎': [{ type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_RIGHT, strokeWidth: 1 }, { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_BOTTOM, strokeWidth: 3 }],
  '┏': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.RIGHT_TO_BOTTOM, strokeWidth: 3 },
  '┐': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.LEFT_TO_BOTTOM, strokeWidth: 1 },
  '┑': [{ type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_BOTTOM, strokeWidth: 1 }, { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_LEFT, strokeWidth: 3 }],
  '┒': [{ type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_LEFT, strokeWidth: 1 }, { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_BOTTOM, strokeWidth: 3 }],
  '┓': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.LEFT_TO_BOTTOM, strokeWidth: 3 },
  '└': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.TOP_TO_RIGHT, strokeWidth: 1 },
  '┕': [{ type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_TOP, strokeWidth: 1 }, { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_RIGHT, strokeWidth: 3 }],
  '┖': [{ type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_RIGHT, strokeWidth: 1 }, { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_TOP, strokeWidth: 3 }],
  '┗': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.TOP_TO_RIGHT, strokeWidth: 3 },
  '┘': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.TOP_TO_LEFT, strokeWidth: 1 },
  '┙': [{ type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_TOP, strokeWidth: 1 }, { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_LEFT, strokeWidth: 3 }],
  '┚': [{ type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_LEFT, strokeWidth: 1 }, { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_TOP, strokeWidth: 3 }],
  '┛': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.TOP_TO_LEFT, strokeWidth: 3 },
  '├': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.T_RIGHT, strokeWidth: 1 },
  '┝': [{ type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.TOP_TO_BOTTOM, strokeWidth: 1 }, { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_RIGHT, strokeWidth: 3 }],
  '┞': [{ type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.RIGHT_TO_BOTTOM, strokeWidth: 1 }, { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_TOP, strokeWidth: 3 }],
  '┟': [{ type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.TOP_TO_RIGHT, strokeWidth: 1 }, { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_BOTTOM, strokeWidth: 3 }],
  '┠': [{ type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_RIGHT, strokeWidth: 1 }, { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.TOP_TO_BOTTOM, strokeWidth: 3 }],
  '┡': [{ type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_BOTTOM, strokeWidth: 1 }, { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.TOP_TO_RIGHT, strokeWidth: 3 }],
  '┢': [{ type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_TOP, strokeWidth: 1 }, { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.RIGHT_TO_BOTTOM, strokeWidth: 3 }],
  '┣': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.T_RIGHT, strokeWidth: 3 },
  '┤': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.T_LEFT, strokeWidth: 1 },
  '┥': [{ type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.TOP_TO_BOTTOM, strokeWidth: 1 }, { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_LEFT, strokeWidth: 3 }],
  '┦': [{ type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.LEFT_TO_BOTTOM, strokeWidth: 1 }, { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_TOP, strokeWidth: 3 }],
  '┧': [{ type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.TOP_TO_LEFT, strokeWidth: 1 }, { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_BOTTOM, strokeWidth: 3 }],
  '┨': [{ type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_LEFT, strokeWidth: 1 }, { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.TOP_TO_BOTTOM, strokeWidth: 3 }],
  '┩': [{ type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_BOTTOM, strokeWidth: 1 }, { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.TOP_TO_LEFT, strokeWidth: 3 }],
  '┪': [{ type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_TOP, strokeWidth: 1 }, { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.LEFT_TO_BOTTOM, strokeWidth: 3 }],
  '┫': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.T_LEFT, strokeWidth: 3 },
  '┬': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.T_BOTTOM, strokeWidth: 1 },
  '┭': [{ type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.RIGHT_TO_BOTTOM, strokeWidth: 1 }, { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_LEFT, strokeWidth: 3 }],
  '┮': [{ type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.LEFT_TO_BOTTOM, strokeWidth: 1 }, { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_RIGHT, strokeWidth: 3 }],
  '┯': [{ type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_BOTTOM, strokeWidth: 1 }, { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.LEFT_TO_RIGHT, strokeWidth: 3 }],
  '┰': [{ type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.LEFT_TO_RIGHT, strokeWidth: 1 }, { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_BOTTOM, strokeWidth: 3 }],
  '┱': [{ type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_RIGHT, strokeWidth: 1 }, { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.LEFT_TO_BOTTOM, strokeWidth: 3 }],
  '┲': [{ type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_LEFT, strokeWidth: 1 }, { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.RIGHT_TO_BOTTOM, strokeWidth: 3 }],
  '┳': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.T_BOTTOM, strokeWidth: 3 },
  '┴': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.T_TOP, strokeWidth: 1 },
  '┵': [{ type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.TOP_TO_RIGHT, strokeWidth: 1 }, { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_LEFT, strokeWidth: 3 }],
  '┶': [{ type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.TOP_TO_LEFT, strokeWidth: 1 }, { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_RIGHT, strokeWidth: 3 }],
  '┷': [{ type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_TOP, strokeWidth: 1 }, { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.LEFT_TO_RIGHT, strokeWidth: 3 }],
  '┸': [{ type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.LEFT_TO_RIGHT, strokeWidth: 1 }, { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_TOP, strokeWidth: 3 }],
  '┹': [{ type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_RIGHT, strokeWidth: 1 }, { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.TOP_TO_LEFT, strokeWidth: 3 }],
  '┺': [{ type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_LEFT, strokeWidth: 1 }, { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.TOP_TO_RIGHT, strokeWidth: 3 }],
  '┻': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.T_TOP, strokeWidth: 3 },
  '┼': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.CROSS, strokeWidth: 1 },
  '┽': [{ type: CustomGlyphDefinitionType.PATH_FUNCTION, data: `${Shapes.TOP_TO_BOTTOM} ${Shapes.MIDDLE_TO_RIGHT}`, strokeWidth: 1 }, { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_LEFT, strokeWidth: 3 }],
  '┾': [{ type: CustomGlyphDefinitionType.PATH_FUNCTION, data: `${Shapes.TOP_TO_BOTTOM} ${Shapes.MIDDLE_TO_LEFT}`, strokeWidth: 1 }, { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_RIGHT, strokeWidth: 3 }],
  '┿': [{ type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.TOP_TO_BOTTOM, strokeWidth: 1 }, { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.LEFT_TO_RIGHT, strokeWidth: 3 }],
  '╀': [{ type: CustomGlyphDefinitionType.PATH_FUNCTION, data: `${Shapes.LEFT_TO_RIGHT} ${Shapes.MIDDLE_TO_BOTTOM}`, strokeWidth: 1 }, { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_TOP, strokeWidth: 3 }],
  '╁': [{ type: CustomGlyphDefinitionType.PATH_FUNCTION, data: `${Shapes.MIDDLE_TO_TOP} ${Shapes.LEFT_TO_RIGHT}`, strokeWidth: 1 }, { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_BOTTOM, strokeWidth: 3 }],
  '╂': [{ type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.LEFT_TO_RIGHT, strokeWidth: 1 }, { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.TOP_TO_BOTTOM, strokeWidth: 3 }],
  '╃': [{ type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.RIGHT_TO_BOTTOM, strokeWidth: 1 }, { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.TOP_TO_LEFT, strokeWidth: 3 }],
  '╄': [{ type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.LEFT_TO_BOTTOM, strokeWidth: 1 }, { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.TOP_TO_RIGHT, strokeWidth: 3 }],
  '╅': [{ type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.TOP_TO_RIGHT, strokeWidth: 1 }, { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.LEFT_TO_BOTTOM, strokeWidth: 3 }],
  '╆': [{ type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.TOP_TO_LEFT, strokeWidth: 1 }, { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.RIGHT_TO_BOTTOM, strokeWidth: 3 }],
  '╇': [{ type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_BOTTOM, strokeWidth: 1 }, { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: `${Shapes.MIDDLE_TO_TOP} ${Shapes.LEFT_TO_RIGHT}`, strokeWidth: 3 }],
  '╈': [{ type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_TOP, strokeWidth: 1 }, { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: `${Shapes.LEFT_TO_RIGHT} ${Shapes.MIDDLE_TO_BOTTOM}`, strokeWidth: 3 }],
  '╉': [{ type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_RIGHT, strokeWidth: 1 }, { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: `${Shapes.TOP_TO_BOTTOM} ${Shapes.MIDDLE_TO_LEFT}`, strokeWidth: 3 }],
  '╊': [{ type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_LEFT, strokeWidth: 1 }, { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: `${Shapes.TOP_TO_BOTTOM} ${Shapes.MIDDLE_TO_RIGHT}`, strokeWidth: 3 }],
  '╋': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.CROSS, strokeWidth: 3 },

  // Light and heavy dashed lines (254C-254F)
  '╌': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.TWO_DASHES_HORIZONTAL, strokeWidth: 1 },
  '╍': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.TWO_DASHES_HORIZONTAL, strokeWidth: 3 },
  '╎': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.TWO_DASHES_VERTICAL, strokeWidth: 1 },
  '╏': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.TWO_DASHES_VERTICAL, strokeWidth: 3 },

  // Double lines (2550-2551)
  '═': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: (_xp, yp) => `M0,${.5 - yp} L1,${.5 - yp} M0,${.5 + yp} L1,${.5 + yp}`, strokeWidth: 1 },
  '║': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: (xp) => `M${.5 - xp},0 L${.5 - xp},1 M${.5 + xp},0 L${.5 + xp},1`, strokeWidth: 1 },

  // Light and double line box components (2552-256C)
  '╒': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: (_xp, yp) => `M.5,1 L.5,${.5 - yp} L1,${.5 - yp} M.5,${.5 + yp} L1,${.5 + yp}`, strokeWidth: 1 },
  '╓': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: (xp) => `M${.5 - xp},1 L${.5 - xp},.5 L1,.5 M${.5 + xp},.5 L${.5 + xp},1`, strokeWidth: 1 },
  '╔': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: (xp, yp) => `M1,${.5 - yp} L${.5 - xp},${.5 - yp} L${.5 - xp},1 M1,${.5 + yp} L${.5 + xp},${.5 + yp} L${.5 + xp},1`, strokeWidth: 1 },
  '╕': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: (_xp, yp) => `M0,${.5 - yp} L.5,${.5 - yp} L.5,1 M0,${.5 + yp} L.5,${.5 + yp}`, strokeWidth: 1 },
  '╖': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: (xp) => `M${.5 + xp},1 L${.5 + xp},.5 L0,.5 M${.5 - xp},.5 L${.5 - xp},1`, strokeWidth: 1 },
  '╗': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: (xp, yp) => `M0,${.5 + yp} L${.5 - xp},${.5 + yp} L${.5 - xp},1 M0,${.5 - yp} L${.5 + xp},${.5 - yp} L${.5 + xp},1`, strokeWidth: 1 },
  '╘': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: (_xp, yp) => `M.5,0 L.5,${.5 + yp} L1,${.5 + yp} M.5,${.5 - yp} L1,${.5 - yp}`, strokeWidth: 1 },
  '╙': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: (xp) => `M1,.5 L${.5 - xp},.5 L${.5 - xp},0 M${.5 + xp},.5 L${.5 + xp},0`, strokeWidth: 1 },
  '╚': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: (xp, yp) => `M1,${.5 - yp} L${.5 + xp},${.5 - yp} L${.5 + xp},0 M1,${.5 + yp} L${.5 - xp},${.5 + yp} L${.5 - xp},0`, strokeWidth: 1 },
  '╛': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: (_xp, yp) => `M0,${.5 + yp} L.5,${.5 + yp} L.5,0 M0,${.5 - yp} L.5,${.5 - yp}`, strokeWidth: 1 },
  '╜': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: (xp) => `M0,.5 L${.5 + xp},.5 L${.5 + xp},0 M${.5 - xp},.5 L${.5 - xp},0`, strokeWidth: 1 },
  '╝': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: (xp, yp) => `M0,${.5 - yp} L${.5 - xp},${.5 - yp} L${.5 - xp},0 M0,${.5 + yp} L${.5 + xp},${.5 + yp} L${.5 + xp},0`, strokeWidth: 1 },
  '╞': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: (_xp, yp) => `${Shapes.TOP_TO_BOTTOM} M.5,${.5 - yp} L1,${.5 - yp} M.5,${.5 + yp} L1,${.5 + yp}`, strokeWidth: 1 },
  '╟': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: (xp) => `M${.5 - xp},0 L${.5 - xp},1 M${.5 + xp},0 L${.5 + xp},1 M${.5 + xp},.5 L1,.5`, strokeWidth: 1 },
  '╠': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: (xp, yp) => `M${.5 - xp},0 L${.5 - xp},1 M1,${.5 + yp} L${.5 + xp},${.5 + yp} L${.5 + xp},1 M1,${.5 - yp} L${.5 + xp},${.5 - yp} L${.5 + xp},0`, strokeWidth: 1 },
  '╡': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: (_xp, yp) => `${Shapes.TOP_TO_BOTTOM} M0,${.5 - yp} L.5,${.5 - yp} M0,${.5 + yp} L.5,${.5 + yp}`, strokeWidth: 1 },
  '╢': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: (xp) => `M0,.5 L${.5 - xp},.5 M${.5 - xp},0 L${.5 - xp},1 M${.5 + xp},0 L${.5 + xp},1`, strokeWidth: 1 },
  '╣': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: (xp, yp) => `M${.5 + xp},0 L${.5 + xp},1 M0,${.5 + yp} L${.5 - xp},${.5 + yp} L${.5 - xp},1 M0,${.5 - yp} L${.5 - xp},${.5 - yp} L${.5 - xp},0`, strokeWidth: 1 },
  '╤': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: (_xp, yp) => `M0,${.5 - yp} L1,${.5 - yp} M0,${.5 + yp} L1,${.5 + yp} M.5,${.5 + yp} L.5,1`, strokeWidth: 1 },
  '╥': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: (xp) => `${Shapes.LEFT_TO_RIGHT} M${.5 - xp},.5 L${.5 - xp},1 M${.5 + xp},.5 L${.5 + xp},1`, strokeWidth: 1 },
  '╦': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: (xp, yp) => `M0,${.5 - yp} L1,${.5 - yp} M0,${.5 + yp} L${.5 - xp},${.5 + yp} L${.5 - xp},1 M1,${.5 + yp} L${.5 + xp},${.5 + yp} L${.5 + xp},1`, strokeWidth: 1 },
  '╧': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: (_xp, yp) => `M.5,0 L.5,${.5 - yp} M0,${.5 - yp} L1,${.5 - yp} M0,${.5 + yp} L1,${.5 + yp}`, strokeWidth: 1 },
  '╨': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: (xp) => `${Shapes.LEFT_TO_RIGHT} M${.5 - xp},.5 L${.5 - xp},0 M${.5 + xp},.5 L${.5 + xp},0`, strokeWidth: 1 },
  '╩': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: (xp, yp) => `M0,${.5 + yp} L1,${.5 + yp} M0,${.5 - yp} L${.5 - xp},${.5 - yp} L${.5 - xp},0 M1,${.5 - yp} L${.5 + xp},${.5 - yp} L${.5 + xp},0`, strokeWidth: 1 },
  '╪': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: (_xp, yp) => `${Shapes.TOP_TO_BOTTOM} M0,${.5 - yp} L1,${.5 - yp} M0,${.5 + yp} L1,${.5 + yp}`, strokeWidth: 1 },
  '╫': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: (xp) => `${Shapes.LEFT_TO_RIGHT} M${.5 - xp},0 L${.5 - xp},1 M${.5 + xp},0 L${.5 + xp},1`, strokeWidth: 1 },
  '╬': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: (xp, yp) => `M0,${.5 + yp} L${.5 - xp},${.5 + yp} L${.5 - xp},1 M1,${.5 + yp} L${.5 + xp},${.5 + yp} L${.5 + xp},1 M0,${.5 - yp} L${.5 - xp},${.5 - yp} L${.5 - xp},0 M1,${.5 - yp} L${.5 + xp},${.5 - yp} L${.5 + xp},0`, strokeWidth: 1 },

  // CharDesk adaptation: equal-radius circles replace upstream cubic cell arcs (256D-2570).
  '╭': { type: CustomGlyphDefinitionType.ROUND_CORNER, x: 1, y: 1, strokeWidth: 1 },
  '╮': { type: CustomGlyphDefinitionType.ROUND_CORNER, x: -1, y: 1, strokeWidth: 1 },
  '╯': { type: CustomGlyphDefinitionType.ROUND_CORNER, x: -1, y: -1, strokeWidth: 1 },
  '╰': { type: CustomGlyphDefinitionType.ROUND_CORNER, x: 1, y: -1, strokeWidth: 1 },

  // Character cell diagonals (2571-2573)
  '╱': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: 'M1,0 L0,1', strokeWidth: 1 },
  '╲': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: 'M0,0 L1,1', strokeWidth: 1 },
  '╳': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: 'M1,0 L0,1 M0,0 L1,1', strokeWidth: 1 },

  // Light and heavy half lines (2574-257B)
  '╴': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_LEFT, strokeWidth: 1 },
  '╵': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_TOP, strokeWidth: 1 },
  '╶': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_RIGHT, strokeWidth: 1 },
  '╷': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_BOTTOM, strokeWidth: 1 },
  '╸': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_LEFT, strokeWidth: 3 },
  '╹': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_TOP, strokeWidth: 3 },
  '╺': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_RIGHT, strokeWidth: 3 },
  '╻': { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_BOTTOM, strokeWidth: 3 },

  // Mixed light and heavy lines (257C-257F)
  '╼': [{ type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_LEFT, strokeWidth: 1 }, { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_RIGHT, strokeWidth: 3 }],
  '╽': [{ type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_TOP, strokeWidth: 1 }, { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_BOTTOM, strokeWidth: 3 }],
  '╾': [{ type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_RIGHT, strokeWidth: 1 }, { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_LEFT, strokeWidth: 3 }],
  '╿': [{ type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_BOTTOM, strokeWidth: 1 }, { type: CustomGlyphDefinitionType.PATH_FUNCTION, data: Shapes.MIDDLE_TO_TOP, strokeWidth: 3 }],

  // #endregion

  // #region Block elements (2580-259F)

  // https://www.unicode.org/charts/PDF/U2580.pdf

  // Block elements (2580-2590)
  '▀': { type: CustomGlyphDefinitionType.SOLID_OCTANT_BLOCK_VECTOR, data: [{ x: 0, y: 0, w: 8, h: 4 }] }, // UPPER HALF BLOCK
  '▁': { type: CustomGlyphDefinitionType.SOLID_OCTANT_BLOCK_VECTOR, data: [{ x: 0, y: 7, w: 8, h: 1 }] }, // LOWER ONE EIGHTH BLOCK
  '▂': { type: CustomGlyphDefinitionType.SOLID_OCTANT_BLOCK_VECTOR, data: [{ x: 0, y: 6, w: 8, h: 2 }] }, // LOWER ONE QUARTER BLOCK
  '▃': { type: CustomGlyphDefinitionType.SOLID_OCTANT_BLOCK_VECTOR, data: [{ x: 0, y: 5, w: 8, h: 3 }] }, // LOWER THREE EIGHTHS BLOCK
  '▄': { type: CustomGlyphDefinitionType.SOLID_OCTANT_BLOCK_VECTOR, data: [{ x: 0, y: 4, w: 8, h: 4 }] }, // LOWER HALF BLOCK
  '▅': { type: CustomGlyphDefinitionType.SOLID_OCTANT_BLOCK_VECTOR, data: [{ x: 0, y: 3, w: 8, h: 5 }] }, // LOWER FIVE EIGHTHS BLOCK
  '▆': { type: CustomGlyphDefinitionType.SOLID_OCTANT_BLOCK_VECTOR, data: [{ x: 0, y: 2, w: 8, h: 6 }] }, // LOWER THREE QUARTERS BLOCK
  '▇': { type: CustomGlyphDefinitionType.SOLID_OCTANT_BLOCK_VECTOR, data: [{ x: 0, y: 1, w: 8, h: 7 }] }, // LOWER SEVEN EIGHTHS BLOCK
  '█': { type: CustomGlyphDefinitionType.SOLID_OCTANT_BLOCK_VECTOR, data: [{ x: 0, y: 0, w: 8, h: 8 }] }, // FULL BLOCK (=solid -> 25A0=black square)
  '▉': { type: CustomGlyphDefinitionType.SOLID_OCTANT_BLOCK_VECTOR, data: [{ x: 0, y: 0, w: 7, h: 8 }] }, // LEFT SEVEN EIGHTHS BLOCK
  '▊': { type: CustomGlyphDefinitionType.SOLID_OCTANT_BLOCK_VECTOR, data: [{ x: 0, y: 0, w: 6, h: 8 }] }, // LEFT THREE QUARTERS BLOCK
  '▋': { type: CustomGlyphDefinitionType.SOLID_OCTANT_BLOCK_VECTOR, data: [{ x: 0, y: 0, w: 5, h: 8 }] }, // LEFT FIVE EIGHTHS BLOCK
  '▌': { type: CustomGlyphDefinitionType.SOLID_OCTANT_BLOCK_VECTOR, data: [{ x: 0, y: 0, w: 4, h: 8 }] }, // LEFT HALF BLOCK
  '▍': { type: CustomGlyphDefinitionType.SOLID_OCTANT_BLOCK_VECTOR, data: [{ x: 0, y: 0, w: 3, h: 8 }] }, // LEFT THREE EIGHTHS BLOCK
  '▎': { type: CustomGlyphDefinitionType.SOLID_OCTANT_BLOCK_VECTOR, data: [{ x: 0, y: 0, w: 2, h: 8 }] }, // LEFT ONE QUARTER BLOCK
  '▏': { type: CustomGlyphDefinitionType.SOLID_OCTANT_BLOCK_VECTOR, data: [{ x: 0, y: 0, w: 1, h: 8 }] }, // LEFT ONE EIGHTH BLOCK
  '▐': { type: CustomGlyphDefinitionType.SOLID_OCTANT_BLOCK_VECTOR, data: [{ x: 4, y: 0, w: 4, h: 8 }] }, // RIGHT HALF BLOCK

  // Shade characters (2591-2593)
  '░': { type: CustomGlyphDefinitionType.BLOCK_PATTERN, data: [ // LIGHT SHADE (25%)
    [1, 0],
    [0, 0]
  ] },
  '▒': { type: CustomGlyphDefinitionType.BLOCK_PATTERN, data: [ // MEDIUM SHADE (=speckles fill, dotted fill, 50%, used in mapping to cp949, -> 1FB90 inverse medium shade)
    [1, 0],
    [0, 1]
  ] },
  '▓': { type: CustomGlyphDefinitionType.BLOCK_PATTERN, data: [ // DARK SHADE (75%)
    [1, 1],
    [1, 0]
  ] },

  // Block elements (2594-2595)
  '▔': { type: CustomGlyphDefinitionType.SOLID_OCTANT_BLOCK_VECTOR, data: [{ x: 0, y: 0, w: 8, h: 1 }] }, // UPPER ONE EIGHTH BLOCK
  '▕': { type: CustomGlyphDefinitionType.SOLID_OCTANT_BLOCK_VECTOR, data: [{ x: 7, y: 0, w: 1, h: 8 }] }, // RIGHT ONE EIGHTH BLOCK

  // Terminal graphic characters (2596-259F)
  '▖': { type: CustomGlyphDefinitionType.SOLID_OCTANT_BLOCK_VECTOR, data: [{ x: 0, y: 4, w: 4, h: 4 }] },                             // QUADRANT LOWER LEFT
  '▗': { type: CustomGlyphDefinitionType.SOLID_OCTANT_BLOCK_VECTOR, data: [{ x: 4, y: 4, w: 4, h: 4 }] },                             // QUADRANT LOWER RIGHT
  '▘': { type: CustomGlyphDefinitionType.SOLID_OCTANT_BLOCK_VECTOR, data: [{ x: 0, y: 0, w: 4, h: 4 }] },                             // QUADRANT UPPER LEFT
  '▙': { type: CustomGlyphDefinitionType.SOLID_OCTANT_BLOCK_VECTOR, data: [{ x: 0, y: 0, w: 4, h: 8 }, { x: 0, y: 4, w: 8, h: 4 }] }, // QUADRANT UPPER LEFT AND LOWER LEFT AND LOWER RIGHT (-> 1F67F reverse checker board, -> 1FB95 checker board fill)
  '▚': { type: CustomGlyphDefinitionType.SOLID_OCTANT_BLOCK_VECTOR, data: [{ x: 0, y: 0, w: 4, h: 4 }, { x: 4, y: 4, w: 4, h: 4 }] }, // QUADRANT UPPER LEFT AND LOWER RIGHT
  '▛': { type: CustomGlyphDefinitionType.SOLID_OCTANT_BLOCK_VECTOR, data: [{ x: 0, y: 0, w: 4, h: 8 }, { x: 4, y: 0, w: 4, h: 4 }] }, // QUADRANT UPPER LEFT AND UPPER RIGHT AND LOWER LEFT
  '▜': { type: CustomGlyphDefinitionType.SOLID_OCTANT_BLOCK_VECTOR, data: [{ x: 0, y: 0, w: 8, h: 4 }, { x: 4, y: 0, w: 4, h: 8 }] }, // QUADRANT UPPER LEFT AND UPPER RIGHT AND LOWER RIGHT
  '▝': { type: CustomGlyphDefinitionType.SOLID_OCTANT_BLOCK_VECTOR, data: [{ x: 4, y: 0, w: 4, h: 4 }] },                             // QUADRANT UPPER RIGHT
  '▞': { type: CustomGlyphDefinitionType.SOLID_OCTANT_BLOCK_VECTOR, data: [{ x: 4, y: 0, w: 4, h: 4 }, { x: 0, y: 4, w: 4, h: 4 }] }, // QUADRANT UPPER RIGHT AND LOWER LEFT (-> 1F67E checker board, 1FB96 inverse checker board fill)
  '▟': { type: CustomGlyphDefinitionType.SOLID_OCTANT_BLOCK_VECTOR, data: [{ x: 4, y: 0, w: 4, h: 8 }, { x: 0, y: 4, w: 8, h: 4 }] }, // QUADRANT UPPER RIGHT AND LOWER LEFT AND LOWER RIGHT

  
};
