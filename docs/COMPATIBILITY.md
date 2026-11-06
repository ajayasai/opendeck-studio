# Compatibility

OpenDeck Studio 0.1.0-alpha.2 is an alpha with a deliberately limited native document model. PPTX import/export transforms supported objects into a new document. It is not a lossless round trip, and an imported file can lose appearance or behavior.

Keep the original PPTX. Use OpenDeck's native JSON for backups of OpenDeck documents. Review import warnings and compare the exported result in the presentation application you intend to use.

## Native model boundaries

This table describes representable data in `src/types.ts`; it is not a claim that every corresponding PowerPoint construct imports faithfully. The implementation and its automated fixtures determine the supported interchange subset.

| Area       | Version-1 native model                                                                                                                     | Limit                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Slides     | Ordered slides, custom dimensions, background, name, notes, hidden flag                                                                    | No sections, custom shows, or master hierarchy                                                               |
| Text       | Base style plus optional rich runs: font, size, color, bold, italic, underline, safe text hyperlinks                                       | No superscript/subscript, strike-through, per-run opacity, equations, or embedded fonts                      |
| Paragraphs | Left/center/right alignment, bullets, decimal numbers, nesting, starts/continuation, line and before/after spacing, blanks and soft breaks | No text-box inset model, exact bullet indents, custom tab stops, justified/vertical text, or full typography |
| Shapes     | Rectangle, rounded rectangle, ellipse, triangle, line, arrow                                                                               | No freeform paths, SmartArt, 3D, gradients, or complex DrawingML geometry                                    |
| Geometry   | Position, size, rotation, opacity, lock                                                                                                    | No persistent group hierarchy or connector attachment model                                                  |
| Images     | Source, alternative text, contain/cover fit                                                                                                | No full image-editing/effects model                                                                          |
| Tables     | Text grid, header flag, common color/fill/font size                                                                                        | No merged cells, per-cell rich formatting, or formula model                                                  |
| Charts     | Bar, line, pie; one label/value series                                                                                                     | No linked Excel workbook, multi-series, combination, or advanced charts                                      |
| Themes     | Palette and font                                                                                                                           | Not an OOXML theme/master/layout implementation                                                              |
| Presenting | Slide transition setting and basic element animation setting                                                                               | Browser playback does not imply PPTX timing equivalence                                                      |

Rich paragraphs are optional in native schema version 1, so earlier plain-text documents remain valid. Their plain-text projection must exactly match the text box's `text` value. Explicit false run styles override the base style; omitted run styles inherit it. Alpha.1 readers can discard rich fields when re-saving, so use alpha.2 or later for rich native backups.

## Interchange status and verification

The importer and exporter have regression tests in `src/pptx.test.ts`. Passing those tests establishes only the exercised cases, not arbitrary PowerPoint compatibility. The following describes the implementation; it is not an external-application visual certification.

Original PowerPoint-authored input decks supplement synthetic test packages and generated round trips. Their [provenance](FIXTURES.md) is recorded separately; this small fixture set cannot establish broad format fidelity.

| Feature                                 | PPTX import                                                                                                                         | PPTX export                                                                                     |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Slide order and dimensions              | Reads the presentation's ordered relationship IDs and slide size                                                                    | Writes the native deck's order and dimensions                                                   |
| Solid backgrounds, notes, hidden slides | Supported subset, including notes-body text                                                                                         | Written to standard parts and properties                                                        |
| Text and formatting                     | Supported mixed font/size/color/bold/italic/underline runs; limited placeholder/theme inheritance; blank paragraphs and soft breaks | Native editable rich text boxes and supported character styles, blanks, and breaks              |
| Paragraphs and lists                    | Alignment, native bullets/decimal numbers, levels, starts/continuation, relative line height, before/after spacing                  | Native paragraphs and lists; indents normalized; some adjacent numbering restarts can continue  |
| Text hyperlinks                         | Validated external HTTP/HTTPS/mailto links retained; internal, hover, shape, and action links omitted                               | External text hyperlink relationships; PowerPoint's theme link colors can change appearance     |
| Geometry and stacking                   | Preserves supported object order and basic transforms; groups flattened; rotated/flipped groups approximate                         | Native positioned objects; table/chart rotation and opacity omitted with warnings               |
| Shapes                                  | Six supported shapes; other presets approximate rectangles; block arrows become line arrows                                         | Native basic shapes; horizontal line and line-arrow geometry                                    |
| Raster pictures                         | Embedded PNG/JPEG/GIF/WebP; linked and unsupported vector images skipped; crop approximated                                         | Embedded images with contain/cover sizing; receiving-application support varies by image format |
| Tables                                  | Rectangular text grids; merged cells and styling simplified; equalized row/column sizes                                             | Native editable tables using the application's simple header/body styling                       |
| Charts                                  | First cached series of bar/line/pie; other types omitted; chart styling simplified                                                  | Native editable single-series charts; appearance differs from the browser chart renderer        |
| Themes and masters                      | Some theme colors, fonts, and placeholder bounds; decorative master/layout objects omitted                                          | Basic theme fonts and explicit element styling; no editable master hierarchy                    |
| Slide transitions                       | Fade and push subset; direction/duration can differ                                                                                 | Fade or left push; not exact browser timing                                                     |
| Element animation                       | Timing tree not imported                                                                                                            | Browser entrance animations not written; warning shown                                          |
| Comments, audio/video, SmartArt, 3D     | Unsupported or omitted, with warnings for detected constructs                                                                       | Not represented in the native model                                                             |

Complex theme inheritance, groups, animation timelines, media, custom geometry, and unsupported Microsoft extensions need particular attention. Linked images and external data are not fetched. Warnings cannot be assumed to enumerate every visual difference. Fonts and text layout can differ even when text and coordinates are retained.

One original five-slide exported sample was opened, rendered, visually inspected, saved again in Microsoft PowerPoint 16.0, and imported back with its slide/object counts, notes, and text preserved. A separate original two-slide rich-text fixture passed PowerPoint open/render/save and semantic re-import checks for every character's supported formatting and link, paragraph/list/spacing data, breaks, and notes. A focused browser test confirmed selected-word formatting and persistence after reload. Exact files, procedures, and remaining checks are in the [testing record](TESTING.md).

These checks do not establish pixel-identical rendering or a completed broad visual acceptance suite. No Keynote, Google Slides, or LibreOffice visual acceptance is recorded. Fullscreen and print-layout acceptance remain separate checks.

## Rich-text approximations

- Text-box internal margins are not retained; imported text uses zero internal margins. Exact bullet margins and hanging indents are normalized from list level.
- PowerPoint can apply its theme hyperlink colors even when an explicit run color is stored. The semantic color/link data can therefore match while visible text differs.
- Fixed-point line spacing becomes a relative multiplier. Percentage paragraph spacing becomes points based on the first run's font size.
- Native decimal list starts and continuation are represented, but PowerPoint may continue adjacent numbering sequences that restart at the same base. Separate those sequences with an unnumbered paragraph when a restart must survive export.
- Non-decimal numbering becomes decimal numbers with periods. Picture and font-specific bullets become standard bullets; justified/distributed alignment becomes left aligned.
- Custom tab stops, vertical text, superscript/subscript, strike-through, capitalization effects, and text highlighting are not retained. Dynamic fields become their current editable text; mixed text opacity becomes one box opacity.

The rich text editor restricts pasted content to its supported schema. It accepts only validated absolute HTTP, HTTPS, and mailto hyperlinks and does not open them during editing. Safe link support is not support for PowerPoint interactive actions or embedded programs.

## Input limits

The PPTX importer limits compressed input to 50 MiB, declared or streamed expanded data to 100 MiB, individual extracted parts to 20 MiB, and XML parts to 5 MiB. It accepts 1–300 slides and rejects unsupported ZIP64/encrypted packages, unsafe archive paths, malformed XML, and DTD/entity declarations. A valid archive can still exceed supported feature or native-model limits.

Native documents are validated field by field. The current model allows 1–500 slides, at most 2,000 objects per slide and 20,000 total, 100 table rows and 50 columns, and 1,000 chart points. PPTX table import is narrower at 40 columns. These are input bounds, not promises of interactive performance at their maximum values.

Each rich text box allows at most 100,000 projected characters, 5,000 paragraphs, and 10,000 runs. Font sizes are 1–1,000 points; line spacing is 0.5–10; paragraph before/after spacing is 0–1,000 points; list levels are 0–8 and explicit numbering starts are 1–32,767. A legacy plain-text box can exceed the rich paragraph limit; the rich editor reports that capacity error without modifying the original.

| Format or capability                             | Status                                                           |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| Native OpenDeck JSON                             | Versioned application document format; preferred OpenDeck backup |
| `.pptx`                                          | Partial import/export; inspect results and warnings              |
| `.ppt` binary                                    | Unsupported                                                      |
| `.odp`                                           | Unsupported                                                      |
| Password-protected/encrypted presentations       | Unsupported                                                      |
| VBA, OLE programs, add-ins                       | Not executed or implemented                                      |
| SmartArt, Morph, 3D, complete animation fidelity | Unsupported                                                      |
| Real-time coauthoring and cloud version history  | Not implemented                                                  |
| Installed/offline PWA                            | Not implemented; self-hosted local serving is available          |

## How to report an incompatibility

Provide a synthetic, redistributable deck; the authoring application/version; import/export steps; and the expected and actual result. If possible, isolate the failure to one slide and one object. Distinguish missing content, lost editability, appearance differences, and presentation behavior. Follow [CONTRIBUTING.md](../CONTRIBUTING.md) and omit confidential data.

## Specification sources

OpenDeck's interoperability work uses public specifications and independently created tests:

- [ECMA-376](https://ecma-international.org/publications-and-standards/standards/ecma-376/) defines the OOXML vocabularies and packaging conventions.
- [Microsoft PresentationML structure](https://learn.microsoft.com/en-us/office/open-xml/presentation/structure-of-a-presentationml-document) explains the related presentation, slide, layout, master, theme, and notes parts.
- [MS-PPTX](https://learn.microsoft.com/openspecs/office_standards/ms-pptx/) documents PowerPoint extensions to OOXML.
- [MS-OE376](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oe376) documents Microsoft implementation differences.
- [MS-PPT](https://learn.microsoft.com/en-us/openspecs/office_file_formats/ms-ppt) describes the separate legacy binary format.
- [PptxGenJS](https://github.com/gitbrent/PptxGenJS) supplies PPTX generation APIs; it is not a general-purpose PPTX importer.

The [roadmap](ROADMAP.md) describes how coverage and its evidence should expand.
