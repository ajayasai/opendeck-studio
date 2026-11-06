/** Geometry is in CSS pixels at 96 DPI. Text size is in points (1pt = 4/3 px). */
export interface ElementBase {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  locked: boolean;
  animation: 'none' | 'fade' | 'rise';
}
export interface TextFrame {
  /** Signed CSS pixels at 96 DPI; negative insets extend the content area. */
  insets: { top: number; right: number; bottom: number; left: number };
  wrap: 'square' | 'none';
  horizontalOverflow: 'overflow' | 'clip';
  verticalOverflow: 'overflow' | 'clip';
}
export type TextAutoFit =
  | { mode: 'none' }
  | { mode: 'shrink'; fontScale: number; lineSpacingReduction: number }
  | { mode: 'resize' };
export interface TextElement extends ElementBase {
  type: 'text';
  text: string;
  fontSize: number;
  fontFamily: string;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: 'left' | 'center' | 'right';
  verticalAlign: 'top' | 'middle' | 'bottom';
  /** Optional rich representation. text remains the exact plain-text projection. */
  paragraphs?: TextParagraph[];
  /** Absent in legacy files: zero insets, square wrapping, and clipping on both axes. */
  textFrame?: TextFrame;
  /** Saved fitting result; base run sizes remain unchanged. Absence means no fitting. */
  autoFit?: TextAutoFit;
}
export interface TextRun {
  text: string;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  hyperlink?: string;
}
export interface TextParagraph {
  runs: TextRun[];
  align?: 'left' | 'center' | 'right';
  bullet?: { kind: 'bullet' | 'number'; level: number; start?: number; character?: string };
  /** Line height multiplier and spacing before/after in points. */
  lineSpacing?: number;
  /** Exact line height in points, mutually exclusive with relative lineSpacing. */
  lineSpacingPoints?: number;
  spaceBefore?: number;
  spaceAfter?: number;
}
export interface ShapeElement extends ElementBase {
  type: 'shape';
  shape: 'rect' | 'roundRect' | 'ellipse' | 'triangle' | 'line' | 'arrow';
  fill: string;
  stroke: string;
  strokeWidth: number;
}
export interface ImageElement extends ElementBase {
  type: 'image';
  src: string;
  alt: string;
  fit: 'contain' | 'cover';
}
export interface TableElement extends ElementBase {
  type: 'table';
  rows: string[][];
  header: boolean;
  color: string;
  fill: string;
  fontSize: number;
}
export interface ChartElement extends ElementBase {
  type: 'chart';
  chartType: 'bar' | 'line' | 'pie';
  labels: string[];
  values: number[];
  color: string;
}
export type SlideElement = TextElement | ShapeElement | ImageElement | TableElement | ChartElement;
export interface Slide {
  id: string;
  name: string;
  background: string;
  elements: SlideElement[];
  notes: string;
  transition: 'none' | 'fade' | 'slide';
  hidden: boolean;
}
export interface Theme {
  id: string;
  name: string;
  background: string;
  foreground: string;
  accent: string;
  muted: string;
  fontFamily: string;
}
export interface Deck {
  schemaVersion: 1;
  id: string;
  title: string;
  width: number;
  height: number;
  theme: Theme;
  slides: Slide[];
  updatedAt: string;
}
export interface ImportResult {
  deck: Deck;
  warnings: string[];
}
