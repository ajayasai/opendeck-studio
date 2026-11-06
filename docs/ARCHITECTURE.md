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

Each text box has one formatting style. Tables contain a rectangular text-cell grid and a small set of appearance properties. Charts contain one label/value series. These choices make the initial model easy to edit, but do not represent all of DrawingML or PowerPoint.

IDs identify objects independently of array positions. Slide array order is presentation order; element array order is paint order. Notes and hidden-slide state belong to each slide. The theme is a small palette and font definition, not a PowerPoint master/layout hierarchy.

## Editing and persistence

Document operations should produce a new valid deck. History stores document changes, while ephemeral UI state such as selection and panel visibility stays outside the saved model. Treat a completed drag or resize as one user operation rather than filling history with pointer events.

Native JSON is the authoritative portable format for OpenDeck features. Browser persistence enables convenient recovery but must fail visibly when storage is unavailable or full. Persisted JSON is validated when loaded; schema changes require explicit migrations. Users must be able to download backups without a backend.

Persistence uses IndexedDB when its API is present, with a localStorage fallback when it is absent. Each successful save records the current deck plus a deck-ID entry and summary. The local presentation library lists those summaries and loads a validated document on request. A library read does not itself change the current deck. Existing current-only saved data migrates into the library; older revisions of a given deck ID are not retained as version history.

## Rendering and presenting

The editor, slide thumbnails, and presentation mode share the same underlying scene data. Elements use their stored geometry and styling; the viewport scales the slide as a whole. Presentation transitions and element animations are browser behavior and must be distinguished from PPTX timing support.

Fonts are resolved by the browser and the receiving presentation application. Without a common font set and text-layout engine, line wrapping and glyph metrics can differ. Matching geometry alone does not establish visual fidelity.

## PPTX boundary

PPTX is an Open Packaging Conventions archive of related XML parts and assets. The presentation part defines slide order through relationship IDs. A filename such as `slide10.xml` does not establish where that slide appears. Themes, layouts, masters, notes, charts, and images can reside in other parts. [PresentationML structure](https://learn.microsoft.com/en-us/office/open-xml/presentation/structure-of-a-presentationml-document).

The importer maps a subset of that package to the native model and returns an `ImportResult` containing the deck and warnings. The exporter uses PptxGenJS to construct a new package. It does not preserve the original package's unknown parts. Both operations are transformations, not byte-preserving edits.

Keep package extraction, XML parsing, relationship resolution, model conversion, and export mapping separable. Validate numeric bounds and payload sizes before rendering. Do not evaluate imported markup or automatically follow external relationships. Unsupported features belong in the import report and compatibility documentation.

## Extension direction

Future rich text, grouped objects, masters, multi-series charts, and media require deliberate document-schema evolution. Collaboration should synchronize document commands or a CRDT representation through an optional provider, rather than make a remote service a prerequisite for editing. Format adapters and presentation timing should remain independently testable.

See the [roadmap](ROADMAP.md) for milestones and the [compatibility matrix](COMPATIBILITY.md) for current limits.
