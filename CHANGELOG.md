# Changelog

## 0.1.0-alpha.1 — 2026-11-06

First public alpha of OpenDeck Studio, an original MIT-licensed presentation editor.

- Create and organize slides with five themes and five starter layouts.
- Edit text, shapes, raster images, tables, and single-series charts.
- Move, resize, rotate, align, lock, order, duplicate, and copy/paste objects with undo/redo.
- Store decks and their local library in IndexedDB; download portable OpenDeck backups.
- Import and export an editable PPTX subset with explicit compatibility reports.
- Present with notes, a timer, laser pointer, hidden slides, simple transitions, and browser entrance effects.
- Use keyboard shortcuts, a slide sorter, and browser print/PDF output.
- Include 67 automated tests, public CI, original examples, and a PowerPoint-authored fixture.

PowerPoint 16.0 opened, rendered, and re-saved the five-slide sample. Re-import retained its object counts, text, and notes. Browser visual/fullscreen/print acceptance remains unverified in the initial environment. See the [testing record](docs/TESTING.md).

This is an alpha with partial compatibility. Rich text runs, full master/layout fidelity, advanced animations, media authoring, collaboration, legacy PPT, and other advanced workflows remain on the [roadmap](docs/ROADMAP.md).
