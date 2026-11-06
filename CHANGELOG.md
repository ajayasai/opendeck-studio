# Changelog

## 0.1.0-alpha.7 — 2026-11-06

Picture cropping and image-transform compatibility milestone. Full PowerPoint parity remains unfinished.

- Add a visual crop editor with drag/keyboard positioning, zoom, fit/fill/stretch presets, exact crop and fill edges, and horizontal/vertical flips. Save commits one undoable change; Cancel preserves the original.
- Retain source image bytes, signed source crop rectangles, independent destination fill rectangles, picture flips, rotation, and opacity through supported native and PPTX interchange.
- Correct contain/cover export to use actual raster dimensions while retaining the picture frame; the previous export path could stretch images despite the editor's fitting choice.
- Share responsive picture clipping between the editor, thumbnails, crop preview, and presenter. Negative crop outsets remain transparent.
- Separate encoded image axes from legacy browser auto-orientation. Prevent imported JPEGs from applying EXIF orientation twice, and materialize orientation once for fresh uploads and legacy PPTX export.
- Keep crop drafts isolated, flush pending numeric edits before Save or drag gestures, and retain concurrent document changes when saving a crop.
- Add original native and separately XML-derived picture fixtures, independent raster-coordinate comparisons, exact embedded-byte checks, and native open/render/save/reimport verification.

Picture masks, tiled fills, effects, grouped transforms, degenerate fill rectangles, and unsupported raster/vector formats remain bounded limitations. Native tests verify the exercised picture geometry and image bytes, rather than broad PowerPoint equivalence. See [testing evidence](docs/TESTING.md) and [compatibility notes](docs/COMPATIBILITY.md).

## 0.1.0-alpha.6 — 2026-11-06

Editable gradients and PowerPoint paint compatibility milestone. Full PowerPoint parity remains unfinished.

- Add linear, radial, rectangular, and shape gradients to text-box fills/outlines, ordinary shapes, and slide backgrounds.
- Edit individual stop colors, positions, and opacity; add/remove stops; control angle, scaling, rotation, focus, and tiling. Keyboard hex entry complements the color picker.
- Preserve ordered and duplicate stops, independent paint opacity, and optional gradient metadata in native backups and supported PPTX interchange.
- Resolve theme and placeholder gradients, background inheritance, and native defaults. Correct paint tint/shade conversion using native color evidence.
- Render gradients consistently on the canvas and in presentation playback, including supported fixed-axis rotation and rectangular/circular focus behavior.
- Recolor matching gradient stops with theme changes and restore the complete prior paints with one undo.
- Normalize zero/one-stop native gradients to equivalent two-stop PPTX ramps with a warning because PowerPoint rejects explicit shorter lists.
- Add original nine-slide and separately XML-derived eleven-slide fixtures, native stop/geometry round-trip checks, and focused model, rendering, inspector, theme, and PPTX regressions.

PowerPoint 16.0 opened, rendered, saved, and re-imported both fixture paths. Supported gradient stops, effective alpha, geometry, rich text, fitting, notes, and counts passed semantic checks. Browser font metrics, complex path/tile behavior, and transparent color interpolation remain limitations. See [testing evidence](docs/TESTING.md) and [compatibility notes](docs/COMPATIBILITY.md).

## 0.1.0-alpha.5 — 2026-11-06

Attached text decoration and preset geometry milestone. Full PowerPoint parity remains unfinished.

- Keep text and its supported solid fill/outline in one editable object through native backups and PPTX interchange.
- Separate text-only, fill, outline, and whole-object opacity, including explicit zero values.
- Add rectangle, rounded rectangle, ellipse, and triangle text shapes; preserve roundness, line width, eleven dash styles, caps, joins, and supported miter limits.
- Resolve supported theme and placeholder paints, including partial line inheritance; retain explicit no-fill overrides and warn about unsupported paint or geometry.
- Apply the documented preset text rectangles to rendering, inline editing, shrink fitting, and box resizing. Rounded wrapped boxes use bounded iterative fitting.
- Preserve first/last paragraph spacing policy through slide/layout/master inheritance and expose it in the inspector. Legacy native files retain their prior edge behavior.
- Keep attached decoration visible during inline editing and composite solid fills into the styled editor's authoring background.
- Add original nine-slide PowerPoint and separately XML-derived fixtures, native render/resave/reimport checks, and focused geometry, fitting, opacity, validation, and editor regressions.

PowerPoint 16.0.20527.20150 opened, rendered, saved, and re-imported both nine-slide paths. Supported decorations and native preset text-region bounds survived those checks. All 18 exported renders were inspected. Unsupported paints, custom geometry, normalized bullet indents, browser font metrics, and native recalculation remain limitations. See [testing evidence](docs/TESTING.md) and [compatibility notes](docs/COMPATIBILITY.md).

## 0.1.0-alpha.4 — 2026-11-06

Text fitting and exact paragraph spacing milestone. Full PowerPoint parity remains unfinished.

- Add no-fit, shrink-to-fit, and resize-box modes, with explicit recalculation using the browser's available fonts.
- Preserve nominal character sizes separately from saved shrink factors and line-spacing reduction; import fitting choices through slide, layout, and master inheritance.
- Preserve exact point-based line spacing alongside relative spacing, and expose both modes in the rich text editor.
- Share text metrics between the canvas, presenter, and fitting measurement. Relative spacing reduction is subtractive; exact spacing and absolute paragraph/list spacing remain unscaled.
- Apply fitting before recording a document command, keeping text edits and resulting scale or geometry in one undo step. Imports, backups, copies, history navigation, and metric-equivalent rich-editor saves retain saved fitting results.
- Resize around text anchors for unrotated boxes and around the center for stored nonzero rotation, with valid native document bounds.
- Preserve tiny/large text geometry and stored full-turn rotations through PPTX interchange; warn when a native angle exceeds DrawingML's representable range.
- Flush pending Inspector edits before canvas gestures and merge only gesture geometry into the latest document, preserving concurrent edits and inserted objects.
- Keep numeric rich-editor drafts focused until Save can flush them, preventing a blur-triggered scroll from interrupting the click.
- Add an original seven-slide PowerPoint AutoFit fixture, a separately attributed XML saved-factor probe, native export/resave/reimport checks, and fitting/history/editor regressions.

PowerPoint 16.0.20527.20150 opened, rendered, saved, and re-imported both seven-slide paths. Windowless native authoring did not calculate shrink factors for the original baseline; the known-factor probe is explicitly XML-derived. Saved factors and supported semantic properties survive the native round trip, while browser font metrics, paragraph edge spacing, and recalculation can still differ. See [testing evidence](docs/TESTING.md) and [compatibility notes](docs/COMPATIBILITY.md).

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
