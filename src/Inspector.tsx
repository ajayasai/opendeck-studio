import { useEffect, useId, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  Bold,
  Image,
  Italic,
  Layers,
  LockKeyhole,
  Palette,
  Settings2,
  Underline,
  UnlockKeyhole,
} from 'lucide-react';
import { THEMES } from './model';
import { replacePlainText } from './richText';
import { resolveTextFrame, textContentRect } from './textFrame';
import { resolveAutoFit } from './textFit';
import {
  DEFAULT_TEXT_CORNER_RADIUS,
  resolveTextDecoration,
  TEXT_LINE_DASHES,
} from './textDecoration';
import type {
  ChartElement,
  Deck,
  Slide,
  SlideElement,
  TableElement,
  TextElement,
  TextFrame,
  TextAutoFit,
  TextDecoration,
  TextDecorationLine,
  Theme,
} from './types';

export interface InspectorProps {
  deck: Deck;
  slide: Slide;
  selected: SlideElement[];
  onElementPatch: (patch: Partial<SlideElement>) => void;
  onSlidePatch: (patch: Partial<Slide>) => void;
  onTheme: (theme: Theme) => void;
  onSelect: (id: string) => void;
  onLayer: (direction: 'front' | 'back' | 'forward' | 'backward') => void;
  onEditRichText?: (element: TextElement) => void;
  onFitText?: (element: TextElement) => void;
}

function NumberField({
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
  const [draft, setDraft] = useState(String(Math.round(value * 100) / 100));
  const changed = useRef(false);
  useEffect(() => {
    changed.current = false;
    setDraft(String(Math.round(value * 100) / 100));
  }, [value]);
  const commit = () => {
    // Formatting the display must not round-trip untouched imported geometry.
    if (!changed.current) return;
    changed.current = false;
    const next = Number(draft);
    if (!draft.trim() || !Number.isFinite(next)) {
      setDraft(String(value));
      return;
    }
    const bounded = Math.min(max, Math.max(min, next));
    setDraft(String(bounded));
    if (bounded !== value) onChange(bounded);
  };
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        value={draft}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          changed.current = true;
          setDraft(event.target.value);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') {
            changed.current = false;
            setDraft(String(value));
            event.stopPropagation();
          }
        }}
      />
    </label>
  );
}

function TextFrameControls({
  element,
  onChange,
}: {
  element: TextElement;
  onChange: (frame: TextFrame) => void;
}) {
  const frame = resolveTextFrame(element),
    content = textContentRect(element);
  return (
    <section className="panel-section">
      <h3>Text box</h3>
      <div className="field-grid">
        {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
          <NumberField
            key={side}
            label={`${side[0].toUpperCase()}${side.slice(1)} margin (px)`}
            value={frame.insets[side]}
            min={-10000}
            max={10000}
            step={0.1}
            onChange={(value) => onChange({ ...frame, insets: { ...frame.insets, [side]: value } })}
          />
        ))}
      </div>
      <p className="inspector-hint">Negative margins extend the text area beyond the box.</p>
      {(!content.width || !content.height) && (
        <p className="field-error" role="alert">
          Margins leave no room for text. Reduce the margins or enlarge the box.
        </p>
      )}
      <button
        className="secondary-button"
        onClick={() => onChange({ ...frame, insets: { top: 0, right: 0, bottom: 0, left: 0 } })}
      >
        Reset margins
      </button>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={frame.wrap === 'square'}
          onChange={(event) =>
            onChange({ ...frame, wrap: event.target.checked ? 'square' : 'none' })
          }
        />
        Wrap text
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={frame.paragraphSpacingAtEdges ?? true}
          onChange={(event) =>
            onChange({ ...frame, paragraphSpacingAtEdges: event.target.checked })
          }
        />
        Include spacing at text box edges
      </label>
      {(['horizontalOverflow', 'verticalOverflow'] as const).map((axis) => (
        <label className="field" key={axis}>
          <span>{axis === 'horizontalOverflow' ? 'Text beyond width' : 'Text beyond height'}</span>
          <select
            value={frame[axis]}
            onChange={(event) =>
              onChange({ ...frame, [axis]: event.target.value as 'overflow' | 'clip' })
            }
          >
            <option value="overflow">Allow overflow</option>
            <option value="clip">Clip at box edge</option>
          </select>
        </label>
      ))}
    </section>
  );
}

function TextDecorationControls({
  element,
  onChange,
}: {
  element: TextElement;
  onChange: (decoration: TextDecoration) => void;
}) {
  const decoration = resolveTextDecoration(element);
  const dashLabels: Record<TextDecorationLine['dash'], string> = {
    solid: 'Solid',
    dash: 'Dash',
    dot: 'Dot',
    dashDot: 'Dash-dot',
    longDash: 'Long dash',
    longDashDot: 'Long dash-dot',
    longDashDotDot: 'Long dash-dot-dot',
    sysDash: 'Compact dash',
    sysDot: 'Compact dot',
    sysDashDot: 'Compact dash-dot',
    sysDashDotDot: 'Compact dash-dot-dot',
  };
  return (
    <section className="panel-section">
      <h3>Text box appearance</h3>
      <label className="field">
        <span>Text box shape</span>
        <select
          value={decoration.shape}
          onChange={(event) =>
            onChange({ ...decoration, shape: event.target.value as TextDecoration['shape'] })
          }
        >
          <option value="rect">Rectangle</option>
          <option value="roundRect">Rounded rectangle</option>
          <option value="ellipse">Ellipse</option>
          <option value="triangle">Triangle</option>
        </select>
      </label>
      {decoration.shape === 'roundRect' && (
        <NumberField
          label="Corner roundness (%)"
          value={(decoration.cornerRadius ?? DEFAULT_TEXT_CORNER_RADIUS) * 100}
          min={0}
          max={50}
          step={0.1}
          onChange={(value) => onChange({ ...decoration, cornerRadius: value / 100 })}
        />
      )}
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={decoration.fill !== null}
          onChange={(event) =>
            onChange({
              ...decoration,
              fill: event.target.checked ? { color: '#ffffff', opacity: 1 } : null,
            })
          }
        />
        Text box fill
      </label>
      {decoration.fill && (
        <>
          <ColorField
            label="Text box fill color"
            value={decoration.fill.color}
            onChange={(color) => onChange({ ...decoration, fill: { ...decoration.fill!, color } })}
          />
          <NumberField
            label="Fill opacity (%)"
            value={decoration.fill.opacity * 100}
            min={0}
            max={100}
            onChange={(value) =>
              onChange({ ...decoration, fill: { ...decoration.fill!, opacity: value / 100 } })
            }
          />
        </>
      )}
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={decoration.line !== null}
          onChange={(event) =>
            onChange({
              ...decoration,
              line: event.target.checked
                ? { color: element.color, opacity: 1, width: 1, dash: 'solid' }
                : null,
            })
          }
        />
        Text box outline
      </label>
      {decoration.line && (
        <>
          <ColorField
            label="Text box outline color"
            value={decoration.line.color}
            onChange={(color) => onChange({ ...decoration, line: { ...decoration.line!, color } })}
          />
          <NumberField
            label="Outline opacity (%)"
            value={decoration.line.opacity * 100}
            min={0}
            max={100}
            onChange={(value) =>
              onChange({ ...decoration, line: { ...decoration.line!, opacity: value / 100 } })
            }
          />
          <NumberField
            label="Outline width (px)"
            value={decoration.line.width}
            min={0}
            max={100}
            step={0.25}
            onChange={(width) => onChange({ ...decoration, line: { ...decoration.line!, width } })}
          />
          <label className="field">
            <span>Outline dash</span>
            <select
              value={decoration.line.dash}
              onChange={(event) =>
                onChange({
                  ...decoration,
                  line: {
                    ...decoration.line!,
                    dash: event.target.value as TextDecorationLine['dash'],
                  },
                })
              }
            >
              {TEXT_LINE_DASHES.map((dash) => (
                <option value={dash} key={dash}>
                  {dashLabels[dash]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Outline cap</span>
            <select
              value={decoration.line.cap ?? 'flat'}
              onChange={(event) =>
                onChange({
                  ...decoration,
                  line: {
                    ...decoration.line!,
                    cap: event.target.value as TextDecorationLine['cap'],
                  },
                })
              }
            >
              <option value="flat">Flat</option>
              <option value="round">Round</option>
              <option value="square">Square</option>
            </select>
          </label>
          <label className="field">
            <span>Outline join</span>
            <select
              value={decoration.line.join ?? 'round'}
              onChange={(event) =>
                onChange({
                  ...decoration,
                  line: {
                    ...decoration.line!,
                    join: event.target.value as TextDecorationLine['join'],
                  },
                })
              }
            >
              <option value="round">Round</option>
              <option value="bevel">Bevel</option>
              <option value="miter">Miter</option>
            </select>
          </label>
          {decoration.line.join === 'miter' && (
            <NumberField
              label="Miter limit"
              value={decoration.line.miterLimit ?? 8}
              min={0}
              max={21474.83647}
              step={0.1}
              onChange={(miterLimit) =>
                onChange({ ...decoration, line: { ...decoration.line!, miterLimit } })
              }
            />
          )}
          {decoration.line.width === 0 && (
            <p className="inspector-hint">Hairline outline: shown as one pixel on screen.</p>
          )}
        </>
      )}
    </section>
  );
}

function AutoFitControls({
  element,
  onChange,
  onRecalculate,
}: {
  element: TextElement;
  onChange: (fit: TextAutoFit) => void;
  onRecalculate?: () => void;
}) {
  const fit = resolveAutoFit(element);
  return (
    <section className="panel-section">
      <h3>AutoFit</h3>
      <label className="field">
        <span>Text fitting</span>
        <select
          value={fit.mode}
          onChange={(event) =>
            onChange(
              event.target.value === 'shrink'
                ? { mode: 'shrink', fontScale: 1, lineSpacingReduction: 0 }
                : { mode: event.target.value as 'none' | 'resize' },
            )
          }
        >
          <option value="none">Do not autofit</option>
          <option value="shrink">Shrink text to fit</option>
          <option value="resize">Resize box to fit text</option>
        </select>
      </label>
      {fit.mode === 'shrink' && (
        <p className="inspector-hint" role="status">
          Text scale: {Math.round(fit.fontScale * 10000) / 100}%. Authored font sizes are retained.
          {fit.lineSpacingReduction > 0
            ? ` Line spacing reduction: ${Math.round(fit.lineSpacingReduction * 10000) / 100} percentage points.`
            : ''}
        </p>
      )}
      {fit.mode !== 'none' && (
        <>
          <p className="inspector-hint">
            Fitting updates when text, formatting or box size changes. Recalculate uses the fonts
            available on this device.
          </p>
          {fit.mode === 'shrink' && fit.fontScale <= 0.01 && (
            <p className="field-error" role="alert">
              Minimum text scale reached. Enlarge the box or shorten the text if it still overflows.
            </p>
          )}
          {fit.mode === 'resize' &&
            (element.height >= 100000 ||
              element.width >= 100000 ||
              Math.abs(element.x) >= 100000 ||
              Math.abs(element.y) >= 100000) && (
              <p className="field-error" role="alert">
                Document geometry limit reached. Move the box or shorten the text if it still
                overflows.
              </p>
            )}
          {onRecalculate && (
            <button className="secondary-button" onClick={onRecalculate}>
              Recalculate fit
            </button>
          )}
        </>
      )}
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
  multiline = false,
  maxLength = 100000,
  validate,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  maxLength?: number;
  validate?: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState('');
  const errorId = useId();
  useEffect(() => {
    setDraft(value);
    setError('');
  }, [value]);
  function accept(candidate: string) {
    try {
      validate?.(candidate);
      setDraft(candidate);
      setError('');
    } catch (reason) {
      setError(
        `${reason instanceof Error ? reason.message : 'This text exceeds the supported limits.'} This edit was not accepted; the last valid text is still shown. Shorten the edit or use the styled editor.`,
      );
    }
  }
  const commit = () => {
    if (draft !== value) onChange(draft);
  };
  return (
    <>
      <label className="field">
        <span>{label}</span>
        {multiline ? (
          <textarea
            value={draft}
            rows={4}
            maxLength={maxLength}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => accept(event.target.value)}
            onBlur={commit}
          />
        ) : (
          <input
            value={draft}
            maxLength={maxLength}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => accept(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
          />
        )}
      </label>
      {error && (
        <p id={errorId} className="field-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

function ColorField({
  label,
  value,
  onChange,
  allowTransparent = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  allowTransparent?: boolean;
}) {
  return (
    <div className="field">
      <label className="color-field">
        <span>{label}</span>
        <input
          type="color"
          aria-label={label}
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#ffffff'}
          onChange={(event) => onChange(event.target.value)}
        />
        <span className="color-value">
          {value === 'transparent' ? 'None' : value.toUpperCase()}
        </span>
      </label>
      {allowTransparent && (
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={value === 'transparent'}
            onChange={(event) => onChange(event.target.checked ? 'transparent' : '#ffffff')}
          />
          No {label.toLowerCase()}
        </label>
      )}
    </div>
  );
}

function TableDataEditor({
  element,
  onPatch,
}: {
  element: TableElement;
  onPatch: InspectorProps['onElementPatch'];
}) {
  const source = element.rows.map((row) => row.join('\t')).join('\n');
  const [draft, setDraft] = useState(source);
  const [error, setError] = useState('');
  const errorId = useId();
  useEffect(() => {
    setDraft(source);
    setError('');
  }, [element.id, source]);
  const apply = () => {
    const rows = draft
      .replace(/\r/g, '')
      .split('\n')
      .map((row) => row.split('\t'));
    if (rows.length > 100 || rows[0].length > 50) {
      setError('Use at most 100 rows and 50 columns.');
      return;
    }
    if (rows.some((row) => row.length !== rows[0].length)) {
      setError('Every row needs the same number of tab-separated cells.');
      return;
    }
    if (rows.some((row) => row.some((cell) => cell.length > 10000))) {
      setError('Each cell may contain at most 10,000 characters.');
      return;
    }
    onPatch({ rows });
    setError('');
  };
  return (
    <>
      <label className="field">
        <span>Table data</span>
        <textarea
          className="data-editor"
          aria-describedby={error ? errorId : undefined}
          aria-invalid={Boolean(error)}
          rows={6}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>
      <p className="inspector-hint">
        Paste cells from a spreadsheet. Tabs separate columns; new lines separate rows.
      </p>
      {error && (
        <p id={errorId} className="field-error" role="alert">
          {error}
        </p>
      )}
      <button className="secondary-button" type="button" onClick={apply}>
        Apply table data
      </button>
    </>
  );
}

function ChartDataEditor({
  element,
  onPatch,
}: {
  element: ChartElement;
  onPatch: InspectorProps['onElementPatch'];
}) {
  const labelsSource = element.labels.join('\n');
  const valuesSource = element.values.join('\n');
  const [labelsDraft, setLabelsDraft] = useState(labelsSource);
  const [valuesDraft, setValuesDraft] = useState(valuesSource);
  const [error, setError] = useState('');
  const errorId = useId();
  useEffect(() => {
    setLabelsDraft(labelsSource);
    setValuesDraft(valuesSource);
    setError('');
  }, [element.id, labelsSource, valuesSource]);
  const apply = () => {
    const labels = labelsDraft.replace(/\r/g, '').split('\n');
    const rawValues = valuesDraft.replace(/\r/g, '').split('\n');
    const values = rawValues.map(Number);
    if (labels.length !== values.length || labels.length > 1000) {
      setError('Use matching numbers of labels and values, up to 1,000 each.');
      return;
    }
    if (labels.some((label) => !label.trim() || label.length > 1000)) {
      setError('Each label needs 1–1,000 characters.');
      return;
    }
    if (
      rawValues.some((value) => !value.trim()) ||
      values.some((value) => !Number.isFinite(value) || Math.abs(value) > 1e12)
    ) {
      setError('Each value must be a finite number between −1 trillion and 1 trillion.');
      return;
    }
    if (
      element.chartType === 'pie' &&
      (values.some((value) => value < 0) || !values.some((value) => value > 0))
    ) {
      setError('A pie chart needs nonnegative values with at least one positive value.');
      return;
    }
    onPatch({ labels, values });
    setError('');
  };
  return (
    <>
      <div className="field-grid">
        <label className="field">
          <span>Labels</span>
          <textarea
            rows={6}
            value={labelsDraft}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => setLabelsDraft(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Values</span>
          <textarea
            rows={6}
            value={valuesDraft}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => setValuesDraft(event.target.value)}
          />
        </label>
      </div>
      <p className="inspector-hint">One label and numeric value per line.</p>
      {error && (
        <p id={errorId} className="field-error" role="alert">
          {error}
        </p>
      )}
      <button className="secondary-button" type="button" onClick={apply}>
        Apply chart data
      </button>
    </>
  );
}

export function Inspector({
  deck,
  slide,
  selected,
  onElementPatch,
  onSlidePatch,
  onTheme,
  onSelect,
  onLayer,
  onEditRichText,
  onFitText,
}: InspectorProps) {
  const [tab, setTab] = useState<'format' | 'design' | 'layers'>('format');
  const element = selected.length === 1 ? selected[0] : undefined;
  const allLocked = selected.length > 0 && selected.every((item) => item.locked);
  const canEdit = selected.some((item) => !item.locked);
  return (
    <aside className="inspector" aria-label="Slide inspector">
      <div className="inspector-tabs" role="tablist" aria-label="Inspector panels">
        {(
          [
            { id: 'format', label: 'Format', Icon: Settings2 },
            { id: 'design', label: 'Design', Icon: Palette },
            { id: 'layers', label: 'Layers', Icon: Layers },
          ] as const
        ).map(({ id, label, Icon }) => (
          <button
            key={id}
            id={`inspector-tab-${id}`}
            role="tab"
            aria-selected={tab === id}
            aria-controls={`inspector-panel-${id}`}
            className={tab === id ? 'active' : ''}
            onClick={() => setTab(id)}
          >
            <Icon size={15} />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <div
        className="inspector-body"
        id={`inspector-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`inspector-tab-${tab}`}
      >
        {tab === 'format' && (
          <>
            <section className="panel-section">
              <div className="section-heading">
                <h3>
                  {element
                    ? element.type[0].toUpperCase() + element.type.slice(1)
                    : selected.length
                      ? `${selected.length} objects selected`
                      : 'Slide settings'}
                </h3>
                {selected.length > 0 && (
                  <button
                    className="icon-button"
                    title={allLocked ? 'Unlock selected objects' : 'Lock selected objects'}
                    aria-label={allLocked ? 'Unlock selected objects' : 'Lock selected objects'}
                    onClick={() => onElementPatch({ locked: !allLocked })}
                  >
                    {allLocked ? <LockKeyhole size={16} /> : <UnlockKeyhole size={16} />}
                  </button>
                )}
              </div>
              {!selected.length ? (
                <>
                  <TextField
                    key={slide.id}
                    label="Slide name"
                    value={slide.name}
                    maxLength={256}
                    onChange={(name) => onSlidePatch({ name })}
                  />
                  <ColorField
                    label="Background"
                    value={slide.background}
                    onChange={(background) => onSlidePatch({ background })}
                  />
                  <label className="field">
                    <span>Transition</span>
                    <select
                      value={slide.transition}
                      onChange={(event) =>
                        onSlidePatch({ transition: event.target.value as Slide['transition'] })
                      }
                    >
                      <option value="none">None</option>
                      <option value="fade">Fade</option>
                      <option value="slide">Slide</option>
                    </select>
                  </label>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={slide.hidden}
                      onChange={(event) => onSlidePatch({ hidden: event.target.checked })}
                    />
                    Skip in presentation
                  </label>
                  <p className="inspector-hint">
                    Select an object on the canvas to format it. Hold Shift to select several.
                  </p>
                </>
              ) : (
                <>
                  {allLocked && (
                    <p className="inspector-hint">Unlock this selection to make changes.</p>
                  )}
                  {element && (
                    <fieldset disabled={element.locked} className="inspector-fieldset">
                      <TextField
                        key={element.id}
                        label="Object name"
                        value={element.name}
                        maxLength={256}
                        onChange={(name) => onElementPatch({ name })}
                      />
                      <div className="field-grid">
                        <NumberField
                          label="X"
                          value={element.x}
                          min={-100000}
                          max={100000}
                          onChange={(x) => onElementPatch({ x })}
                        />
                        <NumberField
                          label="Y"
                          value={element.y}
                          min={-100000}
                          max={100000}
                          onChange={(y) => onElementPatch({ y })}
                        />
                        <NumberField
                          label="Width"
                          value={element.width}
                          min={0.01}
                          max={100000}
                          onChange={(width) => onElementPatch({ width })}
                        />
                        <NumberField
                          label="Height"
                          value={element.height}
                          min={0.01}
                          max={100000}
                          onChange={(height) => onElementPatch({ height })}
                        />
                        <NumberField
                          label="Rotation °"
                          value={element.rotation}
                          min={-360000}
                          max={360000}
                          onChange={(rotation) => onElementPatch({ rotation })}
                        />
                        <NumberField
                          label="Opacity %"
                          value={element.opacity * 100}
                          min={0}
                          max={100}
                          onChange={(opacity) => onElementPatch({ opacity: opacity / 100 })}
                        />
                      </div>
                    </fieldset>
                  )}
                  {selected.length > 1 && (
                    <p className="inspector-hint">
                      Arrange this selection together. Select a single object for its formatting
                      controls.
                    </p>
                  )}
                  <div className="segmented" aria-label="Layer order">
                    <button
                      disabled={!canEdit}
                      title="Send to back"
                      aria-label="Send to back"
                      onClick={() => onLayer('back')}
                    >
                      <ArrowDownToLine size={16} />
                    </button>
                    <button
                      disabled={!canEdit}
                      title="Send backward"
                      aria-label="Send backward"
                      onClick={() => onLayer('backward')}
                    >
                      <ArrowDown size={16} />
                    </button>
                    <button
                      disabled={!canEdit}
                      title="Bring forward"
                      aria-label="Bring forward"
                      onClick={() => onLayer('forward')}
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      disabled={!canEdit}
                      title="Bring to front"
                      aria-label="Bring to front"
                      onClick={() => onLayer('front')}
                    >
                      <ArrowUpToLine size={16} />
                    </button>
                  </div>
                </>
              )}
            </section>
            {element && (
              <fieldset disabled={element.locked} className="inspector-fieldset" key={element.id}>
                {element.type === 'text' && (
                  <>
                    <section className="panel-section">
                      <h3>Typography</h3>
                      {onEditRichText && (
                        <button
                          className="secondary-button"
                          onClick={() => onEditRichText(element)}
                        >
                          Edit styles & lists
                        </button>
                      )}
                      {element.paragraphs && (
                        <p className="inspector-hint">
                          This box has character and paragraph formatting. Use the styled editor to
                          format a selection. Controls below apply to the entire box.
                        </p>
                      )}
                      <TextField
                        label="Text"
                        value={element.text}
                        multiline
                        validate={
                          element.paragraphs
                            ? (candidate) => {
                                replacePlainText(element, candidate);
                              }
                            : undefined
                        }
                        onChange={(text) => onElementPatch({ text })}
                      />
                      <label className="field">
                        <span>Font family</span>
                        <select
                          value={element.fontFamily}
                          onChange={(event) => onElementPatch({ fontFamily: event.target.value })}
                        >
                          {[
                            ...new Set([
                              element.fontFamily,
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
                      <NumberField
                        label="Font size (pt)"
                        value={element.fontSize}
                        min={1}
                        max={1000}
                        onChange={(fontSize) => onElementPatch({ fontSize })}
                      />
                      <div className="field-grid">
                        <div className="segmented" aria-label="Text emphasis">
                          <button
                            aria-label="Bold"
                            title="Bold"
                            aria-pressed={element.bold}
                            className={element.bold ? 'active' : ''}
                            onClick={() => onElementPatch({ bold: !element.bold })}
                          >
                            <Bold size={16} />
                          </button>
                          <button
                            aria-label="Italic"
                            title="Italic"
                            aria-pressed={element.italic}
                            className={element.italic ? 'active' : ''}
                            onClick={() => onElementPatch({ italic: !element.italic })}
                          >
                            <Italic size={16} />
                          </button>
                          <button
                            aria-label="Underline"
                            title="Underline"
                            aria-pressed={element.underline}
                            className={element.underline ? 'active' : ''}
                            onClick={() => onElementPatch({ underline: !element.underline })}
                          >
                            <Underline size={16} />
                          </button>
                        </div>
                        <div className="segmented" aria-label="Text alignment">
                          {(
                            [
                              { align: 'left', Icon: AlignLeft },
                              { align: 'center', Icon: AlignCenter },
                              { align: 'right', Icon: AlignRight },
                            ] as const
                          ).map(({ align, Icon }) => (
                            <button
                              key={align}
                              aria-label={`Align text ${align}`}
                              title={`Align text ${align}`}
                              aria-pressed={element.align === align}
                              className={element.align === align ? 'active' : ''}
                              onClick={() => onElementPatch({ align })}
                            >
                              <Icon size={16} />
                            </button>
                          ))}
                        </div>
                      </div>
                      <label className="field">
                        <span>Vertical alignment</span>
                        <select
                          value={element.verticalAlign}
                          onChange={(event) =>
                            onElementPatch({
                              verticalAlign: event.target.value as 'top' | 'middle' | 'bottom',
                            })
                          }
                        >
                          <option value="top">Top</option>
                          <option value="middle">Middle</option>
                          <option value="bottom">Bottom</option>
                        </select>
                      </label>
                      <ColorField
                        label="Text color"
                        value={element.color}
                        onChange={(color) => onElementPatch({ color })}
                      />
                      <NumberField
                        label="Text opacity %"
                        value={(element.textOpacity ?? 1) * 100}
                        min={0}
                        max={100}
                        onChange={(value) => onElementPatch({ textOpacity: value / 100 })}
                      />
                    </section>
                    <TextFrameControls
                      element={element}
                      onChange={(textFrame) => onElementPatch({ textFrame })}
                    />
                    <TextDecorationControls
                      element={element}
                      onChange={(decoration) => onElementPatch({ decoration })}
                    />
                    <AutoFitControls
                      element={element}
                      onChange={(autoFit) => onElementPatch({ autoFit })}
                      onRecalculate={onFitText ? () => onFitText(element) : undefined}
                    />
                  </>
                )}
                {element.type === 'shape' && (
                  <section className="panel-section">
                    <h3>Appearance</h3>
                    <label className="field">
                      <span>Shape</span>
                      <select
                        value={element.shape}
                        onChange={(event) =>
                          onElementPatch({ shape: event.target.value as typeof element.shape })
                        }
                      >
                        <option value="rect">Rectangle</option>
                        <option value="roundRect">Rounded rectangle</option>
                        <option value="ellipse">Ellipse</option>
                        <option value="triangle">Triangle</option>
                        <option value="line">Line</option>
                        <option value="arrow">Arrow</option>
                      </select>
                    </label>
                    <ColorField
                      label="Fill"
                      value={element.fill}
                      onChange={(fill) => onElementPatch({ fill })}
                      allowTransparent
                    />
                    <ColorField
                      label="Stroke"
                      value={element.stroke}
                      onChange={(stroke) => onElementPatch({ stroke })}
                      allowTransparent
                    />
                    <NumberField
                      label="Stroke width"
                      value={element.strokeWidth}
                      min={0}
                      max={100}
                      step={0.5}
                      onChange={(strokeWidth) => onElementPatch({ strokeWidth })}
                    />
                  </section>
                )}
                {element.type === 'image' && (
                  <section className="panel-section">
                    <h3>Image</h3>
                    <TextField
                      label="Alternative text"
                      value={element.alt}
                      maxLength={2000}
                      multiline
                      onChange={(alt) => onElementPatch({ alt })}
                    />
                    <label className="field">
                      <span>Image fit</span>
                      <select
                        value={element.fit}
                        onChange={(event) =>
                          onElementPatch({ fit: event.target.value as 'contain' | 'cover' })
                        }
                      >
                        <option value="contain">Contain entire image</option>
                        <option value="cover">Cover and crop</option>
                      </select>
                    </label>
                    <p className="inspector-hint">
                      <Image size={14} /> Add images with the Image button in the toolbar.
                    </p>
                  </section>
                )}
                {element.type === 'table' && (
                  <section className="panel-section">
                    <h3>Table</h3>
                    <TableDataEditor element={element} onPatch={onElementPatch} />
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={element.header}
                        onChange={(event) => onElementPatch({ header: event.target.checked })}
                      />
                      Style first row as header
                    </label>
                    <NumberField
                      label="Font size (pt)"
                      value={element.fontSize}
                      min={1}
                      max={1000}
                      onChange={(fontSize) => onElementPatch({ fontSize })}
                    />
                    <ColorField
                      label="Text color"
                      value={element.color}
                      onChange={(color) => onElementPatch({ color })}
                    />
                    <ColorField
                      label="Table color"
                      value={element.fill}
                      onChange={(fill) => onElementPatch({ fill })}
                    />
                  </section>
                )}
                {element.type === 'chart' && (
                  <section className="panel-section">
                    <h3>Chart</h3>
                    <label className="field">
                      <span>Chart type</span>
                      <select
                        value={element.chartType}
                        onChange={(event) =>
                          onElementPatch({
                            chartType: event.target.value as typeof element.chartType,
                          })
                        }
                      >
                        <option value="bar">Bar</option>
                        <option value="line">Line</option>
                        <option
                          value="pie"
                          disabled={
                            element.values.some((value) => value < 0) ||
                            !element.values.some((value) => value > 0)
                          }
                        >
                          Pie
                        </option>
                      </select>
                    </label>
                    <ChartDataEditor element={element} onPatch={onElementPatch} />
                    <ColorField
                      label="Chart color"
                      value={element.color}
                      onChange={(color) => onElementPatch({ color })}
                    />
                  </section>
                )}
                <section className="panel-section">
                  <h3>Animation</h3>
                  <label className="field">
                    <span>Entrance</span>
                    <select
                      value={element.animation}
                      onChange={(event) =>
                        onElementPatch({
                          animation: event.target.value as SlideElement['animation'],
                        })
                      }
                    >
                      <option value="none">None</option>
                      <option value="fade">Fade in</option>
                      <option value="rise">Rise in</option>
                    </select>
                  </label>
                  <p className="inspector-hint">
                    Plays in OpenDeck presentation mode. PowerPoint timing compatibility is limited.
                  </p>
                </section>
              </fieldset>
            )}
          </>
        )}
        {tab === 'design' && (
          <>
            <section className="panel-section">
              <h3>Make it your own</h3>
              <p className="inspector-hint">
                Apply a palette across the deck. Custom colors remain yours.
              </p>
              <div className="theme-list">
                {THEMES.map((theme) => (
                  <button
                    key={theme.id}
                    className={`theme-card ${deck.theme.id === theme.id ? 'active' : ''}`}
                    aria-pressed={deck.theme.id === theme.id}
                    onClick={() => onTheme(theme)}
                  >
                    <span
                      className="theme-preview"
                      style={{
                        background: theme.background,
                        color: theme.foreground,
                        fontFamily: theme.fontFamily,
                      }}
                    >
                      <span>Aa</span>
                      <span className="theme-accent" style={{ background: theme.accent }} />
                    </span>
                    <span>{theme.name}</span>
                  </button>
                ))}
              </div>
            </section>
            <section className="panel-section">
              <h3>This slide</h3>
              <ColorField
                label="Background"
                value={slide.background}
                onChange={(background) => onSlidePatch({ background })}
              />
              <label className="field">
                <span>Transition</span>
                <select
                  value={slide.transition}
                  onChange={(event) =>
                    onSlidePatch({ transition: event.target.value as Slide['transition'] })
                  }
                >
                  <option value="none">None</option>
                  <option value="fade">Fade</option>
                  <option value="slide">Slide</option>
                </select>
              </label>
              <p className="inspector-hint">
                {deck.width} × {deck.height} px · {deck.slides.length} slides
              </p>
            </section>
          </>
        )}
        {tab === 'layers' && (
          <section className="panel-section">
            <h3>Objects on this slide</h3>
            <p className="inspector-hint">
              Topmost objects appear first. Select an object to format or arrange it.
            </p>
            <div className="layer-list">
              {[...slide.elements].reverse().map((item) => (
                <button
                  key={item.id}
                  className={`layer-item ${selected.some((value) => value.id === item.id) ? 'active' : ''}`}
                  aria-pressed={selected.some((value) => value.id === item.id)}
                  onClick={() => onSelect(item.id)}
                >
                  <span className="layer-type">
                    {item.type === 'text'
                      ? 'T'
                      : item.type === 'image'
                        ? '▧'
                        : item.type === 'chart'
                          ? '▥'
                          : item.type === 'table'
                            ? '▦'
                            : '◇'}
                  </span>
                  <span className="layer-name">{item.name || item.type}</span>
                  {item.locked && <LockKeyhole size={13} aria-label="Locked" />}
                </button>
              ))}
            </div>
            {!slide.elements.length && (
              <p className="inspector-hint">
                A fresh canvas. Add your first object from the toolbar.
              </p>
            )}
          </section>
        )}
      </div>
    </aside>
  );
}

export default Inspector;
