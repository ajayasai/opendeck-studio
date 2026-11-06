import { useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, RotateCcw, X } from 'lucide-react';
import type { ImageElement, ImageRect } from './types';
import ImageView from './ImageView';
import { imageDisplaySource, readImageDimensions } from './imageDimensions';
import { imageOrientedDimensions } from './imageOrientation';
import {
  imageFitGeometry,
  imageGeometry,
  imageRectsFromBounds,
  resolveImageRect,
} from './imageGeometry';
import type { ImageBounds } from './imageGeometry';
import { useDialog } from './useDialog';

interface Props {
  element: ImageElement;
  onSave: (element: ImageElement) => void;
  onClose: () => void;
}

function CropNumber({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const [text, setText] = useState(String(Math.round(value * 1000000) / 1000000));
  const [previous, setPrevious] = useState(value);
  const changed = useRef(false);
  if (previous !== value) {
    setPrevious(value);
    setText(String(Math.round(value * 1000000) / 1000000));
    changed.current = false;
  }
  const commit = () => {
    if (!changed.current) return;
    changed.current = false;
    const number = Number(text);
    if (!text.trim() || !Number.isFinite(number)) {
      setText(String(Math.round(value * 1000000) / 1000000));
      return;
    }
    const next = Math.max(-2147483.648, Math.min(2147483.647, number));
    setText(String(next));
    if (next !== value) onChange(next);
  };
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        step="0.1"
        value={text}
        onChange={(event) => {
          changed.current = true;
          setText(event.target.value);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
          }
          if (event.key === 'Escape') {
            changed.current = false;
            setText(String(value));
            event.stopPropagation();
          }
        }}
      />
    </label>
  );
}

/** A local draft: panning and zooming never rewrite source image bytes or the live deck. */
export default function ImageCropEditor({ element, onSave, onClose }: Props) {
  const [draft, setDraft] = useState(element);
  const latest = useRef(draft);
  const [error, setError] = useState('');
  const [showOutside, setShowOutside] = useState(true);
  const scrollArea = useRef<HTMLDivElement>(null);
  const [previewHeight, setPreviewHeight] = useState(240);
  useEffect(() => {
    if (!scrollArea.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      setPreviewHeight(Math.max(80, Math.min(340, entry.contentRect.height - 84)));
    });
    observer.observe(scrollArea.current);
    return () => observer.disconnect();
  }, []);
  const drag = useRef<{
    pointer: number;
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    image: ImageBounds;
    draft: ImageElement;
  } | null>(null);
  const dimensions = useMemo(() => {
    const encoded = readImageDimensions(element.src);
    return encoded ? imageOrientedDimensions(encoded, element.orientation) : undefined;
  }, [element.src, element.orientation]);
  const displaySource = useMemo(
    () => (element.orientation === 'encoded' ? imageDisplaySource(element.src) : element.src),
    [element.src, element.orientation],
  );
  const geometry = imageGeometry(draft, dimensions);
  const baseline = dimensions
    ? imageFitGeometry(
        element.width,
        element.height,
        dimensions.width,
        dimensions.height,
        'contain',
      )
    : null;
  const zoom =
    geometry?.renderable && baseline?.renderable
      ? (geometry.image.width / baseline.image.width) * 100
      : 100;
  const previewScale = Math.min(640 / element.width, previewHeight / element.height);
  useDialog(true, onClose);

  function update(next: ImageElement) {
    if (element.locked) return;
    latest.current = next;
    setDraft(next);
    setError('');
  }
  function setBounds(bounds: ImageBounds, source = latest.current) {
    const rects = imageRectsFromBounds(source.width, source.height, bounds, source.fillRect);
    if (!rects) {
      setError(
        'This crop is outside the supported range. Reset the crop or choose a smaller zoom.',
      );
      return;
    }
    update({ ...source, fit: 'stretch', crop: rects.crop, fillRect: rects.fillRect });
  }
  function pan(x: number, y: number) {
    const current = latest.current,
      currentGeometry = imageGeometry(current, dimensions);
    if (!currentGeometry?.renderable) return;
    setBounds({
      ...currentGeometry.image,
      x: currentGeometry.image.x + x * (current.flipH ? -1 : 1),
      y: currentGeometry.image.y + y * (current.flipV ? -1 : 1),
    });
  }
  function scaleTo(percent: number) {
    const current = latest.current,
      currentGeometry = imageGeometry(current, dimensions);
    if (
      !currentGeometry?.renderable ||
      !baseline?.renderable ||
      !Number.isFinite(percent) ||
      percent <= 0
    )
      return;
    const ratio = (baseline.image.width * percent) / 100 / currentGeometry.image.width;
    const anchorX = current.width / 2,
      anchorY = current.height / 2;
    setBounds({
      x: anchorX + (currentGeometry.image.x - anchorX) * ratio,
      y: anchorY + (currentGeometry.image.y - anchorY) * ratio,
      width: currentGeometry.image.width * ratio,
      height: currentGeometry.image.height * ratio,
    });
  }
  function preset(fit: ImageElement['fit']) {
    update({ ...latest.current, fit, crop: undefined, fillRect: undefined });
  }
  function changeEdge(kind: 'crop' | 'fillRect', edge: keyof ImageRect, value: number) {
    const current = latest.current;
    // Materialize automatic fitting only when an edit needs an explicit source window.
    const currentGeometry = imageGeometry(current, dimensions);
    const explicit =
      current.crop !== undefined || current.fillRect !== undefined || current.fit === 'stretch'
        ? current
        : currentGeometry?.renderable
          ? {
              ...current,
              ...imageRectsFromBounds(current.width, current.height, currentGeometry.image),
            }
          : current;
    update({ ...explicit, fit: 'stretch', [kind]: { ...explicit[kind], [edge]: value / 100 } });
  }
  function save() {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const current = latest.current;
    if (current.locked) return;
    if (current !== element && !imageGeometry(current, dimensions)?.renderable) {
      setError(
        'The crop has no visible picture area. Adjust its edges or choose Fit picture before saving.',
      );
      return;
    }
    onSave(current);
  }
  const explicitGeometry = geometry?.renderable
    ? imageRectsFromBounds(draft.width, draft.height, geometry.image, draft.fillRect)
    : null;
  const crop = resolveImageRect(draft.crop ?? explicitGeometry?.crop);
  const fill = resolveImageRect(draft.fillRect);
  return (
    <div className="modal-backdrop">
      <section
        className="modal crop-editor-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="crop-editor-title"
        aria-describedby="crop-editor-description"
      >
        <button className="modal-close" aria-label="Close crop editor" onClick={onClose}>
          <X size={19} />
        </button>
        <h2 id="crop-editor-title">Crop picture</h2>
        <p id="crop-editor-description">
          Drag the picture to reposition it. Use the arrow keys for precise movement, or Shift +
          arrows for larger steps. The frame stays in place; Save applies one undoable change.
        </p>
        <div className="crop-editor-scroll" ref={scrollArea}>
          <fieldset disabled={element.locked} className="crop-editor-fields">
            <div className="crop-editor-layout">
              <div>
                <div className="crop-preview-stage">
                  <div
                    className="crop-preview-frame"
                    role="group"
                    aria-label="Crop preview"
                    tabIndex={0}
                    style={{
                      width: `min(100%, ${element.width * previewScale}px)`,
                      aspectRatio: `${element.width} / ${element.height}`,
                      touchAction: 'none',
                    }}
                    onPointerDown={(event) => {
                      if (event.button !== 0 || element.locked) return;
                      if (
                        document.activeElement instanceof HTMLElement &&
                        document.activeElement !== event.currentTarget
                      )
                        document.activeElement.blur();
                      const current = latest.current,
                        currentGeometry = imageGeometry(current, dimensions);
                      if (!currentGeometry?.renderable) return;
                      const bounds = event.currentTarget.getBoundingClientRect();
                      if (!bounds.width || !bounds.height) return;
                      event.preventDefault();
                      event.currentTarget.focus();
                      event.currentTarget.setPointerCapture(event.pointerId);
                      drag.current = {
                        pointer: event.pointerId,
                        x: event.clientX,
                        y: event.clientY,
                        scaleX: current.width / bounds.width,
                        scaleY: current.height / bounds.height,
                        image: currentGeometry.image,
                        draft: current,
                      };
                    }}
                    onPointerMove={(event) => {
                      const current = drag.current;
                      if (!current || current.pointer !== event.pointerId) return;
                      setBounds(
                        {
                          ...current.image,
                          x:
                            current.image.x +
                            (event.clientX - current.x) *
                              current.scaleX *
                              (current.draft.flipH ? -1 : 1),
                          y:
                            current.image.y +
                            (event.clientY - current.y) *
                              current.scaleY *
                              (current.draft.flipV ? -1 : 1),
                        },
                        current.draft,
                      );
                    }}
                    onPointerUp={(event) => {
                      if (drag.current?.pointer === event.pointerId) {
                        drag.current = null;
                        event.currentTarget.releasePointerCapture(event.pointerId);
                      }
                    }}
                    onPointerCancel={() => {
                      if (drag.current) {
                        update(drag.current.draft);
                        drag.current = null;
                      }
                    }}
                    onLostPointerCapture={() => {
                      drag.current = null;
                    }}
                    onKeyDown={(event) => {
                      const amount = event.shiftKey ? 10 : 1;
                      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
                        event.preventDefault();
                        pan(
                          event.key === 'ArrowLeft'
                            ? -amount
                            : event.key === 'ArrowRight'
                              ? amount
                              : 0,
                          event.key === 'ArrowUp'
                            ? -amount
                            : event.key === 'ArrowDown'
                              ? amount
                              : 0,
                        );
                      }
                    }}
                  >
                    {showOutside && geometry?.renderable && (
                      <div
                        aria-hidden="true"
                        className="crop-outside-picture"
                        style={{
                          transform: `scale(${draft.flipH ? -1 : 1}, ${draft.flipV ? -1 : 1})`,
                        }}
                      >
                        <img
                          src={displaySource}
                          alt=""
                          draggable={false}
                          style={{
                            left: `${(geometry.image.x / draft.width) * 100}%`,
                            top: `${(geometry.image.y / draft.height) * 100}%`,
                            width: `${(geometry.image.width / draft.width) * 100}%`,
                            height: `${(geometry.image.height / draft.height) * 100}%`,
                          }}
                        />
                      </div>
                    )}
                    <div className="crop-visible-picture" style={{ opacity: draft.opacity }}>
                      <ImageView element={draft} />
                    </div>
                    <div className="crop-guide" aria-hidden="true" />
                  </div>
                </div>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={showOutside}
                    onChange={(event) => setShowOutside(event.target.checked)}
                  />
                  Show cropped-out picture
                </label>
                {element.rotation !== 0 && (
                  <p className="inspector-hint">
                    The preview shows the picture before its {element.rotation}° slide rotation.
                  </p>
                )}
              </div>
              <div className="crop-options">
                <div className="crop-presets" aria-label="Picture fitting">
                  <button className="secondary-button" onClick={() => preset('contain')}>
                    Fit picture
                  </button>
                  <button className="secondary-button" onClick={() => preset('cover')}>
                    Fill frame
                  </button>
                  <button className="secondary-button" onClick={() => preset('stretch')}>
                    Stretch
                  </button>
                </div>
                <label className="field">
                  <span>Zoom · {Math.round(zoom)}%</span>
                  <input
                    aria-label="Picture zoom"
                    type="range"
                    min={Math.min(10, zoom)}
                    max={Math.max(500, zoom)}
                    step="1"
                    value={zoom}
                    disabled={!geometry?.renderable || !baseline?.renderable}
                    onChange={(event) => scaleTo(Number(event.target.value))}
                  />
                </label>
                <div className="crop-zoom-buttons">
                  <button
                    className="secondary-button"
                    aria-label="Zoom picture out"
                    onClick={() => scaleTo(zoom / 1.1)}
                    disabled={!geometry?.renderable || !baseline?.renderable}
                  >
                    <Minus size={16} />
                  </button>
                  <button
                    className="secondary-button"
                    aria-label="Zoom picture in"
                    onClick={() => scaleTo(zoom * 1.1)}
                    disabled={!geometry?.renderable || !baseline?.renderable}
                  >
                    <Plus size={16} />
                  </button>
                </div>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={draft.flipH ?? false}
                    onChange={(event) => update({ ...latest.current, flipH: event.target.checked })}
                  />
                  Flip horizontally
                </label>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={draft.flipV ?? false}
                    onChange={(event) => update({ ...latest.current, flipV: event.target.checked })}
                  />
                  Flip vertically
                </label>
                <button className="secondary-button" onClick={() => update(element)}>
                  <RotateCcw size={14} /> Reset changes
                </button>
                <p className="inspector-hint">
                  Cropped pixels remain in the file. Transparency shows the slide underneath.
                </p>
              </div>
            </div>
            <details className="crop-exact-settings">
              <summary>Exact crop and fill edges</summary>
              <div className="crop-rectangles">
                {(['crop', 'fillRect'] as const).map((kind) => (
                  <fieldset key={kind}>
                    <legend>{kind === 'crop' ? 'Source crop (%)' : 'Fill margins (%)'}</legend>
                    <div className="field-grid">
                      {(['left', 'top', 'right', 'bottom'] as const).map((edge) => (
                        <CropNumber
                          key={edge}
                          label={`${kind === 'crop' ? 'Crop' : 'Fill'} ${edge} (%)`}
                          value={(kind === 'crop' ? crop : fill)[edge] * 100}
                          onChange={(value) => changeEdge(kind, edge, value)}
                        />
                      ))}
                    </div>
                  </fieldset>
                ))}
              </div>
              <p className="inspector-hint">
                Positive crop values trim the source; negative values add transparent space. Fill
                margins place the cropped picture within the frame.
              </p>
            </details>
          </fieldset>
        </div>
        {(!geometry?.renderable || error) && (
          <p role="alert" className="form-error">
            {error ||
              geometry?.reason ||
              'The image dimensions could not be read. Choose Stretch to edit an explicit crop.'}
          </p>
        )}
        <div className="modal-actions">
          <button
            className="secondary-button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="primary-button"
            disabled={element.locked}
            onMouseDown={(event) => event.preventDefault()}
            onClick={save}
          >
            Save crop
          </button>
        </div>
      </section>
    </div>
  );
}
