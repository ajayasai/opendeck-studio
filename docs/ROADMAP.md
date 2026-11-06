# Roadmap and execution plan

The long-term goal is a capable, open-source alternative for everyday and advanced presentation work. The current release is an alpha. Full PowerPoint parity and a claim of being the best alternative are not completed milestones.

Use Microsoft 365 PowerPoint for Windows as the comparison baseline, while recording the actual application/version used in every compatibility test. Microsoft's own feature comparison varies by platform and is not comprehensive. [Microsoft's platform comparison](https://support.microsoft.com/en-us/powerpoint/compare-powerpoint-features-on-different-platforms).

Milestones are ordered by dependency and usefulness, not promised dates.

## Current progress

The alpha.1 foundation is public. Alpha.2 added selected-range rich-text editing and supported run/paragraph interchange. Alpha.3 added signed text-box insets, wrapping, independent overflow controls, vertical anchors, and supported slide/layout/master body-property inheritance. Alpha.4 added no/shrink/resize fitting modes, saved font scale and line-spacing reduction, live fitting after relevant edits, and exact fixed-point line spacing. Base run sizes remain editable and separate from fitting results.

Alpha.5 adds attached solid fills and outlines on unified text shapes, independent glyph/fill/border opacity, supported theme paint references and partial property inheritance, 11 preset dash patterns, caps, joins, miter limits, and rounded-corner radius. Rectangles, rounded rectangles, ellipses, and default triangles use their DrawingML intrinsic text regions in rendering and live fitting. The first/last paragraph spacing policy is preserved, including explicit false overrides and the different defaults for legacy native documents and PPTX. These are optional native-model extensions; the [compatibility guide](COMPATIBILITY.md) records older-reader behavior and remaining limits.

Alpha.6 adds editable linear and path gradients to text-decoration fills/outlines, ordinary shapes, and slide backgrounds, together with independent solid companion opacity. One model retains ordered stops, duplicate positions, stop alpha, angle/scaling, rectangle/circle/shape paths, focus/tile rectangles, flip, and rotation metadata. Supported theme paint references and placeholder/background inheritance are materialized on import. Native zero/one-stop gradients export as equivalent two-stop ramps with an explicit warning because PowerPoint rejects those short explicit lists. Earlier native readers can discard these optional extensions; the [compatibility guide](COMPATIBILITY.md) documents the defaults and rendering boundaries.

Original PowerPoint-authored fixtures and native save/re-import checks accompany these milestones; the [testing record](TESTING.md) describes their scope. The original autofit fixture enabled fitting through windowless COM but did not compute saved shrink factors. A separately identified XML-derived probe supplies known factors for native rendering and round-trip checks. The decoration milestone adds original and derived nine-slide fixtures covering paints, outline properties, preset text regions, and paragraph edge policy. These focused checks do not establish a complete PowerPoint layout engine. Reliable interchange and the broader parity goal remain unfinished.

The gradient milestone has an original nine-slide PowerPoint fixture and a distinct eleven-slide XML-derived probe. Both OpenDeck exports passed native open/render/save and semantic re-import verification, and all twenty exported PNGs were inspected. Independent COM color readings, adapter tests and selected native pixel probes exercise defaults, scaling, color interpolation, paths, alpha, references, inheritance and outlines. Focused production-browser editing and presentation checks also passed. Raw browser/native screenshot RGB equality was not claimed: solid CSS/SVG calibration reproduced a capture/display color shift. Path/tiling/alpha/fixed-rotation appearance differences remain explicitly bounded.

## 0.1 — Usable public foundation

Build and publish a locally usable editor with:

- A versioned document model and validation.
- Text, basic shapes, images, simple tables, and single-series charts.
- Selection, geometry controls, layer ordering, duplication, and undo/redo.
- Slide creation and organization, themes, notes, and presentation mode.
- Browser persistence, native JSON backups, and partial PPTX import/export.
- Tests, a reproducible build, CI, MIT licensing, and honest compatibility documentation.

Release gate: the test suite and production build pass; the editor's principal user flow is checked in a browser; a supported document is exported and structurally inspected; unsupported content and verification limits are documented; the public repository can be built from a fresh checkout. A public demo is useful, but does not replace source publication.

## 0.2 — Reliable interchange

Build on supported rich runs, paragraphs, links, text-frame geometry, paragraph edge policy, attached decoration, editable gradient data, saved autofit factors, and live fitting. Next priorities are cross-engine text metrics, complete-line clipping, full theme/master/layout inheritance, grouped transforms, editable table fidelity, multi-series charts, image cropping, shadows, internal slide links/actions, and preservation of unsupported package content where feasible. Expand arbitrary geometry, custom borders, pattern/picture/texture paints, and gradient rendering fidelity beyond the tested cases. Improve tab stops, typography, numbering restart behavior, and layout fidelity against a broader corpus.

Paragraph edge spacing now follows the stored policy and native default. Relative line-height still uses CSS metrics, which differ from the 1.2-times-font-size advance observed in a native 100%-spacing probe. Native vertical clipping can suppress whole lines that the browser partially displays. Hairline thickness, dash rasterization, and miter limits below SVG's minimum also retain documented rendering differences. Resolve or explicitly bound these differences before claiming equivalent automatic layout. Keep stored factors, source nominal fonts, exact point spacing, source geometry, and derived layout results independently testable.

Gradient rendering uses Microsoft's corrected scaled linear normal and retains original metadata independently from derived browser samples. Extend the evidence for complex paths, focus areas, custom/inverted tiles, transparency, rotation, and arrowhead bounds before claiming broad visual fidelity. Continue distinguishing a retained editable gradient from equivalent rendering in another application; preserve source stop order and absence/default semantics in regression tests. Unify the older glyph/table/chart color resolver with independently tested native tint/shade semantics; the current paint-color fix is not a universal theme-color guarantee. Add a calibrated screenshot pipeline before using raw chromatic pixel differences as release gates.

Release gate: a redistributable corpus of independently authored decks, explicit per-feature import/export results, package validation, and visual comparisons in multiple applications. Add regression fixtures for every compatibility bug. Track content preservation, editability, visual fidelity, and behavior separately.

## 0.3 — Strong presenting tools

Add a structured animation timeline, object interpolation, transition controls, embedded audio/video, presenter view, rehearsal timings, custom slide shows, and recording. Add accessible keyboard navigation and reduced-motion support throughout.

Release gate: deterministic playback tests and documented browser/media support. Verify timing interchange independently from browser playback. Multi-display and recording workflows need manual acceptance evidence.

## 0.4 — Collaboration and recovery

Add optional self-hosted synchronization, concurrent editing, presence, comments, revision history, conflict handling, share permissions, and durable server backups. Preserve local editing when the service is unavailable.

Release gate: concurrent-edit convergence, permission isolation, interrupted-sync recovery, and revision-restore tests. Document where data is stored and which actions transmit it.

## 0.5 — Advanced authoring and formats

Expand typography and RTL support, accessibility checking, equations, diagramming, drawing tools, advanced charts, reusable masters/templates, print handouts, and extension APIs. Investigate ODP and legacy PPT through isolated conversion adapters. Evaluate desktop packaging and large-deck performance.

Release gate: specific, published acceptance tests per feature. A generic "supports PPTX" badge cannot substitute for fidelity results. Macros, embedded programs, external links, and legacy conversion require explicit boundaries and must never execute implicitly.

## Quality work across every milestone

- Reproduce failures with minimal public fixtures rather than confidential decks.
- Preserve native editability where support is claimed.
- Verify keyboard access, contrast, meaningful labels, and error recovery.
- Benchmark import, export, manipulation, memory, and startup on representative large decks.
- Keep documentation aligned with implemented behavior.
- Use original code and appropriately licensed dependencies and assets.

## Completion accounting

Publishing an alpha or finishing a bounded rich-text milestone does not complete the broader feature-parity goal. Record remaining gaps in the compatibility matrix and convert the next bounded pieces into issues with acceptance criteria. Distinguish implemented features from their tested coverage and outstanding acceptance checks.
