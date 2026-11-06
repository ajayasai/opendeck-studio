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
npm test -- src/richText.test.ts
npm test -- src/RichTextEditor.test.tsx
npm run test:watch
```

The production build includes TypeScript checking. CI uses Node 22 and runs install, tests, and build from the checkout. A clean CI run verifies that revision; it does not automatically validate changes made afterward.

The alpha.2 release candidate passed all **174 tests in 14 files**, the TypeScript/Vite production build, formatting, and `git diff --check` on Windows with Node 24.13.0. `npm audit --omit=dev` reported no known production dependency vulnerabilities at the time of checking. Regression coverage includes invalid draft navigation/export guards, asynchronous image insertion without overwriting concurrent edits, rejected inspector paste, recoverable rich-editor loading and focus restoration, and fullscreen ownership/failure handling. These results are scoped to the alpha.2 source; they are not guarantees about future dependency advisories.

The alpha.3 release candidate passed **226 tests in 16 files**, the TypeScript/Vite build, formatting and diff checks. `npm audit --omit=dev` again reported zero known production vulnerabilities. Added coverage includes frame validation/defaults, signed content geometry, inherited OOXML body properties, original native fixtures, independent overflow axes, editing/reset/undo metadata behavior, fractional numeric fields, and decoration warnings that exclude empty lines in OpenDeck exports. These results cover this release's tested revision, not future dependency advisories or untested native-app behavior.

## Automated coverage to maintain

| Layer                 | Checks                                                                                                                                                                                                                                                                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Document model        | Original starter deck validates; new/cloned objects get unique IDs; slide reordering and alignment preserve unrelated data; undo/redo branches and history bounds                                                                                                                                                          |
| Validation            | Invalid schemas, identifiers, geometry, colors, object types, tables, charts, and remote/executable image sources are rejected; rich paragraphs must match the exact plain-text projection and satisfy run/list/link limits                                                                                                |
| Persistence           | localStorage fallback validation/quota failure; fake-indexeddb transactions for save/load, multiple deck IDs, same-ID updates, legacy migration, and injected transaction-abort rollback; application startup/autosave recovery using a mocked provider. Real-browser reload/quota behavior still needs acceptance testing |
| Export package        | Text, shapes, pictures, tables, charts, notes, hidden slides, and transitions produce their expected native OOXML constructs                                                                                                                                                                                               |
| Import interpretation | Relationship-defined slide order, stacking order, supported theme/layout/master text inheritance, placeholder geometry, scaled groups, text/notes/data preservation                                                                                                                                                        |
| Rich text             | Mixed run font/size/color/emphasis; safe external text hyperlinks; paragraph alignment, spacing, list levels and numbering starts; blank paragraphs and soft breaks; native PowerPoint-authored input and generated rich round trips                                                                                       |
| Import boundaries     | Malformed XML, entities/DTDs, missing ordered slides, package path escapes, oversized archives, and remote image relationships                                                                                                                                                                                             |
| Known loss            | Unsupported animations, normalized groups/table/chart styling, autofit, complete-line clipping, attached text-box decoration, bullet indentation, unsafe/internal/action links, and ambiguous same-base numbering restarts produce appropriate warnings; supported mixed character formatting is preserved                 |
| UI logic              | Slide creation/rename; text edit/duplicate/delete; draft flushing on save; native-file recovery; table/chart validation; zoom-aware multi-object dragging and history; Escape cancellation in jsdom                                                                                                                        |
| Local library         | List/search, validated opening, missing/corrupt entry errors, retry, and cancellation of a pending load after the modal closes                                                                                                                                                                                             |

Tests must assert observable meaning, not simply mirror the implementation. Use independent fixtures to prevent an importer and exporter from hiding the same mistake. Preserve upstream license/provenance whenever test files are redistributed.

The repository includes two original two-slide PowerPoint-authored inputs, a six-slide native text-frame fixture, a separate native attached-outline probe and an explicitly XML-derived signed-margin/clip probe, in addition to in-memory synthetic OOXML cases and generated round trips. See [FIXTURES.md](FIXTURES.md) for authoring scripts, metadata sanitation, hashes and evidence limits.

## Recorded PowerPoint check — 6 November 2026

The original five-slide `examples/field-notes.pptx` was opened through Microsoft PowerPoint 16.0 with `WithWindow=false`, rendered to five PNG files, and saved again without an API error. The observed per-slide object counts were `9, 14, 6, 4, 4`. All five rendered PNGs were visually inspected; no clipped or overlapping content was observed in that sample, and its supported text, shapes, image, table, and chart rendered.

The exact tested PPTX SHA-256 was:

```text
ea3b2f39529f92de1428801cf0a8f294c769ef2b6cfd90b0a7b154fc0510f98e
```

The PowerPoint-saved copy was then imported into OpenDeck and compared with the original native sample: five slides, each slide's object count, all speaker notes, and all editable text matched. This is evidence for one original sample, not a broad interoperability corpus or pixel-equivalence result. The PowerPoint-reported version was 16.0; an exact patch/build was not recorded.

The procedure is retained in `scripts/verify-with-powerpoint.ps1`, with the saved-copy assertions in `scripts/check-office-roundtrip.mjs`. Rendered output and the saved copy are generated under ignored `test-results/powerpoint-render/`. Normal CI does not require PowerPoint; this optional check requires a Windows development machine with it installed.

## Recorded rich-text PowerPoint check — 6 November 2026

Microsoft PowerPoint 16.0 opened both the original two-slide `tests/fixtures/powerpoint-rich-text.pptx` and OpenDeck's two-slide `examples/rich-text.pptx` re-export through the COM API with `WithWindow=false`. Both presentations rendered to PNG without an API error. PowerPoint then saved the OpenDeck export again. The exact Office patch/build was not recorded.

The tested original fixture SHA-256 was:

```text
d907c44a0c4b8fe5c7f79d055f7744fb69567fd8610a8b5ddba0cece09bb5f40
```

The tested OpenDeck rich-text export SHA-256 was:

```text
5f105283e156f93433862fd40fa28bf0cc5a6df749da48b88050f9c7bb0f6338
```

The saved copy was imported into OpenDeck and compared with `examples/rich-text.opendeck`. The assertions passed for both slide counts, text-object counts, exact text projections, speaker notes, and supported rich formatting. Run comparison expands runs into character/style pairs so an Office change to run segmentation does not masquerade as a formatting change. The compared fields were font family, size, color, bold, italic, underline, external hyperlink, paragraph alignment, bullet/number kind, level and sequence start, line-height multiplier, paragraph spacing before/after, blank paragraphs, and soft line breaks.

All four original/export PNGs were visually inspected. Content remained legible without observed clipping or overlap, and exported numbered markers had a readable gap after correcting their indentation. This is **semantic preservation for one original rich-text sample**, not pixel-identical rendering. The comparison showed text-box inset differences, normalized bullet indentation, and hyperlink colors that followed the target application's theme. Those limits are disclosed in import/export warnings. Still images do not establish hyperlink activation, slideshow timing, or animation behavior.

The focused PPTX suite contained 25 passing tests at this milestone; TypeScript checking also passed. To reproduce the native check on Windows with PowerPoint installed:

```powershell
node scripts/generate-rich-example.mjs
powershell -File scripts/verify-rich-text-with-powerpoint.ps1
```

`generate-rich-example.mjs` imports the committed original fixture and writes `examples/rich-text.opendeck` and `examples/rich-text.pptx`. The PowerPoint verifier renders the original and re-export, saves a new copy, then invokes `scripts/check-rich-office-roundtrip.mjs` for the semantic assertions. Outputs, JSON results, and the saved copy are generated under ignored `test-results/rich-text-powerpoint/`. Regenerating example files can change their hashes; the hashes above identify the stored bytes that received this recorded check.

## Recorded text-frame PowerPoint check — 6 November 2026

Microsoft PowerPoint `16.0` (executable product version `16.0.20527.20150`) opened and rendered the six-slide original text-frame fixture, the separately XML-derived signed-inset/clip probe, and both OpenDeck re-exports. The original geometry fixture contains 20 text frames and separate rectangle markers. The native verifier read effective margins, wrapping, vertical anchors and text through COM, then saved both OpenDeck exports again. Re-import assertions passed for those independent source properties and for text geometry, signed insets, independent overflow flags, supported rich character/paragraph formatting, breaks, notes and slide/object counts after the native save.

| Tested file                                                        | SHA-256                                                            |
| ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Original `tests/fixtures/powerpoint-text-frame.pptx`               | `a9fb9ff78744aee60050b25e17e2c182a37b17fa6163ba09424cef79353ae480` |
| XML-derived `tests/fixtures/powerpoint-text-frame-clip-probe.pptx` | `9a5dfb7572e6b0a18e380384d51ba22dc9644a7fe563c6b631695e18501843b9` |
| OpenDeck `examples/text-frame.pptx`                                | `59429c71e92059864c526e0179e7052e8fe36a03162e362f750d9356d14bd01a` |
| Ignored `clip-probe-exported.pptx`                                 | `0473b4d6ecb471b6ec67b94a31a121df46169e2615da412af46a300c066697bd` |

All six main exported PNGs and the changed probe slides 3/4 were visually inspected. The remaining probe PNGs had identical hashes to the inspected main exports. The inset, anchor, wrapping and overflow cases remained legible and in the expected positions in this sample. This is a focused semantic and visual check, not pixel equivalence across arbitrary decks.

Two concrete limitations emerged. Attached text-box borders disappear because the native text model does not contain them; `powerpoint-text-frame-attached-outline-probe.pptx` retains the original case. The main geometry fixture uses separate supported rectangle markers so text bounds stay visible. Also, PowerPoint's vertical clip can suppress a complete line when it crosses the inset content bottom, while the browser clips at the outer shape edge. A control whose second line fit the outer box but crossed the content bottom showed only its first line in PowerPoint. The browser may therefore display extra or partial lines; import/export reports now disclose that difference. COM rejected negative-margin setters, so the signed-margin evidence comes from the explicitly XML-derived probe.

The scripts are `generate-text-frame-example.mjs`, `verify-text-frame-with-powerpoint.ps1`, and `check-text-frame-office-roundtrip.mjs`. Their generated evidence, native properties and saved copies live under ignored `test-results/text-frame-powerpoint/`. [Fixture provenance](FIXTURES.md) records authoring, sanitation and reproducibility details. The existing field-notes and rich-text example bytes were retained unchanged.

## Browser acceptance checklist

The alpha.3 production build was checked in Chrome on Windows at 1278×609 CSS pixels using the original six-slide text-frame fixture. The test edited a left margin to −12 px, disabled wrapping and clipped only horizontally. DOM/computed styles confirmed the signed inset and independent `clip visible` axes. Reset margins changed only the four insets; Undo restored them. After autosave and reload, the signed inset, wrap choice and both overflow modes were retained. Controls were restored to the original fixture values afterward. Presentation mode visibly retained top/middle/bottom anchors, an unwrapped line overflowing its rectangle, wrapped vertical overflow, and hard/soft breaks. The scoped production browser log check returned no warnings or errors.

Screenshots: [text-frame controls](assets/text-frame-editor.jpg), [vertical anchors in the presenter](assets/text-frame-presenter.jpg). This check covers the exercised geometry flows; it does not close the broader download, print, fullscreen, responsive or accessibility checklists below. Independent-axis CSS and control behavior also have component regressions, while exact PowerPoint complete-line clipping remains a recorded difference.

These checks require a real browser. The alpha.2 smoke check on Windows used Chrome (installed build 156.0.8078.80), at approximately 1280×665 CSS pixels. It verified selected text styling, saving and page-reload recovery, importing the rich-text fixture with visible runs and lists, and cancellation of a numbering-start draft from 3 to 8 without changing the original 3, 4, 5 sequence. Presenter navigation, notes, and blackout were also exercised successfully. A selected first word became italic 48 pt while the remaining text stayed at 66 pt; the rendered run styles and saved result were checked after reload. The editor's fit calculation was corrected after this browser check exposed padding being subtracted twice.

Screenshots from the alpha.2 working tree: [rich text editor](assets/rich-text-editor.jpg), [presenter with notes and lists](assets/rich-text-presenter.jpg). Both use an original synthetic fixture; no private user presentation is included. The browser exposed the imported HTTPS hyperlink only as an active link in presentation mode, while editing kept link activation disabled. No console warnings or errors were returned by the scoped browser log check during these flows.

A synthetic clipboard test pasted a paragraph with bold text plus an image, iframe, and CSS import pointing to a dedicated loopback HTTP request recorder. The rich editor showed the supported text and its paste-conversion notice; the recorder received no image, frame, or style requests. The draft was cancelled. This checks that paste case in Chrome, not every possible network path or HTML input. The sanitizer's automated tests also verify detached-template parsing and allowlist reconstruction before content reaches Tiptap.

The built production assets were also served through `npm run preview`. Startup, loading the rich editor, and saving a text box worked. A 5,000-newline inline draft exceeded the paragraph limit; clicking another slide kept the draft focused with an accessible error. After Escape explicitly discarded the invalid draft, navigation succeeded. The original slide text remained intact.

The browser did not allow the fullscreen request. After the fix, the presenter displayed an accessible explanation and remained usable; closing returned to the editor. Actual successful fullscreen entry/exit remains unverified in this browser, with state/ownership/failure cases covered by component tests. An export completion report appeared, but the download-event wait timed out and no local output file was found; successful physical browser download is therefore unverified. Print/PDF output has not been verified. The broader checklist below remains open where the smoke check covered only part of a scenario; passing unit tests or seeing a completion message does not close it.

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
- [x] Confirm notes are visibly on the same screen when the notes panel is open; this is not a separate audience display.
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

The current alpha has the limited native PowerPoint and browser smoke evidence recorded above. Broad external-application fidelity, responsive layout coverage, fullscreen behavior, physical browser downloads, and print output remain unverified unless a later result explicitly records those checks. See [COMPATIBILITY.md](COMPATIBILITY.md) for supported subsets and [ROADMAP.md](ROADMAP.md) for future gates.
