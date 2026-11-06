import { useEffect, useRef, useState } from 'react';
import { Clock3, FileSliders, FolderOpen, Search, X } from 'lucide-react';
import { listSavedDecks, loadSavedDeck } from './storage';
import type { SavedDeckSummary } from './storage';
import type { Deck } from './types';
import { useDialog } from './useDialog';

interface LibraryProps {
  onClose: () => void;
  onOpen: (deck: Deck) => void;
}

function editedDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Unknown edit time';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    date,
  );
}

export default function Library({ onClose, onOpen }: LibraryProps) {
  const [decks, setDecks] = useState<SavedDeckSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [refresh, setRefresh] = useState(0);
  const mounted = useRef(true);
  useDialog(true, onClose);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    void listSavedDecks()
      .then((items) => {
        if (!cancelled) setDecks(items);
      })
      .catch((reason) => {
        if (!cancelled)
          setError(
            reason instanceof Error ? reason.message : 'Could not read your saved presentations.',
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  async function open(id: string) {
    if (openingId) return;
    setOpeningId(id);
    setError('');
    try {
      const deck = await loadSavedDeck(id);
      if (!mounted.current) return;
      if (!deck)
        throw new Error(
          'This presentation is no longer available in browser storage. Reopen a downloaded OpenDeck backup if you have one.',
        );
      onOpen(deck);
      onClose();
    } catch (reason) {
      if (mounted.current)
        setError(
          reason instanceof Error
            ? reason.message
            : 'Could not open this presentation. Your current deck has been kept.',
        );
    } finally {
      if (mounted.current) setOpeningId(null);
    }
  }

  const filtered = decks.filter((deck) =>
    deck.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  return (
    <div className="modal-backdrop">
      <section
        className="modal library-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="library-title"
        aria-describedby="library-description"
        aria-busy={loading || Boolean(openingId)}
      >
        <button className="modal-close" aria-label="Close presentations" onClick={onClose}>
          <X size={20} />
        </button>
        <span className="eyebrow">YOUR LOCAL WORKSPACE</span>
        <h2 id="library-title">My presentations</h2>
        <p id="library-description">
          Saved in this browser. Keep downloaded backups before clearing site data or moving to
          another device.
        </p>
        <label className="search-field">
          <Search size={16} aria-hidden="true" />
          <input
            aria-label="Search saved presentations"
            placeholder="Find a presentation…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        {error && (
          <div className="library-error">
            <p className="field-error" role="alert">
              {error}
            </p>
            <button
              className="secondary-button"
              disabled={loading || Boolean(openingId)}
              onClick={() => setRefresh((value) => value + 1)}
            >
              Try again
            </button>
          </div>
        )}
        {loading ? (
          <p role="status" className="library-status">
            Opening your library…
          </p>
        ) : (
          <>
            <p className="small-label" role="status">
              {filtered.length} presentation{filtered.length === 1 ? '' : 's'}
              {openingId ? ' · Opening presentation…' : ''}
            </p>
            <div className="saved-deck-list">
              {filtered.map((deck) => (
                <button
                  key={deck.id}
                  className="saved-deck-card"
                  disabled={Boolean(openingId)}
                  onClick={() => void open(deck.id)}
                  aria-label={`Open ${deck.title || 'Untitled presentation'}`}
                >
                  <span className="saved-deck-icon">
                    <FileSliders size={25} aria-hidden="true" />
                  </span>
                  <span className="saved-deck-details">
                    <strong>{deck.title || 'Untitled presentation'}</strong>
                    <span>
                      {deck.slideCount} slide{deck.slideCount === 1 ? '' : 's'}
                    </span>
                    <span className="saved-deck-date">
                      <Clock3 size={12} aria-hidden="true" />
                      {editedDate(deck.updatedAt)}
                    </span>
                  </span>
                  <FolderOpen size={18} aria-hidden="true" />
                </button>
              ))}
            </div>
            {!filtered.length && !error && (
              <p className="library-status">
                {search.trim()
                  ? 'No presentations match your search.'
                  : 'Your saved presentations will appear here after autosave completes.'}
              </p>
            )}
          </>
        )}
        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose}>
            Back to editor
          </button>
        </div>
      </section>
    </div>
  );
}
