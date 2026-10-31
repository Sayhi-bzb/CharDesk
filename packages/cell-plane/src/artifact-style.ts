import { COLOR_PRIMARY_TEXT } from './constants.js';
export const isDefaultArtifactForeground = (style: Readonly<{ color: string; bgColor?: string }>) =>
  style.color.toLowerCase() === COLOR_PRIMARY_TEXT.toLowerCase() && style.bgColor === undefined;
