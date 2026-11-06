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

The optional `textFrame` stores signed CSS-pixel insets, `square`/`none` wrapping, and independent `clip`/`overflow` modes. `src/textFrame.ts` validates the extension and resolves legacy defaults (zero insets, wrapped text, clipped axes). It computes the inset content rectangle separately from the outer clipping bounds; consumed dimensions clamp to zero. RichTextView places the content rectangle within a shape-sized frame. CSS `clip` with `visible` keeps mixed overflow axes independent; `hidden` would turn the other visible axis into a scroll container. Inline plain-text editing uses the same inset rectangle with its own textarea editing viewport.

PPTX imports resolve body properties per attribute through slide → layout → master. Slide/layout placeholder matching uses `idx`; layout/master matching uses the placeholder role, including content-to-body mapping. Local zero values override inherited values. OOXML defaults are distinct from legacy native defaults. Export writes explicit body properties and `noAutofit`; automatic fitting and exact PowerPoint whole-line clipping remain outside the renderer.

IDs identify objects independently of array positions. Slide array order is presentation order; element array order is paint order. Notes and hidden-slide state belong to each slide. The theme is a small palette and font definition, not a PowerPoint master/layout hierarchy.

## Editing and persistence

Document operations should produce a new valid deck. History stores document changes, while ephemeral UI state such as selection and panel visibility stays outside the saved model. Treat a completed drag or resize as one user operation rather than filling history with pointer events.

`src/richText.ts` owns validation, canonical plain-text projection, effective-style helpers, and edits that retain formatting on unchanged text. Whole-box formatting updates corresponding run overrides deliberately. The rich editor keeps a temporary Tiptap document; Save converts and validates it before committing one native document change, while Cancel discards it.

`src/richTextEditorAdapter.ts` translates native paragraphs to the restricted Tiptap schema and back. It materializes effective marks on entry and writes explicit true/false styles on exit, so an unmarked range can override a bold, italic, or underlined base style. This preserves effective formatting rather than the original choice to omit a run property. Native list levels, numbering starts, blank paragraphs, and paragraph spacing are retained. Unsupported nodes/marks are excluded or rejected. Pasted HTML is rebuilt through an allowlist, and text links accept only validated HTTP, HTTPS, and mailto URLs. Editing a link never fetches its target or opens it automatically.

Native JSON is the authoritative portable format for OpenDeck features. Browser persistence enables convenient recovery but must fail visibly when storage is unavailable or full. Persisted JSON is validated when loaded; schema changes require explicit migrations. Users must be able to download backups without a backend.

Persistence uses IndexedDB when its API is present, with a localStorage fallback when it is absent. Each successful save records the current deck plus a deck-ID entry and summary. The local presentation library lists those summaries and loads a validated document on request. A library read does not itself change the current deck. Existing current-only saved data migrates into the library; older revisions of a given deck ID are not retained as version history.

## Rendering and presenting

The editor, slide thumbnails, and presentation mode share the same underlying scene data. Elements use their stored geometry and styling; the viewport scales the slide as a whole. Presentation transitions and element animations are browser behavior and must be distinguished from PPTX timing support.

Fonts are resolved by the browser and the receiving presentation application. Without a common font set and text-layout engine, line wrapping and glyph metrics can differ. Matching geometry alone does not establish visual fidelity.

## PPTX boundary

PPTX is an Open Packaging Conventions archive of related XML parts and assets. The presentation part defines slide order through relationship IDs. A filename such as `slide10.xml` does not establish where that slide appears. Themes, layouts, masters, notes, charts, and images can reside in other parts. [PresentationML structure](https://learn.microsoft.com/en-us/office/open-xml/presentation/structure-of-a-presentationml-document).

The importer maps a subset of that package to the native model and returns an `ImportResult` containing the deck and warnings. The exporter uses PptxGenJS to construct a new package, then writes supported rich paragraph/run markup and hyperlink relationships into its text shapes. It does not preserve the original package's unknown parts. Both operations are transformations, not byte-preserving edits.

Keep package extraction, XML parsing, relationship resolution, model conversion, and export mapping separable. Validate numeric bounds and payload sizes before rendering. Do not evaluate imported markup or automatically follow external relationships. Unsupported features belong in the import report and compatibility documentation.

## Extension direction

Advanced typography, grouped objects, masters, multi-series charts, and media require deliberate document-schema evolution. Collaboration should synchronize document commands or a CRDT representation through an optional provider, rather than make a remote service a prerequisite for editing. Format adapters and presentation timing should remain independently testable. Earlier readers can ignore additive fields: save rich documents with alpha.2 or later and text-frame documents with alpha.3 or later.

See the [roadmap](ROADMAP.md) for milestones and the [compatibility matrix](COMPATIBILITY.md) for current limits.
