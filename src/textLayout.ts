import type { CSSProperties } from 'react';
import type { TextElement, TextParagraph, TextRun } from './types';
import { resolveAutoFit } from './textFit';
import { resolveTextFrame, textContentRect } from './textFrame';

/** Each explicit start resets numbering; nested lists retain their parent counter. */
export function paragraphMarkers(paragraphs: TextParagraph[]): string[] {
  let counters: number[] = [];
  return paragraphs.map((p) => {
    if (!p.bullet) {
      counters = [];
      return '';
    }
    const { kind, level, start, character } = p.bullet;
    counters.length = level + 1;
    if (kind === 'bullet') {
      counters[level] = 0;
      return character || '•';
    }
    const value = start ?? (counters[level] || 0) + 1;
    counters[level] = value;
    return `${value}.`;
  });
}

export function textScale(element: TextElement): number {
  const fit = resolveAutoFit(element);
  return fit.mode === 'shrink' ? fit.fontScale : 1;
}

export function paragraphLineHeight(
  paragraph: TextParagraph,
  element: TextElement,
): number | string {
  if (paragraph.lineSpacingPoints !== undefined) return `${paragraph.lineSpacingPoints}pt`;
  const fit = resolveAutoFit(element);
  return Math.max(
    0,
    (paragraph.lineSpacing ?? 1.16) - (fit.mode === 'shrink' ? fit.lineSpacingReduction : 0),
  );
}

export function textRunStyle(run: TextRun, element: TextElement): CSSProperties {
  return {
    fontSize: `${(run.fontSize ?? element.fontSize) * textScale(element)}pt`,
    fontFamily: run.fontFamily ?? element.fontFamily,
    color: run.color ?? element.color,
    fontWeight: (run.bold ?? element.bold) ? 700 : 400,
    fontStyle: (run.italic ?? element.italic) ? 'italic' : 'normal',
    textDecoration: (run.underline ?? element.underline) ? 'underline' : 'none',
  };
}

export function textContentStyle(element: TextElement): CSSProperties {
  return {
    position: 'absolute',
    ...textContentRect(element),
    overflow: 'visible',
    display: 'flex',
    flexDirection: 'column',
    fontSize: `${element.fontSize * textScale(element)}pt`,
    fontFamily: element.fontFamily,
    color: element.color,
    justifyContent:
      element.verticalAlign === 'middle'
        ? 'center'
        : element.verticalAlign === 'bottom'
          ? 'flex-end'
          : 'flex-start',
  };
}

export function textParagraphStyle(paragraph: TextParagraph, element: TextElement): CSSProperties {
  return {
    display: 'flex',
    width: '100%',
    flexShrink: 0,
    lineHeight: paragraphLineHeight(paragraph, element),
    marginTop: `${paragraph.spaceBefore ?? 0}pt`,
    marginBottom: `${paragraph.spaceAfter ?? 0}pt`,
    paddingLeft: paragraph.bullet
      ? `${paragraph.bullet.level * 1.4 * (paragraph.runs[0]?.fontSize ?? element.fontSize)}pt`
      : undefined,
  };
}

export function paragraphContentStyle(
  paragraph: TextParagraph,
  element: TextElement,
): CSSProperties {
  const frame = resolveTextFrame(element),
    lineHeight = paragraphLineHeight(paragraph, element);
  const height =
    typeof lineHeight === 'string'
      ? lineHeight
      : `${lineHeight * (paragraph.runs[0]?.fontSize ?? element.fontSize) * textScale(element)}pt`;
  return {
    flex: 1,
    minWidth: 0,
    whiteSpace: frame.wrap === 'none' ? 'pre' : 'pre-wrap',
    overflowWrap: frame.wrap === 'none' ? 'normal' : 'break-word',
    textAlign: paragraph.align ?? element.align,
    fontSize: `${(paragraph.runs[0]?.fontSize ?? element.fontSize) * textScale(element)}pt`,
    minHeight: height,
  };
}

export function paragraphMarkerStyle(
  paragraph: TextParagraph,
  element: TextElement,
): CSSProperties {
  const first = paragraph.runs[0] ?? { text: '' };
  // DrawingML list margins are absolute. Shrinking glyphs does not rewrite them.
  const baseSize = first.fontSize ?? element.fontSize;
  return {
    ...textRunStyle(first, element),
    flexShrink: 0,
    minWidth: `${baseSize * 1.2}pt`,
    paddingRight: `${baseSize * 0.3}pt`,
    textAlign: 'right',
    whiteSpace: 'nowrap',
  };
}
