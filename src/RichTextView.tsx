import type { CSSProperties } from 'react';
import type { TextElement, TextParagraph, TextRun } from './types';
import { getParagraphs, safeHyperlink } from './richText';
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

function runStyle(run: TextRun, element: TextElement): CSSProperties {
  return {
    fontSize: `${run.fontSize ?? element.fontSize}pt`,
    fontFamily: run.fontFamily ?? element.fontFamily,
    color: run.color ?? element.color,
    fontWeight: (run.bold ?? element.bold) ? 700 : 400,
    fontStyle: (run.italic ?? element.italic) ? 'italic' : 'normal',
    textDecoration: (run.underline ?? element.underline) ? 'underline' : 'none',
  };
}

export default function RichTextView({
  element,
  interactiveLinks = false,
}: {
  element: TextElement;
  interactiveLinks?: boolean;
}) {
  const paragraphs = getParagraphs(element),
    markers = paragraphMarkers(paragraphs),
    frame = resolveTextFrame(element),
    content = textContentRect(element);
  return (
    <div
      className="text-frame"
      style={{
        position: 'absolute',
        inset: 0,
        // clip + visible keeps the axes independent; hidden would turn visible into auto.
        overflowX: frame.horizontalOverflow === 'clip' ? 'clip' : 'visible',
        overflowY: frame.verticalOverflow === 'clip' ? 'clip' : 'visible',
      }}
    >
      <div
        className={`text-content rich-text-content ${interactiveLinks ? 'interactive-links' : ''}`}
        style={{
          position: 'absolute',
          ...content,
          overflow: 'visible',
          fontSize: `${element.fontSize}pt`,
          fontFamily: element.fontFamily,
          color: element.color,
          justifyContent:
            element.verticalAlign === 'middle'
              ? 'center'
              : element.verticalAlign === 'bottom'
                ? 'flex-end'
                : 'flex-start',
        }}
      >
        {paragraphs.map((paragraph, i) => (
          <div
            key={i}
            className="text-paragraph"
            style={{
              lineHeight: paragraph.lineSpacing ?? 1.16,
              marginTop: `${paragraph.spaceBefore ?? 0}pt`,
              marginBottom: `${paragraph.spaceAfter ?? 0}pt`,
              paddingLeft: paragraph.bullet ? `${paragraph.bullet.level * 1.4}em` : undefined,
            }}
          >
            {paragraph.bullet && (
              <span
                className="paragraph-marker"
                style={runStyle(paragraph.runs[0] ?? { text: '' }, element)}
              >
                {markers[i]}
              </span>
            )}
            <div
              className="paragraph-content"
              style={{
                whiteSpace: frame.wrap === 'none' ? 'pre' : 'pre-wrap',
                overflowWrap: frame.wrap === 'none' ? 'normal' : 'break-word',
                textAlign: paragraph.align ?? element.align,
                fontSize: `${paragraph.runs[0]?.fontSize ?? element.fontSize}pt`,
                minHeight: `${(paragraph.lineSpacing ?? 1.16) * (paragraph.runs[0]?.fontSize ?? element.fontSize)}pt`,
              }}
            >
              {paragraph.runs.map((run, j) =>
                interactiveLinks && run.hyperlink && safeHyperlink(run.hyperlink) ? (
                  <a
                    key={j}
                    href={run.hyperlink}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={runStyle(run, element)}
                    onClick={(event) => event.stopPropagation()}
                  >
                    {run.text}
                  </a>
                ) : (
                  <span key={j} style={runStyle(run, element)}>
                    {run.text}
                  </span>
                ),
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
