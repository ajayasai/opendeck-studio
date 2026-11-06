import { useEffect, useId, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  X,
  Monitor,
  Clock,
  EyeOff,
  MousePointer2,
  Maximize,
  Minimize,
} from 'lucide-react';
import type { Deck } from './types';
import { SlideView } from './SlideView';
import { useDialog } from './useDialog';

export default function Presenter({
  deck,
  start,
  onClose,
}: {
  deck: Deck;
  start: number;
  onClose: () => void;
}) {
  useDialog(true, onClose);
  const slides = deck.slides.filter((s) => !s.hidden),
    initial = Math.max(
      0,
      slides.findIndex((s) => s.id === deck.slides[start]?.id),
    );
  const [index, setIndex] = useState(initial),
    [notes, setNotes] = useState(false),
    [black, setBlack] = useState(false),
    [laser, setLaser] = useState(false),
    [point, setPoint] = useState({ x: 0, y: 0 }),
    [elapsed, setElapsed] = useState(0),
    [scale, setScale] = useState(1),
    [fullscreen, setFullscreen] = useState(false),
    [fullscreenBusy, setFullscreenBusy] = useState(false),
    [fullscreenMessage, setFullscreenMessage] = useState('');
  const presenter = useRef<HTMLDivElement>(null),
    stage = useRef<HTMLDivElement>(null),
    ownedFullscreen = useRef<HTMLElement | null>(null),
    mounted = useRef(false),
    slide = slides[index];
  const fullscreenMessageId = useId();
  function releaseOwnedFullscreen() {
    const owned = ownedFullscreen.current;
    if (
      owned &&
      document.fullscreenElement === owned &&
      typeof document.exitFullscreen === 'function'
    ) {
      try {
        void Promise.resolve(document.exitFullscreen()).catch(() => {});
      } catch {
        /* The presenter is already closing; browser UI remains available. */
      }
    }
  }
  async function toggleFullscreen() {
    const target = presenter.current;
    if (!target || fullscreenBusy) return;
    const leaving = document.fullscreenElement === target;
    setFullscreenMessage('');
    if (
      (leaving && typeof document.exitFullscreen !== 'function') ||
      (!leaving && typeof target.requestFullscreen !== 'function')
    ) {
      setFullscreenMessage(
        'Fullscreen is not available in this browser. You can keep presenting in this window.',
      );
      return;
    }
    setFullscreenBusy(true);
    try {
      if (leaving) await document.exitFullscreen();
      else {
        ownedFullscreen.current = target;
        await target.requestFullscreen();
      }
      if (!mounted.current) {
        releaseOwnedFullscreen();
        return;
      }
      const active = document.fullscreenElement === target;
      setFullscreen(active);
      if (active === leaving)
        setFullscreenMessage(
          leaving
            ? 'The browser did not leave fullscreen. Use its fullscreen control or Escape; your presentation remains available.'
            : 'The browser did not allow fullscreen. You can keep presenting in this window.',
        );
      if (!active) ownedFullscreen.current = null;
    } catch {
      if (!mounted.current) {
        releaseOwnedFullscreen();
        return;
      }
      setFullscreen(document.fullscreenElement === target);
      if (document.fullscreenElement !== target) ownedFullscreen.current = null;
      setFullscreenMessage(
        leaving
          ? 'The browser did not leave fullscreen. Use its fullscreen control or Escape; your presentation remains available.'
          : 'The browser did not allow fullscreen. You can keep presenting in this window.',
      );
    } finally {
      if (mounted.current) setFullscreenBusy(false);
    }
  }
  function step(n: number) {
    setIndex((i) => Math.max(0, Math.min(slides.length - 1, i + n)));
    setBlack(false);
  }
  useEffect(() => {
    const handler = (ev: KeyboardEvent) => {
      if (['ArrowRight', 'ArrowDown', ' ', 'PageDown'].includes(ev.key)) {
        ev.preventDefault();
        step(1);
      }
      if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(ev.key)) {
        ev.preventDefault();
        step(-1);
      }
      if (ev.key === 'Home') setIndex(0);
      if (ev.key === 'End') setIndex(slides.length - 1);
      if (ev.key.toLowerCase() === 'b') setBlack((v) => !v);
      if (ev.key.toLowerCase() === 'n') setNotes((v) => !v);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [slides.length, onClose]);
  useEffect(() => {
    const timer = setInterval(() => setElapsed((v) => v + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!stage.current) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      setScale(Math.min(rect.width / deck.width, rect.height / deck.height));
    });
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, [notes, deck.width, deck.height]);
  useEffect(() => {
    mounted.current = true;
    const updateFullscreen = () => {
      const active = document.fullscreenElement === presenter.current && presenter.current !== null;
      setFullscreen(active);
      setFullscreenMessage('');
    };
    document.addEventListener('fullscreenchange', updateFullscreen);
    updateFullscreen();
    return () => {
      mounted.current = false;
      document.removeEventListener('fullscreenchange', updateFullscreen);
      releaseOwnedFullscreen();
    };
  }, []);
  if (!slide)
    return (
      <div
        ref={presenter}
        className="presenter"
        role="dialog"
        aria-label="Presentation"
        aria-modal="true"
      >
        <p>All slides are hidden.</p>
        <button onClick={onClose}>Back to editor</button>
      </div>
    );
  return (
    <div
      ref={presenter}
      className={`presenter ${notes ? 'with-notes' : ''}`}
      role="dialog"
      aria-label="Presentation"
      aria-modal="true"
    >
      <header className="presenter-top">
        <span>
          <Monitor size={18} />{' '}
          {notes ? 'Presenter workspace · notes visible on this screen' : 'Presentation'}
        </span>
        <span>
          <Clock size={15} /> {String(Math.floor(elapsed / 60)).padStart(2, '0')}:
          {String(elapsed % 60).padStart(2, '0')}
        </span>
        <button aria-label="Close presentation" onClick={onClose}>
          <X size={20} />
        </button>
        {fullscreenMessage && (
          <p id={fullscreenMessageId} className="presenter-fullscreen-message" role="alert">
            {fullscreenMessage}
          </p>
        )}
      </header>
      <div className="presenter-body">
        <div
          ref={stage}
          className="presentation-stage"
          onClick={() => step(1)}
          onPointerMove={(ev) => setPoint({ x: ev.clientX, y: ev.clientY })}
        >
          <div
            key={slide.id}
            className={`presented-slide transition-${slide.transition}`}
            style={{
              width: deck.width * scale,
              height: deck.height * scale,
              visibility: black ? 'hidden' : 'visible',
            }}
          >
            <SlideView slide={slide} deck={deck} scale={scale} animate interactiveLinks />
          </div>
          {laser && !black && (
            <div className="laser-pointer" style={{ left: point.x, top: point.y }} />
          )}
        </div>
        {notes && (
          <aside className="presenter-notes">
            <p className="eyebrow">UP NEXT</p>
            {slides[index + 1] ? (
              <div className="next-slide" style={{ aspectRatio: `${deck.width}/${deck.height}` }}>
                <SlideView slide={slides[index + 1]} deck={deck} scale={270 / deck.width} />
              </div>
            ) : (
              <p>End of presentation</p>
            )}
            <h2>Speaker notes</h2>
            <p className="speaker-text">{slide.notes || 'No notes for this slide.'}</p>
          </aside>
        )}
      </div>
      <footer className="presenter-controls">
        <div>
          <button aria-label="Previous slide" disabled={index === 0} onClick={() => step(-1)}>
            <ArrowLeft size={20} />
          </button>
          <span>
            {index + 1} / {slides.length}
          </span>
          <button
            aria-label="Next slide"
            disabled={index === slides.length - 1}
            onClick={() => step(1)}
          >
            <ArrowRight size={20} />
          </button>
        </div>
        <div>
          <button className={notes ? 'active' : ''} onClick={() => setNotes((v) => !v)}>
            <Monitor size={17} />
            Notes
          </button>
          <button className={laser ? 'active' : ''} onClick={() => setLaser((v) => !v)}>
            <MousePointer2 size={17} />
            Laser
          </button>
          <button
            className={black ? 'active' : ''}
            aria-label="Blackout screen"
            onClick={() => setBlack((v) => !v)}
          >
            <EyeOff size={17} />
          </button>
          <button
            aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            title={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            aria-pressed={fullscreen}
            aria-describedby={fullscreenMessage ? fullscreenMessageId : undefined}
            disabled={fullscreenBusy}
            onClick={() => void toggleFullscreen()}
          >
            {fullscreen ? <Minimize size={17} /> : <Maximize size={17} />}
          </button>
        </div>
        <span className="presenter-hint">← → navigate · B blackout · Esc exit</span>
      </footer>
    </div>
  );
}
