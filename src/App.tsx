import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Copy,
  Download,
  FilePlus2,
  FolderOpen,
  Grid2X2,
  ImagePlus,
  Layers,
  LayoutTemplate,
  LockKeyhole,
  Maximize,
  Minus,
  MonitorPlay,
  MoreHorizontal,
  PanelBottom,
  Play,
  Plus,
  Redo2,
  Save,
  Shapes,
  Table2,
  Trash2,
  Type,
  Undo2,
  X,
  BarChart3,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  EyeOff,
  Search,
  Github,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Deck, Slide, SlideElement, Theme } from './types';
import {
  createDeck,
  createElement,
  createSlide,
  cloneSlide,
  cloneElement,
  validateDeck,
} from './model';
import { loadDeck, saveDeck } from './storage';
import { useEditor } from './useEditor';
import { SlideView } from './SlideView';
import Canvas from './Canvas';
import Inspector from './Inspector';
import Presenter from './Presenter';
import { useDialog } from './useDialog';
import Library from './Library';

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (Boolean(target.closest('input,textarea,select')) || target.isContentEditable);
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
const filename = (title: string) =>
  title
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .trim()
    .slice(0, 100) || 'Untitled';
function Tool({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  active = false,
  compact = false,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  compact?: boolean;
}) {
  return (
    <button
      className={`tool ${compact ? 'icon-button' : ''} ${active ? 'active' : ''}`}
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={compact ? label : undefined}
    >
      <Icon size={17} />
      {!compact && <span>{label}</span>}
    </button>
  );
}

export default function App() {
  const { deck, commit, reset, undo, redo, canUndo, canRedo, getCurrentDeck } =
    useEditor(createDeck);
  const [slideIndex, setSlideIndex] = useState(0),
    [selection, setSelection] = useState<string[]>([]),
    [ready, setReady] = useState(false),
    [saveState, setSaveState] = useState('Opening…'),
    [saveAllowed, setSaveAllowed] = useState(true);
  const [menu, setMenu] = useState<'file' | 'insert' | 'layout' | 'arrange' | null>(null),
    [library, setLibrary] = useState(false),
    [report, setReport] = useState<{ title: string; messages: string[] } | null>(null),
    [toast, setToast] = useState(''),
    [busy, setBusy] = useState(false),
    [presenting, setPresenting] = useState(false),
    [overview, setOverview] = useState(false),
    [notes, setNotes] = useState(true),
    [grid, setGrid] = useState(false),
    [zoomValue, setZoomValue] = useState(1),
    [fit, setFit] = useState(0.7),
    [help, setHelp] = useState(false),
    [search, setSearch] = useState('');
  const openInput = useRef<HTMLInputElement>(null),
    imageInput = useRef<HTMLInputElement>(null),
    stage = useRef<HTMLDivElement>(null),
    clipboard = useRef<SlideElement[]>([]),
    saveChain = useRef(Promise.resolve()),
    toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    slideDrag = useRef<number | null>(null);
  const slide = deck.slides[Math.min(slideIndex, deck.slides.length - 1)],
    selected = slide.elements.filter((e) => selection.includes(e.id)),
    zoom = Math.max(0.1, Math.min(2, fit * zoomValue));
  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 4200);
  }, []);
  useEffect(() => {
    let alive = true;
    loadDeck()
      .then((saved) => {
        if (!alive) return;
        if (saved) reset(saved);
        setSaveState(saved ? 'Saved on this device' : 'Ready to create');
      })
      .catch((error) => {
        if (alive) {
          setSaveAllowed(false);
          setSaveState('Recovery needed');
          setReport({
            title: 'Could not restore the saved deck',
            messages: [
              String(error),
              'Autosave is paused to protect the existing copy. Download your current deck, or open a backup to resume saving.',
            ],
          });
        }
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, [reset]);
  useEffect(() => {
    if (!ready || !saveAllowed) return;
    setSaveState('Saving…');
    let alive = true;
    const timer = setTimeout(() => {
      saveChain.current = saveChain.current.catch(() => {}).then(() => saveDeck(deck));
      saveChain.current
        .then(() => {
          if (alive) setSaveState('Saved on this device');
        })
        .catch(() => {
          if (alive) setSaveState('Save failed · download a backup');
        });
    }, 600);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [deck, ready, saveAllowed]);
  useEffect(() => {
    const handler = (ev: BeforeUnloadEvent) => {
      if (!saveAllowed || saveState === 'Saving…' || saveState.startsWith('Save failed')) {
        ev.preventDefault();
        ev.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [saveState, saveAllowed]);
  useEffect(() => {
    if (!stage.current) return;
    const observer = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setFit(Math.min((r.width - 80) / deck.width, (r.height - 64) / deck.height, 1));
    });
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, [deck.width, deck.height, overview, notes, ready]);
  useEffect(() => {
    setSlideIndex((i) => Math.min(i, deck.slides.length - 1));
    setSelection((ids) => ids.filter((id) => slide.elements.some((e) => e.id === id)));
  }, [deck.slides.length, slide.id]);
  function navigate(i: number) {
    setSlideIndex(Math.max(0, Math.min(deck.slides.length - 1, i)));
    setSelection([]);
    setMenu(null);
  }
  function patchSlide(patch: Partial<Slide>) {
    commit((d) => ({
      ...d,
      slides: d.slides.map((s) => (s.id === slide.id ? { ...s, ...patch } : s)),
    }));
  }
  function patchElements(patch: Partial<SlideElement>) {
    patchSlide({
      elements: slide.elements.map((e) =>
        selection.includes(e.id) &&
        (!e.locked || Object.keys(patch).every((k) => k === 'locked' || k === 'name'))
          ? ({ ...e, ...patch } as SlideElement)
          : e,
      ),
    });
  }
  function replaceElements(elements: SlideElement[]) {
    patchSlide({ elements });
  }
  function fitNewElement(element: SlideElement): SlideElement {
    const sx = deck.width / 1280,
      sy = deck.height / 720;
    const e = {
      ...element,
      x: element.x * sx,
      y: element.y * sy,
      width: element.width * sx,
      height: element.height * sy,
    };
    if (e.type === 'text' || e.type === 'table')
      e.fontSize = Math.max(1, Math.min(1000, e.fontSize * Math.min(sx, sy)));
    return e;
  }
  function addElement(type: SlideElement['type'], shape?: string) {
    if (type === 'image') {
      imageInput.current?.click();
      setMenu(null);
      return;
    }
    const e = fitNewElement(createElement(type, deck.theme));
    if (e.type === 'shape' && shape) e.shape = shape as typeof e.shape;
    replaceElements([...slide.elements, e]);
    setSelection([e.id]);
    setMenu(null);
    setOverview(false);
  }
  function addSlide(layout: 'blank' | 'title' | 'content' | 'split' | 'quote' = 'blank') {
    const s = createSlide(deck.theme, layout);
    s.elements = s.elements.map(fitNewElement);
    commit((d) => ({
      ...d,
      slides: [...d.slides.slice(0, slideIndex + 1), s, ...d.slides.slice(slideIndex + 1)],
    }));
    navigate(slideIndex + 1);
    setSlideIndex(slideIndex + 1);
    setMenu(null);
    setOverview(false);
  }
  function duplicateSlide() {
    const s = cloneSlide(slide);
    commit((d) => ({
      ...d,
      slides: [...d.slides.slice(0, slideIndex + 1), s, ...d.slides.slice(slideIndex + 1)],
    }));
    setSlideIndex(slideIndex + 1);
    setSelection([]);
    notify('Slide duplicated');
  }
  function deleteSlide() {
    if (deck.slides.length === 1) {
      notify('Keep at least one slide in your deck');
      return;
    }
    commit((d) => ({ ...d, slides: d.slides.filter((s) => s.id !== slide.id) }));
    navigate(Math.max(0, slideIndex - 1));
  }
  function moveSlide(from: number, to: number) {
    if (to < 0 || to >= deck.slides.length || from === to) return;
    commit((d) => {
      const slides = [...d.slides];
      const [moved] = slides.splice(from, 1);
      slides.splice(to, 0, moved);
      return { ...d, slides };
    });
    setSlideIndex(to);
    setSelection([]);
  }
  function removeSelection() {
    if (!selected.length) return;
    replaceElements(slide.elements.filter((e) => !selection.includes(e.id) || e.locked));
    setSelection([]);
  }
  function duplicateSelection() {
    if (!selected.length) {
      duplicateSlide();
      return;
    }
    const items = selected.map((e) => cloneElement(e));
    replaceElements([...slide.elements, ...items]);
    setSelection(items.map((e) => e.id));
  }
  function paste() {
    if (!clipboard.current.length) return;
    const items = clipboard.current.map((e) => cloneElement(e));
    replaceElements([...slide.elements, ...items]);
    setSelection(items.map((e) => e.id));
    clipboard.current = items;
  }
  function layer(direction: 'front' | 'back' | 'forward' | 'backward') {
    let items = [...slide.elements];
    const movable = new Set(selected.filter((e) => !e.locked).map((e) => e.id));
    if (direction === 'front')
      items = [
        ...items.filter((e) => !movable.has(e.id)),
        ...items.filter((e) => movable.has(e.id)),
      ];
    if (direction === 'back')
      items = [
        ...items.filter((e) => movable.has(e.id)),
        ...items.filter((e) => !movable.has(e.id)),
      ];
    if (direction === 'forward')
      for (let i = items.length - 2; i >= 0; i--) {
        if (movable.has(items[i].id) && !movable.has(items[i + 1].id))
          [items[i], items[i + 1]] = [items[i + 1], items[i]];
      }
    if (direction === 'backward')
      for (let i = 1; i < items.length; i++) {
        if (movable.has(items[i].id) && !movable.has(items[i - 1].id))
          [items[i], items[i - 1]] = [items[i - 1], items[i]];
      }
    replaceElements(items);
    setMenu(null);
  }
  function align(mode: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') {
    const items = selected.filter((e) => !e.locked);
    if (!items.length) return;
    const bounds =
      items.length === 1
        ? { left: 0, top: 0, right: deck.width, bottom: deck.height }
        : {
            left: Math.min(...items.map((e) => e.x)),
            top: Math.min(...items.map((e) => e.y)),
            right: Math.max(...items.map((e) => e.x + e.width)),
            bottom: Math.max(...items.map((e) => e.y + e.height)),
          };
    replaceElements(
      slide.elements.map((e) =>
        !items.includes(e)
          ? e
          : {
              ...e,
              x:
                mode === 'left'
                  ? bounds.left
                  : mode === 'center'
                    ? (bounds.left + bounds.right - e.width) / 2
                    : mode === 'right'
                      ? bounds.right - e.width
                      : e.x,
              y:
                mode === 'top'
                  ? bounds.top
                  : mode === 'middle'
                    ? (bounds.top + bounds.bottom - e.height) / 2
                    : mode === 'bottom'
                      ? bounds.bottom - e.height
                      : e.y,
            },
      ),
    );
    setMenu(null);
  }
  function applyTheme(theme: Theme) {
    const previous = deck.theme;
    const map = (color: string) =>
      color === previous.background
        ? theme.background
        : color === previous.foreground
          ? theme.foreground
          : color === previous.accent
            ? theme.accent
            : color === previous.muted
              ? theme.muted
              : color;
    commit((d) => ({
      ...d,
      theme,
      slides: d.slides.map((s) => ({
        ...s,
        background: map(s.background),
        elements: s.elements.map((e) =>
          e.type === 'text'
            ? { ...e, color: map(e.color), fontFamily: theme.fontFamily }
            : e.type === 'shape'
              ? { ...e, fill: map(e.fill), stroke: map(e.stroke) }
              : e.type === 'chart'
                ? { ...e, color: map(e.color) }
                : e.type === 'table'
                  ? { ...e, fill: map(e.fill), color: map(e.color) }
                  : e,
        ),
      })),
    }));
    notify(`${theme.name} applied to all slides`);
  }
  function saveNative() {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const deck = getCurrentDeck();
    download(
      new Blob([JSON.stringify(deck, null, 2)], { type: 'application/json' }),
      `${filename(deck.title)}.opendeck`,
    );
    setMenu(null);
    notify('OpenDeck backup downloaded');
  }
  async function preserveCurrent() {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const current = getCurrentDeck();
    saveChain.current = saveChain.current.catch(() => {}).then(() => saveDeck(current));
    await saveChain.current;
  }
  async function openLibrary() {
    setMenu(null);
    setBusy(true);
    try {
      await preserveCurrent();
      setLibrary(true);
    } catch (error) {
      setReport({
        title: 'Could not save the current deck',
        messages: [String(error), 'Download an OpenDeck backup before switching presentations.'],
      });
    } finally {
      setBusy(false);
    }
  }
  async function openSavedDeck(next: Deck) {
    setBusy(true);
    try {
      await preserveCurrent();
      commit(next);
      setSlideIndex(0);
      setSelection([]);
      setOverview(false);
      setSaveAllowed(true);
    } catch (error) {
      setReport({
        title: 'Could not switch presentations',
        messages: [String(error), 'Your current deck has been kept.'],
      });
    } finally {
      setBusy(false);
    }
  }
  async function openFile(file: File) {
    if (file.size > 50 * 1024 * 1024) {
      notify('Please choose a file smaller than 50 MB');
      return;
    }
    setBusy(true);
    setMenu(null);
    try {
      let next: Deck;
      let warnings: string[] = [];
      if (file.name.toLowerCase().endsWith('.pptx')) {
        const { importPptx } = await import('./pptx');
        const result = await importPptx(await file.arrayBuffer());
        next = validateDeck(result.deck);
        warnings = result.warnings;
      } else {
        next = validateDeck(JSON.parse(await file.text()));
      }
      await preserveCurrent();
      commit(next);
      setSlideIndex(0);
      setSelection([]);
      setSaveAllowed(true);
      setOverview(false);
      if (warnings.length) setReport({ title: 'PowerPoint import report', messages: warnings });
      else notify(`Opened ${file.name}`);
    } catch (error) {
      setReport({
        title: 'Could not open this file',
        messages: [
          error instanceof Error ? error.message : String(error),
          'Your current deck has been kept. Use a .pptx or .opendeck file; legacy .ppt files need conversion first.',
        ],
      });
    } finally {
      setBusy(false);
      if (openInput.current) openInput.current.value = '';
    }
  }
  async function exportPowerPoint() {
    setBusy(true);
    setMenu(null);
    try {
      const { exportPptx, pptxExportWarnings } = await import('./pptx');
      const warnings = pptxExportWarnings(deck);
      download(await exportPptx(deck), `${filename(deck.title)}.pptx`);
      if (warnings.length)
        setReport({
          title: 'PowerPoint export report',
          messages: ['Your PPTX has been downloaded.', ...warnings],
        });
      else notify('PowerPoint file downloaded');
    } catch (error) {
      setReport({
        title: 'Could not export PowerPoint',
        messages: [error instanceof Error ? error.message : String(error)],
      });
    } finally {
      setBusy(false);
    }
  }
  async function addImage(file: File) {
    if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type)) {
      notify('Choose a PNG, JPEG, GIF, or WebP image');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      notify('Choose an image smaller than 10 MB');
      return;
    }
    try {
      const src = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const image = new Image();
      image.src = src;
      await image.decode();
      const e = createElement('image', deck.theme);
      if (e.type !== 'image') return;
      e.src = src;
      e.alt = file.name;
      e.name = file.name;
      e.width = Math.min(600, image.naturalWidth);
      e.height = (e.width * image.naturalHeight) / image.naturalWidth;
      if (e.height > deck.height * 0.8) {
        e.height = deck.height * 0.8;
        e.width = (e.height * image.naturalWidth) / image.naturalHeight;
      }
      e.x = (deck.width - e.width) / 2;
      e.y = (deck.height - e.height) / 2;
      replaceElements([...slide.elements, e]);
      setSelection([e.id]);
      setOverview(false);
    } catch {
      notify('This image could not be decoded');
    } finally {
      if (imageInput.current) imageInput.current.value = '';
    }
  }
  async function newDeck() {
    setBusy(true);
    setMenu(null);
    try {
      await preserveCurrent();
      const d = createDeck();
      d.title = 'Untitled presentation';
      d.slides = [createSlide(d.theme, 'title')];
      commit(d);
      setSlideIndex(0);
      setSelection([]);
      setSaveAllowed(true);
      notify('New presentation · Your previous deck is in My presentations');
    } catch (error) {
      setReport({
        title: 'Could not save the current deck',
        messages: [String(error), 'Download a backup before creating another presentation.'],
      });
    } finally {
      setBusy(false);
    }
  }
  const closePresentation = useCallback(() => setPresenting(false), []);
  useDialog(Boolean(report || help), () => {
    setReport(null);
    setHelp(false);
  });
  useEffect(() => {
    const handler = (ev: KeyboardEvent) => {
      if (presenting || report || help || busy || library) return;
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') {
        ev.preventDefault();
        saveNative();
        return;
      }
      if (ev.key === 'Escape') {
        setMenu(null);
        setSelection([]);
        setOverview(false);
        return;
      }
      if (ev.key === 'F5') {
        ev.preventDefault();
        setPresenting(true);
        return;
      }
      if (isTyping(ev.target)) return;
      const mod = ev.ctrlKey || ev.metaKey,
        key = ev.key.toLowerCase();
      if (mod && key === 'z') {
        ev.preventDefault();
        ev.shiftKey ? redo() : undo();
        return;
      }
      if (mod && key === 'y') {
        ev.preventDefault();
        redo();
        return;
      }
      if (mod && key === 'a') {
        ev.preventDefault();
        setSelection(slide.elements.map((e) => e.id));
        return;
      }
      if (mod && key === 'd') {
        ev.preventDefault();
        duplicateSelection();
        return;
      }
      if (mod && (key === 'c' || key === 'x')) {
        if (selected.length) {
          ev.preventDefault();
          clipboard.current = structuredClone(selected);
          if (key === 'x') removeSelection();
          else notify('Objects copied');
        }
        return;
      }
      if (mod && key === 'v') {
        ev.preventDefault();
        paste();
        return;
      }
      if (key === 'delete' || key === 'backspace') {
        ev.preventDefault();
        removeSelection();
        return;
      }
      if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key)) {
        ev.preventDefault();
        if (selected.length) {
          const n = ev.shiftKey ? 10 : 1;
          replaceElements(
            slide.elements.map((e) =>
              selection.includes(e.id) && !e.locked
                ? {
                    ...e,
                    x: e.x + (key === 'arrowleft' ? -n : key === 'arrowright' ? n : 0),
                    y: e.y + (key === 'arrowup' ? -n : key === 'arrowdown' ? n : 0),
                  }
                : e,
            ),
          );
        } else if (key === 'arrowup' || key === 'arrowleft') navigate(slideIndex - 1);
        else navigate(slideIndex + 1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  if (!ready)
    return (
      <div className="loading-screen">
        <div className="brand-mark">
          <MonitorPlay size={30} />
        </div>
        <h1>OpenDeck Studio</h1>
        <p>Opening your workspace…</p>
      </div>
    );
  return (
    <>
      <div
        className="app-shell"
        inert={busy}
        onPointerDown={(ev) => {
          if (!(ev.target as HTMLElement).closest('.menu-anchor')) setMenu(null);
        }}
      >
        <header className="app-header">
          <a
            className="brand"
            href="https://github.com/ajayasai/opendeck-studio"
            target="_blank"
            rel="noreferrer"
            aria-label="OpenDeck Studio on GitHub"
          >
            <span className="brand-mark">
              <MonitorPlay size={22} />
            </span>
            <span>
              open<span className="brand-light">deck</span>
              <small>STUDIO</small>
            </span>
          </a>
          <div className="document-identity">
            <input
              aria-label="Presentation title"
              value={deck.title}
              maxLength={200}
              onChange={(ev) => commit((d) => ({ ...d, title: ev.target.value }))}
            />
            <span
              className={`save-indicator ${saveState.startsWith('Save failed') ? 'error' : ''}`}
            >
              <span className="status-dot" />
              {saveState}
            </span>
          </div>
          <span className="alpha-badge">OPEN SOURCE · ALPHA</span>
          <button
            className="header-icon"
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts"
            onClick={() => setHelp(true)}
          >
            <CircleHelp size={19} />
          </button>
          <button className="secondary-button" disabled={busy} onClick={exportPowerPoint}>
            <Download size={16} />
            Export PPTX
          </button>
          <button className="primary-button" onClick={() => setPresenting(true)}>
            <Play size={15} fill="currentColor" />
            Present
          </button>
        </header>
        <nav className="menu-bar" aria-label="Editor menus">
          <div className="menu-anchor">
            <button
              className={menu === 'file' ? 'active' : ''}
              onClick={() => setMenu(menu === 'file' ? null : 'file')}
            >
              File
              <ChevronDown size={12} />
            </button>
            {menu === 'file' && (
              <div className="dropdown file-dropdown">
                <button onClick={newDeck}>
                  <FilePlus2 size={17} />
                  New presentation
                </button>
                <button onClick={openLibrary}>
                  <Layers size={17} />
                  My presentations
                </button>
                <button onClick={() => openInput.current?.click()}>
                  <FolderOpen size={17} />
                  Open PPTX or OpenDeck
                </button>
                <hr />
                <button onClick={saveNative}>
                  <Save size={17} />
                  Download OpenDeck<kbd>Ctrl S</kbd>
                </button>
                <button onClick={exportPowerPoint}>
                  <Download size={17} />
                  Export PowerPoint (.pptx)
                </button>
                <button
                  onClick={() => {
                    setMenu(null);
                    window.print();
                  }}
                >
                  <Download size={17} />
                  Print / save as PDF
                </button>
                <hr />
                <p>Files stay on your device. Keep an OpenDeck backup for complete fidelity.</p>
              </div>
            )}
          </div>
          <div className="menu-anchor">
            <button
              className={menu === 'insert' ? 'active' : ''}
              onClick={() => setMenu(menu === 'insert' ? null : 'insert')}
            >
              Insert
              <ChevronDown size={12} />
            </button>
            {menu === 'insert' && (
              <div className="dropdown">
                <button onClick={() => addElement('text')}>
                  <Type size={17} />
                  Text box
                </button>
                <button onClick={() => addElement('image')}>
                  <ImagePlus size={17} />
                  Image from device
                </button>
                {(['rect', 'roundRect', 'ellipse', 'triangle', 'line', 'arrow'] as const).map(
                  (s) => (
                    <button key={s} onClick={() => addElement('shape', s)}>
                      <Shapes size={17} />
                      {
                        {
                          rect: 'Rectangle',
                          roundRect: 'Rounded rectangle',
                          ellipse: 'Ellipse',
                          triangle: 'Triangle',
                          line: 'Line',
                          arrow: 'Arrow',
                        }[s]
                      }
                    </button>
                  ),
                )}
                <button onClick={() => addElement('table')}>
                  <Table2 size={17} />
                  Table
                </button>
                <button onClick={() => addElement('chart')}>
                  <BarChart3 size={17} />
                  Chart
                </button>
              </div>
            )}
          </div>
          <div className="menu-anchor">
            <button
              className={menu === 'arrange' ? 'active' : ''}
              onClick={() => setMenu(menu === 'arrange' ? null : 'arrange')}
            >
              Arrange
              <ChevronDown size={12} />
            </button>
            {menu === 'arrange' && (
              <div className="dropdown">
                <p>
                  {selected.length
                    ? `${selected.length} selected · align to ${selected.length === 1 ? 'slide' : 'selection'}`
                    : 'Select an object first'}
                </p>
                <button disabled={!selected.length} onClick={() => align('left')}>
                  <AlignLeft size={17} />
                  Align left
                </button>
                <button disabled={!selected.length} onClick={() => align('center')}>
                  <AlignCenter size={17} />
                  Center horizontally
                </button>
                <button disabled={!selected.length} onClick={() => align('right')}>
                  <AlignRight size={17} />
                  Align right
                </button>
                <button disabled={!selected.length} onClick={() => align('top')}>
                  <AlignStartVertical size={17} />
                  Align top
                </button>
                <button disabled={!selected.length} onClick={() => align('middle')}>
                  <AlignCenterVertical size={17} />
                  Center vertically
                </button>
                <button disabled={!selected.length} onClick={() => align('bottom')}>
                  <AlignEndVertical size={17} />
                  Align bottom
                </button>
                <hr />
                <button disabled={!selected.length} onClick={() => layer('front')}>
                  <ArrowUp size={17} />
                  Bring to front
                </button>
                <button disabled={!selected.length} onClick={() => layer('back')}>
                  <ArrowDown size={17} />
                  Send to back
                </button>
              </div>
            )}
          </div>
          <button onClick={() => setOverview((v) => !v)}>
            View
            <ChevronDown size={12} />
          </button>
          <button onClick={() => setHelp(true)}>Help</button>
          <span className="menu-bar-note">
            <LockKeyhole size={12} />
            Your ideas. Your files. Your workspace.
          </span>
        </nav>
        <div className="toolbar">
          <Tool icon={Undo2} label="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo} compact />
          <Tool
            icon={Redo2}
            label="Redo (Ctrl+Shift+Z)"
            onClick={redo}
            disabled={!canRedo}
            compact
          />
          <span className="toolbar-divider" />
          <div className="menu-anchor">
            <button className="tool" onClick={() => setMenu(menu === 'layout' ? null : 'layout')}>
              <Plus size={17} />
              <span>New slide</span>
              <ChevronDown size={12} />
            </button>
            {menu === 'layout' && (
              <div className="dropdown layout-dropdown">
                <p>START WITH A LAYOUT</p>
                {(['blank', 'title', 'content', 'split', 'quote'] as const).map((layout) => (
                  <button key={layout} onClick={() => addSlide(layout)}>
                    <LayoutTemplate size={20} />
                    <span>
                      {layout.charAt(0).toUpperCase() + layout.slice(1)}
                      <small>
                        {
                          {
                            blank: 'A clean canvas',
                            title: 'Make an entrance',
                            content: 'A story, well told',
                            split: 'Two sides of an idea',
                            quote: 'Words worth remembering',
                          }[layout]
                        }
                      </small>
                    </span>
                    <ChevronRight size={14} />
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="toolbar-divider" />
          <Tool icon={Type} label="Text" onClick={() => addElement('text')} />
          <Tool icon={Shapes} label="Shape" onClick={() => addElement('shape')} />
          <Tool icon={ImagePlus} label="Image" onClick={() => addElement('image')} />
          <Tool icon={Table2} label="Table" onClick={() => addElement('table')} />
          <Tool icon={BarChart3} label="Chart" onClick={() => addElement('chart')} />
          <span className="toolbar-divider" />
          <Tool icon={Copy} label="Duplicate (Ctrl+D)" onClick={duplicateSelection} compact />
          <Tool
            icon={Trash2}
            label="Delete selected objects"
            onClick={removeSelection}
            disabled={!selected.length}
            compact
          />
          <div className="toolbar-spacer" />
          <Tool
            icon={Grid2X2}
            label="Snap to grid"
            onClick={() => setGrid((v) => !v)}
            active={grid}
            compact
          />
          <Tool
            icon={Layers}
            label="Slide sorter"
            onClick={() => setOverview((v) => !v)}
            active={overview}
            compact
          />
        </div>
        <div className="editor-workspace">
          <aside className="slide-sidebar">
            <div className="sidebar-title">
              <span>
                Slides <b>{deck.slides.length}</b>
              </span>
              <Tool
                icon={Grid2X2}
                label="Slide sorter"
                onClick={() => setOverview((v) => !v)}
                active={overview}
                compact
              />
            </div>
            <div className="slide-list">
              {deck.slides.map((s, i) => (
                <div
                  key={s.id}
                  className={`slide-item ${i === slideIndex ? 'current' : ''} ${s.hidden ? 'hidden-slide' : ''}`}
                  draggable
                  onDragStart={(ev) => {
                    slideDrag.current = i;
                    ev.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={(ev) => ev.preventDefault()}
                  onDrop={(ev) => {
                    ev.preventDefault();
                    if (slideDrag.current !== null) moveSlide(slideDrag.current, i);
                    slideDrag.current = null;
                  }}
                >
                  <span className="slide-number">{String(i + 1).padStart(2, '0')}</span>
                  <button
                    aria-label={`Slide ${i + 1}: ${s.name}`}
                    aria-current={i === slideIndex ? 'true' : undefined}
                    className="thumbnail-button"
                    onClick={() => {
                      navigate(i);
                      setOverview(false);
                    }}
                  >
                    <div className="thumbnail" style={{ height: (158 * deck.height) / deck.width }}>
                      <SlideView slide={s} deck={deck} scale={158 / deck.width} />
                      {s.hidden && (
                        <span className="hidden-badge">
                          <EyeOff size={15} />
                        </span>
                      )}
                    </div>
                    <span className="thumbnail-caption">{s.name}</span>
                  </button>
                </div>
              ))}
            </div>
            <button className="add-slide-button" onClick={() => addSlide('blank')}>
              <Plus size={16} />
              Add slide
            </button>
            <div className="sidebar-footer">
              <button
                aria-label="Move slide up"
                onClick={() => moveSlide(slideIndex, slideIndex - 1)}
                disabled={slideIndex === 0}
              >
                <ArrowUp size={15} />
              </button>
              <button
                aria-label="Move slide down"
                onClick={() => moveSlide(slideIndex, slideIndex + 1)}
                disabled={slideIndex === deck.slides.length - 1}
              >
                <ArrowDown size={15} />
              </button>
              <button aria-label="Duplicate slide" onClick={duplicateSlide}>
                <Copy size={15} />
              </button>
              <button
                aria-label="Delete slide"
                disabled={deck.slides.length === 1}
                onClick={deleteSlide}
              >
                <Trash2 size={15} />
              </button>
            </div>
          </aside>
          <main className="editor-main">
            <div className="canvas-heading">
              <div>
                <span className="eyebrow">YOUR CANVAS</span>
                <span className="canvas-slide-name">{slide.name}</span>
              </div>
              <span>
                {deck.width} × {deck.height}
                <span className="heading-dot">·</span>
                {deck.width / deck.height > 1.6 ? 'Widescreen' : 'Custom size'}
              </span>
            </div>
            <div
              className={`canvas-stage ${overview ? 'overview-stage' : ''}`}
              ref={stage}
              onDragOver={(ev) => ev.preventDefault()}
              onDrop={(ev) => {
                if (ev.dataTransfer.files.length) {
                  ev.preventDefault();
                  const file = ev.dataTransfer.files[0];
                  if (file.type.startsWith('image/')) void addImage(file);
                  else void openFile(file);
                }
              }}
            >
              {overview ? (
                <div className="slide-sorter">
                  <div className="sorter-heading">
                    <h1>The whole story.</h1>
                    <p>
                      Select a slide to keep creating. Drag thumbnails in the sidebar to reorder.
                    </p>
                  </div>
                  {deck.slides.map((s, i) => (
                    <button
                      key={s.id}
                      className="sorter-card"
                      onClick={() => {
                        navigate(i);
                        setOverview(false);
                      }}
                    >
                      <div
                        style={{
                          width: 240,
                          height: (240 * deck.height) / deck.width,
                          overflow: 'hidden',
                        }}
                      >
                        <SlideView slide={s} deck={deck} scale={240 / deck.width} />
                      </div>
                      <span>
                        {String(i + 1).padStart(2, '0')} / {s.name}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <Canvas
                  deck={deck}
                  slide={slide}
                  selected={selection}
                  onSelect={setSelection}
                  onChange={replaceElements}
                  zoom={zoom}
                  grid={grid}
                />
              )}
            </div>
            <div className="canvas-bottomline">
              <span>
                {selected.length
                  ? `${selected.length} object${selected.length > 1 ? 's' : ''} selected · Shift-click for more`
                  : 'Double-click text to edit · Drag objects to move'}
              </span>
              <span>{grid ? '8 px grid · Alt to bypass' : 'Made for your next big idea'}</span>
            </div>
            {notes && (
              <section className="notes-panel">
                <label htmlFor="speaker-notes">
                  <PanelBottom size={15} />
                  Speaker notes<span>Only visible to you</span>
                </label>
                <textarea
                  id="speaker-notes"
                  maxLength={100000}
                  value={slide.notes}
                  placeholder="What do you want to say? Add your talking points here…"
                  onChange={(ev) => patchSlide({ notes: ev.target.value })}
                />
              </section>
            )}
          </main>
          <Inspector
            deck={deck}
            slide={slide}
            selected={selected}
            onElementPatch={patchElements}
            onSlidePatch={patchSlide}
            onTheme={applyTheme}
            onSelect={(id) => setSelection([id])}
            onLayer={layer}
          />
        </div>
        <footer className="statusbar">
          <div>
            <button onClick={() => setOverview((v) => !v)} title="Toggle slide sorter">
              <Grid2X2 size={14} />
            </button>
            <span>
              Slide {slideIndex + 1} of {deck.slides.length}
            </span>
            <span className="status-separator" />
            <span>{selected.length ? `${selected.length} selected` : deck.theme.name}</span>
          </div>
          <div>
            <button className={notes ? 'active' : ''} onClick={() => setNotes((v) => !v)}>
              <PanelBottom size={14} />
              Notes
            </button>
            <span className="status-separator" />
            <button
              aria-label="Zoom out"
              onClick={() => setZoomValue((v) => Math.max(0.25, v - 0.1))}
            >
              <Minus size={14} />
            </button>
            <input
              aria-label="Zoom"
              type="range"
              min="0.25"
              max="2"
              step="0.05"
              value={zoomValue}
              onChange={(ev) => setZoomValue(Number(ev.target.value))}
            />
            <button aria-label="Zoom in" onClick={() => setZoomValue((v) => Math.min(2, v + 0.1))}>
              <Plus size={14} />
            </button>
            <span className="zoom-label">{Math.round(zoom * 100)}%</span>
            <button aria-label="Fit slide to window" onClick={() => setZoomValue(1)}>
              <Maximize size={14} />
            </button>
          </div>
        </footer>
      </div>
      <input
        hidden
        ref={openInput}
        type="file"
        accept=".pptx,.opendeck,.json"
        aria-label="Open presentation file"
        onChange={(ev) => {
          const f = ev.target.files?.[0];
          if (f) void openFile(f);
        }}
      />
      <input
        hidden
        ref={imageInput}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        aria-label="Insert image file"
        onChange={(ev) => {
          const f = ev.target.files?.[0];
          if (f) void addImage(f);
        }}
      />
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
      {busy && (
        <div className="busy-overlay" role="status">
          <div className="spinner" />
          <h2>Working on your presentation…</h2>
          <p>Everything is processed on this device.</p>
        </div>
      )}
      {report && (
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="report-title">
            <button
              className="modal-close"
              aria-label="Close report"
              onClick={() => setReport(null)}
            >
              <X size={20} />
            </button>
            <span className="eyebrow">FILE COMPATIBILITY</span>
            <h2 id="report-title">{report.title}</h2>
            <ul className="report-list">
              {report.messages.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
            <div className="modal-actions">
              <button
                className="secondary-button"
                onClick={() =>
                  download(
                    new Blob([report.messages.join('\n\n')], { type: 'text/plain' }),
                    'opendeck-compatibility-report.txt',
                  )
                }
              >
                Save report
              </button>
              <button className="primary-button" onClick={() => setReport(null)}>
                Continue editing
              </button>
            </div>
          </section>
        </div>
      )}
      {help && (
        <div className="modal-backdrop">
          <section
            className="modal help-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
          >
            <button className="modal-close" aria-label="Close help" onClick={() => setHelp(false)}>
              <X size={20} />
            </button>
            <span className="eyebrow">ROOM FOR YOUR IDEAS</span>
            <h2 id="help-title">Make yourself at home.</h2>
            <p>
              OpenDeck Studio is an independent, open-source presentation editor. Your decks are
              saved in this browser. Download a backup before clearing browser data.
            </p>
            <div className="shortcut-grid">
              {[
                ['Undo / redo', 'Ctrl Z / Ctrl Shift Z'],
                ['Save OpenDeck backup', 'Ctrl S'],
                ['Select all objects', 'Ctrl A'],
                ['Copy / cut / paste', 'Ctrl C / X / V'],
                ['Duplicate selection or slide', 'Ctrl D'],
                ['Nudge / big nudge', 'Arrow / Shift Arrow'],
                ['Start presentation', 'F5'],
                ['Exit presentation', 'Esc'],
                ['Edit slide text', 'Double-click'],
                ['Multi-select objects', 'Shift-click'],
              ].map(([label, key]) => (
                <div key={label}>
                  <span>{label}</span>
                  <kbd>{key}</kbd>
                </div>
              ))}
            </div>
            <p className="muted">
              Use ⌘ instead of Ctrl on macOS. PPTX compatibility is partial in this alpha; imports
              and exports include reports for known losses.
            </p>
            <label className="search-field">
              <Search size={16} />
              <input
                placeholder="Find text in this deck…"
                value={search}
                onChange={(ev) => setSearch(ev.target.value)}
              />
            </label>
            {search && (
              <div className="search-results">
                {deck.slides
                  .map((s, i) => ({ s, i }))
                  .filter(({ s }) =>
                    s.elements.some(
                      (e) =>
                        e.type === 'text' && e.text.toLowerCase().includes(search.toLowerCase()),
                    ),
                  )
                  .map(({ s, i }) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        navigate(i);
                        setHelp(false);
                      }}
                    >
                      Slide {i + 1} · {s.name}
                      <ArrowRight size={14} />
                    </button>
                  ))}
              </div>
            )}
            <a
              className="github-link"
              href="https://github.com/ajayasai/opendeck-studio"
              target="_blank"
              rel="noreferrer"
            >
              <Github size={17} />
              Source code & roadmap
              <ChevronRight size={15} />
            </a>
          </section>
        </div>
      )}
      {library && <Library onClose={() => setLibrary(false)} onOpen={openSavedDeck} />}
      {presenting && <Presenter deck={deck} start={slideIndex} onClose={closePresentation} />}
      <style media="print">{`@page { size: ${deck.width / 96}in ${deck.height / 96}in; margin: 0; } .print-slide { zoom: 1; }`}</style>
      <div className="print-deck">
        {deck.slides
          .filter((s) => !s.hidden)
          .map((s) => (
            <div
              key={s.id}
              className="print-slide"
              style={{ width: deck.width, height: deck.height }}
            >
              <SlideView slide={s} deck={deck} />
            </div>
          ))}
      </div>
    </>
  );
}
