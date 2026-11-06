import type { TextElement } from './types';
import { getParagraphs, safeHyperlink } from './richText';
import { resolveTextFrame } from './textFrame';
import {
  paragraphMarkers,
  textContentStyle,
  textParagraphStyle,
  paragraphContentStyle,
  paragraphMarkerStyle,
  textRunStyle,
} from './textLayout';
export { paragraphMarkers } from './textLayout';

export default function RichTextView({
  element,
  interactiveLinks = false,
}: {
  element: TextElement;
  interactiveLinks?: boolean;
}) {
  const paragraphs = getParagraphs(element),
    markers = paragraphMarkers(paragraphs),
    frame = resolveTextFrame(element);
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
        style={textContentStyle(element)}
      >
        {paragraphs.map((paragraph, i) => (
          <div
            key={i}
            className="text-paragraph"
            style={textParagraphStyle(paragraph, element, i, paragraphs.length)}
          >
            {paragraph.bullet && (
              <span className="paragraph-marker" style={paragraphMarkerStyle(paragraph, element)}>
                {markers[i]}
              </span>
            )}
            <div className="paragraph-content" style={paragraphContentStyle(paragraph, element)}>
              {paragraph.runs.map((run, j) =>
                interactiveLinks && run.hyperlink && safeHyperlink(run.hyperlink) ? (
                  <a
                    key={j}
                    href={run.hyperlink}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={textRunStyle(run, element)}
                    onClick={(event) => event.stopPropagation()}
                  >
                    {run.text}
                  </a>
                ) : (
                  <span key={j} style={textRunStyle(run, element)}>
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
