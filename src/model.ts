import type { Deck, Slide, SlideElement, Theme, TextElement, ShapeElement } from './types';
import { validateParagraphs } from './richText';
import { validateTextFrame } from './textFrame';
import { validateAutoFit } from './textFit';
import { validateTextDecoration } from './textDecoration';
import { validateGradientFill } from './gradient';
import { validateImageRect } from './imageGeometry';

export const uid = (): string =>
  globalThis.crypto?.randomUUID?.() ??
  `od-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/** Choose the more legible of our dark and light text colors using WCAG luminance. */
export function contrastText(color: string): string {
  const luminance = (hex: string) => {
    const channels = [1, 3, 5]
      .map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
      .map((channel) =>
        channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
      );
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  if (!/^#[0-9a-f]{6}$/i.test(color)) return '#172E29';
  const background = luminance(color),
    dark = luminance('#172E29');
  const darkContrast = (Math.max(background, dark) + 0.05) / (Math.min(background, dark) + 0.05);
  const lightContrast = 1.05 / (background + 0.05);
  return darkContrast >= lightContrast ? '#172E29' : '#FFFFFF';
}

export const THEMES: Theme[] = [
  {
    id: 'verdant',
    name: 'Verdant',
    background: '#f5f4ec',
    foreground: '#163c31',
    accent: '#b7d887',
    muted: '#617769',
    fontFamily: 'Arial',
  },
  {
    id: 'midnight',
    name: 'Midnight',
    background: '#17243c',
    foreground: '#f5f8ff',
    accent: '#a5b8ff',
    muted: '#a8b6ce',
    fontFamily: 'Arial',
  },
  {
    id: 'terracotta',
    name: 'Terracotta',
    background: '#fbf0e7',
    foreground: '#4b2925',
    accent: '#d78161',
    muted: '#916d64',
    fontFamily: 'Georgia',
  },
  {
    id: 'paper',
    name: 'Paper',
    background: '#ffffff',
    foreground: '#202632',
    accent: '#4976db',
    muted: '#768090',
    fontFamily: 'Arial',
  },
  {
    id: 'orchid',
    name: 'Orchid',
    background: '#f5effc',
    foreground: '#422d61',
    accent: '#bb9ce4',
    muted: '#8a759d',
    fontFamily: 'Arial',
  },
];

const base = (name: string, x = 100, y = 100, width = 360, height = 150) => ({
  id: uid(),
  name,
  x,
  y,
  width,
  height,
  rotation: 0,
  opacity: 1,
  locked: false,
  animation: 'none' as const,
});
const text = (
  theme: Theme,
  value: string,
  x: number,
  y: number,
  width: number,
  height: number,
  size = 28,
  bold = false,
): TextElement => ({
  ...base(value.slice(0, 36) || 'Text', x, y, width, height),
  type: 'text',
  text: value,
  fontSize: size,
  fontFamily: theme.fontFamily,
  color: theme.foreground,
  bold,
  italic: false,
  underline: false,
  align: 'left',
  verticalAlign: 'top',
});
const shape = (
  kind: ShapeElement['shape'],
  fill: string,
  x: number,
  y: number,
  width: number,
  height: number,
): ShapeElement => ({
  ...base(kind, x, y, width, height),
  type: 'shape',
  shape: kind,
  fill,
  stroke: fill,
  strokeWidth: 0,
});

// Original embedded artwork: a small raster swatch. No network request is needed.
const SAMPLE_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAIAAABt+uBvAAABfklEQVR42u3cu3FDMQxEUVahPpyrP5XkVlyEQjl3AQ7eh9gFCN4ZVHAyEtgd3z+vavN4ftWZURColN1iQH6shYE8Uh2ApFKtgBRMDYFimdoCRRl1Bgph6g80abQF0AzTRkD3jPYCumG0HdBVox2BLhltCnTeaF+gk0ZbA50x2h3o0AigAyOAAJozAujACCCA5oySgX4/7zOTaDQqu6RIJQPdpnEy5QCF0HiYEoDCdWxGY10dqZEPSKqjMzIBGXTURqOBjshIC2TWURgJgVJ0REYA2YESdcKNALIDpeuEGwEEUB2gIjqxRgABBBBAAAG0MFBgrAEggAACCCCA1gWqYxT5mgcIoEpAFYxivwABsgPlGoUvaQDKAMoyUmyJh671ooGOFshppDviGep6maV1HEBqI/UJ4fDUFC2q4wNSGHkOmIe5EmwhmhygSSZ/rCQH6KpUYh4pGej/VEuQAQQQQAABBBBAAAEEEEAAAQQQQAABBBBAAAEEEEAAAdQC6A+hSfnsBwpYOAAAAABJRU5ErkJggg==';

export function createElement<T extends SlideElement['type']>(
  type: T,
  theme: Theme,
): Extract<SlideElement, { type: T }>;
export function createElement(type: SlideElement['type'], theme: Theme): SlideElement {
  switch (type) {
    case 'text':
      return text(theme, 'Your next big idea', 100, 100, 520, 100, 32);
    case 'shape':
      return shape('roundRect', theme.accent, 120, 160, 260, 180);
    case 'image':
      return {
        ...base('Image', 120, 160, 360, 260),
        type: 'image',
        src: SAMPLE_IMAGE,
        alt: 'Replace this image with your own',
        fit: 'contain',
      };
    case 'table':
      return {
        ...base('Table', 120, 160, 720, 260),
        type: 'table',
        rows: [
          ['Milestone', 'Owner', 'Status'],
          ['First idea', 'Design', 'Ready'],
          ['Make it real', 'Everyone', 'In progress'],
          ['Share the story', 'You', 'Next'],
        ],
        header: true,
        color: theme.foreground,
        fill: theme.accent,
        fontSize: 18,
      };
    case 'chart':
      return {
        ...base('Chart', 120, 160, 700, 360),
        type: 'chart',
        chartType: 'bar',
        labels: ['Discover', 'Explore', 'Create', 'Share'],
        values: [24, 48, 70, 96],
        color: theme.accent,
      };
  }
}

export function createSlide(
  theme: Theme,
  layout: 'blank' | 'title' | 'content' | 'split' | 'quote' = 'blank',
): Slide {
  const slide: Slide = {
    id: uid(),
    name:
      layout === 'blank' ? 'Untitled slide' : `${layout[0].toUpperCase()}${layout.slice(1)} slide`,
    background: theme.background,
    elements: [],
    notes: '',
    transition: 'none',
    hidden: false,
  };
  if (layout === 'title')
    slide.elements = [
      text(theme, 'Make room for\nyour next big idea.', 90, 180, 780, 220, 58, true),
      text(theme, 'A story worth sharing starts here.', 95, 440, 730, 100, 24),
      shape('ellipse', theme.accent, 940, 180, 210, 210),
    ];
  if (layout === 'content')
    slide.elements = [
      text(theme, 'A clear point of view', 90, 70, 1080, 100, 42, true),
      text(
        theme,
        '• Start with what matters\n\n• Give every idea room to breathe\n\n• End with a reason to act',
        100,
        230,
        1000,
        360,
        28,
      ),
    ];
  if (layout === 'split')
    slide.elements = [
      text(theme, 'Two sides. One story.', 90, 70, 1100, 100, 42, true),
      shape('roundRect', theme.accent, 90, 220, 510, 380),
      text(theme, 'The possibility', 125, 260, 440, 80, 30, true),
      text(theme, 'Introduce the opportunity.\nMake the benefit tangible.', 125, 360, 420, 150, 24),
      text(theme, 'The next step', 680, 260, 460, 80, 30, true),
      text(theme, 'Turn that possibility into\nsomething people can do.', 680, 360, 460, 150, 24),
    ];
  if (layout === 'quote')
    slide.elements = [
      text(theme, '“', 90, 100, 130, 140, 110),
      text(
        theme,
        'Great things begin with\na little more possibility.',
        180,
        220,
        950,
        220,
        48,
        true,
      ),
      text(theme, 'YOUR NAME · YOUR STORY', 185, 530, 900, 60, 16),
    ];
  return slide;
}

export function createDeck(): Deck {
  const theme = { ...THEMES[0] };
  const cover = createSlide(theme);
  cover.name = 'A little more possibility';
  cover.notes =
    'Welcome your audience. OpenDeck is an original, open-source presentation editor. Select any element to start making this story your own.';
  cover.elements = [
    text(theme, 'OPENDECK  /  FIELD NOTES NO. 001', 76, 66, 850, 40, 13, true),
    text(theme, 'A little more\npossibility.', 76, 202, 800, 245, 66, true),
    text(
      theme,
      'A blank canvas. A fresh perspective.\nYour next great story starts here.',
      82,
      484,
      650,
      100,
      22,
    ),
    shape('ellipse', '#dce8bc', 888, 146, 290, 290),
    shape('rect', theme.foreground, 888, 290, 145, 265),
    shape('ellipse', theme.accent, 1033, 410, 145, 145),
    shape('ellipse', theme.background, 960, 220, 146, 146),
    text(theme, 'MADE TO BE YOURS', 82, 652, 650, 30, 11, true),
    text(theme, '01', 1150, 650, 55, 40, 14),
  ];
  const ideas = createSlide(theme, 'split');
  ideas.name = 'Good ideas deserve a stage';
  ideas.transition = 'fade';
  ideas.elements = [
    text(theme, 'Good ideas deserve a stage.', 80, 62, 1120, 100, 40, true),
    text(theme, 'From your first thought to your final slide.', 85, 165, 1100, 60, 21),
    ...[0, 1, 2].flatMap((i) => {
      const x = 80 + i * 390;
      return [
        shape('roundRect', i === 1 ? '#dce8bc' : '#e9ecdf', x, 285, 350, 300),
        text(theme, ['01', '02', '03'][i], x + 26, 312, 260, 60, 18),
        text(
          theme,
          ['Find your voice.', 'Shape the story.', 'Make it yours.'][i],
          x + 26,
          398,
          300,
          70,
          26,
          true,
        ),
        text(
          theme,
          [
            'Start with a thought\nworth sharing.',
            'Bring your point of view\nto every slide.',
            'An open canvas for\nwhat comes next.',
          ][i],
          x + 26,
          475,
          300,
          90,
          18,
        ),
      ];
    }),
  ];
  ideas.notes =
    'Explain how a strong story connects an idea, a structure, and a personal perspective. Each card is made of editable objects.';
  const data = createSlide(theme);
  data.name = 'Give your story some substance';
  data.elements = [
    text(theme, 'Give your story some substance.', 80, 62, 1150, 100, 38, true),
    text(theme, 'A little progress, every step of the way.', 85, 165, 1080, 60, 21),
    { ...createElement('chart', theme), x: 110, y: 280, width: 820, height: 310 },
    text(theme, '4×', 990, 300, 190, 150, 70, true),
    text(theme, 'more possibility\nwhen ideas are shared', 995, 455, 220, 100, 17),
    text(theme, 'ILLUSTRATIVE DATA · EDIT VALUES IN THE INSPECTOR', 90, 650, 1000, 35, 11),
  ];
  data.notes =
    'The chart uses sample data, not research. Select the chart to change its labels and values.';
  const plan = createSlide(theme);
  plan.name = 'A simple plan to get there';
  plan.elements = [
    text(theme, 'A simple plan to get there.', 80, 62, 1150, 100, 42, true),
    text(theme, 'Make the next step feel possible.', 85, 175, 1050, 60, 21),
    { ...createElement('table', theme), x: 85, y: 300, width: 1110, height: 270 },
    text(theme, 'Small steps. Shared ambition. A story that moves forward.', 90, 625, 1100, 50, 18),
  ];
  plan.notes =
    'Use this table to turn the story into a concrete plan. The cells are editable in the inspector.';
  const close = createSlide(theme, 'quote');
  close.name = 'Now it is your story';
  close.background = theme.foreground;
  const inverse = { ...theme, foreground: theme.background };
  close.elements = [
    {
      ...createElement('image', theme),
      x: 1000,
      y: 70,
      width: 170,
      height: 170,
      alt: 'Original geometric artwork in forest green and cream',
    },
    text(inverse, 'Now it’s\nyour story.', 90, 180, 1060, 250, 72, true),
    text(inverse, 'Edit freely. Present confidently. Share openly.', 95, 500, 1050, 80, 25),
    text(inverse, 'OPENDECK STUDIO', 95, 650, 850, 35, 12, true),
  ];
  close.transition = 'fade';
  close.notes =
    'Thank your audience. This entire deck stays in your browser until you choose to download or share it.';
  return {
    schemaVersion: 1,
    id: uid(),
    title: 'A little more possibility',
    width: 1280,
    height: 720,
    theme,
    slides: [cover, ideas, data, plan, close],
    updatedAt: new Date().toISOString(),
  };
}

export function cloneElement<T extends SlideElement>(element: T, offset = 20): T {
  return {
    ...structuredClone(element),
    id: uid(),
    x: element.x + offset,
    y: element.y + offset,
    name: `${element.name.slice(0, 251)} copy`,
  };
}

export function cloneSlide(slide: Slide): Slide {
  return {
    ...structuredClone(slide),
    id: uid(),
    name: `${slide.name.slice(0, 251)} copy`,
    elements: slide.elements.map((element) => cloneElement(element, 0)),
  };
}

export function updateSlide(deck: Deck, id: string, patch: Partial<Slide>): Deck {
  return {
    ...deck,
    updatedAt: new Date().toISOString(),
    slides: deck.slides.map((slide) =>
      slide.id === id ? { ...slide, ...patch, id: slide.id } : slide,
    ),
  };
}

export function updateElement(
  deck: Deck,
  slideId: string,
  elementId: string,
  patch: Partial<SlideElement>,
): Deck {
  const slide = deck.slides.find((item) => item.id === slideId);
  if (!slide) return deck;
  return updateSlide(deck, slideId, {
    elements: slide.elements.map((element) =>
      element.id === elementId && !element.locked
        ? ({ ...element, ...patch, id: element.id, type: element.type } as SlideElement)
        : element,
    ),
  });
}

export function removeElements(deck: Deck, slideId: string, ids: string[]): Deck {
  const slide = deck.slides.find((item) => item.id === slideId);
  return slide
    ? updateSlide(deck, slideId, {
        elements: slide.elements.filter((element) => element.locked || !ids.includes(element.id)),
      })
    : deck;
}

export function reorderSlide(deck: Deck, from: number, to: number): Deck {
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < 0 ||
    from >= deck.slides.length ||
    to >= deck.slides.length ||
    from === to
  )
    return deck;
  const slides = [...deck.slides];
  slides.splice(to, 0, slides.splice(from, 1)[0]);
  return { ...deck, slides, updatedAt: new Date().toISOString() };
}

export function alignElements(
  deck: Deck,
  slideId: string,
  ids: string[],
  alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom',
): Deck {
  const slide = deck.slides.find((item) => item.id === slideId);
  if (!slide) return deck;
  const selected = slide.elements.filter((element) => ids.includes(element.id) && !element.locked);
  if (!selected.length) return deck;
  const bounds =
    selected.length === 1
      ? { left: 0, top: 0, right: deck.width, bottom: deck.height }
      : {
          left: Math.min(...selected.map((e) => e.x)),
          top: Math.min(...selected.map((e) => e.y)),
          right: Math.max(...selected.map((e) => e.x + e.width)),
          bottom: Math.max(...selected.map((e) => e.y + e.height)),
        };
  return updateSlide(deck, slideId, {
    elements: slide.elements.map((element) => {
      if (!selected.includes(element)) return element;
      if (alignment === 'left') return { ...element, x: bounds.left };
      if (alignment === 'center')
        return { ...element, x: (bounds.left + bounds.right - element.width) / 2 };
      if (alignment === 'right') return { ...element, x: bounds.right - element.width };
      if (alignment === 'top') return { ...element, y: bounds.top };
      if (alignment === 'middle')
        return { ...element, y: (bounds.top + bounds.bottom - element.height) / 2 };
      return { ...element, y: bounds.bottom - element.height };
    }),
  });
}

export interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}
export const createHistory = <T>(present: T): HistoryState<T> => ({
  past: [],
  present,
  future: [],
});
export const commitHistory = <T>(state: HistoryState<T>, next: T): HistoryState<T> =>
  next === state.present
    ? state
    : { past: [...state.past.slice(-99), state.present], present: next, future: [] };
export const undoHistory = <T>(state: HistoryState<T>): HistoryState<T> =>
  state.past.length
    ? {
        past: state.past.slice(0, -1),
        present: state.past[state.past.length - 1],
        future: [state.present, ...state.future],
      }
    : state;
export const redoHistory = <T>(state: HistoryState<T>): HistoryState<T> =>
  state.future.length
    ? {
        past: [...state.past, state.present],
        present: state.future[0],
        future: state.future.slice(1),
      }
    : state;

/** Rebuild untrusted native files field-by-field. Unknown fields are never retained. */
export function validateDeck(input: unknown): Deck {
  const object = (value: unknown, label: string): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error(`Invalid ${label}: expected an object.`);
    return value as Record<string, unknown>;
  };
  const string = (value: unknown, label: string, max = 1000): string => {
    if (typeof value !== 'string' || value.length > max)
      throw new Error(`Invalid ${label}: expected text of at most ${max} characters.`);
    return value;
  };
  const number = (value: unknown, label: string, min: number, max: number): number => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
      throw new Error(`Invalid ${label}: expected a number from ${min} to ${max}.`);
    return value;
  };
  const bool = (value: unknown, label: string): boolean => {
    if (typeof value !== 'boolean') throw new Error(`Invalid ${label}: expected true or false.`);
    return value;
  };
  const choice = <T extends string>(value: unknown, allowed: readonly T[], label: string): T => {
    if (typeof value !== 'string' || !allowed.includes(value as T))
      throw new Error(`Invalid ${label}.`);
    return value as T;
  };
  const color = (value: unknown, label: string, transparent = false): string => {
    if (
      typeof value !== 'string' ||
      (!/^#[0-9a-f]{6}$/i.test(value) && !(transparent && value === 'transparent'))
    )
      throw new Error(`Invalid ${label}: use a six-digit hex color.`);
    return value;
  };
  const ids = new Set<string>();
  const id = (value: unknown): string => {
    const result = string(value, 'identifier', 128);
    if (!result || ids.has(result)) throw new Error('Identifiers must be nonempty and unique.');
    ids.add(result);
    return result;
  };
  const d = object(input, 'presentation');
  if (d.schemaVersion !== 1)
    throw new Error('Unsupported OpenDeck file version. Expected schemaVersion 1.');
  const t = object(d.theme, 'theme');
  const theme: Theme = {
    id: string(t.id, 'theme identifier', 128),
    name: string(t.name, 'theme name', 128),
    background: color(t.background, 'theme background'),
    foreground: color(t.foreground, 'theme foreground'),
    accent: color(t.accent, 'theme accent'),
    muted: color(t.muted, 'theme muted color'),
    fontFamily: string(t.fontFamily, 'font family', 128),
  };
  if (!Array.isArray(d.slides) || !d.slides.length || d.slides.length > 500)
    throw new Error('A presentation must contain 1–500 slides.');
  let count = 0;
  let imageBytes = 0;
  const slides: Slide[] = d.slides.map((rawSlide) => {
    const s = object(rawSlide, 'slide');
    if (!Array.isArray(s.elements) || s.elements.length > 2000)
      throw new Error('A slide may contain at most 2,000 objects.');
    const slideId = id(s.id);
    const elements: SlideElement[] = s.elements.map((rawElement) => {
      if (++count > 20000) throw new Error('A presentation may contain at most 20,000 objects.');
      const e = object(rawElement, 'object');
      const b = {
        id: id(e.id),
        name: string(e.name, 'object name', 256),
        x: number(e.x, 'x', -100000, 100000),
        y: number(e.y, 'y', -100000, 100000),
        width: number(e.width, 'width', 0.01, 100000),
        height: number(e.height, 'height', 0.01, 100000),
        rotation: number(e.rotation, 'rotation', -360000, 360000),
        opacity: number(e.opacity, 'opacity', 0, 1),
        locked: bool(e.locked, 'locked'),
        animation: choice(e.animation, ['none', 'fade', 'rise'] as const, 'animation'),
      };
      switch (e.type) {
        case 'text':
          return {
            ...b,
            type: 'text',
            text: string(e.text, 'text', 100000),
            fontSize: number(e.fontSize, 'font size', 1, 1000),
            fontFamily: string(e.fontFamily, 'font family', 128),
            color: color(e.color, 'text color'),
            bold: bool(e.bold, 'bold'),
            italic: bool(e.italic, 'italic'),
            underline: bool(e.underline, 'underline'),
            align: choice(e.align, ['left', 'center', 'right'] as const, 'text alignment'),
            verticalAlign: choice(
              e.verticalAlign,
              ['top', 'middle', 'bottom'] as const,
              'vertical alignment',
            ),
            ...(e.paragraphs !== undefined
              ? { paragraphs: validateParagraphs(e.paragraphs, string(e.text, 'text', 100000)) }
              : {}),
            ...(e.textFrame !== undefined ? { textFrame: validateTextFrame(e.textFrame) } : {}),
            ...(e.autoFit !== undefined ? { autoFit: validateAutoFit(e.autoFit) } : {}),
            ...(e.decoration !== undefined
              ? { decoration: validateTextDecoration(e.decoration) }
              : {}),
            ...(e.textOpacity !== undefined
              ? { textOpacity: number(e.textOpacity, 'text opacity', 0, 1) }
              : {}),
          };
        case 'shape':
          return {
            ...b,
            type: 'shape',
            shape: choice(
              e.shape,
              ['rect', 'roundRect', 'ellipse', 'triangle', 'line', 'arrow'] as const,
              'shape',
            ),
            fill: color(e.fill, 'shape fill', true),
            stroke: color(e.stroke, 'shape stroke', true),
            strokeWidth: number(e.strokeWidth, 'stroke width', 0, 100),
            ...(e.fillGradient !== undefined
              ? { fillGradient: validateGradientFill(e.fillGradient) }
              : {}),
            ...(e.strokeGradient !== undefined
              ? { strokeGradient: validateGradientFill(e.strokeGradient) }
              : {}),
            ...(e.fillOpacity !== undefined
              ? { fillOpacity: number(e.fillOpacity, 'shape fill opacity', 0, 1) }
              : {}),
            ...(e.strokeOpacity !== undefined
              ? { strokeOpacity: number(e.strokeOpacity, 'shape stroke opacity', 0, 1) }
              : {}),
          };
        case 'image': {
          const src = string(e.src, 'image', 28_000_000);
          if (!/^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(src))
            throw new Error(
              'Images must be embedded PNG, JPEG, GIF, or WebP data. Remote URLs and SVG images are not accepted.',
            );
          imageBytes += src.length;
          if (imageBytes > 70_000_000)
            throw new Error('Embedded images exceed the 70 MB document limit.');
          return {
            ...b,
            type: 'image',
            src,
            alt: string(e.alt, 'image description', 2000),
            fit: choice(e.fit, ['contain', 'cover', 'stretch'] as const, 'image fit'),
            ...(e.crop !== undefined ? { crop: validateImageRect(e.crop) } : {}),
            ...(e.fillRect !== undefined ? { fillRect: validateImageRect(e.fillRect) } : {}),
            ...(e.flipH !== undefined ? { flipH: bool(e.flipH, 'image horizontal flip') } : {}),
            ...(e.flipV !== undefined ? { flipV: bool(e.flipV, 'image vertical flip') } : {}),
            ...(e.orientation !== undefined
              ? { orientation: choice(e.orientation, ['encoded'] as const, 'image orientation') }
              : {}),
          };
        }
        case 'table': {
          if (!Array.isArray(e.rows) || !e.rows.length || e.rows.length > 100)
            throw new Error('Tables must have 1–100 rows.');
          const rows = e.rows.map((row) => {
            if (!Array.isArray(row) || !row.length || row.length > 50)
              throw new Error('Tables must have 1–50 columns.');
            return row.map((cell) => string(cell, 'table cell', 10000));
          });
          if (rows.some((row) => row.length !== rows[0].length))
            throw new Error('All table rows must have the same number of columns.');
          return {
            ...b,
            type: 'table',
            rows,
            header: bool(e.header, 'table header'),
            color: color(e.color, 'table text'),
            fill: color(e.fill, 'table fill'),
            fontSize: number(e.fontSize, 'table font size', 1, 1000),
          };
        }
        case 'chart': {
          if (
            !Array.isArray(e.labels) ||
            !Array.isArray(e.values) ||
            !e.values.length ||
            e.values.length > 1000 ||
            e.labels.length !== e.values.length
          )
            throw new Error('Chart labels and values must have matching lengths from 1–1,000.');
          const chartType = choice(e.chartType, ['bar', 'line', 'pie'] as const, 'chart type');
          const values = e.values.map((value) => number(value, 'chart value', -1e12, 1e12));
          if (
            chartType === 'pie' &&
            (values.some((value) => value < 0) || !values.some((value) => value > 0))
          )
            throw new Error(
              'Pie charts require nonnegative values and at least one positive value.',
            );
          return {
            ...b,
            type: 'chart',
            chartType,
            labels: e.labels.map((label) => string(label, 'chart label', 1000)),
            values,
            color: color(e.color, 'chart color'),
          };
        }
        default:
          throw new Error('Unsupported slide object type.');
      }
    });
    return {
      id: slideId,
      name: string(s.name, 'slide name', 256),
      background: color(s.background, 'slide background'),
      ...(s.backgroundGradient !== undefined
        ? { backgroundGradient: validateGradientFill(s.backgroundGradient) }
        : {}),
      ...(s.backgroundOpacity !== undefined
        ? { backgroundOpacity: number(s.backgroundOpacity, 'slide background opacity', 0, 1) }
        : {}),
      elements,
      notes: string(s.notes, 'speaker notes', 100000),
      transition: choice(s.transition, ['none', 'fade', 'slide'] as const, 'transition'),
      hidden: bool(s.hidden, 'hidden'),
    };
  });
  const updatedAt = string(d.updatedAt, 'update time', 100);
  if (!Number.isFinite(Date.parse(updatedAt))) throw new Error('Invalid update time.');
  return {
    schemaVersion: 1,
    id: id(d.id),
    title: string(d.title, 'presentation title', 256),
    width: number(d.width, 'slide width', 100, 10000),
    height: number(d.height, 'slide height', 100, 10000),
    theme,
    slides,
    updatedAt,
  };
}
