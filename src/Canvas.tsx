import { useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import type { PointerEvent, Ref } from 'react';
import type { Deck, Slide, SlideElement, GroupElement } from './types';
import { ElementContent, elementStyle } from './SlideView';
import { replacePlainText } from './richText';
import { resolveTextFrame, textContentRect } from './textFrame';
import { textScale } from './textLayout';
import TextDecorationView from './TextDecorationView';
import SlideBackground, { slideBaseBackground } from './SlideBackground';

interface Props {
  ref?: Ref<CanvasHandle>;
  deck: Deck;
  slide: Slide;
  selected: string[];
  onSelect: (ids: string[]) => void;
  onChange: (elements: SlideElement[]) => SlideElement[] | void;
  getElements?: () => SlideElement[];
  zoom: number;
  grid: boolean;
  origin?: { x: number; y: number };
  onEditGroup?: (group: GroupElement) => void;
}
export interface CanvasHandle {
  finishText: () => boolean;
  focus: () => void;
  hasPendingText: () => boolean;
}
type Gesture = {
  kind: 'move' | 'resize';
  startX: number;
  startY: number;
  original: SlideElement[];
  ids: string[];
  pointerId: number;
};
export default function Canvas({
  deck,
  slide,
  selected,
  onSelect,
  onChange,
  getElements,
  zoom,
  grid,
  origin = { x: 0, y: 0 },
  onEditGroup,
  ref,
}: Props) {
  const [draft, setDraft] = useState<SlideElement[] | null>(null),
    draftRef = useRef<SlideElement[] | null>(null),
    gesture = useRef<Gesture | null>(null);
  const [editing, setEditing] = useState<string | null>(null),
    [text, setText] = useState(''),
    [textError, setTextError] = useState('');
  const textInput = useRef<HTMLTextAreaElement>(null),
    editingId = useRef<string | null>(null),
    textValue = useRef(''),
    currentElements = useRef(slide.elements),
    errorId = useId();
  currentElements.current = slide.elements;
  useImperativeHandle(ref, () => ({
    finishText: () => finishText() !== null,
    focus: () => textInput.current?.focus(),
    hasPendingText: () =>
      Boolean(
        editingId.current &&
        currentElements.current.some(
          (element) =>
            element.id === editingId.current &&
            element.type === 'text' &&
            element.text !== textValue.current,
        ),
      ),
  }));
  useEffect(() => {
    setEditing(null);
    editingId.current = null;
    setTextError('');
    setDraft(null);
    draftRef.current = null;
    gesture.current = null;
  }, [slide.id]);
  useEffect(() => {
    if (
      !editing ||
      !slide.elements.some(
        (element) => element.id === editing && element.type === 'text' && element.text !== text,
      )
    )
      return;
    const protectDraft = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protectDraft);
    return () => window.removeEventListener('beforeunload', protectDraft);
  }, [editing, text, slide.elements]);
  const elements = draft ?? slide.elements;
  const readElements = () => getElements?.() ?? currentElements.current;
  function start(ev: PointerEvent<HTMLElement>, element: SlideElement, kind: 'move' | 'resize') {
    if (ev.button !== 0 || editing === element.id) return;
    ev.stopPropagation();
    // Pointerdown precedes the browser's default blur. Commit Inspector drafts
    // first so their typography and resulting fitted geometry enter the snapshot.
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      active !== textInput.current &&
      active.matches('input,textarea,select')
    )
      active.blur();
    const original = finishText();
    if (!original) {
      ev.preventDefault();
      textInput.current?.focus();
      return;
    }
    const ids = ev.shiftKey
      ? selected.includes(element.id)
        ? selected.filter((id) => id !== element.id)
        : [...selected, element.id]
      : selected.includes(element.id)
        ? selected
        : [element.id];
    onSelect(ids);
    if (element.locked || !ids.includes(element.id)) return;
    gesture.current = {
      kind,
      startX: ev.clientX,
      startY: ev.clientY,
      original,
      ids: kind === 'resize' ? [element.id] : ids,
      pointerId: ev.pointerId,
    };
    ev.currentTarget.setPointerCapture(ev.pointerId);
  }
  function move(ev: PointerEvent<HTMLElement>) {
    const g = gesture.current;
    if (!g) return;
    const dx = (ev.clientX - g.startX) / zoom,
      dy = (ev.clientY - g.startY) / zoom;
    if (Math.abs(dx) + Math.abs(dy) < 2 && !draftRef.current) return;
    const snap = (n: number) => (grid && !ev.altKey ? Math.round(n / 8) * 8 : Math.round(n));
    const next = g.original.map((e) => {
      if (!g.ids.includes(e.id) || e.locked) return e;
      if (g.kind === 'move')
        return {
          ...e,
          x: Math.max(origin.x - e.width + 8, Math.min(origin.x + deck.width - 8, snap(e.x + dx))),
          y: Math.max(
            origin.y - e.height + 8,
            Math.min(origin.y + deck.height - 8, snap(e.y + dy)),
          ),
        };
      const radians = (e.rotation * Math.PI) / 180,
        localDx = dx * Math.cos(radians) + dy * Math.sin(radians),
        localDy = -dx * Math.sin(radians) + dy * Math.cos(radians);
      let width = Math.max(12, snap(e.width + localDx)),
        height = Math.max(12, snap(e.height + localDy));
      if (ev.shiftKey) height = (width * e.height) / e.width;
      return { ...e, width: Math.min(10000, width), height: Math.min(10000, height) };
    });
    draftRef.current = next;
    setDraft(next);
  }
  function finish() {
    const g = gesture.current,
      proposed = draftRef.current;
    if (g && proposed) {
      const originals = new Map(g.original.map((element) => [element.id, element]));
      const drafts = new Map(proposed.map((element) => [element.id, element]));
      const next = readElements().map((element) => {
        const before = originals.get(element.id),
          after = drafts.get(element.id);
        if (!g.ids.includes(element.id) || element.locked || !before || !after) return element;
        return g.kind === 'move'
          ? {
              ...element,
              x: Math.max(
                origin.x - element.width + 8,
                Math.min(origin.x + deck.width - 8, element.x + after.x - before.x),
              ),
              y: Math.max(
                origin.y - element.height + 8,
                Math.min(origin.y + deck.height - 8, element.y + after.y - before.y),
              ),
            }
          : {
              ...element,
              width: Math.max(12, Math.min(10000, element.width + after.width - before.width)),
              height: Math.max(12, Math.min(10000, element.height + after.height - before.height)),
            };
      });
      currentElements.current = onChange(next) ?? next;
    }
    gesture.current = null;
    draftRef.current = null;
    setDraft(null);
  }
  function cancel() {
    gesture.current = null;
    draftRef.current = null;
    setDraft(null);
  }
  function finishText(): SlideElement[] | null {
    currentElements.current = readElements();
    if (!editingId.current) return currentElements.current;
    const id = editingId.current;
    let next = currentElements.current;
    try {
      if (next.some((e) => e.id === id && e.type === 'text' && e.text !== textValue.current))
        next = next.map((e) =>
          e.id === id && e.type === 'text' ? replacePlainText(e, textValue.current) : e,
        );
    } catch (error) {
      setTextError(
        `${error instanceof Error ? error.message : 'This text could not be applied.'} Your draft is still in the text box. Shorten it, or press Escape to discard the draft.`,
      );
      return null;
    }
    setEditing(null);
    editingId.current = null;
    setTextError('');
    if (next !== currentElements.current) {
      // The parent can synchronously fit the edit before history publication.
      // A gesture beginning in the same event must use that accepted geometry.
      const accepted = onChange(next);
      if (accepted) next = accepted;
      currentElements.current = next;
    }
    return next;
  }
  return (
    <div className="canvas-frame" style={{ width: deck.width * zoom, height: deck.height * zoom }}>
      <div
        className={`editing-slide ${grid ? 'show-grid' : ''}`}
        data-testid="slide-canvas"
        role="region"
        aria-label="Slide canvas"
        style={{
          width: deck.width,
          height: deck.height,
          backgroundColor: slideBaseBackground(slide),
          transform: `scale(${zoom})`,
        }}
        onPointerDown={(ev) => {
          if (ev.button !== 0) return;
          if (!finishText()) {
            ev.preventDefault();
            textInput.current?.focus();
            return;
          }
          onSelect([]);
        }}
      >
        <SlideBackground slide={slide} width={deck.width} height={deck.height} />
        {grid && <div className="canvas-grid" aria-hidden="true" />}
        {elements.map((e) => (
          <div
            key={e.id}
            className={`canvas-element ${selected.includes(e.id) ? 'selected' : ''} ${e.locked ? 'locked' : ''}`}
            data-testid={`element-${e.id}`}
            role="button"
            aria-label={`${e.type}: ${e.name}${e.locked ? ' (locked)' : ''}`}
            tabIndex={0}
            style={
              {
                ...elementStyle(e),
                left: e.x - origin.x,
                top: e.y - origin.y,
                '--handle-scale': 1 / zoom,
              } as React.CSSProperties
            }
            onFocus={() => {}}
            onKeyDown={(ev) => {
              if (ev.target !== ev.currentTarget) return;
              if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                if (editing && editing !== e.id && !finishText()) return;
                onSelect([e.id]);
                if (e.type === 'group' && !e.locked) onEditGroup?.(e);
                if (e.type === 'text' && !e.locked) {
                  setTextError('');
                  setEditing(e.id);
                  editingId.current = e.id;
                  setText(e.text);
                  textValue.current = e.text;
                }
              }
            }}
            onPointerDown={(ev) => start(ev, e, 'move')}
            onPointerMove={move}
            onPointerUp={finish}
            onPointerCancel={cancel}
            onDoubleClick={(ev) => {
              ev.stopPropagation();
              if (editing === e.id) return;
              if (editing && !finishText()) return;
              if (e.type === 'group' && !e.locked) onEditGroup?.(e);
              if (e.type === 'text' && !e.locked) {
                setTextError('');
                setEditing(e.id);
                editingId.current = e.id;
                setText(e.text);
                textValue.current = e.text;
              }
            }}
          >
            {editing === e.id && e.type === 'text' ? (
              <>
                <TextDecorationView element={e} />
                <textarea
                  autoFocus
                  ref={textInput}
                  maxLength={100000}
                  aria-label="Edit text on slide"
                  aria-invalid={Boolean(textError)}
                  aria-describedby={textError ? errorId : undefined}
                  className="canvas-text-editor"
                  wrap={resolveTextFrame(e).wrap === 'none' ? 'off' : 'soft'}
                  value={text}
                  onChange={(ev) => {
                    setText(ev.target.value);
                    textValue.current = ev.target.value;
                    setTextError('');
                  }}
                  onBlur={finishText}
                  onPointerDown={(ev) => ev.stopPropagation()}
                  onKeyDown={(ev) => {
                    if (!((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's'))
                      ev.stopPropagation();
                    if (ev.key === 'Escape') {
                      setEditing(null);
                      editingId.current = null;
                      setTextError('');
                    }
                    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
                      finishText();
                    }
                  }}
                  style={{
                    position: 'absolute',
                    ...textContentRect(e),
                    whiteSpace: resolveTextFrame(e).wrap === 'none' ? 'pre' : 'pre-wrap',
                    overflowWrap: resolveTextFrame(e).wrap === 'none' ? 'normal' : 'break-word',
                    fontSize: `${e.fontSize * textScale(e)}pt`,
                    fontFamily: e.fontFamily,
                    color: e.color,
                    fontWeight: e.bold ? 700 : 400,
                    fontStyle: e.italic ? 'italic' : 'normal',
                    textAlign: e.align,
                  }}
                />
              </>
            ) : (
              <ElementContent element={e} />
            )}
            {selected.includes(e.id) && !e.locked && editing !== e.id && (
              <>
                <span className="selection-label">{e.name}</span>
                <button
                  type="button"
                  className="resize-handle"
                  aria-label={`Resize ${e.name}`}
                  onPointerDown={(ev) => start(ev, e, 'resize')}
                  onPointerMove={move}
                  onPointerUp={(ev) => {
                    ev.stopPropagation();
                    finish();
                  }}
                  onPointerCancel={cancel}
                />
              </>
            )}
          </div>
        ))}
      </div>
      {textError && (
        <div
          id={errorId}
          className="canvas-text-error"
          role="alert"
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 50,
            padding: '10px 14px',
            background: '#fff4e8',
            color: '#783d18',
            borderTop: '1px solid #d8a071',
            fontSize: 13,
            lineHeight: 1.4,
          }}
        >
          {textError}
        </div>
      )}
    </div>
  );
}
