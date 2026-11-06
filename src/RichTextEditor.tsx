import { useEffect, useMemo, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  List,
  ListOrdered,
  Redo2,
  RemoveFormatting,
  Underline,
  Undo2,
  Unlink,
  X,
} from 'lucide-react';
import { safeHyperlink, withParagraphs } from './richText';
import {
  createRichTextExtensions,
  fontPoints,
  fromTiptapDocument,
  hexColor,
  sanitizeRichTextPaste,
  toTiptapDocument,
} from './richTextEditorAdapter';
import type { TextElement } from './types';
import { useDialog } from './useDialog';

export interface RichTextEditorProps {
  element: TextElement;
  background?: string;
  onSave: (element: TextElement) => void;
  onClose: () => void;
}

function NumericSetting({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  function commit() {
    const number = Number(draft);
    if (!draft.trim() || !Number.isFinite(number)) {
      setDraft(String(value));
      return;
    }
    const next = Math.min(max, Math.max(min, number));
    setDraft(String(next));
    if (next !== value) onChange(next);
  }
  return (
    <label className="field rich-number-setting">
      <span>{label}</span>
      <input
        type="number"
        value={draft}
        min={min}
        max={max}
        step={step}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

export default function RichTextEditor({
  element,
  background,
  onSave,
  onClose,
}: RichTextEditorProps) {
  const [, refresh] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState('');
  const extensions = useMemo(createRichTextExtensions, []);
  const initial = useMemo(() => {
    try {
      return { content: toTiptapDocument(element), problem: '' };
    } catch (reason) {
      return {
        content: { type: 'doc', content: [{ type: 'paragraph' }] },
        problem:
          reason instanceof Error ? reason.message : 'This text cannot be opened in rich editing.',
      };
    }
  }, [element]);
  const blocked = element.locked || Boolean(initial.problem);
  const colorHex = hexColor(element.color) ?? '#000000';
  const brightness =
    [1, 3, 5]
      .map((start) => parseInt(colorHex.slice(start, start + 2), 16))
      .reduce((sum, channel) => sum + channel, 0) / 3;
  const previewBackground = background ?? (brightness > 165 ? '#1e3029' : '#ffffff');
  const editor = useEditor(
    {
      extensions,
      content: initial.content,
      editable: !blocked,
      immediatelyRender: false,
      onTransaction: () => refresh((value) => value + 1),
      editorProps: {
        attributes: {
          class: 'rich-editor-content',
          role: 'textbox',
          'aria-label': 'Rich text content',
          'aria-multiline': 'true',
          tabindex: '0',
          spellcheck: 'true',
        },
        transformPastedHTML: (html) => {
          const sanitized = sanitizeRichTextPaste(html);
          setNotice(
            'Pasted content was converted to supported text styles, paragraphs, lists, and safe links. Images and other objects belong on the slide canvas.',
          );
          return sanitized.html;
        },
        handleClick: (_view, _position, event) => {
          if ((event.target as HTMLElement).closest('a')) {
            event.preventDefault();
            return true;
          }
          return false;
        },
      },
    },
    [element.id],
  );
  useDialog(true, onClose);

  const textStyle = editor?.getAttributes('textStyle') ?? {};
  const paragraphStyle = editor?.getAttributes('paragraph') ?? {};
  const currentSize = fontPoints(textStyle.fontSize) ?? element.fontSize;
  const currentFont =
    typeof textStyle.fontFamily === 'string' ? textStyle.fontFamily : element.fontFamily;
  const currentColor = hexColor(textStyle.color) ?? element.color;
  const paragraphNumber = (key: string, fallback: number) =>
    typeof paragraphStyle[key] === 'number' ? paragraphStyle[key] : fallback;
  const listActive = Boolean(editor?.isActive('bulletList') || editor?.isActive('orderedList'));
  let listDepth = -1;
  if (editor)
    for (let depth = 0; depth <= editor.state.selection.$from.depth; depth++) {
      const node = editor.state.selection.$from.node(depth);
      if (node.type.name === 'orderedList' || node.type.name === 'bulletList')
        listDepth += 1 + Number(node.attrs.levelOffset ?? 0);
    }
  function save() {
    if (!editor || blocked) return;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    try {
      const next = withParagraphs(element, fromTiptapDocument(editor.getJSON(), element));
      onSave(next);
      onClose();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'This text could not be saved. Your original text is unchanged.',
      );
    }
  }
  function applyLink() {
    if (!editor) return;
    const href = linkDraft.trim();
    if (!safeHyperlink(href)) {
      setError(
        'Use an absolute http://, https://, or mailto: link. Other protocols are not supported.',
      );
      return;
    }
    if (editor.state.selection.empty && !editor.isActive('link')) {
      setError('Select the words to link before applying a hyperlink.');
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange('link')
      .setLink({ href, target: null, rel: 'noopener noreferrer' })
      .run();
    setError('');
    setLinkOpen(false);
  }
  const tool = (
    label: string,
    Icon: typeof Bold,
    active: boolean,
    action: () => void,
    disabled = false,
  ) => (
    <button
      type="button"
      className={`icon-button ${active ? 'active' : ''}`}
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={!editor || blocked || disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={action}
    >
      <Icon size={17} />
    </button>
  );

  return (
    <div className="modal-backdrop">
      <section
        className="modal rich-editor-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rich-editor-title"
        aria-describedby="rich-editor-description"
      >
        <button className="modal-close" aria-label="Cancel rich text editing" onClick={onClose}>
          <X size={20} />
        </button>
        <span className="eyebrow">WORDS WITH CHARACTER</span>
        <h2 id="rich-editor-title">Edit rich text</h2>
        <p id="rich-editor-description">
          Select words to change their style. Paragraph controls apply to selected paragraphs. Save
          applies this edit as one change.
        </p>
        <div className="rich-editor-toolbar" role="toolbar" aria-label="Rich text formatting">
          <div className="rich-editor-toolbar-group">
            {tool(
              'Undo rich text change',
              Undo2,
              false,
              () => editor?.chain().focus().undo().run(),
              !editor?.can().undo(),
            )}
            {tool(
              'Redo rich text change',
              Redo2,
              false,
              () => editor?.chain().focus().redo().run(),
              !editor?.can().redo(),
            )}
          </div>
          <div className="rich-editor-toolbar-group">
            {tool('Bold selected text', Bold, Boolean(editor?.isActive('bold')), () =>
              editor?.chain().focus().toggleBold().run(),
            )}
            {tool('Italic selected text', Italic, Boolean(editor?.isActive('italic')), () =>
              editor?.chain().focus().toggleItalic().run(),
            )}
            {tool(
              'Underline selected text',
              Underline,
              Boolean(editor?.isActive('underline')),
              () => editor?.chain().focus().toggleUnderline().run(),
            )}
            {tool('Clear selected text formatting', RemoveFormatting, false, () =>
              editor?.chain().focus().unsetAllMarks().run(),
            )}
          </div>
          <div className="rich-editor-toolbar-group">
            {(['left', 'center', 'right'] as const).map((align, index) => (
              <span key={align}>
                {tool(
                  `Align paragraph ${align}`,
                  [AlignLeft, AlignCenter, AlignRight][index],
                  Boolean(editor?.isActive({ textAlign: align })),
                  () => editor?.chain().focus().setTextAlign(align).run(),
                )}
              </span>
            ))}
          </div>
          <div className="rich-editor-toolbar-group">
            {tool('Bulleted list', List, Boolean(editor?.isActive('bulletList')), () =>
              editor?.chain().focus().toggleBulletList().run(),
            )}
            {tool('Numbered list', ListOrdered, Boolean(editor?.isActive('orderedList')), () =>
              editor?.chain().focus().toggleOrderedList().run(),
            )}
            {tool(
              'Indent list item',
              IndentIncrease,
              false,
              () => editor?.chain().focus().sinkListItem('listItem').run(),
              !listActive || listDepth >= 8 || !editor?.can().sinkListItem('listItem'),
            )}
            {tool(
              'Outdent list item',
              IndentDecrease,
              false,
              () => editor?.chain().focus().liftListItem('listItem').run(),
              !listActive || !editor?.can().liftListItem('listItem'),
            )}
          </div>
          <div className="rich-editor-toolbar-group">
            {tool('Add or edit hyperlink', Link2, Boolean(editor?.isActive('link')), () => {
              setLinkDraft(String(editor?.getAttributes('link').href ?? ''));
              setLinkOpen((value) => !value);
              setError('');
            })}
            {tool(
              'Remove hyperlink',
              Unlink,
              false,
              () => editor?.chain().focus().extendMarkRange('link').unsetLink().run(),
              !editor?.isActive('link'),
            )}
          </div>
        </div>
        <fieldset className="inspector-fieldset" disabled={!editor || blocked}>
          <div className="rich-editor-controls">
            <label className="field">
              <span>Selected font</span>
              <select
                value={currentFont}
                onChange={(event) =>
                  editor?.chain().focus().setFontFamily(event.target.value).run()
                }
              >
                {[
                  ...new Set([
                    currentFont,
                    'Arial',
                    'Georgia',
                    'Verdana',
                    'Tahoma',
                    'Trebuchet MS',
                    'Times New Roman',
                    'Courier New',
                  ]),
                ].map((font) => (
                  <option key={font}>{font}</option>
                ))}
              </select>
            </label>
            <NumericSetting
              label="Selected size (pt)"
              value={currentSize}
              min={1}
              max={1000}
              step={0.5}
              onChange={(value) => editor?.chain().focus().setFontSize(`${value}pt`).run()}
            />
            <label className="field">
              <span>Selected color</span>
              <input
                type="color"
                value={currentColor}
                onChange={(event) => editor?.chain().focus().setColor(event.target.value).run()}
              />
            </label>
            <NumericSetting
              label="Line spacing"
              value={paragraphNumber('lineSpacing', 1.16)}
              min={0.5}
              max={10}
              step={0.05}
              onChange={(lineSpacing) =>
                editor?.chain().focus().updateAttributes('paragraph', { lineSpacing }).run()
              }
            />
            <NumericSetting
              label="Before (pt)"
              value={paragraphNumber('spaceBefore', 0)}
              min={0}
              max={1000}
              onChange={(spaceBefore) =>
                editor?.chain().focus().updateAttributes('paragraph', { spaceBefore }).run()
              }
            />
            <NumericSetting
              label="After (pt)"
              value={paragraphNumber('spaceAfter', 0)}
              min={0}
              max={1000}
              onChange={(spaceAfter) =>
                editor?.chain().focus().updateAttributes('paragraph', { spaceAfter }).run()
              }
            />
            {editor?.isActive('orderedList') && (
              <NumericSetting
                label="Numbering starts at"
                value={Number(editor.getAttributes('orderedList').start ?? 1)}
                min={1}
                max={32767}
                onChange={(value) =>
                  editor
                    .chain()
                    .focus()
                    .updateAttributes('orderedList', { start: Math.round(value) })
                    .run()
                }
              />
            )}
          </div>
        </fieldset>
        {linkOpen && (
          <div className="rich-link-form">
            <label className="field">
              <span>Hyperlink URL</span>
              <input
                autoFocus
                type="url"
                value={linkDraft}
                maxLength={2048}
                placeholder="https://example.com"
                onChange={(event) => setLinkDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    applyLink();
                  }
                }}
              />
            </label>
            <button className="secondary-button" disabled={!editor || blocked} onClick={applyLink}>
              Apply link
            </button>
            <button className="secondary-button" onClick={() => setLinkOpen(false)}>
              Cancel link
            </button>
          </div>
        )}
        {(error || initial.problem) && (
          <p className="field-error" role="alert">
            {error || initial.problem}
          </p>
        )}
        {notice && (
          <p className="rich-editor-notice" role="status">
            {notice}
          </p>
        )}
        {element.locked && (
          <p className="field-error">Unlock this object in the editor before changing its text.</p>
        )}
        <div
          className="rich-editor-area"
          style={{
            background: previewBackground,
            color: element.color,
            fontFamily: element.fontFamily,
            fontSize: `${element.fontSize}pt`,
            fontWeight: 400,
            fontStyle: 'normal',
            textDecoration: 'none',
            lineHeight: 1.16,
          }}
        >
          <EditorContent editor={editor} />
        </div>
        <div className="rich-editor-footer">
          <p className="inspector-hint">
            Enter: new paragraph · Shift+Enter: line break · Links stay closed while editing.
          </p>
          <div className="modal-actions">
            <button className="secondary-button" onClick={onClose}>
              Cancel
            </button>
            <button className="primary-button" disabled={!editor || blocked} onClick={save}>
              Save text
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
