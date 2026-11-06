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

The alpha.4 release candidate passed **356 tests in 19 files**, including 77 PPTX cases, the TypeScript/Vite production build, formatting and diff checks. `npm audit --omit=dev` reported zero known production vulnerabilities. New coverage includes saved fit factors, exact spacing, inherited fit choices, bounded fitting and resize anchors, extreme valid geometry, history/import preservation, metric-equivalent rich saves, pending field/drag interactions, concurrent changes, and one-click numeric-field saving. The dependency result records the time of this check, not future advisories.

## Automated coverage to maintain

The alpha.5 release candidate passed **488 tests in 23 files**, including 124 PPTX cases, the TypeScript/Vite production build, formatting and diff checks. `npm audit --omit=dev` reported zero known production vulnerabilities. New coverage includes paint/geometry validation, independent opacity, native preset text regions, bounded shape-aware fitting, endpoint-spacing defaults/inheritance, theme/partial paint inheritance, and styled-editor background composition. This records the checked revision and dependency state.

| Layer                 | Checks                                                                                                                                                                                                                                                                                                                                                    |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Document model        | Original starter deck validates; new/cloned objects get unique IDs; slide reordering and alignment preserve unrelated data; undo/redo branches and history bounds                                                                                                                                                                                         |
| Validation            | Invalid schemas, identifiers, geometry, colors, object types, tables, charts, and remote/executable image sources are rejected; rich paragraphs must match the exact plain-text projection and satisfy run/list/link limits                                                                                                                               |
| Persistence           | localStorage fallback validation/quota failure; fake-indexeddb transactions for save/load, multiple deck IDs, same-ID updates, legacy migration, and injected transaction-abort rollback; application startup/autosave recovery using a mocked provider. Real-browser reload/quota behavior still needs acceptance testing                                |
| Export package        | Text, shapes, pictures, tables, charts, notes, hidden slides, and transitions produce their expected native OOXML constructs                                                                                                                                                                                                                              |
| Import interpretation | Relationship-defined slide order, stacking order, supported theme/layout/master text inheritance, placeholder geometry, scaled groups, text/notes/data preservation                                                                                                                                                                                       |
| Rich text             | Mixed run font/size/color/emphasis; safe external text hyperlinks; paragraph alignment, spacing, list levels and numbering starts; blank paragraphs and soft breaks; native PowerPoint-authored input and generated rich round trips                                                                                                                      |
| Import boundaries     | Malformed XML, entities/DTDs, missing ordered slides, package path escapes, oversized archives, and remote image relationships                                                                                                                                                                                                                            |
| Known loss            | Unsupported animations, normalized groups/table/chart styling, font-dependent AutoFit reflow, complete-line clipping, unsupported text-box paints/geometry, bullet indentation, unsafe/internal/action links, and ambiguous same-base numbering restarts produce appropriate warnings; supported mixed character formatting and decorations are preserved |
| UI logic              | Slide creation/rename; text edit/duplicate/delete; draft flushing on save; native-file recovery; table/chart validation; zoom-aware multi-object dragging and history; Escape cancellation in jsdom                                                                                                                                                       |
| Local library         | List/search, validated opening, missing/corrupt entry errors, retry, and cancellation of a pending load after the modal closes                                                                                                                                                                                                                            |

Tests must assert observable meaning, not simply mirror the implementation. Use independent fixtures to prevent an importer and exporter from hiding the same mistake. Preserve upstream license/provenance whenever test files are redistributed.

The repository includes two original two-slide PowerPoint-authored inputs, a six-slide native text-frame fixture, a separate native attached-outline probe, an explicitly XML-derived signed-margin/clip probe, a seven-slide native AutoFit baseline and a separate saved-scale probe, plus a nine-slide original text-decoration fixture and its separate XML-derived endpoint/dash/style probe. In-memory synthetic OOXML cases and generated round trips provide additional focused coverage. See [FIXTURES.md](FIXTURES.md) for authoring scripts, metadata sanitation, hashes and evidence limits.

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

## Recorded AutoFit PowerPoint check — 6 November 2026 (alpha.4)

Microsoft PowerPoint `16.0` (executable product version `16.0.20527.20150`) opened and rendered the original seven-slide AutoFit baseline, its separately XML-derived saved-scale probe, and both OpenDeck exports through COM with no visible window. Each path contains 29 text frames. PowerPoint then saved both OpenDeck exports again. The native verification timestamp was `2026-11-06T06:22:41.2877941Z`.

| Tested file                                                            | SHA-256                                                            |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Original `tests/fixtures/powerpoint-autofit.pptx`                      | `25a7e92c1003af1f3f0ff9a01d7a1a94feb18ae7fd45cebec42a8e9bf175df17` |
| XML-derived `tests/fixtures/powerpoint-autofit-saved-scale-probe.pptx` | `e2bed4427a4dd064fffe02d9e5a03794a035ce83586edea94040d7fdaa1172eb` |
| Probe-derived OpenDeck `examples/autofit.pptx`                         | `3a2663395e8705b1d556e5d551baf0b4432edef3fb32c2e8529e67f885d119ad` |
| Ignored original-baseline `original-exported.pptx`                     | `e5d37c268311c107804e06ea0d890102eddd5776cc68af5565d332ddb35e288b` |

Re-importing both PowerPoint-saved exports passed comparisons of AutoFit mode and saved factors, nominal rich run formatting, exact text, relative and fixed-point paragraph line spacing, paragraph/list data, breaks, frames, geometry, rotation, anchors, notes, and slide/object counts. Character/style expansion permits harmless changes to run segmentation. Native effective margins, wrapping, anchor and text also matched the source imports. Saved scaling remained separate from nominal font sizes; the check did not accept baked or doubled scaling.

All **14 exported PNGs** were visually inspected: seven from the original-baseline export and seven from the saved-scale export. The known-factor examples visibly shrank, resize controls retained their recorded anchors/centers, and fixed-point spacing remained distinct from relative spacing. The deliberately oversized no-AutoFit and bare-normal controls overflowed, including beyond the slide edge; this is expected fixture behavior. This check is not a clean-layout claim for those controls, pixel equivalence, or validation of a general native fitting algorithm. After the final text-transform geometry fixes, both exports passed the native save/re-import checks again; all 14 new PNGs had identical hashes to the previously inspected images. The frozen AutoFit inputs and older published field-notes, rich-text and text-frame examples remained byte-identical.

The original COM authoring run enabled normal AutoFit but **did not compute saved shrink factors** in this windowless workflow. Its normal choices use default scale/reduction. Known factors and inherited-factor cases come from the explicitly XML-derived probe. That provenance distinction remains essential even though PowerPoint subsequently rendered both. The focused PPTX suite had 72 passing tests when the final geometry-fix native rerun completed; the complete alpha.4 build/browser gates are separate results.

Reproduce on Windows with PowerPoint installed:

```powershell
node scripts/generate-autofit-example.mjs
powershell -File scripts/verify-autofit-with-powerpoint.ps1
node scripts/check-autofit-office-roundtrip.mjs
```

The generator writes the public probe-derived example and a separate ignored original-baseline export. The verifier records native properties and sampled character bounds, renders the four inputs, and writes native saved copies. The last script checks the two OpenDeck export paths. Generated evidence is under ignored `test-results/autofit-powerpoint/`, including `generation.json`, `verification.json`, `roundtrip-check.json`, original/probe provenance, and PNGs. Existing published fixtures and examples were retained unchanged.

### Supplemental native layout measurements

These isolated experiments used the same Office build. They inform future layout work; they do not establish browser equivalence or arbitrary-font coverage.

- **Relative versus fixed spacing:** for 24 pt source text at 80% saved scale, 150% relative spacing produced a 34.2 pt native line advance. A 20 percentage-point reduction changed it to 29.64 pt, consistent with subtracting 20 points from 150%, not multiplying by 80%. Fixed 36 pt line spacing remained 36 pt. This matches the documented [normal AutoFit line-spacing reduction semantics](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.normalautofit.linespacereduction?view=openxml-3.0.1). Nominal run sizes remained unchanged in the package.
- **Font and line metrics:** `probe-font-line-metrics.ps1` checked Arial, Georgia, Calibri and Courier New at 24 and 30 pt, relative spacing 1 and 1.5, both unscaled and in a separately XML-derived 80% scale copy: 32 cases. Every measured advance equaled `1.2 × COM effective font size × relative spacing` within numerical tolerance. At 80%, the 24 pt runs used an effective 19 pt and advances 22.8/34.2 pt; the 30 pt runs used 24 pt and advances 28.8/43.2 pt. This does not establish a universal font/script multiplier or a general font-size rounding rule. The [DrawingML line-spacing definition](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.linespacing?view=openxml-3.0.1) describes largest-font-size behavior but does not specify this observed 1.2 factor. Native properties, original/derived packages and 32 PNGs are under `font-metrics/`.
- **Paragraph boundaries:** `probe-paragraph-spacing.ps1` isolated one, two and three Arial 24 pt paragraphs. Serialized XML, native properties and painted glyph rows showed additive spacing between neighbors: `previous after + next before`. Repeated before 10/after 20 pt added 30 pt between paragraphs; after 40/before 5 and after 5/before 40 both added 45 pt. First-before and last-after were ignored by default: a single 0/0 paragraph and a single 10/20 paragraph had the same 47.257 pt resized shape height. PowerPoint's [spcFirstLastPara property](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.bodyproperties.useparagraphspacing?view=openxml-3.0.1) documents that endpoint policy and defaults to false. The experiment did not test every endpoint flag/inheritance combination. Results and renders are under `paragraph-spacing/`.
- **Absolute spacing and list indents:** the saved-scale controls retained absolute paragraph spacing and list text start positions while glyphs shrank. Exact bullet margins remain normalized by OpenDeck, so this is not a claim that arbitrary list indentation round-trips visually.
- **Resize geometry:** `probe-autofit-resize.ps1` checked wrapping, three vertical anchors, horizontal alignment and rotations including 90/180/350 degrees and near-zero/full-turn values. Unrotated wrapping preserved width; nowrap could grow both dimensions. Unrotated placement followed vertical and horizontal anchors. Any tested nonzero stored rotation preserved the shape center, including a stored full turn that COM displayed as zero. These are observed controls, not proof for every transformation or layout constraint.
- **Extreme transforms:** a separate four-object no-AutoFit export was opened, rendered, saved, and re-imported with the same PowerPoint build. Stored rotations 360, −360, and 720 degrees survived in XML, although the COM Rotation getter reported zero. Positions 50,000/−50,000 px remained exact at ±476250000 EMU. A 0.01 px size rounded to 95 EMU during export, remained 95 EMU after PowerPoint saved it, and imported at the native model's 0.01 px minimum. This checks save-only geometry, not native refitting of those extreme controls. Generated evidence remains under `extreme-transform/`.

Browser and PowerPoint font metrics, paragraph endpoint policy, and native line-layout behavior remain separate compatibility concerns. These measurements do not close the browser acceptance checklist below.

## Recorded text-decoration PowerPoint check — 6 November 2026 (alpha.5)

Microsoft PowerPoint `16.0` (executable product version `16.0.20527.20150`) opened and rendered the original nine-slide decoration fixture, its separately XML-derived probe, and both OpenDeck re-exports through COM without a visible window. The original path has 50 text frames; the probe path has 53. PowerPoint saved both exports again. The recorded gate timestamp was `2026-11-06T06:53:15.8765568Z`.

| Tested file                                                        | SHA-256                                                            |
| ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Original `tests/fixtures/powerpoint-text-decoration.pptx`          | `1c8db93b95bb3f0e75a94cdd1cee9e98dbda3b96caeb56f444d8a65b57e246ce` |
| XML-derived `tests/fixtures/powerpoint-text-decoration-probe.pptx` | `9600597635b6508ceb1c863f259b78cf92cea966f38ed5c422eeeb0b0f92a46f` |
| Original-derived OpenDeck `examples/text-decoration.pptx`          | `707459f571d7ed8c364e1bc27ebede8083348ae2def712a9ccef26581f7fb0ed` |
| Ignored probe-derived `probe-exported.pptx`                        | `5c6186a50284b727c38dfbb1f0fc205b67089434b378aa663b169bd3dd5bf10b` |

The public example comes directly from the original COM-authored fixture. The probe supplies explicitly XML-authored endpoint flags, inherited overrides, known shrink factors, eleven dash tokens and extra join/style controls. These are distinct evidence sources, as described in [FIXTURES.md](FIXTURES.md).

Both PowerPoint-saved exports passed semantic comparisons of attached preset geometry, supported solid fills and outlines, independent paint opacity, line width/dash/cap/join/miter limit, rounded radius, paragraph-edge policy, text-only opacity, AutoFit metadata, rich characters/paragraphs, text-frame attributes, geometry, rotation, notes and slide/object counts. Independent source COM properties also matched imported solid paint colors/opacity, outline widths, rounded adjustments, margins, wrapping, anchor and text. Unsupported gradient fill was excluded from solid-paint assertions and produced the expected warning.

All **18 exported PNGs** were visually inspected: nine from the original path and nine from the probe path. Supported decorations, preset text regions, cap/join differences and endpoint offsets were visible. Gradient fill disappeared as disclosed; inherited bullet text moved horizontally because exact bullet indents are normalized. Some endpoint controls deliberately place their last line across or below the outline. The checks therefore establish a focused supported-subset result, not universally clean layout, pixel equivalence or broad application compatibility.

### Preset text regions and native stroke geometry

The exact geometry formulas were read from `presetShapeDefinitions.xml` in the official ECMA-376 Part 1 `OfficeOpenXML-DrawingMLGeometries.zip` attachment. Here `w` and `h` are the shape's width and height, before adding body insets. [Official ECMA-376 publication and downloads](https://ecma-international.org/publications-and-standards/standards/ecma-376/).

| Preset            | Text rectangle and radius rule                                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Rounded rectangle | Clamp `adj` to 0…50000; radius `r = min(w,h) × adj / 100000`, default `adj = 16667`. Inset each edge by `r × 29289 / 100000`.          |
| Ellipse           | Inset horizontally by `(1 − cos 45°) × w / 2` and vertically by `(1 − sin 45°) × h / 2`, approximately 0.1464466094 of each dimension. |
| Default triangle  | Text rectangle `[w/4, h/2, 3w/4, h]`. This is the default centered-apex triangle; arbitrary custom adjustments are outside this check. |

Native controls with zero body margins confirmed these regions. A 380×140 pt rounded rectangle at the default adjustment had a 6.83425 pt inset; 40% and 50% adjustments produced approximately 16.4018 and 20.5023 pt. A 260×300 pt ellipse inset its text by approximately 38.0761/43.9340 pt. The same-size triangle inset its text by 65/150 pt. The checker compares the source and exported `TextRange2` bounds and paragraph positions within 0.001 pt for four rounded controls, the ellipse and triangle. All matched, including after exporting these presets with `p:cNvSpPr txBox="1"`: PowerPoint honored their intrinsic text regions in these cases. This is native source/export evidence; it does not assert that browser glyph metrics equal PowerPoint's.

A 24 pt red outline on a rectangle with bounds `[80,150,380,370]` pt painted approximately `[68.25,138,392.25,381.75]` pt at 1280×720 output, consistent with a centered stroke extending half its width outside the shape. Native square and round dot controls both used `prstDash="dot"` but different `cap="sq"`/`"rnd"` values; both cap appearances survived export. The native thick rectangle used a round join. The separate probe's bevel join cut its corners, while the triangle's miter ratio of 2 limited its apex. Office documents centered/flat defaults and round joins, with a default miter ratio of 8 when miter is selected. [Outline behavior](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/5564035f-88ff-4ab8-bbfb-d2998a83324d), [Office drawing defaults](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/c0c046ec-a61d-405d-88fe-74d8487a37d7).

### Paragraph endpoint measurements

Original COM controls use native default edge spacing. The probe separately sets `spcFirstLastPara` to omitted, false and true, including master/layout inheritance and a local false override. All three paragraphs have 10 pt before and 20 pt after. In a 14 pt no-AutoFit control, default and false had identical painted glyph rows: inclusive y-ranges `(145,162)`, `(208,225)`, `(270,287)` px. True shifted them to `(158,175)`, `(221,238)`, `(283,300)` px, consistent with the extra 10 pt before at this render scale. Native total text bounds measured 110.4 pt for default/false and 140.4 pt for true. At the probe's saved 80% font scale, those heights were 99.6 and 129.6 pt: endpoint spacing remained absolute.

COM paragraph/character `BoundTop` includes paragraph-leading space and is not the painted glyph's top. For example, the first no-AutoFit paragraph reported 106 pt for both policies while its glyph pixels shifted. The comparison therefore keeps native bounds and painted-pixel observations separate. In an additional experiment, explicitly toggling shape AutoFit off/on after loading the probe kept default/false container height at 123.595276 pt and grew true from that height to 153.888275 pt. That recomputed file is ignored evidence; neither frozen input was modified.

Native omitted `spcFirstLastPara` means false. Legacy OpenDeck files without the new edge-spacing field retain their earlier include-edges behavior; imported PPTX materializes the native policy. The primary definition documents the first-before/last-after effect and false default. [Paragraph edge-spacing property](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.bodyproperties.useparagraphspacing?view=openxml-3.0.1).

### Reproduction and limits

```powershell
node scripts/generate-text-decoration-example.mjs
powershell -File scripts/verify-text-decoration-with-powerpoint.ps1
node scripts/check-text-decoration-office-roundtrip.mjs
```

The native verifier records paint, shape/text bounds and the separate resize experiment. The final checker combines independent COM properties with saved-copy import assertions. Evidence is generated under ignored `test-results/text-decoration-powerpoint/`, including `fixture-provenance.json`, `generation.json`, `verification.json`, `roundtrip-check.json`, `centered-stroke-bounds.json`, native saved copies and PNGs. Older committed fixtures/examples were retained unchanged.

Gradient and other unsupported paints, normalized bullet margins, custom preset adjustments outside the supported subset, font substitution and native/browser line metrics remain limitations. The earlier measured 1.2 native line factor is still a scoped observation, not a universal font rule. Browser checks are recorded separately below.

## Browser acceptance checklist

The alpha.5 editor was exercised in Chrome on Windows at 1280×665 CSS pixels. In the development build, an XML-derived decoration fixture retained separate fill 0.5, outline 0.75, and text 0.4 opacities after page reload; setting whole-object opacity to 0.5 left those component values intact. Dash, cap and join edits appeared in the rendered SVG. Inline editing kept the decoration visible. Enabling endpoint spacing on a resize box changed its height from the saved native 164.794 px to the browser-recalculated 192 px; one Undo restored the original height and excluded endpoint margins. A rounded box with two text lines resized from 60 px at zero roundness to 84.86 px at 50% roundness, retaining approximately 60 px of content height.

A separate synthetic native backup supplied white text on an opaque `#123456` fill over a white slide. The styled editor displayed white glyphs on the expected dark background and Save returned to the canvas. This probe verifies imported colors and preview composition; automated color-field filling did not trigger the browser's native color-picker change event, so it is not evidence of a completed manual color-picker interaction.

The final production bundle was served through `npm run preview`. Importing `examples/text-decoration.pptx` showed nine slides and the expected compatibility report. Editing text opacity to 40%, dash to dash-dot, and cap to round updated the rendered controls; three Undo commands restored the imported settings. Presentation mode displayed rectangle, ellipse, and triangle text in their distinct preset regions. The scoped production console check returned no warnings or errors. Screenshots: [decoration editor](assets/text-decoration-editor.jpg), [preset geometry presenter](assets/text-geometry-presenter.jpg). These focused checks do not close the broader browser checklist or establish native pixel equivalence.

The alpha.4 production build was exercised in Chrome on Windows at 1278×609 CSS pixels with the new AutoFit native sample. Imported factors remained distinct from authored sizes: a fixed-spacing box displayed an 80% scale, 20 percentage-point reduction, and 24 pt authored size; computed text used 25.6 px glyphs while the exact 36 pt line height stayed 48 px. Editing that exact spacing to 48 pt and clicking Save directly from the numeric field closed the dialog in one click, produced 64 px line height, and recalculated scale to 100%. One Undo restored both 36 pt spacing and the saved 80% scale. Switching to Multiple initialized 1.5 from 36/24; after saving, the retained 0.2 reduction produced a computed 41.6 px line height at full-size 32 px text. Undo restored the original.

A pending Inspector font-size edit from 28 to 36 pt was followed immediately by dragging a resize-to-fit box. The resulting object retained 36 pt text and its newly fitted 315 px height. Undo reversed the movement while keeping that prior font edit and fitted height; reload recovered them. Shortening a shrink-to-fit sample to one line raised its saved scale from 60% to 100%. A deliberately long, unwrapped, right-aligned line shrank to approximately 21%; its measured text width was within the fitter's subpixel tolerance of the content width. The scoped production browser log returned no warnings or errors during these flows.

Development-browser checks also exercised wrapped shrink fitting, shortening text and restoring text plus scale with one Undo, resize fitting, imported mixed-size scaling, presenter rendering, and saving a metric-equivalent rich document without recalculating its imported factor. The comparison with native PowerPoint revealed the recorded relative line-metric differences; it did not establish pixel equivalence. Unit regressions cover the pending-Inspector/gesture race and the numeric-field/Save focus sequence found during the browser checks.

Screenshots: [AutoFit controls](assets/autofit-editor.jpg), [exact line-spacing editor](assets/autofit-spacing-editor.jpg). These are original synthetic examples; the rich editor scrolls within the small viewport. The checks do not establish physical browser download, successful fullscreen entry, printing, all viewport sizes, or complete accessibility acceptance.

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
