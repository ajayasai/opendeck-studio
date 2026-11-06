import { Extension } from '@tiptap/core';
import type { JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TextStyleKit } from '@tiptap/extension-text-style';
import TextAlign from '@tiptap/extension-text-align';
import { getParagraphs, safeHyperlink } from './richText';
import type { TextElement, TextParagraph, TextRun } from './types';

const finite = (value: unknown, min: number, max: number): number | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : undefined;
};

export function fontPoints(value: unknown): number | undefined {
  if (typeof value !== 'string') return finite(value, 1, 1000);
  const match = value.trim().match(/^([\d.]+)(pt|px)?$/i);
  if (!match) return undefined;
  return finite(Number(match[1]) * (match[2]?.toLowerCase() === 'px' ? 0.75 : 1), 1, 1000);
}

export function hexColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (/^#[\da-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();
  if (/^#[\da-f]{3}$/i.test(trimmed))
    return (
      '#' +
      [...trimmed.slice(1)]
        .map((char) => char + char)
        .join('')
        .toLowerCase()
    );
  const rgb = trimmed.match(
    /^rgba?\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)\s*(?:[,/]\s*(1|1\.0+))?\s*\)$/i,
  );
  if (rgb && rgb.slice(1, 4).every((channel) => Number(channel) <= 255))
    return (
      '#' +
      rgb
        .slice(1, 4)
        .map((channel) => Number(channel).toString(16).padStart(2, '0'))
        .join('')
    );
  const named: Record<string, string> = {
    black: '#000000',
    white: '#ffffff',
    red: '#ff0000',
    green: '#008000',
    blue: '#0000ff',
    yellow: '#ffff00',
    gray: '#808080',
    grey: '#808080',
    orange: '#ffa500',
    purple: '#800080',
    transparent: '',
  };
  return named[trimmed.toLowerCase()] || undefined;
}

const spacingAttribute = (
  name: string,
  css: 'lineHeight' | 'marginTop' | 'marginBottom',
  min: number,
  max: number,
) => ({
  default: null,
  parseHTML: (element: HTMLElement) => {
    const raw = element.style[css];
    const value =
      css === 'lineHeight'
        ? finite(raw, min, max)
        : raw
          ? finite(parseFloat(raw) * (raw.endsWith('px') ? 0.75 : 1), min, max)
          : undefined;
    return value ?? null;
  },
  renderHTML: (attrs: Record<string, unknown>) => {
    const value = finite(attrs[name], min, max);
    if (value === undefined) return {};
    const property =
      css === 'lineHeight' ? 'line-height' : css === 'marginTop' ? 'margin-top' : 'margin-bottom';
    return { style: `${property}: ${value}${css === 'lineHeight' ? '' : 'pt'}` };
  },
});

export const NativeParagraphAttributes = Extension.create({
  name: 'nativeParagraphAttributes',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph'],
        attributes: {
          lineSpacing: spacingAttribute('lineSpacing', 'lineHeight', 0.5, 10),
          spaceBefore: spacingAttribute('spaceBefore', 'marginTop', 0, 1000),
          spaceAfter: spacingAttribute('spaceAfter', 'marginBottom', 0, 1000),
          emptyRun: { default: null, rendered: false, parseHTML: () => null },
        },
      },
      {
        types: ['bulletList', 'orderedList'],
        attributes: {
          levelOffset: {
            default: 0,
            parseHTML: () => 0,
            renderHTML: (attrs) =>
              Number(attrs.levelOffset)
                ? {
                    style: `margin-left: ${Math.max(0, Math.min(8, Number(attrs.levelOffset))) * 1.5}em`,
                  }
                : {},
          },
          bulletCharacter: {
            default: null,
            parseHTML: () => null,
            renderHTML: (attrs) => {
              if (
                typeof attrs.bulletCharacter !== 'string' ||
                !attrs.bulletCharacter ||
                attrs.bulletCharacter.length > 8 ||
                /[\u0000-\u001f]/.test(attrs.bulletCharacter)
              )
                return {};
              return {
                style: `list-style-type: "${attrs.bulletCharacter.replace(/["\\]/g, '\\$&')}"`,
              };
            },
          },
        },
      },
    ];
  },
});

/** Restrict the editor schema to features represented by TextParagraph/TextRun. */
export function createRichTextExtensions() {
  return [
    StarterKit.configure({
      heading: false,
      blockquote: false,
      code: false,
      codeBlock: false,
      horizontalRule: false,
      strike: false,
      trailingNode: false,
      link: {
        openOnClick: false,
        autolink: false,
        linkOnPaste: false,
        isAllowedUri: safeHyperlink,
        HTMLAttributes: { target: null, rel: 'noopener noreferrer' },
      },
    }),
    TextStyleKit.configure({ backgroundColor: false, lineHeight: false }),
    TextAlign.configure({
      types: ['paragraph'],
      alignments: ['left', 'center', 'right'],
      defaultAlignment: null,
    }),
    NativeParagraphAttributes,
  ];
}

function inlineContent(runs: TextRun[], element: TextElement): JSONContent[] {
  return runs.flatMap((run) => {
    const marks: NonNullable<JSONContent['marks']> = [
      {
        type: 'textStyle',
        attrs: {
          fontFamily: run.fontFamily ?? element.fontFamily,
          fontSize: `${run.fontSize ?? element.fontSize}pt`,
          color: run.color ?? element.color,
        },
      },
    ];
    for (const name of ['bold', 'italic', 'underline'] as const)
      if (run[name] ?? element[name]) marks.push({ type: name });
    if (run.hyperlink && safeHyperlink(run.hyperlink))
      marks.push({
        type: 'link',
        attrs: { href: run.hyperlink, target: null, rel: 'noopener noreferrer' },
      });
    const parts = run.text.split('\n');
    return parts.flatMap((text, index): JSONContent[] => [
      ...(index ? [{ type: 'hardBreak', marks }] : []),
      ...(text ? [{ type: 'text', text, marks }] : []),
    ]);
  });
}

/** Effective styles are materialized so absence of a mark can mean an explicit false. */
export function toTiptapDocument(element: TextElement): JSONContent {
  const content: JSONContent[] = [];
  const stack: {
    level: number;
    kind: 'bullet' | 'number';
    character?: string;
    list: JSONContent;
    lastItem?: JSONContent;
  }[] = [];
  const paragraphs = getParagraphs(element);
  if (paragraphs.length > 5000) {
    throw new Error(
      'Rich editing supports up to 5,000 paragraphs. Shorten this text box or split it into smaller boxes before opening rich editing. Your original text is unchanged.',
    );
  }
  for (const paragraph of paragraphs) {
    const node: JSONContent = {
      type: 'paragraph',
      attrs: {
        textAlign: paragraph.align ?? element.align,
        lineSpacing: paragraph.lineSpacing ?? null,
        spaceBefore: paragraph.spaceBefore ?? null,
        spaceAfter: paragraph.spaceAfter ?? null,
        emptyRun: paragraph.runs.every((run) => !run.text)
          ? (paragraph.runs[0] ?? { text: '' })
          : null,
      },
      content: inlineContent(paragraph.runs, element),
    };
    const bullet = paragraph.bullet;
    if (!bullet) {
      content.push(node);
      stack.length = 0;
      continue;
    }
    while (stack.length && stack.at(-1)!.level > bullet.level) stack.pop();
    let current = stack.at(-1);
    if (
      current?.level === bullet.level &&
      (current.kind !== bullet.kind ||
        (bullet.kind === 'bullet' && current.character !== bullet.character) ||
        bullet.start !== undefined)
    ) {
      stack.pop();
      current = stack.at(-1);
    }
    if (!current || current.level !== bullet.level) {
      const list: JSONContent = {
        type: bullet.kind === 'number' ? 'orderedList' : 'bulletList',
        attrs: {
          start: bullet.start ?? 1,
          levelOffset: bullet.level - (current ? current.level + 1 : 0),
          bulletCharacter: bullet.character ?? null,
        },
        content: [],
      };
      if (current?.lastItem) current.lastItem.content!.push(list);
      else content.push(list);
      const entry = { level: bullet.level, kind: bullet.kind, character: bullet.character, list };
      stack.push(entry);
      current = entry;
    }
    const item: JSONContent = { type: 'listItem', content: [node] };
    current.list.content!.push(item);
    current.lastItem = item;
  }
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}

function readRun(node: JSONContent, element: TextElement): TextRun {
  if (node.type !== 'text' && node.type !== 'hardBreak')
    throw new Error(`Unsupported inline content: ${node.type ?? 'unknown'}.`);
  const run: TextRun = {
    text: node.type === 'hardBreak' ? '\n' : (node.text ?? ''),
    bold: false,
    italic: false,
    underline: false,
  };
  for (const mark of node.marks ?? []) {
    if (mark.type === 'bold' || mark.type === 'italic' || mark.type === 'underline')
      run[mark.type] = true;
    else if (mark.type === 'textStyle') {
      const attrs = mark.attrs ?? {};
      const size = fontPoints(attrs.fontSize);
      const color = hexColor(attrs.color);
      if (size !== undefined) run.fontSize = size;
      if (color) run.color = color;
      if (typeof attrs.fontFamily === 'string' && attrs.fontFamily.length <= 128)
        run.fontFamily = attrs.fontFamily;
    } else if (mark.type === 'link') {
      if (typeof mark.attrs?.href !== 'string' || !safeHyperlink(mark.attrs.href))
        throw new Error('Use a valid http, https, or mailto hyperlink.');
      run.hyperlink = mark.attrs.href;
    } else throw new Error(`Unsupported text formatting: ${mark.type}.`);
  }
  // Keep a stable style when text was inserted with no textStyle mark.
  run.fontSize ??= element.fontSize;
  run.fontFamily ??= element.fontFamily;
  run.color ??= element.color;
  return run;
}

function mergeRuns(runs: TextRun[]): TextRun[] {
  const result: TextRun[] = [];
  for (const run of runs) {
    const last = result.at(-1);
    const style = (value: TextRun) => JSON.stringify({ ...value, text: undefined });
    if (last && style(last) === style(run)) last.text += run.text;
    else result.push({ ...run });
  }
  return result;
}

/** Decode only supported schema nodes, rejecting unexpected data instead of hiding it. */
export function fromTiptapDocument(document: JSONContent, element: TextElement): TextParagraph[] {
  if (document.type !== 'doc') throw new Error('Expected a rich text document.');
  const result: TextParagraph[] = [];
  const paragraph = (node: JSONContent, bullet?: TextParagraph['bullet']) => {
    const attrs = node.attrs ?? {};
    const runs = mergeRuns((node.content ?? []).map((child) => readRun(child, element)));
    const p: TextParagraph = {
      runs: runs.length
        ? runs
        : [
            {
              ...(attrs.emptyRun && typeof attrs.emptyRun === 'object' ? attrs.emptyRun : {}),
              text: '',
            },
          ],
    };
    if (['left', 'center', 'right'].includes(attrs.textAlign)) p.align = attrs.textAlign;
    else p.align = element.align;
    for (const key of ['lineSpacing', 'spaceBefore', 'spaceAfter'] as const) {
      const number = finite(
        attrs[key],
        key === 'lineSpacing' ? 0.5 : 0,
        key === 'lineSpacing' ? 10 : 1000,
      );
      if (attrs[key] != null && number === undefined) throw new Error(`Invalid paragraph ${key}.`);
      if (number !== undefined) p[key] = number;
    }
    if (bullet) p.bullet = bullet;
    result.push(p);
  };
  const visit = (node: JSONContent, parentLevel = -1) => {
    if (node.type === 'paragraph') {
      paragraph(node);
      return;
    }
    if (node.type !== 'bulletList' && node.type !== 'orderedList')
      throw new Error(`Unsupported rich text block: ${node.type ?? 'unknown'}.`);
    const offset = Number(node.attrs?.levelOffset ?? 0);
    const level = parentLevel + 1 + offset;
    if (!Number.isInteger(level) || level < 0 || level > 8)
      throw new Error(
        'Lists support indentation levels 0–8. Outdent the deepest item before saving.',
      );
    const start = finite(node.attrs?.start ?? 1, 1, 32767);
    if (!start || !Number.isInteger(start))
      throw new Error('Numbered lists must start between 1 and 32,767.');
    for (const [index, item] of (node.content ?? []).entries()) {
      if (item.type !== 'listItem') throw new Error('Unsupported content inside a list.');
      let seenParagraph = false;
      for (const child of item.content ?? []) {
        if (child.type === 'paragraph') {
          if (seenParagraph)
            throw new Error(
              'Use Shift+Enter for a line break within a list item, or separate it into another item.',
            );
          seenParagraph = true;
          const bullet: NonNullable<TextParagraph['bullet']> = {
            kind: node.type === 'orderedList' ? 'number' : 'bullet',
            level,
          };
          if (bullet.kind === 'number' && index === 0) bullet.start = start;
          if (bullet.kind === 'bullet' && typeof node.attrs?.bulletCharacter === 'string')
            bullet.character = node.attrs.bulletCharacter;
          paragraph(child, bullet);
        } else visit(child, level);
      }
    }
  };
  for (const node of document.content ?? []) visit(node);
  return result.length ? result : [{ runs: [{ text: '' }] }];
}

/** Rebuild pasted HTML using a small allowlist; no raw source markup is inserted. */
export function sanitizeRichTextPaste(html: string): { html: string; changed: boolean } {
  // Parse only into an unattached template's inert content document. DOMParser's
  // text/html documents may fetch image/iframe resources before pruning them:
  // https://developer.mozilla.org/en-US/docs/Web/API/DOMParser/parseFromString
  // Original nodes must never be adopted or appended to the live document.
  const source = document.createElement('template');
  source.innerHTML = html;
  const target = document.implementation.createHTMLDocument('');
  let changed = false;
  const allowed = new Set([
    'p',
    'br',
    'span',
    'strong',
    'b',
    'em',
    'i',
    'u',
    'a',
    'ul',
    'ol',
    'li',
  ]);
  const forbidden = new Set([
    'script',
    'style',
    'iframe',
    'object',
    'embed',
    'svg',
    'math',
    'img',
    'video',
    'audio',
    'canvas',
    'input',
    'button',
    'select',
    'textarea',
    'form',
    'link',
    'meta',
  ]);
  function append(sourceNode: Node, parent: HTMLElement) {
    if (sourceNode.nodeType === Node.TEXT_NODE) {
      parent.appendChild(target.createTextNode(sourceNode.textContent ?? ''));
      return;
    }
    if (!(sourceNode instanceof Element)) return;
    let tag = sourceNode.tagName.toLowerCase();
    if (forbidden.has(tag)) {
      changed = true;
      return;
    }
    const block = /^(h[1-6]|div|blockquote|pre|section|article)$/.test(tag);
    if (!allowed.has(tag)) {
      changed = true;
      tag = block ? 'p' : 'span';
    }
    const insideItem = parent.tagName === 'LI';
    if (insideItem && tag === 'p') {
      if (parent.childNodes.length) parent.appendChild(target.createElement('br'));
      tag = 'span';
      changed = true;
    }
    const clean = target.createElement(tag);
    if (tag === 'a') {
      const href = sourceNode.getAttribute('href')?.trim() ?? '';
      if (safeHyperlink(href)) clean.setAttribute('href', href);
      else changed = true;
    }
    if (tag === 'ol') {
      const start = finite(sourceNode.getAttribute('start'), 1, 32767);
      if (start && Number.isInteger(start)) clean.setAttribute('start', String(start));
    }
    const originalStyle = (sourceNode as HTMLElement).style;
    if (originalStyle) {
      const color = hexColor(originalStyle.color);
      if (color) clean.style.color = color;
      const size = fontPoints(originalStyle.fontSize);
      if (size) clean.style.fontSize = `${size}pt`;
      if (originalStyle.fontFamily && originalStyle.fontFamily.length <= 128)
        clean.style.fontFamily = originalStyle.fontFamily;
      if (['bold', 'normal', '400', '700'].includes(originalStyle.fontWeight))
        clean.style.fontWeight = originalStyle.fontWeight;
      if (['italic', 'normal'].includes(originalStyle.fontStyle))
        clean.style.fontStyle = originalStyle.fontStyle;
      if (originalStyle.textDecoration.includes('underline'))
        clean.style.textDecoration = 'underline';
      if (tag === 'p') {
        if (['left', 'center', 'right'].includes(originalStyle.textAlign))
          clean.style.textAlign = originalStyle.textAlign;
        const spacing = finite(originalStyle.lineHeight, 0.5, 10);
        if (spacing !== undefined) clean.style.lineHeight = String(spacing);
        for (const property of ['marginTop', 'marginBottom'] as const) {
          const raw = originalStyle[property];
          const value = raw.match(/^([\d.]+)(pt|px)$/i);
          const points = value
            ? finite(Number(value[1]) * (value[2] === 'px' ? 0.75 : 1), 0, 1000)
            : undefined;
          if (points !== undefined) clean.style[property] = `${points}pt`;
        }
      }
    }
    if (
      Array.from(sourceNode.attributes).some(
        (attr) => !['style', 'href', 'start'].includes(attr.name),
      )
    )
      changed = true;
    for (const child of Array.from(sourceNode.childNodes)) append(child, clean);
    parent.appendChild(clean);
  }
  for (const child of Array.from(source.content.childNodes)) append(child, target.body);
  return { html: target.body.innerHTML, changed };
}
