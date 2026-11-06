# Testing and compatibility acceptance

OpenDeck's test suite checks model behavior, validation, persistence boundaries, and selected OOXML transformations. Browser layout and native presentation-application rendering are separate acceptance layers. Do not mark an unchecked layer complete because the unit tests pass.

## Reproduce the automated checks

Use Node.js 22.12 or later and the committed lockfile:

```sh
npm ci
npm test
npm run build
```

For focused development:

```sh
npm test -- src/model.test.ts
npm test -- src/storage.test.ts
npm test -- src/pptx.test.ts
npm test -- src/editor.test.tsx
npm test -- src/Library.test.tsx
npm run test:watch
```

The production build includes TypeScript checking. CI uses Node 22 and runs install, tests, and build from the checkout. A clean CI run verifies that revision; it does not automatically validate changes made afterward.

## Automated coverage to maintain

| Layer                 | Checks                                                                                                                                                                                                                                                                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Document model        | Original starter deck validates; new/cloned objects get unique IDs; slide reordering and alignment preserve unrelated data; undo/redo branches and history bounds                                                                                                                                                          |
| Validation            | Invalid schemas, identifiers, geometry, colors, object types, tables, charts, and remote/executable image sources are rejected                                                                                                                                                                                             |
| Persistence           | localStorage fallback validation/quota failure; fake-indexeddb transactions for save/load, multiple deck IDs, same-ID updates, legacy migration, and injected transaction-abort rollback; application startup/autosave recovery using a mocked provider. Real-browser reload/quota behavior still needs acceptance testing |
| Export package        | Text, shapes, pictures, tables, charts, notes, hidden slides, and transitions produce their expected native OOXML constructs                                                                                                                                                                                               |
| Import interpretation | Relationship-defined slide order, stacking order, basic theme resolution, placeholder geometry, scaled groups, text/notes/data preservation                                                                                                                                                                                |
| Import boundaries     | Malformed XML, entities/DTDs, missing ordered slides, package path escapes, oversized archives, and remote image relationships                                                                                                                                                                                             |
| Known loss            | Unsupported animations, mixed character formatting, groups, tables, and charts produce appropriate warnings                                                                                                                                                                                                                |
| UI logic              | Slide creation/rename; text edit/duplicate/delete; draft flushing on save; native-file recovery; table/chart validation; zoom-aware multi-object dragging and history; Escape cancellation in jsdom                                                                                                                        |
| Local library         | List/search, validated opening, missing/corrupt entry errors, retry, and cancellation of a pending load after the modal closes                                                                                                                                                                                             |

Tests must assert observable meaning, not simply mirror the implementation. Use independent fixtures to prevent an importer and exporter from hiding the same mistake. Preserve upstream license/provenance whenever test files are redistributed.

The repository includes an original two-slide PowerPoint-authored input fixture in addition to synthetic OOXML cases and PptxGenJS round trips. See [FIXTURES.md](FIXTURES.md) for its authoring scripts, metadata sanitation, hash, and evidence limits.

## Recorded PowerPoint check — 6 November 2026

The original five-slide `examples/field-notes.pptx` was opened through Microsoft PowerPoint 16.0 with `WithWindow=false`, rendered to five PNG files, and saved again without an API error. The observed per-slide object counts were `9, 14, 6, 4, 4`. All five rendered PNGs were visually inspected; no clipped or overlapping content was observed in that sample, and its supported text, shapes, image, table, and chart rendered.

The exact tested PPTX SHA-256 was:

```text
ea3b2f39529f92de1428801cf0a8f294c769ef2b6cfd90b0a7b154fc0510f98e
```

The PowerPoint-saved copy was then imported into OpenDeck and compared with the original native sample: five slides, each slide's object count, all speaker notes, and all editable text matched. This is evidence for one original sample, not a broad interoperability corpus or pixel-equivalence result. The PowerPoint-reported version was 16.0; an exact patch/build was not recorded.

The procedure is retained in `scripts/verify-with-powerpoint.ps1`, with the saved-copy assertions in `scripts/check-office-roundtrip.mjs`. Rendered output and the saved copy are generated under ignored `test-results/powerpoint-render/`. Normal CI does not require PowerPoint; this optional check requires a Windows development machine with it installed.

## Browser acceptance checklist

These checks require a real browser. The initial environment did not permit browser automation, so this document does **not** record them as completed. Record the browser/version, OS, viewport, commit, and results when performing them.

- [ ] Open a fresh workspace at a normal desktop size and a narrow viewport; verify readable controls, no accidental overflow, and no console errors.
- [ ] Select, move, resize, and rotate each object type. Check multi-selection, locking, grid snapping, alignment, and layer order.
- [ ] Edit a text box on the canvas and in the inspector. Change font, size, emphasis, color, and alignment; switch slides and confirm the edit persists.
- [ ] Add a local raster image. Check aspect ratio, contain/cover behavior, alternative text, and failures for corrupt/unsupported images.
- [ ] Paste a rectangular TSV table; apply valid data, then attempt unequal row lengths. The invalid draft should show an error without damaging the table.
- [ ] Edit chart labels and values. Test negative bar/line data, invalid numbers, mismatched lengths, and invalid pie values.
- [ ] Add, duplicate, reorder, hide, and delete slides. Verify the last slide cannot be deleted and undo restores the prior state.
- [ ] Undo and redo keyboard/toolbar operations. A complete drag should be one operation; editing after undo should discard the old redo branch.
- [ ] Download a native backup, reopen it, and compare all model fields. Reload the page and check browser recovery.
- [ ] Create and save two decks, open **My presentations**, search and reopen each, then reload the browser. Both entries must remain available. Opening a saved deck should not erase the previous deck's entry.
- [ ] Exercise quota/storage failures. Confirm the application displays a failure and still permits a downloaded backup.
- [ ] Open an invalid file; the current deck must remain intact. Review a lossy import report and download the report.
- [ ] Present from the current slide. Check hidden-slide skipping, navigation, Escape, timer, next-slide preview, blackout, notes, laser, and fullscreen.
- [ ] Confirm notes are visibly on the same screen when the notes panel is open; this is not a separate audience display.
- [ ] Print a multi-slide deck and use Save as PDF. Verify one slide per page, hidden-slide exclusion, correct orientation, no clipped edges, and no editor controls in the output.
- [ ] Use keyboard-only navigation and a screen reader; inspect focus visibility and labels. Check zoom at 200% and reduced-motion settings.
- [ ] Inspect network activity while editing and importing. Document data should not be uploaded; linked document resources must not be fetched implicitly.
- [ ] Disconnect networking after loading and edit/export using bundled resources. Separately test a local static-server deployment; do not infer an installed-PWA guarantee.

## Presentation-application acceptance checklist

Test each target separately: Microsoft PowerPoint, LibreOffice Impress, Keynote, and Google Slides are distinct import/rendering engines. Record the exact application version or web-test date. Review both the initial import into OpenDeck and the newly exported PPTX.

- [ ] The target opens the PPTX without a repair prompt.
- [ ] Slide count, order, dimensions, hidden state, titles, and notes match expectations.
- [ ] Every expected text string, table cell, and chart value remains present.
- [ ] Text, shapes, images, tables, and charts remain editable as claimed, rather than turning into a single raster slide.
- [ ] Text wraps within expected bounds; font substitution is recorded; non-Latin text and symbols remain readable.
- [ ] Object positions, rotations, stacking, solid colors, transparency, image sizing, and cropping are compared against a reference rendering.
- [ ] Chart axes, labels, legend, values, and negative-data behavior are checked independently from data preservation.
- [ ] Transition and animation behavior is assessed separately from still-slide appearance.
- [ ] Every known omitted feature is reflected in the compatibility report; unexpected losses produce a regression issue.
- [ ] Save the exported file again in the target application and reopen it in OpenDeck; record additional loss separately.

Schema validation with Microsoft's Open XML SDK is a useful future independent check. It does not replace actual application opening or visual comparisons. A file can be structurally valid and still have incorrect styling or geometry.

## Recording results

For each run, record: commit SHA; fixture name, provenance, and hash; test command or user steps; application/browser version; expected result; actual result; screenshots where permitted; and status (`pass`, `fail`, `partial`, or `not tested`). Separate four outcomes: **content**, **editability**, **appearance**, and **playback**.

The current alpha's broad external-application fidelity, browser visual layout, fullscreen behavior, and print output remain unverified unless a later result explicitly records those checks. See [COMPATIBILITY.md](COMPATIBILITY.md) for supported subsets and [ROADMAP.md](ROADMAP.md) for future gates.
