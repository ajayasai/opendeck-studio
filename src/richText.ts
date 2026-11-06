import type { TextElement, TextParagraph, TextRun } from './types';

export const RICH_TEXT_LIMITS = { characters: 100000, paragraphs: 5000, runs: 10000 } as const;

/** Hyperlinks are user-activated links only; checking one never fetches its URL. */
export function safeHyperlink(url: string): boolean {
  if (
    typeof url !== 'string' ||
    url.length > 2048 ||
    !url ||
    url.trim() !== url ||
    /[\s\\\u0000-\u001f\u007f-\u009f]/u.test(url)
  )
    return false;
  try {
    // Reject encoded control characters as well, including mailto header injection.
    if (/[\u0000-\u001f\u007f-\u009f]/u.test(decodeURIComponent(url))) return false;
    const parsed = new URL(url);
    if (parsed.username || parsed.password) return false;
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      if (!/^https?:\/\//i.test(url) || !parsed.hostname) return false;
      return !url
        .slice(url.indexOf('//') + 2)
        .split(/[/?#]/, 1)[0]
        .includes('@');
    }
    if (parsed.protocol === 'mailto:')
      return Boolean(parsed.pathname) && !parsed.pathname.startsWith('//');
    return false;
  } catch {
    return false;
  }
}

export function plainText(paragraphs: TextParagraph[]): string {
  return paragraphs.map((paragraph) => paragraph.runs.map((run) => run.text).join('')).join('\n');
}

/** Legacy text boxes remain readable without migrating or changing their stored schema. */
export function getParagraphs(element: TextElement): TextParagraph[] {
  return element.paragraphs
    ? structuredClone(element.paragraphs)
    : element.text.split('\n').map((text) => ({ runs: [{ text }] }));
}

/** Reconstruct known fields only, so imported rich text cannot smuggle HTML or CSS. */
export function validateParagraphs(input: unknown, expectedText?: string): TextParagraph[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > RICH_TEXT_LIMITS.paragraphs)
    throw new Error('Rich text must contain 1–5,000 paragraphs.');
  const object = (value: unknown, label: string): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error(`Invalid ${label}: expected an object.`);
    return value as Record<string, unknown>;
  };
  const string = (value: unknown, label: string, maximum: number): string => {
    if (typeof value !== 'string' || value.length > maximum)
      throw new Error(`Invalid ${label}: expected text of at most ${maximum} characters.`);
    return value;
  };
  const number = (
    value: unknown,
    label: string,
    minimum: number,
    maximum: number,
    integer = false,
  ): number => {
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < minimum ||
      value > maximum ||
      (integer && !Number.isInteger(value))
    )
      throw new Error(
        `Invalid ${label}: expected ${integer ? 'an integer' : 'a number'} from ${minimum} to ${maximum}.`,
      );
    return value;
  };
  let runs = 0,
    characters = input.length - 1;
  const paragraphs = input.map((raw) => {
    const source = object(raw, 'paragraph');
    if (!Array.isArray(source.runs) || (runs += source.runs.length) > RICH_TEXT_LIMITS.runs)
      throw new Error('Rich text may contain at most 10,000 runs.');
    const paragraph: TextParagraph = {
      runs: source.runs.map((rawRun) => {
        const sourceRun = object(rawRun, 'text run');
        const text = string(sourceRun.text, 'run text', RICH_TEXT_LIMITS.characters);
        characters += text.length;
        if (characters > RICH_TEXT_LIMITS.characters)
          throw new Error(
            'Rich text may contain at most 100,000 characters including paragraph breaks.',
          );
        const run: TextRun = { text };
        if (sourceRun.fontSize !== undefined)
          run.fontSize = number(sourceRun.fontSize, 'run font size', 1, 1000);
        if (sourceRun.fontFamily !== undefined)
          run.fontFamily = string(sourceRun.fontFamily, 'run font family', 128);
        if (sourceRun.color !== undefined) {
          if (typeof sourceRun.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(sourceRun.color))
            throw new Error('Invalid run color: use a six-digit hex color.');
          run.color = sourceRun.color;
        }
        for (const flag of ['bold', 'italic', 'underline'] as const) {
          if (sourceRun[flag] === undefined) continue;
          if (typeof sourceRun[flag] !== 'boolean')
            throw new Error(`Invalid run ${flag}: expected true or false.`);
          run[flag] = sourceRun[flag];
        }
        if (sourceRun.hyperlink !== undefined) {
          const hyperlink = string(sourceRun.hyperlink, 'hyperlink', 2048);
          if (!safeHyperlink(hyperlink))
            throw new Error(
              'Invalid hyperlink: use an absolute HTTP, HTTPS, or mailto URL without credentials or control characters.',
            );
          run.hyperlink = hyperlink;
        }
        return run;
      }),
    };
    if (source.align !== undefined) {
      if (source.align !== 'left' && source.align !== 'center' && source.align !== 'right')
        throw new Error('Invalid paragraph alignment.');
      paragraph.align = source.align;
    }
    if (source.lineSpacing !== undefined)
      paragraph.lineSpacing = number(source.lineSpacing, 'line spacing', 0.5, 10);
    if (source.spaceBefore !== undefined)
      paragraph.spaceBefore = number(source.spaceBefore, 'spacing before', 0, 1000);
    if (source.spaceAfter !== undefined)
      paragraph.spaceAfter = number(source.spaceAfter, 'spacing after', 0, 1000);
    if (source.bullet !== undefined) {
      const bullet = object(source.bullet, 'paragraph bullet');
      if (bullet.kind !== 'bullet' && bullet.kind !== 'number')
        throw new Error('Invalid bullet kind.');
      paragraph.bullet = {
        kind: bullet.kind,
        level: number(bullet.level, 'bullet level', 0, 8, true),
      };
      if (bullet.start !== undefined)
        paragraph.bullet.start = number(bullet.start, 'list start', 1, 32767, true);
      if (bullet.character !== undefined) {
        const character = string(bullet.character, 'bullet character', 8);
        if (!character || /[\u0000-\u001f\u007f-\u009f]/u.test(character))
          throw new Error('Invalid bullet character: use 1–8 visible characters.');
        paragraph.bullet.character = character;
      }
    }
    return paragraph;
  });
  if (expectedText !== undefined && plainText(paragraphs) !== expectedText)
    throw new Error('Rich text paragraphs must exactly match the plain text projection.');
  return paragraphs;
}

export function withParagraphs(element: TextElement, paragraphs: TextParagraph[]): TextElement {
  const safe = validateParagraphs(paragraphs);
  return { ...element, paragraphs: safe, text: plainText(safe) };
}

type RunStyle = Omit<TextRun, 'text'>;
type ParagraphMetadata = Omit<TextParagraph, 'runs'>;
interface ParagraphContext {
  metadata: ParagraphMetadata;
  emptyStyle: RunStyle;
}
type Piece =
  | { kind: 'text'; text: string; style: RunStyle }
  | { kind: 'paragraph'; text: '\n'; next: ParagraphContext };
const styleKeys = [
  'fontSize',
  'fontFamily',
  'color',
  'bold',
  'italic',
  'underline',
  'hyperlink',
] as const;
const runStyle = (run: TextRun): RunStyle =>
  Object.fromEntries(
    styleKeys.filter((key) => run[key] !== undefined).map((key) => [key, run[key]]),
  );
const sameStyle = (a: TextRun, b: RunStyle): boolean => styleKeys.every((key) => a[key] === b[key]);
function paragraphContext(paragraph: TextParagraph): ParagraphContext {
  const { runs, ...metadata } = paragraph;
  return { metadata: structuredClone(metadata), emptyStyle: runs[0] ? runStyle(runs[0]) : {} };
}
function continuation(context: ParagraphContext): ParagraphContext {
  const next = structuredClone(context);
  // A newly inserted continuation must not restart an explicitly numbered list.
  if (next.metadata.bullet?.kind === 'number') delete next.metadata.bullet.start;
  return next;
}

/**
 * Apply a plain-text edit without flattening existing rich runs. Unchanged prefix
 * and suffix spans retain their exact styles and hard-break/paragraph semantics.
 * Insertions inherit the adjacent left style within a paragraph; replacements
 * inherit the first replaced character. New paragraph breaks inherit spacing,
 * alignment and list level, while dropping an explicit list restart.
 */
export function replacePlainText(element: TextElement, text: string): TextElement {
  if (typeof text !== 'string' || text.length > RICH_TEXT_LIMITS.characters)
    throw new Error('Text may contain at most 100,000 characters.');
  if (text === element.text) return element;
  if (!element.paragraphs) return { ...element, text };
  const paragraphs = validateParagraphs(element.paragraphs, element.text),
    before = element.text;
  let prefix = 0,
    suffix = 0;
  while (prefix < before.length && prefix < text.length && before[prefix] === text[prefix])
    prefix++;
  const splitsPair = (value: string, position: number) =>
    position > 0 &&
    position < value.length &&
    /[\uD800-\uDBFF]/.test(value[position - 1]) &&
    /[\uDC00-\uDFFF]/.test(value[position]);
  if (splitsPair(before, prefix) || splitsPair(text, prefix)) prefix--;
  while (
    suffix < before.length - prefix &&
    suffix < text.length - prefix &&
    before[before.length - suffix - 1] === text[text.length - suffix - 1]
  )
    suffix++;
  if (splitsPair(before, before.length - suffix) || splitsPair(text, text.length - suffix))
    suffix--;
  const replacedEnd = before.length - suffix,
    inserted = text.slice(prefix, text.length - suffix);
  const contexts = paragraphs.map(paragraphContext),
    pieces: Piece[] = [];
  const locations: {
    start: number;
    end: number;
    paragraph: number;
    runs: { start: number; end: number; style: RunStyle }[];
  }[] = [];
  let offset = 0;
  paragraphs.forEach((paragraph, index) => {
    const location = {
      start: offset,
      end: offset,
      paragraph: index,
      runs: [] as { start: number; end: number; style: RunStyle }[],
    };
    paragraph.runs.forEach((run) => {
      const style = runStyle(run);
      location.runs.push({ start: offset, end: offset + run.text.length, style });
      if (run.text) pieces.push({ kind: 'text', text: run.text, style });
      offset += run.text.length;
    });
    location.end = offset;
    locations.push(location);
    if (index < paragraphs.length - 1) {
      pieces.push({ kind: 'paragraph', text: '\n', next: contexts[index + 1] });
      offset++;
    }
  });
  const locationAt = (position: number) =>
    locations.find((location) => position <= location.end) ?? locations[locations.length - 1];
  const location = locationAt(prefix),
    context = contexts[location.paragraph];
  const left = location.runs.find((run) => prefix > run.start && prefix <= run.end);
  const right = location.runs.find((run) => prefix >= run.start && prefix < run.end);
  const insertedStyle = {
    ...((replacedEnd > prefix ? (right ?? left) : (left ?? right))?.style ?? context.emptyStyle),
  };
  const slice = (start: number, end: number): Piece[] => {
    let position = 0;
    return pieces.flatMap<Piece>((piece) => {
      const pieceStart = position;
      position += piece.text.length;
      const from = Math.max(start, pieceStart) - pieceStart,
        to = Math.min(end, position) - pieceStart;
      if (from >= to) return [];
      return piece.kind === 'paragraph'
        ? [piece]
        : [{ ...piece, text: piece.text.slice(from, to) }];
    });
  };
  const additions: Piece[] = [];
  inserted.split('\n').forEach((part, index) => {
    if (index > 0)
      additions.push({
        kind: 'paragraph',
        text: '\n',
        next: { ...continuation(context), emptyStyle: insertedStyle },
      });
    if (part) additions.push({ kind: 'text', text: part, style: insertedStyle });
  });
  const combined = [...slice(0, prefix), ...additions, ...slice(replacedEnd, before.length)];
  let currentContext = !combined.length
    ? context
    : prefix > 0
      ? contexts[0]
      : inserted
        ? context
        : contexts[locationAt(replacedEnd).paragraph];
  let currentRuns: TextRun[] = [];
  const result: TextParagraph[] = [];
  const finish = () =>
    result.push({
      ...structuredClone(currentContext.metadata),
      runs: currentRuns.length ? currentRuns : [{ text: '', ...currentContext.emptyStyle }],
    });
  for (const piece of combined) {
    if (piece.kind === 'paragraph') {
      finish();
      currentContext = piece.next;
      currentRuns = [];
    } else {
      const previous = currentRuns.at(-1);
      if (previous && sameStyle(previous, piece.style)) previous.text += piece.text;
      else currentRuns.push({ text: piece.text, ...piece.style });
    }
  }
  finish();
  return withParagraphs(element, result);
}

/** Apply box-level formatting to both defaults and every explicit run override. */
export function applyTextPatch(element: TextElement, patch: Partial<TextElement>): TextElement {
  let next = element;
  if (patch.paragraphs !== undefined) {
    const safe = validateParagraphs(patch.paragraphs, patch.text);
    next = withParagraphs(element, safe);
  } else if (patch.text !== undefined) next = replacePlainText(element, patch.text);
  const definedPatch = Object.fromEntries(
    Object.entries(patch).filter(
      ([key, value]) => value !== undefined && key !== 'paragraphs' && key !== 'text',
    ),
  );
  next = { ...next, ...definedPatch, id: element.id, type: 'text' };
  if (next.paragraphs) {
    const formatting = Object.fromEntries(
      styleKeys
        .filter((key) => key !== 'hyperlink' && patch[key as keyof TextElement] !== undefined)
        .map((key) => [key, patch[key as keyof TextElement]]),
    );
    if (Object.keys(formatting).length || patch.align !== undefined)
      next = withParagraphs(
        next,
        next.paragraphs.map((paragraph) => ({
          ...paragraph,
          ...(patch.align !== undefined ? { align: patch.align } : {}),
          runs: paragraph.runs.map((run) => ({ ...run, ...formatting })),
        })),
      );
  }
  return next;
}
