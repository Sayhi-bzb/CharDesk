export const drawingTools = [
  { id: 'select', label: 'Text and selection' },
  { id: 'brush', label: 'Brush' },
  { id: 'eraser', label: 'Eraser' },
  { id: 'fill', label: 'Recolor existing text' },
  { id: 'box', label: 'Box' },
  { id: 'splitBox', label: 'Split box' },
  { id: 'line', label: 'Elbow line' },
  { id: 'stepline', label: 'Step line' },
  { id: 'circle', label: 'Circle' },
  { id: 'bg', label: 'Background' },
] as const;
export function drawingLabel(tool: string) {
  const item = drawingTools.find((item) => item.id === tool);
  return item?.label ?? tool;
}
