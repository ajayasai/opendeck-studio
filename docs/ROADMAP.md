# Roadmap and execution plan

The long-term goal is a capable, open-source alternative for everyday and advanced presentation work. The current release is an alpha. Full PowerPoint parity and a claim of being the best alternative are not completed milestones.

Use Microsoft 365 PowerPoint for Windows as the comparison baseline, while recording the actual application/version used in every compatibility test. Microsoft's own feature comparison varies by platform and is not comprehensive. [Microsoft's platform comparison](https://support.microsoft.com/en-us/powerpoint/compare-powerpoint-features-on-different-platforms).

Milestones are ordered by dependency and usefulness, not promised dates.

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

Prioritize rich text runs and paragraphs, theme/master/layout inheritance, grouped transforms, editable table fidelity, multi-series charts, image cropping, gradients, shadows, hyperlinks, and preservation of unsupported package content where feasible.

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

Publishing the alpha completes the first shipping milestone only. It does not complete the broader feature-parity goal. Record remaining gaps in the compatibility matrix and convert the next bounded pieces into issues with acceptance criteria.
