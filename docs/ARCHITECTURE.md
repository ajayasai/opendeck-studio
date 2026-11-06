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

The optional `textFrame` stores signed CSS-pixel insets, `square`/`none` wrapping, and independent `clip`/`overflow` modes. `src/textFrame.ts` validates the extension and resolves legacy defaults (zero insets, wrapped text, clipped axes). It computes the inset content rectangle separately from the outer clipping bounds; consumed dimensions clamp to zero. RichTextView places the content rectangle within a shape-sized frame. CSS `clip` with `visible` keeps mixed overflow axes independent; `hidden` would turn the other visible axis into a scroll container. Inline plain-text editing uses the same inset rectangle with its own textarea editing viewport.

The optional `TextElement.autoFit` is a discriminated union:

```typescript
type TextAutoFit =
  | { mode: 'none' }
  | { mode: 'shrink'; fontScale: number; lineSpacingReduction: number }
  | { mode: 'resize' };
```

`src/textFit.ts` validates and reconstructs these known fields. Shrink values are finite ratios: `fontScale` ranges from 0.01 to 1, and `lineSpacingReduction` from 0 to 132. Absent fitting resolves to `none` without adding a stored property. The saved scale is separate from authored base/run sizes, so editing or growing a box can recover its original typography. Relative line height subtracts the reduction from its multiplier and clamps at zero; exact point line heights, paragraph before/after spacing, and normalized absolute list indents/gaps are not scaled. Run and marker glyph sizes use the saved font scale.

PPTX imports resolve body properties per attribute through slide → layout → master. Slide/layout placeholder matching uses `idx`; layout/master matching uses the placeholder role, including content-to-body mapping. Local zero values override inherited values. OOXML defaults are distinct from legacy native defaults. Autofit resolves the nearest explicit choice, so a local `noAutofit` overrides inherited fitting. Import retains saved shrink factors and exact `spcPts` line spacing. Export writes explicit body properties and the stored `noAutofit`, `normAutofit`, or `spAutoFit` choice, using authored run sizes rather than baking shrink into them. Exact PowerPoint whole-line clipping remains an interoperability limitation.

IDs identify objects independently of array positions. Slide array order is presentation order; element array order is paint order. Notes and hidden-slide state belong to each slide. The theme is a small palette and font definition, not a PowerPoint master/layout hierarchy.

## Editing and persistence

Document operations should produce a new valid deck. History stores document changes, while ephemeral UI state such as selection and panel visibility stays outside the saved model. Treat a completed drag or resize as one user operation rather than filling history with pointer events.

`useEditor(initial, prepare)` runs its synchronous preparation callback before publishing a command or changing history. App supplies `prepareTextLayout(before, next, fitTextElement)`, so a content/geometry change and its fitted result become one undoable snapshot. `getCurrentDeck()` immediately exposes that prepared snapshot to saves and subsequent handlers. Preparation failure leaves current/history untouched. File/library loads use `commit(next, { preserveLayout: true })`; startup reset, undo, and redo also bypass preparation. Explicit **Recalculate fit** measures the selected current object once and commits with preparation bypassed.

`prepareTextLayout` preserves structural sharing and checks existing text IDs only. Unchanged slides, reordered slides, new decks, and copied/new-ID elements retain their saved fitting. It compares the fitting mode and a canonical signature of effective text metrics: box dimensions, insets/wrapping, effective fonts/sizes/bold/italic, paragraph alignment/spacing, and rendered list markers/indents. Equivalent adjacent metric runs are coalesced, and inherited defaults are resolved. Color, hyperlinks, position, and run segmentation do not trigger fitting. Consequently an imported saved scale survives a no-op rich Save even when the editor materializes implicit styles or normalizes list starts; a metric-changing edit triggers a new measurement.

Canvas receives a fresh element getter from App. Before starting a gesture it synchronously blurs an active Inspector field, commits any inline text draft, and reads the accepted document geometry. Its `onChange` callback can return the fitted elements immediately, avoiding a wait for React props to update. At pointer-up, Canvas applies only the gesture's position or size deltas to the latest elements, preserving concurrent text/style changes and inserted objects; removed objects are not recreated and newly locked objects are skipped. Pointer moves remain local previews, and cancellation discards that preview.

`src/richText.ts` owns validation, canonical plain-text projection, effective-style helpers, and edits that retain formatting on unchanged text. Whole-box formatting updates corresponding run overrides deliberately. The rich editor keeps a temporary Tiptap document; Save converts and validates it before committing one native document change, while Cancel discards it.

`src/richTextEditorAdapter.ts` translates native paragraphs to the restricted Tiptap schema and back. It materializes effective marks on entry and writes explicit true/false styles on exit, so an unmarked range can override a bold, italic, or underlined base style. This preserves effective formatting rather than the original choice to omit a run property. Native list levels, numbering starts, blank paragraphs, and relative/exact paragraph spacing are retained. Supported pasted `pt`/`px` line heights become exact points, while unitless multipliers remain relative. Unsupported nodes/marks are excluded or rejected. Pasted HTML is rebuilt through an allowlist, and text links accept only validated HTTP, HTTPS, and mailto URLs. Editing a link never fetches its target or opens it automatically.

Native JSON is the authoritative portable format for OpenDeck features. Browser persistence enables convenient recovery but must fail visibly when storage is unavailable or full. Persisted JSON is validated when loaded; schema changes require explicit migrations. Users must be able to download backups without a backend.

Persistence uses IndexedDB when its API is present, with a localStorage fallback when it is absent. Each successful save records the current deck plus a deck-ID entry and summary. The local presentation library lists those summaries and loads a validated document on request. A library read does not itself change the current deck. Existing current-only saved data migrates into the library; older revisions of a given deck ID are not retained as version history.

## Rendering and presenting

The editor, slide thumbnails, and presentation mode share the same underlying scene data. Elements use their stored geometry and styling; the viewport scales the slide as a whole. Presentation transitions and element animations are browser behavior and must be distinguished from PPTX timing support.

`src/textLayout.ts` supplies the paragraph/run styles and list markers used by both `RichTextView` and the DOM measurement code in `src/textFitting.ts`. Measurement builds one invisible, inert, unzoomed layout tree per affected text edit, reuses it for the bounded shrink search, and disposes it afterward. Rendering, thumbnails, presentation, printing, and PPTX export consume persisted results rather than measuring or mutating the document themselves.

Shrink searches for the largest fitting scale from 0.01 to 1 in increments of 0.00001, preserving the saved line-spacing reduction and authored sizes. Resize keeps width for square wrapping and measures intrinsic width when wrapping is disabled; height follows measured content plus signed insets. Dimensions are bounded to the native model's 0.01–100000 pixels and positions to ±100000 pixels. Unrotated resize uses horizontal paragraph and vertical text anchors; a stored nonzero rotation preserves the box center, subject to position bounds. Unavailable or invalid measurements preserve the existing fit/geometry rather than replacing it with zero measurements from an environment without layout.

Fonts are resolved by the browser and the receiving presentation application. Without a common font set and text-layout engine, line wrapping and glyph metrics can differ. Matching geometry alone does not establish visual fidelity.

## PPTX boundary

PPTX is an Open Packaging Conventions archive of related XML parts and assets. The presentation part defines slide order through relationship IDs. A filename such as `slide10.xml` does not establish where that slide appears. Themes, layouts, masters, notes, charts, and images can reside in other parts. [PresentationML structure](https://learn.microsoft.com/en-us/office/open-xml/presentation/structure-of-a-presentationml-document).

The importer maps a subset of that package to the native model and returns an `ImportResult` containing the deck and warnings. The exporter uses PptxGenJS to construct a new package, then writes supported rich paragraph/run markup and hyperlink relationships into its text shapes. It does not preserve the original package's unknown parts. Both operations are transformations, not byte-preserving edits.

Keep package extraction, XML parsing, relationship resolution, model conversion, and export mapping separable. Validate numeric bounds and payload sizes before rendering. Do not evaluate imported markup or automatically follow external relationships. Unsupported features belong in the import report and compatibility documentation.

## Extension direction

Advanced typography, grouped objects, masters, multi-series charts, and media require deliberate document-schema evolution. Collaboration should synchronize document commands or a CRDT representation through an optional provider, rather than make a remote service a prerequisite for editing. Format adapters and presentation timing should remain independently testable. Earlier readers can ignore additive fields: save rich documents with alpha.2 or later and text-frame documents with alpha.3 or later. Documents using autofit or exact line spacing require a reader that supports those extensions; older readers may omit their layout effects.

See the [roadmap](ROADMAP.md) for milestones and the [compatibility matrix](COMPATIBILITY.md) for current limits.
