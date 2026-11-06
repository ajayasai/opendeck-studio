# Architecture

OpenDeck Studio is a static React and TypeScript application. Vite produces a browser bundle; no application server, account system, or remote document database is required. The first architecture goal is a small, inspectable editor whose document format and interoperability limits are explicit.

## Document model

`src/types.ts` defines the version-1 native document:

```text
Deck
  schemaVersion, id, title, width, height, theme, updatedAt
  slides[]
    id, name, background, notes, transition, hidden
    elements[]
      common geometry, identity, opacity, lock, animation
      text | shape | image | table | chart
```

Geometry is measured in CSS pixels at 96 DPI. Text size is measured in points. OOXML uses English Metric Units for geometry: one inch is 914400 EMU, so one CSS pixel is 9525 EMU. The interchange boundary performs the conversion; viewport zoom must not alter stored coordinates.

Text boxes retain a base style and plain `text`, with optional `paragraphs` containing styled runs, paragraph alignment, list metadata, and spacing. This is an additive extension of schema version 1: legacy plain-text documents remain valid. When rich paragraphs are present, their plain projection must exactly equal `text`. Tables contain a rectangular text-cell grid and a small set of appearance properties. Charts contain one label/value series. These models do not represent all of DrawingML or PowerPoint.

Run properties override the text-box base. An omitted boolean inherits the base; explicit `false` disables the corresponding base style. Paragraph boundaries contribute a newline to the plain projection, while a newline inside a run represents a soft line break. Numbered paragraphs use an explicit `start` to begin or restart a sequence; its absence continues the current sequence at that level.

Paragraph line spacing has two mutually exclusive representations: `lineSpacing` is a finite multiplier from 0.5 to 10, while `lineSpacingPoints` is a finite exact height from 0 to 1000 points. Exact zero is retained. If both are absent, the renderer uses a 1.16 multiplier. Before/after paragraph spacing is independently bounded to 0–1000 points. Validation rejects paragraphs containing both line-spacing forms; editor commands clear the alternate form when switching modes.

The optional `textFrame` stores signed CSS-pixel insets bounded to ±10000, `square`/`none` wrapping, independent `clip`/`overflow` modes, and optional `paragraphSpacingAtEdges`. `src/textFrame.ts` validates the extension and resolves legacy defaults (zero insets, wrapped text, clipped axes, included paragraph edge spacing). With the edge policy set to `false`, only the first paragraph's before-spacing and the last paragraph's after-spacing are suppressed; internal spacing and soft line breaks retain their meaning. The authored paragraph spacing remains stored, so switching the policy back restores it.

Text elements may also carry `decoration`: one of `rect`, `roundRect`, `ellipse`, or `triangle`, plus independent solid `fill` and `line` objects or `null` for no paint. Paint colors are six-digit hex strings with finite opacity from 0 to 1; validation retains their authored spelling. Lines have a width from 0 to 100 CSS pixels, eleven supported preset dash modes, optional `flat`/`round`/`square` caps, optional `round`/`bevel`/`miter` joins, and an optional finite miter ratio from 0 to 21474.83647. Missing caps resolve to flat, joins to round, and miter limits to 8. An optional rounded-corner ratio from 0 to 0.5 multiplies the smaller box dimension; its default is 0.16667. `src/textDecoration.ts` reconstructs known fields and leaves absent optional fields absent. Legacy text has an implicit transparent rectangle. Nonrectangular geometry is meaningful even when both paints are absent.

The common `opacity` still affects the entire object. Optional `TextElement.textOpacity` is a separate finite 0–1 multiplier applied only to text, with an implicit default of 1. Fill, outline, and text alpha are independently combined with the outer object's opacity at rendering time. Rich text and attached decoration remain one editable text element with shared position, size, rotation, selection, and history.

`textShapeInsets` resolves the preset's text region before body insets are added: rounded rectangles use corner radius × 0.29289 on each side; ellipses retain a centered rectangle with width and height multiplied by √½; triangles retain the central half-width and lower half-height. `textContentRect` adds signed body insets to that region and clamps exhausted dimensions to zero. Rendering, inline editing, fitting, and geometry feedback use the same calculation; outline thickness does not consume content space. RichTextView places the content rectangle within a shape-sized frame, with outer clipping bounds kept separate. CSS `clip` with `visible` keeps mixed overflow axes independent; `hidden` would turn the other visible axis into a scroll container. Inline plain-text editing uses the same content rectangle with its own textarea editing viewport.

The optional `TextElement.autoFit` is a discriminated union:

```typescript
type TextAutoFit =
  | { mode: 'none' }
  | { mode: 'shrink'; fontScale: number; lineSpacingReduction: number }
  | { mode: 'resize' };
```

`src/textFit.ts` validates and reconstructs these known fields. Shrink values are finite ratios: `fontScale` ranges from 0.01 to 1, and `lineSpacingReduction` from 0 to 132. Absent fitting resolves to `none` without adding a stored property. The saved scale is separate from authored base/run sizes, so editing or growing a box can recover its original typography. Relative line height subtracts the reduction from its multiplier and clamps at zero; exact point line heights, paragraph before/after spacing, and normalized absolute list indents/gaps are not scaled. Run and marker glyph sizes use the saved font scale.

PPTX imports resolve body properties per attribute through slide → layout → master. Slide/layout placeholder matching uses `idx`; layout/master matching uses the placeholder role, including content-to-body mapping. Local zero values override inherited values. OOXML defaults are distinct from legacy native defaults: an absent `spcFirstLastPara` resolves to `false` after inheritance, while an absent native edge policy remains `true`. Autofit resolves the nearest explicit choice, so a local `noAutofit` overrides inherited fitting. Import retains saved shrink factors and exact `spcPts` line spacing. Export writes explicit body properties, including the resolved edge policy, and the stored `noAutofit`, `normAutofit`, or `spAutoFit` choice, using authored run sizes rather than baking shrink into them. Exact PowerPoint whole-line clipping remains an interoperability limitation.

IDs identify objects independently of array positions. Slide array order is presentation order; element array order is paint order. Notes and hidden-slide state belong to each slide. The theme is a small palette and font definition, not a PowerPoint master/layout hierarchy.

## Editing and persistence

Document operations should produce a new valid deck. History stores document changes, while ephemeral UI state such as selection and panel visibility stays outside the saved model. Treat a completed drag or resize as one user operation rather than filling history with pointer events.

`useEditor(initial, prepare)` runs its synchronous preparation callback before publishing a command or changing history. App supplies `prepareTextLayout(before, next, fitTextElement)`, so a content/geometry change and its fitted result become one undoable snapshot. `getCurrentDeck()` immediately exposes that prepared snapshot to saves and subsequent handlers. Preparation failure leaves current/history untouched. File/library loads use `commit(next, { preserveLayout: true })`; startup reset, undo, and redo also bypass preparation. Explicit **Recalculate fit** measures the selected current object once and commits with preparation bypassed.

`prepareTextLayout` preserves structural sharing and checks existing text IDs only. Unchanged slides, reordered slides, new decks, and copied/new-ID elements retain their saved fitting. It compares the fitting mode and a canonical signature of effective text metrics: box dimensions, insets/wrapping, the shape-aware content rectangle, effective fonts/sizes/bold/italic, paragraph alignment/effective spacing, and rendered list markers/indents. Equivalent adjacent metric runs are coalesced, and inherited defaults are resolved. Paint colors/opacity, outline width/dash/cap/join, text-only opacity, hyperlinks, position, and run segmentation do not trigger fitting. Shape or corner changes that alter the content region do; the edge policy matters when it changes effective spacing. Consequently an imported saved scale survives a no-op rich Save even when the editor materializes implicit styles or normalizes list starts; a metric-changing edit triggers a new measurement.

Canvas receives a fresh element getter from App. Before starting a gesture it synchronously blurs an active Inspector field, commits any inline text draft, and reads the accepted document geometry. Its `onChange` callback can return the fitted elements immediately, avoiding a wait for React props to update. At pointer-up, Canvas applies only the gesture's position or size deltas to the latest elements, preserving concurrent text/style changes and inserted objects; removed objects are not recreated and newly locked objects are skipped. Pointer moves remain local previews, and cancellation discards that preview.

`src/richText.ts` owns validation, canonical plain-text projection, effective-style helpers, and edits that retain formatting on unchanged text. Whole-box formatting updates corresponding run overrides deliberately. The rich editor keeps a temporary Tiptap document; Save converts and validates it before committing one native document change, while Cancel discards it.

`src/richTextEditorAdapter.ts` translates native paragraphs to the restricted Tiptap schema and back. It materializes effective marks on entry and writes explicit true/false styles on exit, so an unmarked range can override a bold, italic, or underlined base style. This preserves effective formatting rather than the original choice to omit a run property. Native list levels, numbering starts, blank paragraphs, and relative/exact paragraph spacing are retained. Supported pasted `pt`/`px` line heights become exact points, while unitless multipliers remain relative. Unsupported nodes/marks are excluded or rejected. Pasted HTML is rebuilt through an allowlist, and text links accept only validated HTTP, HTTPS, and mailto URLs. Editing a link never fetches its target or opens it automatically.

Native JSON is the authoritative portable format for OpenDeck features. Browser persistence enables convenient recovery but must fail visibly when storage is unavailable or full. Persisted JSON is validated when loaded; schema changes require explicit migrations. Users must be able to download backups without a backend.

Persistence uses IndexedDB when its API is present, with a localStorage fallback when it is absent. Each successful save records the current deck plus a deck-ID entry and summary. The local presentation library lists those summaries and loads a validated document on request. A library read does not itself change the current deck. Existing current-only saved data migrates into the library; older revisions of a given deck ID are not retained as version history.

## Rendering and presenting

The editor, slide thumbnails, and presentation mode share the same underlying scene data. Elements use their stored geometry and styling; the viewport scales the slide as a whole. Presentation transitions and element animations are browser behavior and must be distinguished from PPTX timing support.

`TextDecorationView` draws a noninteractive SVG behind the text, including during inline editing. Its preset paths use the original box bounds and centered strokes rather than shrinking geometry to contain an outline. Fill and line alpha remain separate. Dash lengths scale with line width; native flat caps map to SVG `butt`, with round/square caps and round/bevel/miter joins retained. A painted width of zero is a device hairline, approximated on screen as one CSS pixel without changing the stored zero. SVG miter limits clamp to at least 1 because smaller native values cannot be expressed directly; native storage and PPTX retain them. No SVG is needed for an unpainted shape, but its text-region geometry still applies.

`src/textLayout.ts` supplies the paragraph/run styles and list markers used by both `RichTextView` and the DOM measurement code in `src/textFitting.ts`. Measurement builds one invisible, inert, unzoomed layout tree per affected text edit, reuses it for the bounded shrink search, and disposes it afterward. Rendering, thumbnails, presentation, printing, and PPTX export consume persisted results rather than measuring or mutating the document themselves.

Shrink searches for the largest fitting scale from 0.01 to 1 in increments of 0.00001, preserving the saved line-spacing reduction and authored sizes. Measurements use the actual shape-aware content width and height. Resize keeps width for square wrapping and measures intrinsic width when wrapping is disabled, then inverts the preset text rectangle and signed body insets to determine outer dimensions. Ellipse and triangle regions require larger outer dimensions than rectangular text with the same measured content; rounded rectangles depend on the smaller resulting dimension.

Increasing a wrapped rounded box's height can narrow its text region and cause another line break. The resize solver therefore starts at the minimum height and performs at most 32 monotonic measurement/growth steps. If these do not converge, it measures at the narrowest possible content width, where height reaches or exceeds width, to obtain a bounded fallback. Dimensions round upward to hundredths of a pixel and remain within the native model's 0.01–100000 pixels; positions remain within ±100000 pixels. These bounds can still leave oversized text overflowing. Unrotated resize uses horizontal paragraph and vertical text anchors; a stored nonzero rotation preserves the box center, subject to position bounds. Unavailable or invalid measurements, including a failed final fallback, preserve the existing fit/geometry rather than committing intermediate results or zero measurements from an environment without layout.

Fonts are resolved by the browser and the receiving presentation application. Without a common font set and text-layout engine, line wrapping and glyph metrics can differ. Matching geometry alone does not establish visual fidelity.

## PPTX boundary

PPTX is an Open Packaging Conventions archive of related XML parts and assets. The presentation part defines slide order through relationship IDs. A filename such as `slide10.xml` does not establish where that slide appears. Themes, layouts, masters, notes, charts, and images can reside in other parts. [PresentationML structure](https://learn.microsoft.com/en-us/office/open-xml/presentation/structure-of-a-presentationml-document).

The importer maps a subset of that package to the native model and returns an `ImportResult` containing the deck and warnings. The exporter uses PptxGenJS to construct a new package, then writes supported rich paragraph/run markup and hyperlink relationships into its text shapes. It does not preserve the original package's unknown parts. Both operations are transformations, not byte-preserving edits.

Supported rectangular, rounded, elliptical, and triangular text containers import as one decorated text element rather than a separate drawing plus overlaid text. Decoration resolution combines slide/layout/master properties and theme style references, retaining supported explicit no-paint and zero-alpha values. Unsupported geometry can still require separate approximated objects and warnings. Export writes the text body's preset geometry, corner adjustment, solid fills, line properties, and rich paragraphs into the same DrawingML shape.

PPTX has paint alpha rather than OpenDeck's common whole-object opacity. Export multiplies that common opacity into fill alpha, line alpha, and `textOpacity` for text runs/markers. Import uses whole-object opacity 1 and retains effective paint/text alpha, so a round trip preserves supported appearance without preserving the original factorization. Mixed per-run text opacity is flattened to the first text opacity with a warning because the native model currently provides one text-only alpha per box. Hairline rasterization, small miter ratios, unsupported paints, and application font/layout differences remain explicit fidelity boundaries.

Keep package extraction, XML parsing, relationship resolution, model conversion, and export mapping separable. Validate numeric bounds and payload sizes before rendering. Do not evaluate imported markup or automatically follow external relationships. Unsupported features belong in the import report and compatibility documentation.

## Extension direction

Advanced typography, grouped objects, masters, multi-series charts, and media require deliberate document-schema evolution. Collaboration should synchronize document commands or a CRDT representation through an optional provider, rather than make a remote service a prerequisite for editing. Format adapters and presentation timing should remain independently testable. Earlier readers can ignore additive fields: save rich documents with alpha.2 or later and text-frame documents with alpha.3 or later. Documents using autofit, exact line spacing, attached decoration, text-only opacity, or paragraph edge policy require a reader that supports those extensions; older readers may omit their visual and layout effects.

See the [roadmap](ROADMAP.md) for milestones and the [compatibility matrix](COMPATIBILITY.md) for current limits.
