export type CellGraphicOctant = Readonly<{ x: number; y: number; w: number; h: number }>;

export type CellGraphicPathFactory = (xp: number, yp: number) => string;

export const CustomGlyphVectorType = {
  FILL: 0,
  STROKE: 1,
} as const;
export type CustomGlyphVectorType = typeof CustomGlyphVectorType[keyof typeof CustomGlyphVectorType];

export const CustomGlyphScaleType = {
  CELL: 0,
  CHAR: 1,
} as const;
export type CustomGlyphScaleType = typeof CustomGlyphScaleType[keyof typeof CustomGlyphScaleType];

export const CustomGlyphDefinitionType = {
  SOLID_OCTANT_BLOCK_VECTOR: 0,
  BLOCK_PATTERN: 1,
  PATH_FUNCTION: 2,
  PATH: 3,
  PATH_NEGATIVE: 4,
  VECTOR_SHAPE: 5,
  BRAILLE: 6,
  ROUND_CORNER: 7,
} as const;

export type CellGraphicVectorShape = Readonly<{
  d: string;
  type: CustomGlyphVectorType;
  leftPadding?: number;
  rightPadding?: number;
}>;

type CellGraphicPartData =
  | { type: typeof CustomGlyphDefinitionType.SOLID_OCTANT_BLOCK_VECTOR; data: CellGraphicOctant[] }
  | { type: typeof CustomGlyphDefinitionType.BLOCK_PATTERN; data: number[][] }
  | { type: typeof CustomGlyphDefinitionType.PATH_FUNCTION; data: CellGraphicPathFactory | string }
  | { type: typeof CustomGlyphDefinitionType.PATH; data: string }
  | { type: typeof CustomGlyphDefinitionType.PATH_NEGATIVE; data: CellGraphicVectorShape }
  | { type: typeof CustomGlyphDefinitionType.VECTOR_SHAPE; data: CellGraphicVectorShape }
  | { type: typeof CustomGlyphDefinitionType.BRAILLE; data: number }
  | { type: typeof CustomGlyphDefinitionType.ROUND_CORNER; x: -1 | 1; y: -1 | 1 };

export type CustomGlyphDefinitionPart = CellGraphicPartData & Readonly<{
  clipPath?: string;
  strokeWidth?: number;
  scaleType?: CustomGlyphScaleType;
}>;

export type CustomGlyphCharacterDefinition =
  | CustomGlyphDefinitionPart
  | readonly CustomGlyphDefinitionPart[];

// Names retained so the pinned xterm.js definitions can remain source-shaped.
export type CustomGlyphDefinitionPartRaw = CellGraphicPartData;
export type CustomGlyphPathDrawFunctionDefinition = CellGraphicPathFactory;
export type CustomGlyphPatternDefinition = number[][];
export type ICustomGlyphSolidOctantBlockVector = CellGraphicOctant;
export type ICustomGlyphVectorShape = CellGraphicVectorShape;
