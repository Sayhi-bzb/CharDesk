export const PLAYGROUND_ROWS = 7;
export const MIN_SPLIT_COLUMNS = 64;
export const PLAYGROUND_CONTROL_COLUMNS = 28;

type ComponentPlaygroundLayout = Readonly<{
  stacked: boolean;
  viewport: Readonly<{ width: number; height: number }>;
  previewColumns: number;
  propsColumns: number;
  controlsInset: number;
  controlsExtentColumns: number;
  controlsMinRows: number;
}>;

const wholeColumns = (value: number, minimum = 1): number =>
  Math.max(minimum, Math.floor(Number.isFinite(value) ? value : minimum));

export const columnsForPixelWidth = (pixelWidth: number, cellWidth: number): number =>
  wholeColumns(pixelWidth / Math.max(1, cellWidth));

export const resolveComponentPlaygroundLayout = (
  totalColumns: number,
  previewMinColumns: number,
  controlsColumns: number,
  hasControls = true,
  rows = PLAYGROUND_ROWS,
): ComponentPlaygroundLayout => {
  const width = wholeColumns(totalColumns);
  if (!hasControls) return {
    stacked: false,
    viewport: { width, height: rows },
    previewColumns: width,
    propsColumns: 0,
    controlsInset: 0,
    controlsExtentColumns: 0,
    controlsMinRows: 0,
  };
  const previewMinimum = wholeColumns(previewMinColumns);
  const controlsWidth = wholeColumns(controlsColumns);
  const stacked = width < MIN_SPLIT_COLUMNS;
  const usableColumns = stacked ? width : width - 1;
  const previewColumns = stacked
    ? width
    : Math.min(
        Math.max(Math.floor(usableColumns / 2), previewMinimum),
        usableColumns - 2,
      );
  const propsColumns = stacked ? width : usableColumns - previewColumns;
  // Reserve one column for a possible vertical rail so tall controls do not
  // create horizontal overflow solely because the rail appeared.
  const propsContentColumns = Math.max(1, propsColumns - 1);
  const controlsInset = Math.max(
    0,
    Math.floor((propsContentColumns - controlsWidth) / 2),
  );
  const horizontalOverflow = controlsWidth > propsContentColumns;

  return {
    stacked,
    viewport: {
      width,
      height: stacked ? rows * 2 + 1 : rows,
    },
    previewColumns,
    propsColumns,
    controlsInset,
    controlsExtentColumns: Math.max(
      propsContentColumns,
      controlsInset + controlsWidth,
    ),
    controlsMinRows: rows - (horizontalOverflow ? 1 : 0),
  };
};
