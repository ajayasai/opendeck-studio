# Roadmap and execution plan

The long-term goal is a capable, open-source alternative for everyday and advanced presentation work. The current release is an alpha. Full PowerPoint parity and a claim of being the best alternative are not completed milestones.

Use Microsoft 365 PowerPoint for Windows as the comparison baseline, while recording the actual application/version used in every compatibility test. Microsoft's own feature comparison varies by platform and is not comprehensive. [Microsoft's platform comparison](https://support.microsoft.com/en-us/powerpoint/compare-powerpoint-features-on-different-platforms).

Milestones are ordered by dependency and usefulness, not promised dates.

## Current progress

The alpha.1 foundation is public. Alpha.2 added selected-range rich-text editing and supported run/paragraph interchange. Alpha.3 added signed text-box insets, wrapping, independent overflow controls, vertical anchors, and supported slide/layout/master body-property inheritance. Alpha.4 added no/shrink/resize fitting modes, saved font scale and line-spacing reduction, live fitting after relevant edits, and exact fixed-point line spacing. Base run sizes remain editable and separate from fitting results.

Alpha.5 adds attached solid fills and outlines on unified text shapes, independent glyph/fill/border opacity, supported theme paint references and partial property inheritance, 11 preset dash patterns, caps, joins, miter limits, and rounded-corner radius. Rectangles, rounded rectangles, ellipses, and default triangles use their DrawingML intrinsic text regions in rendering and live fitting. The first/last paragraph spacing policy is preserved, including explicit false overrides and the different defaults for legacy native documents and PPTX. These are optional native-model extensions; the [compatibility guide](COMPATIBILITY.md) records older-reader behavior and remaining limits.

Original PowerPoint-authored fixtures and native save/re-import checks accompany these milestones; the [testing record](TESTING.md) describes their scope. The original autofit fixture enabled fitting through windowless COM but did not compute saved shrink factors. A separately identified XML-derived probe supplies known factors for native rendering and round-trip checks. The decoration milestone adds original and derived nine-slide fixtures covering paints, outline properties, preset text regions, and paragraph edge policy. These focused checks do not establish a complete PowerPoint layout engine. Reliable interchange and the broader parity goal remain unfinished.

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

Build on supported rich runs, paragraphs, links, text-frame geometry, paragraph edge policy, attached solid decoration, saved autofit factors, and live fitting. Next priorities are cross-engine text metrics, complete-line clipping, full theme/master/layout inheritance, grouped transforms, editable table fidelity, multi-series charts, image cropping, gradients, shadows, internal slide links/actions, and preservation of unsupported package content where feasible. Expand arbitrary geometry, custom borders, and paint coverage beyond the supported presets. Improve tab stops, typography, numbering restart behavior, and layout fidelity against a broader corpus.

Paragraph edge spacing now follows the stored policy and native default. Relative line-height still uses CSS metrics, which differ from the 1.2-times-font-size advance observed in a native 100%-spacing probe. Native vertical clipping can suppress whole lines that the browser partially displays. Hairline thickness, dash rasterization, and miter limits below SVG's minimum also retain documented rendering differences. Resolve or explicitly bound these differences before claiming equivalent automatic layout. Keep stored factors, source nominal fonts, exact point spacing, source geometry, and derived layout results independently testable.

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
