# Changelog

## 0.1.0-alpha.3 — 2026-11-06

Text-frame geometry and PowerPoint inheritance milestone. Full PowerPoint parity remains unfinished.

- Add four signed text-box margins, wrap control, independent overflow settings, and a margin reset in the inspector.
- Render the inset text rectangle separately from the outer clipping bounds; retain hard and soft breaks when wrapping is disabled.
- Preserve supported insets, wrap, overflow and vertical anchors in native backups and editable PPTX interchange.
- Resolve each imported body property independently through slide, layout and master, including explicit-zero overrides and content placeholders whose indexes differ from the master body placeholder.
- Detect effective inherited autofit and unsupported body settings, and report known full-line clipping and attached text-box decoration differences.
- Preserve fractional imported numeric values when a field is focused and blurred without editing.
- Keep legacy native documents compatible through an optional schema-version-1 extension; earlier readers may discard text-frame fields on save.
- Add an original six-slide PowerPoint fixture, separate XML-derived clipping/signed-margin and native attached-outline probes, native round-trip scripts, and geometry regression tests.

PowerPoint 16.0 opened, rendered, saved and re-imported both the six-slide original geometry path and the separately attributed XML-derived probe. Checks compare effective native margins, wrapping and anchors, then supported text, rich formatting, geometry, notes and object counts after re-saving. Exact files, visual differences, browser checks, and hashes are recorded in the [testing evidence](docs/TESTING.md).

## 0.1.0-alpha.2 — 2026-11-06

Rich text authoring and interoperability milestone. Full PowerPoint parity remains an active, unfinished goal.

- Add a Tiptap editor with selected-range fonts, sizes, colors, bold, italic, underline, safe hyperlinks, and local undo/redo before Save.
- Add paragraph alignment, nested bullets and decimal numbered lists, start numbers, line spacing, and spacing before/after.
- Preserve explicit false style overrides, blank paragraphs, soft line breaks, and continued numbering in the native document model.
- Retain rich formatting on unchanged text during ordinary canvas/inspector text edits; whole-box formatting intentionally updates the corresponding overrides.
- Preserve supported rich runs and paragraphs in editable PPTX import/export, including external HTTP/HTTPS/mailto text links.
- Restrict rich pasted content to the supported schema and safe links; keep Save/Cancel and validation errors separate from the original deck.
- Preserve earlier native files through optional rich paragraphs in schema version 1. Earlier alpha.1 readers can discard these new fields when re-saving.
- Add selected-range editor, adapter, model, native validation, and PPTX regression tests, plus an original PowerPoint-authored rich-text fixture.
- Keep invalid canvas drafts visible when navigating or exporting, reject invalid inspector text edits with accessible feedback, and preserve concurrent edits when an image finishes loading.
- Contain rich-editor loading failures with Close/Retry, explain denied fullscreen requests, and correct slide fitting for compact windows and large slide sizes.
- Parse pasted HTML in an inert template before rebuilding supported content; a browser clipboard probe observed no image, frame, or stylesheet requests from the pasted resource URLs.

A focused browser check changed the first selected word to italic 48 pt while other characters remained 66 pt, then confirmed persistence after saving and reloading. A two-slide original rich-text fixture passed PowerPoint open/render/save and semantic re-import checks for each character's supported styles and links, paragraph/list/spacing data, breaks, and notes. See the [testing record](docs/TESTING.md) for exact evidence and limits.

Known approximations include text-box insets, exact bullet/hanging indents, PowerPoint's theme hyperlink colors, fixed/percentage spacing conversion, and adjacent same-base numbering restarts. This milestone does not establish broad visual equivalence across presentation applications.

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
